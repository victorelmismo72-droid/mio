// Router CRUD generico para los catalogos maestros (clientes, proveedores,
// articulos): estas tres tablas SI permiten editar y borrar (a diferencia de
// compras, que es "dato sagrado" - ver src/routes/compras.js). Se comparte
// el mismo codigo entre las tres para no repetirlo tres veces casi igual.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
    const registro = await delegado.findUnique({ where: { id } });
    if (!registro) return res.status(404).json({ error: `No existe ese registro en ${nombreTabla}` });
    res.json(registro);
  });

  router.post('/', async (req, res) => {
    try {
      await conIdempotencia(req, res, `POST /${nombreTabla}`, async () => {
        const { idempotencyKey, ...datos } = req.body;
        const creado = await delegado.create({ data: datos });
        await registrarEscritura(nombreTabla, 'INSERT', creado.id, datos.puestoOrigen);
        return { statusHttp: 201, cuerpo: creado };
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
    try {
      const actualizado = await delegado.update({
        where: { id },
        data: req.body,
      });
      await registrarEscritura(nombreTabla, 'UPDATE', actualizado.id, req.body.puestoOrigen);
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
    try {
      await delegado.delete({ where: { id } });
      await registrarEscritura(nombreTabla, 'DELETE', id, req.query.puestoOrigen);
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { crearRouterCatalogo };
