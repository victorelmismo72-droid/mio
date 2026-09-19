import { crearPantallaCrud } from './crudGenerico.js';
import { api } from '../api.js';
import { leerArchivoComoWorkbook, parsearProveedoresExcel } from '../importacionExcel.js';
import { panelErrores, panelResumen } from './resultadoImportacion.js';

async function importarProveedores(file, { contenedorResultado, recargar }) {
  try {
    const wb = await leerArchivoComoWorkbook(file);
    const r = parsearProveedoresExcel(wb);
    if (!r.ok) return panelErrores(contenedorResultado, r.errores);
    const resultado = await api.post('/api/proveedores/importar', { filas: r.filas });
    panelResumen(contenedorResultado, {
      resumen: `${r.filas.length} proveedores procesados (${resultado.nuevos.length} nuevos, ${resultado.modificados.length} modificados, ${resultado.sin_cambios} sin cambios). Los que ya tenías y no venían en el Excel se han conservado.`,
      secciones: [
        { titulo: '🆕 Nuevos', items: resultado.nuevos },
        { titulo: '✏️ Modificados', items: resultado.modificados },
      ],
    });
    await recargar();
  } catch (err) {
    panelErrores(contenedorResultado, [`Error inesperado al leer el archivo: ${err.message}`]);
  }
}

export default crearPantallaCrud({
  titulo: 'Proveedores',
  ruta: '/api/proveedores',
  importadores: [
    { etiqueta: '📥 Importar desde Excel (hoja "PROVEEDORES")', manejar: importarProveedores },
  ],
  columnas: [
    { clave: 'codigo', etiqueta: 'Código' },
    { clave: 'nombre', etiqueta: 'Nombre' },
    { clave: 'es_subasta_op', etiqueta: 'Subasta (2% OP)', formatear: (v) => (v ? 'Sí' : 'No') },
    { clave: 'tipo_iva', etiqueta: 'Tipo IVA' },
  ],
  camposFormulario: [
    { clave: 'codigo', etiqueta: 'Código' },
    { clave: 'nombre', etiqueta: 'Nombre' },
    { clave: 'es_subasta_op', etiqueta: '¿De subasta/lonja? (aplica 2% OP)', tipo: 'checkbox' },
    {
      clave: 'tipo_iva', etiqueta: 'Tipo de IVA', tipo: 'select',
      opciones: [
        { valor: 'NACIONAL', etiqueta: 'Nacional (10%)' },
        { valor: 'INTRACOMUNITARIO', etiqueta: 'Intracomunitario (0%, inversión del sujeto pasivo)' },
      ],
    },
    { clave: 'notas', etiqueta: 'Notas' },
  ],
});
