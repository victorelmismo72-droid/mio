const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('./log');

// Fábrica de rutas CRUD sencillas para catálogos (clientes, artículos,
// proveedores, puestos): sin lógica de negocio, solo leer/crear/actualizar/
// borrar filas — tal como pide la Fase 1. Las tablas con reglas especiales
// (compras, inmutable) tienen su propio archivo de rutas, no usan esto.
function crudSimple({ tabla, columnas, tieneModificadoEn = true }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const r = await conTransaccion((cliente) => cliente.query(`SELECT * FROM ${tabla} ORDER BY id`));
      res.json(r.rows);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const r = await conTransaccion((cliente) => cliente.query(`SELECT * FROM ${tabla} WHERE id = $1`, [req.params.id]));
      if (!r.rows.length) return res.status(404).json({ error: `No existe ningún registro de ${tabla} con id ${req.params.id}` });
      res.json(r.rows[0]);
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const campos = columnas.filter((c) => req.body[c] !== undefined);
      if (!campos.length) return res.status(400).json({ error: 'No se ha enviado ningún campo reconocido.' });
      const valores = campos.map((c) => req.body[c]);
      const marcadores = campos.map((_, i) => `$${i + 1}`);
      const resultado = await conTransaccion(async (cliente) => {
        const r = await cliente.query(
          `INSERT INTO ${tabla} (${campos.join(', ')}) VALUES (${marcadores.join(', ')}) RETURNING *`,
          valores
        );
        await registrarEscritura(cliente, { tabla, operacion: 'INSERT', registroId: r.rows[0].id, detalle: req.body });
        return r.rows[0];
      });
      res.status(201).json(resultado);
    } catch (err) { next(err); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const campos = columnas.filter((c) => req.body[c] !== undefined);
      if (!campos.length) return res.status(400).json({ error: 'No se ha enviado ningún campo reconocido.' });
      const asignaciones = campos.map((c, i) => `${c} = $${i + 1}`);
      if (tieneModificadoEn) asignaciones.push('modificado_en = now()');
      const valores = campos.map((c) => req.body[c]);
      const resultado = await conTransaccion(async (cliente) => {
        const r = await cliente.query(
          `UPDATE ${tabla} SET ${asignaciones.join(', ')} WHERE id = $${campos.length + 1} RETURNING *`,
          [...valores, req.params.id]
        );
        if (!r.rows.length) return null;
        await registrarEscritura(cliente, { tabla, operacion: 'UPDATE', registroId: req.params.id, detalle: req.body });
        return r.rows[0];
      });
      if (!resultado) return res.status(404).json({ error: `No existe ningún registro de ${tabla} con id ${req.params.id}` });
      res.json(resultado);
    } catch (err) { next(err); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const borrado = await conTransaccion(async (cliente) => {
        const r = await cliente.query(`DELETE FROM ${tabla} WHERE id = $1 RETURNING id`, [req.params.id]);
        if (!r.rows.length) return false;
        await registrarEscritura(cliente, { tabla, operacion: 'DELETE', registroId: req.params.id });
        return true;
      });
      if (!borrado) return res.status(404).json({ error: `No existe ningún registro de ${tabla} con id ${req.params.id}` });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { crudSimple };
