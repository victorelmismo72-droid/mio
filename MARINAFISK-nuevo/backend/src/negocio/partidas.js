/*
 * MARINAFISK - Fase 2, punto 3: partidas y margen.
 *
 * Reproduce exactamente el algoritmo del HTML actual (funciones
 * sonMismaFamiliaProducto / kilosVendidosDePartida / obtenerPartidasDisponibles
 * en torno a la linea ~4593 del HTML), para que el sistema nuevo asigne las
 * mismas partidas que el actual dado el mismo dato de entrada.
 */

const MARGEN_MINIMO_PARTIDA = 1.30;

function primeraPalabra(desc) {
  return String(desc || '').toUpperCase().trim().split(/\s+/)[0];
}

// Dos codigos son "el mismo producto" si son iguales, o si el mas corto
// (minimo 4 caracteres) es el principio del mas largo Y ademas coincide la
// primera palabra de la descripcion del catalogo (evita falsos positivos
// como C144 vs C1444 — ver Fase 0 punto 3).
function sonMismaFamiliaProducto(codigoA, codigoB, mapaArticulos) {
  const a = String(codigoA || '');
  const b = String(codigoB || '');
  if (a === b) return true;
  const corto = a.length <= b.length ? a : b;
  const largo = a.length <= b.length ? b : a;
  if (corto.length < 4) return false;
  if (largo.indexOf(corto) !== 0) return false;

  const artA = mapaArticulos.get(a);
  const artB = mapaArticulos.get(b);
  if (!artA || !artB) return true; // sin catalogo para comparar: no bloqueamos (igual que el HTML actual)
  return primeraPalabra(artA.descripcion) === primeraPalabra(artB.descripcion);
}

async function cargarMapaArticulos(pool) {
  const { rows } = await pool.query('SELECT codigo, descripcion FROM articulos');
  const mapa = new Map();
  for (const a of rows) mapa.set(a.codigo, a);
  return mapa;
}

// Suma los kilos ya vendidos de una partida concreta para un producto (y su
// familia). Incluye pedidos Y traspasos porque ambos sacan kilos reales de
// la partida (un traspaso a Zaragoza reduce el stock disponible igual que
// una venta, aunque fiscalmente no sea una venta - ver Fase 0 punto 9).
async function kilosVendidosDePartida(pool, mapaArticulos, producto, numeroPartida) {
  const [{ rows: pedRows }, { rows: trpRows }] = await Promise.all([
    pool.query('SELECT articulo_codigo, peso FROM pedido_lineas WHERE partida_numero = $1', [numeroPartida]),
    pool.query('SELECT articulo_codigo, peso FROM traspaso_lineas WHERE partida_numero = $1', [numeroPartida]),
  ]);
  let total = 0;
  for (const l of [...pedRows, ...trpRows]) {
    if (sonMismaFamiliaProducto(l.articulo_codigo, producto, mapaArticulos)) total += Number(l.peso) || 0;
  }
  return total;
}

// Todas las partidas con kilos disponibles para un articulo dado, ordenadas
// de mas antigua a mas nueva (mismo orden FIFO que el HTML actual).
async function partidasDisponibles(pool, articuloCodigo) {
  const mapaArticulos = await cargarMapaArticulos(pool);
  const { rows: cerradas } = await pool.query('SELECT numero_partida FROM partidas_cerradas');
  const setCerradas = new Set(cerradas.map((r) => r.numero_partida));

  const { rows: lineas } = await pool.query(`
    SELECT cl.producto, cl.kilos, cl.precio_kg, c.numero_partida, c.fecha, c.proveedor_nombre
    FROM compra_lineas cl
    JOIN compras c ON c.id = cl.compra_id
    WHERE c.numero_partida IS NOT NULL
  `);

  const resultado = [];
  for (const l of lineas) {
    if (setCerradas.has(l.numero_partida)) continue;
    if (!sonMismaFamiliaProducto(l.producto, articuloCodigo, mapaArticulos)) continue;
    const kilosComprados = Number(l.kilos) || 0;
    // eslint-disable-next-line no-await-in-loop
    const kilosVendidos = await kilosVendidosDePartida(pool, mapaArticulos, l.producto, l.numero_partida);
    const kilosDisponibles = kilosComprados - kilosVendidos;
    if (kilosDisponibles > 0.01) {
      resultado.push({
        numero_partida: l.numero_partida,
        fecha: l.fecha,
        proveedor_nombre: l.proveedor_nombre,
        coste: Number(l.precio_kg) || 0,
        kilos_comprados: kilosComprados,
        kilos_disponibles: kilosDisponibles,
      });
    }
  }
  // OJO: `fecha` llega de postgres como objeto Date (columna DATE), no como
  // texto - comparar con String(fecha) ordena por el dia de la semana en
  // ingles (bug real, detectado durante las pruebas de esta fase), hay que
  // comparar por su valor temporal real.
  resultado.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  return resultado;
}

