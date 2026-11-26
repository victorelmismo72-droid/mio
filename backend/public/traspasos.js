// Pantalla de Traspasos (movimiento interno a Zaragoza) del frontend nuevo
// — mismo patrón que Pedidos (ver ese fichero para los comentarios largos
// que no se repiten aquí), con las diferencias reales de un traspaso frente
// a una venta:
//   - No hay cliente ni IVA (no es una venta, Fase 0 punto 3/9).
//   - El precio es un VALOR ESTIMADO, no fiscal (así lo rotula el PDF real:
//     "Valor estimado (no fiscal)") — se autorrellena con el PVP1 del
//     artículo al elegirlo, pero sigue siendo editable, igual que en
//     Pedidos. Total de línea = peso * precio, sin descuento ni IVA.
//   - El desplegable de partida es el mismo mecanismo que en Pedidos
//     (elegir al teclear €/Kg, reparto entre varias con "FALTAN X kg" si
//     ninguna cubre el peso entero) pero SIN margen — un traspaso no tiene
//     ningún precio de venta con el que calcular un margen, así que el
//     desplegable no muestra ni filtra por eso, solo por antigüedad (FIFO)
//     y si cubre el peso.
//   - Lleva PALETS (documento electrónico de control, ver api.js
//     pedirPalets) y PIEZAS por línea, igual que Pedidos.

let articulos = [];
let lineas = [];
let idempotencyKeyActual = nuevaIdempotencyKey();
let guardando = false;

const lineaVacia = () => ({ articuloId: null, articuloTexto: '', cajas: '', piezas: '', pesoTexto: '', precio: '', partidas: [], sinPartidaForzada: false });

// ===== Arranque =====

async function iniciar() {
  pintarBotonPuesto('btn-puesto');
  document.getElementById('tp-fecha').value = new Date().toISOString().slice(0, 10);
  try {
    articulos = await apiGet('/articulos');
  } catch (err) {
    mostrarAviso('tp-aviso', '⚠️ No se ha podido conectar con el servidor: ' + err.message, 'error');
  }
  reiniciarFormulario();

  document.getElementById('btn-add-linea').addEventListener('click', () => { agregarLinea(); enfocar('tq_', lineas.length - 1); });
  document.getElementById('btn-grabar').addEventListener('click', grabarTraspaso);

  document.addEventListener('mousedown', (e) => {
    document.querySelectorAll('.sugerencias[data-linea]').forEach((dd) => {
      if (!e.target.closest(`#ta_${dd.dataset.linea}`) && !e.target.closest(`#ta_dd_${dd.dataset.linea}`)) {
        dd.style.display = 'none';
      }
    });
  });
}

function reiniciarFormulario() {
  document.getElementById('tp-numero-in').value = '';
  document.getElementById('tp-palets').value = 0;
  lineas = [lineaVacia()];
  idempotencyKeyActual = nuevaIdempotencyKey();
  ocultarAviso('tp-aviso');
  renderLineas();
  recalcularTotales();
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
  const precio = Number(l.precio) || 0;
  return { peso: pesoNum, total: pesoNum * precio };
}

// ===== Reparto de partidas (igual que en pedidos.js, sin margen) =====

function repartoAjustado(l) {
  if (!l.partidas || !l.partidas.length) return [];
  const peso = evaluarExpresionPeso(l.pesoTexto);
  const pesoNum = Number.isNaN(peso) ? 0 : peso;
  const copia = l.partidas.map((p) => ({ ...p }));
  const sumaSalvoUltima = copia.slice(0, -1).reduce((s, p) => s + p.kilos, 0);
  copia[copia.length - 1].kilos = Math.max(0, pesoNum - sumaSalvoUltima);
  return copia;
}

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

// Versión corta para la celda cuando hay reparto entre varias partidas —
// ver el mismo comentario en pedidos.js ("PARTIDAS DOBLES MÁS COMPACTAS").
function textoPartidasCorto(l) {
  const reparto = repartoAjustado(l);
  if (!reparto.length) return null;
  if (reparto.length === 1) return String(reparto[0].numeroPartida);
  return reparto.map((p) => String(p.numeroPartida)).join('+');
}

