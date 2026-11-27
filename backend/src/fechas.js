// Normaliza el campo "fecha" de una cabecera antes de pasarla a Prisma. El
// HTML actual genera fechas con fechaLocalISO(), que da un texto local
// "YYYY-MM-DD" (ver Fase 0 punto 7 - nunca UTC de paso). Prisma exige un
// datetime ISO completo (o un objeto Date de JS) incluso para columnas
// @db.Date - sin esto, cualquier ruta que reciba una fecha en ese formato
// tal cual (el más natural para un frontend construido sobre este backend)
// fallaría con un error de validación en vez de grabar el dato. Desajuste
// real encontrado el 13/09/2026 al probar /listas-precio y /repartos con
// una fecha en ese formato.
function conFechaNormalizada(cabecera) {
  if (cabecera.fecha == null) return cabecera;
  return { ...cabecera, fecha: new Date(cabecera.fecha) };
}

module.exports = { conFechaNormalizada };
