// Listas de precio (Mayoristas/Pescaderias). Independientes entre si por
// tipo+fecha (restriccion UNIQUE en el esquema) - ver FASE_0 punto 5.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');

const router = express.Router();

router.get('/', async (req, res) => {
  const listas = await prisma.listaPrecio.findMany({
    include: { lineas: true },
    orderBy: { id: 'asc' },
  });
  res.json(listas);
});

router.get('/:id', async (req, res) => {
  const lista = await prisma.listaPrecio.findUnique({
    where: { id: Number(req.params.id) },
    include: { lineas: true },
  });
  if (!lista) return res.status(404).json({ error: 'No existe esa lista de precio' });
  res.json(lista);
});

router.post('/', async (req, res) => {
  try {
    const { lineas, ...cabecera } = req.body;
    const creada = await prisma.listaPrecio.create({
      data: { ...cabecera, lineas: { create: lineas || [] } },
      include: { lineas: true },
    });
    await registrarEscritura('listas_precio', 'INSERT', creada.id, req.body.puestoOrigen);
    res.status(201).json(creada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { lineas, ...cabecera } = req.body;
    const actualizada = await prisma.$transaction(async (tx) => {
      await tx.listaPrecioLinea.deleteMany({ where: { listaPrecioId: id } });
      return tx.listaPrecio.update({
        where: { id },
        data: { ...cabecera, lineas: { create: lineas || [] } },
        include: { lineas: true },
      });
    });
    await registrarEscritura('listas_precio', 'UPDATE', id, req.body.puestoOrigen);
    res.json(actualizada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.listaPrecioLinea.deleteMany({ where: { listaPrecioId: id } });
      await tx.listaPrecio.delete({ where: { id } });
    });
    await registrarEscritura('listas_precio', 'DELETE', id, req.query.puestoOrigen);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
