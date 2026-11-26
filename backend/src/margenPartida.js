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

// Reparto de una linea entre una o varias partidas (ver PedidoLineaPartida/
// TraspasoLineaPartida en schema.prisma, actualizacion 24/11/2026 -
// RESUMEN_COMPLETO_para_Code_18-11-2026_8.md, "una linea repartida en dos o
// mas partidas"): el caso normal (una sola partida) no tiene ninguna fila en
// `partidas` - se construye un reparto SINTETICO de una sola entrada a
// partir de partidaNumero+peso, igual que hace el HTML real cuando
// `linea.partidas` esta vacio.
//
// Cuando SI hay reparto real, los kilos de la ULTIMA entrada (por `orden`)
// nunca se confian tal cual estan guardados: se recalculan siempre como "lo
// que falte hasta el peso de la linea" (puerto directo de repartoPartidas()
// del HTML real) - asi, si el peso de la linea cambia mas adelante, el
// reparto se ajusta solo en vez de quedar obsoleto.
function repartoPartidas(linea) {
  const partidas = linea.partidas || [];
  if (!partidas.length) {
    return linea.partidaNumero != null
      ? [{ numeroPartida: linea.partidaNumero, kilos: Number(linea.peso) || 0 }]
      : [];
  }
  const resultado = [...partidas]
    .sort((a, b) => a.orden - b.orden)
    .map((p) => ({ numeroPartida: p.numeroPartida, kilos: Number(p.kilos) || 0 }));
  const pesoTotal = Number(linea.peso) || 0;
  const sumaSalvoUltima = resultado.slice(0, -1).reduce((s, p) => s + p.kilos, 0);
  resultado[resultado.length - 1].kilos = Math.max(0, pesoTotal - sumaSalvoUltima);
  return resultado;
}

