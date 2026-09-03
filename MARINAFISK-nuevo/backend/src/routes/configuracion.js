const express = require('express');
const { pool } = require('../db');
const { listarConfiguracion, actualizarConfiguracion } = require('../negocio/configuracion');

// Parametros de negocio editables (margen minimo, % de recargo de
// equivalencia...). De momento sin restriccion - en la Fase 3, esto pasa a
// ser exclusivo del rol Administrador (ver Fase 3 punto 1, "modificar el
// programa").
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await listarConfiguracion(pool));
  } catch (err) { next(err); }
});

router.put('/:clave', async (req, res, next) => {
  try {
    await actualizarConfiguracion(pool, req.params.clave, req.body.valor);
    res.json(await listarConfiguracion(pool));
  } catch (err) { next(err); }
});

module.exports = router;
