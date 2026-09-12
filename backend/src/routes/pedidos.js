// Pedidos (albaranes de venta). A diferencia de compras, en esta fase si se
// permite editar y borrar (util para corregir un pedido recien introducido) -
// la garantia de inmutabilidad solo aplica a compras (Fase 0 punto 3). Mas
// adelante, en la Fase 4, un pedido ya facturado pasara a ser inmutable
// tambien, pero eso no se implementa aqui todavia.
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');
const { elegirPartidaParaVenta } = require('../margenPartida');

const router = express.Router();

// Para cada linea sin partidaNumero explicito (el cliente NO ha elegido a
// mano), intenta asignar automaticamente la partida mas antigua que llegue
// al margen minimo (ver Fase 2 punto 4, margenPartida.js). Si el cliente ya
// mando un partidaNumero (asignacion manual), nunca se toca - igual que
// "_partidaManual" en el HTML. Si ninguna partida disponible llega al
// margen, la linea queda sin partida (excepcion pendiente de revision
// manual), nunca se fuerza una que no cumple.
async function autoAsignarPartidasLineas(lineas) {
  const resultado = [];
  for (const l of lineas || []) {
    if (l.partidaNumero != null && l.partidaNumero !== '') {
      resultado.push(l);
      continue;
    }
    if (!l.articuloId) { resultado.push(l); continue; }
    const { partidaNumero } = await elegirPartidaParaVenta({ articuloId: l.articuloId, precioVenta: l.precio });
    resultado.push({ ...l, partidaNumero });
  }
  return resultado;
}

router.get('/', async (req, res) => {
  const pedidos = await prisma.pedido.findMany({
    include: { lineas: true, cliente: true },
    orderBy: { id: 'asc' },
  });
  res.json(pedidos);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { lineas: true, cliente: true },
  });
  if (!pedido) return res.status(404).json({ error: 'No existe ese pedido' });
  res.json(pedido);
});

router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /pedidos', async () => {
      const { lineas, idempotencyKey, ...cabecera } = req.body;
      const lineasConPartida = await autoAsignarPartidasLineas(lineas);
      const creado = await prisma.pedido.create({
        data: {
          ...cabecera,
          lineas: { create: lineasConPartida },
        },
        include: { lineas: true },
      });
      await registrarEscritura('pedidos', 'INSERT', creado.id, cabecera.puestoOrigen);
      return { statusHttp: 201, cuerpo: creado };
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Actualiza cabecera y sustituye por completo las lineas (borra las
// anteriores y crea las nuevas), todo dentro de una misma transaccion.
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  try {
    const { lineas, ...cabecera } = req.body;
    const lineasConPartida = await autoAsignarPartidasLineas(lineas);
    const actualizado = await prisma.$transaction(async (tx) => {
      await tx.pedidoLinea.deleteMany({ where: { pedidoId: id } });
      return tx.pedido.update({
        where: { id },
        data: {
          ...cabecera,
          lineas: { create: lineasConPartida },
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

// Equivalente a "📦 ASIGNAR PARTIDAS DE HOY" del HTML actual
// (asignarPartidasDelDia): recorre TODOS los pedidos de una fecha y, a cada
// linea sin partida asignada, le busca la mejor disponible. Las lineas
// donde ninguna partida llega al margen minimo se devuelven en
// "pendientes" para que el usuario las resuelva a mano (ver
// PATCH /pedidos/lineas/:id/partida), en vez de tener que revisar pedido a
// pedido. Importante: esta ruta especifica va ANTES de "/:id" mas abajo -
// ver la nota de compras.js sobre el fallo real de orden de rutas del
// 12/09/2026.
router.post('/asignar-partidas-dia', async (req, res) => {
  try {
    const fecha = req.body.fecha ? new Date(req.body.fecha) : new Date(new Date().toDateString());
    const pedidos = await prisma.pedido.findMany({
      where: { fecha },
      include: { lineas: true },
    });

    let asignadasAuto = 0;
    let yaTenian = 0;
    let sinCompras = 0;
    const pendientes = [];

    for (const pedido of pedidos) {
      for (const linea of pedido.lineas) {
        if (linea.partidaNumero != null) { yaTenian++; continue; }
        const { partidaNumero, disponibles } = await elegirPartidaParaVenta({
          articuloId: linea.articuloId,
          precioVenta: linea.precio,
        });
        if (!disponibles.length) { sinCompras++; continue; }
        if (partidaNumero != null) {
          await prisma.pedidoLinea.update({ where: { id: linea.id }, data: { partidaNumero } });
          asignadasAuto++;
        } else {
          pendientes.push({
            pedidoLineaId: linea.id,
            pedidoId: pedido.id,
            pedidoNumero: pedido.numero,
            articuloId: linea.articuloId,
            descripcion: linea.descripcionEditada,
            precioVenta: Number(linea.precio) || 0,
            disponibles,
          });
        }
      }
    }

    res.json({ fecha: fecha.toISOString().slice(0, 10), asignadasAuto, yaTenian, sinCompras, pendientes });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Aplica a mano la partida elegida para una linea concreta que quedó como
// excepción (ninguna partida disponible llegaba al margen mínimo) — ver
// POST /asignar-partidas-dia. Ruta pequeña a propósito, en vez de obligar a
// reenviar todo el pedido por PUT solo para fijar una partida.
router.patch('/lineas/:id/partida', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id de la línea debe ser un número entero.' });
  const { partidaNumero } = req.body;
  if (partidaNumero == null) return res.status(400).json({ error: 'Falta "partidaNumero".' });
  try {
    const actualizada = await prisma.pedidoLinea.update({
      where: { id },
      data: { partidaNumero: Number(partidaNumero) },
    });
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
