const express = require('express');
const { pool, registrarAuditoria } = require('../db');

// Fabrica de CRUD basico para tablas de catalogo simples (clientes, articulos,
// proveedores): sin logica de negocio, solo leer/crear/actualizar/borrar.
// Fase 1 no valida reglas de negocio todavia - eso es Fase 2.
function crudCatalogo({ tabla, columnas, camposFecha }) {
  const router = express.Router();
  const cols = columnas.join(', ');

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT id, ${cols}, creado_en, modificado_en FROM ${tabla} ORDER BY id`);
      res.json(rows);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT id, ${cols}, creado_en, modificado_en FROM ${tabla} WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      res.json(rows[0]);
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    const client = await pool.connect();
    try {
      // Solo se insertan las columnas que vienen en el body: las que se
      // omiten quedan a cargo del valor DEFAULT de la tabla (ej. tipo_iva
      // = 'NACIONAL'), en vez de forzarse a NULL.
      const presentes = columnas.filter((c) => req.body[c] !== undefined);
      const colsPresentes = presentes.join(', ');
      const valores = presentes.map((c) => req.body[c]);
      const placeholders = presentes.map((_, i) => `$${i + 1}`).join(', ');
      const clausulaValores = presentes.length ? `(${colsPresentes}) VALUES (${placeholders})` : 'DEFAULT VALUES';
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO ${tabla} ${clausulaValores} RETURNING id, ${cols}, creado_en, modificado_en`,
        valores
      );
      await registrarAuditoria(client, { tabla, accion: 'INSERT', registroId: rows[0].id, puestoOrigen: req.usuario.usuario, detalle: req.body });
      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
  });

  router.put('/:id', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const sets = columnas.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const valores = columnas.map((c) => req.body[c] ?? null);
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE ${tabla} SET ${sets}, modificado_en = now() WHERE id = $${columnas.length + 1} RETURNING id, ${cols}, creado_en, modificado_en`,
        [...valores, req.params.id]
      );
      if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No encontrado' }); }
      await registrarAuditoria(client, { tabla, accion: 'UPDATE', registroId: req.params.id, puestoOrigen: req.usuario.usuario, detalle: req.body });
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
  });

  router.delete('/:id', async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(`DELETE FROM ${tabla} WHERE id = $1`, [req.params.id]);
      if (!rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No encontrado' }); }
      await registrarAuditoria(client, { tabla, accion: 'DELETE', registroId: req.params.id, puestoOrigen: req.usuario.usuario });
      await client.query('COMMIT');
      res.status(204).end();
    } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
  });

  return router;
}

module.exports = crudCatalogo;
