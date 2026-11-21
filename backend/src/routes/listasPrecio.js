// Listas de precio (Mayoristas/Pescaderias). Independientes entre si por
// tipo+fecha (restriccion UNIQUE en el esquema) - ver FASE_0 punto 5.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');
const { costeRealActual } = require('../margenPartida');
const { conFechaNormalizada } = require('../fechas');

const router = express.Router();

function validarLineas(lineas) {
  for (const l of lineas || []) {
    if (l.articuloId == null && !l.descripcionLibre) {
      throw new Error('Cada línea necesita un "articuloId" del catálogo o una "descripcionLibre" (modo manual con texto suelto).');
    }
  }
}

router.get('/', async (req, res) => {
  const listas = await prisma.listaPrecio.findMany({
    include: { lineas: true },
    orderBy: { id: 'asc' },
  });
  res.json(listas);
});

// Modo automático (Fase 2 punto 5, equivalente a construirListaPreciosHoy()
// del HTML): coste medio del día para cada artículo comprado esa fecha
// (ponderado por kilos si se compró más de una vez, a distinto proveedor o
// precio) más el margen fijo de referencia de 1,70 €/kg que ya usa el
// programa actual para esta pantalla en concreto (distinto del margen
// mínimo de 1,30 €/kg de la asignación de partida a ventas, ver punto 4 -
// esta es una tabla orientativa para mandar a clientes, no una venta).
// IMPORTANTE: ruta especifica antes de "/:id" mas abajo, mismo motivo que
// en compras.js.
router.get('/auto', async (req, res) => {
  const MARGEN_LISTA_AUTO = 1.70;
  const fecha = req.query.fecha ? new Date(req.query.fecha) : new Date(new Date().toDateString());
  const compras = await prisma.compra.findMany({
    where: { fecha },
    include: { lineas: { include: { articulo: true } } },
  });
  const porArticulo = new Map();
  for (const compra of compras) {
    for (const l of compra.lineas) {
      const kilos = Number(l.kilos) || 0;
      const coste = Number(l.precioKg) || 0;
      if (!porArticulo.has(l.articuloId)) {
        porArticulo.set(l.articuloId, { articuloId: l.articuloId, descripcion: l.articulo.descripcion, totalKg: 0, totalBase: 0 });
      }
      const acc = porArticulo.get(l.articuloId);
      acc.totalKg += kilos;
      acc.totalBase += kilos * coste;
    }
  }
  const productos = Array.from(porArticulo.values()).map((p) => {
    const costeMedio = p.totalKg > 0 ? p.totalBase / p.totalKg : 0;
    return { articuloId: p.articuloId, descripcion: p.descripcion, costeMedio, precioSugerido: costeMedio + MARGEN_LISTA_AUTO };
  });
  res.json({ fecha: fecha.toISOString().slice(0, 10), productos });
});

// Punto de partida para el modo manual (Fase 2 punto 5, equivalente a
// cargarListaManual() del HTML): si la lista propia de este tipo+fecha ya
// tiene líneas, se devuelven esas. Si está vacía todavía, se copian como
// plantilla las líneas de la OTRA lista (Mayorista/Pescadería) de la misma
// fecha, si la tiene - así no hay que escribir los mismos productos dos
// veces, pero cada lista sigue siendo independiente una vez guardada (ver
// Fase 0 punto 5): esto solo sugiere un punto de partida, no las enlaza.
router.get('/plantilla', async (req, res) => {
  const { tipo, fecha } = req.query;
  if (!tipo || !fecha) return res.status(400).json({ error: 'Faltan los parámetros "tipo" y "fecha".' });
  const fechaDate = new Date(fecha);
  const propia = await prisma.listaPrecio.findUnique({
    where: { tipo_fecha: { tipo, fecha: fechaDate } },
    include: { lineas: true },
  });
  if (propia && propia.lineas.length) {
    return res.json({ origen: 'PROPIA', lineas: propia.lineas });
  }
  const otroTipo = tipo === 'PESCADERIA' ? 'MAYORISTA' : 'PESCADERIA';
  const delaOtra = await prisma.listaPrecio.findUnique({
    where: { tipo_fecha: { tipo: otroTipo, fecha: fechaDate } },
    include: { lineas: true },
  });
  if (delaOtra && delaOtra.lineas.length) {
    return res.json({ origen: 'COPIADA_DE_OTRA', copiadaDe: otroTipo, lineas: delaOtra.lineas });
  }
  res.json({ origen: 'VACIA', lineas: [] });
});

// Coste real "de ahora mismo" de un artículo (Fase 2 punto 5, aviso de
// venta por debajo de coste): media ponderada de las partidas disponibles,
// no un número tecleado a mano que puede estar desactualizado - ver
// margenPartida.js. null si no hay ninguna partida disponible todavía.
router.get('/coste-referencia', async (req, res) => {
  const { articuloId } = req.query;
  if (!articuloId) return res.status(400).json({ error: 'Falta el parámetro "articuloId".' });
  try {
    const coste = await costeRealActual(Number(articuloId));
    res.json({ articuloId: Number(articuloId), costeReal: coste });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  const lista = await prisma.listaPrecio.findUnique({
    where: { id },
    include: { lineas: true },
  });
  if (!lista) return res.status(404).json({ error: 'No existe esa lista de precio' });
  res.json(lista);
});

router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /listas-precio', async () => {
      const { lineas, idempotencyKey, ...cabecera } = req.body;
      validarLineas(lineas);
      const creada = await prisma.listaPrecio.create({
        data: { ...conFechaNormalizada(cabecera), lineas: { create: lineas || [] } },
        include: { lineas: true },
      });
      await registrarEscritura('listas_precio', 'INSERT', creada.id, cabecera.puestoOrigen);
      return { statusHttp: 201, cuerpo: creada };
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
    validarLineas(lineas);
    const actualizada = await prisma.$transaction(async (tx) => {
      await tx.listaPrecioLinea.deleteMany({ where: { listaPrecioId: id } });
      return tx.listaPrecio.update({
        where: { id },
        data: { ...conFechaNormalizada(cabecera), lineas: { create: lineas || [] } },
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
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
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
