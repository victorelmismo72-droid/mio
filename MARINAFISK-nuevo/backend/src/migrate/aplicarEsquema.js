// Aplica schema.sql a la base de datos configurada en .env.
// Uso: npm run migrate:schema
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });

  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Esquema aplicado correctamente.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error aplicando el esquema:', err.message);
  process.exit(1);
});
