// Endpoint de exportación (Fase 1, punto 3): genera un JSON con la MISMA
// estructura que el backup del programa actual (ver construirDatosBackup()
// en el HTML), para poder compararlo campo a campo contra el backup real
// durante la verificación de la migración.
//
// Los nombres de campo aquí vuelven a su forma "camelCase" original aunque
// en la base de datos se guarden en snake_case, precisamente para que el
// JSON de salida sea comparable sin traducir nada a mano.
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

async function exportarClientes() {
  const { rows } = await pool.query('SELECT * FROM clientes ORDER BY codigo');
  return rows.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    cif: c.cif,
    dir: c.dir,
    cp: c.cp,
    pob: c.pob,
    prov: c.prov,
    tel: c.tel,
    email: c.email,
    pago: c.pago,
    agencia: c.agencia,
    tipoIva: c.tipo_iva,
    formatoEtiqueta: c.formato_etiqueta,
    _modTimestamp: c.mod_timestamp,
  }));
}

async function exportarArticulos() {
  const { rows } = await pool.query('SELECT * FROM articulos ORDER BY codigo');
  return rows.map((a) => ({
    codigo: a.codigo,
    descripcion: a.descripcion,
    tipo: a.tipo,
    pvp1: a.pvp1,
    pvp2: a.pvp2,
    iva: a.iva,
    cientifico: a.cientifico,
    zonaFao: a.zona_fao,
    subzona: a.subzona,
    artePesca: a.arte_pesca,
    barco: a.barco,
    pesoEtiqueta: a.peso_etiqueta,
    calibre: a.calibre,
    modoPresentacion: a.modo_presentacion,
    formaObtencion: a.forma_obtencion,
    nombreFrances: a.nombre_frances,
    nombreItaliano: a.nombre_italiano,
    _modTimestamp: a.mod_timestamp,
  }));
}

async function exportarProveedores() {
  const { rows } = await pool.query('SELECT * FROM proveedores ORDER BY codigo');
  return rows.map((p) => ({
    codigo: p.codigo,
    nombre: p.nombre,
    op2: p.op2,
    notas: p.notas,
    // tipoIva es un campo nuevo (ver schema.sql); no existía en el backup
    // original, se añade aquí solo si ya se ha rellenado.
    ...(p.tipo_iva ? { tipoIva: p.tipo_iva } : {}),
    _modTimestamp: p.mod_timestamp,
  }));
}

async function exportarCompras() {
  const { rows: compras } = await pool.query('SELECT * FROM compras ORDER BY id');
  const { rows: lineas } = await pool.query('SELECT * FROM compra_lineas ORDER BY compra_id, orden');
  const lineasPorCompra = new Map();
  for (const l of lineas) {
    if (!lineasPorCompra.has(l.compra_id)) lineasPorCompra.set(l.compra_id, []);
    lineasPorCompra.get(l.compra_id).push({
      producto: l.producto,
      descripcion: l.descripcion,
      cajas: l.cajas,
      kilos: l.kilos,
      precioKg: l.precio_kg,
      baseZgz: l.base_zgz,
      baseZgzIva: l.base_zgz_iva,
      op2: l.op2,
      baseReal: l.base_real,
      iva: l.iva,
      totalFact: l.total_fact,
      control: l.control,
    });
  }
  return compras.map((c) => ({
    partida: c.partida,
    fecha: c.fecha,
    albProveedor: c.alb_proveedor,
    proveedorCod: c.proveedor_cod,
    proveedorNombre: c.proveedor_nombre,
    lineas: lineasPorCompra.get(c.id) || [],
    totalKilos: c.total_kilos,
    totalBaseZgz: c.total_base_zgz,
    totalBaseReal: c.total_base_real,
    totalIva: c.total_iva,
    totalFact: c.total_fact,
    _uid: c.uid,
    _modTimestamp: c.mod_timestamp,
  }));
}

