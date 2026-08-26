const crudDocumento = require('./crudDocumento');

module.exports = crudDocumento({
  tabla: 'repartos',
  tablaLineas: 'reparto_lineas',
  fkLinea: 'reparto_id',
  columnasCabecera: [
    'numero', 'fecha', 'destinatario_nombre', 'destinatario_ciudad',
    'conductor', 'total_cajas', 'total_kg', 'puesto_origen',
  ],
  columnasLinea: [
    'producto', 'descripcion', 'cajas', 'kg', 'lote', 'arte_pesca', 'barco',
    'subzona', 'peso_etiqueta', 'cajas_impresas',
  ],
});
