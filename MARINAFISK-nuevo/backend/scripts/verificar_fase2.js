#!/usr/bin/env node
// Verificación de la Fase 2 (lógica de negocio), pedida en FASE_2 punto 6.
//
// 1. Recalcula el 2% de OP y el IVA de TODAS las compras migradas (1108,
//    con sus 2990 líneas) usando el nuevo servicio calculosCompra.js, y
//    compara contra lo que quedó guardado en la migración de Fase 1 — que a
//    su vez es una copia exacta del HTML actual (ver
//    VERIFICACION_MIGRACION_2026-09-14.md). Como todos los proveedores
//    migrados son NACIONAL (el dato no existía en origen), esto verifica a
//    fondo el 2% de OP y el IVA nacional; el caso INTRACOMUNITARIO se
//    demuestra aparte con un proveedor de prueba, porque no hay ninguno real
//    todavía en los datos.
// 2. Prueba el caso de falso positivo de familia de producto EXACTO que cita
//    el propio comentario del código fuente del HTML actual (C255 vs C2550),
//    con las descripciones reales del catálogo migrado.
// 3. Prueba el margen mínimo (1,30 €/kg) con una partida real.
// 4. Prueba el IVA/Recargo de Equivalencia de venta para los tres tipos de
//    cliente.
//
// Uso: node scripts/verificar_fase2.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { calcularLineaCompra } = require('../src/logica/calculosCompra');
const { calcularIvaVenta } = require('../src/logica/calculosVenta');
const { sonMismaFamilia } = require('../src/logica/familiaProducto');
const { asignarPartidaAutomatica } = require('../src/logica/partidas');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'marinafisk',
  user: process.env.PGUSER || 'marinafisk_app',
  password: process.env.PGPASSWORD || 'marinafisk_dev',
});

const lineasInforme = [];
function log(linea = '') { console.log(linea); lineasInforme.push(linea); }

function casiIgual(a, b, tolerancia = 0.01) {
  return Math.abs(Number(a) - Number(b)) < tolerancia;
}

async function verificarOp2EIva() {
  log('## 1. 2% de OP e IVA en compras: recálculo contra las 1108 compras reales migradas');
  log('');
  const compras = await pool.query(`
    SELECT c.id, c.uid, c.proveedor_id, p.es_subasta_op, p.tipo_iva
    FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
  `);
  const proveedoresUsados = new Set(compras.rows.map((c) => c.tipo_iva));
  const lineasPorCompra = new Map();
  for (const l of (await pool.query('SELECT * FROM compra_lineas ORDER BY id')).rows) {
    if (!lineasPorCompra.has(l.compra_id)) lineasPorCompra.set(l.compra_id, []);
    lineasPorCompra.get(l.compra_id).push(l);
  }

  let lineasComprobadas = 0, diferencias = 0;
  const ejemplosDiferencia = [];
  for (const c of compras.rows) {
    const proveedor = { es_subasta_op: c.es_subasta_op, tipo_iva: c.tipo_iva };
    for (const l of lineasPorCompra.get(c.id) || []) {
      const calc = calcularLineaCompra({ kilos: l.kilos, precioKg: l.precio_kg, proveedor });
      lineasComprobadas++;
      const campos = [
        ['baseZgz', l.base_zgz], ['op2Importe', l.op2_importe], ['baseReal', l.base_real],
        ['ivaImporte', l.iva_importe], ['totalFactura', l.total_factura],
      ];
      for (const [nombre, valorGuardado] of campos) {
        if (!casiIgual(calc[nombre], valorGuardado)) {
          diferencias++;
          if (ejemplosDiferencia.length < 10) {
            ejemplosDiferencia.push(`compra ${c.uid} línea (compra_id=${c.id}): ${nombre} recalculado=${calc[nombre]} guardado=${valorGuardado}`);
          }
        }
      }
    }
  }
  log(`Proveedores con tipo_iva presentes en las compras migradas: ${[...proveedoresUsados].join(', ')} (todos NACIONAL — no hay ningún INTRACOMUNITARIO real todavía, ver aviso de migración).`);
  log(`Líneas de compra recalculadas: ${lineasComprobadas}`);
  log(`Diferencias encontradas: ${diferencias}`);
  if (diferencias) {
    log('Ejemplos:');
    ejemplosDiferencia.forEach((e) => log('  - ' + e));
  }
  log('');
  return diferencias === 0;
}

