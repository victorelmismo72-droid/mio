const express = require('express');
const { conTransaccion } = require('../db');
const { obtenerDiasCaducidad, fijarDiasCaducidad, DIAS_CADUCIDAD_POR_DEFECTO, obtenerContactoScanfiskCeleiro, fijarContactoScanfiskCeleiro } = require('../lib/configuracion');

const router = express.Router();

router.get('/dias-caducidad', async (req, res, next) => {
  try {
    const dias = await conTransaccion((cliente) => obtenerDiasCaducidad(cliente));
    res.json({ dias, por_defecto: DIAS_CADUCIDAD_POR_DEFECTO });
  } catch (err) { next(err); }
});

router.put('/dias-caducidad', async (req, res, next) => {
  try {
    const dias = parseInt(req.body.dias, 10);
    if (!Number.isFinite(dias) || dias <= 0) return res.status(400).json({ error: 'Indica un número de días válido (mayor que 0).' });
    await conTransaccion((cliente) => fijarDiasCaducidad(cliente, dias));
    res.json({ dias });
  } catch (err) { next(err); }
});

router.get('/contacto-scanfisk-celeiro', async (req, res, next) => {
  try {
    const contacto = await conTransaccion((cliente) => obtenerContactoScanfiskCeleiro(cliente));
    res.json(contacto);
  } catch (err) { next(err); }
});

router.put('/contacto-scanfisk-celeiro', async (req, res, next) => {
  try {
    const { tel, email } = req.body;
    await conTransaccion((cliente) => fijarContactoScanfiskCeleiro(cliente, { tel, email }));
    res.json({ tel: tel || '', email: email || '' });
  } catch (err) { next(err); }
});

module.exports = router;
