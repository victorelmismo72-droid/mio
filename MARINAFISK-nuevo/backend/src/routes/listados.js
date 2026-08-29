const express = require('express');
const { pool } = require('../db');
const { responderListado } = require('../utilCsv');
const { rentabilidadPartida } = require('../negocio/partidas');

// Listados de gestion (Fase 2 punto 5bis). Todos filtran por fecha
// (?desde=AAAA-MM-DD&hasta=AAAA-MM-DD) y admiten ?formato=csv.
//
// Regla de alcance obligatoria (Fase 0 punto 9, confirmada por Victor): los
// listados de movimiento/venta de producto deben sumar PEDIDOS + TRASPASOS
// (los traspasos a Zaragoza no son venta fiscal, pero si movimiento real de
// producto) y deben EXCLUIR SIEMPRE Reparto Super (esa mercancia ya se
// factura al cliente que encarga el reparto - incluirla aqui duplicaria el
// dato). Por eso "repartos" no aparece en ningun listado de este fichero.
const router = express.Router();

function rangoFechas(req) {
  const desde = req.query.desde || '0001-01-01';
  const hasta = req.query.hasta || '9999-12-31';
  return [desde, hasta];
}

router.get('/ventas-por-cliente', async (req, res, next) => {
  try {
    const [desde, hasta] = rangoFechas(req);
    const { rows } = await pool.query(
      `SELECT p.cliente_codigo, p.cliente_nombre_snapshot AS cliente_nombre,
              count(DISTINCT p.id) AS num_pedidos,
              sum(pl.peso) AS kilos_total,
              sum(pl.total) AS importe_total
       FROM pedidos p JOIN pedido_lineas pl ON pl.pedido_id = p.id
       WHERE p.fecha BETWEEN $1 AND $2
       GROUP BY p.cliente_codigo, p.cliente_nombre_snapshot
       ORDER BY importe_total DESC`,
      [desde, hasta]
    );
    responderListado(req, res, rows);
  } catch (err) { next(err); }
});

router.get('/compras-por-proveedor', async (req, res, next) => {
  try {
    const [desde, hasta] = rangoFechas(req);
    const { rows } = await pool.query(
      `SELECT c.proveedor_codigo, c.proveedor_nombre,
              count(*) AS num_compras,
              sum(c.total_kilos) AS kilos_total,
              sum(c.total_base_real) AS coste_total,
              sum(c.total_fact) AS facturado_total
       FROM compras c
       WHERE c.fecha BETWEEN $1 AND $2
       GROUP BY c.proveedor_codigo, c.proveedor_nombre
       ORDER BY facturado_total DESC`,
      [desde, hasta]
    );
    responderListado(req, res, rows);
  } catch (err) { next(err); }
});

router.get('/rentabilidad-partidas', async (req, res, next) => {
  try {
    const [desde, hasta] = rangoFechas(req);
    const { rows: partidas } = await pool.query(
      `SELECT DISTINCT numero_partida, min(fecha) AS fecha
       FROM compras WHERE fecha BETWEEN $1 AND $2 AND numero_partida IS NOT NULL
       GROUP BY numero_partida ORDER BY numero_partida`,
      [desde, hasta]
    );
    const resultado = [];
    for (const p of partidas) {
      // eslint-disable-next-line no-await-in-loop
      const r = await rentabilidadPartida(pool, p.numero_partida);
      resultado.push({
        numero_partida: r.numero_partida, fecha: p.fecha, cerrada: r.cerrada,
        coste_total: r.coste_total, total_vendido: r.total_vendido, rentabilidad: r.rentabilidad,
      });
    }
    responderListado(req, res, resultado);
  } catch (err) { next(err); }
});

router.get('/stock-actual', async (req, res, next) => {
  try {
    // Simplificacion respecto al motor de asignacion (que usa familia de
    // producto con coincidencia difusa, ver src/negocio/partidas.js): aqui,
    // para una foto rapida de existencias, se compara el codigo de producto
    // tal cual (sin variantes de talla) - suficiente para un listado de
    // consulta, no para decidir a que partida asignar una venta.
    const { rows } = await pool.query(`
      SELECT c.numero_partida, cl.producto, cl.descripcion, c.fecha, c.proveedor_nombre,
             sum(cl.kilos) AS kilos_comprados,
             coalesce((SELECT sum(pl.peso) FROM pedido_lineas pl WHERE pl.partida_numero = c.numero_partida AND pl.articulo_codigo = cl.producto), 0) AS kilos_vendidos,
             coalesce((SELECT sum(tl.peso) FROM traspaso_lineas tl WHERE tl.partida_numero = c.numero_partida AND tl.articulo_codigo = cl.producto), 0) AS kilos_traspasados
      FROM compra_lineas cl JOIN compras c ON c.id = cl.compra_id
      WHERE c.numero_partida IS NOT NULL
        AND c.numero_partida NOT IN (SELECT numero_partida FROM partidas_cerradas)
      GROUP BY c.numero_partida, cl.producto, cl.descripcion, c.fecha, c.proveedor_nombre
    `);
    const conDisponible = rows
      .map((r) => ({
        ...r,
        kilos_disponibles: Number(r.kilos_comprados) - Number(r.kilos_vendidos) - Number(r.kilos_traspasados),
      }))
      .filter((r) => r.kilos_disponibles > 0.01)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    responderListado(req, res, conDisponible);
  } catch (err) { next(err); }
});

