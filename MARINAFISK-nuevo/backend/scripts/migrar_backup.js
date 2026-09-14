#!/usr/bin/env node
// Migración del backup JSON real del programa actual a la base de datos
// nueva (Fase 1, punto 4). Todo dentro de UNA sola transacción: si algo
// falla a mitad, no se deja la base de datos a medio migrar.
//
// Uso:  node scripts/migrar_backup.js /ruta/al/Backup_XXXX.json
//
// Este script NO calcula nada de negocio (2% OP, IVA, margen...): copia tal
// cual los valores que ya trae el backup. Lo único que hace, aparte de
// copiar, es resolver las referencias (código de cliente -> id de cliente,
// etc.) y normalizar los pocos campos de formato distinto (op2 'S'/'N' ->
// booleano, partida de traspaso como texto libre -> intentar sacar el
// número limpio cuando lo hay).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const rutaBackup = process.argv[2];
if (!rutaBackup) {
  console.error('Uso: node scripts/migrar_backup.js /ruta/al/Backup_XXXX.json');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'marinafisk',
  user: process.env.PGUSER || 'marinafisk_app',
  password: process.env.PGPASSWORD || 'marinafisk_dev',
});

const avisos = []; // cosas raras que Víctor debería revisar, pero que no impiden migrar
function avisar(msg) { avisos.push(msg); }

function numeroONull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function textoONull(v) {
  return v === undefined || v === null || v === '' ? null : String(v);
}
function boolONull(v) {
  return v === undefined ? null : !!v;
}
// El backup guarda "partida" en pedido_lineas/traspaso_lineas a veces como
// número, a veces como texto numérico, a veces vacío ('' = sin asignar), y
// en traspasos a veces como texto compuesto ("56236+56238", "C250-56167").
function partidaLimpiaONull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  return /^-?\d+$/.test(s) ? parseInt(s, 10) : null;
}
// El puesto de origen se deduce del propio _uid (formato
// YYYYMMDDTHHMMSS_PUESTO_azar), igual que hace el programa actual.
function puestoDesdeUid(uid, mapaPuestos) {
  if (!uid) return null;
  const partes = String(uid).split('_');
  if (partes.length < 2) return null;
  const codigo = partes[1].toUpperCase();
  return mapaPuestos.get(codigo) || null;
}

