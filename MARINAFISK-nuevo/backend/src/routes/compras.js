// compras — DATO SAGRADO (ver FASE_0 punto 3 y FASE_1 punto 2).
//
// A propósito, este router SOLO expone GET (listar/leer) y POST (insertar).
// No hay rutas PUT/DELETE aquí, y además el rol de base de datos de la propia
// aplicación tiene revocado UPDATE/DELETE sobre estas tablas (ver grants.sql)
// — así, aunque alguien añadiera una ruta de borrado por error, Postgres la
// rechazaría igualmente.
const express = require('express');
const { pool } = require('../db');
const { registrarEscritura } = require('../logger');

const router = express.Router();

const COLUMNAS_LINEA = [
  'producto', 'descripcion', 'cajas', 'kilos', 'precio_kg',
  'base_zgz', 'base_zgz_iva', 'op2', 'base_real', 'iva', 'total_fact', 'control',
];

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM compras ORDER BY fecha DESC, id DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM compras WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'compra no encontrada' });
    const { rows: lineas } = await pool.query(
      'SELECT * FROM compra_lineas WHERE compra_id = $1 ORDER BY orden',
      [req.params.id]
    );
    res.json({ ...rows[0], lineas });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Si la compra referencia una partida que todavía no existe, se crea
    // aquí (abierta). Esto no es lógica de negocio — solo mantiene la
    // integridad referencial de la tabla `partidas` que exige la Fase 1.
    if (req.body.partida != null) {
      await client.query(
        'INSERT INTO partidas (partida) VALUES ($1) ON CONFLICT (partida) DO NOTHING',
        [req.body.partida]
      );
    }

    const cabeceraCols = [
      'uid', 'partida', 'fecha', 'alb_proveedor', 'proveedor_cod', 'proveedor_nombre',
      'total_kilos', 'total_base_zgz', 'total_base_real', 'total_iva', 'total_fact',
    ];
    const valoresCabecera = cabeceraCols.map((c) => req.body[c] ?? null);
    const placeholders = valoresCabecera.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await client.query(
      `INSERT INTO compras (${cabeceraCols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      valoresCabecera
    );
    const compra = rows[0];

    const lineas = Array.isArray(req.body.lineas) ? req.body.lineas : [];
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const cols = ['compra_id', 'orden', ...COLUMNAS_LINEA];
      const valores = [compra.id, i, ...COLUMNAS_LINEA.map((c) => linea[c] ?? null)];
      const ph = valores.map((_, idx) => `$${idx + 1}`).join(', ');
      await client.query(`INSERT INTO compra_lineas (${cols.join(', ')}) VALUES (${ph})`, valores);
    }

    await registrarEscritura(client, { tabla: 'compras', operacion: 'INSERT', referencia: compra.uid, detalle: { lineas: lineas.length } });
    await client.query('COMMIT');

    const { rows: lineasGuardadas } = await pool.query(
      'SELECT * FROM compra_lineas WHERE compra_id = $1 ORDER BY orden',
      [compra.id]
    );
    res.status(201).json({ ...compra, lineas: lineasGuardadas });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