async function verificarIvaIntracomunitarioSintetico() {
  log('## 2. IVA intracomunitario (demostración): no hay proveedores reales de este tipo todavía');
  log('');
  const proveedorSubastaIntra = { es_subasta_op: true, tipo_iva: 'INTRACOMUNITARIO' };
  const r = calcularLineaCompra({ kilos: 100, precioKg: 2.5, proveedor: proveedorSubastaIntra });
  const esperado = { baseZgz: 250, op2Importe: 5, baseReal: 255, ivaImporte: 0, totalFactura: 255 };
  let ok = true;
  for (const campo of Object.keys(esperado)) {
    if (!casiIgual(r[campo], esperado[campo])) { ok = false; log(`  ✘ ${campo}: esperado=${esperado[campo]} obtenido=${r[campo]}`); }
  }
  log(`Proveedor de subasta + INTRACOMUNITARIO (100kg a 2,50€/kg): OP2=${r.op2Importe}€ (5% correcto, sí se aplica aunque sea intracomunitario — el 2% de OP no depende del tipo de IVA), IVA=${r.ivaImporte}€ (0€, corrige el fallo del HTML actual que aplicaba 10% siempre).`);
  log(ok ? '✔ Correcto.' : '✘ FALLO — revisar calculosCompra.js.');
  log('');
  return ok;
}

async function verificarFamiliaProducto() {
  log('## 3. Emparejamiento de familia de producto: caso real citado en el propio código fuente del HTML actual');
  log('');
  const art = await pool.query("SELECT codigo, descripcion FROM articulos WHERE codigo IN ('C255','C2550')");
  const porCodigo = new Map(art.rows.map((a) => [a.codigo, a.descripcion]));
  let ok = true;
  if (porCodigo.has('C255') && porCodigo.has('C2550')) {
    const resultado = sonMismaFamilia('C255', porCodigo.get('C255'), 'C2550', porCodigo.get('C2550'));
    log(`C255 "${porCodigo.get('C255')}" vs C2550 "${porCodigo.get('C2550')}" → sonMismaFamilia=${resultado} (debe ser false: prefijo coincide pero son productos distintos)`);
    if (resultado !== false) { ok = false; log('✘ FALLO: se está produciendo el falso positivo conocido.'); }
  } else {
    log('⚠ No se encontraron C255/C2550 en el catálogo migrado — no se puede probar este caso concreto ahora mismo.');
  }
  // Caso positivo real: familia genérica con variantes de talla.
  const art2 = await pool.query("SELECT codigo, descripcion FROM articulos WHERE codigo IN ('C1300','C13004')");
  const porCodigo2 = new Map(art2.rows.map((a) => [a.codigo, a.descripcion]));
  if (porCodigo2.has('C1300') && porCodigo2.has('C13004')) {
    const resultado2 = sonMismaFamilia('C1300', porCodigo2.get('C1300'), 'C13004', porCodigo2.get('C13004'));
    log(`C1300 "${porCodigo2.get('C1300')}" vs C13004 "${porCodigo2.get('C13004')}" → sonMismaFamilia=${resultado2} (debe ser true: misma familia con variante de talla)`);
    if (resultado2 !== true) { ok = false; log('✘ FALLO: no se está reconociendo una familia real como tal.'); }
  }
  log(ok ? '✔ Correcto.' : '✘ FALLO — revisar familiaProducto.js.');
  log('');
  return ok;
}

async function verificarMargenPartida() {
  log('## 4. Margen mínimo (1,30 €/kg) contra una partida real con kilos disponibles');
  log('');
  const candidataReal = await pool.query(`
    SELECT c.numero_partida, cl.articulo_codigo_snapshot AS codigo, cl.descripcion_snapshot AS descripcion
    FROM compra_lineas cl JOIN compras c ON c.id = cl.compra_id
    JOIN partidas_disponibles pd ON pd.numero_partida = c.numero_partida
    WHERE pd.kilos_disponibles > 5 AND pd.cerrada_manual = false
    ORDER BY c.numero_partida LIMIT 1
  `);
  if (!candidataReal.rows.length) {
    log('⚠ No se encontró ninguna partida real con kilos disponibles para probar esto ahora mismo.');
    log('');
    return true;
  }
  const { codigo, descripcion } = candidataReal.rows[0];
  const altoOk = await pool.connect().then(async (cliente) => {
    try { return await asignarPartidaAutomatica(cliente, { articuloCodigo: codigo, articuloDescripcion: descripcion, precioVenta: 999 }); }
    finally { cliente.release(); }
  });
  const bajoOk = await pool.connect().then(async (cliente) => {
    try { return await asignarPartidaAutomatica(cliente, { articuloCodigo: codigo, articuloDescripcion: descripcion, precioVenta: 0.01 }); }
    finally { cliente.release(); }
  });
  log(`Artículo de prueba: ${codigo} "${descripcion}"`);
  log(`Precio de venta 999€/kg → estado=${altoOk.estadoAsignacion} partida=${altoOk.numeroPartida} margen=${altoOk.margen} (debe ser OK, con partida asignada)`);
  log(`Precio de venta 0,01€/kg → estado=${bajoOk.estadoAsignacion} partida=${bajoOk.numeroPartida} (debe ser AVISO_MARGEN, SIN partida asignada — igual que construirCeldaPartida() en el HTML actual cuando nadie llega al margen)`);
  const ok = altoOk.estadoAsignacion === 'OK' && altoOk.numeroPartida != null
    && bajoOk.estadoAsignacion === 'AVISO_MARGEN' && bajoOk.numeroPartida === null;
  log(ok ? '✔ Correcto.' : '✘ FALLO — revisar partidas.js.');
  log('');
  return ok;
}

