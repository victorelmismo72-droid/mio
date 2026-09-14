import { crearPantallaCrud } from './crudGenerico.js';

export default crearPantallaCrud({
  titulo: 'Artículos',
  ruta: '/api/articulos',
  columnas: [
    { clave: 'codigo', etiqueta: 'Código' },
    { clave: 'descripcion', etiqueta: 'Descripción' },
    { clave: 'tipo', etiqueta: 'Tipo' },
    { clave: 'pvp1', etiqueta: 'PVP1' },
    { clave: 'pvp2', etiqueta: 'PVP2' },
  ],
  camposFormulario: [
    { clave: 'codigo', etiqueta: 'Código' },
    { clave: 'descripcion', etiqueta: 'Descripción' },
    { clave: 'tipo', etiqueta: 'Tipo' },
    { clave: 'pvp1', etiqueta: 'PVP1', tipo: 'number' },
    { clave: 'pvp2', etiqueta: 'PVP2', tipo: 'number' },
    { clave: 'iva_pct', etiqueta: 'IVA %', tipo: 'number' },
    { clave: 'cientifico', etiqueta: 'Nombre científico' },
    { clave: 'zona_fao', etiqueta: 'Zona FAO' },
    { clave: 'subzona', etiqueta: 'Subzona' },
    { clave: 'arte_pesca', etiqueta: 'Arte de pesca' },
    { clave: 'barco', etiqueta: 'Barco' },
    { clave: 'peso_etiqueta', etiqueta: 'Peso etiqueta' },
    { clave: 'calibre', etiqueta: 'Calibre' },
    { clave: 'modo_presentacion', etiqueta: 'Modo de presentación' },
    { clave: 'forma_obtencion', etiqueta: 'Forma de obtención' },
    { clave: 'nombre_frances', etiqueta: 'Nombre francés' },
    { clave: 'nombre_italiano', etiqueta: 'Nombre italiano' },
  ],
});
