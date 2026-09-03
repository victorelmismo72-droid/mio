const express = require('express');
const { pool, registrarAuditoria } = require('../db');
const { hashPassword, requireAdmin } = require('../auth');

// Gestion de usuarios: alta/baja y cambio de rol. Excepcion 1 de Fase 3
// punto 1 ("modificar el programa") - solo el Administrador. Nunca se
// borra un usuario de verdad (se desactiva) para no perder la trazabilidad
// de que registros creo en su dia.
// (La sesion ya se exige globalmente en server.js antes de llegar aqui -
// solo hace falta comprobar el rol.)
const router = express.Router();

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, usuario, nombre, rol, activo, creado_en, modificado_en FROM usuarios ORDER BY id'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { usuario, nombre, password, rol } = req.body;
    if (!usuario || !nombre || !password) return res.status(400).json({ error: 'Falta usuario, nombre o contraseña' });
    if (rol && !['ESTANDAR', 'ADMINISTRADOR'].includes(rol)) return res.status(400).json({ error: 'Rol no valido' });

    const hash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ($1,$2,$3,$4)
       RETURNING id, usuario, nombre, rol, activo, creado_en`,
      [usuario, nombre, hash, rol || 'ESTANDAR']
    );
    await registrarAuditoria(pool, { tabla: 'usuarios', accion: 'INSERT', registroId: rows[0].id, puestoOrigen: req.usuario.usuario, detalle: { usuario, rol: rol || 'ESTANDAR' } });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
    next(err);
  }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { nombre, rol, activo, password } = req.body;
    const campos = [];
    const valores = [];
    let i = 1;
    if (nombre !== undefined) { campos.push(`nombre = $${i++}`); valores.push(nombre); }
    if (rol !== undefined) {
      if (!['ESTANDAR', 'ADMINISTRADOR'].includes(rol)) return res.status(400).json({ error: 'Rol no valido' });
      campos.push(`rol = $${i++}`); valores.push(rol);
    }
    if (activo !== undefined) { campos.push(`activo = $${i++}`); valores.push(activo); }
    if (password) { campos.push(`password_hash = $${i++}`); valores.push(await hashPassword(password)); }
    if (!campos.length) return res.status(400).json({ error: 'Nada que actualizar' });

    campos.push('modificado_en = now()');
    valores.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${i} RETURNING id, usuario, nombre, rol, activo, creado_en, modificado_en`,
      valores
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    await registrarAuditoria(pool, { tabla: 'usuarios', accion: 'UPDATE', registroId: req.params.id, puestoOrigen: req.usuario.usuario, detalle: { nombre, rol, activo, password_cambiada: !!password } });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
