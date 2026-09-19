// Registro central de los formatos de etiqueta (FASE_5 punto 1.3) — los 6 ya
// reales en los datos migrados (columna clientes.formato_etiqueta). Todos
// comparten la misma rejilla física (50x145mm); solo cambian el encabezado
// de empresa y el idioma, que se construyen en el navegador
// (backend/public/js/impresion/etiquetas.js) — aquí solo vive la lista, para
// que el desplegable de Clientes y el catálogo de modelos de impresión no
// puedan quedarse desactualizados respecto a lo que el motor sabe imprimir
// (mismo principio que backend/src/modelosImpresion.js, corrección punto 8).
const FORMATO_POR_DEFECTO = 'marina_fisk';

const FORMATOS_ETIQUETA = [
  { id: 'marina_fisk', nombre: 'Marina Fisk (estándar)' },
  { id: 'marina_fisk_fr', nombre: 'Marina Fisk (Francés — Pomona)' },
  { id: 'marina_fisk_it', nombre: 'Marina Fisk (Italiano)' },
  { id: 'marina_fisk_masymas', nombre: 'Marina Fisk (Más y Más)' },
  { id: 'david_sala', nombre: 'Pescados David Sala Blanes' },
  { id: 'scanfisk', nombre: 'Scanfisk Seafood (reparto supermercados)' },
];

function formatoValido(id) {
  return FORMATOS_ETIQUETA.some((f) => f.id === id);
}

function formatoParaCliente(cliente) {
  const id = cliente && cliente.formato_etiqueta;
  return formatoValido(id) ? id : FORMATO_POR_DEFECTO;
}

module.exports = { FORMATOS_ETIQUETA, FORMATO_POR_DEFECTO, formatoValido, formatoParaCliente };
