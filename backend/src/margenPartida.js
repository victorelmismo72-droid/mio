// Emparejamiento automatico de partida (lote de compra) para una linea de
// venta, y calculo del margen minimo (Fase 2, punto 4). Puerto directo del
// algoritmo ya en uso en el HTML actual (funciones sonMismaFamiliaProducto,
// kilosVendidosDePartida, obtenerPartidasDisponibles, autoAsignarPartidas,
// asignarPartidasDelDia) - se reproduce tal cual, no se rediseña.
const { prisma } = require('./db');

const MARGEN_MINIMO_PARTIDA = 1.30;

// Algunos productos se compran con un codigo generico (ej. "MER") pero se
// venden con un codigo distinto que ademas indica el calibre de la pieza
// (ej. "MER300", "MER400") - la unica forma fiable de saber que son "el
// mismo producto" es comparar una raiz comun. El codigo corto (el generico,
// el que se usa en compras) tiene que ser exactamente el PRINCIPIO del
// codigo largo, con un minimo de 4 caracteres para no arriesgarnos a que
// dos codigos cortos sin relacion se confundan (ver Fase 0: falso positivo
// conocido C255/C2550).
//
// Eso solo no basta: en el catalogo real hay casos donde dos productos
// distintos comparten el mismo prefijo numerico por casualidad. Por
// seguridad, se exige ADEMAS que la primera palabra de la descripcion
// coincida (normalmente el nombre de la especie).
function sonMismaFamiliaProducto(articuloA, articuloB) {
  const a = String(articuloA?.codigo || '');
  const b = String(articuloB?.codigo || '');
  if (a === b) return true;
  const corto = a.length <= b.length ? a : b;
  const largo = a.length <= b.length ? b : a;
  if (corto.length < 4) return false;
  if (largo.indexOf(corto) !== 0) return false;

  const primeraPalabra = (desc) => String(desc || '').toUpperCase().trim().split(/\s+/)[0];
  return primeraPalabra(articuloA?.descripcion) === primeraPalabra(articuloB?.descripcion);
}

// Kilos ya vendidos de una partida concreta para un producto (o su familia):
// suma lineas de pedidos Y de traspasos (un traspaso a Zaragoza tambien
// consume kilos de la partida, igual que una venta - ver Fase 0).
async function kilosVendidosDePartida(articulo, numeroPartida) {
  const [lineasPedido, lineasTraspaso] = await Promise.all([
    prisma.pedidoLinea.findMany({
      where: { partidaNumero: numeroPartida },
      include: { articulo: true },
    }),
    prisma.traspasoLinea.findMany({
      where: { partidaNumero: numeroPartida },
      include: { articulo: true },
    }),
  ]);
  let total = 0;
  for (const l of lineasPedido) {
    if (sonMismaFamiliaProducto(l.articulo, articulo)) total += Number(l.peso) || 0;
  }
  for (const l of lineasTraspaso) {
    if (sonMismaFamiliaProducto(l.articulo, articulo)) total += Number(l.peso) || 0;
  }
  return total;
}

