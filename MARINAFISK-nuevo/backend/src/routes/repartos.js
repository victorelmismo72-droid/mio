const { crearRutasConLineas } = require('./crudConLineas');

module.exports = crearRutasConLineas({
  tabla: 'repartos',
  columnasCabecera: ['num', 'uid', 'fecha', 'destinatario_nombre', 'destinatario_ciudad', 'conductor', 'total_cajas', 'total_kg'],
  tablaLineas: 'repartos_lineas',
  fkLineas: 'reparto_id',
  columnasLinea: ['producto', 'descripcion', 'lote', 'barco', 'subzona', 'arte_pesca', 'cajas', 'kg', 'peso_etiqueta', 'cajas_impresas'],
  ordenPor: 'fecha',
});
