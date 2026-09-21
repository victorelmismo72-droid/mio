// Ayudantes compartidos por todas las pantallas del frontend nuevo:
// llamadas al backend, generación de idempotencyKey, y el "puesto" de este
// ordenador (CORU/PANC) que se manda en cada escritura — ver Fase 1 punto 5
// y Fase 0 punto 6.

async function apiGet(ruta) {
  const resp = await fetch(ruta);
  const cuerpo = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(cuerpo.error || `Error al leer ${ruta} (HTTP ${resp.status}).`);
  return cuerpo;
}

async function apiPost(ruta, datos, metodo) {
  const resp = await fetch(ruta, {
    method: metodo || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  const cuerpo = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(cuerpo.error || `Error al guardar en ${ruta} (HTTP ${resp.status}).`);
  return cuerpo;
}

function nuevaIdempotencyKey() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// El puesto (CORU/PANC/nombre libre) se recuerda por ordenador, igual que
// "Nombre de este puesto" en el HTML actual — cada ordenador lo configura
// una vez. localStorage es solo una comodidad de este navegador: si se
// borra o no está disponible, se pide de nuevo, sin romper nada.
function puestoActual() {
  try {
    return localStorage.getItem('marinafisk_puesto') || null;
  } catch (e) {
    return null;
  }
}

function definirPuesto(forzarPregunta) {
  let actual;
  try { actual = localStorage.getItem('marinafisk_puesto'); } catch (e) { actual = null; }
  if (actual && !forzarPregunta) return actual;
  const nuevo = prompt('¿Nombre de este puesto/ordenador? (ej. CORU, PANC)', actual || 'CORU');
  if (!nuevo) return actual;
  const limpio = nuevo.trim().toUpperCase();
  try { localStorage.setItem('marinafisk_puesto', limpio); } catch (e) {}
  return limpio;
}

function pintarBotonPuesto(id) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const actualizar = () => { btn.textContent = `📍 ${puestoActual() || 'sin definir'}`; };
  btn.addEventListener('click', () => { definirPuesto(true); actualizar(); });
  definirPuesto(false);
  actualizar();
}

// Formato de importe consistente con el resto del programa (2 decimales,
// separador español).
function fmt(n) {
  return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mostrarAviso(id, texto, tipo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.className = `aviso ${tipo}`;
}

function ocultarAviso(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'aviso';
  el.textContent = '';
}
