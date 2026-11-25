// Pantalla de Pedidos (albaranes de venta) del frontend nuevo — mismo
// objetivo y mismo patrón que compras.js: tan rápida de teclear como el
// Excel/HTML actual, con las mismas teclas para moverse entre campos
// (Tab/Enter recorre Cajas → Peso → €/Kg → Partida → Dto → siguiente línea).
//
// El Nº de albarán lo asigna el servidor automáticamente (secuencia real de
// la base de datos, ver Pedido.numero en schema.prisma) si se deja en
// blanco — igual que el Nº de partida en Compras, Víctor puede teclear uno
// a mano solo si lo necesita (ej. encajar con un albarán ya impreso).
//
// El IVA/Recargo de Equivalencia real (según el tipo fiscal del cliente) lo
// calcula el servidor en vivo al grabar (ver backend/src/ivaVentas.js) —
// aquí solo se calcula una VISTA PREVIA con la misma fórmula para que
// Víctor vea el importe mientras teclea.
//
// Partida de venta (reescrito el 24/11/2026 — RESUMEN_COMPLETO_para_Code_
// 18-11-2026_7/8.md): Víctor NO usa la asignación automática y silenciosa
// en producción (la tiene desactivada por su propia decisión) — en su
// lugar, desde el 21/11 elige la partida a mano en un desplegable que se
// abre al teclear Intro/Tab en €/Kg (equivale a abrirPopupPartida() del
// HTML real). Si la partida elegida no cubre todo el peso de la línea, se
// abre un segundo desplegable "FALTAN X kg" para repartir el resto en otra
// partida, repitiendo hasta cubrirlo o hasta que Víctor decida dejar el
// resto en la última elegida (Esc / clic fuera). El servidor sigue
// pudiendo autoasignar en silencio si una línea se graba sin ninguna
// partida elegida (red de seguridad, no el camino normal).

// Agencias de transporte: lista cerrada (ver backend/src/agencias.js, única
// fuente de verdad para la validación real — esto es solo para construir
// el desplegable; el servidor vuelve a validar/normalizar igual que hoy).
const AGENCIAS_VALIDAS = ['TRANSFRIO', 'KARTIN', 'OLANO', 'MOUZO', 'FARIÑA'];
const MARGEN_MINIMO_PARTIDA = 1.30;

let clientes = [];
let articulos = [];
let clienteSeleccionado = null;
let lineas = [];
let idempotencyKeyActual = nuevaIdempotencyKey();
let guardando = false;

// "partidas": [] hasta que Víctor elige en el desplegable (una fila) o
// reparte entre varias (dos o más) - ver repartoAjustado() más abajo.
// "sinPartidaForzada" distingue "todavía no se ha elegido nada" (partidas
// vacío sin más — el servidor puede intentar autoasignar como red de
// seguridad) de "Víctor ha elegido explícitamente sin partida" en el
// desplegable (fila "— sin partida —") - en ese caso NO debe autoasignarse
// nada, se manda `partidaNumero: null` de verdad (ver pedidos.js backend).
const lineaVacia = () => ({ articuloId: null, articuloTexto: '', cajas: '', piezas: '', pesoTexto: '', precioKg: '', descuento: '', partidas: [], sinPartidaForzada: false });

// ===== Arranque =====

async function iniciar() {
  pintarBotonPuesto('btn-puesto');
  document.getElementById('pd-fecha').value = new Date().toISOString().slice(0, 10);
  poblarAgencias();
  try {
    [clientes, articulos] = await Promise.all([apiGet('/clientes'), apiGet('/articulos')]);
  } catch (err) {
    mostrarAviso('pd-aviso', '⚠️ No se ha podido conectar con el servidor: ' + err.message, 'error');
  }
  reiniciarFormulario();

  document.getElementById('btn-add-linea').addEventListener('click', () => { agregarLinea(); enfocar('pq_', lineas.length - 1); });
  document.getElementById('btn-grabar').addEventListener('click', grabarPedido);
  document.getElementById('pd-cli-buscar').addEventListener('input', (e) => buscarCliente(e.target.value));

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#pd-cli-buscar') && !e.target.closest('#pd-cli-sugerencias')) {
      document.getElementById('pd-cli-sugerencias').style.display = 'none';
    }
    document.querySelectorAll('.sugerencias[data-linea]').forEach((dd) => {
      if (!e.target.closest(`#pda_${dd.dataset.linea}`) && !e.target.closest(`#pda_dd_${dd.dataset.linea}`)) {
        dd.style.display = 'none';
      }
    });
  });
}