// Kilos ya vendidos de una partida concreta para un producto (o su familia):
// suma lineas de pedidos Y de traspasos (un traspaso a Zaragoza tambien
// consume kilos de la partida, igual que una venta - ver Fase 0). Una linea
// repartida entre varias partidas (ver repartoPartidas de arriba) solo
// descuenta de ESTA partida los kilos que de verdad le tocan a ella, no el
// peso completo de la linea.
async function kilosVendidosDePartida(articulo, numeroPartida) {
  const filtroPartida = { OR: [{ partidaNumero: numeroPartida }, { partidas: { some: { numeroPartida } } }] };
  const [lineasPedido, lineasTraspaso] = await Promise.all([
    prisma.pedidoLinea.findMany({ where: filtroPartida, include: { articulo: true, partidas: true } }),
    prisma.traspasoLinea.findMany({ where: filtroPartida, include: { articulo: true, partidas: true } }),
  ]);
  let total = 0;
  for (const l of [...lineasPedido, ...lineasTraspaso]) {
    if (!sonMismaFamiliaProducto(l.articulo, articulo)) continue;
    for (const entrada of repartoPartidas(l)) {
      if (entrada.numeroPartida === numeroPartida) total += entrada.kilos;
    }
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
//
// "incluirTodas" (25-26/11/2026, "MERMA DEL CONGRIO EN LISTADO DE
// PARTIDAS" + "ELEGIR PARTIDA AUNQUE SE PASE DE KILOS" del HTML real): por
// defecto, igual que siempre, solo devuelve partidas con kilos libres de
// verdad y nunca las cerradas a mano - lo que siguen usando la
// autoasignacion silenciosa (elegirPartidaParaVenta/elegirPartidaParaTraspaso
// mas abajo) y costeRealActual, que nunca deben elegir solas una partida
// agotada o cerrada. Cuando es true (solo lo pide el popup manual de
// eleccion, ver GET /partidas/disponibles), tambien incluye las partidas
// sin kilos libres (o incluso en negativo si ya se vendio de mas, marcadas
// `agotada:true`) Y las cerradas a mano (`cerrada:true`) - Victor puede
// elegir una agotada a mano (la elaboracion puede dar mas kilos que la
// compra), pero una cerrada solo se muestra, nunca se puede elegir (ver
// el popup en pedidos.js/traspasos.js).
async function obtenerPartidasDisponibles(articuloId, reservas, incluirTodas) {
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
    const cerrada = !!partidaCanonica?.cerradaManual;
    if (cerrada && !incluirTodas) continue;

    const kilosVendidos = await kilosVendidosDePartida(articulo, numeroPartida);
    const kilosReservados = (reservas && reservas.get(numeroPartida)) || 0;
    const kilosDisponibles = acc.kilosComprados - kilosVendidos - kilosReservados;
    if (kilosDisponibles > 0.01 || incluirTodas) {
      resultado.push({
        numeroPartida,
        fecha: acc.fecha,
        proveedorNombre: acc.proveedorNombre,
        coste: acc.kilosComprados > 0 ? acc.baseTotal / acc.kilosComprados : 0,
        kilosComprados: acc.kilosComprados,
        kilosDisponibles,
        agotada: kilosDisponibles <= 0.01,
        cerrada,
      });
    }
  }
  resultado.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  return resultado;
}

// Elige la partida para una linea de venta: entre las que llegan al margen
// minimo, preferir la mas antigua (FIFO) que CUBRA el peso necesario
// completo (puerto de elegirPartidaAuto() del HTML real, actualizacion
// 24/11/2026); si ninguna lo cubre entero, la que mas kilos libres tenga
// (motivo "PARCIAL" - el resto hay que repartirlo a mano en otra partida,
// ver Fase 2 punto 4). Si "pesoNecesario" no se indica (uso antiguo, ej. el
// lote de /pedidos/asignar-partidas-dia), se comporta como antes: la mas
// antigua que llegue al margen, sin mirar si cubre el peso. Si ninguna
// llega al margen, no elige ninguna (queda como excepcion para revision
// manual) - nunca fuerza una partida que no cumple el margen. "reservas"
// (opcional) ver obtenerPartidasDisponibles.
async function elegirPartidaParaVenta({ articuloId, precioVenta, pesoNecesario }, reservas) {
  const disponibles = await obtenerPartidasDisponibles(articuloId, reservas);
  if (!disponibles.length) return { partidaNumero: null, disponibles, motivo: 'SIN_COMPRAS' };
  const precio = Number(precioVenta) || 0;
  const conMargen = disponibles.filter((p) => precio && precio - p.coste >= MARGEN_MINIMO_PARTIDA);
  if (!conMargen.length) return { partidaNumero: null, disponibles, motivo: 'SIN_MARGEN' };
  if (pesoNecesario == null) return { partidaNumero: conMargen[0].numeroPartida, disponibles, motivo: 'OK' };
  const peso = Number(pesoNecesario) || 0;
  const queCubren = conMargen.filter((p) => p.kilosDisponibles >= peso);
  if (queCubren.length) return { partidaNumero: queCubren[0].numeroPartida, disponibles, motivo: 'OK' };
  const porKilosLibres = [...conMargen].sort((a, b) => b.kilosDisponibles - a.kilosDisponibles);
  return { partidaNumero: porKilosLibres[0].numeroPartida, disponibles, motivo: 'PARCIAL' };
}

// Igual que elegirPartidaParaVenta pero SIN margen (un traspaso a Zaragoza
// no es una venta - Fase 0 punto 3/9 - no hay precio de cliente con el que
// calcular ningun margen): entre TODAS las disponibles, la mas antigua que
// cubra el peso entero; si ninguna lo cubre, la de mas kilos libres.
async function elegirPartidaParaTraspaso({ articuloId, pesoNecesario }, reservas) {
  const disponibles = await obtenerPartidasDisponibles(articuloId, reservas);
  if (!disponibles.length) return { partidaNumero: null, disponibles, motivo: 'SIN_COMPRAS' };
  if (pesoNecesario == null) return { partidaNumero: disponibles[0].numeroPartida, disponibles, motivo: 'OK' };
  const peso = Number(pesoNecesario) || 0;
  const queCubren = disponibles.filter((p) => p.kilosDisponibles >= peso);
  if (queCubren.length) return { partidaNumero: queCubren[0].numeroPartida, disponibles, motivo: 'OK' };
  const porKilosLibres = [...disponibles].sort((a, b) => b.kilosDisponibles - a.kilosDisponibles);
  return { partidaNumero: porKilosLibres[0].numeroPartida, disponibles, motivo: 'PARCIAL' };
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

// Merma estimada SOLO para este informe (25/11/2026, "MERMA DEL CONGRIO EN
// LISTADO DE PARTIDAS" del HTML real) - no afecta a ninguna venta, traspaso
// ni a la disponibilidad real de una partida (obtenerPartidasDisponibles),
// solo a la cifra de "pendiente de vender" de este listado: el congrio
// pierde ~10% de su peso en la tripa antes de poder venderse, así que
// contar el 100% de lo comprado como "pendiente" sobreestima lo que
// realmente queda. Lista cerrada a proposito (como las agencias de
// transporte) - si Victor pide otro producto con merma conocida, se añade
// aqui.
const MERMAS_LISTADO = [{ patron: /congrio/i, pct: 10, motivo: 'tripa' }];
function mermaDeProducto(articulo) {
  const texto = `${articulo?.descripcion || ''} ${articulo?.codigo || ''}`;
  return MERMAS_LISTADO.find((m) => m.patron.test(texto)) || null;
}

// Informe "KILOS POR PARTIDA" (ver Fase 2 punto 4, actualizacion
// 24/11/2026 - RESUMEN_COMPLETO_para_Code_18-11-2026_8.md). Puerto directo
// de datosKilosPorPartida() del HTML real: por cada combinacion
// numeroPartida+articulo (codigo EXACTO, a diferencia de
// obtenerPartidasDisponibles que agrupa por familia) cuanto se ha
// comprado, vendido (pedidos), traspasado, y cuanto queda PENDIENTE de
// vender o se ha VENDIDO DE MAS. Las ventas/traspasos se emparejan con la
// compra por familia (un pedido puede vender con un codigo de talla
// distinto al generico de compra), igual que el resto de Fase 2 punto 4.
// Una venta/traspaso con una partida que no tiene ninguna compra
// coincidente sale aparte, marcada "(sin compra con esa partida)" - no se
// descarta en silencio.
async function calcularKilosPorPartida(filtros = {}) {
  const compras = await prisma.compra.findMany({
    where: { anulada: false },
    include: { lineas: { include: { articulo: true } } },
  });

  const grupos = new Map(); // "numeroPartida|articuloId[|sin-compra]" -> grupo
  const porPartida = new Map(); // numeroPartida -> [grupo, ...]
  const anadirAPorPartida = (g) => {
    if (!porPartida.has(g.numeroPartida)) porPartida.set(g.numeroPartida, []);
    porPartida.get(g.numeroPartida).push(g);
  };

  for (const compra of compras) {
    for (const linea of compra.lineas) {
      const key = `${compra.numeroPartida}|${linea.articuloId}`;
      if (!grupos.has(key)) {
        const g = {
          numeroPartida: compra.numeroPartida, articulo: linea.articulo,
          fecha: compra.fecha, proveedorNombre: compra.proveedorNombreSnapshot,
          comprados: 0, vendidos: 0, traspasos: 0,
        };
        grupos.set(key, g);
        anadirAPorPartida(g);
      }
      const g = grupos.get(key);
      g.comprados += Number(linea.kilos) || 0;
      if (new Date(compra.fecha) < new Date(g.fecha)) {
        g.fecha = compra.fecha;
        g.proveedorNombre = compra.proveedorNombreSnapshot;
      }
    }
  }

  function anotar(lineas, tipo) {
    for (const linea of lineas) {
      for (const entrada of repartoPartidas(linea)) {
        const candidatas = (porPartida.get(entrada.numeroPartida) || []).filter((g) => sonMismaFamiliaProducto(linea.articulo, g.articulo));
        let g = candidatas[0];
        if (!g) {
          const key = `${entrada.numeroPartida}|${linea.articuloId}|sin-compra`;
          if (!grupos.has(key)) {
            g = { numeroPartida: entrada.numeroPartida, articulo: linea.articulo, fecha: null, proveedorNombre: '(sin compra con esa partida)', comprados: 0, vendidos: 0, traspasos: 0 };
            grupos.set(key, g);
            anadirAPorPartida(g);
          } else {
            g = grupos.get(key);
          }
        }
        if (tipo === 'T') g.traspasos += entrada.kilos; else g.vendidos += entrada.kilos;
      }
    }
  }

  const [pedidoLineas, traspasoLineas, partidasCerradas] = await Promise.all([
    prisma.pedidoLinea.findMany({ include: { articulo: true, partidas: true } }),
    prisma.traspasoLinea.findMany({ include: { articulo: true, partidas: true } }),
    prisma.partida.findMany({ where: { cerradaManual: true }, select: { numeroPartida: true } }),
  ]);
  anotar(pedidoLineas, 'V');
  anotar(traspasoLineas, 'T');
  const numerosCerrados = new Set(partidasCerradas.map((p) => p.numeroPartida));

  const q = String(filtros.producto || '').trim().toLowerCase();
  const pq = String(filtros.partida || '').trim();
  const desde = filtros.desde ? new Date(filtros.desde) : null;
  const hasta = filtros.hasta ? new Date(filtros.hasta) : null;

  const resultado = [];
  for (const g of grupos.values()) {
    if (q && !(String(g.articulo.codigo).toLowerCase().includes(q) || String(g.articulo.descripcion).toLowerCase().includes(q))) continue;
    if (pq && !String(g.numeroPartida).includes(pq)) continue;
    if (desde && g.fecha && new Date(g.fecha) < desde) continue;
    if (hasta && g.fecha && new Date(g.fecha) > hasta) continue;
    const merma = mermaDeProducto(g.articulo);
    const mermaKg = merma ? (g.comprados * merma.pct) / 100 : 0;
    const pendienteBruto = g.comprados - mermaKg - g.vendidos - g.traspasos;
    const pendiente = pendienteBruto > 0.005 ? pendienteBruto : 0;
    const vendidoDeMas = pendienteBruto < -0.005 ? -pendienteBruto : 0;
    if (filtros.soloPendiente && pendiente === 0 && vendidoDeMas === 0) continue;
    if (filtros.soloExceso && vendidoDeMas === 0) continue;
    resultado.push({
      numeroPartida: g.numeroPartida,
      fecha: g.fecha,
      proveedorNombre: g.proveedorNombre,
      articuloCodigo: g.articulo.codigo,
      articuloDescripcion: g.articulo.descripcion,
      comprados: g.comprados,
      mermaKg,
      mermaPct: merma ? merma.pct : 0,
      mermaMotivo: merma ? merma.motivo : '',
      vendidos: g.vendidos,
      traspasos: g.traspasos,
      pendiente,
      vendidoDeMas,
      cerrada: numerosCerrados.has(g.numeroPartida),
    });
  }
  resultado.sort((a, b) => a.articuloDescripcion.localeCompare(b.articuloDescripcion)
    || String(a.fecha || '').localeCompare(String(b.fecha || ''))
    || (a.numeroPartida - b.numeroPartida));
  return resultado;
}

module.exports = {
  MARGEN_MINIMO_PARTIDA,
  sonMismaFamiliaProducto,
  repartoPartidas,
  kilosVendidosDePartida,
  obtenerPartidasDisponibles,
  elegirPartidaParaVenta,
  elegirPartidaParaTraspaso,
  costeRealActual,
  calcularKilosPorPartida,
};
