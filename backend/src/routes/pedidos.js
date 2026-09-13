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
const { calcularIvaPedido, calcularTotalLineaPedido } = require('../ivaVentas');
const { conFechaNormalizada } = require('../fechas');

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

// Prepara un pedido completo antes de grabarlo (Fase 2, punto 3): el total
// de cada linea y el IVA/Recargo de Equivalencia del pedido se calculan EN
// VIVO en el servidor a partir del cliente tal como esta ahora mismo en la
// base de datos - igual que ya se hace en compras (calculoCompra.js) - en
// vez de aceptar baseImponible/iva/total/tipoIvaAplicado ya calculados
// desde el cliente HTTP.
async function prepararPedido({ lineas, clienteId }) {
  const cliente = await prisma.cliente.findUnique({ where: { id: Number(clienteId) } });
  if (!cliente) throw new Error(`No existe ningún cliente con id ${clienteId}.`);

  const lineasConPartida = await autoAsignarPartidasLineas(lineas);
  const lineasFinal = [];
  for (const l of lineasConPartida) {
    const total = calcularTotalLineaPedido({ peso: l.peso, precio: l.precio, descuento: l.descuento });
    let ivaPct = l.ivaPct;
    if (ivaPct == null && l.articuloId) {
      const articulo = await prisma.articulo.findUnique({ where: { id: Number(l.articuloId) } });
      ivaPct = articulo ? articulo.ivaPct : 10;
    }
    lineasFinal.push({ ...l, total, ivaPct: ivaPct ?? 10 });
  }

  const baseImponible = lineasFinal.reduce((s, l) => s + l.total, 0);
  const r = calcularIvaPedido(baseImponible, cliente.tipoIva);

  return {
    clienteNombreSnapshot: cliente.nombre,
    clienteCifSnapshot: cliente.cif,
    clienteDirSnapshot: cliente.direccion,
    clientePobSnapshot: cliente.poblacion,
    clienteTelSnapshot: cliente.telefono,
    tipoIvaAplicado: cliente.tipoIva,
    baseImponible,
    iva: r.iva,
    total: r.total,
    lineas: lineasFinal,
  };
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
      const {
        lineas, idempotencyKey,
        clienteNombreSnapshot, clienteCifSnapshot, clienteDirSnapshot, clientePobSnapshot, clienteTelSnapshot,
        tipoIvaAplicado, baseImponible, iva, total,
        ...cabecera
      } = req.body;
      const preparado = await prepararPedido({ lineas, clienteId: cabecera.clienteId });
      const creado = await prisma.pedido.create({
        data: {
          ...conFechaNormalizada(cabecera),
          clienteNombreSnapshot: preparado.clienteNombreSnapshot,
          clienteCifSnapshot: preparado.clienteCifSnapshot,
          clienteDirSnapshot: preparado.clienteDirSnapshot,
          clientePobSnapshot: preparado.clientePobSnapshot,
          clienteTelSnapshot: preparado.clienteTelSnapshot,
          tipoIvaAplicado: preparado.tipoIvaAplicado,
          baseImponible: preparado.baseImponible,
          iva: preparado.iva,
          total: preparado.total,
          lineas: { create: preparado.lineas },
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
    const {
      lineas,
      clienteNombreSnapshot, clienteCifSnapshot, clienteDirSnapshot, clientePobSnapshot, clienteTelSnapshot,
      tipoIvaAplicado, baseImponible, iva, total,
      ...cabecera
    } = req.body;
    const preparado = await prepararPedido({ lineas, clienteId: cabecera.clienteId });
    const actualizado = await prisma.$transaction(async (tx) => {
      await tx.pedidoLinea.deleteMany({ where: { pedidoId: id } });
      return tx.pedido.update({
        where: { id },
        data: {
          ...conFechaNormalizada(cabecera),
          clienteNombreSnapshot: preparado.clienteNombreSnapshot,
          clienteCifSnapshot: preparado.clienteCifSnapshot,
          clienteDirSnapshot: preparado.clienteDirSnapshot,
          clientePobSnapshot: preparado.clientePobSnapshot,
          clienteTelSnapshot: preparado.clienteTelSnapshot,
          tipoIvaAplicado: preparado.tipoIvaAplicado,
          baseImponible: preparado.baseImponible,
          iva: preparado.iva,
          total: preparado.total,
          lineas: { create: preparado.lineas },
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
