#!/usr/bin/env node
/*
 * MARINAFISK - Fase 1, punto 4: migracion del backup de prueba.
 *
 * Lee el backup JSON del programa HTML actual (formato MARINAFISK_BACKUP_V2)
 * y lo inserta en las tablas nuevas de PostgreSQL, tal cual esta, sin aplicar
 * ninguna logica de negocio (eso es Fase 2). Las unicas transformaciones son
 * de formato: nombres de campo (camelCase -> snake_case) y separar la
 * clasificacion fiscal de clientes en dos campos independientes (ver mas abajo).
 *
 * Uso: node scripts/migrar_backup.js /ruta/al/backup.json
 */

require('dotenv').config();
const fs = require('fs');
const { pool } = require('../src/db');

const rutaBackup = process.argv[2];
if (!rutaBackup) {
  console.error('Uso: node scripts/migrar_backup.js /ruta/al/backup.json');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(rutaBackup, 'utf8'));

// El campo antiguo `tipoIva` de clientes mezclaba en un unico valor dos
// cosas independientes (origen fiscal y recargo de equivalencia). Se
// traduce asi, guardando siempre el valor original en tipo_iva_legacy_raw
// para que Victor pueda revisar la traduccion:
//   (vacio) / 'NORMAL'          -> NACIONAL,       sin recargo
//   'RECARGO_EQUIVALENCIA'      -> NACIONAL,       CON recargo (supuesto: el
//                                   recargo de equivalencia solo se ha usado
//                                   en Espana en la practica - a confirmar)
//   'INTRACOMUNITARIO'          -> INTRACOMUNITARIO, sin recargo
function traducirTipoIvaCliente(valorLegacy) {
  switch (valorLegacy) {
    case 'INTRACOMUNITARIO':
      return { tipo_iva: 'INTRACOMUNITARIO', recargo_equivalencia: false };
    case 'RECARGO_EQUIVALENCIA':
      return { tipo_iva: 'NACIONAL', recargo_equivalencia: true };
    case 'NORMAL':
    default:
      return { tipo_iva: 'NACIONAL', recargo_equivalencia: false };
  }
}

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function boolOrFalse(v) {
  return v === true || v === 'S' || v === 'true';
}

async function migrarClientes(client) {
  const mapaIdPorCodigo = new Map();
  for (const c of backup.clientes || []) {
    const { tipo_iva, recargo_equivalencia } = traducirTipoIvaCliente(c.tipoIva);
    const ts = c._modTimestamp || null;
    const { rows } = await client.query(
      `INSERT INTO clientes (codigo, nombre, cif, direccion, cp, poblacion, provincia,
                              telefono, email, forma_pago, agencia, formato_etiqueta,
                              tipo_iva, recargo_equivalencia, tipo_iva_legacy_raw,
                              creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               COALESCE($16::timestamptz, now()), COALESCE($16::timestamptz, now()))
       RETURNING id, codigo`,
      [c.codigo, c.nombre || null, c.cif || null, c.dir || null, c.cp || null,
        c.pob || null, c.prov || null, c.tel || null, c.email || null, c.pago || null,
        c.agencia || null, c.formatoEtiqueta || null, tipo_iva, recargo_equivalencia,
        c.tipoIva || null, ts]
    );
    mapaIdPorCodigo.set(rows[0].codigo, rows[0].id);
  }
  return mapaIdPorCodigo;
}

async function migrarArticulos(client) {
  for (const a of backup.articulos || []) {
    const ts = a._modTimestamp || null;
    await client.query(
      `INSERT INTO articulos (codigo, descripcion, tipo, pvp1, pvp2, iva_pct,
                               cientifico, zona_fao, subzona, arte_pesca, barco,
                               peso_etiqueta, modo_presentacion, forma_obtencion,
                               nombre_frances, nombre_italiano, creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,10),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               COALESCE($17::timestamptz, now()), COALESCE($17::timestamptz, now()))`,
      [a.codigo, a.descripcion || null, a.tipo || null, numOrNull(a.pvp1), numOrNull(a.pvp2),
        numOrNull(a.iva), a.cientifico || null, a.zonaFao || null, a.subzona || null,
        a.artePesca || null, a.barco || null, a.pesoEtiqueta || null, a.modoPresentacion || null,
        a.formaObtencion || null, a.nombreFrances || null, a.nombreItaliano || null, ts]
    );
  }
}

