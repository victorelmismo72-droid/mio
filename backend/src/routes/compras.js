// Compras = "dato sagrado" (ver FASE_0 punto 3 y FASE_1 punto 3): una vez
// creada una compra, NUNCA se debe poder modificar ni borrar. Por eso este
// router SOLO define GET y POST - no existe ninguna ruta PUT ni DELETE para
// /compras, ni siquiera por error: si alguien intenta editar una compra
// tendria que hacerlo llamando a una ruta que no existe.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');
const { resolverPartidaParaCompra, listarPartidasDelDia } = require('../asignacionPartida');

const router = express.Router();

router.get('/', async (req, res) => {
  const compras = await prisma.compra.findMany({
    include: { lineas: true, proveedor: true },
    orderBy: { id: 'asc' },
  });
  res.json(compras);
});

// IMPORTANTE: esta ruta especifica ("partidas-del-dia") tiene que declararse
// ANTES que "/:id" mas abajo - si no, Express interpretaria "partidas-del-dia"
// como si fuera un id (fallo real encontrado el 12/09/2026: al probar esto
// en el orden contrario, un id no numerico llegaba sin querer hasta Prisma y
// tiraba todo el servidor - ver tambien express-async-errors en index.js,
// que evita que esa clase de fallo vuelva a tirar el proceso aunque se
// cuele una ruta mal ordenada como esta).
//
// Que partidas existen ya para un dia+proveedor, para poder elegir a cual va
// una compra nueva cuando ya hay mas de una (por una excepcion anterior) -
// ver FASE_2, asignacion automatica del numero de partida.
router.get('/partidas-del-dia', async (req, res) => {
  const { fecha, proveedorId } = req.query;
  if (!fecha || !proveedorId) {
    return res.status(400).json({ error: 'Faltan los parámetros "fecha" y "proveedorId".' });
  }
  const partidas = await listarPartidasDelDia(new Date(fecha), Number(proveedorId));
  res.json(partidas);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id de la compra debe ser un número entero.' });
  const compra = await prisma.compra.findUnique({
    where: { id },
    include: { lineas: true, proveedor: true },
  });
  if (!compra) return res.status(404).json({ error: 'No existe esa compra' });
  res.json(compra);
});

// Crea la compra y sus lineas en una unica transaccion: o se guardan las dos
// cosas, o no se guarda nada (nunca una compra a medias).
//
// El numero de partida NO lo envia el cliente: lo calcula el servidor (ver
// asignacionPartida.js) a partir de fecha+proveedorId, reutilizando la
// partida "de siempre" de ese dia+proveedor salvo que se pida explicitamente
// una nueva (partidaNueva:true) o una ya existente concreta (partidaElegida).
router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /compras', async () => {
      const { lineas, idempotencyKey, partidaNueva, partidaElegida, ...cabecera } = req.body;
      const numeroPartida = await resolverPartidaParaCompra({
        fecha: new Date(cabecera.fecha),
        proveedorId: cabecera.proveedorId,
        partidaNueva,
        partidaElegida,
      });
      const creada = await prisma.compra.create({
        data: {
          ...cabecera,
          numeroPartida,
          lineas: { create: lineas || [] },
        },
        include: { lineas: true },
      });
      await registrarEscritura('compras', 'INSERT', creada.id, cabecera.puestoOrigen);
      return { statusHttp: 201, cuerpo: creada };
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
