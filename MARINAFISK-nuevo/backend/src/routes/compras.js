const express = require('express');
const { pool, registrarAuditoria } = require('../db');

// Compras = dato sagrado (Fase 0 punto 3). Este router SOLO expone lectura
// y creacion. No hay PUT ni DELETE - ni siquiera a nivel de API - y ademas
// la base de datos bloquea UPDATE/DELETE con un trigger (ver schema.sql).
const router = express.Router();

const CAMPOS_LINEA = [
  'producto', 'descripcion', 'cajas', 'kilos', 'precio_kg', 'control',
  'base_zgz', 'base_zgz_iva', 'op2', 'base_real', 'iva', 'total_fact',
];

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM compras ORDER BY id`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM compras WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const { rows: lineas } = await pool.query(
      `SELECT * FROM compra_lineas WHERE compra_id = $1 ORDER BY id`,
      [req.params.id]
    );
    res.json({ ...rows[0], lineas });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      numero_partida, fecha, alb_proveedor, proveedor_codigo, proveedor_nombre,
      total_kilos, total_base_zgz, total_base_real, total_iva, total_fact,
      puesto_origen, lineas = [],
    } = req.body;

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO compras (numero_partida, fecha, alb_proveedor, proveedor_codigo, proveedor_nombre,
                             total_kilos, total_base_zgz, total_base_real, total_iva, total_fact, puesto_origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [numero_partida, fecha, alb_proveedor, proveedor_codigo, proveedor_nombre,
        total_kilos, total_base_zgz, total_base_real, total_iva, total_fact, puesto_origen]
    );
    const compra = rows[0];

    const lineasInsertadas = [];
    for (const linea of lineas) {
      const valores = CAMPOS_LINEA.map((c) => linea[c] ?? null);
      const placeholders = CAMPOS_LINEA.map((_, i) => `$${i + 2}`).join(', ');
      const { rows: lr } = await client.query(
        `INSERT INTO compra_lineas (compra_id, ${CAMPOS_LINEA.join(', ')}) VALUES ($1, ${placeholders}) RETURNING *`,
        [compra.id, ...valores]
      );
      lineasInsertadas.push(lr[0]);
    }

    await registrarAuditoria(client, {
      tabla: 'compras', accion: 'INSERT', registroId: compra.id, puestoOrigen: puesto_origen,
      detalle: { numero_partida, proveedor_codigo, num_lineas: lineasInsertadas.length },
    });

    await client.query('COMMIT');
    res.status(201).json({ ...compra, lineas: lineasInsertadas });
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

module.exports = router;