function poblarAgencias() {
  const sel = document.getElementById('pd-agencia');
  AGENCIAS_VALIDAS.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    sel.appendChild(opt);
  });
}

function reiniciarFormulario() {
  document.getElementById('pd-numero-in').value = '';
  document.getElementById('pd-cli-buscar').value = '';
  document.getElementById('pd-agencia').value = '';
  document.getElementById('pd-formapago').value = '';
  document.getElementById('pd-palets').value = 0;
  document.getElementById('pd-cliente-info').style.display = 'none';
  clienteSeleccionado = null;
  lineas = [lineaVacia()];
  idempotencyKeyActual = nuevaIdempotencyKey();
  ocultarAviso('pd-aviso');
  renderLineas();
  recalcularTotales();
}

// ===== Cliente =====

function buscarCliente(q) {
  const dd = document.getElementById('pd-cli-sugerencias');
  if (!q || q.length < 1) { dd.style.display = 'none'; return; }
  const ql = q.toLowerCase();
  const coincidencias = clientes
    .filter((c) => c.codigo.toLowerCase().includes(ql) || c.nombre.toLowerCase().includes(ql))
    .slice(0, 10);
  if (!coincidencias.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = coincidencias.map((c) => `
    <div class="sug-item" data-id="${c.id}">
      <span class="sug-cod">${c.codigo}</span>${c.nombre}
    </div>`).join('');
  dd.querySelectorAll('.sug-item').forEach((el) => {
    el.addEventListener('mousedown', () => elegirCliente(Number(el.dataset.id)));
  });
  dd.style.display = 'block';
}

function elegirCliente(id) {
  const c = clientes.find((x) => x.id === id);
  if (!c) return;
  clienteSeleccionado = c;
  document.getElementById('pd-cli-buscar').value = `${c.codigo} — ${c.nombre}`;
  document.getElementById('pd-cli-sugerencias').style.display = 'none';

  // Agencia y forma de pago: se rellenan como valor por defecto del
  // cliente, pero siguen siendo editables para este pedido en concreto
  // (un pedido puntual puede ir por una agencia distinta a la habitual).
  if (c.agencia) document.getElementById('pd-agencia').value = c.agencia;
  if (c.formaPago) document.getElementById('pd-formapago').value = c.formaPago;

  pintarInfoCliente(c);
  recalcularTotales();
}

function pintarInfoCliente(c) {
  const info = document.getElementById('pd-cliente-info');
  const badge = document.getElementById('pd-cliente-iva');
  const dir = document.getElementById('pd-cliente-dir');
  info.style.display = 'flex';
  const etiquetas = { NORMAL: 'IVA Normal (10%)', RECARGO_EQUIVALENCIA: 'Recargo equiv. (11,4%)', INTRACOMUNITARIO: 'Intracomunitario (0%)' };
  const clases = { NORMAL: '', RECARGO_EQUIVALENCIA: 'recargo', INTRACOMUNITARIO: 'intra' };
  badge.textContent = etiquetas[c.tipoIva] || c.tipoIva;
  badge.className = 'badge-iva ' + (clases[c.tipoIva] || '');
  dir.textContent = [c.direccion, c.poblacion].filter(Boolean).join(', ') || 'Sin dirección registrada';
}

// ===== Cálculo en vivo (vista previa — el servidor es quien manda) =====

function evaluarExpresionPeso(valorTexto) {
  const texto = String(valorTexto == null ? '' : valorTexto).trim();
  if (texto === '') return 0;
  if (!/^[0-9.,+\-\s]+$/.test(texto)) return NaN;
  const tokens = texto.replace(/,/g, '.').replace(/\s+/g, '').match(/[+-]?[0-9]*\.?[0-9]+/g);
  if (!tokens || !tokens.length) return NaN;
  return tokens.reduce((s, t) => s + parseFloat(t), 0);
}

function calcularLineaPreview(l) {
  const peso = evaluarExpresionPeso(l.pesoTexto);
  const pesoNum = Number.isNaN(peso) ? 0 : peso;
  const precio = Number(l.precioKg) || 0;
  const descuento = Number(l.descuento) || 0;
  const total = pesoNum * precio * (1 - descuento / 100);
  return { peso: pesoNum, total };
}

// Puerto directo de calcularIvaPedido() (backend/src/ivaVentas.js) — mismo
// motivo que calcularLineaPreview de arriba: solo vista previa.
function calcularIvaPreview(base, tipoIva) {
  let ivaPct = 10, rePct = 0;
  if (tipoIva === 'INTRACOMUNITARIO') { ivaPct = 0; rePct = 0; }
  else if (tipoIva === 'RECARGO_EQUIVALENCIA') { ivaPct = 10; rePct = 1.4; }
  const iva = (base * (ivaPct + rePct)) / 100;
  return { ivaPct, rePct, iva, total: base + iva };
}

// ===== Reparto de partidas (ver Fase 2 punto 4, actualización 24/11/2026) =====

// Mismo cálculo que repartoPartidas() en backend/src/margenPartida.js, pero
// sobre el estado SIN GRABAR todavía de esta pantalla: los kilos de la
// ÚLTIMA partida elegida nunca se dan por buenos tal cual - se recalculan
// como "lo que falte hasta el peso de la línea", para que la vista se
// ajuste sola si el peso cambia después de repartir.
function repartoAjustado(l) {
  if (!l.partidas || !l.partidas.length) return [];
  const peso = evaluarExpresionPeso(l.pesoTexto);
  const pesoNum = Number.isNaN(peso) ? 0 : peso;
  const copia = l.partidas.map((p) => ({ ...p }));
  const sumaSalvoUltima = copia.slice(0, -1).reduce((s, p) => s + p.kilos, 0);
  copia[copia.length - 1].kilos = Math.max(0, pesoNum - sumaSalvoUltima);
  return copia;
}

// Kilos de una partida concreta que YA se han apartado en OTRAS líneas de
// este mismo pedido todavía sin grabar (equivale a reservasLineasPed() del
// HTML real) - el servidor ya hace lo mismo con lo que haya en la base de
// datos de otros pedidos; esto es solo la parte "en esta misma pantalla,
// ahora mismo" que el servidor no puede ver todavía.
function kilosReservadosPorOtrasLineas(numeroPartida, indiceActual) {
  let total = 0;
  lineas.forEach((l, idx) => {
    if (idx === indiceActual) return;
    repartoAjustado(l).forEach((p) => { if (p.numeroPartida === numeroPartida) total += p.kilos; });
  });
  return total;
}

function textoPartidas(l) {
  const reparto = repartoAjustado(l);
  if (!reparto.length) return null;
  if (reparto.length === 1) return String(reparto[0].numeroPartida);
  return reparto.map((p) => `${p.numeroPartida} (${fmt(p.kilos)}kg)`).join(' + ');
}

// Versión corta para la celda cuando hay reparto entre varias partidas
// (ej. "5900+56901") — el texto completo ("5900 (5kg) + 56901 (10kg)")
// sigue disponible en el title (tooltip al pasar el ratón) — puerto
// directo de "PARTIDAS DOBLES MÁS COMPACTAS" (HTML real, 25/11/2026): con
// el texto completo, una línea repartida entre varias partidas podía
// ensanchar la columna y descolocar el resto de la tabla.
function textoPartidasCorto(l) {
  const reparto = repartoAjustado(l);
  if (!reparto.length) return null;
  if (reparto.length === 1) return String(reparto[0].numeroPartida);
  return reparto.map((p) => String(p.numeroPartida)).join('+');
}

function pintarCeldaPartida(i) {
  const btn = document.getElementById(`ppart_${i}`);
  if (!btn) return;
  const l = lineas[i];
  const texto = textoPartidas(l);
  if (!l.articuloId) {
    btn.textContent = '—';
    btn.title = '';
    btn.className = 'partida-celda';
    btn.disabled = true;
  } else if (texto) {
    btn.textContent = textoPartidasCorto(l);
    btn.title = texto;
    btn.className = 'partida-celda asignada';
    btn.disabled = false;
  } else if (l.sinPartidaForzada) {
    btn.textContent = '— sin partida —';
    btn.title = '';
    btn.className = 'partida-celda';
    btn.disabled = false;
  } else {
    btn.textContent = 'elegir…';
    btn.title = '';
    btn.className = 'partida-celda pendiente';
    btn.disabled = false;
  }
}

// ===== Popup de elección de partida (equivale a abrirPopupPartida del HTML real) =====

let popupPartidaActual = null; // { el, indiceActivo, filas, resolver }

function cerrarPopupPartida() {
  if (!popupPartidaActual) return;
  popupPartidaActual.el.remove();
  document.removeEventListener('keydown', popupPartidaActual.onKeydown, true);
  document.removeEventListener('mousedown', popupPartidaActual.onMousedownFuera, true);
  popupPartidaActual = null;
}

// Muestra UN paso del desplegable (una sola partida a elegir) anclado bajo
// `anchorEl`, con los kilos libres ya descontando lo reservado por otras
// líneas de este pedido. Devuelve una promesa que resuelve con el
// numeroPartida elegido, con `null` si se elige explícitamente "sin
// partida", o con `undefined` si se cancela (Esc / clic fuera) sin elegir
// nada.
function mostrarPasoPopupPartida({ anchorEl, disponibles, pesoFaltante, titulo, numerosYaUsados }) {
  return new Promise((resolve) => {
    cerrarPopupPartida();

    const candidatas = disponibles
      .filter((p) => !(numerosYaUsados || []).includes(p.numeroPartida))
      .map((p) => {
        const reservadoOtras = kilosReservadosPorOtrasLineas(p.numeroPartida, window.__pdLineaActual);
        return { ...p, kilosReales: Math.max(0, p.kilosDisponibles - reservadoOtras) };
      })
      .filter((p) => p.kilosReales > 0.01);

    const conMargen = candidatas.filter((p) => p.margen != null && p.margen >= MARGEN_MINIMO_PARTIDA);
    let indiceDefecto = 0;
    const cubrenTodo = conMargen.findIndex((p) => p.kilosReales >= pesoFaltante);
    if (cubrenTodo !== -1) {
      indiceDefecto = candidatas.indexOf(conMargen[cubrenTodo]);
    } else if (conMargen.length) {
      indiceDefecto = candidatas.indexOf(conMargen[0]);
    }
    if (indiceDefecto < 0) indiceDefecto = 0;

    const el = document.createElement('div');
    el.className = 'popup-partida';
    el.innerHTML = `
      <div class="pp-titulo${titulo.startsWith('FALTAN') ? ' faltan' : ''}">${titulo}</div>
      <div class="pp-lista">
        <div class="pp-fila sin-partida" data-accion="sin-partida">— sin partida —</div>
        ${candidatas.map((p, idx) => `
          <div class="pp-fila${idx === indiceDefecto ? ' activa' : ''}" data-idx="${idx}">
            <span class="pp-num">${p.numeroPartida}</span>
            <span>${new Date(p.fecha).toLocaleDateString('es-ES')}</span>
            <span title="${p.proveedorNombre}">${p.proveedorNombre}</span>
            <span class="pp-kg">${fmt(p.coste)} €/kg</span>
            <span class="pp-kg">${fmt(p.kilosReales)} kg</span>
            <span class="pp-margen">${p.margen != null && p.margen >= MARGEN_MINIMO_PARTIDA ? '✅' : '⚠️'}</span>
          </div>`).join('') || '<div class="pp-vacio">No hay más partidas disponibles de este producto.</div>'}
      </div>`;
    document.body.appendChild(el);

    const rect = anchorEl.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 100)}px`;
    el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8))}px`;

    let activo = indiceDefecto;
    const filas = Array.from(el.querySelectorAll('.pp-fila[data-idx]'));
    const marcarActiva = () => filas.forEach((f, idx) => f.classList.toggle('activa', idx === activo));
    marcarActiva();

    const elegir = (numeroPartida) => {
      cerrarPopupPartida();
      resolve(numeroPartida);
    };

    el.querySelector('[data-accion="sin-partida"]').addEventListener('mousedown', (e) => { e.preventDefault(); elegir(null); });
    filas.forEach((f) => {
      f.addEventListener('mousedown', (e) => {
        e.preventDefault();
        elegir(candidatas[Number(f.dataset.idx)].numeroPartida);
      });
    });

    // stopPropagation es imprescindible aqui: el popup no roba el foco del
    // campo €/Kg que hay debajo (sigue centrado en el), asi que si el
    // evento sigue su curso tras resolverse aqui, el propio keydown de ese
    // input (navegarPedido) tambien lo recibe y, con Intro, volveria a
    // llamar a iniciarEleccionPartida - reabriendo el flujo entero y
    // borrando lo que se acaba de elegir. Fallo real encontrado al probar
    // con Playwright el 24/11/2026.
    const onKeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); if (filas.length) { activo = Math.min(activo + 1, filas.length - 1); marcarActiva(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); if (filas.length) { activo = Math.max(activo - 1, 0); marcarActiva(); } }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (filas.length) elegir(candidatas[activo].numeroPartida); else elegir(null); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); cerrarPopupPartida(); resolve(undefined); }
    };
    const onMousedownFuera = (e) => {
      if (!el.contains(e.target)) { cerrarPopupPartida(); resolve(undefined); }
    };
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('mousedown', onMousedownFuera, true);
    popupPartidaActual = { el, onKeydown, onMousedownFuera };
  });
}

