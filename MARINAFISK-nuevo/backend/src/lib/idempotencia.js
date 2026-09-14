// Protección de guardado duplicado a nivel de servidor.
//
// Ver CORRECCIONES_2026-09-02_HTML_actual_MARINAFISK.md (punto 1) y
// FASE_2_logica_de_negocio_MARINAFISK.md (punto 5quater): el 01/09/2026 se
// creó el mismo pedido tres veces porque el botón de grabar no se bloqueaba
// mientras se procesaba el guardado. Bloquear el botón en la pantalla ayuda,
// pero no basta por sí solo (dos clics casi simultáneos, un reintento
// automático de red...) — la garantía real tiene que estar en el servidor.
//
// Cómo funciona: cada pedido/reparto/traspaso/compra que se graba lleva una
// "clave" única generada por la propia pantalla al pulsar grabar (el mismo
// "_uid" que el programa actual ya genera hoy). Usamos la clave primaria de
// la tabla `idempotencia` como cerrojo:
//   1. Intentamos insertar la clave con respuesta todavía vacía. Si eso
//      falla porque la clave ya existe, es que esta grabación ya se procesó
//      (o se está procesando ahora mismo en otra petición en paralelo) — no
//      se hace nada más.
//   2. Si el insert de la clave tiene éxito, ejecutamos el guardado real
//      dentro de la misma transacción y, si sale bien, rellenamos la
//      respuesta guardada.
//   3. Si el guardado real falla, toda la transacción se deshace —
//      incluida la reserva de la clave — así que un reintento posterior con
//      la misma clave (p.ej. tras un fallo de red) sí puede completarse.
async function ejecutarIdempotente(cliente, { clave, tabla, fn }) {
  if (!clave) {
    // Sin clave no hay forma de detectar duplicados: se ejecuta sin más.
    const respuesta = await fn();
    return { duplicado: false, enCurso: false, respuesta };
  }

  // Un INSERT que choca con la clave primaria deja abortada la transacción
  // en curso (Postgres ignora cualquier orden posterior hasta un ROLLBACK).
  // Por eso se marca un SAVEPOINT antes de intentarlo: si choca, se vuelve
  // a ese punto y la transacción exterior (donde vive el resto del guardado)
  // sigue utilizable con normalidad.
  await cliente.query('SAVEPOINT antes_de_idempotencia');
  try {
    await cliente.query(
      `INSERT INTO idempotencia (clave, tabla, respuesta) VALUES ($1, $2, 'null'::jsonb)`,
      [clave, tabla]
    );
  } catch (err) {
    if (err.code === '23505') {
      await cliente.query('ROLLBACK TO SAVEPOINT antes_de_idempotencia');
      // La clave ya existe: o ya se grabó, o se está grabando ahora mismo.
      const r = await cliente.query('SELECT respuesta FROM idempotencia WHERE clave = $1', [clave]);
      const respuestaGuardada = r.rows.length ? r.rows[0].respuesta : null;
      if (respuestaGuardada !== null) {
        return { duplicado: true, enCurso: false, respuesta: respuestaGuardada };
      }
      return { duplicado: true, enCurso: true, respuesta: null };
    }
    throw err;
  }

  const respuesta = await fn();
  await cliente.query('UPDATE idempotencia SET respuesta = $2 WHERE clave = $1', [clave, JSON.stringify(respuesta)]);
  return { duplicado: false, enCurso: false, respuesta };
}

module.exports = { ejecutarIdempotente };
