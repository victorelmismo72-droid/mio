// Fábrica de rutas CRUD para tablas de cabecera + líneas hijas:
// historial (pedidos), historial_trp (traspasos), repartos, listas_precios.
//
// Cada operación de escritura de cabecera+líneas se hace en una única
// transacción: o se guardan todas las líneas o no se guarda nada.
const express = require('express');
const { pool } = require('../db');
const { registrarEscritura } = require('../logger');

/**
 * @param {object} opciones
 * @param {string} opciones.tabla - tabla de cabecera
 * @param {string[]} opciones.columnasCabecera - columnas editables de cabecera
 * @param {string} opciones.tablaLineas - tabla de líneas hijas
 * @param {string} opciones.fkLineas - columna en tablaLineas que apunta a la cabecera (ej. 'historial_id')
 * @param {string[]} opciones.columnasLinea - columnas editables de cada línea
 * @param {string} [opciones.ordenPor] - columna por la que ordenar el listado (por defecto 'id')
 */
function crearRutasConLineas({ tabla, columnasCabecera, tablaLineas, fkLineas, columnasLinea, ordenPor = 'id' }) {
  const router = express.Router();

  async function cargarLineas(client, id) {
    const { rows } = await client.query(
      `SELECT * FROM ${tablaLineas} WHERE ${fkLineas} = $1 ORDER BY orden`,
      [id]
    );
    return rows;
  }

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tabla} ORDER BY ${ordenPor} DESC`);
      res.json(rows);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tabla} WHERE id = $1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: `${tabla} no encontrado` });
      const lineas = await cargarLineas(pool, req.params.id);
      res.json({ ...rows[0], lineas });
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const valoresCabecera = columnasCabecera.map((c) => req.body[c] ?? null);
      const placeholdersCabecera = valoresCabecera.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await client.query(
        `INSERT INTO ${tabla} (${columnasCabecera.join(', ')}) VALUES (${placeholdersCabecera}) RETURNING *`,
        valoresCabecera
      );
      const cabecera = rows[0];

      const lineas = Array.isArray(req.body.lineas) ? req.body.lineas : [];
      for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        const cols = [fkLineas, 'orden', ...columnasLinea];
        const valores = [cabecera.id, i, ...columnasLinea.map((c) => linea[c] ?? null)];
        const placeholders = valores.map((_, idx) => `$${idx + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${tablaLineas} (${cols.join(', ')}) VALUES (${placeholders})`,
          valores
        );
      }

      await registrarEscritura(client, { tabla, operacion: 'INSERT', referencia: cabecera.id, detalle: { lineas: lineas.length } });
      await client.query('COMMIT');
      res.status(201).json({ ...cabecera, lineas: await cargarLineas(pool, cabecera.id) });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  });

  router.put('/:id', async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const asignaciones = columnasCabecera.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const valoresCabecera = [...columnasCabecera.map((c) => req.body[c] ?? null), req.params.id];
      const { rows } = await client.query(
        `UPDATE ${tabla} SET ${asignaciones} WHERE id = $${columnasCabecera.length + 1} RETURNING *`,
        valoresCabecera
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `${tabla} no encontrado` });
      }
      const cabecera = rows[0];

      if (Array.isArray(req.body.lineas)) {
        await client.query(`DELETE FROM ${tablaLineas} WHERE ${fkLineas} = $1`, [req.params.id]);
        const lineas = req.body.lineas;
        for (let i = 0; i < lineas.length; i++) {
          const linea = lineas[i];
          const cols = [fkLineas, 'orden', ...columnasLinea];
          const valores = [cabecera.id, i, ...columnasLinea.map((c) => linea[c] ?? null)];
          const placeholders = valores.map((_, idx) => `$${idx + 1}`).join(', ');
          await client.query(
            `INSERT INTO ${tablaLineas} (${cols.join(', ')}) VALUES (${placeholders})`,
            valores
          );
        }
      }

      await registrarEscritura(client, { tabla, operacion: 'UPDATE', referencia: req.params.id });
      await client.query('COMMIT');
      res.json({ ...cabecera, lineas: await cargarLineas(pool, cabecera.id) });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM ${tabla} WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: `${tabla} no encontrado` });
      await registrarEscritura(null, { tabla, operacion: 'DELETE', referencia: req.params.id });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { crearRutasConLineas };
