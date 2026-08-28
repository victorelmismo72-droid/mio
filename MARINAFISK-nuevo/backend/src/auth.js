/*
 * MARINAFISK - Fase 3: autenticacion real.
 *
 * Sesiones por token opaco (no JWT) guardadas en la tabla `sesiones` -
 * mas simple de razonar y de revocar (basta con borrar la fila) para un
 * equipo de este tamano. El login debe ser rapido (Fase 3 punto 5): la
 * sesion dura 30 dias, para que un usuario habitual no tenga que volver a
 * escribir su contrasena cada dia.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DURACION_SESION_DIAS = 30;

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verificarPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function crearSesion(pool, usuarioId) {
  const token = generarToken();
  const expiraEn = new Date(Date.now() + DURACION_SESION_DIAS * 24 * 60 * 60 * 1000);
  await pool.query('INSERT INTO sesiones (token, usuario_id, expira_en) VALUES ($1, $2, $3)', [token, usuarioId, expiraEn]);
  return { token, expira_en: expiraEn };
}

async function usuarioPorToken(pool, token) {
  const { rows } = await pool.query(
    `SELECT u.id, u.usuario, u.nombre, u.rol, u.activo
     FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = $1 AND s.expira_en > now()`,
    [token]
  );
  if (!rows.length || !rows[0].activo) return null;
  return rows[0];
}

// Middleware: exige un token valido en `Authorization: Bearer <token>` y
// deja al usuario autenticado en req.usuario.
function requireAuth(pool) {
  return async (req, res, next) => {
    const cabecera = req.headers.authorization || '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Falta iniciar sesion' });
    const usuario = await usuarioPorToken(pool, token);
    if (!usuario) return res.status(401).json({ error: 'Sesion no valida o caducada' });
    req.usuario = usuario;
    req.token = token;
    next();
  };
}

// Excepcion 1 de Fase 3 punto 1: modificar el programa (usuarios,
// parametros, cierre de ano) es solo del rol Administrador.
function requireAdmin(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: 'Falta iniciar sesion' });
  if (req.usuario.rol !== 'ADMINISTRADOR') return res.status(403).json({ error: 'Esta accion es solo para el Administrador' });
  next();
}

module.exports = {
  hashPassword, verificarPassword, generarToken, crearSesion, usuarioPorToken,
  requireAuth, requireAdmin, DURACION_SESION_DIAS,
};
