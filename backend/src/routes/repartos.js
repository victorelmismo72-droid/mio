// Reparto Super. Mismo patron que pedidos/traspasos (cabecera + lineas).
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');

const router = express.Router();

router.get('/', async (req, res) => {
  const repartos = await prisma.reparto.findMany({
    include: { lineas: true },
    orderBy: { id: 'asc' },
  });
  res.json(repartos);
});

router.get('/:id', async (req, res) => {
  const reparto = await prisma.reparto.findUnique({
    where: { id: Number(req.params.id) },
    include: { lineas: true },
  });
  if (!reparto) return res.status(404).json({ error: 'No existe ese reparto' });
  res.json(reparto);
});

router.post('/', async (req, res) => {
  try {
    const { lineas, ...cabecera } = req.body;
    const creado = await prisma.reparto.create({
      data: { ...cabecera, lineas: { create: lineas || [] } },
      include: { lineas: true },
    });
    await registrarEscritura('repartos', 'INSERT', creado.id, cabecera.puestoOrigen);
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
      await tx.repartoLinea.deleteMany({ where: { repartoId: id } });
      return tx.reparto.update({
        where: { id },
        data: { ...cabecera, lineas: { create: lineas || [] } },
        include: { lineas: true },
      });
    });
    await registrarEscritura('repartos', 'UPDATE', id, req.body.puestoOrigen);
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.repartoLinea.deleteMany({ where: { repartoId: id } });
      await tx.reparto.delete({ where: { id } });
    });
    await registrarEscritura('repartos', 'DELETE', id, req.query.puestoOrigen);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
