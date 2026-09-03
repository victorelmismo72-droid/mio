const crudDocumento = require('./crudDocumento');

module.exports = crudDocumento({
  tabla: 'traspasos',
  tablaLineas: 'traspaso_lineas',
  fkLinea: 'traspaso_id',
  secuenciaNumero: 'seq_traspaso_numero',
  columnasCabecera: ['numero', 'anio', 'fecha', 'base', 'total', 'total_kg', 'puesto_origen'],
  columnasLinea: [
    'articulo_codigo', 'descripcion', 'descripcion_editada', 'cajas', 'peso',
    'precio', 'total', 'partida_numero',
  ],
});
