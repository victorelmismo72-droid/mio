const { crearRutasConLineas } = require('./crudConLineas');

module.exports = crearRutasConLineas({
  tabla: 'historial',
  columnasCabecera: [
    'num', 'uid', 'fecha', 'cliente_cod', 'cliente_nombre', 'cliente_cif', 'cliente_dir',
    'cliente_pob', 'cliente_provincia', 'cliente_tel', 'agencia', 'forma_pago', 'tipo_iva',
    'base', 'iva', 'total',
  ],
  tablaLineas: 'historial_lineas',
  fkLineas: 'historial_id',
  columnasLinea: ['art', 'descripcion', 'desc_edit', 'cant', 'peso', 'precio', 'dcto', 'iva', 'total', 'partida'],
  ordenPor: 'fecha',
});
