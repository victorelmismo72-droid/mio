const express = require('express');
const { pool } = require('../db');

// Lista de precios (Fase 1 punto 6bis / HTML actual: "Lista de precios",
// modo AUTO o MANUAL). A diferencia del HTML actual (que guardaba el
// borrador en localStorage, por ordenador, no compartido), aqui se guarda en
// la base de datos por (tipo, fecha de hoy) - igual que ya se hizo con
// "contactados_hoy" en la Fase 3: si Victor empieza el borrador de hoy,
// Pancho lo ve y puede seguir donde lo dejo.
const router = express.Router();

const TIPOS_VALIDOS = ['MAYORISTA', 'PESCADERIA'];

function validarTipo(req, res, next) {
  if (!TIPOS_VALIDOS.includes(req.params.tipo)) return res.status(400).json({ error: 'Tipo no válido (MAYORISTA o PESCADERIA).' });
  next();
}

router.get('/:tipo/hoy', validarTipo, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM listas_precio WHERE tipo = $1 AND fecha = CURRENT_DATE`,
      [req.params.tipo]
    );
    if (!rows.length) return res.json(null);
    const { rows: lineas } = await pool.query(
      `SELECT * FROM lista_precio_lineas WHERE lista_precio_id = $1 ORDER BY id`,
      [rows[0].id]
    );
    res.json({ ...rows[0], lineas });
  } catch (err) { next(err); }
});

// Guarda el borrador de hoy para ese tipo - reemplaza siempre las lineas
// enteras (es un borrador que se reescribe segun se teclea, no un documento
// con historial que haya que preservar linea a linea).
router.put('/:tipo/hoy', validarTipo, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { modo, lineas = [] } = req.body;
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO listas_precio (tipo, fecha, modo)
       VALUES ($1, CURRENT_DATE, $2)
       ON CONFLICT (tipo, fecha) DO UPDATE SET modo = EXCLUDED.modo, modificado_en = now()
       RETURNING *`,
      [req.params.tipo, modo === 'AUTO' ? 'AUTO' : 'MANUAL']
    );
    const lista = rows[0];
    await client.query('DELETE FROM lista_precio_lineas WHERE lista_precio_id = $1', [lista.id]);
    const lineasInsertadas = [];
    for (const l of lineas) {
      // eslint-disable-next-line no-await-in-loop
      const { rows: lr } = await client.query(
        `INSERT INTO lista_precio_lineas (lista_precio_id, descripcion, precio, coste, existencias)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [lista.id, l.descripcion || null, l.precio ?? null, l.coste ?? null, l.existencias ?? null]
      );
      lineasInsertadas.push(lr[0]);
    }
    await client.query('COMMIT');
    res.json({ ...lista, lineas: lineasInsertadas });
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

module.exports = router;
