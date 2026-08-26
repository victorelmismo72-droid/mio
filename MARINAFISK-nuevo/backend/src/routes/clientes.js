const { crearRutasCrudSimple } = require('./crudSimple');

module.exports = crearRutasCrudSimple({
  tabla: 'clientes',
  clave: 'codigo',
  columnas: ['nombre', 'cif', 'dir', 'cp', 'pob', 'prov', 'tel', 'email', 'pago', 'agencia', 'tipo_iva', 'formato_etiqueta'],
});