// Asignacion automatica inline (Fase 0 punto 3): si alguna partida disponible
// llega al margen minimo de 1,30 EUR/kg frente al precio de venta, se asigna
// sola (la mas antigua que lo cumpla). Si ninguna llega, se devuelve
// PENDIENTE_MANUAL con la lista de candidatas para que se elija a mano -
// nunca se auto-resuelve ni se bloquea la linea.
async function asignarPartidaAutomatica(pool, articuloCodigo, precioVenta) {
  const disponibles = await partidasDisponibles(pool, articuloCodigo);
  const pv = Number(precioVenta) || 0;
  const conMargen = disponibles.filter((p) => pv && (pv - p.coste) >= MARGEN_MINIMO_PARTIDA);
  if (conMargen.length) {
    return { estado: 'OK', partida_numero: conMargen[0].numero_partida, candidatos: disponibles };
  }
  return { estado: 'PENDIENTE_MANUAL', partida_numero: null, candidatos: disponibles };
}

async function cerrarPartida(pool, numeroPartida, cerradaPor) {
  await pool.query(
    `INSERT INTO partidas_cerradas (numero_partida, cerrada_por) VALUES ($1,$2)
     ON CONFLICT (numero_partida) DO UPDATE SET cerrada_en = now(), cerrada_por = EXCLUDED.cerrada_por`,
    [numeroPartida, cerradaPor || null]
  );
}

async function reabrirPartida(pool, numeroPartida) {
  await pool.query('DELETE FROM partidas_cerradas WHERE numero_partida = $1', [numeroPartida]);
}

// Cierre masivo por fecha (Fase 0 punto 3): cierra de golpe todas las
// partidas que se originaron en compras de esa fecha.
async function cerrarPartidasMasivoPorFecha(pool, fecha, cerradaPor) {
  const { rows } = await pool.query(
    'SELECT DISTINCT numero_partida FROM compras WHERE fecha = $1 AND numero_partida IS NOT NULL',
    [fecha]
  );
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await cerrarPartida(pool, r.numero_partida, cerradaPor);
  }
  return rows.map((r) => r.numero_partida);
}

// Rentabilidad por partida (Fase 2 punto 3, nuevo - no existe en el HTML
// actual). "Vendido" cuenta solo pedidos (venta real facturada) - a
// proposito NO incluye traspasos (movimiento interno sin ingreso) ni
// repartos (ya facturados aparte, ver Fase 0 punto 9): esto es rentabilidad
// economica de la partida, distinto de los listados de movimiento/cantidad
// de la Fase 2 punto 5bis, que si suman traspasos.
async function rentabilidadPartida(pool, numeroPartida) {
  const { rows: lineasCompra } = await pool.query(
    `SELECT cl.producto, cl.kilos, cl.base_real
     FROM compra_lineas cl JOIN compras c ON c.id = cl.compra_id
     WHERE c.numero_partida = $1`,
    [numeroPartida]
  );

  const costePorArticulo = {};
  let costeTotal = 0;
  for (const l of lineasCompra) {
    const v = Number(l.base_real) || 0;
    costeTotal += v;
    costePorArticulo[l.producto] = (costePorArticulo[l.producto] || 0) + v;
  }

  const { rows: lineasVenta } = await pool.query(
    'SELECT articulo_codigo, total FROM pedido_lineas WHERE partida_numero = $1',
    [numeroPartida]
  );
  const vendidoPorArticulo = {};
  let totalVendido = 0;
  for (const l of lineasVenta) {
    const v = Number(l.total) || 0;
    totalVendido += v;
    vendidoPorArticulo[l.articulo_codigo] = (vendidoPorArticulo[l.articulo_codigo] || 0) + v;
  }

  const { rows: cerradaRows } = await pool.query(
    'SELECT cerrada_en, cerrada_por FROM partidas_cerradas WHERE numero_partida = $1',
    [numeroPartida]
  );

  return {
    numero_partida: numeroPartida,
    cerrada: cerradaRows.length > 0,
    cierre: cerradaRows[0] || null,
    coste_total: costeTotal,
    coste_por_articulo: costePorArticulo,
    total_vendido: totalVendido,
    vendido_por_articulo: vendidoPorArticulo,
    rentabilidad: totalVendido - costeTotal,
  };
}

module.exports = {
  MARGEN_MINIMO_PARTIDA,
  sonMismaFamiliaProducto,
  partidasDisponibles,
  asignarPartidaAutomatica,
  cerrarPartida,
  reabrirPartida,
  cerrarPartidasMasivoPorFecha,
  rentabilidadPartida,
};