router.get('/margenes-por-articulo', async (req, res, next) => {
  try {
    const [desde, hasta] = rangoFechas(req);
    // Margen = precio de venta menos coste por kilo de la partida asignada
    // (mismo producto, mismo numero_partida - coincidencia exacta; la
    // asignacion en si ya se hizo con la logica de familia difusa antes de
    // llegar aqui). Solo cuenta lineas que ya tienen partida asignada.
    const { rows } = await pool.query(
      `SELECT pl.articulo_codigo, max(coalesce(a.descripcion, pl.descripcion)) AS articulo_descripcion,
              sum(pl.peso) AS kilos_vendidos,
              sum(pl.total) AS importe_vendido,
              sum(cl.base_real / NULLIF(cl.kilos, 0) * pl.peso) AS coste_asignado,
              sum(pl.total) - sum(cl.base_real / NULLIF(cl.kilos, 0) * pl.peso) AS margen_total
       FROM pedido_lineas pl
       JOIN pedidos p ON p.id = pl.pedido_id
       JOIN compras c ON c.numero_partida = pl.partida_numero
       JOIN compra_lineas cl ON cl.compra_id = c.id AND cl.producto = pl.articulo_codigo
       LEFT JOIN articulos a ON a.codigo = pl.articulo_codigo
       WHERE p.fecha BETWEEN $1 AND $2 AND pl.partida_numero IS NOT NULL
       GROUP BY pl.articulo_codigo
       ORDER BY margen_total DESC`,
      [desde, hasta]
    );
    responderListado(req, res, rows);
  } catch (err) { next(err); }
});

router.get('/clientes-sin-actividad', async (req, res, next) => {
  try {
    const dias = Number(req.query.dias) || 90;
    const { rows } = await pool.query(
      `SELECT cl.codigo, cl.nombre, cl.telefono, cl.email,
              (SELECT max(p.fecha) FROM pedidos p WHERE p.cliente_codigo = cl.codigo) AS ultima_compra
       FROM clientes cl
       WHERE NOT EXISTS (
         SELECT 1 FROM pedidos p
         WHERE p.cliente_codigo = cl.codigo AND p.fecha >= (CURRENT_DATE - $1::int)
       )
       ORDER BY ultima_compra DESC NULLS LAST`,
      [dias]
    );
    responderListado(req, res, rows);
  } catch (err) { next(err); }
});

// Listado de movimiento de producto por fecha: pedidos + traspasos (nunca
// repartos - ver Fase 0 punto 9).
router.get('/movimiento-producto', async (req, res, next) => {
  try {
    const [desde, hasta] = rangoFechas(req);
    const { rows } = await pool.query(
      `SELECT m.fecha, m.articulo_codigo, max(coalesce(a.descripcion, m.descripcion)) AS articulo_descripcion,
              sum(m.peso) AS kilos, sum(m.importe) AS importe
       FROM (
         SELECT p.fecha, pl.articulo_codigo AS articulo_codigo, pl.descripcion AS descripcion, pl.peso AS peso, pl.total AS importe
         FROM pedidos p JOIN pedido_lineas pl ON pl.pedido_id = p.id
         WHERE p.fecha BETWEEN $1 AND $2
         UNION ALL
         SELECT t.fecha, tl.articulo_codigo AS articulo_codigo, tl.descripcion AS descripcion, tl.peso AS peso, 0 AS importe
         FROM traspasos t JOIN traspaso_lineas tl ON tl.traspaso_id = t.id
         WHERE t.fecha BETWEEN $1 AND $2
       ) m
       LEFT JOIN articulos a ON a.codigo = m.articulo_codigo
       GROUP BY m.fecha, m.articulo_codigo
       ORDER BY m.fecha, m.articulo_codigo`,
      [desde, hasta]
    );
    responderListado(req, res, rows);
  } catch (err) { next(err); }
});

module.exports = router;
