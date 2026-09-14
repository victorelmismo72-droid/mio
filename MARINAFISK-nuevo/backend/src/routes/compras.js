// Compras = dato sagrado (ver FASE_0, punto 3): esta ruta solo permite crear
// y leer, nunca modificar ni borrar. La base de datos ya lo bloquea por sí
// misma (trigger en schema.sql), pero además esta API ni siquiera ofrece los
// verbos PUT/DELETE, para que quede claro también en el diseño de la API.
const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');
const { ejecutarIdempotente } = require('../lib/idempotencia');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const r = await conTransaccion((cliente) => cliente.query('SELECT * FROM compras ORDER BY fecha DESC, id DESC'));
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const cabecera = await cliente.query('SELECT * FROM compras WHERE id = $1', [req.params.id]);
      if (!cabecera.rows.length) return null;
      const lineas = await cliente.query('SELECT * FROM compra_lineas WHERE compra_id = $1 ORDER BY id', [req.params.id]);
      return { ...cabecera.rows[0], lineas: lineas.rows };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ninguna compra con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

// Esta fase no decide CÓMO se calcula numero_partida, total_iva, op2_importe,
// etc. (eso es lógica de negocio de la Fase 2) — solo guarda lo que le
// mandan. Aquí únicamente nos aseguramos de que el número de partida exista
// como fila en la tabla `partidas` antes de referenciarlo.
router.post('/', async (req, res, next) => {
  try {
    const { uid, numero_partida, fecha, alb_proveedor, proveedor_id, proveedor_nombre_snapshot,
      total_kilos, total_base_zgz, total_base_real, total_iva, total_factura, puesto_id, lineas } = req.body;

    if (!uid) return res.status(400).json({ error: 'Falta "uid": toda compra necesita una clave única generada por la pantalla que graba.' });
    if (!numero_partida) return res.status(400).json({ error: 'Falta "numero_partida".' });
    if (!fecha) return res.status(400).json({ error: 'Falta "fecha".' });
    if (!proveedor_id) return res.status(400).json({ error: 'Falta "proveedor_id".' });
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Una compra necesita al menos una línea.' });

    const resultado = await conTransaccion(async (cliente) => {
      const { duplicado, enCurso, respuesta } = await ejecutarIdempotente(cliente, {
        clave: uid,
        tabla: 'compras',
        fn: async () => {
          await cliente.query(
            'INSERT INTO partidas (numero_partida) VALUES ($1) ON CONFLICT DO NOTHING',
            [numero_partida]
          );

          const cab = await cliente.query(
            `INSERT INTO compras
              (numero_partida, fecha, alb_proveedor, proveedor_id, proveedor_nombre_snapshot,
               total_kilos, total_base_zgz, total_base_real, total_iva, total_factura, puesto_id, uid)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [numero_partida, fecha, alb_proveedor || null, proveedor_id, proveedor_nombre_snapshot || null,
              total_kilos || null, total_base_zgz || null, total_base_real || null, total_iva || null,
              total_factura || null, puesto_id || null, uid]
          );
          const compra = cab.rows[0];

          const lineasGuardadas = [];
          for (const l of lineas) {
            const r = await cliente.query(
              `INSERT INTO compra_lineas
                (compra_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot, cajas, kilos,
                 precio_kg, base_zgz, base_zgz_iva, op2_importe, base_real, iva_importe, total_factura, control)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
               RETURNING *`,
              [compra.id, l.articulo_id || null, l.articulo_codigo_snapshot || null, l.descripcion_snapshot || null,
                l.cajas || null, l.kilos || null, l.precio_kg || null, l.base_zgz || null, l.base_zgz_iva || null,
                l.op2_importe || null, l.base_real || null, l.iva_importe || null, l.total_factura || null,
                l.control === undefined ? null : l.control]
            );
            lineasGuardadas.push(r.rows[0]);
          }

          await registrarEscritura(cliente, { tabla: 'compras', operacion: 'INSERT', registroId: compra.id, puestoId: puesto_id, detalle: { uid } });
          return { ...compra, lineas: lineasGuardadas };
        },
      });

      if (enCurso) return { estado: 'en_curso' };
      if (duplicado) return { estado: 'ya_grabada', compra: respuesta };
      return { estado: 'grabada', compra: respuesta };
    });

    if (resultado.estado === 'en_curso') {
      return res.status(409).json({ aviso: 'Esta compra ya se está grabando (otra petición con la misma clave está en curso). No se ha creado un duplicado.' });
    }
    res.status(resultado.estado === 'grabada' ? 201 : 200).json(resultado.compra);
  } catch (err) { next(err); }
});

module.exports = router;
