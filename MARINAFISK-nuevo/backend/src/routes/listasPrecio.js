const crudDocumento = require('./crudDocumento');

module.exports = crudDocumento({
  tabla: 'listas_precio',
  tablaLineas: 'lista_precio_lineas',
  fkLinea: 'lista_precio_id',
  columnasCabecera: ['tipo', 'fecha', 'modo'],
  columnasLinea: ['articulo_codigo', 'precio'],
});
