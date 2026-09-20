// Configuración compartida (tabla "configuracion", clave/valor) — FASE_5:
// sustituye el localStorage por ordenador que usaba el HTML actual para
// "días de caducidad" (y, más abajo, para el contacto de Scanfisk Celeiro)
// por un valor único, igual desde CORU y PANC.
const CLAVE_DIAS_CADUCIDAD = 'dias_caducidad_etiquetas';
const DIAS_CADUCIDAD_POR_DEFECTO = 7;

// Mismas claves que usaba cambiarContactoScanfiskCeleiro() del HTML actual
// en localStorage — aquí compartidas entre puestos, no por ordenador.
const CLAVE_TEL_SCANFISK = 'scanfisk_celeiro_tel';
const CLAVE_EMAIL_SCANFISK = 'scanfisk_celeiro_email';

async function obtenerContactoScanfiskCeleiro(cliente) {
  const r = await cliente.query('SELECT clave, valor FROM configuracion WHERE clave IN ($1, $2)', [CLAVE_TEL_SCANFISK, CLAVE_EMAIL_SCANFISK]);
  const porClave = Object.fromEntries(r.rows.map((f) => [f.clave, f.valor]));
  return { tel: porClave[CLAVE_TEL_SCANFISK] || '', email: porClave[CLAVE_EMAIL_SCANFISK] || '' };
}

async function fijarContactoScanfiskCeleiro(cliente, { tel, email }) {
  await cliente.query(
    `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ($1, $2, now()), ($3, $4, now())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
    [CLAVE_TEL_SCANFISK, tel || '', CLAVE_EMAIL_SCANFISK, email || '']
  );
}

async function obtenerDiasCaducidad(cliente) {
  const r = await cliente.query('SELECT valor FROM configuracion WHERE clave = $1', [CLAVE_DIAS_CADUCIDAD]);
  if (!r.rows.length) return DIAS_CADUCIDAD_POR_DEFECTO;
  const dias = parseInt(r.rows[0].valor, 10);
  return Number.isFinite(dias) && dias > 0 ? dias : DIAS_CADUCIDAD_POR_DEFECTO;
}

async function fijarDiasCaducidad(cliente, dias) {
  await cliente.query(
    `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ($1, $2, now())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
    [CLAVE_DIAS_CADUCIDAD, String(dias)]
  );
}

module.exports = {
  obtenerDiasCaducidad, fijarDiasCaducidad, DIAS_CADUCIDAD_POR_DEFECTO,
  obtenerContactoScanfiskCeleiro, fijarContactoScanfiskCeleiro,
};
