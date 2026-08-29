/*
 * MARINAFISK - Fase 4: logica compartida de sesion, llamadas a la API y
 * barra de navegacion, para no repetirla en cada pantalla.
 */
const API = '/api';

function tokenGuardado() { return sessionStorage.getItem('marinafisk_token'); }
function usuarioGuardado() {
  try { return JSON.parse(sessionStorage.getItem('marinafisk_usuario') || 'null'); } catch (e) { return null; }
}
function guardarSesion(token, usuario) {
  sessionStorage.setItem('marinafisk_token', token);
  sessionStorage.setItem('marinafisk_usuario', JSON.stringify(usuario));
}
function cerrarSesionLocal() {
  sessionStorage.removeItem('marinafisk_token');
  sessionStorage.removeItem('marinafisk_usuario');
}

// Si no hay sesion, manda a la pantalla de login. Si la hay, devuelve el
// usuario. Cada pantalla (salvo login.html) debe llamar a esto lo primero.
function protegerPagina() {
  if (!tokenGuardado()) {
    window.location.href = 'login.html';
    return null;
  }
  return usuarioGuardado();
}

// fetch autenticado: anade el token, y si el servidor dice que la sesion no
// vale (401), manda a la pantalla de login en vez de fallar en silencio.
async function apiFetch(ruta, opciones = {}) {
  const res = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: { ...(opciones.headers || {}), Authorization: `Bearer ${tokenGuardado()}` },
  });
  if (res.status === 401) {
    cerrarSesionLocal();
    window.location.href = 'login.html';
    throw new Error('Sesion caducada');
  }
  return res;
}

async function cerrarSesion() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch (e) { /* ya deslogueada */ }
  cerrarSesionLocal();
  window.location.href = 'login.html';
}

const PAGINAS_NAV = [
  { href: 'index.html', etiqueta: 'Inicio' },
  { href: 'compras.html', etiqueta: 'Compras' },
  { href: 'pedidos.html', etiqueta: 'Pedidos' },
  { href: 'partidas.html', etiqueta: 'Partidas' },
  { href: 'listados.html', etiqueta: 'Listados' },
  { href: 'catalogos.html', etiqueta: 'Catálogos' },
  { href: 'fiscal.html', etiqueta: 'Clasificación fiscal' },
];

// Inserta la barra de navegacion al principio de <body>. `paginaActual` es
// el nombre de archivo (ej. 'compras.html') para resaltarlo.
function renderBarraNavegacion(usuario, paginaActual) {
  const nav = document.createElement('div');
  nav.id = 'barra-nav';

  const enlaces = PAGINAS_NAV.map((p) => {
    const activo = p.href === paginaActual ? ' activo' : '';
    return `<a class="nav-enlace${activo}" href="${p.href}">${p.etiqueta}</a>`;
  }).join('');

  const enlaceUsuarios = usuario && usuario.rol === 'ADMINISTRADOR'
    ? `<a class="nav-enlace${paginaActual === 'usuarios.html' ? ' activo' : ''}" href="usuarios.html">Usuarios</a>`
    : '';

  nav.innerHTML = `
    <div class="nav-marca">MARINAFISK</div>
    <div class="nav-enlaces">${enlaces}${enlaceUsuarios}</div>
    <div class="nav-usuario">
      <span>${(usuario && (usuario.nombre || usuario.usuario)) || ''}</span>
      <button id="btn-logout-global" type="button">Salir</button>
    </div>
  `;
  document.body.prepend(nav);
  document.getElementById('btn-logout-global').addEventListener('click', cerrarSesion);
}

function fmtEUR(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtKg(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' kg';
}
function fmtFecha(f) {
  if (!f) return '';
  const s = typeof f === 'string' ? f : new Date(f).toISOString();
  const [anio, mes, dia] = s.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

// Fecha local de HOY como texto 'AAAA-MM-DD' - nunca usar
// toISOString().split('T')[0] directamente (convierte a UTC y desplaza el
// dia cerca de medianoche, ver Fase 0 punto 7).
function fechaLocalISO() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}
