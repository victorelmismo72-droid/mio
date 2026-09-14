// Fase 2, punto 3: emparejamiento de "misma familia de producto".
//
// Reproduce exactamente sonMismaFamiliaProducto() del HTML actual: sirve
// para saber si un código de venta (p.ej. una talla concreta C13004) puede
// tirar de una partida comprada con un código más genérico (p.ej. C1300).
//
// Regla (ver FASE_0 punto 3): el código corto debe ser un PREFIJO LITERAL
// del código largo, de 4 caracteres o más, **y además** la primera palabra
// de la descripción del catálogo debe coincidir. El prefijo solo NO basta
// — hay falsos positivos conocidos y reales, como "C144" siendo prefijo
// literal de "C1444" sin ser el mismo producto en absoluto.

function primeraPalabra(descripcion) {
  const t = String(descripcion || '').trim().toUpperCase();
  if (!t) return '';
  return t.split(/\s+/)[0];
}

function sonMismaFamilia(codigoA, descripcionA, codigoB, descripcionB) {
  const a = String(codigoA || '').toUpperCase();
  const b = String(codigoB || '').toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true; // exactamente el mismo código de artículo

  const corto = a.length <= b.length ? a : b;
  const largo = a.length <= b.length ? b : a;
  if (corto.length < 4) return false;
  if (!largo.startsWith(corto)) return false;

  const palabraA = primeraPalabra(descripcionA);
  const palabraB = primeraPalabra(descripcionB);
  return !!palabraA && palabraA === palabraB;
}

module.exports = { sonMismaFamilia, primeraPalabra };