async function migrarProveedores(client) {
  // El backup actual no distingue proveedores NACIONAL/INTRACOMUNITARIO
  // todavia (campo nuevo de la Fase 1) - se migra todo como NACIONAL por
  // defecto. Victor debe revisar cuales son en realidad intracomunitarios
  // (ver documento de verificacion generado tras la migracion).
  for (const p of backup.proveedores || []) {
    const ts = p._modTimestamp || null;
    await client.query(
      `INSERT INTO proveedores (codigo, nombre, es_subasta_op, tipo_iva, notas, creado_en, modificado_en)
       VALUES ($1,$2,$3,'NACIONAL',$4, COALESCE($5::timestamptz, now()), COALESCE($5::timestamptz, now()))`,
      [p.codigo, p.nombre || null, boolOrFalse(p.op2), p.notas || null, ts]
    );
  }
}

async function migrarCompras(client) {
  let maxPartida = 0;
  for (const c of backup.compras || []) {
    const ts = c._modTimestamp || null;
    const numeroPartida = numOrNull(c.partida);
    if (numeroPartida && numeroPartida > maxPartida) maxPartida = numeroPartida;
    const { rows } = await client.query(
      `INSERT INTO compras (numero_partida, fecha, alb_proveedor, proveedor_codigo, proveedor_nombre,
                             total_kilos, total_base_zgz, total_base_real, total_iva, total_fact,
                             puesto_origen, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, COALESCE($12::timestamptz, now()))
       RETURNING id`,
      [numeroPartida, c.fecha, c.albProveedor || null, c.proveedorCod, c.proveedorNombre || null,
        numOrNull(c.totalKilos), numOrNull(c.totalBaseZgz), numOrNull(c.totalBaseReal),
        numOrNull(c.totalIva), numOrNull(c.totalFact), c._uid || null, ts]
    );
    const compraId = rows[0].id;
    for (const l of c.lineas || []) {
      await client.query(
        `INSERT INTO compra_lineas (compra_id, producto, descripcion, cajas, kilos, precio_kg,
                                     control, base_zgz, base_zgz_iva, op2, base_real, iva, total_fact)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [compraId, l.producto || null, l.descripcion || null, numOrNull(l.cajas), numOrNull(l.kilos),
          numOrNull(l.precioKg), l.control === true, numOrNull(l.baseZgz), numOrNull(l.baseZgzIva),
          numOrNull(l.op2), numOrNull(l.baseReal), numOrNull(l.iva), numOrNull(l.totalFact)]
      );
    }
  }
  return maxPartida;
}

async function migrarPedidos(client) {
  let maxNumero = 0;
  for (const h of backup.historial || []) {
    const ts = h._modTimestamp || null;
    if (h.num && h.num > maxNumero) maxNumero = h.num;
    const { rows } = await client.query(
      `INSERT INTO pedidos (numero, fecha, cliente_codigo, cliente_nombre_snapshot, cliente_cif_snapshot,
                             cliente_dir_snapshot, cliente_pob_snapshot, cliente_tel_snapshot, agencia,
                             forma_pago, base, iva, total, puesto_origen, creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               COALESCE($15::timestamptz, now()), COALESCE($15::timestamptz, now()))
       RETURNING id`,
      [h.num, h.fecha, h.cliente || null, h.clienteNombre || null, h.clienteCif || null,
        h.clienteDir || null, h.clientePob || null, h.clienteTel || null, h.agencia || null,
        h.formaPago || null, numOrNull(h.base), numOrNull(h.iva), numOrNull(h.total), h._uid || null, ts]
    );
    const pedidoId = rows[0].id;
    for (const l of h.lineas || []) {
      await client.query(
        `INSERT INTO pedido_lineas (pedido_id, articulo_codigo, descripcion, descripcion_editada,
                                     cantidad, peso, precio, descuento, iva_pct, total,
                                     partida_numero, partida_manual)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [pedidoId, l.art || null, l.desc || null, l.descEdit || null, numOrNull(l.cant),
          numOrNull(l.peso), numOrNull(l.precio), numOrNull(l.dcto), numOrNull(l.iva),
          numOrNull(l.total), numOrNull(l.partida), l._partidaManual === true]
      );
    }
  }
  return maxNumero;
}

