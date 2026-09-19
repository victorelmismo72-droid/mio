const { crudSimple } = require('../lib/crudSimple');
const { conTransaccion } = require('../db');
const { upsertCatalogoPorCodigo } = require('../lib/importacion');

const router = crudSimple({
  tabla: 'proveedores',
  columnas: ['codigo', 'nombre', 'es_subasta_op', 'tipo_iva', 'notas'],
});

// Importación masiva desde Excel (Fase 6, hoja "PROVEEDORES") — alta/
// actualización por código, nunca borra proveedores que no vengan en el
// archivo. tipo_iva no se toca aquí (el Excel no lo trae).
router.post('/importar', async (req, res, next) => {
  try {
    const filas = req.body.filas;
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'No se han recibido filas para importar.' });
    const resultado = await conTransaccion((cliente) => upsertCatalogoPorCodigo(cliente, {
      tabla: 'proveedores',
      filas,
      campos: ['nombre', 'es_subasta_op', 'notas'],
      camposObligatorios: ['nombre'],
    }));
    res.json(resultado);
  } catch (err) {
    if (err.message.includes('Falta') || err.message.includes('repetido')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
