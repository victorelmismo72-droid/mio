// Construye el mismo JSON que exporta la ruta /api/exportar, reutilizable
// tanto por esa ruta HTTP como por scripts/verificar_migracion.js (que no
// necesita levantar el servidor, solo la base de datos).
const { pool } = require('../db');

function fechaISO(d) {
  if (d == null) return d;
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
}
function marcaTiempo(d) {
  if (d == null) return d;
  return d instanceof Date ? d.toISOString() : d;
}
function limpio(obj) {
  const r = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) r[k] = v;
  }
  return r;
}

async function construirExportacion() {
  const [clientes, articulos, proveedores, compras, compraLineas, pedidos, pedidoLineas,
    traspasos, traspasoLineas, repartos, repartoLineas, provPorId] = await Promise.all([
    pool.query('SELECT * FROM clientes ORDER BY id'),
    pool.query('SELECT * FROM articulos ORDER BY id'),
    pool.query('SELECT * FROM proveedores ORDER BY id'),
    pool.query('SELECT * FROM compras ORDER BY id'),
    pool.query('SELECT * FROM compra_lineas ORDER BY id'),
    pool.query('SELECT * FROM pedidos ORDER BY id'),
    pool.query('SELECT * FROM pedido_lineas ORDER BY id'),
    pool.query('SELECT * FROM traspasos ORDER BY id'),
    pool.query('SELECT * FROM traspaso_lineas ORDER BY id'),
    pool.query('SELECT * FROM repartos ORDER BY id'),
    pool.query('SELECT * FROM reparto_lineas ORDER BY id'),
    pool.query('SELECT id, codigo FROM proveedores'),
  ]);

  const codigoProveedorPorId = new Map(provPorId.rows.map((p) => [p.id, p.codigo]));
  const compraLineasPorCompra = new Map();
  for (const l of compraLineas.rows) {
    if (!compraLineasPorCompra.has(l.compra_id)) compraLineasPorCompra.set(l.compra_id, []);
    compraLineasPorCompra.get(l.compra_id).push(limpio({
      producto: l.articulo_codigo_snapshot, descripcion: l.descripcion_snapshot,
      cajas: l.cajas, kilos: l.kilos, precioKg: l.precio_kg,
      baseZgz: l.base_zgz, baseZgzIva: l.base_zgz_iva, op2: l.op2_importe,
      baseReal: l.base_real, iva: l.iva_importe, totalFact: l.total_factura, control: l.control,
    }));
  }

  const pedidoLineasPorPedido = new Map();
  for (const l of pedidoLineas.rows) {
    if (!pedidoLineasPorPedido.has(l.pedido_id)) pedidoLineasPorPedido.set(l.pedido_id, []);
    const linea = limpio({
      art: l.articulo_codigo_snapshot, desc: l.descripcion_snapshot, descEdit: l.descripcion_editada,
      cant: l.cantidad, peso: l.peso, precio: l.precio, dcto: l.descuento, iva: l.iva_pct, total: l.total,
      partida: l.numero_partida,
    });
    if (l.asignacion_manual) linea._partidaManual = true;
    pedidoLineasPorPedido.get(l.pedido_id).push(linea);
  }

  const traspasoLineasPorTraspaso = new Map();
  for (const l of traspasoLineas.rows) {
    if (!traspasoLineasPorTraspaso.has(l.traspaso_id)) traspasoLineasPorTraspaso.set(l.traspaso_id, []);
    traspasoLineasPorTraspaso.get(l.traspaso_id).push(limpio({
      art: l.articulo_codigo_snapshot, desc: l.descripcion_snapshot, descEdit: l.descripcion_editada,
      cajas: l.cajas, peso: l.peso, precio: l.precio, partida: l.partida_texto, total: l.total,
    }));
  }

  const repartoLineasPorReparto = new Map();
  for (const l of repartoLineas.rows) {
    if (!repartoLineasPorReparto.has(l.reparto_id)) repartoLineasPorReparto.set(l.reparto_id, []);
    repartoLineasPorReparto.get(l.reparto_id).push(limpio({
      producto: l.articulo_codigo_snapshot, descripcion: l.descripcion_snapshot, lote: l.lote,
      barco: l.barco, subzona: l.subzona, artePesca: l.arte_pesca, cajas: l.cajas,
      cajasImpresas: l.cajas_impresas, kg: l.kg, pesoEtiqueta: l.peso_etiqueta,
    }));
  }

  const salidaClientes = clientes.rows.map((c) => limpio({
    codigo: c.codigo, nombre: c.nombre, cif: c.cif, dir: c.direccion, cp: c.cp, pob: c.poblacion,
    prov: c.provincia, tel: c.telefono, email: c.email, pago: c.forma_pago, agencia: c.agencia,
    tipoIva: c.tipo_iva === 'NORMAL' ? undefined : c.tipo_iva,
    formatoEtiqueta: c.formato_etiqueta, _modTimestamp: marcaTiempo(c.modificado_en),
  }));

  const salidaArticulos = articulos.rows.map((a) => limpio({
    codigo: a.codigo, descripcion: a.descripcion, tipo: a.tipo, pvp1: a.pvp1, pvp2: a.pvp2, iva: a.iva_pct,
    cientifico: a.cientifico, zonaFao: a.zona_fao, subzona: a.subzona, artePesca: a.arte_pesca, barco: a.barco,
    pesoEtiqueta: a.peso_etiqueta, calibre: a.calibre, modoPresentacion: a.modo_presentacion,
    formaObtencion: a.forma_obtencion, nombreFrances: a.nombre_frances, nombreItaliano: a.nombre_italiano,
    _modTimestamp: marcaTiempo(a.modificado_en),
  }));

  const salidaProveedores = proveedores.rows.map((p) => limpio({
    codigo: p.codigo, nombre: p.nombre, op2: p.es_subasta_op ? 'S' : 'N', notas: p.notas,
    _modTimestamp: marcaTiempo(p.modificado_en),
  }));

  const salidaCompras = compras.rows.map((c) => limpio({
    partida: c.numero_partida, fecha: fechaISO(c.fecha), albProveedor: c.alb_proveedor,
    proveedorCod: codigoProveedorPorId.get(c.proveedor_id), proveedorNombre: c.proveedor_nombre_snapshot,
    lineas: compraLineasPorCompra.get(c.id) || [],
    totalKilos: c.total_kilos, totalBaseZgz: c.total_base_zgz, totalBaseReal: c.total_base_real,
    totalIva: c.total_iva, totalFact: c.total_factura, _uid: c.uid, _modTimestamp: marcaTiempo(c.creado_en),
  }));

  const salidaPedidos = pedidos.rows.map((p) => limpio({
    num: p.numero, fecha: fechaISO(p.fecha), cliente: p.cliente_codigo_snapshot,
    clienteNombre: p.cliente_nombre_snapshot, clienteCif: p.cliente_cif_snapshot,
    clienteDir: p.cliente_dir_snapshot, clientePob: p.cliente_pob_snapshot, clienteTel: p.cliente_tel_snapshot,
    agencia: p.agencia, formaPago: p.forma_pago, tipoIva: p.tipo_iva_aplicado,
    lineas: pedidoLineasPorPedido.get(p.id) || [],
    base: p.base, iva: p.iva, total: p.total, _uid: p.uid, _modTimestamp: marcaTiempo(p.modificado_en),
  }));

  const salidaTraspasos = traspasos.rows.map((t) => limpio({
    num: t.numero, fecha: fechaISO(t.fecha), lineas: traspasoLineasPorTraspaso.get(t.id) || [],
    totalKg: t.total_kg, base: t.base, total: t.total, _uid: t.uid, _modTimestamp: marcaTiempo(t.creado_en),
  }));

  const salidaRepartos = repartos.rows.map((r) => limpio({
    num: r.numero, fecha: fechaISO(r.fecha), destinatarioNombre: r.destinatario_nombre,
    destinatarioCiudad: r.destinatario_ciudad, conductor: r.conductor,
    lineas: repartoLineasPorReparto.get(r.id) || [],
    totalCajas: r.total_cajas, totalKg: r.total_kg, _uid: r.uid, _modTimestamp: marcaTiempo(r.creado_en),
  }));

  const [maxPedido, maxTrp, maxReparto, maxPartida] = await Promise.all([
    pool.query("SELECT COALESCE(MAX(numero), 11999) + 1 AS n FROM pedidos"),
    pool.query("SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM traspasos"),
    pool.query("SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM repartos"),
    pool.query("SELECT COALESCE(MAX(numero_partida), 5899) + 1 AS n FROM partidas"),
  ]);

  return {
    version: 'MARINAFISK_BACKUP_V2',
    fecha: new Date().toISOString(),
    clientes: salidaClientes,
    articulos: salidaArticulos,
    proveedores: salidaProveedores,
    historial: salidaPedidos,
    historialTrp: salidaTraspasos,
    compras: salidaCompras,
    repartos: salidaRepartos,
    nextPedido: String(maxPedido.rows[0].n),
    nextTrp: String(maxTrp.rows[0].n),
    nextReparto: String(maxReparto.rows[0].n),
    nextPartida: String(maxPartida.rows[0].n),
  };
}

module.exports = { construirExportacion };