// Partidas disponibles para un articulo (mismo producto o su familia), con
// los kilos que quedan tras restar lo ya vendido - y, opcionalmente, unas
// "reservas" (kilos que otras lineas de un mismo pedido sin grabar aun ya
// han apartado de esa partida en esta misma peticion, para no ofrecer dos
// veces los mismos kilos - ver Fase 2 punto 4, nota 20/11/2026,
// "reservasLineasPed"/"reservasDia" del HTML real).
//
// Corregido el 22/11/2026, dos fallos reales:
//  - No excluia las compras anuladas (ver Fase 0 punto 15): los kilos de
//    una compra anulada no deben poder venderse.
//  - Una partida puede tener kilos repartidos entre VARIAS compras con el
//    mismo numero (ver Fase 2 punto 2: partidas compartidas por mas de un
//    proveedor, o varios albaranes del mismo dia) - antes solo se miraba
//    la PRIMERA compra encontrada con ese numero+articulo, perdiendo el
//    resto. Ahora se agrupa por numero de partida y se suman los kilos de
//    todas las compras no anuladas, con el coste medio ponderado.
//
// Excluye las partidas cerradas manualmente (ver Partida.cerradaManual,
// equivale a localStorage['partidas_cerradas_manual'] de hoy). Ordenado
// por fecha ascendente (la mas antigua primero, FIFO) - igual que el HTML.
async function obtenerPartidasDisponibles(articuloId, reservas) {
  const articulo = await prisma.articulo.findUnique({ where: { id: Number(articuloId) } });
  if (!articulo) throw new Error(`No existe ningún artículo con id ${articuloId}.`);

  const compras = await prisma.compra.findMany({
    where: { anulada: false },
    include: { lineas: { include: { articulo: true } } },
  });

  const porPartida = new Map();
  for (const compra of compras) {
    for (const linea of compra.lineas) {
      if (!sonMismaFamiliaProducto(linea.articulo, articulo)) continue;
      const kilos = Number(linea.kilos) || 0;
      const coste = Number(linea.precioKg) || 0;
      if (!porPartida.has(compra.numeroPartida)) {
        porPartida.set(compra.numeroPartida, {
          fecha: compra.fecha, proveedorNombre: compra.proveedorNombreSnapshot, kilosComprados: 0, baseTotal: 0,
        });
      }
      const acc = porPartida.get(compra.numeroPartida);
      acc.kilosComprados += kilos;
      acc.baseTotal += kilos * coste;
      if (new Date(compra.fecha) < new Date(acc.fecha)) {
        acc.fecha = compra.fecha;
        acc.proveedorNombre = compra.proveedorNombreSnapshot;
      }
    }
  }

  const resultado = [];
  for (const [numeroPartida, acc] of porPartida) {
    const partidaCanonica = await prisma.partida.findUnique({ where: { numeroPartida } });
    if (partidaCanonica?.cerradaManual) continue;

    const kilosVendidos = await kilosVendidosDePartida(articulo, numeroPartida);
    const kilosReservados = (reservas && reservas.get(numeroPartida)) || 0;
    const kilosDisponibles = acc.kilosComprados - kilosVendidos - kilosReservados;
    if (kilosDisponibles > 0.01) {
      resultado.push({
        numeroPartida,
        fecha: acc.fecha,
        proveedorNombre: acc.proveedorNombre,
        coste: acc.kilosComprados > 0 ? acc.baseTotal / acc.kilosComprados : 0,
        kilosComprados: acc.kilosComprados,
        kilosDisponibles,
      });
    }
  }
  resultado.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  return resultado;
}

// Elige la partida para una linea de venta: la primera disponible (mas
// antigua, FIFO) cuyo margen (precioVenta - coste) llegue al minimo. Si
// ninguna llega, no elige ninguna (queda como excepcion para revision
// manual) - nunca fuerza una partida que no cumple el margen. "reservas"
// (opcional) ver obtenerPartidasDisponibles.
async function elegirPartidaParaVenta({ articuloId, precioVenta }, reservas) {
  const disponibles = await obtenerPartidasDisponibles(articuloId, reservas);
  if (!disponibles.length) return { partidaNumero: null, disponibles, motivo: 'SIN_COMPRAS' };
  const precio = Number(precioVenta) || 0;
  const elegida = disponibles.find((p) => precio && precio - p.coste >= MARGEN_MINIMO_PARTIDA);
  if (!elegida) return { partidaNumero: null, disponibles, motivo: 'SIN_MARGEN' };
  return { partidaNumero: elegida.numeroPartida, disponibles, motivo: 'OK' };
}

// Coste real "de ahora mismo" para un articulo (Fase 2 punto 5, aviso de
// venta por debajo de coste en listas de precio): media de las partidas
// disponibles ponderada por los kilos que quedan de cada una - más fiable
// que un coste tecleado a mano, porque sale directamente de las compras
// reales (ver Fase 0 punto 11.3 / CORRECCIONES_02-09-2026_para_Code.md
// punto 4). null si no hay ninguna partida disponible de ese producto.
async function costeRealActual(articuloId) {
  const disponibles = await obtenerPartidasDisponibles(articuloId);
  if (!disponibles.length) return null;
  const kilosTotal = disponibles.reduce((s, p) => s + p.kilosDisponibles, 0);
  if (kilosTotal <= 0) return null;
  const baseTotal = disponibles.reduce((s, p) => s + p.kilosDisponibles * p.coste, 0);
  return baseTotal / kilosTotal;
}

module.exports = {
  MARGEN_MINIMO_PARTIDA,
  sonMismaFamiliaProducto,
  kilosVendidosDePartida,
  obtenerPartidasDisponibles,
  elegirPartidaParaVenta,
  costeRealActual,
};
