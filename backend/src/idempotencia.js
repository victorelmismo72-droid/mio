// Proteccion contra doble/triple grabacion por clic repetido - A NIVEL DE
// SERVIDOR (ver CORRECCIONES_02-09-2026_para_Code.md punto 1 y FASE_0 punto
// 11.3). El fallo real que esto corrige: en el HTML actual, un mismo clic en
// "GRABAR" repetido mientras el guardado tardaba en confirmarse generaba el
// mismo pedido varias veces, cada uno con su propio numero - porque solo
// habia proteccion en pantalla (boton deshabilitado), no en el backend. Un
// boton deshabilitado no protege contra reintentos de red, doble pestaña, ni
// una segunda petición que ya salió antes de que el boton se desactivara.
//
// Contrato con el cliente: toda peticion que use esta proteccion DEBE incluir
// "idempotencyKey" en el cuerpo - una clave que el cliente genera UNA VEZ por
// intento de guardado (ej. un UUID generado al pulsar el boton) y que debe
// reenviar TAL CUAL si reintenta ese mismo clic (nunca generar una clave
// nueva para reintentar el mismo intento - eso anularia la proteccion).
//
// Como funciona: se intenta crear un registro de "clave de idempotencia" con
// esa clave (columna UNIQUE en la base de datos - la garantia real viene de
// ahi, no de ninguna comprobacion en memoria de Node, que no serviria si
// hubiera varios procesos backend). Si ya existe:
//   - Si la peticion original ya termino, se devuelve la MISMA respuesta que
//     se guardo entonces, sin crear nada nuevo.
//   - Si la peticion original todavia se esta procesando, se devuelve 409
//     (no se crea nada, y no se espera indefinidamente).
// Si la creacion real falla (error de negocio), se borra el registro de
// idempotencia para no dejar esa clave bloqueada para siempre - un reintento
// posterior con la MISMA clave debe poder volver a intentarlo limpio.
const { prisma } = require('./db');

async function conIdempotencia(req, res, ruta, ejecutar) {
  const clave = req.body && req.body.idempotencyKey;
  if (!clave || typeof clave !== 'string') {
    res.status(400).json({
      error: 'Falta "idempotencyKey" en el cuerpo de la petición. Es obligatoria para evitar grabaciones duplicadas por clic repetido o reintento de red — genera un valor único (ej. un UUID) por cada intento de guardado y reenvíalo igual si reintentas ese mismo intento.',
    });
    return;
  }

  let registro;
  try {
    registro = await prisma.claveIdempotencia.create({ data: { clave, ruta, estado: 'EN_PROCESO' } });
  } catch (err) {
    if (err.code === 'P2002') {
      const existente = await prisma.claveIdempotencia.findUnique({ where: { clave } });
      if (existente && existente.estado === 'COMPLETADA') {
        res.status(existente.statusHttp || 200).json(existente.respuesta);
        return;
      }
      res.status(409).json({
        error: 'Ya se está procesando una grabación con esta misma clave (posible clic repetido o petición duplicada en curso). Espera un momento y comprueba el resultado antes de reintentar.',
      });
      return;
    }
    throw err;
  }

  try {
    const resultado = await ejecutar(); // debe devolver { statusHttp, cuerpo }
    await prisma.claveIdempotencia.update({
      where: { id: registro.id },
      data: { estado: 'COMPLETADA', statusHttp: resultado.statusHttp, respuesta: resultado.cuerpo, completadoEn: new Date() },
    });
    res.status(resultado.statusHttp).json(resultado.cuerpo);
  } catch (err) {
    await prisma.claveIdempotencia.delete({ where: { id: registro.id } }).catch(() => {});
    throw err;
  }
}

module.exports = { conIdempotencia };
