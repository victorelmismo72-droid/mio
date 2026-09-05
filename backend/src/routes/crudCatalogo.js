// Router CRUD generico para los catalogos maestros (clientes, proveedores,
// articulos): estas tres tablas SI permiten editar y borrar (a diferencia de
// compras, que es "dato sagrado" - ver src/routes/compras.js). Se comparte
// el mismo codigo entre las tres para no repetirlo tres veces casi igual.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');

// modeloPrisma: nombre del modelo tal como lo genera Prisma (ej. "cliente").
// nombreTabla: nombre para el log de escrituras (ej. "clientes").
function crearRouterCatalogo(modeloPrisma, nombreTabla) {
  const router = express.Router();
  const delegado = prisma[modeloPrisma];

  router.get('/', async (req, res) => {
    const registros = await delegado.findMany({ orderBy: { id: 'asc' } });
    res.json(registros);
  });

  router.get('/:id', async (req, res) => {
    const registro = await delegado.findUnique({ where: { id: Number(req.params.id) } });
    if (!registro) return res.status(404).json({ error: `No existe ese registro en ${nombreTabla}` });
    res.json(registro);
  });

  router.post('/', async (req, res) => {
    try {
      const creado = await delegado.create({ data: req.body });
      await registrarEscritura(nombreTabla, 'INSERT', creado.id, req.body.puestoOrigen);
      res.status(201).json(creado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const actualizado = await delegado.update({
        where: { id: Number(req.params.id) },
        data: req.body,
      });
      await registrarEscritura(nombreTabla, 'UPDATE', actualizado.id, req.body.puestoOrigen);
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await delegado.delete({ where: { id: Number(req.params.id) } });
      await registrarEscritura(nombreTabla, 'DELETE', Number(req.params.id), req.query.puestoOrigen);
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { crearRouterCatalogo };
