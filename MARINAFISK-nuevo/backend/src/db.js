// Conexión a la base de datos. Un único "pool" compartido por toda la app.
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'marinafisk',
  user: process.env.PGUSER || 'marinafisk_app',
  password: process.env.PGPASSWORD || 'marinafisk_dev',
});

// Sin este manejador, un error en una conexión ya en reposo del pool (p.ej.
// PostgreSQL reiniciándose, o un corte de red momentáneo entre los dos
// puestos) tira TODO el proceso de Node abajo sin ningún aviso — es un
// comportamiento conocido de node-postgres, no un caso hipotético. Con él,
// el error se registra y el pool sigue funcionando con el resto de
// conexiones.
pool.on('error', (err) => {
  console.error('Error en una conexión del pool de PostgreSQL (en reposo):', err.message);
});

async function consulta(texto, parametros) {
  return pool.query(texto, parametros);
}

// Ejecuta una serie de pasos dentro de una única transacción: si algo falla
// a mitad, se deshace todo (evita dejar una compra a medias, por ejemplo).
async function conTransaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, consulta, conTransaccion };
