// Cliente sencillo para hablar con la API del backend. Añade siempre la
// cabecera X-Puesto-Codigo (Fase 3) con lo que haya elegido el usuario de
// este ordenador, guardado en el propio navegador.
const CLAVE_PUESTO = 'marinafisk_puesto';

export function obtenerPuesto() {
  return localStorage.getItem(CLAVE_PUESTO) || '';
}
export function fijarPuesto(codigo) {
  localStorage.setItem(CLAVE_PUESTO, codigo);
}

async function peticion(metodo, ruta, cuerpo) {
  const cabeceras = { 'Content-Type': 'application/json' };
  const puesto = obtenerPuesto();
  if (puesto) cabeceras['X-Puesto-Codigo'] = puesto;

  const r = await fetch(ruta, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });

  const texto = await r.text();
  let datos = null;
  if (texto) {
    try { datos = JSON.parse(texto); } catch (e) { datos = texto; }
  }
  if (!r.ok) {
    const mensaje = (datos && datos.error) ? datos.error : `Error ${r.status} en ${ruta}`;
    const err = new Error(mensaje);
    err.status = r.status;
    err.datos = datos;
    throw err;
  }
  return datos;
}

export const api = {
  get: (ruta) => peticion('GET', ruta),
  post: (ruta, cuerpo) => peticion('POST', ruta, cuerpo),
  put: (ruta, cuerpo) => peticion('PUT', ruta, cuerpo),
  del: (ruta) => peticion('DELETE', ruta),
};

// Genera una clave única para "uid" (protección de guardado duplicado,
// Fase 1 corrección 02/09/2026 punto 1) — mismo formato que ya usa el
// programa actual: YYYYMMDDTHHMMSS_PUESTO_azar.
export function generarUid() {
  const marca = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 15);
  const puesto = (obtenerPuesto() || 'WEB4').slice(0, 4).toUpperCase();
  const azar = Math.random().toString(36).slice(2, 6);
  return `${marca}_${puesto}_${azar}`;
}
