// Partidas: solo lectura del estado + el cierre manual (una tabla aparte y
// sencilla, ver FASE_0 punto 3). Los kilos disponibles se calculan con la
// vista partidas_disponibles (schema.sql) — nunca se guardan como número fijo.
const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const r = await conTransaccion((cliente) => cliente.query(
      'SELECT * FROM partidas_disponibles ORDER BY numero_partida DESC'
    ));
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.get('/:numero', async (req, res, next) => {
  try {
    const r = await conTransaccion((cliente) => cliente.query(
      'SELECT * FROM partidas_disponibles WHERE numero_partida = $1', [req.params.numero]
    ));
    if (!r.rows.length) return res.status(404).json({ error: `No existe ninguna partida con número ${req.params.numero}` });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

router.post('/:numero/cerrar', async (req, res, next) => {
  try {
    const { cerrada_por } = req.body;
    const resultado = await conTransaccion(async (cliente) => {
      const r = await cliente.query(
        `UPDATE partidas SET cerrada_manual = true, cerrada_en = now(), cerrada_por = $2
         WHERE numero_partida = $1 RETURNING *`,
        [req.params.numero, cerrada_por || null]
      );
      if (!r.rows.length) return null;
      await registrarEscritura(cliente, { tabla: 'partidas', operacion: 'UPDATE', registroId: req.params.numero, detalle: { accion: 'cerrar', cerrada_por } });
      return r.rows[0];
    });
    if (!resultado) return res.status(404).json({ error: `No existe ninguna partida con número ${req.params.numero}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.post('/:numero/reabrir', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const r = await cliente.query(
        `UPDATE partidas SET cerrada_manual = false, cerrada_en = NULL, cerrada_por = NULL
         WHERE numero_partida = $1 RETURNING *`,
        [req.params.numero]
      );
      if (!r.rows.length) return null;
      await registrarEscritura(cliente, { tabla: 'partidas', operacion: 'UPDATE', registroId: req.params.numero, detalle: { accion: 'reabrir' } });
      return r.rows[0];
    });
    if (!resultado) return res.status(404).json({ error: `No existe ninguna partida con número ${req.params.numero}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

// Cierre masivo por fecha (Fase 0, punto 3): cierra todas las partidas cuyas
// compras son de la fecha indicada.
router.post('/cerrar-masivo', async (req, res, next) => {
  try {
    const { fecha, cerrada_por } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Falta "fecha".' });
    const resultado = await conTransaccion(async (cliente) => {
      const r = await cliente.query(
        `UPDATE partidas SET cerrada_manual = true, cerrada_en = now(), cerrada_por = $2
         WHERE numero_partida IN (SELECT DISTINCT numero_partida FROM compras WHERE fecha = $1)
         RETURNING numero_partida`,
        [fecha, cerrada_por || null]
      );
      await registrarEscritura(cliente, { tabla: 'partidas', operacion: 'UPDATE', detalle: { accion: 'cierre_masivo', fecha, cerrada_por, cantidad: r.rows.length } });
      return r.rows;
    });
    res.json({ cerradas: resultado.length, partidas: resultado.map((r) => r.numero_partida) });
  } catch (err) { next(err); }
});

module.exports = router;
