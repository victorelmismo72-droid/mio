const crudDocumento = require('./crudDocumento');

module.exports = crudDocumento({
  tabla: 'traspasos',
  tablaLineas: 'traspaso_lineas',
  fkLinea: 'traspaso_id',
  columnasCabecera: ['numero', 'fecha', 'base', 'total', 'total_kg', 'puesto_origen'],
  columnasLinea: [
    'articulo_codigo', 'descripcion', 'descripcion_editada', 'cajas', 'peso',
    'precio', 'total', 'partida_numero',
  ],
});
