// Fase 2, punto 3: asignación automática de partidas a líneas de venta
// (pedidos y traspasos), con el margen mínimo de referencia.
//
// Reproduce obtenerPartidasDisponibles() / construirCeldaPartida() del HTML
// actual (líneas ~4661-4711): al introducir un artículo y un precio, se
// buscan las partidas de la MISMA FAMILIA de producto (familiaProducto.js)
// con kilos disponibles, ordenadas de más antigua a más reciente (FIFO por
// fecha de compra), y se calcula el margen real.
//
// Margen mínimo de referencia: 1,30 €/kg (constante MARGEN_MINIMO_PARTIDA en
// el HTML actual). Comportamiento EXACTO del HTML actual para la asignación
// mientras se teclea (construirCeldaPartida): si alguna partida disponible
// llega al margen, se asigna la más antigua que lo cumpla (✅). Si NINGUNA
// llega, NO se asigna nada automáticamente — se deja para que el usuario
// elija a mano de la lista (⚠️), no se fuerza la "mejor" ni la más antigua.
// (El HTML actual sí tiene una función bulk aparte, autoAsignarPartidas(),
// que en ese caso concreto cae a la más antigua sin margen — pero esa es una
// acción manual explícita de "asignar todo lo pendiente del día", no la
// asignación inline al escribir, que es la que pide FASE_0 punto 3 y la que
// se reproduce aquí.)
//
// ⚠️ Diferencia intencionada respecto al HTML actual, ya pedida por
// FASE_0 punto 2: el "coste" de cada partida aquí se calcula con base_real
// (incluye el 2% de OP cuando el proveedor es de subasta), no con el
// precio_kg en bruto que usa hoy internamente obtenerPartidasDisponibles().
// FASE_0 dice explícitamente que el 2% de OP "SÍ debe estar incluido en el
// precio medio y en el coste" — así que el margen mostrado aquí puede salir
// algo más ajustado que en el HTML actual para partidas de subasta, a
// propósito. Señalado para que Víctor lo sepa, no es un fallo de réplica.
const { sonMismaFamilia } = require('./familiaProducto');

const MARGEN_MINIMO_EUR_KG = 1.30;

// Todas las líneas de compra (con la fecha de SU compra), agrupadas por
// partida, filtradas a las que pertenecen a la misma familia que el
// artículo buscado.
async function lineasCompraDeLaFamilia(db, articuloCodigo, articuloDescripcion) {
  const r = await db.query(
    `SELECT c.numero_partida, c.fecha, cl.articulo_codigo_snapshot AS codigo, cl.descripcion_snapshot AS descripcion,
            cl.kilos, cl.base_real
     FROM compra_lineas cl JOIN compras c ON c.id = cl.compra_id`
  );
  const porPartida = new Map();
  for (const l of r.rows) {
    if (!sonMismaFamilia(articuloCodigo, articuloDescripcion, l.codigo, l.descripcion)) continue;
    if (!porPartida.has(l.numero_partida)) porPartida.set(l.numero_partida, { kilosComprados: 0, baseRealTotal: 0, fechaMasAntigua: l.fecha });
    const acc = porPartida.get(l.numero_partida);
    acc.kilosComprados += Number(l.kilos) || 0;
    acc.baseRealTotal += Number(l.base_real) || 0;
    if (l.fecha < acc.fechaMasAntigua) acc.fechaMasAntigua = l.fecha;
  }
  return porPartida;
}

