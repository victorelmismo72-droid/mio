// Traspasos internos a Zaragoza. Mismo patron que pedidos (cabecera + lineas).
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');

const router = express.Router();

router.get('/', async (req, res) => {
  const traspasos = await prisma.traspaso.findMany({
    include: { lineas: true },
    orderBy: { id: 'asc' },
  });
  res.json(traspasos);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  const traspaso = await prisma.traspaso.findUnique({
    where: { id },
    include: { lineas: true },
  });
  if (!traspaso) return res.status(404).json({ error: 'No existe ese traspaso' });
  res.json(traspaso);
});

router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /traspasos', async () => {
      const { lineas, idempotencyKey, ...cabecera } = req.body;
      const creado = await prisma.traspaso.create({
        data: { ...cabecera, lineas: { create: lineas || [] } },
        include: { lineas: true },
      });
      await registrarEscritura('traspasos', 'INSERT', creado.id, cabecera.puestoOrigen);
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
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
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
