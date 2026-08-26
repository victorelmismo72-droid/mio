// Migración del backup JSON de MARINAFISK a las tablas nuevas (Fase 1, punto 4).
//
// Uso:
//   node src/migrate/migrarBackup.js /ruta/al/Backup_XXXX.json
//
// El script es re-ejecutable: usa ON CONFLICT para no duplicar filas si se
// corre dos veces sobre el mismo backup. Al final imprime un informe de
// verificación (conteo de registros JSON vs. base de datos) que debe
// guardarse como evidencia antes de pasar a la Fase 2 (ver Fase 1, punto 4).
require('dotenv').config();
const fs = require('fs');
const { pool } = require('../db');

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

async function migrarClientes(client, clientes) {
  for (const c of clientes || []) {
    await client.query(
      `INSERT INTO clientes (codigo, nombre, cif, dir, cp, pob, prov, tel, email, pago, agencia, tipo_iva, formato_etiqueta, mod_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14, now()))
       ON CONFLICT (codigo) DO UPDATE SET
         nombre=EXCLUDED.nombre, cif=EXCLUDED.cif, dir=EXCLUDED.dir, cp=EXCLUDED.cp, pob=EXCLUDED.pob,
         prov=EXCLUDED.prov, tel=EXCLUDED.tel, email=EXCLUDED.email, pago=EXCLUDED.pago, agencia=EXCLUDED.agencia,
         tipo_iva=EXCLUDED.tipo_iva, formato_etiqueta=EXCLUDED.formato_etiqueta, mod_timestamp=EXCLUDED.mod_timestamp`,
      [c.codigo, c.nombre, c.cif, c.dir, c.cp, c.pob, c.prov, c.tel, c.email, c.pago, c.agencia,
        c.tipoIva || null, c.formatoEtiqueta || null, c._modTimestamp || null]
    );
  }
}

async function migrarArticulos(client, articulos) {
  for (const a of articulos || []) {
    await client.query(
      `INSERT INTO articulos (codigo, descripcion, tipo, pvp1, pvp2, iva, cientifico, zona_fao, subzona, arte_pesca, barco, peso_etiqueta, calibre, modo_presentacion, forma_obtencion, nombre_frances, nombre_italiano, mod_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, COALESCE($18, now()))
       ON CONFLICT (codigo) DO UPDATE SET
         descripcion=EXCLUDED.descripcion, tipo=EXCLUDED.tipo, pvp1=EXCLUDED.pvp1, pvp2=EXCLUDED.pvp2, iva=EXCLUDED.iva,
         cientifico=EXCLUDED.cientifico, zona_fao=EXCLUDED.zona_fao, subzona=EXCLUDED.subzona, arte_pesca=EXCLUDED.arte_pesca,
         barco=EXCLUDED.barco, peso_etiqueta=EXCLUDED.peso_etiqueta, calibre=EXCLUDED.calibre,
         modo_presentacion=EXCLUDED.modo_presentacion, forma_obtencion=EXCLUDED.forma_obtencion,
         nombre_frances=EXCLUDED.nombre_frances, nombre_italiano=EXCLUDED.nombre_italiano, mod_timestamp=EXCLUDED.mod_timestamp`,
      [a.codigo, a.descripcion, a.tipo, num(a.pvp1), num(a.pvp2), num(a.iva), a.cientifico, a.zonaFao, a.subzona,
        a.artePesca, a.barco, a.pesoEtiqueta, a.calibre, a.modoPresentacion, a.formaObtencion, a.nombreFrances,
        a.nombreItaliano, a._modTimestamp || null]
    );
  }
}

async function migrarProveedores(client, proveedores) {
  for (const p of proveedores || []) {
    await client.query(
      `INSERT INTO proveedores (codigo, nombre, op2, tipo_iva, notas, mod_timestamp)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6, now()))
       ON CONFLICT (codigo) DO UPDATE SET
         nombre=EXCLUDED.nombre, op2=EXCLUDED.op2, tipo_iva=EXCLUDED.tipo_iva, notas=EXCLUDED.notas, mod_timestamp=EXCLUDED.mod_timestamp`,
      [p.codigo, p.nombre, p.op2 === 'S' ? 'S' : 'N', p.tipoIva || null, p.notas, p._modTimestamp || null]
    );
  }
}

async function asegurarPartida(client, partida) {
  if (partida == null) return;
  await client.query('INSERT INTO partidas (partida) VALUES ($1) ON CONFLICT (partida) DO NOTHING', [partida]);
}

