// Listados de gestión: regla transversal de Fase 2, punto 6
// (CORRECCIONES_02-09-2026_para_Code.md punto 3): un traspaso interno a
// Zaragoza NO es una venta (no hay cliente, no hay cobro) - por defecto
// cualquier listado que sume kilos/artículos/importes debe mostrar y sumar
// SOLO ventas reales (pedidos). Incluir también traspasos es una opción
// explícita, nunca activada por defecto, y si se activa deben verse
// claramente diferenciados (nunca mezclados en la misma fila/categoría que
// una venta) con un total aparte: un total económico (solo ventas) y un
// total de kilos "estadístico" (ventas + traspasos).
const { prisma } = require('./db');

async function construirListadoGestion({ desde, hasta, incluirTraspasos, clienteId, articuloId }) {
  const rangoFecha = {};
  if (desde) rangoFecha.gte = new Date(desde);
  if (hasta) rangoFecha.lte = new Date(hasta);

  const whereLineaPedido = {
    ...(articuloId ? { articuloId: Number(articuloId) } : {}),
    pedido: {
      ...(Object.keys(rangoFecha).length ? { fecha: rangoFecha } : {}),
      ...(clienteId ? { clienteId: Number(clienteId) } : {}),
    },
  };
  const lineasPedido = await prisma.pedidoLinea.findMany({
    where: whereLineaPedido,
    include: { pedido: true, articulo: true },
  });

  const filas = lineasPedido.map((l) => ({
    tipo: 'VENTA',
    fecha: l.pedido.fecha,
    documentoNumero: l.pedido.numero,
    cliente: l.pedido.clienteNombreSnapshot,
    articuloId: l.articuloId,
    descripcion: l.articulo.descripcion,
    kilos: Number(l.peso) || 0,
    importe: Number(l.total) || 0,
  }));

  if (incluirTraspasos) {
    const whereLineaTraspaso = {
      ...(articuloId ? { articuloId: Number(articuloId) } : {}),
      traspaso: Object.keys(rangoFecha).length ? { fecha: rangoFecha } : {},
    };
    const lineasTraspaso = await prisma.traspasoLinea.findMany({
      where: whereLineaTraspaso,
      include: { traspaso: true, articulo: true },
    });
    for (const l of lineasTraspaso) {
      filas.push({
        tipo: 'TRASPASO',
        fecha: l.traspaso.fecha,
        documentoNumero: l.traspaso.numero,
        cliente: null,
        articuloId: l.articuloId,
        descripcion: l.articulo.descripcion,
        kilos: Number(l.peso) || 0,
        importe: null, // un traspaso no es una venta: no tiene importe economico real, solo kilos
      });
    }
  }

  const totalEconomico = filas.filter((f) => f.tipo === 'VENTA').reduce((s, f) => s + f.importe, 0);
  const totalKilosVentas = filas.filter((f) => f.tipo === 'VENTA').reduce((s, f) => s + f.kilos, 0);
  const totalKilosConTraspasos = filas.reduce((s, f) => s + f.kilos, 0);

  return {
    filas,
    totales: { totalEconomico, totalKilosVentas, totalKilosConTraspasos },
  };
}

module.exports = { construirListadoGestion };
