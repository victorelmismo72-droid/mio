// Listados de gestión (Fase 2, punto 6). Ver src/listadoGestion.js para la
// regla de negocio (separar siempre venta real de traspaso interno).
const express = require('express');
const { construirListadoGestion } = require('../listadoGestion');

const router = express.Router();

// GET /listados/gestion?desde=&hasta=&incluirTraspasos=true&clienteId=&articuloId=
// Por defecto (sin incluirTraspasos=true) solo devuelve ventas reales. Los
// filtros desde/hasta/clienteId/articuloId son opcionales, para poder
// generalizar este mismo listado a "por cliente", "por artículo", "por
// fecha" sin duplicar la lógica (ver Fase 2 punto 6: la regla aplica a
// cualquier listado de gestión, no solo a uno).
router.get('/gestion', async (req, res) => {
  try {
    const { desde, hasta, clienteId, articuloId } = req.query;
    const incluirTraspasos = req.query.incluirTraspasos === 'true';
    const resultado = await construirListadoGestion({ desde, hasta, incluirTraspasos, clienteId, articuloId });
    res.json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
