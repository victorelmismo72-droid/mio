require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Registra en audit_log quien escribio que y cuando (Fase 1, punto 3).
// No es un log de negocio: solo sirve para depurar problemas de sincronizacion
// mas adelante (Fase 3).
async function registrarAuditoria(client, { tabla, accion, registroId, puestoOrigen, detalle }) {
  await client.query(
    `INSERT INTO audit_log (tabla, accion, registro_id, puesto_origen, detalle)
     VALUES ($1, $2, $3, $4, $5)`,
    [tabla, accion, registroId != null ? String(registroId) : null, puestoOrigen || null, detalle ? JSON.stringify(detalle) : null]
  );
}

// Un campo numerico dejado vacio en un formulario llega como '' (texto),
// no como null - Postgres no acepta '' como numero. Se trata igual que "no
// informado" en cualquier INSERT/UPDATE generico.
function vacioComoNull(v) {
  return v === '' || v === undefined ? null : v;
}

module.exports = { pool, registrarAuditoria, vacioComoNull };
