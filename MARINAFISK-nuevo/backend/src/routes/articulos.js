const crudCatalogo = require('./crudCatalogo');

module.exports = crudCatalogo({
  tabla: 'articulos',
  columnas: [
    'codigo', 'descripcion', 'tipo', 'pvp1', 'pvp2', 'iva_pct', 'calibre',
    'cientifico', 'zona_fao', 'subzona', 'arte_pesca', 'barco',
    'peso_etiqueta', 'modo_presentacion', 'forma_obtencion',
    'nombre_frances', 'nombre_italiano',
  ],
});
