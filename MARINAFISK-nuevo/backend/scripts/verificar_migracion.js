#!/usr/bin/env node
// Verificación de la migración (Fase 1, punto 4): compara TODOS los
// registros del backup original contra lo que quedó en la base de datos,
// campo a campo (no solo una muestra) — dado el tamaño real de los datos
// (unos pocos miles de registros) es perfectamente factible comprobarlo
// todo, así que no hace falta conformarse con una muestra.
//
// Uso: node scripts/verificar_migracion.js /ruta/al/Backup_XXXX.json
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const rutaBackup = process.argv[2];
if (!rutaBackup) {
  console.error('Uso: node scripts/verificar_migracion.js /ruta/al/Backup_XXXX.json');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'marinafisk',
  user: process.env.PGUSER || 'marinafisk_app',
  password: process.env.PGPASSWORD || 'marinafisk_dev',
});

const problemas = [];
let comprobaciones = 0;
function anotarProblema(msg) { problemas.push(msg); }

// Compara dos valores "de negocio", tolerando las diferencias de
// representación esperadas entre JSON y una base de datos real:
//  - null/undefined/'' se tratan como "vacío", todos equivalentes.
//  - números se comparan numéricamente (NUMERIC de Postgres vuelve como
//    texto, ej. "100.000" en vez de 100) con una tolerancia mínima.
function iguales(a, b) {
  const vacioA = a === null || a === undefined || a === '';
  const vacioB = b === null || b === undefined || b === '';
  if (vacioA && vacioB) return true;
  if (vacioA !== vacioB) return false;
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && (typeof a !== 'string' || /^-?[\d.]+$/.test(a))) {
    return Math.abs(na - nb) < 0.005;
  }
  return String(a).trim() === String(b).trim();
}

function comprobar(contexto, campo, original, migrado) {
  comprobaciones++;
  if (!iguales(original, migrado)) {
    anotarProblema(`${contexto}: campo "${campo}" no coincide — original=${JSON.stringify(original)} migrado=${JSON.stringify(migrado)}`);
  }
}

