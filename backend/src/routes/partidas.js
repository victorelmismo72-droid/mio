// Partidas: solo se guarda aqui el estado real de cierre manual. Por eso no
// hay una ruta PUT generica - solo una ruta especifica para "cerrar", que
// es la unica escritura que tiene sentido hacer aqui. El calculo de kilos
// disponibles y margen (Fase 2, punto 4) vive en ../margenPartida.js y se
// expone en GET /disponibles, mas abajo.
//
// Importante (ver prisma/schema.prisma): una partida NO es 1:1 con una
// compra - un numero_partida puede agrupar varias filas de `compras` (mismo
// proveedor, mismo dia). Por eso aqui se buscan las compras relacionadas por
// numeroPartida, no por una relacion directa.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');
const { obtenerPartidasDisponibles, MARGEN_MINIMO_PARTIDA } = require('../margenPartida');

const router = express.Router();

// Partidas disponibles para un articulo, con el margen ya calculado si se
// pasa un precio de venta (para construir el desplegable de "elegir
// partida" en la pantalla de pedidos, igual que construirOpcionesPartida en
// el HTML). IMPORTANTE: esta ruta especifica va ANTES de "/:id" mas abajo -
// ver la nota de compras.js sobre el fallo real de orden de rutas del
// 12/09/2026 (si fuera despues, Express intentaria leer "disponibles" como
// si fuera el id).
router.get('/disponibles', async (req, res) => {
  const { articuloId, precioVenta } = req.query;
  if (!articuloId) return res.status(400).json({ error: 'Falta el parámetro "articuloId".' });
  try {
    const disponibles = await obtenerPartidasDisponibles(Number(articuloId));
    const precio = precioVenta != null ? Number(precioVenta) : null;
    const conMargen = disponibles.map((p) => ({
      ...p,
      margen: precio != null ? precio - p.coste : null,
      cumpleMargen: precio != null ? precio - p.coste >= MARGEN_MINIMO_PARTIDA : null,
    }));
    res.json({ margenMinimo: MARGEN_MINIMO_PARTIDA, disponibles: conMargen });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function conComprasRelacionadas(partida) {
  const compras = await prisma.compra.findMany({
    where: { numeroPartida: partida.numeroPartida },
    include: { lineas: true },
  });
  return { ...partida, compras };
}

router.get('/', async (req, res) => {
  const partidas = await prisma.partida.findMany({ orderBy: { id: 'asc' } });
  const conCompras = await Promise.all(partidas.map(conComprasRelacionadas));
  res.json(conCompras);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  const partida = await prisma.partida.findUnique({ where: { id } });
  if (!partida) return res.status(404).json({ error: 'No existe esa partida' });
  res.json(await conComprasRelacionadas(partida));
});

router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /partidas', async () => {
      // numeroPartida NUNCA lo envia el cliente aqui tampoco: lo genera la
      // secuencia de la base de datos (ver Fase 2, asignacionPartida.js).
      const { idempotencyKey, numeroPartida, ...datos } = req.body;
      const creada = await prisma.partida.create({ data: datos });
      await registrarEscritura('partidas', 'INSERT', creada.id, datos.puestoOrigen);
      return { statusHttp: 201, cuerpo: creada };
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ajusta el proximo numero de partida que se va a asignar (equivalente al
// boton "🔢 Próxima partida" del HTML actual) - util para sincronizar la
// numeracion con el Excel al arrancar el sistema nuevo, o si alguna vez hay
// que corregir el contador a mano. No lleva proteccion de idempotencia: es
// una accion administrativa puntual, no un alta de documento por lote.
router.post('/ajustar-siguiente-numero', async (req, res) => {
  const siguiente = Number(req.body.siguienteNumero);
  if (!siguiente || siguiente < 1) {
    return res.status(400).json({ error: 'Falta "siguienteNumero" (entero positivo) en el cuerpo de la petición.' });
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE partidas_numero_partida_seq RESTART WITH ${siguiente}`);
    await registrarEscritura('partidas', 'AJUSTAR_SIGUIENTE_NUMERO', null, req.body.puestoOrigen);
    res.json({ ok: true, siguienteNumero: siguiente });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cierre manual de una partida (Fase 0 punto 3: rara vez llega a 0 kg exactos
// por mermas, asi que el cierre es un gesto explicito, no automatico). No
// lleva proteccion de idempotencia: a diferencia de crear un documento nuevo
// (donde un doble clic genera dos registros distintos), cerrar dos veces la
// MISMA partida no duplica nada - el segundo cierre solo repite el mismo
// estado (cerradaManual=true), es inofensivo por si mismo.
router.post('/:id/cerrar', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  try {
    const cerrada = await prisma.partida.update({
      where: { id },
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
