// Registro básico de qué se ha escrito y cuándo (Fase 1, punto 3), útil más
// adelante en Fase 3 para depurar problemas de sincronización entre puestos.
async function registrarEscritura(cliente, { tabla, operacion, registroId, puestoId, detalle }) {
  await cliente.query(
    `INSERT INTO log_escrituras (tabla, operacion, registro_id, puesto_id, detalle)
     VALUES ($1, $2, $3, $4, $5)`,
    [tabla, operacion, registroId != null ? String(registroId) : null, puestoId || null, detalle ? JSON.stringify(detalle) : null]
  );
}

module.exports = { registrarEscritura };
