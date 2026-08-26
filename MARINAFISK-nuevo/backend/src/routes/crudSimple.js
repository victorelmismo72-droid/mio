// Fábrica de rutas CRUD para tablas simples de un solo nivel (sin líneas
// hijas): clientes, articulos, proveedores, partidas.
//
// Fase 1 solo pide crear/leer/actualizar/borrar sin validaciones de negocio
// — esas llegan en la Fase 2.
const express = require('express');
const { pool } = require('../db');
const { registrarEscritura } = require('../logger');

/**
 * @param {object} opciones
 * @param {string} opciones.tabla - nombre de la tabla en Postgres
 * @param {string} opciones.clave - nombre de la columna clave primaria
 * @param {string[]} opciones.columnas - columnas editables (sin incluir la clave ni mod_timestamp)
 */
function crearRutasCrudSimple({ tabla, clave, columnas }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tabla} ORDER BY ${clave}`);
      res.json(rows);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tabla} WHERE ${clave} = $1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: `${tabla} no encontrado` });
      res.json(rows[0]);
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const valores = [req.body[clave], ...columnas.map((c) => req.body[c] ?? null)];
      const placeholders = valores.map((_, i) => `$${i + 1}`).join(', ');
      const cols = [clave, ...columnas].join(', ');
      const { rows } = await pool.query(
        `INSERT INTO ${tabla} (${cols}) VALUES (${placeholders}) RETURNING *`,
        valores
      );
      await registrarEscritura(null, { tabla, operacion: 'INSERT', referencia: rows[0][clave] });
      res.status(201).json(rows[0]);
    } catch (err) { next(err); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const asignaciones = columnas.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const valores = [...columnas.map((c) => req.body[c] ?? null), req.params.id];
      const { rows } = await pool.query(
        `UPDATE ${tabla} SET ${asignaciones} WHERE ${clave} = $${columnas.length + 1} RETURNING *`,
        valores
      );
      if (!rows[0]) return res.status(404).json({ error: `${tabla} no encontrado` });
      await registrarEscritura(null, { tabla, operacion: 'UPDATE', referencia: req.params.id });
      res.json(rows[0]);
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM ${tabla} WHERE ${clave} = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: `${tabla} no encontrado` });
      await registrarEscritura(null, { tabla, operacion: 'DELETE', referencia: req.params.id });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { crearRutasCrudSimple };
