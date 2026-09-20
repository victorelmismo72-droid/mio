const { crudSimple } = require('../lib/crudSimple');
const { conTransaccion } = require('../db');
const { upsertCatalogoPorCodigo } = require('../lib/importacion');

const router = crudSimple({
  tabla: 'proveedores',
  columnas: ['codigo', 'nombre', 'es_subasta_op', 'tipo_iva', 'notas'],
});

const TIPOS_IVA_PROVEEDOR = ['NACIONAL', 'INTRACOMUNITARIO'];

// Importación masiva desde Excel (Fase 6, hoja "PROVEEDORES") — alta/
// actualización por código, nunca borra proveedores que no vengan en el
// archivo. tipo_iva es opcional (columna "TIPO IVA", el Excel original de
// Víctor no la trae): si una fila no la trae, se conserva el valor que ya
// hubiera o "NACIONAL" (el de por defecto de la tabla) en un alta nueva.
router.post('/importar', async (req, res, next) => {
  try {
    const filas = req.body.filas;
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'No se han recibido filas para importar.' });
    for (const f of filas) {
      if (f.tipo_iva !== undefined && !TIPOS_IVA_PROVEEDOR.includes(f.tipo_iva)) {
        return res.status(400).json({ error: `Tipo de IVA "${f.tipo_iva}" no válido para el proveedor "${f.codigo}" (debe ser ${TIPOS_IVA_PROVEEDOR.join(', ')}).` });
      }
    }
    const resultado = await conTransaccion((cliente) => upsertCatalogoPorCodigo(cliente, {
      tabla: 'proveedores',
      filas,
      campos: ['nombre', 'es_subasta_op', 'notas', 'tipo_iva'],
      camposObligatorios: ['nombre'],
    }));
    res.json(resultado);
  } catch (err) {
    if (err.message.includes('Falta') || err.message.includes('repetido')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
