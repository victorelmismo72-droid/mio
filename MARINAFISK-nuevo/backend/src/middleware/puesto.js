// Fase 3, punto 2: identificar de qué puesto (CORU/PANC) viene cada
// petición, sin depender de un texto libre metido dentro del _uid como hoy.
//
// Una futura pantalla (Fase 4) mandará la cabecera "X-Puesto-Codigo: CORU"
// (o "PANC") en cada petición que escribe datos. Este middleware la
// resuelve a un id numérico de la tabla `puestos` y lo dejar en
// `req.puestoId`, listo para usarse como valor por defecto si el cuerpo de
// la petición no trae ya un `puesto_id` explícito.
//
// No es obligatorio: si no llega la cabecera, req.puestoId queda `null` y
// todo sigue funcionando exactamente igual que antes de esta fase.
const { pool } = require('../db');

async function resolverPuesto(req, res, next) {
  try {
    const codigo = req.get('X-Puesto-Codigo');
    if (!codigo) { req.puestoId = null; return next(); }
    const r = await pool.query('SELECT id FROM puestos WHERE codigo = $1', [codigo.toUpperCase()]);
    if (!r.rows.length) {
      return res.status(400).json({ error: `La cabecera X-Puesto-Codigo trae "${codigo}", que no existe en la tabla puestos (los válidos hoy son CORU y PANC).` });
    }
    req.puestoId = r.rows[0].id;
    next();
  } catch (err) { next(err); }
}

module.exports = { resolverPuesto };
