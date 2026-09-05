// Log basico de escrituras (Fase 1, punto 3): cada vez que se crea, modifica
// o borra un registro, se anota aqui que tabla, que operacion y desde que
// puesto (CORU/PANC) - util mas adelante (Fase 3) para depurar problemas de
// sincronizacion entre los dos puestos.
const { prisma } = require('./db');

async function registrarEscritura(tabla, operacion, registroId, puestoOrigen) {
  try {
    await prisma.logEscritura.create({
      data: { tabla, operacion, registroId: registroId ?? null, puestoOrigen: puestoOrigen ?? null },
    });
  } catch (err) {
    // Un fallo al escribir el log NUNCA debe impedir que se guarde el dato real.
    console.error('No se pudo registrar en el log de escrituras:', err.message);
  }
}

module.exports = { registrarEscritura };
