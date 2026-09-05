// Pedidos (albaranes de venta). A diferencia de compras, en esta fase si se
// permite editar y borrar (util para corregir un pedido recien introducido) -
// la garantia de inmutabilidad solo aplica a compras (Fase 0 punto 3). Mas
// adelante, en la Fase 4, un pedido ya facturado pasara a ser inmutable
// tambien, pero eso no se implementa aqui todavia.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');

const router = express.Router();

router.get('/', async (req, res) => {
  const pedidos = await prisma.pedido.findMany({
    include: { lineas: true, cliente: true },
    orderBy: { id: 'asc' },
  });
  res.json(pedidos);
});

router.get('/:id', async (req, res) => {
  const pedido = await prisma.pedido.findUnique({
    where: { id: Number(req.params.id) },
    include: { lineas: true, cliente: true },
  });
  if (!pedido) return res.status(404).json({ error: 'No existe ese pedido' });
  res.json(pedido);
});

router.post('/', async (req, res) => {
  try {
    const { lineas, ...cabecera } = req.body;
    const creado = await prisma.pedido.create({
      data: {
        ...cabecera,
        lineas: { create: lineas || [] },
      },
      include: { lineas: true },
    });
    await registrarEscritura('pedidos', 'INSERT', creado.id, cabecera.puestoOrigen);
    res.status(201).json(creado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Actualiza cabecera y sustituye por completo las lineas (borra las
// anteriores y crea las nuevas), todo dentro de una misma transaccion.
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { lineas, ...cabecera } = req.body;
    const actualizado = await prisma.$transaction(async (tx) => {
      await tx.pedidoLinea.deleteMany({ where: { pedidoId: id } });
      return tx.pedido.update({
        where: { id },
        data: {
          ...cabecera,
          lineas: { create: lineas || [] },
        },
        include: { lineas: true },
      });
    });
    await registrarEscritura('pedidos', 'UPDATE', id, req.body.puestoOrigen);
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.pedidoLinea.deleteMany({ where: { pedidoId: id } });
      await tx.pedido.delete({ where: { id } });
    });
    await registrarEscritura('pedidos', 'DELETE', id, req.query.puestoOrigen);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
