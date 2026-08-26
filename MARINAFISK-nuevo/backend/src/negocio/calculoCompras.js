/*
 * MARINAFISK - Fase 2, punto 1 y 2: calculo de una linea de compra.
 *
 * Reproduce exactamente la formula del HTML actual para baseZgz/op2/baseReal
 * (ver CARGA_DE_ALBARANES..., funcion calcLineaCompra, linea ~10528), y
 * corrige el fallo conocido de IVA (Fase 0 punto 4): el HTML actual aplica
 * siempre 10% de IVA en compras, sin mirar si el proveedor es
 * intracomunitario. Aqui el tipo de IVA se calcula en vivo a partir del
 * proveedor real, nunca se guarda una formula congelada.
 */

const PORCENTAJE_OP = 0.02;
const IVA_PESCADO_PCT = 10;

// `proveedor` debe venir recien leido de la base de datos (nunca cacheado),
// para cumplir la regla critica de Fase 0 punto 2: el 2% de OP y el tipo de
// IVA se calculan siempre con el estado ACTUAL del proveedor, nunca con un
// valor congelado de cuando se creo la compra.
function calcularLineaCompra({ kilos, precio_kg: precioKg }, proveedor) {
  const k = Number(kilos) || 0;
  const pk = Number(precioKg) || 0;

  const baseZgz = k * pk;
  // Campo historico de solo visualizacion (no alimenta totalFact) - se
  // conserva por paridad con el HTML actual, que lo calcula igual siempre.
  const baseZgzIva = baseZgz * 1.1;

  const proveedorTieneOp2 = !!(proveedor && proveedor.es_subasta_op);
  const op2 = proveedorTieneOp2 ? baseZgz * PORCENTAJE_OP : 0;
  const baseReal = baseZgz + op2;

  // Correccion del fallo de Fase 0 punto 4: el HTML actual hace
  // `iva = baseReal * 0.1` siempre. Aqui, si el proveedor es
  // intracomunitario, el IVA no lo repercute el proveedor (inversion del
  // sujeto pasivo) y la compra se registra con IVA 0.
  const esIntracomunitario = proveedor && proveedor.tipo_iva === 'INTRACOMUNITARIO';
  const ivaPct = esIntracomunitario ? 0 : IVA_PESCADO_PCT;
  const iva = baseReal * (ivaPct / 100);
  const totalFact = baseReal + iva;

  return {
    base_zgz: baseZgz,
    base_zgz_iva: baseZgzIva,
    op2,
    base_real: baseReal,
    iva,
    total_fact: totalFact,
  };
}

module.exports = { calcularLineaCompra, PORCENTAJE_OP, IVA_PESCADO_PCT };
