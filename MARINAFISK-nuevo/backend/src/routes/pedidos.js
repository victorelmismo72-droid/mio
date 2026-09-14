// Pedidos (albaranes de venta). A diferencia de compras, sí se pueden
// corregir o anular — pero toda creación pasa por la misma protección de
// guardado duplicado (ver lib/idempotencia.js) que exige la corrección del
// 02/09/2026 (punto 1) y FASE_2 (punto 5quater).
const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');
const { ejecutarIdempotente } = require('../lib/idempotencia');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { desde, hasta, cliente_id } = req.query;
    const condiciones = [];
    const valores = [];
    if (desde) { valores.push(desde); condiciones.push(`fecha >= $${valores.length}`); }
    if (hasta) { valores.push(hasta); condiciones.push(`fecha <= $${valores.length}`); }
    if (cliente_id) { valores.push(cliente_id); condiciones.push(`cliente_id = $${valores.length}`); }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const r = await conTransaccion((cliente) => cliente.query(`SELECT * FROM pedidos ${where} ORDER BY fecha DESC, numero DESC`, valores));
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const cabecera = await cliente.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
      if (!cabecera.rows.length) return null;
      const lineas = await cliente.query('SELECT * FROM pedido_lineas WHERE pedido_id = $1 ORDER BY id', [req.params.id]);
      return { ...cabecera.rows[0], lineas: lineas.rows };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún pedido con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

async function asegurarPartidas(cliente, lineas) {
  const numeros = [...new Set(lineas.map((l) => l.numero_partida).filter((n) => n !== null && n !== undefined && n !== ''))];
  for (const n of numeros) {
    await cliente.query('INSERT INTO partidas (numero_partida) VALUES ($1) ON CONFLICT DO NOTHING', [n]);
  }
}