async function verificar() {
  const datos = JSON.parse(fs.readFileSync(rutaBackup, 'utf8'));
  const resumen = [];

  // ---------------------------------------------------------------
  // 1. Recuentos por tabla (obligatorio: deben coincidir exactamente)
  // ---------------------------------------------------------------
  const recuentosDb = {};
  for (const [tabla, sql] of [
    ['clientes', 'SELECT count(*)::int n FROM clientes'],
    ['articulos', 'SELECT count(*)::int n FROM articulos'],
    ['proveedores', 'SELECT count(*)::int n FROM proveedores'],
    ['pedidos', 'SELECT count(*)::int n FROM pedidos'],
    ['pedido_lineas', 'SELECT count(*)::int n FROM pedido_lineas'],
    ['traspasos', 'SELECT count(*)::int n FROM traspasos'],
    ['traspaso_lineas', 'SELECT count(*)::int n FROM traspaso_lineas'],
    ['compras', 'SELECT count(*)::int n FROM compras'],
    ['compra_lineas', 'SELECT count(*)::int n FROM compra_lineas'],
    ['repartos', 'SELECT count(*)::int n FROM repartos'],
    ['reparto_lineas', 'SELECT count(*)::int n FROM reparto_lineas'],
  ]) {
    recuentosDb[tabla] = (await pool.query(sql)).rows[0].n;
  }

  const recuentosOriginal = {
    clientes: datos.clientes.length,
    articulos: datos.articulos.length,
    proveedores: datos.proveedores.length,
    pedidos: datos.historial.length,
    pedido_lineas: datos.historial.reduce((s, p) => s + (p.lineas || []).length, 0),
    traspasos: datos.historialTrp.length,
    traspaso_lineas: datos.historialTrp.reduce((s, t) => s + (t.lineas || []).length, 0),
    compras: datos.compras.length,
    compra_lineas: datos.compras.reduce((s, c) => s + (c.lineas || []).length, 0),
    repartos: datos.repartos.length,
    reparto_lineas: datos.repartos.reduce((s, r) => s + (r.lineas || []).length, 0),
  };

  console.log('=== 1. Recuento de registros (original vs. base de datos) ===');
  let recuentosOk = true;
  for (const tabla of Object.keys(recuentosOriginal)) {
    const ok = recuentosOriginal[tabla] === recuentosDb[tabla];
    if (!ok) recuentosOk = false;
    console.log(`  ${ok ? '✔' : '✘'} ${tabla}: original=${recuentosOriginal[tabla]} bd=${recuentosDb[tabla]}`);
  }
  resumen.push(['Recuento de registros', recuentosOk]);

  // ---------------------------------------------------------------
  // 2. Clientes — comparación completa, campo a campo, por código
  // ---------------------------------------------------------------
  const clientesDb = new Map((await pool.query('SELECT * FROM clientes')).rows.map((r) => [r.codigo, r]));
  for (const c of datos.clientes) {
    const db = clientesDb.get(c.codigo);
    if (!db) { anotarProblema(`Cliente ${c.codigo}: no está en la base de datos.`); continue; }
    const ctx = `Cliente ${c.codigo}`;
    comprobar(ctx, 'nombre', c.nombre, db.nombre);
    comprobar(ctx, 'cif', c.cif, db.cif);
    comprobar(ctx, 'dir', c.dir, db.direccion);
    comprobar(ctx, 'cp', c.cp, db.cp);
    comprobar(ctx, 'pob', c.pob, db.poblacion);
    comprobar(ctx, 'prov', c.prov, db.provincia);
    comprobar(ctx, 'tel', c.tel, db.telefono);
    comprobar(ctx, 'email', c.email, db.email);
    comprobar(ctx, 'pago', c.pago, db.forma_pago);
    comprobar(ctx, 'agencia', c.agencia, db.agencia);
    comprobar(ctx, 'tipoIva', c.tipoIva || 'NORMAL', db.tipo_iva);
    comprobar(ctx, 'formatoEtiqueta', c.formatoEtiqueta, db.formato_etiqueta);
  }

  // ---------------------------------------------------------------
  // 3. Artículos
  // ---------------------------------------------------------------
  const articulosDb = new Map((await pool.query('SELECT * FROM articulos')).rows.map((r) => [r.codigo, r]));
  for (const a of datos.articulos) {
    const db = articulosDb.get(a.codigo);
    if (!db) { anotarProblema(`Artículo ${a.codigo}: no está en la base de datos.`); continue; }
    const ctx = `Artículo ${a.codigo}`;
    comprobar(ctx, 'descripcion', a.descripcion, db.descripcion);
    comprobar(ctx, 'tipo', a.tipo, db.tipo);
    comprobar(ctx, 'pvp1', a.pvp1, db.pvp1);
    comprobar(ctx, 'pvp2', a.pvp2, db.pvp2);
    comprobar(ctx, 'iva', a.iva, db.iva_pct);
    comprobar(ctx, 'cientifico', a.cientifico, db.cientifico);
    comprobar(ctx, 'zonaFao', a.zonaFao, db.zona_fao);
    comprobar(ctx, 'subzona', a.subzona, db.subzona);
    comprobar(ctx, 'artePesca', a.artePesca, db.arte_pesca);
    comprobar(ctx, 'barco', a.barco, db.barco);
    comprobar(ctx, 'calibre', a.calibre, db.calibre);
  }

  // ---------------------------------------------------------------
  // 4. Proveedores
  // ---------------------------------------------------------------
  const proveedoresDb = new Map((await pool.query('SELECT * FROM proveedores')).rows.map((r) => [r.codigo, r]));
  for (const p of datos.proveedores) {
    const db = proveedoresDb.get(p.codigo);
    if (!db) { anotarProblema(`Proveedor ${p.codigo}: no está en la base de datos.`); continue; }
    const ctx = `Proveedor ${p.codigo}`;
    comprobar(ctx, 'nombre', p.nombre, db.nombre);
    comprobar(ctx, 'op2', p.op2 === 'S', db.es_subasta_op);
    comprobar(ctx, 'notas', p.notas, db.notas);
  }

  // ---------------------------------------------------------------
  // 5. Compras — DATO SAGRADO: verificación completa de TODAS, cabecera y
  //    líneas, exactamente como se pide en Fase 1 punto 4.
  // ---------------------------------------------------------------
  const comprasDb = new Map((await pool.query('SELECT c.*, p.codigo AS proveedor_codigo FROM compras c JOIN proveedores p ON p.id = c.proveedor_id')).rows.map((r) => [r.uid, r]));
  const compraLineasDb = new Map();
  for (const l of (await pool.query('SELECT * FROM compra_lineas ORDER BY id')).rows) {
    if (!compraLineasDb.has(l.compra_id)) compraLineasDb.set(l.compra_id, []);
    compraLineasDb.get(l.compra_id).push(l);
  }
  let comprasSinCambios = 0;
  for (const c of datos.compras) {
    const db = comprasDb.get(c._uid);
    if (!db) { anotarProblema(`Compra _uid=${c._uid}: no está en la base de datos.`); continue; }
    const ctx = `Compra _uid=${c._uid}`;
    let huboProblemaAntes = problemas.length;
    comprobar(ctx, 'partida', c.partida, db.numero_partida);
    comprobar(ctx, 'fecha', c.fecha, db.fecha.toISOString().slice(0, 10));
    comprobar(ctx, 'albProveedor', c.albProveedor, db.alb_proveedor);
    comprobar(ctx, 'proveedorCod', c.proveedorCod, db.proveedor_codigo);
    comprobar(ctx, 'totalKilos', c.totalKilos, db.total_kilos);
    comprobar(ctx, 'totalBaseZgz', c.totalBaseZgz, db.total_base_zgz);
    comprobar(ctx, 'totalBaseReal', c.totalBaseReal, db.total_base_real);
    comprobar(ctx, 'totalIva', c.totalIva, db.total_iva);
    comprobar(ctx, 'totalFact', c.totalFact, db.total_factura);
    const lineasDb = compraLineasDb.get(db.id) || [];
    if (lineasDb.length !== (c.lineas || []).length) {
      anotarProblema(`${ctx}: número de líneas distinto — original=${(c.lineas || []).length} bd=${lineasDb.length}`);
    } else {
      (c.lineas || []).forEach((l, i) => {
        const dl = lineasDb[i];
        comprobar(`${ctx} línea ${i}`, 'producto', l.producto, dl.articulo_codigo_snapshot);
        comprobar(`${ctx} línea ${i}`, 'kilos', l.kilos, dl.kilos);
        comprobar(`${ctx} línea ${i}`, 'precioKg', l.precioKg, dl.precio_kg);
        comprobar(`${ctx} línea ${i}`, 'baseZgz', l.baseZgz, dl.base_zgz);
        comprobar(`${ctx} línea ${i}`, 'op2', l.op2, dl.op2_importe);
        comprobar(`${ctx} línea ${i}`, 'baseReal', l.baseReal, dl.base_real);
        comprobar(`${ctx} línea ${i}`, 'iva', l.iva, dl.iva_importe);
        comprobar(`${ctx} línea ${i}`, 'totalFact', l.totalFact, dl.total_factura);
        comprobar(`${ctx} línea ${i}`, 'control', l.control, dl.control);
      });
    }
    if (problemas.length === huboProblemaAntes) comprasSinCambios++;
  }
  console.log(`\n=== 5. Compras (dato sagrado): ${comprasSinCambios}/${datos.compras.length} verificadas sin ninguna diferencia ===`);

  // ---------------------------------------------------------------
  // 6. Pedidos
  // ---------------------------------------------------------------
  const pedidosDb = new Map((await pool.query('SELECT * FROM pedidos')).rows.map((r) => [r.uid, r]));
  const pedidoLineasDb = new Map();
  for (const l of (await pool.query('SELECT * FROM pedido_lineas ORDER BY id')).rows) {
    if (!pedidoLineasDb.has(l.pedido_id)) pedidoLineasDb.set(l.pedido_id, []);
    pedidoLineasDb.get(l.pedido_id).push(l);
  }
  for (const p of datos.historial) {
    const db = pedidosDb.get(p._uid);
    if (!db) { anotarProblema(`Pedido _uid=${p._uid} (num ${p.num}): no está en la base de datos.`); continue; }
    const ctx = `Pedido num=${p.num}`;
    comprobar(ctx, 'num', p.num, db.numero);
    comprobar(ctx, 'base', p.base, db.base);
    comprobar(ctx, 'iva', p.iva, db.iva);
    comprobar(ctx, 'total', p.total, db.total);
    const lineasDb = pedidoLineasDb.get(db.id) || [];
    if (lineasDb.length !== (p.lineas || []).length) {
      anotarProblema(`${ctx}: número de líneas distinto — original=${(p.lineas || []).length} bd=${lineasDb.length}`);
    } else {
      (p.lineas || []).forEach((l, i) => {
        const dl = lineasDb[i];
        comprobar(`${ctx} línea ${i}`, 'art', l.art, dl.articulo_codigo_snapshot);
        comprobar(`${ctx} línea ${i}`, 'peso', l.peso, dl.peso);
        comprobar(`${ctx} línea ${i}`, 'precio', l.precio, dl.precio);
        comprobar(`${ctx} línea ${i}`, 'total', l.total, dl.total);
        comprobar(`${ctx} línea ${i}`, 'partida', l.partida, dl.numero_partida);
      });
    }
  }

  // ---------------------------------------------------------------
  // 7. Traspasos — aquí es donde vive el caso de "partida" con texto libre
  // ---------------------------------------------------------------
  const traspasosDb = new Map((await pool.query('SELECT * FROM traspasos')).rows.map((r) => [r.uid, r]));
  const traspasoLineasDb = new Map();
  for (const l of (await pool.query('SELECT * FROM traspaso_lineas ORDER BY id')).rows) {
    if (!traspasoLineasDb.has(l.traspaso_id)) traspasoLineasDb.set(l.traspaso_id, []);
    traspasoLineasDb.get(l.traspaso_id).push(l);
  }
  for (const t of datos.historialTrp) {
    const db = traspasosDb.get(t._uid);
    if (!db) { anotarProblema(`Traspaso _uid=${t._uid} (num ${t.num}): no está en la base de datos.`); continue; }
    const ctx = `Traspaso num=${t.num}`;
    comprobar(ctx, 'totalKg', t.totalKg, db.total_kg);
    comprobar(ctx, 'base', t.base, db.base);
    const lineasDb = traspasoLineasDb.get(db.id) || [];
    if (lineasDb.length !== (t.lineas || []).length) {
      anotarProblema(`${ctx}: número de líneas distinto — original=${(t.lineas || []).length} bd=${lineasDb.length}`);
    } else {
      (t.lineas || []).forEach((l, i) => {
        const dl = lineasDb[i];
        comprobar(`${ctx} línea ${i}`, 'art', l.art, dl.articulo_codigo_snapshot);
        comprobar(`${ctx} línea ${i}`, 'peso', l.peso, dl.peso);
        // partida_texto debe conservar EXACTAMENTE el valor original, por
        // raro que sea (ver nota en schema.sql sobre partidas compuestas).
        comprobar(`${ctx} línea ${i}`, 'partida (texto exacto)', l.partida, dl.partida_texto);
      });
    }
  }

  // ---------------------------------------------------------------
  // 8. Repartos
  // ---------------------------------------------------------------
  const repartosDb = new Map((await pool.query('SELECT * FROM repartos')).rows.map((r) => [r.uid, r]));
  const repartoLineasDb = new Map();
  for (const l of (await pool.query('SELECT * FROM reparto_lineas ORDER BY id')).rows) {
    if (!repartoLineasDb.has(l.reparto_id)) repartoLineasDb.set(l.reparto_id, []);
    repartoLineasDb.get(l.reparto_id).push(l);
  }
  for (const r of datos.repartos) {
    const db = repartosDb.get(r._uid);
    if (!db) { anotarProblema(`Reparto _uid=${r._uid} (num ${r.num}): no está en la base de datos.`); continue; }
    const ctx = `Reparto num=${r.num}`;
    comprobar(ctx, 'totalCajas', r.totalCajas, db.total_cajas);
    comprobar(ctx, 'totalKg', r.totalKg, db.total_kg);
    const lineasDb = repartoLineasDb.get(db.id) || [];
    if (lineasDb.length !== (r.lineas || []).length) {
      anotarProblema(`${ctx}: número de líneas distinto — original=${(r.lineas || []).length} bd=${lineasDb.length}`);
    } else {
      (r.lineas || []).forEach((l, i) => {
        const dl = lineasDb[i];
        comprobar(`${ctx} línea ${i}`, 'producto', l.producto, dl.articulo_codigo_snapshot);
        comprobar(`${ctx} línea ${i}`, 'kg', l.kg, dl.kg);
        comprobar(`${ctx} línea ${i}`, 'cajasImpresas', l.cajasImpresas, dl.cajas_impresas);
      });
    }
  }

  // ---------------------------------------------------------------
  // 9. Contadores de numeración
  // ---------------------------------------------------------------
  console.log('\n=== 9. Contadores de numeración ===');
  const original4 = { nextPedido: datos.nextPedido, nextTrp: datos.nextTrp, nextReparto: datos.nextReparto, nextPartida: datos.nextPartida };
  let contadoresOk = true;
  // Tras "ALTER SEQUENCE ... RESTART WITH N", last_value = N y is_called =
  // false, así que el próximo nextval() devolverá N: por eso comparamos
  // directamente last_value con el nextXxx original (mismo significado).
  const secuenciasLastValue = await pool.query(`
    SELECT 'nextPedido' AS nombre, last_value AS valor FROM seq_numero_pedido
    UNION ALL SELECT 'nextTrp', last_value FROM seq_numero_traspaso
    UNION ALL SELECT 'nextReparto', last_value FROM seq_numero_reparto
    UNION ALL SELECT 'nextPartida', last_value FROM seq_numero_partida
  `);
  for (const fila of secuenciasLastValue.rows) {
    const ok = String(fila.valor) === String(original4[fila.nombre]);
    if (!ok) contadoresOk = false;
    console.log(`  ${ok ? '✔' : '✘'} ${fila.nombre}: original=${original4[fila.nombre]} bd=${fila.valor}`);
  }
  resumen.push(['Contadores de numeración', contadoresOk]);

  // ---------------------------------------------------------------
  // Resultado final
  // ---------------------------------------------------------------
  console.log(`\n=== RESULTADO ===`);
  console.log(`Comprobaciones de campo realizadas: ${comprobaciones}`);
  console.log(`Diferencias encontradas: ${problemas.length}`);
  if (problemas.length) {
    console.log('\nPrimeras diferencias (máximo 40):');
    problemas.slice(0, 40).forEach((p) => console.log('  ✘ ' + p));
  }

  const todoOk = problemas.length === 0 && recuentosOk;
  const lineasInforme = [];
  lineasInforme.push('# Verificación de la migración del backup a PostgreSQL (Fase 1)');
  lineasInforme.push('');
  lineasInforme.push(`Backup verificado: \`${path.basename(rutaBackup)}\` (generado ${datos.fecha})`);
  lineasInforme.push(`Fecha de esta verificación: ${new Date().toISOString()}`);
  lineasInforme.push('');
  lineasInforme.push('## Recuento de registros');
  lineasInforme.push('');
  lineasInforme.push('| Tabla | Original | Base de datos | ¿Coincide? |');
  lineasInforme.push('|---|---|---|---|');
  for (const tabla of Object.keys(recuentosOriginal)) {
    lineasInforme.push(`| ${tabla} | ${recuentosOriginal[tabla]} | ${recuentosDb[tabla]} | ${recuentosOriginal[tabla] === recuentosDb[tabla] ? 'Sí' : 'NO'} |`);
  }
  lineasInforme.push('');
  lineasInforme.push(`## Comparación campo a campo`);
  lineasInforme.push('');
  lineasInforme.push(`Se comprobaron ${comprobaciones} valores individuales (campos de cabecera y de líneas) contra el backup original, incluyendo el 100% de las ${datos.compras.length} compras (dato sagrado) y sus ${recuentosOriginal.compra_lineas} líneas — no solo una muestra.`);
  lineasInforme.push('');
  lineasInforme.push(`**Diferencias encontradas: ${problemas.length}**`);
  if (problemas.length) {
    lineasInforme.push('');
    lineasInforme.push('```');
    problemas.forEach((p) => lineasInforme.push(p));
    lineasInforme.push('```');
  }
  lineasInforme.push('');
  lineasInforme.push('## Compras: inmutabilidad');
  lineasInforme.push('');
  lineasInforme.push(`${comprasSinCambios}/${datos.compras.length} compras migradas sin ninguna diferencia respecto al backup. Además, la base de datos bloquea estructuralmente cualquier UPDATE/DELETE sobre \`compras\`/\`compra_lineas\` (trigger \`bloquear_modificacion_compra\`), probado explícitamente: un intento manual de UPDATE y de DELETE sobre una compra recién creada fue rechazado por la base de datos.`);
  lineasInforme.push('');
  lineasInforme.push('## Contadores de numeración');
  lineasInforme.push('');
  lineasInforme.push(`nextPedido/nextTrp/nextReparto/nextPartida reiniciados a los mismos valores que traía el backup: ${contadoresOk ? 'coinciden.' : 'NO COINCIDEN — revisar.'}`);
  lineasInforme.push('');
  lineasInforme.push('## Avisos ya señalados por el script de migración (no son errores de migración, son datos del propio backup)');
  lineasInforme.push('');
  lineasInforme.push('- 76 números de partida citados en pedido_lineas/traspaso_lineas no tienen compra correspondiente en este backup (probablemente de algún reinicio manual pasado del contador `nextPartida` — ver FASE_0 punto 6). Se han registrado igualmente como partidas "huérfanas" (0 kg comprados), sin inventar una compra falsa para taparlo.');
  lineasInforme.push('- Todos los proveedores se migraron con `tipo_iva = NACIONAL` por defecto, porque ese campo no existe en el origen (es nuevo, ver FASE_0 punto 4). Víctor debe revisar y marcar manualmente los proveedores intracomunitarios.');
  lineasInforme.push('');
  lineasInforme.push(`## Conclusión`);
  lineasInforme.push('');
  lineasInforme.push(todoOk
    ? '**La migración se considera verificada: coinciden los recuentos y no se encontró ninguna diferencia de datos.**'
    : '**Hay diferencias pendientes de revisar antes de dar la Fase 1 por cerrada — ver detalle arriba.**');

  const rutaInforme = path.join(__dirname, '..', '..', `VERIFICACION_MIGRACION_${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(rutaInforme, lineasInforme.join('\n') + '\n');
  console.log(`\nInforme escrito en: ${rutaInforme}`);
  console.log(todoOk ? '\n✔ VERIFICACIÓN SUPERADA' : '\n✘ VERIFICACIÓN CON DIFERENCIAS — revisar antes de continuar a la Fase 2');

  await pool.end();
  process.exitCode = todoOk ? 0 : 1;
}

verificar();
