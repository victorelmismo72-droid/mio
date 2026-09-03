// Bloqueo de grabaciones duplicadas por doble clic (informe de Víctor,
// 02/09/2026, punto 1: el mismo pedido se grabó tres veces el 01/09/2026
// porque el botón "GRABAR" no se bloqueaba mientras se procesaba el
// guardado). La corrección aplicada al HTML actual solo desactiva el botón
// en pantalla - no evita que una segunda petición llegue igualmente (red
// lenta, doble clic justo antes de que el botón se desactive, un reintento
// automático del navegador...). Aquí se añade la capa que pide el informe:
// protección real en el servidor, además de la de pantalla que ya tienen
// pedidos.html/repartos.html/traspasos.html/compras.html.
//
// Mientras haya una grabación en curso de un usuario para una tabla, se
// rechaza cualquier otra petición de guardado igual en vez de dejarla
// crear un segundo registro en paralelo.
const enCurso = new Set();

function bloquearGrabacionDuplicada(tabla) {
  return (req, res, next) => {
    const clave = `${req.usuario.usuario}:${tabla}`;
    if (enCurso.has(clave)) {
      return res.status(409).json({ error: 'Ya hay una grabación en curso. Espera a que termine antes de volver a guardar.' });
    }
    enCurso.add(clave);
    // Se libera pase lo que pase - éxito, error o corte de conexión - para
    // que un fallo real nunca deje la tabla bloqueada para ese usuario.
    res.on('finish', () => enCurso.delete(clave));
    res.on('close', () => enCurso.delete(clave));
    next();
  };
}

module.exports = { bloquearGrabacionDuplicada };
