import { crearPantallaCrud } from './crudGenerico.js';

export default crearPantallaCrud({
  titulo: 'Proveedores',
  ruta: '/api/proveedores',
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
