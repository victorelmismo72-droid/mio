const { crudSimple } = require('../lib/crudSimple');

module.exports = crudSimple({
  tabla: 'puestos',
  columnas: ['codigo', 'nombre'],
  tieneModificadoEn: false,
});
