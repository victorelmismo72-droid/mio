const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');
const { ejecutarIdempotente } = require('../lib/idempotencia');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const r = await conTransaccion((cliente) => cliente.query('SELECT * FROM repartos ORDER BY fecha DESC, numero DESC'));
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const cabecera = await cliente.query('SELECT * FROM repartos WHERE id = $1', [req.params.id]);
      if (!cabecera.rows.length) return null;
      const lineas = await cliente.query('SELECT * FROM reparto_lineas WHERE reparto_id = $1 ORDER BY id', [req.params.id]);
      return { ...cabecera.rows[0], lineas: lineas.rows };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún reparto con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

async function insertarLineasReparto(cliente, repartoId, lineas) {
  const guardadas = [];
  for (const l of lineas) {
    const r = await cliente.query(
      `INSERT INTO reparto_lineas
        (reparto_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot, lote, barco, subzona,
         arte_pesca, cajas, cajas_impresas, kg, peso_etiqueta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [repartoId, l.articulo_id || null, l.articulo_codigo_snapshot || null, l.descripcion_snapshot || null,
        l.lote || null, l.barco || null, l.subzona || null, l.arte_pesca || null, l.cajas || null,
        l.cajas_impresas || null, l.kg || null, l.peso_etiqueta || null]
    );
    guardadas.push(r.rows[0]);
  }
  return guardadas;
}

router.post('/', async (req, res, next) => {
  try {
    const { uid, fecha, destinatario_nombre, destinatario_ciudad, conductor, total_cajas, total_kg, puesto_id, lineas } = req.body;
    if (!uid) return res.status(400).json({ error: 'Falta "uid": todo reparto necesita una clave única generada por la pantalla que graba.' });
    if (!fecha) return res.status(400).json({ error: 'Falta "fecha".' });
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Un reparto necesita al menos una línea.' });

    const resultado = await conTransaccion(async (cliente) => {
      const { enCurso, duplicado, respuesta } = await ejecutarIdempotente(cliente, {
        clave: uid,
        tabla: 'repartos',
        fn: async () => {
          const cab = await cliente.query(
            `INSERT INTO repartos (fecha, destinatario_nombre, destinatario_ciudad, conductor, total_cajas, total_kg, puesto_id, uid)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [fecha, destinatario_nombre || null, destinatario_ciudad || null, conductor || null,
              total_cajas || null, total_kg || null, puesto_id || null, uid]
          );
          const reparto = cab.rows[0];
          const lineasGuardadas = await insertarLineasReparto(cliente, reparto.id, lineas);
          await registrarEscritura(cliente, { tabla: 'repartos', operacion: 'INSERT', registroId: reparto.id, puestoId: puesto_id, detalle: { uid, numero: reparto.numero } });
          return { ...reparto, lineas: lineasGuardadas };
        },
      });
      if (enCurso) return { estado: 'en_curso' };
      if (duplicado) return { estado: 'ya_grabado', reparto: respuesta };
      return { estado: 'grabado', reparto: respuesta };
    });

    if (resultado.estado === 'en_curso') {
      return res.status(409).json({ aviso: 'Este reparto ya se está grabando (otra petición con la misma clave está en curso). No se ha creado un duplicado.' });
    }
    res.status(resultado.estado === 'grabado' ? 201 : 200).json(resultado.reparto);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { fecha, destinatario_nombre, destinatario_ciudad, conductor, total_cajas, total_kg, lineas } = req.body;
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Un reparto necesita al menos una línea.' });
    const resultado = await conTransaccion(async (cliente) => {
      const cab = await cliente.query(
        `UPDATE repartos SET fecha=$1, destinatario_nombre=$2, destinatario_ciudad=$3, conductor=$4,
           total_cajas=$5, total_kg=$6 WHERE id=$7 RETURNING *`,
        [fecha, destinatario_nombre || null, destinatario_ciudad || null, conductor || null, total_cajas || null, total_kg || null, req.params.id]
      );
      if (!cab.rows.length) return null;
      await cliente.query('DELETE FROM reparto_lineas WHERE reparto_id = $1', [req.params.id]);
      const lineasGuardadas = await insertarLineasReparto(cliente, req.params.id, lineas);
      await registrarEscritura(cliente, { tabla: 'repartos', operacion: 'UPDATE', registroId: req.params.id, detalle: { numero: cab.rows[0].numero } });
      return { ...cab.rows[0], lineas: lineasGuardadas };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún reparto con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const borrado = await conTransaccion(async (cliente) => {
      const r = await cliente.query('DELETE FROM repartos WHERE id = $1 RETURNING id, numero', [req.params.id]);
      if (!r.rows.length) return null;
      await registrarEscritura(cliente, { tabla: 'repartos', operacion: 'DELETE', registroId: req.params.id, detalle: { numero: r.rows[0].numero } });
      return r.rows[0];
    });
    if (!borrado) return res.status(404).json({ error: `No existe ningún reparto con id ${req.params.id}` });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