async function migrarCompras(client, compras) {
  let insertadas = 0;
  for (const c of compras || []) {
    await asegurarPartida(client, num(c.partida));
    const { rows } = await client.query(
      `INSERT INTO compras (uid, partida, fecha, alb_proveedor, proveedor_cod, proveedor_nombre, total_kilos, total_base_zgz, total_base_real, total_iva, total_fact, mod_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, COALESCE($12, now()))
       ON CONFLICT (uid) DO NOTHING
       RETURNING id`,
      [c._uid, num(c.partida), c.fecha, c.albProveedor, c.proveedorCod, c.proveedorNombre,
        num(c.totalKilos), num(c.totalBaseZgz), num(c.totalBaseReal), num(c.totalIva), num(c.totalFact),
        c._modTimestamp || null]
    );
    if (!rows[0]) continue; // ya migrada en una corrida anterior
    insertadas++;
    const compraId = rows[0].id;
    const lineas = c.lineas || [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      await client.query(
        `INSERT INTO compra_lineas (compra_id, orden, producto, descripcion, cajas, kilos, precio_kg, base_zgz, base_zgz_iva, op2, base_real, iva, total_fact, control)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [compraId, i, l.producto, l.descripcion, num(l.cajas), num(l.kilos), num(l.precioKg), num(l.baseZgz),
          num(l.baseZgzIva), num(l.op2), num(l.baseReal), num(l.iva), num(l.totalFact), !!l.control]
      );
    }
  }
  return insertadas;
}

async function migrarHistorial(client, historial) {
  let insertadas = 0;
  for (const h of historial || []) {
    for (const l of h.lineas || []) await asegurarPartida(client, num(l.partida));
    const { rows } = await client.query(
      `INSERT INTO historial (num, uid, fecha, cliente_cod, cliente_nombre, cliente_cif, cliente_dir, cliente_pob, cliente_provincia, cliente_tel, agencia, forma_pago, tipo_iva, base, iva, total, mod_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, COALESCE($17, now()))
       ON CONFLICT (uid) DO NOTHING
       RETURNING id`,
      [num(h.num), h._uid, h.fecha, h.cliente, h.clienteNombre, h.clienteCif, h.clienteDir, h.clientePob,
        h.clienteProvincia, h.clienteTel, h.agencia, h.formaPago, h.tipoIva, num(h.base), num(h.iva), num(h.total),
        h._modTimestamp || null]
    );
    if (!rows[0]) continue;
    insertadas++;
    const historialId = rows[0].id;
    const lineas = h.lineas || [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      await client.query(
        `INSERT INTO historial_lineas (historial_id, orden, art, descripcion, desc_edit, cant, peso, precio, dcto, iva, total, partida)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [historialId, i, l.art, l.desc, l.descEdit, num(l.cant), num(l.peso), num(l.precio), num(l.dcto),
          num(l.iva), num(l.total), num(l.partida)]
      );
    }
  }
  return insertadas;
}

async function migrarHistorialTrp(client, historialTrp) {
  let insertadas = 0;
  for (const t of historialTrp || []) {
    for (const l of t.lineas || []) await asegurarPartida(client, num(l.partida));
    const { rows } = await client.query(
      `INSERT INTO historial_trp (num, uid, fecha, total_kg, base, total, mod_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7, now()))
       ON CONFLICT (uid) DO NOTHING
       RETURNING id`,
      [num(t.num), t._uid, t.fecha, num(t.totalKg), num(t.base), num(t.total), t._modTimestamp || null]
    );
    if (!rows[0]) continue;
    insertadas++;
    const trpId = rows[0].id;
    const lineas = t.lineas || [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      await client.query(
        `INSERT INTO historial_trp_lineas (trp_id, orden, art, descripcion, desc_edit, cajas, peso, precio, partida, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [trpId, i, l.art, l.desc, l.descEdit, num(l.cajas), num(l.peso), num(l.precio), num(l.partida), num(l.total)]
      );
    }
  }
  return insertadas;
}

async function migrarRepartos(client, repartos) {
  let insertadas = 0;
  for (const r of repartos || []) {
    const { rows } = await client.query(
      `INSERT INTO repartos (num, uid, fecha, destinatario_nombre, destinatario_ciudad, conductor, total_cajas, total_kg, mod_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, now()))
       ON CONFLICT (uid) DO NOTHING
       RETURNING id`,
      [num(r.num), r._uid, r.fecha, r.destinatarioNombre, r.destinatarioCiudad, r.conductor,
        num(r.totalCajas), num(r.totalKg), r._modTimestamp || null]
    );
    if (!rows[0]) continue;
    insertadas++;
    const repartoId = rows[0].id;
    const lineas = r.lineas || [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      await client.query(
        `INSERT INTO repartos_lineas (reparto_id, orden, producto, descripcion, lote, barco, subzona, arte_pesca, cajas, kg, peso_etiqueta, cajas_impresas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [repartoId, i, l.producto, l.descripcion, l.lote, l.barco, l.subzona, l.artePesca,
          num(l.cajas), num(l.kg), l.pesoEtiqueta, num(l.cajasImpresas)]
      );
    }
  }
  return insertadas;
}

