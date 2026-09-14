const { crudSimple } = require('../lib/crudSimple');

module.exports = crudSimple({
  tabla: 'proveedores',
  columnas: ['codigo', 'nombre', 'es_subasta_op', 'tipo_iva', 'notas'],
});
