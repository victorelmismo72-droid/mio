const { crudSimple } = require('../lib/crudSimple');
const { conTransaccion } = require('../db');
const { upsertCatalogoPorCodigo } = require('../lib/importacion');

const router = crudSimple({
  tabla: 'clientes',
  columnas: [
    'codigo', 'nombre', 'cif', 'direccion', 'cp', 'poblacion', 'provincia',
    'telefono', 'email', 'forma_pago', 'agencia', 'tipo_iva', 'formato_etiqueta',
  ],
});

// Importación masiva desde Excel (Fase 6, hoja "CLIENTES") — alta/
// actualización por código, nunca borra clientes que no vengan en el
// archivo. tipo_iva/formato_etiqueta no se tocan aquí (el Excel no los
// trae): se conservan si ya existían, o usan el valor por defecto de la
// tabla si es un alta nueva.
router.post('/importar', async (req, res, next) => {
  try {
    const filas = req.body.filas;
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'No se han recibido filas para importar.' });
    const resultado = await conTransaccion((cliente) => upsertCatalogoPorCodigo(cliente, {
      tabla: 'clientes',
      filas,
      campos: ['nombre', 'cif', 'direccion', 'cp', 'poblacion', 'provincia', 'telefono', 'email', 'forma_pago', 'agencia'],
      camposObligatorios: ['nombre'],
    }));
    res.json(resultado);
  } catch (err) {
    if (err.message.includes('Falta') || err.message.includes('repetido')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
