// Fase 2, punto 1: cálculo del 2% de OP (Obras del Puerto).
//
// Regla crítica (ver FASE_0 punto 2 y FASE_2 punto 1): el 2% se aplica SOLO
// si el proveedor está marcado como de subasta/lonja (es_subasta_op), y debe
// calcularse siempre EN VIVO leyendo el estado actual del proveedor en el
// momento de la compra — nunca guardado como fórmula congelada. El fallo
// histórico real (17 compras de dos proveedores, 20-25 junio 2026) fue
// exactamente por congelar esta fórmula, así que aquí no se cachea nada: se
// recibe el proveedor ya leído de la base de datos justo antes de calcular.
//
// Fase 2, punto 2: IVA en compras. Proveedor NACIONAL → 10% (tipo único del
// pescado). Proveedor INTRACOMUNITARIO → 0% (inversión del sujeto pasivo:
// el IVA no lo paga el proveedor extranjero, se autorrepercute internamente
// en la contabilidad, fuera del alcance de este sistema). Esto corrige el
// fallo conocido del HTML actual, que aplica 10% siempre sin distinguir
// (ver FASE_0 punto 4).

const IVA_PESCADO_PCT = 10;

function calcularLineaCompra({ kilos, precioKg, proveedor }) {
  if (kilos == null || precioKg == null) {
    throw new Error('calcularLineaCompra necesita "kilos" y "precioKg".');
  }
  if (!proveedor) {
    throw new Error('calcularLineaCompra necesita el proveedor (leído en vivo de la base de datos, no guardado de antes).');
  }

  const k = Number(kilos);
  const precio = Number(precioKg);
  const baseZgz = k * precio;
  const baseZgzIva = baseZgz * (1 + IVA_PESCADO_PCT / 100);

  // 2% OP: solo si el proveedor es de subasta/lonja, leído en vivo.
  const op2Importe = proveedor.es_subasta_op ? baseZgz * 0.02 : 0;
  const baseReal = baseZgz + op2Importe;

  // IVA de la compra: según el tipo fiscal del proveedor, leído en vivo.
  const ivaPct = proveedor.tipo_iva === 'INTRACOMUNITARIO' ? 0 : IVA_PESCADO_PCT;
  const ivaImporte = baseReal * (ivaPct / 100);
  const totalFactura = baseReal + ivaImporte;

  return { baseZgz, baseZgzIva, op2Importe, baseReal, ivaPct, ivaImporte, totalFactura };
}

function sumar(valores) {
  return valores.reduce((s, v) => s + (Number(v) || 0), 0);
}

function calcularCabeceraCompra(lineasCalculadas) {
  return {
    totalKilos: sumar(lineasCalculadas.map((l) => l.kilosOriginal)),
    totalBaseZgz: sumar(lineasCalculadas.map((l) => l.baseZgz)),
    totalBaseReal: sumar(lineasCalculadas.map((l) => l.baseReal)),
    totalIva: sumar(lineasCalculadas.map((l) => l.ivaImporte)),
    totalFactura: sumar(lineasCalculadas.map((l) => l.totalFactura)),
  };
}

module.exports = { calcularLineaCompra, calcularCabeceraCompra, IVA_PESCADO_PCT };
