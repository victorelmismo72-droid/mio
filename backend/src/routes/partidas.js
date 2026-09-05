// Partidas: en esta fase (solo almacenamiento) NO hay logica de asignacion
// de margen ni de kilos disponibles (eso es Fase 2). Aqui solo se guarda el
// estado real de cierre manual. Por eso no hay una ruta PUT generica -
// solo una ruta especifica para "cerrar", que es la unica escritura que
// tiene sentido hacer aqui.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');

const router = express.Router();

router.get('/', async (req, res) => {
  const partidas = await prisma.partida.findMany({
    include: { compra: true },
    orderBy: { id: 'asc' },
  });
  res.json(partidas);
});

router.get('/:id', async (req, res) => {
  const partida = await prisma.partida.findUnique({
    where: { id: Number(req.params.id) },
    include: { compra: true },
  });
  if (!partida) return res.status(404).json({ error: 'No existe esa partida' });
  res.json(partida);
});

router.post('/', async (req, res) => {
  try {
    const creada = await prisma.partida.create({ data: req.body });
    await registrarEscritura('partidas', 'INSERT', creada.id, req.body.puestoOrigen);
    res.status(201).json(creada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cierre manual de una partida (Fase 0 punto 3: rara vez llega a 0 kg exactos
// por mermas, asi que el cierre es un gesto explicito, no automatico).
router.post('/:id/cerrar', async (req, res) => {
  try {
    const cerrada = await prisma.partida.update({
      where: { id: Number(req.params.id) },
      data: {
        cerradaManual: true,
        cerradaEn: new Date(),
        cerradaPor: req.body.cerradaPor || null,
      },
    });
    await registrarEscritura('partidas', 'UPDATE', cerrada.id, req.body.puestoOrigen);
    res.json(cerrada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