async function kilosVendidosPorPartida(db, numerosPartida, articuloCodigo, articuloDescripcion) {
  if (!numerosPartida.length) return new Map();
  // Una única conexión no puede ejecutar dos consultas a la vez: se hacen
  // en secuencia, no con Promise.all (que sí valdría con un Pool, pero aquí
  // recibimos un cliente concreto, normalmente dentro de una transacción).
  const pedidos = await db.query('SELECT numero_partida, articulo_codigo_snapshot AS codigo, descripcion_snapshot AS descripcion, peso FROM pedido_lineas WHERE numero_partida = ANY($1)', [numerosPartida]);
  const traspasos = await db.query('SELECT numero_partida, articulo_codigo_snapshot AS codigo, descripcion_snapshot AS descripcion, peso FROM traspaso_lineas WHERE numero_partida = ANY($1)', [numerosPartida]);
  const vendidos = new Map();
  for (const l of [...pedidos.rows, ...traspasos.rows]) {
    if (!sonMismaFamilia(articuloCodigo, articuloDescripcion, l.codigo, l.descripcion)) continue;
    vendidos.set(l.numero_partida, (vendidos.get(l.numero_partida) || 0) + (Number(l.peso) || 0));
  }
  return vendidos;
}

// Partidas candidatas para un artículo, con kilos disponibles (de esa
// familia, no de la partida entera) y coste medio por kg, ordenadas de más
// antigua a más reciente por FECHA DE COMPRA (FIFO — igual que el HTML
// actual, que ordena por compra.fecha, no por cuándo se creó el registro).
async function partidasCandidatas(db, { articuloCodigo, articuloDescripcion }) {
  const porPartida = await lineasCompraDeLaFamilia(db, articuloCodigo, articuloDescripcion);
  if (!porPartida.size) return [];

  const numeros = [...porPartida.keys()];
  const vendidos = await kilosVendidosPorPartida(db, numeros, articuloCodigo, articuloDescripcion);
  const estados = await db.query('SELECT numero_partida, cerrada_manual FROM partidas WHERE numero_partida = ANY($1)', [numeros]);
  const estadoPorPartida = new Map(estados.rows.map((e) => [e.numero_partida, e]));

  const candidatas = [];
  for (const [numeroPartida, acc] of porPartida.entries()) {
    const estado = estadoPorPartida.get(numeroPartida);
    if (estado && estado.cerrada_manual) continue; // cerrada manualmente: no se usa aunque queden kilos
    const kilosDisponibles = acc.kilosComprados - (vendidos.get(numeroPartida) || 0);
    if (kilosDisponibles <= 0.01) continue; // mismo umbral que el HTML actual (evita "ruido" de decimales)
    const costeMedioKg = acc.kilosComprados > 0 ? acc.baseRealTotal / acc.kilosComprados : null;
    candidatas.push({ numeroPartida, kilosDisponibles, costeMedioKg, fecha: acc.fechaMasAntigua });
  }
  candidatas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return candidatas;
}

// Asignación automática inline (FASE_0 punto 3): dado un artículo y el
// precio de venta que se está tecleando, elige partida y marca el estado.
async function asignarPartidaAutomatica(db, { articuloCodigo, articuloDescripcion, precioVenta }) {
  const candidatas = await partidasCandidatas(db, { articuloCodigo, articuloDescripcion });
  if (!candidatas.length) {
    return { numeroPartida: null, estadoAsignacion: 'PENDIENTE_MANUAL', margen: null, candidatas: [] };
  }

  const precio = Number(precioVenta);
  const conMargen = candidatas.map((c) => ({
    ...c,
    margen: c.costeMedioKg == null || !Number.isFinite(precio) ? null : precio - c.costeMedioKg,
  }));

  const queCumplen = conMargen.filter((c) => c.margen != null && c.margen >= MARGEN_MINIMO_EUR_KG);
  if (queCumplen.length) {
    const elegida = queCumplen[0]; // ya vienen en orden FIFO por fecha de compra
    return { numeroPartida: elegida.numeroPartida, estadoAsignacion: 'OK', margen: elegida.margen, candidatas: conMargen };
  }

  // Ninguna llega al margen mínimo: NO se asigna nada automáticamente (igual
  // que construirCeldaPartida en el HTML actual) — se deja para que el
  // usuario elija a mano entre las candidatas, con el aviso correspondiente.
  return { numeroPartida: null, estadoAsignacion: 'AVISO_MARGEN', margen: null, candidatas: conMargen };
}

module.exports = { partidasCandidatas, asignarPartidaAutomatica, MARGEN_MINIMO_EUR_KG };
