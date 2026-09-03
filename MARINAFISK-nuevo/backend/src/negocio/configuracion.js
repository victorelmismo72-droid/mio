/*
 * MARINAFISK - parametros de negocio configurables (no fijos en el codigo).
 *
 * Victor ha pedido explicitamente que el Recargo de Equivalencia sea "el
 * porcentaje que queramos", no un valor fijo — y el margen minimo de
 * partida ya estaba senalado en la Fase 3 (punto 1) como un parametro que
 * el Administrador debe poder cambiar. En vez de tener estos numeros
 * escritos en el codigo, se guardan en la tabla `configuracion` (clave/valor)
 * y se leen en vivo en cada calculo — mismo principio que el 2% de OP
 * (Fase 0 punto 2): nunca un valor congelado.
 *
 * De momento estos endpoints estan abiertos (no hay usuarios/roles todavia,
 * eso es la Fase 3) - marcados para restringir a Administrador en cuanto
 * exista login real.
 */

const VALORES_POR_DEFECTO = {
  margen_minimo_partida: 1.30,
  recargo_equivalencia_pct: 1.4,
};

const DESCRIPCIONES = {
  margen_minimo_partida: 'Margen minimo en EUR/kg para asignar una partida automaticamente sin marcarla como excepcion.',
  recargo_equivalencia_pct: 'Porcentaje de Recargo de Equivalencia a aplicar a clientes que lo tengan marcado (ver Fase 2 punto 2).',
};

async function obtenerNumero(pool, clave) {
  const { rows } = await pool.query('SELECT valor FROM configuracion WHERE clave = $1', [clave]);
  if (rows.length) return Number(rows[0].valor);
  return VALORES_POR_DEFECTO[clave];
}

async function listarConfiguracion(pool) {
  const { rows } = await pool.query('SELECT clave, valor, modificado_en FROM configuracion');
  const guardados = new Map(rows.map((r) => [r.clave, r]));
  return Object.keys(VALORES_POR_DEFECTO).map((clave) => ({
    clave,
    valor: guardados.has(clave) ? Number(guardados.get(clave).valor) : VALORES_POR_DEFECTO[clave],
    valor_por_defecto: VALORES_POR_DEFECTO[clave],
    descripcion: DESCRIPCIONES[clave],
    modificado_en: guardados.has(clave) ? guardados.get(clave).modificado_en : null,
  }));
}

async function actualizarConfiguracion(pool, clave, valor) {
  if (!(clave in VALORES_POR_DEFECTO)) {
    const err = new Error(`Parametro de configuracion desconocido: ${clave}`);
    err.status = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO configuracion (clave, valor) VALUES ($1, $2)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, modificado_en = now()`,
    [clave, String(valor)]
  );
}

module.exports = { obtenerNumero, listarConfiguracion, actualizarConfiguracion, VALORES_POR_DEFECTO };