async function insertarLineasPedido(cliente, pedidoId, lineas) {
  const guardadas = [];
  for (const l of lineas) {
    const r = await cliente.query(
      `INSERT INTO pedido_lineas
        (pedido_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot, descripcion_editada,
         cantidad, peso, precio, descuento, iva_pct, total, numero_partida, asignacion_manual, estado_asignacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [pedidoId, l.articulo_id || null, l.articulo_codigo_snapshot || null, l.descripcion_snapshot || null,
        l.descripcion_editada || null, l.cantidad || null, l.peso || null, l.precio || null,
        l.descuento || 0, l.iva_pct == null ? 10 : l.iva_pct, l.total || null,
        l.numero_partida || null, !!l.asignacion_manual, l.estado_asignacion || null]
    );
    guardadas.push(r.rows[0]);
  }
  return guardadas;
}

router.post('/', async (req, res, next) => {
  try {
    const { uid, fecha, cliente_id, cliente_codigo_snapshot, cliente_nombre_snapshot, cliente_cif_snapshot,
      cliente_dir_snapshot, cliente_pob_snapshot, cliente_tel_snapshot, agencia, forma_pago,
      tipo_iva_aplicado, base, iva, total, puesto_id, lineas } = req.body;

    if (!uid) return res.status(400).json({ error: 'Falta "uid": todo pedido necesita una clave única generada por la pantalla que graba.' });
    if (!fecha) return res.status(400).json({ error: 'Falta "fecha".' });
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Un pedido necesita al menos una línea.' });

    const resultado = await conTransaccion(async (cliente) => {
      const { enCurso, duplicado, respuesta } = await ejecutarIdempotente(cliente, {
        clave: uid,
        tabla: 'pedidos',
        fn: async () => {
          await asegurarPartidas(cliente, lineas);
          const cab = await cliente.query(
            `INSERT INTO pedidos
              (fecha, cliente_id, cliente_codigo_snapshot, cliente_nombre_snapshot, cliente_cif_snapshot,
               cliente_dir_snapshot, cliente_pob_snapshot, cliente_tel_snapshot, agencia, forma_pago,
               tipo_iva_aplicado, base, iva, total, puesto_id, uid)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             RETURNING *`,
            [fecha, cliente_id || null, cliente_codigo_snapshot || null, cliente_nombre_snapshot || null,
              cliente_cif_snapshot || null, cliente_dir_snapshot || null, cliente_pob_snapshot || null,
              cliente_tel_snapshot || null, agencia || null, forma_pago || null, tipo_iva_aplicado || null,
              base || null, iva || null, total || null, puesto_id || null, uid]
          );
          const pedido = cab.rows[0];
          const lineasGuardadas = await insertarLineasPedido(cliente, pedido.id, lineas);
          await registrarEscritura(cliente, { tabla: 'pedidos', operacion: 'INSERT', registroId: pedido.id, puestoId: puesto_id, detalle: { uid, numero: pedido.numero } });
          return { ...pedido, lineas: lineasGuardadas };
        },
      });
      if (enCurso) return { estado: 'en_curso' };
      if (duplicado) return { estado: 'ya_grabado', pedido: respuesta };
      return { estado: 'grabado', pedido: respuesta };
    });

    if (resultado.estado === 'en_curso') {
      return res.status(409).json({ aviso: 'Este pedido ya se está grabando (otra petición con la misma clave está en curso). No se ha creado un duplicado.' });
    }
    res.status(resultado.estado === 'grabado' ? 201 : 200).json(resultado.pedido);
  } catch (err) { next(err); }
});

// Corrección de un pedido ya grabado: sustituye cabecera y líneas por las
// nuevas. No es lo mismo que "compras" (que nunca se toca) — aquí sí se
// permite, porque el programa actual también permite corregir un pedido.
router.put('/:id', async (req, res, next) => {
  try {
    const { fecha, cliente_id, cliente_codigo_snapshot, cliente_nombre_snapshot, cliente_cif_snapshot,
      cliente_dir_snapshot, cliente_pob_snapshot, cliente_tel_snapshot, agencia, forma_pago,
      tipo_iva_aplicado, base, iva, total, lineas } = req.body;
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Un pedido necesita al menos una línea.' });

    const resultado = await conTransaccion(async (cliente) => {
      await asegurarPartidas(cliente, lineas);
      const cab = await cliente.query(
        `UPDATE pedidos SET fecha=$1, cliente_id=$2, cliente_codigo_snapshot=$3, cliente_nombre_snapshot=$4,
           cliente_cif_snapshot=$5, cliente_dir_snapshot=$6, cliente_pob_snapshot=$7, cliente_tel_snapshot=$8,
           agencia=$9, forma_pago=$10, tipo_iva_aplicado=$11, base=$12, iva=$13, total=$14, modificado_en=now()
         WHERE id=$15 RETURNING *`,
        [fecha, cliente_id || null, cliente_codigo_snapshot || null, cliente_nombre_snapshot || null,
          cliente_cif_snapshot || null, cliente_dir_snapshot || null, cliente_pob_snapshot || null,
          cliente_tel_snapshot || null, agencia || null, forma_pago || null, tipo_iva_aplicado || null,
          base || null, iva || null, total || null, req.params.id]
      );
      if (!cab.rows.length) return null;
      await cliente.query('DELETE FROM pedido_lineas WHERE pedido_id = $1', [req.params.id]);
      const lineasGuardadas = await insertarLineasPedido(cliente, req.params.id, lineas);
      await registrarEscritura(cliente, { tabla: 'pedidos', operacion: 'UPDATE', registroId: req.params.id, detalle: { numero: cab.rows[0].numero } });
      return { ...cab.rows[0], lineas: lineasGuardadas };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún pedido con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const borrado = await conTransaccion(async (cliente) => {
      const r = await cliente.query('DELETE FROM pedidos WHERE id = $1 RETURNING id, numero', [req.params.id]);
      if (!r.rows.length) return null;
      await registrarEscritura(cliente, { tabla: 'pedidos', operacion: 'DELETE', registroId: req.params.id, detalle: { numero: r.rows[0].numero } });
      return r.rows[0];
    });
    if (!borrado) return res.status(404).json({ error: `No existe ningún pedido con id ${req.params.id}` });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
