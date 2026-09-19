const express = require('express');
const { conTransaccion } = require('../db');
const { FORMATOS_ETIQUETA, formatoValido, formatoParaCliente } = require('../etiquetasFormatos');
const { datosEtiquetaSuelta } = require('../logica/datosEtiquetas');
const { obtenerDiasCaducidad } = require('../lib/configuracion');

const router = express.Router();

router.get('/formatos', (req, res) => {
  res.json(FORMATOS_ETIQUETA);
});

// Etiqueta suelta (uso manual, sin pedido/traspaso/reparto detrás) — FASE_5
// punto 1.1. Siempre resuelta en el servidor a partir de los ids reales de
// cliente/artículo, nunca confiando en el texto que pudiera mandar la
// pantalla (mismo principio que el resto del sistema).
router.post('/sueltas', async (req, res, next) => {
  try {
    const { cliente_id: clienteId, articulo_id: articuloId, fecha, cantidad, formato_id: formatoIdPedido,
      zona, subzona, arte_pesca: artePesca, peso, lote } = req.body;
    if (!clienteId) return res.status(400).json({ error: 'Falta el cliente.' });
    if (!articuloId) return res.status(400).json({ error: 'Falta el artículo.' });
    if (!fecha) return res.status(400).json({ error: 'Falta la fecha.' });
    const n = Math.max(1, parseInt(cantidad, 10) || 1);

    const resultado = await conTransaccion(async (cliente) => {
      const c = await cliente.query('SELECT * FROM clientes WHERE id = $1', [clienteId]);
      if (!c.rows.length) return { error: `No existe ningún cliente con id ${clienteId}.` };
      const a = await cliente.query('SELECT * FROM articulos WHERE id = $1', [articuloId]);
      if (!a.rows.length) return { error: `No existe ningún artículo con id ${articuloId}.` };
      const clienteRow = c.rows[0];
      const articulo = a.rows[0];
      const formatoId = formatoValido(formatoIdPedido) ? formatoIdPedido : formatoParaCliente(clienteRow);
      const diasCaducidad = await obtenerDiasCaducidad(cliente);

      const dato = datosEtiquetaSuelta({
        fecha, cliente: clienteRow, articulo, formatoId, diasCaducidad,
        zonaOverride: zona, subzonaOverride: subzona, arteOverride: artePesca,
        pesoManual: peso, loteManual: lote,
      });
      const datos = [];
      for (let i = 0; i < n; i++) datos.push(dato);
      return { formato_id: formatoId, datos };
    });
    if (resultado.error) return res.status(400).json({ error: resultado.error });
    res.json(resultado);
  } catch (err) { next(err); }
});

module.exports = router;
