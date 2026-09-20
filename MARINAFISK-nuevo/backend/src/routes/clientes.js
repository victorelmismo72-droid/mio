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

const TIPOS_IVA_CLIENTE = ['NORMAL', 'INTRACOMUNITARIO', 'RECARGO_EQUIVALENCIA'];

// Importación masiva desde Excel (Fase 6, hoja "CLIENTES") — alta/
// actualización por código, nunca borra clientes que no vengan en el
// archivo. tipo_iva es opcional (columna "TIPO IVA", el Excel original de
// Víctor no la trae): si una fila no la trae, se conserva el valor que ya
// hubiera o el de por defecto en un alta nueva — nunca se borra por
// omisión. formato_etiqueta sigue sin tocarse aquí (no pedido).
router.post('/importar', async (req, res, next) => {
  try {
    const filas = req.body.filas;
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'No se han recibido filas para importar.' });
    for (const f of filas) {
      if (f.tipo_iva !== undefined && !TIPOS_IVA_CLIENTE.includes(f.tipo_iva)) {
        return res.status(400).json({ error: `Tipo de IVA "${f.tipo_iva}" no válido para el cliente "${f.codigo}" (debe ser ${TIPOS_IVA_CLIENTE.join(', ')}).` });
      }
    }
    const resultado = await conTransaccion((cliente) => upsertCatalogoPorCodigo(cliente, {
      tabla: 'clientes',
      filas,
      campos: ['nombre', 'cif', 'direccion', 'cp', 'poblacion', 'provincia', 'telefono', 'email', 'forma_pago', 'agencia', 'tipo_iva'],
      camposObligatorios: ['nombre'],
    }));
    res.json(resultado);
  } catch (err) {
    if (err.message.includes('Falta') || err.message.includes('repetido')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