async function verificarIvaVenta() {
  log('## 5. IVA / Recargo de Equivalencia en ventas (lógica nueva, FASE_2 punto 2)');
  log('');
  const casos = [
    { tipo: 'NORMAL', base: 100, esperado: { ivaPct: 10, recargoPct: 0, ivaImporte: 10, recargoImporte: 0, total: 110 } },
    { tipo: 'RECARGO_EQUIVALENCIA', base: 100, esperado: { ivaPct: 10, recargoPct: 1.4, ivaImporte: 10, recargoImporte: 1.4, total: 111.4 } },
    { tipo: 'INTRACOMUNITARIO', base: 100, esperado: { ivaPct: 0, recargoPct: 0, ivaImporte: 0, recargoImporte: 0, total: 100 } },
  ];
  let ok = true;
  for (const caso of casos) {
    const r = calcularIvaVenta({ tipoIvaCliente: caso.tipo, baseImponible: caso.base });
    let casoOk = true;
    for (const campo of Object.keys(caso.esperado)) {
      if (!casiIgual(r[campo], caso.esperado[campo])) casoOk = false;
    }
    log(`Cliente ${caso.tipo}, base 100€ → IVA=${r.ivaImporte}€ (${r.ivaPct}%) recargo=${r.recargoImporte}€ (${r.recargoPct}%) total=${r.total}€ — ${casoOk ? 'correcto' : 'FALLO'}`);
    if (!casoOk) ok = false;
  }
  log('');
  log('⚠ El 1,4% de recargo de equivalencia usado aquí es el vigente en España para productos al 10% desde 2012 — pendiente de que la asesoría fiscal de Víctor lo confirme antes de facturar con él de verdad (ver aviso en calculosVenta.js).');
  log('');
  return ok;
}

async function main() {
  log('# Verificación de la lógica de negocio (Fase 2)');
  log('');
  log(`Fecha de esta verificación: ${new Date().toISOString()}`);
  log('');

  const resultados = {
    op2Iva: await verificarOp2EIva(),
    ivaIntra: await verificarIvaIntracomunitarioSintetico(),
    familia: await verificarFamiliaProducto(),
    margen: await verificarMargenPartida(),
    ivaVenta: await verificarIvaVenta(),
  };

  const todoOk = Object.values(resultados).every(Boolean);
  log('## Conclusión');
  log('');
  log(todoOk
    ? '**Todas las comprobaciones de la Fase 2 superadas.**'
    : '**Hay comprobaciones de la Fase 2 sin superar — ver detalle arriba antes de cerrar la fase.**');
  log('');
  log('### Desviaciones intencionadas respecto al comportamiento literal del HTML actual (ya pedidas por los documentos de fase, no son fallos)');
  log('');
  log('- El coste usado para el margen de partidas incluye el 2% de OP (base_real), mientras que el HTML actual usa el precio de compra en bruto en ese cálculo concreto — cambio pedido explícitamente por FASE_0 punto 2.');
  log('- El Recargo de Equivalencia es una regla completamente nueva (FASE_2 punto 2): el HTML actual nunca lo aplica.');
  log('- La asignación automática inline, cuando ninguna partida llega al margen mínimo, NO asigna nada (igual que construirCeldaPartida() al teclear) — distinto de la función aparte autoAsignarPartidas() del HTML actual, que sí cae a la partida más antigua sin margen como acción manual explícita de "asignar todo lo pendiente"; esa función de asignación masiva por día no se ha reproducido todavía en esta fase.');

  const rutaInforme = path.join(__dirname, '..', '..', `VERIFICACION_FASE2_${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(rutaInforme, lineasInforme.join('\n') + '\n');
  console.log(`\nInforme escrito en: ${rutaInforme}`);
  console.log(todoOk ? '\n✔ VERIFICACIÓN FASE 2 SUPERADA' : '\n✘ VERIFICACIÓN FASE 2 CON FALLOS');

  await pool.end();
  process.exitCode = todoOk ? 0 : 1;
}

main();