function pintarCeldaPartida(i) {
  const btn = document.getElementById(`tpart_${i}`);
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

// ===== Popup de elección de partida (igual que Pedidos, sin margen) =====

// Ver el mismo comentario en pedidos.js: deja las partidas con kilos
// libres en su orden de siempre, detrás las agotadas y al final las
// cerradas a mano (25-26/11/2026), cada grupo de la más reciente a la
// más antigua. Las cerradas se MUESTRAN pero nunca se pueden elegir.
function ordenarPartidasParaPopup(disponibles) {
  const orden = (a, b) => (new Date(b.fecha) - new Date(a.fecha)) || (b.numeroPartida - a.numeroPartida);
  const libres = disponibles.filter((p) => !p.agotada && !p.cerrada);
  const agotadas = disponibles.filter((p) => p.agotada && !p.cerrada).sort(orden);
  const cerradas = disponibles.filter((p) => p.cerrada).sort(orden);
  return [...libres, ...agotadas, ...cerradas];
}

let popupPartidaActual = null;

function cerrarPopupPartida() {
  if (!popupPartidaActual) return;
  popupPartidaActual.el.remove();
  document.removeEventListener('keydown', popupPartidaActual.onKeydown, true);
  document.removeEventListener('mousedown', popupPartidaActual.onMousedownFuera, true);
  popupPartidaActual = null;
}

// Ver el comentario largo en pedidos.js: resuelve con `{vacia:true}`,
// `{numeroPartida, dividir}` o `undefined` (cancelado). Elegir una
// partida cerrada no resuelve nada, solo avisa.
function mostrarPasoPopupPartida({ anchorEl, disponibles, pesoFaltante, titulo, numerosYaUsados, indiceLinea }) {
  return new Promise((resolve) => {
    cerrarPopupPartida();
    const esFaltan = titulo.startsWith('FALTAN');

    const candidatas = disponibles
      .filter((p) => !(numerosYaUsados || []).includes(p.numeroPartida))
      .map((p) => {
        if (p.agotada || p.cerrada) return { ...p, kilosReales: p.kilosDisponibles };
        const reservadoOtras = kilosReservadosPorOtrasLineas(p.numeroPartida, indiceLinea);
        return { ...p, kilosReales: Math.max(0, p.kilosDisponibles - reservadoOtras) };
      })
      .filter((p) => p.agotada || p.cerrada || p.kilosReales > 0.01);

    let indiceDefecto = 0;
    const cubrenTodo = candidatas.findIndex((p) => !p.agotada && !p.cerrada && p.kilosReales >= pesoFaltante);
    if (cubrenTodo !== -1) indiceDefecto = cubrenTodo;

    const el = document.createElement('div');
    el.className = 'popup-partida';
    el.innerHTML = `
      <div class="pp-titulo${esFaltan ? ' faltan' : ''}">${titulo}</div>
      <div class="pp-lista">
        <div class="pp-fila sin-partida" data-accion="sin-partida">— ${esFaltan ? 'dejar el resto en la última' : 'sin partida'} —</div>
        ${candidatas.map((p, idx) => `
          <div class="pp-fila${idx === indiceDefecto ? ' activa' : ''}${p.agotada || p.cerrada ? ' agotada' : ''}${p.cerrada ? ' cerrada' : ''}" data-idx="${idx}" style="grid-template-columns:70px 70px 1fr 70px 70px;">
            <span class="pp-num">${p.numeroPartida}${p.cerrada ? ' 🔒' : ''}</span>
            <span>${new Date(p.fecha).toLocaleDateString('es-ES')}</span>
            <span title="${p.proveedorNombre}">${p.proveedorNombre}</span>
            <span class="pp-kg">${fmt(p.coste)} €/kg</span>
            <span class="pp-kg">${p.cerrada ? 'cerrada' : p.agotada ? `agotada${p.kilosDisponibles < -0.5 ? ` (${fmt(-p.kilosDisponibles)} de más)` : ''}` : `${fmt(p.kilosReales)} kg`}</span>
          </div>`).join('') || '<div class="pp-vacio">Este producto no tiene ninguna partida comprada.</div>'}
        ${candidatas.some((p) => p.agotada || p.cerrada) ? '<div class="pp-nota-agotada">En gris = agotada (se puede elegir igual: se anotan los kg de más) · 🔒 cerrada = solo se muestra, NO se puede usar.</div>' : ''}
        ${!esFaltan && pesoFaltante > 0 ? `<div class="pp-nota-agotada">⚠️ en «Quedan kg» = no llega a los ${fmt(pesoFaltante)} kg de la línea: <b>Intro</b> la usa igualmente (se avisa de los kg de más) · <b>Mayús+Intro</b> = completar el resto con otra partida.</div>` : ''}
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

    const elegir = (idx, dividir) => {
      if (idx == null) { cerrarPopupPartida(); resolve({ vacia: true }); return; }
      const p = candidatas[idx];
      if (p.cerrada) { avisoFlotante(`🔒 La partida ${p.numeroPartida} está cerrada: se muestra pero no se puede usar.`); return; }
      cerrarPopupPartida();
      resolve({ numeroPartida: p.numeroPartida, dividir: !!dividir });
    };

    el.querySelector('[data-accion="sin-partida"]').addEventListener('mousedown', (e) => { e.preventDefault(); elegir(null); });
    filas.forEach((f) => {
      f.addEventListener('mousedown', (e) => { e.preventDefault(); elegir(Number(f.dataset.idx), e.shiftKey); });
    });

    const onKeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); if (filas.length) { activo = Math.min(activo + 1, filas.length - 1); marcarActiva(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); if (filas.length) { activo = Math.max(activo - 1, 0); marcarActiva(); } }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (filas.length) elegir(activo, e.shiftKey); else elegir(null); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); cerrarPopupPartida(); resolve(undefined); }
    };
    const onMousedownFuera = (e) => { if (!el.contains(e.target)) { cerrarPopupPartida(); resolve(undefined); } };
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('mousedown', onMousedownFuera, true);
    popupPartidaActual = { el, onKeydown, onMousedownFuera };
  });
}

// Ver el comentario largo en pedidos.js ("ELEGIR PARTIDA AUNQUE SE PASE DE
// KILOS", 26/11/2026): Intro/clic asigna todo lo que falta a la partida
// elegida aunque se pase de kilos (solo avisa); Mayús+Intro/Mayús+clic
// reparte de verdad entre varias partidas (opt-in, antes era automático).
async function iniciarEleccionPartida(i) {
  const l = lineas[i];
  const anchorEl = document.getElementById(`tpart_${i}`);
  if (!l.articuloId || !anchorEl) return;
  const peso = evaluarExpresionPeso(l.pesoTexto);
  if (!peso || Number.isNaN(peso) || peso <= 0) return;

  l.partidas = [];
  l.sinPartidaForzada = false;
  pintarCeldaPartida(i);

  let disponibles;
  try {
    const resp = await apiGet(`/partidas/disponibles?articuloId=${l.articuloId}&incluirTodas=true`);
    disponibles = ordenarPartidasParaPopup(resp.disponibles || []);
  } catch (err) {
    mostrarAviso('tp-aviso', '⚠️ No se han podido consultar las partidas disponibles: ' + err.message, 'error');
    return;
  }

  let pesoFaltante = peso;
  const numerosYaUsados = [];
  let primeraVuelta = true;
  while (pesoFaltante > 0.01) {
    const titulo = primeraVuelta ? `Elegir partida (${fmt(peso)} kg)` : `FALTAN ${fmt(pesoFaltante)} kg — elegir otra partida`;
    const resultado = await mostrarPasoPopupPartida({ anchorEl, disponibles, pesoFaltante, titulo, numerosYaUsados, indiceLinea: i });
    if (resultado === undefined) break;
    if (resultado.vacia) {
      if (primeraVuelta) { l.partidas = []; l.sinPartidaForzada = true; }
      break;
    }
    primeraVuelta = false;
    const { numeroPartida: elegido, dividir } = resultado;
    const partida = disponibles.find((p) => p.numeroPartida === elegido);
    if (dividir && partida && !partida.agotada) {
      const reservadoOtras = kilosReservadosPorOtrasLineas(elegido, i);
      const kilosReales = Math.max(0, partida.kilosDisponibles - reservadoOtras);
      if (pesoFaltante > 0.01 && kilosReales < pesoFaltante - 0.005) {
        const kg = Math.floor(kilosReales * 100) / 100;
        l.partidas.push({ numeroPartida: elegido, kilos: kg });
        numerosYaUsados.push(elegido);
        pesoFaltante = Math.max(0, pesoFaltante - kg);
        continue;
      }
    }
    const kilosLibres = partida ? Math.max(0, partida.kilosDisponibles) : 0;
    const sobra = pesoFaltante - kilosLibres;
    l.partidas.push({ numeroPartida: elegido, kilos: pesoFaltante });
    numerosYaUsados.push(elegido);
    if (pesoFaltante > 0.01 && sobra > 0.01) {
      avisoFlotante(`⚠️ Partida ${elegido}: quedaban ${fmt(kilosLibres)} kg y llevas ${fmt(pesoFaltante)} kg → ${fmt(sobra)} kg de más.`);
    }
    pesoFaltante = 0;
  }

  pintarCeldaPartida(i);
  recalcularTotales();
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
  const tbody = document.getElementById('tp-lineas');
  tbody.innerHTML = lineas.map((l, i) => `
    <tr>
      <td class="col-producto autocompletar">
        <input type="text" id="ta_${i}" placeholder="Código o nombre..." value="${l.articuloTexto}" autocomplete="off">
        <div class="sugerencias" id="ta_dd_${i}" data-linea="${i}"></div>
      </td>
      <td class="col-estrecha"><input type="number" id="tq_${i}" min="0" value="${l.cajas}"></td>
      <td class="col-estrecha"><input type="number" id="tz_${i}" min="0" step="1" value="${l.piezas}" title="Número de piezas, opcional."></td>
      <td><input type="text" inputmode="decimal" id="tp_${i}" placeholder="ej. 12+13.5" value="${l.pesoTexto}"></td>
      <td class="col-estrecha"><input type="number" id="tpr_${i}" min="0" step="0.001" value="${l.precio}"></td>
      <td class="col-partida"><button type="button" class="partida-celda" id="tpart_${i}" disabled>—</button></td>
      <td class="num" id="ttot_${i}" style="font-weight:700;">0,00</td>
      <td><button class="btn btn-peligro btn-mini" type="button" data-i="${i}">✕</button></td>
    </tr>`).join('');

  lineas.forEach((l, i) => {
    document.getElementById(`ta_${i}`).addEventListener('input', (e) => buscarArticulo(i, e.target.value));
    document.getElementById(`tq_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'cajas', e.target.value));
    document.getElementById(`tq_${i}`).addEventListener('keydown', (e) => navegarTraspaso(e, i, 'cajas'));
    document.getElementById(`tz_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'piezas', e.target.value));
    document.getElementById(`tz_${i}`).addEventListener('keydown', (e) => navegarTraspaso(e, i, 'piezas'));
    document.getElementById(`tp_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'pesoTexto', e.target.value));
    document.getElementById(`tp_${i}`).addEventListener('keydown', (e) => navegarTraspaso(e, i, 'peso'));
    document.getElementById(`tpr_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'precio', e.target.value));
    document.getElementById(`tpr_${i}`).addEventListener('keydown', (e) => navegarTraspaso(e, i, 'precio'));
    document.getElementById(`tpart_${i}`).addEventListener('click', () => iniciarEleccionPartida(i));
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
  const celda = document.getElementById(`ttot_${i}`);
  if (celda) celda.textContent = fmt(calc.total);
  const pp = document.getElementById(`tp_${i}`);
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
  document.getElementById('tp-tot-peso').textContent = fmt(peso);
  document.getElementById('tp-tot-base').textContent = fmt(base);
}

// Tab/Enter: Cajas → Piezas → Peso → €/Kg (abre el desplegable de partida).
function navegarTraspaso(e, i, campo) {
  if (e.key !== 'Enter' && e.key !== 'Tab') return;
  e.preventDefault();
  if (campo === 'precio') { iniciarEleccionPartida(i); return; }
  const orden = ['cajas', 'piezas', 'peso', 'precio'];
  const prefijo = { cajas: 'tq_', piezas: 'tz_', peso: 'tp_', precio: 'tpr_' };
  const idx = orden.indexOf(campo);
  if (idx < orden.length - 1) {
    enfocar(prefijo[orden[idx + 1]], i);
  } else if (i < lineas.length - 1) {
    enfocar('tq_', i + 1);
  } else {
    agregarLinea();
    enfocar('tq_', lineas.length - 1);
  }
}

function enfocar(prefijo, i) {
  const el = document.getElementById(`${prefijo}${i}`);
  if (el) el.focus();
}

// ===== Artículo (autocompletar por línea) =====

function buscarArticulo(i, q) {
  lineas[i].articuloTexto = q;
  const dd = document.getElementById(`ta_dd_${i}`);
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
  if (!lineas[i].precio && a.pvp1 != null) lineas[i].precio = a.pvp1;
  const input = document.getElementById(`ta_${i}`);
  if (input) input.value = lineas[i].articuloTexto;
  const precioInput = document.getElementById(`tpr_${i}`);
  if (precioInput) precioInput.value = lineas[i].precio;
  document.getElementById(`ta_dd_${i}`).style.display = 'none';
  if (i === lineas.length - 1) agregarLinea();
  pintarCalculoLinea(i);
  setTimeout(() => enfocar('tq_', i), 30);
}

// ===== Grabar =====

async function grabarTraspaso() {
  if (guardando) return;
  ocultarAviso('tp-aviso');

  const lineasValidas = lineas.filter((l) => l.articuloId && !Number.isNaN(evaluarExpresionPeso(l.pesoTexto)) && evaluarExpresionPeso(l.pesoTexto) > 0);
  if (!lineasValidas.length) {
    mostrarAviso('tp-aviso', '⚠️ Añade al menos un producto con kilos.', 'error');
    return;
  }
  const puesto = definirPuesto(false);
  if (!puesto) {
    mostrarAviso('tp-aviso', '⚠️ Define el nombre de este puesto arriba a la derecha antes de grabar.', 'error');
    return;
  }

  const bultos = lineasValidas.reduce((s, l) => s + (Number(l.cajas) || 0), 0);
  const pesoTotal = lineasValidas.reduce((s, l) => s + (evaluarExpresionPeso(l.pesoTexto) || 0), 0);
  const palets = await pedirPalets({
    titulo: '¿CUÁNTOS PALETS LLEVA ESTE TRASPASO?',
    contexto: `Traspaso a Zaragoza — ${bultos} bultos, ${fmt(pesoTotal)} kg`,
    valorActual: document.getElementById('tp-palets').value,
  });
  if (palets === null) return;

  const numeroTexto = document.getElementById('tp-numero-in').value.trim();
  const cuerpo = {
    idempotencyKey: idempotencyKeyActual,
    numero: numeroTexto === '' ? undefined : Number(numeroTexto),
    fecha: document.getElementById('tp-fecha').value,
    palets,
    puestoOrigen: puesto,
    lineas: lineasValidas.map((l) => {
      const base = {
        articuloId: l.articuloId,
        cantidad: l.cajas === '' ? null : Number(l.cajas),
        piezas: l.piezas === '' ? null : Number(l.piezas),
        peso: l.pesoTexto,
        precio: Number(l.precio) || 0,
      };
      const reparto = repartoAjustado(l);
      if (reparto.length) base.partidas = reparto;
      else if (l.sinPartidaForzada) base.partidaNumero = null;
      return base;
    }),
  };
  document.getElementById('tp-palets').value = palets;

  guardando = true;
  const btn = document.getElementById('btn-grabar');
  btn.disabled = true;
  btn.textContent = '⏳ Grabando...';
  try {
    const creado = await apiPost('/traspasos', cuerpo);
    const pendientes = creado.lineas.filter((l) => l.partidaNumero == null).length;
    const nota = pendientes ? ` (${pendientes} línea${pendientes > 1 ? 's' : ''} sin partida asignada todavía)` : '';
    mostrarAviso('tp-aviso', `✅ Traspaso Nº ${creado.numero} grabado — valor estimado ${fmt(creado.total)} €.${nota}`, 'exito');
    setTimeout(() => { reiniciarFormulario(); document.getElementById('tp-fecha').value = cuerpo.fecha; }, 2200);
  } catch (err) {
    mostrarAviso('tp-aviso', '⚠️ ' + err.message, 'error');
  } finally {
    guardando = false;
    btn.disabled = false;
    btn.textContent = '💾 Grabar traspaso';
  }
}

iniciar();
