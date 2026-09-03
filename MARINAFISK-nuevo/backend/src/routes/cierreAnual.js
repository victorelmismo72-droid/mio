const express = require('express');
const { pool, registrarAuditoria } = require('../db');
const { requireAdmin } = require('../auth');

// Cierre de ano (Fase 3 punto 1bis): reinicia hacia adelante la numeracion
// de pedidos/partidas/traspasos/repartos. NO borra ni modifica datos
// historicos - solo mueve las secuencias. Exclusivo del Administrador,
// exige confirmacion explicita, y queda registrado quien y cuando.
const router = express.Router();

const SECUENCIAS = {
  pedido: 'seq_pedido_numero',
  partida: 'seq_partida_numero',
  traspaso: 'seq_traspaso_numero',
  reparto: 'seq_reparto_numero',
};

async function leerContadores(client) {
  const resultado = {};
  for (const [clave, secuencia] of Object.entries(SECUENCIAS)) {
    const { rows } = await client.query(`SELECT last_value FROM ${secuencia}`);
    resultado[clave] = Number(rows[0].last_value);
  }
  return resultado;
}

// Vista previa: que va a pasar si se ejecuta el cierre ahora mismo, sin
// ejecutarlo - para que Victor pueda ver "esto es lo que va a cambiar"
// antes de confirmar (Fase 3 punto 1bis).
router.get('/vista-previa', requireAdmin, async (req, res, next) => {
  try {
    const antes = await leerContadores(pool);
    res.json({
      contadores_actuales: antes,
      contadores_tras_el_cierre: { pedido: 1, partida: 1, traspaso: 1, reparto: 1 },
      aviso: 'Los datos de años anteriores no se borran ni se modifican. Solo se reinicia la numeración de pedidos, partidas, traspasos y repartos hacia adelante.',
    });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (req.body.confirmacion !== true) {
      return res.status(400).json({ error: 'Falta confirmar explícitamente (confirmacion: true) - esta acción no se puede deshacer.' });
    }

    await client.query('BEGIN');
    const antes = await leerContadores(client);
    for (const secuencia of Object.values(SECUENCIAS)) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(`SELECT setval('${secuencia}', 1, false)`);
    }
    const despues = await leerContadores(client);

    const { rows } = await client.query(
      `INSERT INTO cierres_anuales (ejecutado_por, contadores_antes, contadores_despues)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.usuario.id, JSON.stringify(antes), JSON.stringify(despues)]
    );

    await registrarAuditoria(client, {
      tabla: 'cierres_anuales', accion: 'INSERT', registroId: rows[0].id,
      puestoOrigen: req.usuario.usuario, detalle: { antes, despues },
    });

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

router.get('/historial', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.usuario AS ejecutado_por_usuario, u.nombre AS ejecutado_por_nombre
       FROM cierres_anuales c JOIN usuarios u ON u.id = c.ejecutado_por
       ORDER BY c.id DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
