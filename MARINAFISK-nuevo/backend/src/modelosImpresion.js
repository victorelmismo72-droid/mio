// Registro CENTRAL de todo lo que el sistema puede imprimir/generar —
// corrección 02/09/2026 punto 8: "mejor que el catálogo se genere
// automáticamente a partir de una lista central de modelos definidos en el
// código, en vez de mantenerse a mano en dos sitios distintos". Este es ese
// único sitio: la pantalla de catálogo (Fase 4) se construye leyendo este
// archivo, no repitiéndolo a mano. Añadir un modelo de impresión nuevo debe
// significar añadir una entrada aquí, nada más.
//
// "campos" son los datos que se colocan encima del papel — cada uno con una
// posición de partida en milímetros desde la esquina superior izquierda del
// papel. Para los que van sobre PAPEL PRE-IMPRESO del transportista
// (Transfrío, CMR), esas coordenadas son una ESTIMACIÓN DE PARTIDA, no una
// medida exacta — exactamente igual que en el HTML actual ("las coordenadas
// de partida se estimaron a partir de una foto del papel real... y se han
// ido calibrando en varias rondas con impresiones de prueba"). Nadie puede
// saltarse esa calibración con impresiones reales, ni el HTML actual pudo
// — así que estos valores son solo el punto de partida para que Víctor
// calibre con el editor visual (Fase 4), no un resultado ya terminado.
const IVA_INDICADOR = 'sobre papel pre-impreso: requiere calibración con impresiones reales';

const MODELOS = [
  {
    id: 'albaran_con_precios',
    nombre: 'Albarán (con precios)',
    descripcion: 'El albarán normal del pedido, con precios e importes — para el archivo interno y para el cliente si lo pide con precios.',
    aplicaA: ['pedido'],
    sobrePapelPreimpreso: false,
    campos: [],
  },
  {
    id: 'albaran_sin_precios',
    nombre: 'Albarán sin precios (versión conductor)',
    descripcion: 'Igual que el albarán normal, pero sin precios ni importes — para el transportista/conductor. Se puede imprimir de uno en uno o de varios pedidos seleccionados a la vez (Historial).',
    aplicaA: ['pedido'],
    sobrePapelPreimpreso: false,
    campos: [],
  },
  {
    id: 'transfrio',
    nombre: 'Hoja Transfrío',
    descripcion: `Se imprime encima del papel ya impreso del transportista Transfrío (destino, fecha, bultos y kilos) — disponible tanto para pedidos como para traspasos internos a Zaragoza (en traspasos, el destinatario es siempre "MARINA FISH ZARAGOZA", fijo, no depende del catálogo de Clientes). ${IVA_INDICADOR}. Se puede imprimir de uno en uno o de varios seleccionados a la vez (Historial).`,
    aplicaA: ['pedido', 'traspaso'],
    sobrePapelPreimpreso: true,
    campos: [
      { clave: 'destinatario', etiqueta: 'Destinatario', xMm: 25, yMm: 38 },
      { clave: 'destino', etiqueta: 'Destino/ciudad', xMm: 25, yMm: 50 },
      { clave: 'fecha', etiqueta: 'Fecha', xMm: 150, yMm: 38 },
      { clave: 'bultos', etiqueta: 'Bultos (cajas)', xMm: 150, yMm: 60 },
      { clave: 'kilos', etiqueta: 'Kilos', xMm: 150, yMm: 72 },
    ],
  },
  {
    id: 'cmr',
    nombre: 'Hoja CMR / Carta de Porte',
    descripcion: `Solo para clientes con agencia "MOZO" (transportista Mouzo Campos Trans, S.L., envíos a Portugal). Casillas numeradas según el formulario CMR oficial. ${IVA_INDICADOR}.`,
    aplicaA: ['pedido'],
    sobrePapelPreimpreso: true,
    condicionCliente: (cliente) => !!cliente && String(cliente.agencia || '').toUpperCase() === 'MOZO',
    campos: [
      { clave: 'casilla1_remitente', etiqueta: 'Casilla 1 — Remitente (Marinafisk, fijo)', xMm: 12, yMm: 14 },
      { clave: 'casilla2_consignatario', etiqueta: 'Casilla 2 — Consignatario (cliente)', xMm: 12, yMm: 48 },
      { clave: 'casilla3_entrega', etiqueta: 'Casilla 3 — Lugar de entrega (fijo)', xMm: 12, yMm: 85 },
      { clave: 'casilla4_carga', etiqueta: 'Casilla 4 — Lugar y fecha de carga (fijo + fecha)', xMm: 12, yMm: 100 },
      { clave: 'casilla5_albaran', etiqueta: 'Casilla 5 — Nº de albarán', xMm: 110, yMm: 85 },
      { clave: 'casilla6_mercancia', etiqueta: 'Casilla 6 — "Ver albarán adjunto" + cajas', xMm: 12, yMm: 130 },
      { clave: 'casilla11_peso', etiqueta: 'Casilla 11 — Peso bruto (kg)', xMm: 110, yMm: 160 },
      { clave: 'casilla21_formalizacion', etiqueta: 'Casilla 21 — Lugar y fecha de formalización (fijo + fecha)', xMm: 12, yMm: 260 },
    ],
  },
];

// Constantes fijas del sistema (FASE_4 corrección punto 7: "deben poder
// configurarse como constantes del sistema, no como texto libre que haya
// que volver a escribir cada vez").
const CONSTANTES_CMR = {
  remitente: 'MARINAFISK PESCADOS S.A.\nA Coruña (lonja/subasta)\nTel./CIF/Reg. sanitario: 12.01671/C',
  lugarEntrega: 'INSTALACIONES CUSTODIA - PORTUGAL',
  lugarCarga: 'A CORUÑA, ESPAÑA',
};
const DESTINATARIO_TRASPASO_ZARAGOZA = { nombre: 'MARINA FISH ZARAGOZA', ciudad: 'ZARAGOZA' };

function obtenerModelo(id) {
  return MODELOS.find((m) => m.id === id) || null;
}

module.exports = { MODELOS, obtenerModelo, CONSTANTES_CMR, DESTINATARIO_TRASPASO_ZARAGOZA };
