require('dotenv').config();
const { Pool, types } = require('pg');

// Fallo real conocido del HTML actual, confirmado por Víctor (informe de
// bugs, 29/08/2026): dejar que una libreria de fechas "haga la conversion a
// su manera" desplaza el dia cuando el huso horario del servidor no es UTC
// (SheetJS lo hacia mal con el desfase respecto a 30/12/1899). El driver de
// PostgreSQL tiene el mismo riesgo: por defecto convierte una columna DATE
// en un objeto Date de JavaScript a medianoche LOCAL, y al pasar por
// JSON.stringify (toISOString) eso se reinterpreta en UTC - en cualquier
// huso horario positivo (como el de Espana) la fecha sale desplazada un dia
// hacia atras. Aqui se desactiva esa conversion: una columna DATE llega
// siempre tal cual, como texto 'AAAA-MM-DD', sin pasar nunca por un objeto
// Date con zona horaria de por medio (Fase 0 punto 7). Esto aplica a TODA
// la aplicacion, no pantalla por pantalla, precisamente para que ninguna
// pantalla nueva pueda reintroducir el mismo fallo sin darse cuenta.
types.setTypeParser(types.builtins.DATE, (valor) => valor);

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
