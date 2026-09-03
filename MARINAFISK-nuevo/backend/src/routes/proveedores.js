const crudCatalogo = require('./crudCatalogo');

module.exports = crudCatalogo({
  tabla: 'proveedores',
  columnas: ['codigo', 'nombre', 'es_subasta_op', 'tipo_iva', 'notas'],
});
