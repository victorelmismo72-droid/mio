// Traspasos internos a Zaragoza. Mismo patron que pedidos (cabecera + lineas).
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');

const router = express.Router();

router.get('/', async (req, res) => {
  const traspasos = await prisma.traspaso.findMany({
    include: { lineas: true },
    orderBy: { id: 'asc' },
  });
  res.json(traspasos);
});

router.get('/:id', async (req, res) => {
  const traspaso = await prisma.traspaso.findUnique({
    where: { id: Number(req.params.id) },
    include: { lineas: true },
  });
  if (!traspaso) return res.status(404).json({ error: 'No existe ese traspaso' });
  res.json(traspaso);
});

router.post('/', async (req, res) => {
  try {
    const { lineas, ...cabecera } = req.body;
    const creado = await prisma.traspaso.create({
      data: { ...cabecera, lineas: { create: lineas || [] } },
      include: { lineas: true },
    });
    await registrarEscritura('traspasos', 'INSERT', creado.id, cabecera.puestoOrigen);
    res.status(201).json(creado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { lineas, ...cabecera } = req.body;
    const actualizado = await prisma.$transaction(async (tx) => {
      await tx.traspasoLinea.deleteMany({ where: { traspasoId: id } });
      return tx.traspaso.update({
        where: { id },
        data: { ...cabecera, lineas: { create: lineas || [] } },
        include: { lineas: true },
      });
    });
    await registrarEscritura('traspasos', 'UPDATE', id, req.body.puestoOrigen);
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.traspasoLinea.deleteMany({ where: { traspasoId: id } });
      await tx.traspaso.delete({ where: { id } });
    });
    await registrarEscritura('traspasos', 'DELETE', id, req.query.puestoOrigen);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
