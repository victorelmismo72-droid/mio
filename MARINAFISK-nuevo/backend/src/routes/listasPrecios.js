const { crearRutasConLineas } = require('./crudConLineas');

module.exports = crearRutasConLineas({
  tabla: 'listas_precios',
  columnasCabecera: ['tipo', 'fecha', 'modo'],
  tablaLineas: 'listas_precios_lineas',
  fkLineas: 'lista_id',
  columnasLinea: ['descripcion', 'precio', 'coste', 'existencias'],
  ordenPor: 'fecha',
});
