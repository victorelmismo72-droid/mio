// Fase 2, punto 2: IVA y Recargo de Equivalencia en ventas.
//
// Esto es lógica NUEVA que no existe correctamente en el HTML actual (hoy
// simplemente no se aplica recargo de equivalencia en ningún caso) — se
// construye aquí desde cero, según lo pedido en FASE_2, punto 2:
//
//   - Cliente NORMAL, sin recargo               → IVA 10% normal.
//   - Cliente NORMAL con Recargo de Equivalencia → IVA 10% + recargo.
//   - Cliente INTRACOMUNITARIO                   → operación intracomunitaria
//     (mismo criterio que en compras: sin IVA, inversión del sujeto pasivo).
//
// ⚠️ AVISO PARA VÍCTOR (tal como pide FASE_2 punto 2, "señalar dudas
// normativas, no asumir"): el porcentaje de recargo de equivalencia para
// productos al 10% de IVA es del 1,4% según la normativa vigente en España
// desde 2012 — es el valor usado aquí, pero conviene que tu asesoría fiscal
// lo confirme antes de facturar con él de verdad, por si ha cambiado o por
// si aplica alguna excepción concreta a vuestro caso.
const IVA_PESCADO_PCT = 10;
const RECARGO_EQUIVALENCIA_PCT = 1.4; // ver aviso arriba: confirmar con asesoría

function calcularIvaVenta({ tipoIvaCliente, baseImponible }) {
  const base = Number(baseImponible) || 0;
  let ivaPct = IVA_PESCADO_PCT;
  let recargoPct = 0;

  if (tipoIvaCliente === 'INTRACOMUNITARIO') {
    ivaPct = 0;
    recargoPct = 0;
  } else if (tipoIvaCliente === 'RECARGO_EQUIVALENCIA') {
    ivaPct = IVA_PESCADO_PCT;
    recargoPct = RECARGO_EQUIVALENCIA_PCT;
  } else {
    // NORMAL (o cualquier valor no reconocido: se trata como normal, nunca
    // se deja el IVA en blanco/sin aplicar — ese era el fallo a evitar).
    ivaPct = IVA_PESCADO_PCT;
    recargoPct = 0;
  }

  const ivaImporte = base * (ivaPct / 100);
  const recargoImporte = base * (recargoPct / 100);
  const total = base + ivaImporte + recargoImporte;

  return { ivaPct, recargoPct, ivaImporte, recargoImporte, total };
}

module.exports = { calcularIvaVenta, IVA_PESCADO_PCT, RECARGO_EQUIVALENCIA_PCT };
