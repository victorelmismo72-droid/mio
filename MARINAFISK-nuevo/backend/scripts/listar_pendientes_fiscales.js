#!/usr/bin/env node
/*
 * Lista los registros que necesitan revision manual de Victor tras la
 * migracion de la Fase 1, porque el backup antiguo no distinguia todavia
 * la clasificacion fiscal nueva (ver Fase 1, punto 2.1):
 *
 *  - Proveedores: todos se han migrado como NACIONAL por defecto, porque el
 *    programa actual no guardaba esta distincion. Hay que marcar a mano
 *    cuales son intracomunitarios.
 *  - Clientes con Recargo de Equivalencia: se migraron asumiendo NACIONAL
 *    (el recargo de equivalencia es un mecanismo espanol) - conviene
 *    confirmar que ninguno es en realidad un cliente intracomunitario.
 *
 * No se imprime nada de esto en documentos versionados en git porque son
 * datos reales de clientes/proveedores.
 *
 * Uso: node scripts/listar_pendientes_fiscales.js
 */
require('dotenv').config();
const { pool } = require('../src/db');

async function main() {
  const proveedores = await pool.query(
    `SELECT codigo, nombre, es_subasta_op FROM proveedores ORDER BY codigo`
  );
  const clientesRecargo = await pool.query(
    `SELECT codigo, nombre, poblacion, provincia FROM clientes WHERE recargo_equivalencia = true ORDER BY codigo`
  );

  console.log(`\n=== Proveedores a revisar (${proveedores.rows.length}) ===`);
  console.log('Todos se migraron como NACIONAL por defecto. Marca con tipo_iva=INTRACOMUNITARIO');
  console.log('los que correspondan via la API (PUT /api/proveedores/:id) o directamente en la BD.\n');
  for (const p of proveedores.rows) {
    console.log(`  ${p.codigo}\t${p.nombre}\t${p.es_subasta_op ? 'subasta/lonja' : ''}`);
  }

  console.log(`\n=== Clientes con Recargo de Equivalencia (${clientesRecargo.rows.length}) ===`);
  console.log('Se migraron como NACIONAL + recargo=true. Confirma que ninguno es intracomunitario.\n');
  for (const c of clientesRecargo.rows) {
    console.log(`  ${c.codigo}\t${c.nombre}\t${c.poblacion || ''} (${c.provincia || ''})`);
  }

  await pool.end();
}

main();
