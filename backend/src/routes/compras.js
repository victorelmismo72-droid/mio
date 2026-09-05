// Compras = "dato sagrado" (ver FASE_0 punto 3 y FASE_1 punto 3): una vez
// creada una compra, NUNCA se debe poder modificar ni borrar. Por eso este
// router SOLO define GET y POST - no existe ninguna ruta PUT ni DELETE para
// /compras, ni siquiera por error: si alguien intenta editar una compra
// tendria que hacerlo llamando a una ruta que no existe.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');

const router = express.Router();

router.get('/', async (req, res) => {
  const compras = await prisma.compra.findMany({
    include: { lineas: true, proveedor: true },
    orderBy: { id: 'asc' },
  });
  res.json(compras);
});

router.get('/:id', async (req, res) => {
  const compra = await prisma.compra.findUnique({
    where: { id: Number(req.params.id) },
    include: { lineas: true, proveedor: true },
  });
  if (!compra) return res.status(404).json({ error: 'No existe esa compra' });
  res.json(compra);
});

// Crea la compra y sus lineas en una unica transaccion: o se guardan las dos
// cosas, o no se guarda nada (nunca una compra a medias).
router.post('/', async (req, res) => {
  try {
    const { lineas, ...cabecera } = req.body;
    const creada = await prisma.compra.create({
      data: {
        ...cabecera,
        lineas: { create: lineas || [] },
      },
      include: { lineas: true },
    });
    await registrarEscritura('compras', 'INSERT', creada.id, cabecera.puestoOrigen);
    res.status(201).json(creada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
