const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');
const { ejecutarIdempotente } = require('../lib/idempotencia');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const r = await conTransaccion((cliente) => cliente.query('SELECT * FROM traspasos ORDER BY fecha DESC, numero DESC'));
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const cabecera = await cliente.query('SELECT * FROM traspasos WHERE id = $1', [req.params.id]);
      if (!cabecera.rows.length) return null;
      const lineas = await cliente.query('SELECT * FROM traspaso_lineas WHERE traspaso_id = $1 ORDER BY id', [req.params.id]);
      return { ...cabecera.rows[0], lineas: lineas.rows };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún traspaso con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

async function asegurarPartidas(cliente, lineas) {
  const numeros = [...new Set(lineas.map((l) => l.numero_partida).filter((n) => n !== null && n !== undefined && n !== ''))];
  for (const n of numeros) {
    await cliente.query('INSERT INTO partidas (numero_partida) VALUES ($1) ON CONFLICT DO NOTHING', [n]);
  }
}

async function insertarLineasTraspaso(cliente, traspasoId, lineas) {
  const guardadas = [];
  for (const l of lineas) {
    const r = await cliente.query(
      `INSERT INTO traspaso_lineas
        (traspaso_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot, descripcion_editada,
         cajas, peso, precio, partida_texto, numero_partida, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [traspasoId, l.articulo_id || null, l.articulo_codigo_snapshot || null, l.descripcion_snapshot || null,
        l.descripcion_editada || null, l.cajas || null, l.peso || null, l.precio || null,
        l.partida_texto || null, l.numero_partida || null, l.total || null]
    );
    guardadas.push(r.rows[0]);
  }
  return guardadas;
}

router.post('/', async (req, res, next) => {
  try {
    const { uid, fecha, total_kg, base, total, lineas } = req.body;
    const puesto_id = req.body.puesto_id || req.puestoId || null;
    if (!uid) return res.status(400).json({ error: 'Falta "uid": todo traspaso necesita una clave única generada por la pantalla que graba.' });
    if (!fecha) return res.status(400).json({ error: 'Falta "fecha".' });
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Un traspaso necesita al menos una línea.' });

    const resultado = await conTransaccion(async (cliente) => {
      const { enCurso, duplicado, respuesta } = await ejecutarIdempotente(cliente, {
        clave: uid,
        tabla: 'traspasos',
        fn: async () => {
          await asegurarPartidas(cliente, lineas);
          const cab = await cliente.query(
            `INSERT INTO traspasos (fecha, total_kg, base, total, puesto_id, uid)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [fecha, total_kg || null, base || null, total || null, puesto_id || null, uid]
          );
          const traspaso = cab.rows[0];
          const lineasGuardadas = await insertarLineasTraspaso(cliente, traspaso.id, lineas);
          await registrarEscritura(cliente, { tabla: 'traspasos', operacion: 'INSERT', registroId: traspaso.id, puestoId: puesto_id, detalle: { uid, numero: traspaso.numero } });
          return { ...traspaso, lineas: lineasGuardadas };
        },
      });
      if (enCurso) return { estado: 'en_curso' };
      if (duplicado) return { estado: 'ya_grabado', traspaso: respuesta };
      return { estado: 'grabado', traspaso: respuesta };
    });

    if (resultado.estado === 'en_curso') {
      return res.status(409).json({ aviso: 'Este traspaso ya se está grabando (otra petición con la misma clave está en curso). No se ha creado un duplicado.' });
    }
    res.status(resultado.estado === 'grabado' ? 201 : 200).json(resultado.traspaso);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { fecha, total_kg, base, total, lineas } = req.body;
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Un traspaso necesita al menos una línea.' });
    const resultado = await conTransaccion(async (cliente) => {
      await asegurarPartidas(cliente, lineas);
      const cab = await cliente.query(
        `UPDATE traspasos SET fecha=$1, total_kg=$2, base=$3, total=$4 WHERE id=$5 RETURNING *`,
        [fecha, total_kg || null, base || null, total || null, req.params.id]
      );
      if (!cab.rows.length) return null;
      await cliente.query('DELETE FROM traspaso_lineas WHERE traspaso_id = $1', [req.params.id]);
      const lineasGuardadas = await insertarLineasTraspaso(cliente, req.params.id, lineas);
      await registrarEscritura(cliente, { tabla: 'traspasos', operacion: 'UPDATE', registroId: req.params.id, detalle: { numero: cab.rows[0].numero } });
      return { ...cab.rows[0], lineas: lineasGuardadas };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún traspaso con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const borrado = await conTransaccion(async (cliente) => {
      const r = await cliente.query('DELETE FROM traspasos WHERE id = $1 RETURNING id, numero', [req.params.id]);
      if (!r.rows.length) return null;
      await registrarEscritura(cliente, { tabla: 'traspasos', operacion: 'DELETE', registroId: req.params.id, detalle: { numero: r.rows[0].numero } });
      return r.rows[0];
    });
    if (!borrado) return res.status(404).json({ error: `No existe ningún traspaso con id ${req.params.id}` });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
