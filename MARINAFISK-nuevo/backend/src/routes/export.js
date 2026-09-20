// Endpoint de exportación (Fase 1, punto 3): genera un JSON con la MISMA
// estructura que el backup del programa actual, para poder comparar
// fácilmente durante la verificación de la migración. La lógica de
// construcción vive en lib/exportarDatos.js (también la usa
// scripts/verificar_migracion.js sin necesidad de este servidor HTTP).
const express = require('express');
const { construirExportacion } = require('../lib/exportarDatos');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await construirExportacion());
  } catch (err) { next(err); }
});

module.exports = router;
