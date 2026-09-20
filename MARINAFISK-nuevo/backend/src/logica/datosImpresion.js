// Resuelve los VALORES concretos (texto) que van en cada campo de un
// documento imprimible, a partir de un pedido o traspaso real. Vive en el
// backend (no en el navegador) porque usa las mismas constantes fijas del
// sistema que el registro central de modelos — así no hay que volver a
// escribirlas en cada pantalla que imprima algo (FASE_4 corrección punto 7).
const { CONSTANTES_CMR, DESTINATARIO_TRASPASO_ZARAGOZA } = require('../modelosImpresion');

function fechaCorta(f) {
  if (!f) return '';
  // Las columnas DATE de Postgres llegan aquí como objeto Date (no como
  // texto): hay que pasarlas por toISOString() antes de recortar, si no
  // sale algo como "Tue Jun 02 2026..." en vez de "2026-06-02".
  return (f instanceof Date ? f.toISOString() : String(f)).slice(0, 10);
}

function valoresTransfrioPedido(pedido, lineas) {
  const bultos = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const kilos = lineas.reduce((s, l) => s + (Number(l.peso) || 0), 0);
  return {
    destinatario: pedido.cliente_nombre_snapshot || '',
    destino: pedido.cliente_pob_snapshot || '',
    fecha: fechaCorta(pedido.fecha),
    bultos: String(bultos),
    kilos: kilos.toFixed(2),
  };
}

function valoresTransfrioTraspaso(traspaso, lineas) {
  const bultos = lineas.reduce((s, l) => s + (Number(l.cajas) || 0), 0);
  return {
    destinatario: DESTINATARIO_TRASPASO_ZARAGOZA.nombre,
    destino: DESTINATARIO_TRASPASO_ZARAGOZA.ciudad,
    fecha: fechaCorta(traspaso.fecha),
    bultos: String(bultos),
    kilos: Number(traspaso.total_kg || 0).toFixed(2),
  };
}

function valoresCmr(pedido, lineas) {
  const bultos = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const kilos = lineas.reduce((s, l) => s + (Number(l.peso) || 0), 0);
  return {
    casilla1_remitente: CONSTANTES_CMR.remitente,
    casilla2_consignatario: `${pedido.cliente_nombre_snapshot || ''}\n${pedido.cliente_dir_snapshot || ''}\n${pedido.cliente_pob_snapshot || ''}`,
    casilla3_entrega: CONSTANTES_CMR.lugarEntrega,
    casilla4_carga: `${CONSTANTES_CMR.lugarCarga}\n${fechaCorta(pedido.fecha)}`,
    casilla5_albaran: String(pedido.numero),
    casilla6_mercancia: `VER ALBARÁN ADJUNTO\n${bultos} cajas`,
    casilla11_peso: `${kilos.toFixed(2)} kg`,
    casilla21_formalizacion: `A CORUÑA\n${fechaCorta(pedido.fecha)}`,
  };
}

module.exports = { valoresTransfrioPedido, valoresTransfrioTraspaso, valoresCmr };
