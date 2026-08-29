const express = require('express');
const { pool } = require('../db');
const { calcularClientesAContactar, marcarContactadoHoy } = require('../negocio/clientesContactar');

const router = express.Router();

function fechaLocalISO() {
  // El servidor puede vivir en cualquier huso horario - se usa la fecha que
  // mande el cliente (su hora local) si viene, y si no, la del servidor
  // como respaldo. Nunca conversion UTC (Fase 0 punto 7).
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

router.get('/', async (req, res, next) => {
  try {
    const hoy = req.query.fecha || fechaLocalISO();
    const candidatos = await calcularClientesAContactar(pool, hoy);
    res.json({ fecha: hoy, candidatos });
  } catch (err) { next(err); }
});

router.post('/:codigo/marcar', async (req, res, next) => {
  try {
    const hoy = req.body.fecha || fechaLocalISO();
    await marcarContactadoHoy(pool, req.params.codigo, hoy, req.usuario.usuario);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