// Flujo completo para la línea `i`: abre el primer desplegable con el peso
// entero de la línea; si la partida elegida no llega a cubrirlo, encadena
// un desplegable "FALTAN X kg" con el resto, hasta cubrirlo o hasta que se
// cancele (en cuyo caso el resto se queda en la última partida elegida,
// igual que el HTML real - repartoAjustado() se encarga de recalcularlo).
async function iniciarEleccionPartida(i) {
  const l = lineas[i];
  const anchorEl = document.getElementById(`ppart_${i}`) || document.getElementById(`pr_${i}`);
  if (!l.articuloId || !anchorEl) return;
  const peso = evaluarExpresionPeso(l.pesoTexto);
  if (!peso || Number.isNaN(peso) || peso <= 0) return;

  window.__pdLineaActual = i;
  l.partidas = [];
  l.sinPartidaForzada = false;
  pintarCeldaPartida(i);

  let disponibles;
  try {
    const precio = Number(l.precioKg) || 0;
    const resp = await apiGet(`/partidas/disponibles?articuloId=${l.articuloId}&precioVenta=${precio}`);
    disponibles = resp.disponibles || [];
  } catch (err) {
    mostrarAviso('pd-aviso', '⚠️ No se han podido consultar las partidas disponibles: ' + err.message, 'error');
    return;
  }

  let pesoFaltante = peso;
  const numerosYaUsados = [];
  let primeraVuelta = true;
  while (pesoFaltante > 0.01) {
    const titulo = primeraVuelta ? `Elegir partida (${fmt(peso)} kg)` : `FALTAN ${fmt(pesoFaltante)} kg — elegir otra partida`;
    const elegido = await mostrarPasoPopupPartida({ anchorEl, disponibles, pesoFaltante, titulo, numerosYaUsados });
    primeraVuelta = false;
    if (elegido === undefined) break; // cancelado - lo ya elegido se queda tal cual
    if (elegido === null) { l.partidas = []; l.sinPartidaForzada = true; break; } // "sin partida" explícito
    const partida = disponibles.find((p) => p.numeroPartida === elegido);
    const reservadoOtras = kilosReservadosPorOtrasLineas(elegido, i);
    const kilosReales = partida ? Math.max(0, partida.kilosDisponibles - reservadoOtras) : 0;
    const kilosAsignados = Math.min(kilosReales, pesoFaltante);
    l.partidas.push({ numeroPartida: elegido, kilos: kilosAsignados });
    numerosYaUsados.push(elegido);
    pesoFaltante = Math.max(0, pesoFaltante - kilosAsignados);
  }

  pintarCeldaPartida(i);
  recalcularTotales();
  enfocar('pdto_', i);
}

