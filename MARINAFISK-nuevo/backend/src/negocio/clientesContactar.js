/*
 * MARINAFISK - Fase 4, punto 1 y 3: panel "Clientes a Contactar Hoy".
 *
 * Reproduce la logica exacta del HTML actual (funciones calcularFichaCliente
 * / renderContactarHoy / obtenerUltimoCosteProducto, en torno a la linea
 * ~8100), con la ampliacion que pide el punto 3: los recordatorios ya
 * vienen ordenados por margen real cuando se conoce.
 *
 * Diferencia deliberada respecto al HTML: alli "contactado hoy" se guardaba
 * en localStorage (por ordenador, no compartido). Aqui se guarda en una
 * tabla (`contactados_hoy`), asi que si Victor lo marca desde su sesion,
 * Pancho tambien lo ve marcado - mejor ajustado al multiusuario real de la
 * Fase 3.
 */

function diasEntre(f1, f2) {
  return Math.round((new Date(f2 + 'T00:00:00') - new Date(f1 + 'T00:00:00')) / 86400000);
}

async function obtenerUltimoCosteProducto(pool, producto) {
  const { rows } = await pool.query(
    `SELECT cl.precio_kg FROM compra_lineas cl JOIN compras c ON c.id = cl.compra_id
     WHERE cl.producto = $1 ORDER BY c.fecha DESC LIMIT 1`,
    [producto]
  );
  return rows.length ? Number(rows[0].precio_kg) || 0 : null;
}

async function obtenerUltimoPrecioRealCliente(pool, codCliente, codArticulo) {
  const { rows } = await pool.query(
    `SELECT pl.precio FROM pedido_lineas pl JOIN pedidos p ON p.id = pl.pedido_id
     WHERE p.cliente_codigo = $1 AND pl.articulo_codigo = $2 AND pl.precio > 0
     ORDER BY p.fecha DESC LIMIT 1`,
    [codCliente, codArticulo]
  );
  return rows.length ? Number(rows[0].precio) : null;
}

async function calcularFichaCliente(pool, codCliente, hoy) {
  const { rows: pedidos } = await pool.query(
    `SELECT p.fecha, pl.articulo_codigo, pl.descripcion, pl.peso
     FROM pedidos p JOIN pedido_lineas pl ON pl.pedido_id = p.id
     WHERE p.cliente_codigo = $1 ORDER BY p.fecha ASC`,
    [codCliente]
  );
  if (!pedidos.length) return { sinDatos: true };

  const porProducto = {};
  for (const l of pedidos) {
    if (!l.articulo_codigo) continue;
    if (!porProducto[l.articulo_codigo]) {
      porProducto[l.articulo_codigo] = { codigo: l.articulo_codigo, desc: l.descripcion || l.articulo_codigo, fechas: [] };
    }
    const fechaTexto = new Date(l.fecha).toISOString().slice(0, 10);
    porProducto[l.articulo_codigo].fechas.push(fechaTexto);
  }

  const productos = Object.values(porProducto).map((prod) => {
    prod.fechas.sort();
    const ultimaFecha = prod.fechas[prod.fechas.length - 1];
    const diasSinPedirlo = diasEntre(ultimaFecha, hoy);
    let intervaloMedio = null;
    if (prod.fechas.length >= 2) {
      const intervalos = [];
      for (let i = 1; i < prod.fechas.length; i++) intervalos.push(diasEntre(prod.fechas[i - 1], prod.fechas[i]));
      intervaloMedio = Math.round(intervalos.reduce((s, x) => s + x, 0) / intervalos.length);
    }
    return { ...prod, ultimaFecha, diasSinPedirlo, intervaloMedio, numVeces: prod.fechas.length };
  });

  // "Posibles recordatorios": productos con compra regular (2+ veces) y que
  // llevan bastante mas tiempo del habitual sin pedirse.
  const recordatorios = productos
    .filter((p) => p.intervaloMedio && p.numVeces >= 2 && p.diasSinPedirlo > p.intervaloMedio * 1.5 && p.diasSinPedirlo < 365)
    .sort((a, b) => (b.diasSinPedirlo - b.intervaloMedio) - (a.diasSinPedirlo - a.intervaloMedio));

  return { sinDatos: false, recordatorios };
}

async function clientesConTablaContactadosHoy(pool, hoy) {
  const { rows } = await pool.query('SELECT cliente_codigo FROM contactados_hoy WHERE fecha = $1', [hoy]);
  return new Set(rows.map((r) => r.cliente_codigo));
}

async function calcularClientesAContactar(pool, hoy) {
  const [contactadosHoy, { rows: clientes }] = await Promise.all([
    clientesConTablaContactadosHoy(pool, hoy),
    pool.query('SELECT codigo, nombre, telefono FROM clientes'),
  ]);

  const candidatos = [];
  for (const cli of clientes) {
    if (contactadosHoy.has(cli.codigo)) continue;
    // eslint-disable-next-line no-await-in-loop
    const ficha = await calcularFichaCliente(pool, cli.codigo, hoy);
    if (ficha.sinDatos || !ficha.recordatorios.length) continue;

    const urgencia = ficha.recordatorios.reduce((m, p) => Math.max(m, p.diasSinPedirlo - p.intervaloMedio), 0);

    const recordatoriosConMargen = [];
    for (const p of ficha.recordatorios) {
      // eslint-disable-next-line no-await-in-loop
      const coste = await obtenerUltimoCosteProducto(pool, p.codigo);
      // eslint-disable-next-line no-await-in-loop
      const precioReal = await obtenerUltimoPrecioRealCliente(pool, cli.codigo, p.codigo);
      const margenReal = (coste != null && precioReal != null) ? precioReal - coste : null;
      recordatoriosConMargen.push({ ...p, coste, precio_real: precioReal, margen_real: margenReal });
    }
    recordatoriosConMargen.sort((a, b) => {
      if (a.margen_real === null && b.margen_real === null) return 0;
      if (a.margen_real === null) return 1;
      if (b.margen_real === null) return -1;
      return b.margen_real - a.margen_real;
    });

    const mejorMargen = recordatoriosConMargen.length && recordatoriosConMargen[0].margen_real !== null
      ? recordatoriosConMargen[0].margen_real : null;

    candidatos.push({ cliente: cli, recordatorios: recordatoriosConMargen, urgencia, mejor_margen: mejorMargen });
  }

  candidatos.sort((a, b) => b.urgencia - a.urgencia);
  return candidatos;
}

async function marcarContactadoHoy(pool, codCliente, hoy, marcadoPor) {
  await pool.query(
    `INSERT INTO contactados_hoy (cliente_codigo, fecha, marcado_por) VALUES ($1,$2,$3)
     ON CONFLICT (cliente_codigo, fecha) DO NOTHING`,
    [codCliente, hoy, marcadoPor]
  );
}

module.exports = { calcularClientesAContactar, marcarContactadoHoy };
