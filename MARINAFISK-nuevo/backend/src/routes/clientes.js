const { crudSimple } = require('../lib/crudSimple');

module.exports = crudSimple({
  tabla: 'clientes',
  columnas: [
    'codigo', 'nombre', 'cif', 'direccion', 'cp', 'poblacion', 'provincia',
    'telefono', 'email', 'forma_pago', 'agencia', 'tipo_iva', 'formato_etiqueta',
  ],
});
