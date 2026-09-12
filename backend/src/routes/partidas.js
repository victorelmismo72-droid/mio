// Partidas: en esta fase (solo almacenamiento) NO hay logica de asignacion
// de margen ni de kilos disponibles (eso es Fase 2). Aqui solo se guarda el
// estado real de cierre manual. Por eso no hay una ruta PUT generica -
// solo una ruta especifica para "cerrar", que es la unica escritura que
// tiene sentido hacer aqui.
//
// Importante (ver prisma/schema.prisma): una partida NO es 1:1 con una
// compra - un numero_partida puede agrupar varias filas de `compras` (mismo
// proveedor, mismo dia). Por eso aqui se buscan las compras relacionadas por
// numeroPartida, no por una relacion directa.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');

const router = express.Router();

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
