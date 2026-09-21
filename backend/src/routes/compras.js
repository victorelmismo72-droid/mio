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
const { calcularLineaCompra, sumarTotalesCompra } = require('../calculoCompra');

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
// El cliente SOLO manda datos crudos por linea (articuloId, cajas, kilos,
// precioKg, control) - el servidor calcula baseZgz/2%OP/IVA/total EN VIVO
// (ver calculoCompra.js), consultando el proveedor tal como esta AHORA MISMO
// en la base de datos. No se acepta ningun importe ya calculado desde fuera:
// esa es justo la regla critica de Fase 0 punto 2 / Fase 2 punto 1 ("nunca
// como formula congelada, siempre en vivo") - si se aceptara un baseReal/iva
// ya calculado del cliente, un frontend con la formula desactualizada podria
// grabar una compra con el 2% de OP o el IVA equivocados sin que el servidor
// lo notara.
//
// El numero de partida tampoco lo envia el cliente: lo calcula el servidor
// (ver asignacionPartida.js) a partir de fecha+proveedorId, reutilizando la
// partida "de siempre" de ese dia+proveedor salvo que se pida explicitamente
// una nueva (partidaNueva:true) o una ya existente concreta (partidaElegida).
router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /compras', async () => {
      const { lineas, fecha, proveedorId, albaranProveedor, puestoOrigen, partidaNueva, partidaElegida } = req.body;

      const proveedor = await prisma.proveedor.findUnique({ where: { id: Number(proveedorId) } });
      if (!proveedor) throw new Error(`No existe ningún proveedor con id ${proveedorId}.`);
      if (!Array.isArray(lineas) || !lineas.length) throw new Error('La compra necesita al menos una línea.');

      const fechaCompra = new Date(fecha);
      const numeroPartida = await resolverPartidaParaCompra({
        fecha: fechaCompra,
        proveedorId: proveedor.id,
        partidaNueva,
        partidaElegida,
      });

      const lineasCalculadas = lineas.map((l) => {
        const calc = calcularLineaCompra({ kilos: l.kilos, precioKg: l.precioKg, proveedor });
        return {
          articuloId: l.articuloId,
          cajas: l.cajas != null && l.cajas !== '' ? Number(l.cajas) : null,
          precioKg: Number(l.precioKg),
          control: !!l.control,
          ...calc,
        };
      });
      const totales = sumarTotalesCompra(lineasCalculadas);

      const creada = await prisma.compra.create({
        data: {
          numeroPartida,
          fecha: fechaCompra,
          albaranProveedor: albaranProveedor || null,
          proveedorId: proveedor.id,
          proveedorNombreSnapshot: proveedor.nombre,
          puestoOrigen,
          totalKilos: totales.totalKilos,
          totalBaseZgz: totales.totalBaseZgz,
          totalBaseReal: totales.totalBaseReal,
          totalIva: totales.totalIva,
          totalFactura: totales.totalFactura,
          lineas: { create: lineasCalculadas },
        },
        include: { lineas: true },
      });
      await registrarEscritura('compras', 'INSERT', creada.id, puestoOrigen);
      return { statusHttp: 201, cuerpo: creada };
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
