import { crearPantallaCrud } from './crudGenerico.js';
import { api } from '../api.js';
import { leerArchivoComoWorkbook, parsearCatalogoExcel, parsearTraduccionesExcel } from '../importacionExcel.js';
import { panelErrores, panelResumen } from './resultadoImportacion.js';

async function importarCatalogo(file, { contenedorResultado, recargar }) {
  try {
    const wb = await leerArchivoComoWorkbook(file);
    const r = parsearCatalogoExcel(wb);
    if (!r.ok) return panelErrores(contenedorResultado, r.errores);
    const resultado = await api.post('/api/articulos/importar', { filas: r.filas });
    panelResumen(contenedorResultado, {
      resumen: `${r.filas.length} artículos procesados del Excel (${resultado.nuevos.length} nuevos, ${resultado.modificados.length} modificados, ${resultado.sin_cambios} sin cambios, ${resultado.desactivados.length} desactivados por no venir en el Excel — no se han borrado, siguen disponibles para el histórico).`,
      secciones: [
        { titulo: '🆕 Nuevos', items: resultado.nuevos },
        { titulo: '✏️ Modificados', items: resultado.modificados },
        { titulo: '🚫 Desactivados (no ofrecidos ya en documentos nuevos)', items: resultado.desactivados },
      ],
    });
    await recargar();
  } catch (err) {
    panelErrores(contenedorResultado, [`Error inesperado al leer el archivo: ${err.message}. El catálogo actual no se ha modificado.`]);
  }
}

function importarTraduccion(idioma, etiquetaIdioma) {
  return async function (file, { contenedorResultado, recargar }) {
    try {
      const wb = await leerArchivoComoWorkbook(file);
      const r = parsearTraduccionesExcel(wb);
      if (!r.ok) return panelErrores(contenedorResultado, r.errores);
      const resultado = await api.post('/api/articulos/importar-traducciones', { idioma, filas: r.filas });
      panelResumen(contenedorResultado, {
        resumen: `${resultado.actualizados} artículos actualizados con su nombre en ${etiquetaIdioma}.`,
        secciones: [
          { titulo: `⚠️ Códigos del Excel no encontrados en el catálogo actual`, items: resultado.no_encontrados },
        ],
      });
      await recargar();
    } catch (err) {
      panelErrores(contenedorResultado, [`Error inesperado al leer el archivo: ${err.message}`]);
    }
  };
}

export default crearPantallaCrud({
  titulo: 'Artículos',
  ruta: '/api/articulos',
  importadores: [
    { etiqueta: '📥 Importar catálogo (hoja "PRODUCTOS")', manejar: importarCatalogo },
    { etiqueta: '🇫🇷 Importar nombres en francés', manejar: importarTraduccion('fr', 'francés') },
    { etiqueta: '🇮🇹 Importar nombres en italiano', manejar: importarTraduccion('it', 'italiano') },
  ],
  columnas: [
    { clave: 'codigo', etiqueta: 'Código' },
    { clave: 'descripcion', etiqueta: 'Descripción' },
    { clave: 'tipo', etiqueta: 'Tipo' },
    { clave: 'pvp1', etiqueta: 'PVP1' },
    { clave: 'pvp2', etiqueta: 'PVP2' },
    { clave: 'activo', etiqueta: 'Activo', formatear: (v) => (v ? 'Sí' : 'No — no se ofrece en documentos nuevos') },
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
    { clave: 'activo', etiqueta: 'Activo (se ofrece al elegir artículo en documentos nuevos)', tipo: 'checkbox', defecto: true },
  ],
});