async function migrarTraspasos(client) {
  let maxNumero = 0;
  for (const t of backup.historialTrp || []) {
    const ts = t._modTimestamp || null;
    if (t.num && t.num > maxNumero) maxNumero = t.num;
    const { rows } = await client.query(
      `INSERT INTO traspasos (numero, fecha, base, total, total_kg, puesto_origen, creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, now()), COALESCE($7::timestamptz, now()))
       RETURNING id`,
      [t.num, t.fecha, numOrNull(t.base), numOrNull(t.total), numOrNull(t.totalKg), t._uid || null, ts]
    );
    const traspasoId = rows[0].id;
    for (const l of t.lineas || []) {
      await client.query(
        `INSERT INTO traspaso_lineas (traspaso_id, articulo_codigo, descripcion, descripcion_editada,
                                       cajas, peso, precio, total, partida_numero)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [traspasoId, l.art || null, l.desc || null, l.descEdit || null, numOrNull(l.cajas),
          numOrNull(l.peso), numOrNull(l.precio), numOrNull(l.total), numOrNull(l.partida)]
      );
    }
  }
  return maxNumero;
}

async function migrarRepartos(client) {
  let maxNumero = 0;
  for (const r of backup.repartos || []) {
    const ts = r._modTimestamp || null;
    if (r.num && r.num > maxNumero) maxNumero = r.num;
    const { rows } = await client.query(
      `INSERT INTO repartos (numero, fecha, destinatario_nombre, destinatario_ciudad, conductor,
                              total_cajas, total_kg, puesto_origen, creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, now()), COALESCE($9::timestamptz, now()))
       RETURNING id`,
      [r.num, r.fecha, r.destinatarioNombre || null, r.destinatarioCiudad || null, r.conductor || null,
        numOrNull(r.totalCajas), numOrNull(r.totalKg), r._uid || null, ts]
    );
    const repartoId = rows[0].id;
    for (const l of r.lineas || []) {
      await client.query(
        `INSERT INTO reparto_lineas (reparto_id, producto, descripcion, cajas, kg, lote, arte_pesca,
                                      barco, subzona, peso_etiqueta, cajas_impresas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [repartoId, l.producto || null, l.descripcion || null, numOrNull(l.cajas), numOrNull(l.kg),
          l.lote || null, l.artePesca || null, l.barco || null, l.subzona || null,
          l.pesoEtiqueta || null, numOrNull(l.cajasImpresas)]
      );
    }
  }
  return maxNumero;
}

async function ajustarSecuencias(client, { maxPedido, maxPartida, maxTraspaso, maxReparto }) {
  // Los contadores del backup (nextPedido, nextPartida, etc.) son el
  // siguiente numero a usar; se toma el mayor entre eso y el maximo
  // realmente visto en los datos, para no arriesgarse a repetir un numero.
  const siguientePedido = Math.max(Number(backup.nextPedido) || 0, maxPedido + 1);
  const siguientePartida = Math.max(Number(backup.nextPartida) || 0, maxPartida + 1);
  const siguienteTraspaso = Math.max(Number(backup.nextTrp) || 0, maxTraspaso + 1);
  const siguienteReparto = Math.max(Number(backup.nextReparto) || 0, maxReparto + 1);

  await client.query(`SELECT setval('seq_pedido_numero', $1, false)`, [siguientePedido]);
  await client.query(`SELECT setval('seq_partida_numero', $1, false)`, [siguientePartida]);
  await client.query(`SELECT setval('seq_traspaso_numero', $1, false)`, [siguienteTraspaso]);
  await client.query(`SELECT setval('seq_reparto_numero', $1, false)`, [siguienteReparto]);

  console.log('Secuencias ajustadas:', { siguientePedido, siguientePartida, siguienteTraspaso, siguienteReparto });
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Migrando clientes...');
    await migrarClientes(client);
    console.log('Migrando articulos...');
    await migrarArticulos(client);
    console.log('Migrando proveedores...');
    await migrarProveedores(client);
    console.log('Migrando compras (dato sagrado, solo INSERT)...');
    const maxPartida = await migrarCompras(client);
    console.log('Migrando pedidos...');
    const maxPedido = await migrarPedidos(client);
    console.log('Migrando traspasos...');
    const maxTraspaso = await migrarTraspasos(client);
    console.log('Migrando repartos...');
    const maxReparto = await migrarRepartos(client);

    await ajustarSecuencias(client, { maxPedido, maxPartida, maxTraspaso, maxReparto });

    await client.query('COMMIT');
    console.log('Migracion completada con exito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migracion abortada, no se guardo nada:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
