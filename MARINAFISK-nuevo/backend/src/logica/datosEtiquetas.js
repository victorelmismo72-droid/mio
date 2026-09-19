// Resuelve los datos de una etiqueta física (trazabilidad + destinatario)
// a partir de un pedido/traspaso/reparto reales, o de los datos manuales de
// una "etiqueta suelta" — igual que datosImpresion.js hace para Transfrío/CMR.
// Ver FASE_5_etiquetas_MARINAFISK.md para de dónde sale cada regla: son las
// mismas que ya usa el HTML actual (MarinaFiskEtiquetas), no reglas nuevas.
const { DESTINATARIO_TRASPASO_ZARAGOZA } = require('../modelosImpresion');

const CONSTANTES_ETIQUETA = {
  categoria: 'E',
  calibre: '3',
  formaObtencion: 'CAPTURADO',
  modoPresentacion: 'C/C',
  modoConservacion: 'REFRIGERADO',
  expedidor: 'LONJA DEL PUERTO DE A CORUÑA',
  direccionExpedidor: 'A CORUÑA (A CORUÑA)',
  rsi: 'R.S.I. 12.08586/C',
};

const EXPEDIDOR_DAVID_SALA = {
  nombre: 'PESCADOS DAVID SALA BLANES',
  direccion: 'SERRALLARGA, 19 — 17300 BLANES (GIRONA)',
  rsi: 'N. REG. S: ES 12.023418/GI',
};

function fechaISO(f) {
  // Igual que fechaCorta() en datosImpresion.js: una columna DATE de
  // Postgres llega como objeto Date, no como texto "YYYY-MM-DD".
  if (!f) return '';
  return (f instanceof Date ? f.toISOString() : String(f)).slice(0, 10);
}

function fmtFechaCorta(f) {
  const iso = fechaISO(f);
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio.slice(2)}`;
}

// DDMMAA de la fecha del documento — el mismo lote para todo lo grabado ese
// día, no un número correlativo (igual que generarLoteDesdeFecha() del HTML actual).
function generarLoteDesdeFecha(f) {
  const iso = fechaISO(f);
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}${mes}${anio.slice(2)}`;
}