// ===== Líneas =====

function agregarLinea() {
  lineas.push(lineaVacia());
  renderLineas();
}

function eliminarLinea(i) {
  lineas.splice(i, 1);
  if (!lineas.length) lineas.push(lineaVacia());
  renderLineas();
}

function renderLineas() {
  const tbody = document.getElementById('pd-lineas');
  tbody.innerHTML = lineas.map((l, i) => `
    <tr>
      <td class="col-producto autocompletar">
        <input type="text" id="pda_${i}" placeholder="Código o nombre..." value="${l.articuloTexto}" autocomplete="off">
        <div class="sugerencias" id="pda_dd_${i}" data-linea="${i}"></div>
      </td>
      <td class="col-estrecha"><input type="number" id="pq_${i}" min="0" value="${l.cajas}"></td>
      <td class="col-estrecha"><input type="number" id="pz_${i}" min="0" step="1" value="${l.piezas}" title="Número de piezas (unidades sueltas), opcional."></td>
      <td><input type="text" inputmode="decimal" id="pp_${i}" placeholder="ej. 12+13.5" title="Puedes sumar varios bultos, igual que en Compras: 12+13.5" value="${l.pesoTexto}"></td>
      <td class="col-estrecha"><input type="number" id="pr_${i}" min="0" step="0.01" value="${l.precioKg}"></td>
      <td class="col-estrecha"><input type="number" id="pdto_${i}" min="0" max="100" step="0.01" value="${l.descuento}"></td>
      <td class="col-partida"><button type="button" class="partida-celda" id="ppart_${i}" disabled>—</button></td>
      <td class="num" id="ptot_${i}" style="font-weight:700;">0,00</td>
      <td><button class="btn btn-peligro btn-mini" type="button" data-i="${i}">✕</button></td>
    </tr>`).join('');

  lineas.forEach((l, i) => {
    document.getElementById(`pda_${i}`).addEventListener('input', (e) => buscarArticulo(i, e.target.value));
    document.getElementById(`pq_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'cajas', e.target.value));
    document.getElementById(`pq_${i}`).addEventListener('keydown', (e) => navegarPedido(e, i, 'cajas'));
    document.getElementById(`pz_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'piezas', e.target.value));
    document.getElementById(`pz_${i}`).addEventListener('keydown', (e) => navegarPedido(e, i, 'piezas'));
    document.getElementById(`pp_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'pesoTexto', e.target.value));
    document.getElementById(`pp_${i}`).addEventListener('keydown', (e) => navegarPedido(e, i, 'peso'));
    document.getElementById(`pr_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'precioKg', e.target.value));
    document.getElementById(`pr_${i}`).addEventListener('keydown', (e) => navegarPedido(e, i, 'precioKg'));
    document.getElementById(`pdto_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'descuento', e.target.value));
    document.getElementById(`pdto_${i}`).addEventListener('keydown', (e) => navegarPedido(e, i, 'descuento'));
    document.getElementById(`ppart_${i}`).addEventListener('click', () => iniciarEleccionPartida(i));
  });
  tbody.querySelectorAll('button[data-i]').forEach((btn) => {
    btn.addEventListener('click', () => eliminarLinea(Number(btn.dataset.i)));
  });

  recalcularTodasLasLineas();
}

function actualizarLinea(i, campo, valor) {
  lineas[i][campo] = valor;
  pintarCalculoLinea(i);
}

function pintarCalculoLinea(i) {
  const l = lineas[i];
  const calc = calcularLineaPreview(l);
  const celda = document.getElementById(`ptot_${i}`);
  if (celda) celda.textContent = fmt(calc.total);
  const pp = document.getElementById(`pp_${i}`);
  if (pp) pp.classList.toggle('invalido', Number.isNaN(evaluarExpresionPeso(l.pesoTexto)));
  pintarCeldaPartida(i);
  recalcularTotales();
}

function recalcularTodasLasLineas() {
  lineas.forEach((_, i) => pintarCalculoLinea(i));
}

function recalcularTotales() {
  let peso = 0, base = 0;
  lineas.forEach((l) => {
    if (!l.articuloId) return;
    const calc = calcularLineaPreview(l);
    peso += calc.peso;
    base += calc.total;
  });
  const tipoIva = clienteSeleccionado ? clienteSeleccionado.tipoIva : 'NORMAL';
  const r = calcularIvaPreview(base, tipoIva);
  const etiquetas = { NORMAL: 'IVA (10%)', RECARGO_EQUIVALENCIA: 'IVA+Recargo (11,4%)', INTRACOMUNITARIO: 'IVA (0% intracom.)' };
  document.getElementById('pd-tot-peso').textContent = fmt(peso);
  document.getElementById('pd-tot-base').textContent = fmt(base);
  document.getElementById('pd-tot-iva-etiqueta').innerHTML = `${etiquetas[tipoIva] || 'IVA'}: <b id="pd-tot-iva">${fmt(r.iva)}</b> €`;
  document.getElementById('pd-tot-total').textContent = fmt(r.total);
}

// Tab/Enter para moverse de campo en campo: Cajas → Peso → €/Kg → Dto % →
// Cajas de la siguiente línea (o nueva línea si es la última) — igual que
// en Compras. En €/Kg, en vez de pasar directo a Dto, abre el desplegable
// de elección de partida (ver iniciarEleccionPartida) y al terminar sigue
// solo a Dto.
function navegarPedido(e, i, campo) {
  if (e.key !== 'Enter' && e.key !== 'Tab') return;
  e.preventDefault();
  if (campo === 'precioKg') { iniciarEleccionPartida(i); return; }
  const orden = ['cajas', 'piezas', 'peso', 'precioKg', 'descuento'];
  const prefijo = { cajas: 'pq_', piezas: 'pz_', peso: 'pp_', precioKg: 'pr_', descuento: 'pdto_' };
  const idx = orden.indexOf(campo);
  if (idx < orden.length - 1) {
    enfocar(prefijo[orden[idx + 1]], i);
  } else if (i < lineas.length - 1) {
    enfocar('pq_', i + 1);
  } else {
    agregarLinea();
    enfocar('pq_', lineas.length - 1);
  }
}

function enfocar(prefijo, i) {
  const el = document.getElementById(`${prefijo}${i}`);
  if (el) el.focus();
}

// ===== Artículo (autocompletar por línea) =====

function buscarArticulo(i, q) {
  lineas[i].articuloTexto = q;
  const dd = document.getElementById(`pda_dd_${i}`);
  if (!dd) return;
  if (!q || q.length < 1) { dd.style.display = 'none'; return; }
  const ql = q.toLowerCase();
  const coincidencias = articulos
    .filter((a) => a.codigo.toLowerCase().includes(ql) || a.descripcion.toLowerCase().includes(ql))
    .slice(0, 10);
  if (!coincidencias.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = coincidencias.map((a) => `
    <div class="sug-item" data-id="${a.id}"><span class="sug-cod">${a.codigo}</span>${a.descripcion}</div>`).join('');
  dd.querySelectorAll('.sug-item').forEach((el) => {
    el.addEventListener('mousedown', () => elegirArticulo(i, Number(el.dataset.id)));
  });
  dd.style.display = 'block';
}

function elegirArticulo(i, id) {
  const a = articulos.find((x) => x.id === id);
  if (!a) return;
  lineas[i].articuloId = a.id;
  lineas[i].articuloTexto = `${a.codigo} — ${a.descripcion}`;
  lineas[i].partidas = [];
  // El precio se autorrellena con el PVP1 del artículo (igual que en el
  // HTML real, elegirArtPed) — sigue siendo editable, es solo un punto de
  // partida, no un precio fijo.
  if (!lineas[i].precioKg && a.pvp1 != null) lineas[i].precioKg = a.pvp1;
  const input = document.getElementById(`pda_${i}`);
  if (input) input.value = lineas[i].articuloTexto;
  const precioInput = document.getElementById(`pr_${i}`);
  if (precioInput) precioInput.value = lineas[i].precioKg;
  document.getElementById(`pda_dd_${i}`).style.display = 'none';
  if (i === lineas.length - 1) agregarLinea();
  pintarCalculoLinea(i);
  // Pospuesto a propósito: ver el mismo comentario en compras.js
  // (elegirArtCompra) sobre el foco perdido tras un mousedown en una
  // sugerencia que desaparece al reconstruir la tabla.
  setTimeout(() => enfocar('pq_', i), 30);
}

// ===== Grabar =====

async function grabarPedido() {
  if (guardando) return;
  ocultarAviso('pd-aviso');

  if (!clienteSeleccionado) {
    mostrarAviso('pd-aviso', '⚠️ Elige un cliente de la lista.', 'error');
    return;
  }
  const lineasValidas = lineas.filter((l) => l.articuloId && !Number.isNaN(evaluarExpresionPeso(l.pesoTexto)) && evaluarExpresionPeso(l.pesoTexto) > 0);
  if (!lineasValidas.length) {
    mostrarAviso('pd-aviso', '⚠️ Añade al menos un producto con peso.', 'error');
    return;
  }
  const puesto = definirPuesto(false);
  if (!puesto) {
    mostrarAviso('pd-aviso', '⚠️ Define el nombre de este puesto arriba a la derecha antes de grabar.', 'error');
    return;
  }

  // Documento electrónico de control (ver api.js pedirPalets): se vuelve a
  // confirmar siempre justo antes de grabar, con lo que ya haya en la
  // casilla de cabecera como valor de partida — igual que pedirPaletsYGrabar
  // del HTML real. Esc/"Volver" cancela el grabado sin tocar nada.
  const bultos = lineasValidas.reduce((s, l) => s + (Number(l.cajas) || 0), 0);
  const pesoTotalPrev = lineasValidas.reduce((s, l) => s + (evaluarExpresionPeso(l.pesoTexto) || 0), 0);
  const palets = await pedirPalets({
    titulo: '¿CUÁNTOS PALETS LLEVA ESTE PEDIDO?',
    contexto: `${clienteSeleccionado.codigo} — ${bultos} bultos, ${fmt(pesoTotalPrev)} kg`,
    valorActual: document.getElementById('pd-palets').value,
  });
  if (palets === null) return; // cancelado - no se graba nada

  const numeroTexto = document.getElementById('pd-numero-in').value.trim();
  const cuerpo = {
    idempotencyKey: idempotencyKeyActual,
    numero: numeroTexto === '' ? undefined : Number(numeroTexto),
    fecha: document.getElementById('pd-fecha').value,
    clienteId: clienteSeleccionado.id,
    agencia: document.getElementById('pd-agencia').value || null,
    formaPago: document.getElementById('pd-formapago').value.trim() || null,
    palets,
    puestoOrigen: puesto,
    lineas: lineasValidas.map((l) => {
      const base = {
        articuloId: l.articuloId,
        cantidad: l.cajas === '' ? null : Number(l.cajas),
        piezas: l.piezas === '' ? null : Number(l.piezas),
        peso: l.pesoTexto,
        precio: Number(l.precioKg) || 0,
        descuento: Number(l.descuento) || 0,
      };
      const reparto = repartoAjustado(l);
      if (reparto.length) base.partidas = reparto;
      // "Sin partida" elegido de verdad en el desplegable: se manda la
      // clave con valor null a propósito (no se omite) para que el
      // servidor no intente autoasignar - ver pedidos.js backend.
      else if (l.sinPartidaForzada) base.partidaNumero = null;
      return base;
    }),
  };
  document.getElementById('pd-palets').value = palets;

  guardando = true;
  const btn = document.getElementById('btn-grabar');
  btn.disabled = true;
  btn.textContent = '⏳ Grabando...';
  try {
    const creado = await apiPost('/pedidos', cuerpo);
    const pendientes = creado.lineas.filter((l) => l.partidaNumero == null).length;
    const nota = pendientes ? ` (${pendientes} línea${pendientes > 1 ? 's' : ''} sin partida asignada todavía)` : '';
    mostrarAviso('pd-aviso', `✅ Pedido Nº ${creado.numero} grabado — total ${fmt(creado.total)} €.${nota}`, 'exito');
    setTimeout(() => { reiniciarFormulario(); document.getElementById('pd-fecha').value = cuerpo.fecha; }, 2200);
  } catch (err) {
    mostrarAviso('pd-aviso', '⚠️ ' + err.message, 'error');
  } finally {
    guardando = false;
    btn.disabled = false;
    btn.textContent = '💾 Grabar pedido';
  }
}

iniciar();
