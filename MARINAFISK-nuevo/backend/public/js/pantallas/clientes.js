import { crearPantallaCrud } from './crudGenerico.js';

export default crearPantallaCrud({
  titulo: 'Clientes',
  ruta: '/api/clientes',
  columnas: [
    { clave: 'codigo', etiqueta: 'Código' },
    { clave: 'nombre', etiqueta: 'Nombre' },
    { clave: 'poblacion', etiqueta: 'Población' },
    { clave: 'telefono', etiqueta: 'Teléfono' },
    { clave: 'agencia', etiqueta: 'Agencia' },
    { clave: 'tipo_iva', etiqueta: 'IVA' },
  ],
  camposFormulario: [
    { clave: 'codigo', etiqueta: 'Código' },
    { clave: 'nombre', etiqueta: 'Nombre' },
    { clave: 'cif', etiqueta: 'CIF' },
    { clave: 'direccion', etiqueta: 'Dirección' },
    { clave: 'cp', etiqueta: 'C.P.' },
    { clave: 'poblacion', etiqueta: 'Población' },
    { clave: 'provincia', etiqueta: 'Provincia' },
    { clave: 'telefono', etiqueta: 'Teléfono' },
    { clave: 'email', etiqueta: 'Email' },
    { clave: 'forma_pago', etiqueta: 'Forma de pago' },
    {
      clave: 'agencia', etiqueta: 'Agencia/transportista',
    },
    {
      clave: 'tipo_iva', etiqueta: 'Tipo de IVA', tipo: 'select',
      opciones: [
        { valor: 'NORMAL', etiqueta: 'Normal (10%)' },
        { valor: 'RECARGO_EQUIVALENCIA', etiqueta: 'Recargo de Equivalencia' },
        { valor: 'INTRACOMUNITARIO', etiqueta: 'Intracomunitario' },
      ],
    },
    { clave: 'formato_etiqueta', etiqueta: 'Formato de etiqueta' },
  ],
});
