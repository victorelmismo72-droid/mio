// Traspasos internos a Zaragoza. Mismo patron que pedidos (cabecera +
// lineas, numero por secuencia real, peso con expresion, partida elegida a
// mano con reparto entre varias si hace falta) - reescrito el 24/11/2026,
// hasta ahora esta ruta solo guardaba tal cual lo que mandaba el cliente
// HTTP, sin ningun calculo ni validacion real (hueco de la Fase 1, nunca
// actualizado a los criterios de Fase 2).
//
// "base"/"total" (ver el comentario en Traspaso, schema.prisma - corregido
// tras leer el HTML real vigente el 24/11/2026, la primera version de esta
// ruta asumia "a coste" y era incorrecta): un traspaso no es una venta
// (Fase 0 punto 3/9), pero SI lleva un "precio" por linea - un valor
// ESTIMADO, no fiscal, tecleado por Victor (con el PVP1 del articulo como
// valor de partida en el frontend) - total de linea = peso*precio, igual
// de "siempre en vivo" que en compras/pedidos: el total de cada linea lo
// calcula el servidor, nunca se acepta ya calculado del cliente HTTP.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');
const { conFechaNormalizada } = require('../fechas');
const { evaluarExpresionPeso } = require('../ivaVentas');
const { elegirPartidaParaTraspaso } = require('../margenPartida');

const router = express.Router();

// Resuelve la partida (o el reparto entre varias) de cada linea del
// traspaso - mismo contrato que autoAsignarPartidasLineas en
// routes/pedidos.js (ver ese fichero para la explicacion completa):
// `partidas: [{numeroPartida, kilos}]` elegido a mano, o `partidaNumero`
// suelto (compatibilidad), o nada (autoasignacion como red de seguridad), o
// `partidaNumero: null` explicito (clave presente, valor null) para forzar
// "sin partida" sin autoasignar. "reservas" evita que dos lineas del MISMO
// traspaso sin grabar todavia se lleven los mismos kilos dos veces.
async function resolverPartidasLineas(lineas, reservas) {
  const mapaReservas = reservas || new Map();
  const resultado = [];
  for (const l of lineas || []) {
    const partidasElegidas = Array.isArray(l.partidas) ? l.partidas.filter((p) => p && p.numeroPartida != null) : [];
    if (partidasElegidas.length) {
      for (const p of partidasElegidas) {
        const numeroPartida = Number(p.numeroPartida);
        mapaReservas.set(numeroPartida, (mapaReservas.get(numeroPartida) || 0) + (Number(p.kilos) || 0));
      }
      resultado.push({ ...l, partidaNumero: Number(partidasElegidas[0].numeroPartida), partidas: partidasElegidas });
      continue;
    }
    if (l.partidaNumero != null && l.partidaNumero !== '') {
      mapaReservas.set(Number(l.partidaNumero), (mapaReservas.get(Number(l.partidaNumero)) || 0) + (Number(l.peso) || 0));
      resultado.push(l);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(l, 'partidaNumero') && (l.partidaNumero === null || l.partidaNumero === '')) {
      resultado.push(l);
      continue;
    }
    if (!l.articuloId) { resultado.push(l); continue; }
    const { partidaNumero } = await elegirPartidaParaTraspaso({ articuloId: l.articuloId, pesoNecesario: l.peso }, mapaReservas);
    if (partidaNumero != null) {
      mapaReservas.set(partidaNumero, (mapaReservas.get(partidaNumero) || 0) + (Number(l.peso) || 0));
    }
    resultado.push({ ...l, partidaNumero });
  }
  return resultado;
}

