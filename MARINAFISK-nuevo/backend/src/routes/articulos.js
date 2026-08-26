const { crearRutasCrudSimple } = require('./crudSimple');

module.exports = crearRutasCrudSimple({
  tabla: 'articulos',
  clave: 'codigo',
  columnas: [
    'descripcion', 'tipo', 'pvp1', 'pvp2', 'iva', 'cientifico', 'zona_fao', 'subzona',
    'arte_pesca', 'barco', 'peso_etiqueta', 'calibre', 'modo_presentacion',
    'forma_obtencion', 'nombre_frances', 'nombre_italiano',
  ],
});