// 12 días fijo para el formato francés (Pomona, confirmado por Víctor en el
// código actual); el resto usa el número configurable en la tabla
// "configuracion" (compartido entre puestos — en el HTML actual esto vivía
// en localStorage, por ordenador, ver FASE_5 punto 1.2).
function calcularFechaCaducidad(f, formatoId, diasCaducidadConfigurados) {
  const iso = fechaISO(f);
  if (!iso) return null;
  const dias = formatoId === 'marina_fisk_fr' ? 12 : diasCaducidadConfigurados;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

// Cuántas etiquetas corresponden a una línea de pedido: si la línea tiene un
// descuento puesto (>0), ese número sustituye a la cantidad — es el mismo
// campo numérico reutilizado para dos cosas distintas en el HTML actual
// (ver FASE_5 punto 1.4). Se replica tal cual porque es el comportamiento
// real que ya usa Víctor, pero es una fuente de sorpresas si algún día un
// descuento real (de precio) coincide con una línea que también se etiqueta.
function copiasPorLinea(linea) {
  const cantidad = Math.round(Number(linea.cantidad) || 0);
  const descuento = Number(linea.descuento) || 0;
  return descuento > 0 ? Math.round(descuento) : cantidad;
}

function resolverExpedidor(formatoId) {
  if (formatoId === 'david_sala') {
    return { expedidor: EXPEDIDOR_DAVID_SALA.nombre, direccionExpedidor: EXPEDIDOR_DAVID_SALA.direccion, rsi: EXPEDIDOR_DAVID_SALA.rsi };
  }
  return { expedidor: CONSTANTES_ETIQUETA.expedidor, direccionExpedidor: CONSTANTES_ETIQUETA.direccionExpedidor, rsi: CONSTANTES_ETIQUETA.rsi };
}

// Desde una línea de un pedido de venta real (o desde un traspaso adaptado a
// la misma forma, ver datosEtiquetaTraspaso más abajo).
function datosEtiquetaLinea({ fecha, articulo, cliente, formatoId, diasCaducidad, destinatarioOverride }) {
  const dest = destinatarioOverride || {
    nombre: cliente ? cliente.nombre : '',
    direccion: cliente ? cliente.direccion || '' : '',
    provincia: cliente ? cliente.provincia || '' : '',
  };
  return {
    producto: (articulo && articulo.descripcion) || '(artículo sin descripción)',
    productoFrances: (articulo && (articulo.nombre_frances || articulo.descripcion)) || '(artículo sin descripción)',
    productoItaliano: (articulo && (articulo.nombre_italiano || articulo.descripcion)) || '(artículo sin descripción)',
    cientifico: (articulo && articulo.cientifico) || '',
    zona: (articulo && articulo.zona_fao) || '',
    subzona: (articulo && articulo.subzona) || '',
    artePesca: (articulo && articulo.arte_pesca) || '',
    barco: (articulo && articulo.barco) || 'VARIOS BARCOS',
    pesoEtiqueta: (articulo && articulo.peso_etiqueta) || 'VER CAJA',
    fecha: fmtFechaCorta(fecha),
    lote: generarLoteDesdeFecha(fecha),
    caducidad: fmtFechaCorta(calcularFechaCaducidad(fecha, formatoId, diasCaducidad)),
    destinatario: dest.nombre,
    direccion: dest.direccion,
    provincia: dest.provincia,
    categoria: CONSTANTES_ETIQUETA.categoria,
    calibre: (articulo && articulo.calibre) || CONSTANTES_ETIQUETA.calibre,
    formaObtencion: (articulo && articulo.forma_obtencion) || CONSTANTES_ETIQUETA.formaObtencion,
    modoPresentacion: (articulo && articulo.modo_presentacion) || CONSTANTES_ETIQUETA.modoPresentacion,
    modoConservacion: CONSTANTES_ETIQUETA.modoConservacion,
    ...resolverExpedidor(formatoId),
  };
}

// El traspaso no tiene cliente real (es un movimiento interno) — el
// destinatario es siempre el almacén de Zaragoza, la MISMA constante que ya
// usa la Hoja Transfrío (antes el HTML actual escribía aquí un texto ligeramente
// distinto, "MARINAFISK ZARAGOZA" en vez de "MARINA FISH ZARAGOZA" — un
// desajuste de nombres del propio HTML actual entre dos sitios que ya se
// unifica aquí, sin cambiar el sentido: es el mismo destino real).
function datosEtiquetaTraspaso({ fecha, articulo, diasCaducidad }) {
  return datosEtiquetaLinea({
    fecha,
    articulo,
    formatoId: 'marina_fisk',
    diasCaducidad,
    destinatarioOverride: { nombre: DESTINATARIO_TRASPASO_ZARAGOZA.nombre, direccion: '', provincia: DESTINATARIO_TRASPASO_ZARAGOZA.ciudad },
  });
}

// Desde una línea de un reparto real: a diferencia de un pedido, el
// barco/subzona/arte de pesca ya vienen en la propia línea del reparto (son
// los reales de esa entrega concreta), así que se usan tal cual en vez de
// los genéricos del artículo. La zona es siempre "FAO 27" (fijo, igual que
// el HTML actual). Formato siempre "scanfisk" (fijo, no configurable).
function datosEtiquetaReparto({ reparto, linea, articulo, diasCaducidad }) {
  return {
    producto: linea.descripcion_snapshot || (articulo && articulo.descripcion) || linea.articulo_codigo_snapshot || '(artículo sin descripción)',
    productoFrances: (articulo && articulo.descripcion) || linea.descripcion_snapshot || '',
    productoItaliano: (articulo && articulo.descripcion) || linea.descripcion_snapshot || '',
    cientifico: (articulo && articulo.cientifico) || '',
    zona: 'FAO 27',
    subzona: linea.subzona || (articulo && articulo.subzona) || '',
    artePesca: linea.arte_pesca || (articulo && articulo.arte_pesca) || '',
    barco: linea.barco || (articulo && articulo.barco) || 'VARIOS BARCOS',
    pesoEtiqueta: linea.peso_etiqueta ? `${linea.peso_etiqueta} kg` : ((articulo && articulo.peso_etiqueta) || 'VER CAJA'),
    fecha: fmtFechaCorta(reparto.fecha),
    lote: linea.lote || generarLoteDesdeFecha(reparto.fecha),
    caducidad: fmtFechaCorta(calcularFechaCaducidad(reparto.fecha, 'scanfisk', diasCaducidad)),
    destinatario: reparto.destinatario_nombre || '',
    direccion: reparto.destinatario_ciudad || '',
    provincia: reparto.destinatario_ciudad || '',
    categoria: CONSTANTES_ETIQUETA.categoria,
    calibre: (articulo && articulo.calibre) || CONSTANTES_ETIQUETA.calibre,
    formaObtencion: (articulo && articulo.forma_obtencion) || CONSTANTES_ETIQUETA.formaObtencion,
    modoPresentacion: (articulo && articulo.modo_presentacion) || CONSTANTES_ETIQUETA.modoPresentacion,
    modoConservacion: CONSTANTES_ETIQUETA.modoConservacion,
    expedidor: CONSTANTES_ETIQUETA.expedidor,
    direccionExpedidor: CONSTANTES_ETIQUETA.direccionExpedidor,
    rsi: 'Nº R.S.I.: 12.08586/C', // mismo número, redactado igual que en el HTML actual para este origen concreto
  };
}

// Etiqueta suelta (pantalla manual): el HTML actual, aquí, NO aplica el
// expedidor propio de David Sala aunque se elija ese formato — usa siempre
// el expedidor genérico de Lonja de A Coruña. Es una inconsistencia real del
// programa actual (el encabezado de empresa sí cambiaría, pero el campo
// EXPEDIDOR de la rejilla no); se replica tal cual, señalada aquí, en vez de
// "arreglarla" sin que Víctor lo haya pedido.
function datosEtiquetaSuelta({ fecha, cliente, articulo, formatoId, diasCaducidad, zonaOverride, subzonaOverride, arteOverride, pesoManual, loteManual }) {
  return {
    producto: (articulo && articulo.descripcion) || '(artículo sin descripción)',
    productoFrances: (articulo && (articulo.nombre_frances || articulo.descripcion)) || '',
    productoItaliano: (articulo && (articulo.nombre_italiano || articulo.descripcion)) || '',
    cientifico: (articulo && articulo.cientifico) || '',
    zona: zonaOverride || (articulo && articulo.zona_fao) || '',
    subzona: subzonaOverride || (articulo && articulo.subzona) || '',
    artePesca: arteOverride || (articulo && articulo.arte_pesca) || '',
    barco: (articulo && articulo.barco) || 'VARIOS BARCOS',
    pesoEtiqueta: pesoManual ? `${pesoManual} kg` : ((articulo && articulo.peso_etiqueta) || 'VER CAJA'),
    fecha: fmtFechaCorta(fecha),
    lote: loteManual || generarLoteDesdeFecha(fecha),
    caducidad: fmtFechaCorta(calcularFechaCaducidad(fecha, formatoId, diasCaducidad)),
    destinatario: (cliente && cliente.nombre) || '',
    direccion: (cliente && cliente.direccion) || '',
    provincia: (cliente && cliente.provincia) || '',
    categoria: CONSTANTES_ETIQUETA.categoria,
    calibre: (articulo && articulo.calibre) || CONSTANTES_ETIQUETA.calibre,
    formaObtencion: (articulo && articulo.forma_obtencion) || CONSTANTES_ETIQUETA.formaObtencion,
    modoPresentacion: (articulo && articulo.modo_presentacion) || CONSTANTES_ETIQUETA.modoPresentacion,
    modoConservacion: CONSTANTES_ETIQUETA.modoConservacion,
    expedidor: CONSTANTES_ETIQUETA.expedidor,
    direccionExpedidor: CONSTANTES_ETIQUETA.direccionExpedidor,
    rsi: CONSTANTES_ETIQUETA.rsi,
  };
}

module.exports = {
  CONSTANTES_ETIQUETA,
  EXPEDIDOR_DAVID_SALA,
  fmtFechaCorta,
  generarLoteDesdeFecha,
  calcularFechaCaducidad,
  copiasPorLinea,
  datosEtiquetaLinea,
  datosEtiquetaTraspaso,
  datosEtiquetaReparto,
  datosEtiquetaSuelta,
};
