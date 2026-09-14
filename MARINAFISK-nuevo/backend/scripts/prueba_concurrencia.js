#!/usr/bin/env node
// Fase 3, punto 3: prueba REAL de concurrencia — no en teoría, con
// peticiones HTTP de verdad en paralelo contra el backend en marcha,
// simulando a CORU y PANC escribiendo a la vez.
//
// Requiere que el backend ya esté arrancado (npm start) y accesible en la
// URL indicada.
//
// Uso: node scripts/prueba_concurrencia.js [http://localhost:3001]
//
// Comprueba:
//  1. Que 50 pedidos de "CORU" + 50 de "PANC", creados EN PARALELO de
//     verdad, terminan con 100 números de pedido distintos y consecutivos
//     (sin huecos ni repetidos) — esto es justo lo que falló en el pasado
//     con contadores de localStorage (667 duplicados el 28/07/2026).
//  2. Lo mismo con compras (dato sagrado, y además más lento por tener que
//     leer el proveedor en vivo para calcular OP2/IVA en cada una).
//  3. Que el puesto_id de cada registro corresponde de verdad a quién lo
//     creó (CORU/PANC), leído de la cabecera X-Puesto-Codigo.
//  4. Que mandar 25 peticiones EN PARALELO con el MISMO uid (el caso real
//     del doble clic, corrección 02/09/2026 punto 1) crea exactamente 1
//     registro, no 25 — bajo concurrencia de verdad, no solo secuencial.
require('dotenv').config();
const { Pool } = require('pg');

const BASE_URL = process.argv[2] || 'http://localhost:3001';
const PREFIJO = 'UID-CONCURRENCIA-' + Date.now();

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'marinafisk',
  user: process.env.PGUSER || 'marinafisk_app',
  password: process.env.PGPASSWORD || 'marinafisk_dev',
});

const lineasInforme = [];
function log(l = '') { console.log(l); lineasInforme.push(l); }

