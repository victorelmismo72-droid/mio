// Fase 2, punto 4: modo AUTO de las listas de precio.
//
// Reproduce construirListaPreciosHoy() del HTML actual: para cada artículo
// comprado en la fecha indicada, calcula el precio medio ponderado de
// compra (precio_kg, ponderado por kilos) y le suma un margen fijo de
// 1,70 €/kg — igual que hoy, sin distinguir entre Pescaderías/Mayoristas en
// este cálculo (las dos listas parten del mismo cálculo automático; lo que
// las mantiene independientes es que cada una se guarda y edita por
// separado a partir de ahí, ver FASE_0 punto 5).
const MARGEN_FIJO_AUTO_EUR_KG = 1.70;

async function calcularListaAuto(db, fecha) {
  const r = await db.query(
    `SELECT cl.articulo_codigo_snapshot AS codigo, cl.descripcion_snapshot AS descripcion,
            cl.kilos, cl.precio_kg
     FROM compra_lineas cl JOIN compras c ON c.id = cl.compra_id
     WHERE c.fecha = $1`,
    [fecha]
  );

  const porArticulo = new Map();
  for (const l of r.rows) {
    const kilos = Number(l.kilos) || 0;
    const precio = Number(l.precio_kg) || 0;
    if (!l.codigo || kilos <= 0) continue;
    if (!porArticulo.has(l.codigo)) porArticulo.set(l.codigo, { descripcion: l.descripcion, kilos: 0, importe: 0 });
    const acc = porArticulo.get(l.codigo);
    acc.kilos += kilos;
    acc.importe += kilos * precio;
  }

  const filas = [];
  for (const [codigo, acc] of porArticulo.entries()) {
    const costeMedioHoy = acc.kilos > 0 ? acc.importe / acc.kilos : 0;
    filas.push({
      articulo_codigo: codigo,
      descripcion: acc.descripcion,
      coste_medio_hoy: costeMedioHoy,
      precio: costeMedioHoy + MARGEN_FIJO_AUTO_EUR_KG,
    });
  }
  filas.sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || ''));
  return filas;
}

module.exports = { calcularListaAuto, MARGEN_FIJO_AUTO_EUR_KG };
