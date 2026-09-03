const crudCatalogo = require('./crudCatalogo');

module.exports = crudCatalogo({
  tabla: 'clientes',
  columnas: [
    'codigo', 'nombre', 'cif', 'direccion', 'cp', 'poblacion', 'provincia',
    'telefono', 'email', 'forma_pago', 'agencia', 'formato_etiqueta',
    'tipo_iva', 'recargo_equivalencia', 'tipo_iva_legacy_raw',
  ],
});
