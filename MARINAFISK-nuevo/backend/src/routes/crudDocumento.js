const express = require('express');
const { pool, registrarAuditoria } = require('../db');

// Fabrica de CRUD para documentos con cabecera + lineas (pedidos, traspasos,
// repartos). A diferencia de compras, estos SI se pueden actualizar/borrar
// (no son "dato sagrado"). Sin logica de negocio todavia - eso es Fase 2.
function crudDocumento({ tabla, tablaLineas, columnasCabecera, columnasLinea, fkLinea }) {
  const router = express.Router();
  const colsCab = columnasCabecera.join(', ');

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tabla} ORDER BY id`);
      res.json(rows);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tabla} WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      const { rows: lineas } = await pool.query(
        `SELECT * FROM ${tablaLineas} WHERE ${fkLinea} = $1 ORDER BY id`, [req.params.id]
      );
      res.json({ ...rows[0], lineas });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { lineas = [], puesto_origen } = req.body;
      const valoresCab = columnasCabecera.map((c) => req.body[c] ?? null);
      const placeholders = columnasCabecera.map((_, i) => `$${i + 1}`).join(', ');
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO ${tabla} (${colsCab}) VALUES (${placeholders}) RETURNING *`,
        valoresCab
      );
      const cabecera = rows[0];

      const lineasInsertadas = [];
      for (const linea of lineas) {
        const valoresLinea = columnasLinea.map((c) => linea[c] ?? null);
        const ph = columnasLinea.map((_, i) => `$${i + 2}`).join(', ');
        const { rows: lr } = await client.query(
          `INSERT INTO ${tablaLineas} (${fkLinea}, ${columnasLinea.join(', ')}) VALUES ($1, ${ph}) RETURNING *`,
          [cabecera.id, ...valoresLinea]
        );
        lineasInsertadas.push(lr[0]);
      }

      await registrarAuditoria(client, { tabla, accion: 'INSERT', registroId: cabecera.id, puestoOrigen: puesto_origen, detalle: { num_lineas: lineasInsertadas.length } });
      await client.query('COMMIT');
      res.status(201).json({ ...cabecera, lineas: lineasInsertadas });
    } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
  });

  router.put('/:id', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const sets = columnasCabecera.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const valores = columnasCabecera.map((c) => req.body[c] ?? null);
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE ${tabla} SET ${sets}, modificado_en = now() WHERE id = $${columnasCabecera.length + 1} RETURNING *`,
        [...valores, req.params.id]
      );
      if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No encontrado' }); }
      await registrarAuditoria(client, { tabla, accion: 'UPDATE', registroId: req.params.id, puestoOrigen: req.body.puesto_origen });
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
  });

  router.delete('/:id', async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${tablaLineas} WHERE ${fkLinea} = $1`, [req.params.id]);
      const { rowCount } = await client.query(`DELETE FROM ${tabla} WHERE id = $1`, [req.params.id]);
      if (!rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No encontrado' }); }
      await registrarAuditoria(client, { tabla, accion: 'DELETE', registroId: req.params.id, puestoOrigen: req.query.puesto_origen });
      await client.query('COMMIT');
      res.status(204).end();
    } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
  });

  return router;
}

module.exports = crudDocumento;