// Igual que datosLineaParaCrear en routes/pedidos.js: el caso normal (una
// sola partida, o ninguna) no crea ninguna fila en traspaso_linea_partidas;
// los kilos de la ULTIMA partida del reparto se recalculan aqui mismo como
// "lo que falte hasta el peso de la linea", nunca se guardan tal cual.
function datosLineaParaCrear(l) {
  const { partidas, ...datos } = l;
  if (Array.isArray(partidas) && partidas.length > 1) {
    const filas = partidas.map((p, i) => ({ orden: i, numeroPartida: Number(p.numeroPartida), kilos: Number(p.kilos) || 0 }));
    const sumaSalvoUltima = filas.slice(0, -1).reduce((s, p) => s + p.kilos, 0);
    filas[filas.length - 1].kilos = Math.max(0, (Number(datos.peso) || 0) - sumaSalvoUltima);
    datos.partidas = { create: filas };
  }
  return datos;
}

async function prepararTraspaso({ lineas }) {
  const lineasPeso = (lineas || []).map((l) => {
    const peso = evaluarExpresionPeso(l.peso);
    if (Number.isNaN(peso)) {
      throw new Error(`El valor de Peso no es válido: "${l.peso}" (puede ser un número o una suma, ej. "12+13.5").`);
    }
    return { ...l, peso };
  });

  const lineasConPartida = await resolverPartidasLineas(lineasPeso);
  let totalKg = 0;
  let base = 0;
  const lineasFinal = lineasConPartida.map((l) => {
    const peso = Number(l.peso) || 0;
    const precio = Number(l.precio) || 0;
    const total = peso * precio;
    totalKg += peso;
    base += total;
    return { ...l, precio, total };
  });

  return { totalKg, base, total: base, lineas: lineasFinal.map(datosLineaParaCrear) };
}

const INCLUDE_LINEAS_CON_PARTIDAS = { lineas: { include: { partidas: { orderBy: { orden: 'asc' } } } } };

router.get('/', async (req, res) => {
  const traspasos = await prisma.traspaso.findMany({
    include: INCLUDE_LINEAS_CON_PARTIDAS,
    orderBy: { id: 'asc' },
  });
  res.json(traspasos);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  const traspaso = await prisma.traspaso.findUnique({
    where: { id },
    include: INCLUDE_LINEAS_CON_PARTIDAS,
  });
  if (!traspaso) return res.status(404).json({ error: 'No existe ese traspaso' });
  res.json(traspaso);
});

router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /traspasos', async () => {
      const { lineas, idempotencyKey, totalKg, base, total, ...cabecera } = req.body;
      if (cabecera.numero == null || cabecera.numero === '') delete cabecera.numero;
      else cabecera.numero = Number(cabecera.numero);
      cabecera.palets = Math.max(0, Math.round(Number(cabecera.palets) || 0));
      const preparado = await prepararTraspaso({ lineas });
      let creado;
      try {
        creado = await prisma.traspaso.create({
          data: {
            ...conFechaNormalizada(cabecera),
            totalKg: preparado.totalKg,
            base: preparado.base,
            total: preparado.total,
            lineas: { create: preparado.lineas },
          },
          include: INCLUDE_LINEAS_CON_PARTIDAS,
        });
      } catch (err) {
        if (err.code === 'P2002') throw new Error(`Ya existe un traspaso con el número ${cabecera.numero}. Déjalo en blanco para que se asigne uno automáticamente.`);
        throw err;
      }
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
    const { lineas, totalKg, base, total, ...cabecera } = req.body;
    if (cabecera.numero === '') delete cabecera.numero;
    else if (cabecera.numero != null) cabecera.numero = Number(cabecera.numero);
    cabecera.palets = Math.max(0, Math.round(Number(cabecera.palets) || 0));
    const preparado = await prepararTraspaso({ lineas });
    const actualizado = await prisma.$transaction(async (tx) => {
      await tx.traspasoLinea.deleteMany({ where: { traspasoId: id } });
      return tx.traspaso.update({
        where: { id },
        data: {
          ...conFechaNormalizada(cabecera),
          totalKg: preparado.totalKg,
          base: preparado.base,
          total: preparado.total,
          lineas: { create: preparado.lineas },
        },
        include: INCLUDE_LINEAS_CON_PARTIDAS,
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
