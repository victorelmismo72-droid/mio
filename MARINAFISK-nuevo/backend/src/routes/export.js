const express = require('express');
const { pool } = require('../db');

// Endpoint de exportacion (Fase 1, punto 3): genera un JSON con la misma
// forma que el backup actual del programa HTML, para poder comparar
// facilmente durante la verificacion de la migracion.
const router = express.Router();

async function lineasPorPadre(tablaLineas, fk, padreId) {
  const { rows } = await pool.query(`SELECT * FROM ${tablaLineas} WHERE ${fk} = $1 ORDER BY id`, [padreId]);
  return rows;
}

router.get('/', async (req, res, next) => {
  try {
    const [clientes, articulos, proveedores, compras, pedidos, traspasos, repartos] = await Promise.all([
      pool.query('SELECT * FROM clientes ORDER BY id'),
      pool.query('SELECT * FROM articulos ORDER BY id'),
      pool.query('SELECT * FROM proveedores ORDER BY id'),
      pool.query('SELECT * FROM compras ORDER BY id'),
      pool.query('SELECT * FROM pedidos ORDER BY id'),
      pool.query('SELECT * FROM traspasos ORDER BY id'),
      pool.query('SELECT * FROM repartos ORDER BY id'),
    ]);

    const conLineas = async (rows, tablaLineas, fk) => Promise.all(
      rows.map(async (r) => ({ ...r, lineas: await lineasPorPadre(tablaLineas, fk, r.id) }))
    );

    const [comprasConLineas, pedidosConLineas, traspasosConLineas, repartosConLineas] = await Promise.all([
      conLineas(compras.rows, 'compra_lineas', 'compra_id'),
      conLineas(pedidos.rows, 'pedido_lineas', 'pedido_id'),
      conLineas(traspasos.rows, 'traspaso_lineas', 'traspaso_id'),
      conLineas(repartos.rows, 'reparto_lineas', 'reparto_id'),
    ]);

    res.json({
      version: 'MARINAFISK_DB_EXPORT_V1',
      fecha: new Date().toISOString(),
      clientes: clientes.rows,
      articulos: articulos.rows,
      proveedores: proveedores.rows,
      compras: comprasConLineas,
      historial: pedidosConLineas,
      historialTrp: traspasosConLineas,
      repartos: repartosConLineas,
    });
  } catch (err) { next(err); }
});

module.exports = router;