async function post(ruta, puestoCodigo, body) {
  const r = await fetch(`${BASE_URL}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Puesto-Codigo': puestoCodigo },
    body: JSON.stringify(body),
  });
  const texto = await r.text();
  let json;
  try { json = JSON.parse(texto); } catch (e) { json = { errorCrudo: texto }; }
  return { status: r.status, json };
}

function numerosContiguosSinHuecos(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const sinDuplicados = new Set(ordenados).size === ordenados.length;
  let sinHuecos = true;
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i] !== ordenados[i - 1] + 1) { sinHuecos = false; break; }
  }
  return { sinDuplicados, sinHuecos, minimo: ordenados[0], maximo: ordenados[ordenados.length - 1] };
}

async function probarPedidosConcurrentes(clienteId) {
  log('## 1. 50 pedidos de CORU + 50 de PANC, en paralelo de verdad');
  log('');
  const peticiones = [];
  for (let i = 0; i < 50; i++) {
    peticiones.push(post('/api/pedidos', 'CORU', {
      uid: `${PREFIJO}-PED-CORU-${i}`, fecha: '2026-09-14', cliente_id: clienteId,
      lineas: [{ peso: 1, precio: 1, total: 1 }],
    }));
    peticiones.push(post('/api/pedidos', 'PANC', {
      uid: `${PREFIJO}-PED-PANC-${i}`, fecha: '2026-09-14', cliente_id: clienteId,
      lineas: [{ peso: 1, precio: 1, total: 1 }],
    }));
  }
  const t0 = Date.now();
  const respuestas = await Promise.all(peticiones);
  const ms = Date.now() - t0;

  const fallidas = respuestas.filter((r) => r.status >= 400);
  log(`100 peticiones en paralelo resueltas en ${ms} ms. Fallidas: ${fallidas.length}`);
  if (fallidas.length) log('Ejemplo de fallo: ' + JSON.stringify(fallidas[0].json));

  const r = await pool.query("SELECT numero, puesto_id FROM pedidos WHERE uid LIKE $1", [`${PREFIJO}-PED-%`]);
  const numeros = r.rows.map((x) => x.numero);
  const { sinDuplicados, sinHuecos, minimo, maximo } = numerosContiguosSinHuecos(numeros);
  log(`Pedidos creados en la base de datos: ${r.rows.length} (esperados 100). Números: ${minimo}–${maximo}.`);
  log(`Sin números repetidos: ${sinDuplicados ? 'sí' : 'NO — FALLO'}. Sin huecos: ${sinHuecos ? 'sí' : 'NO — FALLO'}.`);

  const puestos = await pool.query('SELECT codigo, id FROM puestos');
  const idCoru = puestos.rows.find((p) => p.codigo === 'CORU').id;
  const idPanc = puestos.rows.find((p) => p.codigo === 'PANC').id;
  const rCoru = await pool.query("SELECT count(*)::int n FROM pedidos WHERE uid LIKE $1 AND puesto_id = $2", [`${PREFIJO}-PED-CORU-%`, idCoru]);
  const rPanc = await pool.query("SELECT count(*)::int n FROM pedidos WHERE uid LIKE $1 AND puesto_id = $2", [`${PREFIJO}-PED-PANC-%`, idPanc]);
  log(`De los pedidos con uid "...-CORU-*", tienen puesto_id de CORU: ${rCoru.rows[0].n}/50. De los "...-PANC-*", tienen puesto_id de PANC: ${rPanc.rows[0].n}/50.`);
  log('');

  return r.rows.length === 100 && sinDuplicados && sinHuecos && fallidas.length === 0
    && rCoru.rows[0].n === 50 && rPanc.rows[0].n === 50;
}

async function probarComprasConcurrentes(proveedorId) {
  log('## 2. 50 compras de CORU + 50 de PANC, en paralelo de verdad (dato sagrado)');
  log('');
  const peticiones = [];
  for (let i = 0; i < 50; i++) {
    peticiones.push(post('/api/compras', 'CORU', {
      uid: `${PREFIJO}-COM-CORU-${i}`, numero_partida: 90000 + i, fecha: '2026-09-14',
      proveedor_id: proveedorId, lineas: [{ kilos: 1, precio_kg: 1 }],
    }));
    peticiones.push(post('/api/compras', 'PANC', {
      uid: `${PREFIJO}-COM-PANC-${i}`, numero_partida: 91000 + i, fecha: '2026-09-14',
      proveedor_id: proveedorId, lineas: [{ kilos: 1, precio_kg: 1 }],
    }));
  }
  const t0 = Date.now();
  const respuestas = await Promise.all(peticiones);
  const ms = Date.now() - t0;
  const fallidas = respuestas.filter((r) => r.status >= 400);
  log(`100 peticiones en paralelo resueltas en ${ms} ms. Fallidas: ${fallidas.length}`);
  if (fallidas.length) log('Ejemplo de fallo: ' + JSON.stringify(fallidas[0].json));

  const r = await pool.query("SELECT id FROM compras WHERE uid LIKE $1", [`${PREFIJO}-COM-%`]);
  log(`Compras creadas en la base de datos: ${r.rows.length} (esperadas 100).`);
  log('');
  return r.rows.length === 100 && fallidas.length === 0;
}

async function probarMismoUidEnParalelo(clienteId) {
  log('## 3. 25 peticiones EN PARALELO con el MISMO uid (el caso real del doble clic)');
  log('');
  const uid = `${PREFIJO}-DOBLECLIC`;
  const peticiones = Array.from({ length: 25 }, () => post('/api/pedidos', 'CORU', {
    uid, fecha: '2026-09-14', cliente_id: clienteId, lineas: [{ peso: 1, precio: 1, total: 1 }],
  }));
  const respuestas = await Promise.all(peticiones);
  const codigos = respuestas.map((r) => r.status);
  const creados201 = codigos.filter((c) => c === 201).length;
  const yaExistia200 = codigos.filter((c) => c === 200).length;
  const enCurso409 = codigos.filter((c) => c === 409).length;
  log(`25 peticiones simultáneas con el mismo uid → ${creados201} crearon (201), ${yaExistia200} recibieron "ya grabado" (200), ${enCurso409} recibieron "en curso, no dupliques" (409).`);

  const r = await pool.query('SELECT count(*)::int n FROM pedidos WHERE uid = $1', [uid]);
  log(`Filas realmente creadas en la base de datos con ese uid: ${r.rows[0].n} (debe ser exactamente 1, aunque llegaran 25 peticiones a la vez).`);
  log('');
  return r.rows[0].n === 1 && creados201 === 1;
}

async function main() {
  log('# Prueba de concurrencia real (Fase 3)');
  log('');
  log(`Backend probado: ${BASE_URL}`);
  log(`Fecha de esta prueba: ${new Date().toISOString()}`);
  log('');

  const cliente = await pool.query('SELECT id FROM clientes LIMIT 1');
  const proveedor = await pool.query('SELECT id FROM proveedores LIMIT 1');
  if (!cliente.rows.length || !proveedor.rows.length) {
    console.error('Hace falta al menos un cliente y un proveedor en la base de datos para esta prueba.');
    process.exit(1);
  }

  const resultados = {
    pedidos: await probarPedidosConcurrentes(cliente.rows[0].id),
    compras: await probarComprasConcurrentes(proveedor.rows[0].id),
    dobleClic: await probarMismoUidEnParalelo(cliente.rows[0].id),
  };

  const todoOk = Object.values(resultados).every(Boolean);
  log('## Conclusión');
  log('');
  log(todoOk
    ? '**Prueba de concurrencia superada: ni un número repetido, ni un hueco, ni un duplicado por doble clic — con peticiones de verdad en paralelo, no en teoría.**'
    : '**Fallos en la prueba de concurrencia — ver detalle arriba, no dar la fase por cerrada.**');

  const fs = require('fs');
  const path = require('path');
  const ruta = path.join(__dirname, '..', '..', `VERIFICACION_FASE3_CONCURRENCIA_${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(ruta, lineasInforme.join('\n') + '\n');
  console.log(`\nInforme escrito en: ${ruta}`);
  console.log(todoOk ? '\n✔ CONCURRENCIA SUPERADA' : '\n✘ CONCURRENCIA CON FALLOS');

  await pool.end();
  process.exitCode = todoOk ? 0 : 1;
}

main();