async function exportarHistorial() {
  const { rows: cabeceras } = await pool.query('SELECT * FROM historial ORDER BY id');
  const { rows: lineas } = await pool.query('SELECT * FROM historial_lineas ORDER BY historial_id, orden');
  const lineasPorCabecera = new Map();
  for (const l of lineas) {
    if (!lineasPorCabecera.has(l.historial_id)) lineasPorCabecera.set(l.historial_id, []);
    lineasPorCabecera.get(l.historial_id).push({
      art: l.art,
      desc: l.descripcion,
      descEdit: l.desc_edit,
      cant: l.cant,
      peso: l.peso,
      precio: l.precio,
      dcto: l.dcto,
      iva: l.iva,
      total: l.total,
      partida: l.partida,
    });
  }
  return cabeceras.map((h) => ({
    num: h.num,
    fecha: h.fecha,
    cliente: h.cliente_cod,
    clienteNombre: h.cliente_nombre,
    clienteCif: h.cliente_cif,
    clienteDir: h.cliente_dir,
    clientePob: h.cliente_pob,
    clienteProvincia: h.cliente_provincia,
    clienteTel: h.cliente_tel,
    agencia: h.agencia,
    formaPago: h.forma_pago,
    tipoIva: h.tipo_iva,
    lineas: lineasPorCabecera.get(h.id) || [],
    base: h.base,
    iva: h.iva,
    total: h.total,
    _uid: h.uid,
    _modTimestamp: h.mod_timestamp,
  }));
}

async function exportarHistorialTrp() {
  const { rows: cabeceras } = await pool.query('SELECT * FROM historial_trp ORDER BY id');
  const { rows: lineas } = await pool.query('SELECT * FROM historial_trp_lineas ORDER BY trp_id, orden');
  const lineasPorCabecera = new Map();
  for (const l of lineas) {
    if (!lineasPorCabecera.has(l.trp_id)) lineasPorCabecera.set(l.trp_id, []);
    lineasPorCabecera.get(l.trp_id).push({
      art: l.art,
      desc: l.descripcion,
      descEdit: l.desc_edit,
      cajas: l.cajas,
      peso: l.peso,
      precio: l.precio,
      partida: l.partida,
      total: l.total,
    });
  }
  return cabeceras.map((t) => ({
    num: t.num,
    fecha: t.fecha,
    lineas: lineasPorCabecera.get(t.id) || [],
    totalKg: t.total_kg,
    base: t.base,
    total: t.total,
    _uid: t.uid,
    _modTimestamp: t.mod_timestamp,
  }));
}

async function exportarRepartos() {
  const { rows: cabeceras } = await pool.query('SELECT * FROM repartos ORDER BY id');
  const { rows: lineas } = await pool.query('SELECT * FROM repartos_lineas ORDER BY reparto_id, orden');
  const lineasPorCabecera = new Map();
  for (const l of lineas) {
    if (!lineasPorCabecera.has(l.reparto_id)) lineasPorCabecera.set(l.reparto_id, []);
    lineasPorCabecera.get(l.reparto_id).push({
      producto: l.producto,
      descripcion: l.descripcion,
      lote: l.lote,
      barco: l.barco,
      subzona: l.subzona,
      artePesca: l.arte_pesca,
      cajas: l.cajas,
      kg: l.kg,
      pesoEtiqueta: l.peso_etiqueta,
      cajasImpresas: l.cajas_impresas,
    });
  }
  return cabeceras.map((r) => ({
    num: r.num,
    fecha: r.fecha,
    destinatarioNombre: r.destinatario_nombre,
    destinatarioCiudad: r.destinatario_ciudad,
    conductor: r.conductor,
    lineas: lineasPorCabecera.get(r.id) || [],
    totalCajas: r.total_cajas,
    totalKg: r.total_kg,
    _uid: r.uid,
    _modTimestamp: r.mod_timestamp,
  }));
}

async function exportarContador(nombre) {
  const { rows } = await pool.query('SELECT valor FROM contadores WHERE nombre = $1', [nombre]);
  return rows[0] ? rows[0].valor : null;
}

router.get('/', async (req, res, next) => {
  try {
    const [clientes, articulos, proveedores, compras, historial, historialTrp, repartos,
      nextPedido, nextTrp, nextReparto, nextPartida] = await Promise.all([
      exportarClientes(),
      exportarArticulos(),
      exportarProveedores(),
      exportarCompras(),
      exportarHistorial(),
      exportarHistorialTrp(),
      exportarRepartos(),
      exportarContador('nextPedido'),
      exportarContador('nextTrp'),
      exportarContador('nextReparto'),
      exportarContador('nextPartida'),
    ]);

    res.json({
      version: 'marinafisk-backend-fase1',
      fecha: new Date().toISOString(),
      clientes,
      articulos,
      proveedores,
      historial,
      historialTrp,
      compras,
      repartos,
      nextPedido,
      nextTrp,
      nextReparto,
      nextPartida,
    });
  } catch (err) { next(err); }
});

module.exports = router;
