/*
 * MARINAFISK - Fase 2, punto 2: IVA y Recargo de Equivalencia en ventas.
 *
 * Esta logica no se usa todavia en ningun documento real (el HTML actual
 * solo genera albaranes, no facturas), pero se deja lista para el futuro
 * modulo de facturacion (ver Fase 1 punto 6), tal y como pide la Fase 2.
 *
 * Reglas (ver FASE_0, punto 4 y FASE_2, punto 2):
 *  - Cliente Nacional sin Recargo de Equivalencia -> IVA 10% normal.
 *  - Cliente Nacional con Recargo de Equivalencia -> IVA 10% + recargo de
 *    equivalencia. El porcentaje de recargo correspondiente al tipo de IVA
 *    del 10% es, segun la normativa espanola vigente al escribir esto,
 *    1,4% — CONFIRMAR CON VICTOR/ASESORIA antes de usarlo en una factura
 *    real, tal y como pide la Fase 2 (no esta cerrado con seguridad).
 *  - Cliente Intracomunitario -> se trata como entrega intracomunitaria
 *    exenta de IVA (0%), simetrico a como se trata ya una COMPRA a un
 *    proveedor intracomunitario. ESTO ES UN SUPUESTO, no una confirmacion
 *    de Victor/asesoria — la Fase 2 lo deja explicitamente pendiente
 *    ("a confirmar con Victor/asesoria si hace falta"). No usar en una
 *    factura real sin esa confirmacion.
 */

const IVA_PESCADO_PCT = 10;
const RECARGO_EQUIVALENCIA_PCT = 1.4; // ver aviso arriba: confirmar vigencia

function calcularIvaVenta(baseImponible, cliente) {
  const base = Number(baseImponible) || 0;

  if (cliente && cliente.tipo_iva === 'INTRACOMUNITARIO') {
    return {
      iva_pct: 0,
      recargo_pct: 0,
      iva_importe: 0,
      recargo_importe: 0,
      total: base,
      regla_aplicada: 'INTRACOMUNITARIO_SUPUESTO_EXENTO',
    };
  }

  const ivaImporte = base * (IVA_PESCADO_PCT / 100);
  const conRecargo = !!(cliente && cliente.recargo_equivalencia);
  const recargoImporte = conRecargo ? base * (RECARGO_EQUIVALENCIA_PCT / 100) : 0;

  return {
    iva_pct: IVA_PESCADO_PCT,
    recargo_pct: conRecargo ? RECARGO_EQUIVALENCIA_PCT : 0,
    iva_importe: ivaImporte,
    recargo_importe: recargoImporte,
    total: base + ivaImporte + recargoImporte,
    regla_aplicada: conRecargo ? 'NACIONAL_CON_RECARGO' : 'NACIONAL_NORMAL',
  };
}

module.exports = { calcularIvaVenta, IVA_PESCADO_PCT, RECARGO_EQUIVALENCIA_PCT };
