#!/usr/bin/env node
/*
 * MARINAFISK - Fase 1, punto 4: verificacion obligatoria de la migracion.
 *
 * Compara la base de datos contra el backup JSON original:
 *  1. Mismo numero de registros en cada tabla.
 *  2. Una muestra representativa (no solo los primeros) comparada campo a
 *     campo.
 *  3. Comprobacion especifica de que ningun registro de `compras` se ha
 *     alterado (dato sagrado).
 *
 * Uso: node scripts/verificar_migracion.js /ruta/al/backup.json
 */

require('dotenv').config();
const fs = require('fs');
const { pool } = require('../src/db');

const rutaBackup = process.argv[2];
if (!rutaBackup) {
  console.error('Uso: node scripts/verificar_migracion.js /ruta/al/backup.json');
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(rutaBackup, 'utf8'));

let fallos = 0;
function ok(msg) { console.log('  OK  ' + msg); }
function fail(msg) { console.log('  FALLO ' + msg); fallos++; }

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function casiIgual(a, b) {
  if (a === null && b === null) return true;
  const na = numOrNull(a), nb = numOrNull(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) < 0.005;
  return String(a ?? '') === String(b ?? '');
}

async function verificarConteo(nombre, backupArr, sql) {
  const { rows } = await pool.query(sql);
  const enBD = Number(rows[0].n);
  const enBackup = (backupArr || []).length;
  if (enBD === enBackup) ok(`${nombre}: ${enBD} registros (coincide con el backup)`);
  else fail(`${nombre}: ${enBD} en BD vs ${enBackup} en backup`);
  return { enBD, enBackup };
}

function muestraRepresentativa(arr, n = 15) {
  if (arr.length <= n) return arr.map((_, i) => i);
  const paso = Math.floor(arr.length / n);
  const idx = [];
  for (let i = 0; i < arr.length; i += paso) idx.push(i);
  return idx.slice(0, n);
}

async function verificarClientesMuestra() {
  console.log('\nMuestra de clientes (campo a campo):');
  const idx = muestraRepresentativa(backup.clientes);
  for (const i of idx) {
    const c = backup.clientes[i];
    const { rows } = await pool.query('SELECT * FROM clientes WHERE codigo = $1', [c.codigo]);
    if (!rows.length) { fail(`cliente ${c.codigo} no encontrado en BD`); continue; }
    const r = rows[0];
    const campos = [
      ['nombre', c.nombre, r.nombre], ['cif', c.cif, r.cif], ['dir', c.dir, r.direccion],
      ['cp', c.cp, r.cp], ['pob', c.pob, r.poblacion], ['prov', c.prov, r.provincia],
      ['tel', c.tel, r.telefono], ['pago', c.pago, r.forma_pago],
    ];
    const malos = campos.filter(([, a, b]) => !casiIgual(a, b));
    if (malos.length) fail(`cliente ${c.codigo}: difiere en ${malos.map((m) => m[0]).join(', ')}`);
    else ok(`cliente ${c.codigo} coincide`);
  }
}

async function verificarComprasIntegridad() {
  console.log('\nVerificacion especifica de compras (dato sagrado):');
  const idx = muestraRepresentativa(backup.compras, 20);
  for (const i of idx) {
    const c = backup.compras[i];
    const { rows } = await pool.query(
      `SELECT * FROM compras WHERE proveedor_codigo = $1 AND fecha = $2 AND numero_partida = $3 AND total_fact = $4`,
      [c.proveedorCod, c.fecha, numOrNull(c.partida), numOrNull(c.totalFact)]
    );
    if (!rows.length) { fail(`compra proveedor=${c.proveedorCod} fecha=${c.fecha} partida=${c.partida} no encontrada tal cual en BD`); continue; }
    const r = rows[0];
    const { rows: lineasBD } = await pool.query('SELECT * FROM compra_lineas WHERE compra_id = $1 ORDER BY id', [r.id]);
    if (lineasBD.length !== (c.lineas || []).length) {
      fail(`compra id=${r.id}: ${lineasBD.length} lineas en BD vs ${(c.lineas || []).length} en backup`);
      continue;
    }
    let lineasOk = true;
    (c.lineas || []).forEach((l, li) => {
      const lb = lineasBD[li];
      const campos = [
        ['producto', l.producto, lb.producto], ['kilos', l.kilos, lb.kilos],
        ['precioKg', l.precioKg, lb.precio_kg], ['baseReal', l.baseReal, lb.base_real],
        ['totalFact', l.totalFact, lb.total_fact],
      ];
      const malos = campos.filter(([, a, b]) => !casiIgual(a, b));
      if (malos.length) { lineasOk = false; fail(`compra id=${r.id} linea ${li}: difiere en ${malos.map((m) => m[0]).join(', ')}`); }
    });
    if (lineasOk) ok(`compra id=${r.id} (partida ${c.partida}) y sus lineas coinciden exactamente`);
  }

  // Intento explicito de alterar una compra ya migrada, para demostrar que
  // el bloqueo estructural sigue activo despues de la migracion.
  const { rows: alguna } = await pool.query('SELECT id FROM compras LIMIT 1');
  if (alguna.length) {
    try {
      await pool.query('UPDATE compras SET total_fact = 0 WHERE id = $1', [alguna[0].id]);
      fail('se ha podido modificar un registro de compras - ESTO NO DEBERIA PASAR');
    } catch (e) {
      ok('intento de UPDATE sobre compras rechazado por la base de datos (' + e.message.split('\n')[0] + ')');
    }
  }
}

async function main() {
  console.log('=== Verificacion de conteos ===');
  await verificarConteo('clientes', backup.clientes, 'SELECT count(*) n FROM clientes');
  await verificarConteo('articulos', backup.articulos, 'SELECT count(*) n FROM articulos');
  await verificarConteo('proveedores', backup.proveedores, 'SELECT count(*) n FROM proveedores');
  await verificarConteo('compras', backup.compras, 'SELECT count(*) n FROM compras');
  await verificarConteo('pedidos (historial)', backup.historial, 'SELECT count(*) n FROM pedidos');
  await verificarConteo('traspasos (historialTrp)', backup.historialTrp, 'SELECT count(*) n FROM traspasos');
  await verificarConteo('repartos', backup.repartos, 'SELECT count(*) n FROM repartos');

  const lineasCompraBackup = (backup.compras || []).reduce((a, c) => a + (c.lineas || []).length, 0);
  const lineasPedidoBackup = (backup.historial || []).reduce((a, h) => a + (h.lineas || []).length, 0);
  await verificarConteo('compra_lineas', { length: lineasCompraBackup }, 'SELECT count(*) n FROM compra_lineas');
  await verificarConteo('pedido_lineas', { length: lineasPedidoBackup }, 'SELECT count(*) n FROM pedido_lineas');

  await verificarClientesMuestra();
  await verificarComprasIntegridad();

  console.log('\n=== Resultado ===');
  if (fallos === 0) console.log('Todo correcto: 0 discrepancias encontradas.');
  else console.log(`${fallos} discrepancia(s) encontradas - revisar antes de cerrar la Fase 1.`);
  await pool.end();
  process.exit(fallos ? 1 : 0);
}

main();
