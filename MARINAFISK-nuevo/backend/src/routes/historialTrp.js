const { crearRutasConLineas } = require('./crudConLineas');

module.exports = crearRutasConLineas({
  tabla: 'historial_trp',
  columnasCabecera: ['num', 'uid', 'fecha', 'total_kg', 'base', 'total'],
  tablaLineas: 'historial_trp_lineas',
  fkLineas: 'trp_id',
  columnasLinea: ['art', 'descripcion', 'desc_edit', 'cajas', 'peso', 'precio', 'partida', 'total'],
  ordenPor: 'fecha',
});
