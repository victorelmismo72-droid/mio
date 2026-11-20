// Agencias de transporte: lista cerrada de valores válidos, con
// normalización de nombres mal escritos que ya existían en el catálogo real
// de Víctor (ver RESUMEN_COMPLETO_para_Code_18-11-2026_2.md, 19/11/2026).
// Antes no había ninguna validación: el campo era texto libre y acumuló
// variantes mal escritas (CARPIN, HOLLANO, MOZO) que luego complicaban
// cualquier filtro o comparación por agencia (ej. el botón de la Hoja CMR,
// que depende de que la agencia sea exactamente "MOUZO").
const AGENCIAS_VALIDAS = ['TRANSFRIO', 'KARTIN', 'OLANO', 'MOUZO', 'FARIÑA'];

const CORRECCIONES_CONOCIDAS = {
  CARPIN: 'KARTIN',
  HOLLANO: 'OLANO',
  HOLANO: 'OLANO',
  MOZO: 'MOUZO',
};

// null/undefined o cadena vacía se dejan pasar tal cual (agencia no es
// obligatoria); cualquier otra cosa tiene que acabar siendo una de las
// válidas, corrigiendo primero los errores de escritura ya conocidos.
function normalizarAgencia(valor) {
  if (valor == null) return valor;
  const limpio = String(valor).trim().toUpperCase();
  if (limpio === '') return null;
  const normalizada = CORRECCIONES_CONOCIDAS[limpio] || limpio;
  if (!AGENCIAS_VALIDAS.includes(normalizada)) {
    throw new Error(`Agencia de transporte no válida: "${valor}". Las válidas son: ${AGENCIAS_VALIDAS.join(', ')}.`);
  }
  return normalizada;
}

module.exports = { AGENCIAS_VALIDAS, normalizarAgencia };
