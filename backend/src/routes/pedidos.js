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
const { calcularIvaPedido, calcularTotalLineaPedido, evaluarExpresionPeso } = require('../ivaVentas');
const { conFechaNormalizada } = require('../fechas');
const { normalizarAgencia } = require('../agencias');

const router = express.Router();

// Resuelve la partida (o el reparto entre varias) de cada linea del pedido.
//
// Actualizacion 24/11/2026 (ver Fase 2 punto 4, RESUMEN_COMPLETO_para_Code_
// 18-11-2026_7/8.md): la asignacion automatica y silenciosa en el servidor
// ya NO es el camino normal - en el HTML real, desde el 21/11, Victor elige
// la partida a mano en un desplegable al teclear el precio (y puede
// repartir una linea entre varias si ninguna cubre el peso entero). Esta
// pantalla reproduce ese mismo flujo (ver public/pedidos.js,
// abrirPopupPartida): el cliente HTTP manda, por cada linea, O BIEN
// `partidas: [{numeroPartida, kilos}, ...]` (lo que el usuario eligio a
// mano, una o varias), O BIEN `partidaNumero` suelto (compatibilidad,
// equivale a una sola partida), O BIEN nada en absoluto (lo que el
// servidor sigue pudiendo rellenar solo, ej. para /asignar-partidas-dia o
// un cliente HTTP que no implemente el desplegable todavia).
//
// "reservas" (equivale a "reservasLineasPed" del HTML real): dos lineas de
// ESTE MISMO pedido que pidan el mismo producto no deben poder llevarse los
// mismos kilos disponibles dos veces - cada linea, tenga partida elegida a
// mano o automatica, "reserva" sus kilos antes de procesar la siguiente,
// aunque ninguna de las dos este grabada todavia en la base de datos.
async function autoAsignarPartidasLineas(lineas, reservas) {
  const mapaReservas = reservas || new Map();
  const resultado = [];
  for (const l of lineas || []) {
    // Reparto elegido a mano (una o varias partidas) - no se recalcula,
    // pero SI reserva sus kilos para las demas lineas de este pedido.
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
    // "sin partida" elegido a mano de verdad (el popup manda la clave con
    // valor null a proposito, no la omite) - a diferencia de simplemente no
    // mandar nada, aqui NO se intenta autoasignar: el usuario ya decidio que
    // esta linea se quede como excepcion.
    if (Object.prototype.hasOwnProperty.call(l, 'partidaNumero') && (l.partidaNumero === null || l.partidaNumero === '')) {
      resultado.push(l);
      continue;
    }
    if (!l.articuloId) { resultado.push(l); continue; }
    const { partidaNumero } = await elegirPartidaParaVenta({ articuloId: l.articuloId, precioVenta: l.precio, pesoNecesario: l.peso }, mapaReservas);
    if (partidaNumero != null) {
      mapaReservas.set(partidaNumero, (mapaReservas.get(partidaNumero) || 0) + (Number(l.peso) || 0));
    }
    resultado.push({ ...l, partidaNumero });
  }
  return resultado;
}

// Convierte una linea ya resuelta (con `partidaNumero` y, si corresponde,
// `partidas`) en los datos que Prisma espera para `PedidoLinea.create`. El
// caso normal (una sola partida, o ninguna) NO crea ninguna fila en
// `pedido_linea_partidas` - solo se materializa cuando de verdad hay mas de
// una (ver el comentario de PedidoLineaPartida en schema.prisma).
//
// Los kilos de la ULTIMA fila (por orden) nunca son los que mande el
// cliente HTTP: se recalculan aqui mismo como "lo que falte hasta el peso
// de la linea" (mismo motivo que repartoPartidas() en margenPartida.js,
// pero resuelto YA al grabar en vez de en cada lectura - como un pedido se
// vuelve a crear entero en cada PUT, el valor guardado nunca puede quedar
// desincronizado del peso).
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

// Prepara un pedido completo antes de grabarlo (Fase 2, punto 3): el total
// de cada linea y el IVA/Recargo de Equivalencia del pedido se calculan EN
// VIVO en el servidor a partir del cliente tal como esta ahora mismo en la
// base de datos - igual que ya se hace en compras (calculoCompra.js) - en
// vez de aceptar baseImponible/iva/total/tipoIvaAplicado ya calculados
// desde el cliente HTTP.
async function prepararPedido({ lineas, clienteId }) {
  const cliente = await prisma.cliente.findUnique({ where: { id: Number(clienteId) } });
  if (!cliente) throw new Error(`No existe ningún cliente con id ${clienteId}.`);

  // El peso se evalúa UNA vez aquí, antes de nada más (puede venir como
  // expresión de texto, ej. "12+13.5" - ver evaluarExpresionPeso en
  // ivaVentas.js): tanto la asignación de partida/reservas como el total
  // de la línea deben usar el mismo número ya evaluado, nunca el texto
  // crudo (si no, "12+13.5" se leería como 0 kilos reservados).
  const lineasPeso = (lineas || []).map((l) => {
    const peso = evaluarExpresionPeso(l.peso);
    if (Number.isNaN(peso)) {
      throw new Error(`El valor de Peso no es válido: "${l.peso}" (puede ser un número o una suma, ej. "12+13.5").`);
    }
    return { ...l, peso };
  });

  const lineasConPartida = await autoAsignarPartidasLineas(lineasPeso);
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
    lineas: lineasFinal.map(datosLineaParaCrear),
  };
}

// `lineas.partidas` solo trae filas cuando esa linea esta repartida entre
// mas de una partida (ver datosLineaParaCrear mas arriba) - el caso normal
// (una sola partida) se lee tal cual de `partidaNumero`.
const INCLUDE_LINEAS_CON_PARTIDAS = { lineas: { include: { partidas: { orderBy: { orden: 'asc' } } } }, cliente: true };

router.get('/', async (req, res) => {
  const pedidos = await prisma.pedido.findMany({
    include: INCLUDE_LINEAS_CON_PARTIDAS,
    orderBy: { id: 'asc' },
  });
  res.json(pedidos);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: INCLUDE_LINEAS_CON_PARTIDAS,
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
      if (cabecera.agencia !== undefined) cabecera.agencia = normalizarAgencia(cabecera.agencia);
      // Si no se manda "numero" (o se manda vacío), se deja que lo genere la
      // secuencia real de la base de datos (ver Pedido.numero en
      // schema.prisma, 22/11/2026) - nunca se le pasa null a Prisma, porque
      // la columna es NOT NULL y eso pisaría el DEFAULT con un error.
      if (cabecera.numero == null || cabecera.numero === '') delete cabecera.numero;
      else cabecera.numero = Number(cabecera.numero);
      cabecera.palets = Math.max(0, Math.round(Number(cabecera.palets) || 0));
      const preparado = await prepararPedido({ lineas, clienteId: cabecera.clienteId });
      let creado;
      try {
        creado = await prisma.pedido.create({
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
          include: INCLUDE_LINEAS_CON_PARTIDAS,
        });
      } catch (err) {
        if (err.code === 'P2002') throw new Error(`Ya existe un pedido con el número ${cabecera.numero}. Déjalo en blanco para que se asigne uno automáticamente.`);
        throw err;
      }
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
    if (cabecera.agencia !== undefined) cabecera.agencia = normalizarAgencia(cabecera.agencia);
    if (cabecera.numero === '') delete cabecera.numero;
    else if (cabecera.numero != null) cabecera.numero = Number(cabecera.numero);
    cabecera.palets = Math.max(0, Math.round(Number(cabecera.palets) || 0));
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
        include: INCLUDE_LINEAS_CON_PARTIDAS,
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
