// Contadores correlativos (nextPedido, nextTrp, nextReparto, nextPartida).
// Solo lectura y actualización de valor — no tiene sentido crear/borrar filas
// nuevas, las cuatro se insertan una vez en el esquema.
const express = require('express');
const { pool } = require('../db');
const { registrarEscritura } = require('../logger');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contadores ORDER BY nombre');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:nombre', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contadores WHERE nombre = $1', [req.params.nombre]);
    if (!rows[0]) return res.status(404).json({ error: 'contador no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:nombre', async (req, res, next) => {
  try {
    const { valor } = req.body;
    if (!Number.isInteger(valor)) return res.status(400).json({ error: 'valor debe ser un entero' });
    const { rows } = await pool.query(
      'UPDATE contadores SET valor = $1 WHERE nombre = $2 RETURNING *',
      [valor, req.params.nombre]
    );
    if (!rows[0]) return res.status(404).json({ error: 'contador no encontrado' });
    await registrarEscritura(null, { tabla: 'contadores', operacion: 'UPDATE', referencia: req.params.nombre, detalle: { valor } });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
