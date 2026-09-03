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

// Listado plano de pedidos para contabilidad (informe de bugs de Víctor,
// 29/08/2026, puntos 3 y 4 - a evitar en el programa nuevo): cada fila es un
// pedido con su IVA/Recargo de Equivalencia YA CALCULADO SEGUN EL CLIENTE
// (nunca un 10% fijo para todos - se lee tal cual quedo grabado en
// `pedidos.iva`/`pedidos.total`, calculado en el momento de grabar por
// calcularCabeceraPedido, ver src/routes/pedidos.js), y la ultima fila es un
// TOTAL general (kilos, base, iva y total de todos los pedidos del rango).
router.get('/pedidos-detalle', async (req, res, next) => {
  try {
    const [desde, hasta] = rangoFechas(req);
    const { rows } = await pool.query(
      `SELECT p.numero, p.fecha, p.cliente_codigo,
              p.cliente_nombre_snapshot AS cliente_nombre,
              coalesce((SELECT sum(pl.peso) FROM pedido_lineas pl WHERE pl.pedido_id = p.id), 0) AS kilos,
              p.base, p.iva, p.total
       FROM pedidos p
       WHERE p.fecha BETWEEN $1 AND $2
       ORDER BY p.fecha, p.numero`,
      [desde, hasta]
    );
    if (rows.length) {
      const totales = rows.reduce((acc, r) => ({
        kilos: acc.kilos + Number(r.kilos), base: acc.base + Number(r.base || 0),
        iva: acc.iva + Number(r.iva || 0), total: acc.total + Number(r.total || 0),
      }), { kilos: 0, base: 0, iva: 0, total: 0 });
      rows.push({
        numero: 'TOTAL', fecha: '', cliente_codigo: '', cliente_nombre: '',
        kilos: totales.kilos, base: totales.base, iva: totales.iva, total: totales.total,
      });
    }
    responderListado(req, res, rows);
  } catch (err) { next(err); }
});

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
// Listado de movimiento de producto por fecha: por defecto SOLO ventas
// reales (pedidos) - nunca repartos (ver Fase 0 punto 9). Los traspasos a
// Zaragoza son movimiento de producto real pero no son una venta fiscal,
// así que solo se incluyen si se pide explícitamente (?incluirTraspasos=1)
// y siempre como una categoría aparte, nunca mezclados en el mismo total
// (informe de Víctor, 02/09/2026, punto 3 - mismo criterio ya aplicado en
// el HTML actual al buscador de artículos del historial): la columna
// `tipo` distingue cada fila, y al final se añaden tres totales separados
// en vez de uno solo - Ventas reales (kg + importe), Traspasado a Zaragoza
// (solo kg, no es venta) y Total pescado movido (kg, suma de ambos, solo
// para estadística).
router.get('/movimiento-producto', async (req, res, next) => {
  try {
    const [desde, hasta] = rangoFechas(req);
    const incluirTraspasos = req.query.incluirTraspasos === '1' || req.query.incluirTraspasos === 'true';

    const { rows: ventas } = await pool.query(
      `SELECT p.fecha, pl.articulo_codigo AS articulo_codigo,
              max(coalesce(a.descripcion, pl.descripcion)) AS articulo_descripcion,
              sum(pl.peso) AS kilos, sum(pl.total) AS importe
       FROM pedidos p JOIN pedido_lineas pl ON pl.pedido_id = p.id
       LEFT JOIN articulos a ON a.codigo = pl.articulo_codigo
       WHERE p.fecha BETWEEN $1 AND $2
       GROUP BY p.fecha, pl.articulo_codigo
       ORDER BY p.fecha, pl.articulo_codigo`,
      [desde, hasta]
    );
    const totalVentasKg = ventas.reduce((s, r) => s + Number(r.kilos || 0), 0);
    const totalVentasImporte = ventas.reduce((s, r) => s + Number(r.importe || 0), 0);
    let filas = ventas.map((r) => ({
      fecha: r.fecha, tipo: 'VENTA', articulo_codigo: r.articulo_codigo,
      articulo_descripcion: r.articulo_descripcion, kilos: r.kilos, importe: r.importe,
    }));

    let totalTraspasosKg = 0;
    if (incluirTraspasos) {
      const { rows: traspasos } = await pool.query(
        `SELECT t.fecha, tl.articulo_codigo AS articulo_codigo,
                max(coalesce(a.descripcion, tl.descripcion)) AS articulo_descripcion,
                sum(tl.peso) AS kilos
         FROM traspasos t JOIN traspaso_lineas tl ON tl.traspaso_id = t.id
         LEFT JOIN articulos a ON a.codigo = tl.articulo_codigo
         WHERE t.fecha BETWEEN $1 AND $2
         GROUP BY t.fecha, tl.articulo_codigo
         ORDER BY t.fecha, tl.articulo_codigo`,
        [desde, hasta]
      );
      totalTraspasosKg = traspasos.reduce((s, r) => s + Number(r.kilos || 0), 0);
      const filasTraspaso = traspasos.map((r) => ({
        fecha: r.fecha, tipo: 'TRASPASO A ZARAGOZA (interno, no es venta)', articulo_codigo: r.articulo_codigo,
        articulo_descripcion: r.articulo_descripcion, kilos: r.kilos, importe: null,
      }));
      filas = filas.concat(filasTraspaso).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    }

    if (filas.length) {
      filas.push({ fecha: '', tipo: 'TOTAL VENTAS REALES', articulo_codigo: '', articulo_descripcion: '', kilos: totalVentasKg, importe: totalVentasImporte });
      if (incluirTraspasos) {
        filas.push({ fecha: '', tipo: 'TOTAL TRASPASADO A ZARAGOZA (no es venta)', articulo_codigo: '', articulo_descripcion: '', kilos: totalTraspasosKg, importe: null });
        filas.push({ fecha: '', tipo: 'TOTAL PESCADO MOVIDO (venta + traspasos)', articulo_codigo: '', articulo_descripcion: '', kilos: totalVentasKg + totalTraspasosKg, importe: null });
      }
    }
    responderListado(req, res, filas);
  } catch (err) { next(err); }
});

module.exports = router;
