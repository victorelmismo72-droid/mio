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

// Aviso de PALETS antes de grabar (documento electrónico de control
// obligatorio desde el 5/10/2026 en el HTML real — Pedidos, Traspasos y
// Repartos) — puerto directo de pedirPaletsYGrabar()/confirmarPaletsYGrabar()
// del HTML, como un modal propio en vez de prompt() nativo para que encaje
// con el resto del diseño. Devuelve una promesa con el nº de palets elegido
// (entero ≥ 0), o `null` si se cancela (Esc / "Volver") — en ese caso NO se
// debe grabar nada. Enter confirma.
function pedirPalets({ titulo, contexto, valorActual }) {
  return new Promise((resolve) => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal-caja">
        <div class="modal-titulo">🚛 ${titulo}</div>
        <div class="modal-contexto">${contexto}</div>
        <input type="number" id="modal-palets-valor" min="0" step="1" value="${Number(valorActual) || 0}">
        <div class="modal-ayuda">Por defecto <b>0</b> = sale impreso <b>PALET VARIADO</b>. Si lleva palets, escribe el número.</div>
        <div class="modal-error" id="modal-palets-error"></div>
        <div class="modal-botones">
          <button type="button" class="btn btn-secundario" id="modal-palets-cancelar">Volver sin grabar</button>
          <button type="button" class="btn btn-exito" id="modal-palets-ok">Confirmar y grabar</button>
        </div>
      </div>`;
    document.body.appendChild(fondo);
    const input = fondo.querySelector('#modal-palets-valor');
    const error = fondo.querySelector('#modal-palets-error');
    setTimeout(() => { input.focus(); input.select(); }, 30);

    const cerrar = (valor) => { fondo.remove(); resolve(valor); };
    const confirmar = () => {
      const txt = String(input.value).trim();
      const n = txt === '' ? 0 : Number(txt);
      if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
        error.textContent = 'Escribe un número entero (0 si no lleva palets).';
        return;
      }
      cerrar(n);
    };
    fondo.querySelector('#modal-palets-ok').addEventListener('click', confirmar);
    fondo.querySelector('#modal-palets-cancelar').addEventListener('click', () => cerrar(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
      else if (e.key === 'Escape') { e.preventDefault(); cerrar(null); }
    });
    fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(null); });
  });
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

// Aviso flotante no bloqueante (ej. "partida X: te pasaste Y kg") — puerto
// directo de avisoPartida() del HTML real (26/11/2026, "ELEGIR PARTIDA
// AUNQUE SE PASE DE KILOS"): se cierra solo a los 6s, no exige ninguna
// acción, y no interrumpe lo que se esté haciendo (a diferencia de
// mostrarAviso, que ocupa una caja fija en la pantalla).
function avisoFlotante(mensaje) {
  const existente = document.getElementById('aviso-flotante');
  if (existente) existente.remove();
  const d = document.createElement('div');
  d.id = 'aviso-flotante';
  d.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:100000;background:#b45309;color:#fff;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.35);pointer-events:none;max-width:90vw;text-align:center;';
  d.textContent = mensaje;
  document.body.appendChild(d);
  setTimeout(() => { if (d.parentNode) d.remove(); }, 6000);
}
