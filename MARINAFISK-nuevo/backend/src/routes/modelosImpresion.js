const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');
const { MODELOS, obtenerModelo } = require('../modelosImpresion');

const router = express.Router();

async function calibracionDe(cliente, modeloId) {
  const r = await cliente.query('SELECT campo_clave, x_mm, y_mm FROM calibraciones_impresion WHERE modelo_id = $1', [modeloId]);
  const mapa = new Map(r.rows.map((f) => [f.campo_clave, { x: Number(f.x_mm), y: Number(f.y_mm) }]));
  return mapa;
}

function conCamposCalibrados(modelo, mapaCalibracion) {
  return {
    ...modelo,
    campos: modelo.campos.map((c) => {
      const ajuste = mapaCalibracion.get(c.clave);
      return { ...c, xMmActual: ajuste ? ajuste.x : c.xMm, yMmActual: ajuste ? ajuste.y : c.yMm, calibrado: !!ajuste };
    }),
  };
}

// Catálogo completo — Fase 4 corrección punto 8: generado desde el único
// registro central, nunca mantenido a mano en dos sitios.
router.get('/', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const salida = [];
      for (const m of MODELOS) {
        const mapa = await calibracionDe(cliente, m.id);
        salida.push(conCamposCalibrados(m, mapa));
      }
      return salida;
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const modelo = obtenerModelo(req.params.id);
    if (!modelo) return res.status(404).json({ error: `No existe el modelo de impresión "${req.params.id}".` });
    const resultado = await conTransaccion(async (cliente) => conCamposCalibrados(modelo, await calibracionDe(cliente, modelo.id)));
    res.json(resultado);
  } catch (err) { next(err); }
});

// Guarda el ajuste en milímetros de un campo concreto (el editor de
// calibración llama a esto cada vez que Víctor mueve/afina una posición).
router.put('/:id/calibracion', async (req, res, next) => {
  try {
    const modelo = obtenerModelo(req.params.id);
    if (!modelo) return res.status(404).json({ error: `No existe el modelo de impresión "${req.params.id}".` });
    const { campos } = req.body; // [{ clave, x_mm, y_mm }]
    if (!Array.isArray(campos)) return res.status(400).json({ error: 'Falta "campos" (array de {clave, x_mm, y_mm}).' });

    await conTransaccion(async (cliente) => {
      for (const c of campos) {
        await cliente.query(
          `INSERT INTO calibraciones_impresion (modelo_id, campo_clave, x_mm, y_mm, actualizado_en)
           VALUES ($1,$2,$3,$4, now())
           ON CONFLICT (modelo_id, campo_clave) DO UPDATE SET x_mm = EXCLUDED.x_mm, y_mm = EXCLUDED.y_mm, actualizado_en = now()`,
          [modelo.id, c.clave, c.x_mm, c.y_mm]
        );
      }
      await registrarEscritura(cliente, { tabla: 'calibraciones_impresion', operacion: 'UPDATE', registroId: modelo.id, detalle: { campos } });
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Restaurar de fábrica: borra el ajuste manual, vuelve a las coordenadas de
// partida del propio código (botón "↩️ Restaurar de fábrica" del HTML actual).
router.delete('/:id/calibracion', async (req, res, next) => {
  try {
    const modelo = obtenerModelo(req.params.id);
    if (!modelo) return res.status(404).json({ error: `No existe el modelo de impresión "${req.params.id}".` });
    await conTransaccion((cliente) => cliente.query('DELETE FROM calibraciones_impresion WHERE modelo_id = $1', [modelo.id]));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
