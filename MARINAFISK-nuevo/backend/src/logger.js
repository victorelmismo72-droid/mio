// Log básico de escrituras (Fase 1, punto 3): qué tabla, qué operación,
// referencia del registro y cuándo. Sirve para depurar problemas de
// sincronización más adelante (Fase 3).
const { pool } = require('./db');

async function registrarEscritura(client, { tabla, operacion, referencia, detalle }) {
  const ejecutor = client || pool;
  await ejecutor.query(
    `INSERT INTO log_escrituras (tabla, operacion, referencia, detalle)
     VALUES ($1, $2, $3, $4)`,
    [tabla, operacion, referencia ? String(referencia) : null, detalle ? JSON.stringify(detalle) : null]
  );
}

module.exports = { registrarEscritura };
