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
