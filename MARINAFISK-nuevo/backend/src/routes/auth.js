const express = require('express');
const { pool } = require('../db');
const { verificarPassword, crearSesion, requireAuth } = require('../auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password) return res.status(400).json({ error: 'Falta usuario o contraseña' });

    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
    const registro = rows[0];
    if (!registro || !registro.activo) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const ok = await verificarPassword(password, registro.password_hash);
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const sesion = await crearSesion(pool, registro.id);
    res.json({
      token: sesion.token,
      expira_en: sesion.expira_en,
      usuario: { id: registro.id, usuario: registro.usuario, nombre: registro.nombre, rol: registro.rol },
    });
  } catch (err) { next(err); }
});

router.post('/logout', requireAuth(pool), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM sesiones WHERE token = $1', [req.token]);
    res.status(204).end();
  } catch (err) { next(err); }
});

router.get('/me', requireAuth(pool), async (req, res) => {
  res.json({ usuario: req.usuario });
});

module.exports = router;