async function migrarContadores(client, backup) {
  const pares = [
    ['nextPedido', backup.nextPedido],
    ['nextTrp', backup.nextTrp],
    ['nextReparto', backup.nextReparto],
    ['nextPartida', backup.nextPartida],
  ];
  for (const [nombre, valor] of pares) {
    if (valor == null) continue;
    await client.query('UPDATE contadores SET valor = $1 WHERE nombre = $2', [num(valor), nombre]);
  }
}

async function main() {
  const rutaBackup = process.argv[2];
  if (!rutaBackup) {
    console.error('Uso: node src/migrate/migrarBackup.js /ruta/al/Backup_XXXX.json');
    process.exit(1);
  }
  const backup = JSON.parse(fs.readFileSync(rutaBackup, 'utf8'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Orden importa: proveedores/articulos/clientes antes que las tablas
    // que los referencian (compras, historial, traspasos, repartos).
    await migrarProveedores(client, backup.proveedores);
    await migrarArticulos(client, backup.articulos);
    await migrarClientes(client, backup.clientes);
    const comprasInsertadas = await migrarCompras(client, backup.compras);
    const historialInsertado = await migrarHistorial(client, backup.historial);
    const trpInsertado = await migrarHistorialTrp(client, backup.historialTrp);
    const repartosInsertados = await migrarRepartos(client, backup.repartos);
    await migrarContadores(client, backup);
    await client.query('COMMIT');

    console.log('--- Migración completada ---');
    console.log(`compras insertadas:    ${comprasInsertadas} (JSON traía ${((backup.compras) || []).length})`);
    console.log(`historial insertado:   ${historialInsertado} (JSON traía ${((backup.historial) || []).length})`);
    console.log(`traspasos insertados:  ${trpInsertado} (JSON traía ${((backup.historialTrp) || []).length})`);
    console.log(`repartos insertados:   ${repartosInsertados} (JSON traía ${((backup.repartos) || []).length})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await verificar(backup);
  await pool.end();
}

// Verificación obligatoria (Fase 1, punto 4): mismo número de registros en
// cada tabla que en el JSON original.
async function verificar(backup) {
  const tablas = [
    ['clientes', 'clientes', (backup.clientes || []).length],
    ['articulos', 'articulos', (backup.articulos || []).length],
    ['proveedores', 'proveedores', (backup.proveedores || []).length],
    ['compras', 'compras', (backup.compras || []).length],
    ['historial', 'historial', (backup.historial || []).length],
    ['historial_trp', 'historial_trp', (backup.historialTrp || []).length],
    ['repartos', 'repartos', (backup.repartos || []).length],
  ];
  console.log('\n--- Verificación: conteo JSON vs. base de datos ---');
  let todoOk = true;
  for (const [tabla, _etiqueta, esperado] of tablas) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${tabla}`);
    const real = rows[0].n;
    const ok = real === esperado;
    if (!ok) todoOk = false;
    console.log(`${tabla.padEnd(15)} JSON: ${String(esperado).padEnd(6)} BD: ${String(real).padEnd(6)} ${ok ? 'OK' : '¡DISCREPANCIA!'}`);
  }
  console.log(todoOk
    ? '\nTodos los conteos coinciden. Falta todavía la comprobación campo a campo de una muestra representativa (Fase 1, punto 4) antes de dar la fase por cerrada.'
    : '\nHAY DISCREPANCIAS — no continuar a la Fase 2 hasta resolverlas.');
}

main().catch((err) => {
  console.error('Error en la migración:', err);
  process.exit(1);
});
