const { crearRutasCrudSimple } = require('./crudSimple');

module.exports = crearRutasCrudSimple({
  tabla: 'partidas',
  clave: 'partida',
  columnas: ['cerrada', 'fecha_cierre'],
});
