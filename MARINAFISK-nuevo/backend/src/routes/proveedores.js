const { crearRutasCrudSimple } = require('./crudSimple');

module.exports = crearRutasCrudSimple({
  tabla: 'proveedores',
  clave: 'codigo',
  // tipo_iva es un campo nuevo (ver schema.sql) que hoy no existe en los
  // datos migrados; se deja editable aquí para que se pueda ir rellenando.
  columnas: ['nombre', 'op2', 'tipo_iva', 'notas'],
});