async function migrar() {
  const crudo = fs.readFileSync(rutaBackup, 'utf8');
  const datos = JSON.parse(crudo);
  console.log(`Backup leído: ${path.basename(rutaBackup)} (versión ${datos.version}, generado ${datos.fecha})`);
  console.log(`  clientes=${datos.clientes.length} articulos=${datos.articulos.length} proveedores=${datos.proveedores.length}`);
  console.log(`  historial(pedidos)=${datos.historial.length} historialTrp(traspasos)=${datos.historialTrp.length} compras=${datos.compras.length} repartos=${datos.repartos.length}`);

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // --- comprobación de seguridad: no migrar sobre una base con datos ---
    const yaHayDatos = await cliente.query('SELECT count(*)::int AS n FROM clientes');
    if (yaHayDatos.rows[0].n > 0) {
      throw new Error('La base de datos ya tiene clientes. Este script está pensado para una base vacía recién creada con schema.sql — si quieres volver a migrar, vacíala primero.');
    }

    const mapaPuestos = new Map();
    for (const row of (await cliente.query('SELECT id, codigo FROM puestos')).rows) {
      mapaPuestos.set(row.codigo, row.id);
    }

    // ---------------------------------------------------------------
    // 1. Clientes
    // ---------------------------------------------------------------
    const idClientePorCodigo = new Map();
    for (const c of datos.clientes) {
      const r = await cliente.query(
        `INSERT INTO clientes (codigo, nombre, cif, direccion, cp, poblacion, provincia, telefono, email,
           forma_pago, agencia, tipo_iva, formato_etiqueta, creado_en, modificado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'NORMAL'),$13,COALESCE($14, now()), COALESCE($14, now()))
         RETURNING id`,
        [c.codigo, c.nombre, textoONull(c.cif), textoONull(c.dir), textoONull(c.cp), textoONull(c.pob),
          textoONull(c.prov), textoONull(c.tel), textoONull(c.email), textoONull(c.pago), textoONull(c.agencia),
          textoONull(c.tipoIva), textoONull(c.formatoEtiqueta), textoONull(c._modTimestamp)]
      );
      idClientePorCodigo.set(c.codigo, r.rows[0].id);
    }
    console.log(`Clientes migrados: ${idClientePorCodigo.size}`);

    // ---------------------------------------------------------------
    // 2. Artículos
    // ---------------------------------------------------------------
    const idArticuloPorCodigo = new Map();
    for (const a of datos.articulos) {
      const r = await cliente.query(
        `INSERT INTO articulos (codigo, descripcion, tipo, pvp1, pvp2, iva_pct, cientifico, zona_fao, subzona,
           arte_pesca, barco, peso_etiqueta, calibre, modo_presentacion, forma_obtencion, nombre_frances,
           nombre_italiano, creado_en, modificado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,COALESCE($18, now()), COALESCE($18, now()))
         RETURNING id`,
        [a.codigo, a.descripcion, textoONull(a.tipo), numeroONull(a.pvp1), numeroONull(a.pvp2), numeroONull(a.iva),
          textoONull(a.cientifico), textoONull(a.zonaFao), textoONull(a.subzona), textoONull(a.artePesca),
          textoONull(a.barco), textoONull(a.pesoEtiqueta), textoONull(a.calibre), textoONull(a.modoPresentacion),
          textoONull(a.formaObtencion), textoONull(a.nombreFrances), textoONull(a.nombreItaliano),
          textoONull(a._modTimestamp)]
      );
      idArticuloPorCodigo.set(a.codigo, r.rows[0].id);
    }
    console.log(`Artículos migrados: ${idArticuloPorCodigo.size}`);

    // ---------------------------------------------------------------
    // 3. Proveedores
    // ---------------------------------------------------------------
    const idProveedorPorCodigo = new Map();
    for (const p of datos.proveedores) {
      if (p.op2 !== 'S' && p.op2 !== 'N') avisar(`Proveedor ${p.codigo}: valor de "op2" inesperado (${JSON.stringify(p.op2)}), se trata como "N".`);
      const r = await cliente.query(
        `INSERT INTO proveedores (codigo, nombre, es_subasta_op, tipo_iva, notas, creado_en, modificado_en)
         VALUES ($1,$2,$3,'NACIONAL',$4,COALESCE($5, now()), COALESCE($5, now()))
         RETURNING id`,
        [p.codigo, p.nombre, p.op2 === 'S', textoONull(p.notas), textoONull(p._modTimestamp)]
      );
      idProveedorPorCodigo.set(p.codigo, r.rows[0].id);
    }
    console.log(`Proveedores migrados: ${idProveedorPorCodigo.size} (todos como tipo_iva=NACIONAL por defecto — revisar manualmente los intracomunitarios, ver Fase 0 punto 4)`);

    // ---------------------------------------------------------------
    // 4. Partidas: una fila por cada número de partida que aparezca en
    //    CUALQUIER sitio (compras, líneas de pedido, líneas de traspaso
    //    parseables), no solo las que tienen compra en este backup.
    // ---------------------------------------------------------------
    const numerosPartida = new Set();
    for (const c of datos.compras) numerosPartida.add(numeroONull(c.partida));
    for (const p of datos.historial) for (const l of p.lineas || []) {
      const n = partidaLimpiaONull(l.partida);
      if (n !== null) numerosPartida.add(n);
    }
    for (const t of datos.historialTrp) for (const l of t.lineas || []) {
      const n = partidaLimpiaONull(l.partida);
      if (n !== null) numerosPartida.add(n);
    }
    numerosPartida.delete(null);
    for (const n of numerosPartida) {
      await cliente.query('INSERT INTO partidas (numero_partida) VALUES ($1) ON CONFLICT DO NOTHING', [n]);
    }
    const numerosPartidaDeCompras = new Set(datos.compras.map((c) => numeroONull(c.partida)));
    const huerfanas = [...numerosPartida].filter((n) => !numerosPartidaDeCompras.has(n));
    console.log(`Partidas registradas: ${numerosPartida.size} (${huerfanas.length} sin compra correspondiente en este backup — ver nota en schema.sql)`);
    if (huerfanas.length) avisar(`${huerfanas.length} números de partida citados en pedidos/traspasos no tienen compra en este backup (ejemplos: ${huerfanas.slice(0, 10).join(', ')}).`);

    // ---------------------------------------------------------------
    // 5. Compras (dato sagrado) + líneas
    // ---------------------------------------------------------------
    let comprasMigradas = 0, compraLineasMigradas = 0;
    for (const c of datos.compras) {
      const proveedorId = idProveedorPorCodigo.get(c.proveedorCod);
      if (!proveedorId) { avisar(`Compra _uid=${c._uid}: proveedor "${c.proveedorCod}" no existe en el catálogo — se omite esta compra.`); continue; }
      const puestoId = puestoDesdeUid(c._uid, mapaPuestos);
      const r = await cliente.query(
        `INSERT INTO compras (numero_partida, fecha, alb_proveedor, proveedor_id, proveedor_nombre_snapshot,
           total_kilos, total_base_zgz, total_base_real, total_iva, total_factura, puesto_id, uid, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13, now()))
         RETURNING id`,
        [numeroONull(c.partida), c.fecha, textoONull(c.albProveedor), proveedorId, textoONull(c.proveedorNombre),
          numeroONull(c.totalKilos), numeroONull(c.totalBaseZgz), numeroONull(c.totalBaseReal),
          numeroONull(c.totalIva), numeroONull(c.totalFact), puestoId, c._uid, textoONull(c._modTimestamp)]
      );
      const compraId = r.rows[0].id;
      comprasMigradas++;
      for (const l of c.lineas || []) {
        const articuloId = idArticuloPorCodigo.get(l.producto) || null;
        await cliente.query(
          `INSERT INTO compra_lineas (compra_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot,
             cajas, kilos, precio_kg, base_zgz, base_zgz_iva, op2_importe, base_real, iva_importe, total_factura, control)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [compraId, articuloId, textoONull(l.producto), textoONull(l.descripcion), numeroONull(l.cajas),
            numeroONull(l.kilos), numeroONull(l.precioKg), numeroONull(l.baseZgz), numeroONull(l.baseZgzIva),
            numeroONull(l.op2), numeroONull(l.baseReal), numeroONull(l.iva), numeroONull(l.totalFact),
            boolONull(l.control)]
        );
        compraLineasMigradas++;
      }
    }
    console.log(`Compras migradas: ${comprasMigradas} (líneas: ${compraLineasMigradas})`);

    // ---------------------------------------------------------------
    // 6. Pedidos (historial) + líneas
    // ---------------------------------------------------------------
    let pedidosMigrados = 0, pedidoLineasMigradas = 0;
    for (const p of datos.historial) {
      const clienteId = idClientePorCodigo.get(p.cliente) || null;
      if (!clienteId) avisar(`Pedido num=${p.num}: cliente "${p.cliente}" no existe en el catálogo (se guarda igualmente, con el snapshot).`);
      const puestoId = puestoDesdeUid(p._uid, mapaPuestos);
      const marca = textoONull(p._modTimestamp) || `${p.fecha}T12:00:00.000Z`;
      const r = await cliente.query(
        `INSERT INTO pedidos (numero, fecha, cliente_id, cliente_codigo_snapshot, cliente_nombre_snapshot,
           cliente_cif_snapshot, cliente_dir_snapshot, cliente_pob_snapshot, cliente_tel_snapshot, agencia,
           forma_pago, tipo_iva_aplicado, base, iva, total, puesto_id, uid, creado_en, modificado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)
         RETURNING id`,
        [p.num, p.fecha, clienteId, textoONull(p.cliente), textoONull(p.clienteNombre), textoONull(p.clienteCif),
          textoONull(p.clienteDir), textoONull(p.clientePob), textoONull(p.clienteTel), textoONull(p.agencia),
          textoONull(p.formaPago), textoONull(p.tipoIva), numeroONull(p.base), numeroONull(p.iva),
          numeroONull(p.total), puestoId, p._uid, marca]
      );
      const pedidoId = r.rows[0].id;
      pedidosMigrados++;
      for (const l of p.lineas || []) {
        const articuloId = idArticuloPorCodigo.get(l.art) || null;
        await cliente.query(
          `INSERT INTO pedido_lineas (pedido_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot,
             descripcion_editada, cantidad, peso, precio, descuento, iva_pct, total, numero_partida,
             asignacion_manual, estado_asignacion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL)`,
          [pedidoId, articuloId, textoONull(l.art), textoONull(l.desc), textoONull(l.descEdit), numeroONull(l.cant),
            numeroONull(l.peso), numeroONull(l.precio), numeroONull(l.dcto) || 0, numeroONull(l.iva),
            numeroONull(l.total), partidaLimpiaONull(l.partida), !!l._partidaManual]
        );
        pedidoLineasMigradas++;
      }
    }
    console.log(`Pedidos migrados: ${pedidosMigrados} (líneas: ${pedidoLineasMigradas})`);

    // ---------------------------------------------------------------
    // 7. Traspasos (historialTrp) + líneas
    // ---------------------------------------------------------------
    let traspasosMigrados = 0, traspasoLineasMigradas = 0;
    for (const t of datos.historialTrp) {
      const puestoId = puestoDesdeUid(t._uid, mapaPuestos);
      const marca = textoONull(t._modTimestamp) || `${t.fecha}T12:00:00.000Z`;
      const r = await cliente.query(
        `INSERT INTO traspasos (numero, fecha, total_kg, base, total, puesto_id, uid, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [t.num, t.fecha, numeroONull(t.totalKg), numeroONull(t.base), numeroONull(t.total), puestoId, t._uid, marca]
      );
      const traspasoId = r.rows[0].id;
      traspasosMigrados++;
      for (const l of t.lineas || []) {
        const articuloId = idArticuloPorCodigo.get(l.art) || null;
        await cliente.query(
          `INSERT INTO traspaso_lineas (traspaso_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot,
             descripcion_editada, cajas, peso, precio, partida_texto, numero_partida, total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [traspasoId, articuloId, textoONull(l.art), textoONull(l.desc), textoONull(l.descEdit), numeroONull(l.cajas),
            numeroONull(l.peso), numeroONull(l.precio), textoONull(l.partida), partidaLimpiaONull(l.partida),
            numeroONull(l.total)]
        );
        traspasoLineasMigradas++;
      }
    }
    console.log(`Traspasos migrados: ${traspasosMigrados} (líneas: ${traspasoLineasMigradas})`);

    // ---------------------------------------------------------------
    // 8. Repartos + líneas
    // ---------------------------------------------------------------
    let repartosMigrados = 0, repartoLineasMigradas = 0;
    for (const rep of datos.repartos) {
      const puestoId = puestoDesdeUid(rep._uid, mapaPuestos);
      const marca = textoONull(rep._modTimestamp) || `${rep.fecha}T12:00:00.000Z`;
      const r = await cliente.query(
        `INSERT INTO repartos (numero, fecha, destinatario_nombre, destinatario_ciudad, conductor, total_cajas,
           total_kg, puesto_id, uid, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [rep.num, rep.fecha, textoONull(rep.destinatarioNombre), textoONull(rep.destinatarioCiudad),
          textoONull(rep.conductor), numeroONull(rep.totalCajas), numeroONull(rep.totalKg), puestoId, rep._uid, marca]
      );
      const repartoId = r.rows[0].id;
      repartosMigrados++;
      for (const l of rep.lineas || []) {
        const articuloId = idArticuloPorCodigo.get(l.producto) || null;
        await cliente.query(
          `INSERT INTO reparto_lineas (reparto_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot,
             lote, barco, subzona, arte_pesca, cajas, cajas_impresas, kg, peso_etiqueta)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [repartoId, articuloId, textoONull(l.producto), textoONull(l.descripcion), textoONull(l.lote),
            textoONull(l.barco), textoONull(l.subzona), textoONull(l.artePesca), numeroONull(l.cajas),
            numeroONull(l.cajasImpresas), numeroONull(l.kg), textoONull(l.pesoEtiqueta)]
        );
        repartoLineasMigradas++;
      }
    }
    console.log(`Repartos migrados: ${repartosMigrados} (líneas: ${repartoLineasMigradas})`);

    // ---------------------------------------------------------------
    // 9. Reiniciar las secuencias de numeración con los valores "next*"
    //    que trae el propio backup (es la fuente más fiable de "próximo
    //    número", más que recalcularlo nosotros a partir del máximo usado).
    // ---------------------------------------------------------------
    await cliente.query(`ALTER SEQUENCE seq_numero_pedido RESTART WITH ${parseInt(datos.nextPedido, 10)}`);
    await cliente.query(`ALTER SEQUENCE seq_numero_traspaso RESTART WITH ${parseInt(datos.nextTrp, 10)}`);
    await cliente.query(`ALTER SEQUENCE seq_numero_reparto RESTART WITH ${parseInt(datos.nextReparto, 10)}`);
    await cliente.query(`ALTER SEQUENCE seq_numero_partida RESTART WITH ${parseInt(datos.nextPartida, 10)}`);
    console.log(`Secuencias reiniciadas: nextPedido=${datos.nextPedido} nextTrp=${datos.nextTrp} nextReparto=${datos.nextReparto} nextPartida=${datos.nextPartida}`);

    await cliente.query(
      `INSERT INTO log_escrituras (tabla, operacion, detalle) VALUES ('*', 'MIGRACION_BACKUP', $1)`,
      [JSON.stringify({ archivo: path.basename(rutaBackup), fecha_backup: datos.fecha, avisos })]
    );

    await cliente.query('COMMIT');
    console.log('\n✔ Migración completada y confirmada (COMMIT).');
    if (avisos.length) {
      console.log(`\n⚠ ${avisos.length} avisos a revisar (no han impedido migrar, pero conviene que Víctor los mire):`);
      for (const a of avisos) console.log('  - ' + a);
    } else {
      console.log('\nSin avisos.');
    }
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('\n✘ La migración ha fallado y se ha deshecho todo (ROLLBACK). No se ha guardado nada.');
    console.error(err);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await pool.end();
  }
}

migrar();
