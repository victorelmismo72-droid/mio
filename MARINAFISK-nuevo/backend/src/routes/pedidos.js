const crudDocumento = require('./crudDocumento');

module.exports = crudDocumento({
  tabla: 'pedidos',
  tablaLineas: 'pedido_lineas',
  fkLinea: 'pedido_id',
  secuenciaNumero: 'seq_pedido_numero',
  columnasCabecera: [
    'numero', 'anio', 'fecha', 'cliente_codigo', 'cliente_nombre_snapshot',
    'cliente_cif_snapshot', 'cliente_dir_snapshot', 'cliente_pob_snapshot',
    'cliente_tel_snapshot', 'agencia', 'forma_pago', 'base', 'iva', 'total',
    'puesto_origen',
  ],
  columnasLinea: [
    'articulo_codigo', 'descripcion', 'descripcion_editada', 'cantidad',
    'peso', 'precio', 'descuento', 'iva_pct', 'total', 'partida_numero',
    'partida_manual',
  ],
});
