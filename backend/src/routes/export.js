// Endpoint de exportacion (Fase 1, punto 3): genera un JSON con todas las
// tablas, pensado para poder comparar facilmente contra el backup JSON
// original del programa actual durante la migracion/verificacion.
const express = require('express');
const { prisma } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const [
    clientes,
    proveedores,
    articulos,
    compras,
    partidas,
    pedidos,
    traspasos,
    repartos,
    listasPrecio,
  ] = await Promise.all([
    prisma.cliente.findMany(),
    prisma.proveedor.findMany(),
    prisma.articulo.findMany(),
    prisma.compra.findMany({ include: { lineas: true } }),
    prisma.partida.findMany(),
    prisma.pedido.findMany({ include: { lineas: true } }),
    prisma.traspaso.findMany({ include: { lineas: true } }),
    prisma.reparto.findMany({ include: { lineas: true } }),
    prisma.listaPrecio.findMany({ include: { lineas: true } }),
  ]);

  res.json({
    generadoEn: new Date().toISOString(),
    clientes,
    proveedores,
    articulos,
    compras,
    partidas,
    pedidos,
    traspasos,
    repartos,
    listasPrecio,
  });
});

module.exports = router;
