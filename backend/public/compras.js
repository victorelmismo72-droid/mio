// Pantalla de Compras del frontend nuevo — objetivo explícito de Víctor:
// tan clara, concisa y rápida de teclear como el Excel GESTION_CORRECTA,
// con las mismas teclas para moverse entre campos que ya usa Pedidos en el
// HTML actual (Tab/Enter recorre Cajas → Kilos → €/Kg → siguiente línea).
//
// El servidor es quien decide de verdad el número de partida y calcula
// base/2%OP/IVA/total (ver backend/src/calculoCompra.js y
// asignacionPartida.js) — aquí solo se calcula una VISTA PREVIA en vivo
// con la misma fórmula, para que Víctor vea el importe mientras teclea sin
// esperar al servidor; lo que se manda al grabar son los datos crudos
// (kilos como texto, cajas, precioKg), nunca un importe ya calculado.

let proveedores = [];
let articulos = [];
let proveedorSeleccionado = null;
let lineas = [];
let idempotencyKeyActual = nuevaIdempotencyKey();
let guardando = false;

const lineaVacia = () => ({ articuloId: null, articuloTexto: '', cajas: '', kilosTexto: '', kilos: 0, precioKg: '', control: false });

// ===== Arranque =====

async function iniciar() {
  pintarBotonPuesto('btn-puesto');
  document.getElementById('cp-fecha').value = new Date().toISOString().slice(0, 10);
  try {
    [proveedores, articulos] = await Promise.all([apiGet('/proveedores'), apiGet('/articulos')]);
  } catch (err) {
    mostrarAviso('cp-aviso', '⚠️ No se ha podido conectar con el servidor: ' + err.message, 'error');
  }
  reiniciarFormulario();

  document.getElementById('btn-add-linea').addEventListener('click', () => { agregarLinea(); enfocar('cq_', lineas.length - 1); });
  document.getElementById('btn-grabar').addEventListener('click', grabarCompra);
  document.getElementById('cp-prov-buscar').addEventListener('input', (e) => buscarProveedor(e.target.value));
  document.getElementById('cp-fecha').addEventListener('change', refrescarPartidaInfo);
  document.getElementById('cp-partida-nueva').addEventListener('change', actualizarVisibilidadElegirPartida);
  document.getElementById('cp-partida-elegir').addEventListener('change', () => { document.getElementById('cp-partida-nueva').checked = false; });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#cp-prov-buscar') && !e.target.closest('#cp-prov-sugerencias')) {
      document.getElementById('cp-prov-sugerencias').style.display = 'none';
    }
    document.querySelectorAll('.sugerencias[data-linea]').forEach((dd) => {
      if (!e.target.closest(`#cpa_${dd.dataset.linea}`) && !e.target.closest(`#cpa_dd_${dd.dataset.linea}`)) {
        dd.style.display = 'none';
      }
    });
  });
}

function reiniciarFormulario() {
  document.getElementById('cp-albprov').value = '';
  document.getElementById('cp-prov-buscar').value = '';
  proveedorSeleccionado = null;
  lineas = [lineaVacia()];
  idempotencyKeyActual = nuevaIdempotencyKey();
  ocultarAviso('cp-aviso');
  document.getElementById('cp-partida-nueva').checked = false;
  document.getElementById('cp-partida-info').style.display = 'none';
  renderLineas();
}

// ===== Proveedor =====

function buscarProveedor(q) {
  const dd = document.getElementById('cp-prov-sugerencias');
  if (!q || q.length < 1) { dd.style.display = 'none'; return; }
  const ql = q.toLowerCase();
  const coincidencias = proveedores
    .filter((p) => p.codigo.toLowerCase().includes(ql) || p.nombre.toLowerCase().includes(ql))
    .slice(0, 10);
  if (!coincidencias.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = coincidencias.map((p) => `
    <div class="sug-item" data-id="${p.id}">
      <span class="sug-cod">${p.codigo}</span>${p.nombre}${p.esSubastaOp ? ' [OP 2%]' : ''}
    </div>`).join('');
  dd.querySelectorAll('.sug-item').forEach((el) => {
    el.addEventListener('mousedown', () => elegirProveedor(Number(el.dataset.id)));
  });
  dd.style.display = 'block';
}

function elegirProveedor(id) {
  const p = proveedores.find((x) => x.id === id);
  if (!p) return;
  proveedorSeleccionado = p;
  document.getElementById('cp-prov-buscar').value = `${p.codigo} — ${p.nombre}`;
  document.getElementById('cp-prov-sugerencias').style.display = 'none';
  recalcularTodasLasLineas();
  refrescarPartidaInfo();
}

// ===== Partida del día =====

async function refrescarPartidaInfo() {
  const info = document.getElementById('cp-partida-info');
  if (!proveedorSeleccionado) { info.style.display = 'none'; return; }
  const fecha = document.getElementById('cp-fecha').value;
  if (!fecha) { info.style.display = 'none'; return; }
  info.style.display = 'flex';
  document.getElementById('cp-partida-texto').textContent = 'consultando…';
  try {
    const partidas = await apiGet(`/compras/partidas-del-dia?fecha=${fecha}&proveedorId=${proveedorSeleccionado.id}`);
    const wrapElegir = document.getElementById('cp-partida-elegir-wrap');
    const selectElegir = document.getElementById('cp-partida-elegir');
    if (!partidas.length) {
      document.getElementById('cp-partida-texto').textContent = 'se creará la partida principal de hoy para este proveedor';
      wrapElegir.style.display = 'none';
      selectElegir.innerHTML = '';
    } else if (partidas.length === 1) {
      document.getElementById('cp-partida-texto').textContent = `${partidas[0].numeroPartida} (se reutiliza)`;
      wrapElegir.style.display = 'none';
      selectElegir.innerHTML = '';
    } else {
      document.getElementById('cp-partida-texto').textContent = `hay ${partidas.length} partidas este día para este proveedor`;
      selectElegir.innerHTML = partidas.map((p) => `<option value="${p.numeroPartida}">${p.numeroPartida}${p.esPrincipal ? ' (principal)' : ' (excepción)'}</option>`).join('');
      wrapElegir.style.display = 'flex';
    }
  } catch (err) {
    document.getElementById('cp-partida-texto').textContent = 'no se ha podido consultar';
  }
}

function actualizarVisibilidadElegirPartida() {
  if (document.getElementById('cp-partida-nueva').checked) {
    document.getElementById('cp-partida-elegir-wrap').style.display = 'none';
  } else {
    refrescarPartidaInfo();
  }
}

// ===== Cálculo en vivo (vista previa — el servidor es quien manda) =====

function evaluarExpresionKilos(valorTexto) {
  const texto = String(valorTexto == null ? '' : valorTexto).trim();
  if (texto === '') return 0;
  if (!/^[0-9.,+\-\s]+$/.test(texto)) return NaN;
  const tokens = texto.replace(/,/g, '.').replace(/\s+/g, '').match(/[+-]?[0-9]*\.?[0-9]+/g);
  if (!tokens || !tokens.length) return NaN;
  return tokens.reduce((s, t) => s + parseFloat(t), 0);
}

function calcularLineaPreview(l) {
  const kilos = evaluarExpresionKilos(l.kilosTexto);
  const kilosNum = Number.isNaN(kilos) ? 0 : kilos;
  const precio = Number(l.precioKg) || 0;
  const baseZgz = kilosNum * precio;
  const op2 = proveedorSeleccionado && proveedorSeleccionado.esSubastaOp ? baseZgz * 0.02 : 0;
  const baseReal = baseZgz + op2;
  const ivaPct = proveedorSeleccionado && proveedorSeleccionado.tipoIva === 'INTRACOMUNITARIO' ? 0 : 10;
  const iva = baseReal * (ivaPct / 100);
  const total = baseReal + iva;
  return { kilos: kilosNum, baseZgz, op2, baseReal, iva, total };
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
  const tbody = document.getElementById('cp-lineas');
  tbody.innerHTML = lineas.map((l, i) => `
    <tr>
      <td class="col-producto autocompletar">
        <input type="text" id="cpa_${i}" placeholder="Código o nombre..." value="${l.articuloTexto}" autocomplete="off">
        <div class="sugerencias" id="cpa_dd_${i}" data-linea="${i}"></div>
      </td>
      <td class="col-estrecha"><input type="number" id="cq_${i}" min="0" value="${l.cajas}"></td>
      <td><input type="text" inputmode="decimal" id="ck_${i}" placeholder="ej. 12+13.5" title="Puedes sumar varias cajas, igual que en el Excel: 12+13.5" value="${l.kilosTexto}"></td>
      <td class="col-estrecha"><input type="number" id="cr_${i}" min="0" step="0.001" value="${l.precioKg}"></td>
      <td class="col-check"><input type="checkbox" id="cc_${i}" ${l.control ? 'checked' : ''}></td>
      <td class="num" id="czgz_${i}">0,00</td>
      <td class="num" id="cop2_${i}">0,00</td>
      <td class="num" id="cbreal_${i}">0,00</td>
      <td class="num" id="civa_${i}">0,00</td>
      <td class="num" id="ctot_${i}" style="font-weight:700;">0,00</td>
      <td><button class="btn btn-peligro btn-mini" type="button" data-i="${i}">✕</button></td>
    </tr>`).join('');

  lineas.forEach((l, i) => {
    document.getElementById(`cpa_${i}`).addEventListener('input', (e) => buscarArticulo(i, e.target.value));
    document.getElementById(`cq_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'cajas', e.target.value));
    document.getElementById(`cq_${i}`).addEventListener('keydown', (e) => navegarCompra(e, i, 'cajas'));
    document.getElementById(`ck_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'kilosTexto', e.target.value));
    document.getElementById(`ck_${i}`).addEventListener('keydown', (e) => navegarCompra(e, i, 'kilos'));
    document.getElementById(`cr_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'precioKg', e.target.value));
    document.getElementById(`cr_${i}`).addEventListener('keydown', (e) => navegarCompra(e, i, 'precioKg'));
    document.getElementById(`cc_${i}`).addEventListener('change', (e) => { lineas[i].control = e.target.checked; });
  });
  tbody.querySelectorAll('button[data-i]').forEach((btn) => {
    btn.addEventListener('click', () => eliminarLinea(Number(btn.dataset.i)));
  });

  recalcularTodasLasLineas();
}

// Actualiza solo el estado y las celdas calculadas de ESA fila, sin volver
// a pintar toda la tabla — para poder teclear del tirón en Cajas/Kilos/€-Kg
// sin que el cursor salte (mismo motivo que en el HTML actual).
function actualizarLinea(i, campo, valor) {
  lineas[i][campo] = valor;
  pintarCalculoLinea(i);
}

function pintarCalculoLinea(i) {
  const l = lineas[i];
  const calc = calcularLineaPreview(l);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt(val); };
  set(`czgz_${i}`, calc.baseZgz);
  set(`cop2_${i}`, calc.op2);
  set(`cbreal_${i}`, calc.baseReal);
  set(`civa_${i}`, calc.iva);
  set(`ctot_${i}`, calc.total);
  const ck = document.getElementById(`ck_${i}`);
  if (ck) ck.classList.toggle('invalido', Number.isNaN(evaluarExpresionKilos(l.kilosTexto)));
  recalcularTotales();
}

function recalcularTodasLasLineas() {
  lineas.forEach((_, i) => pintarCalculoLinea(i));
}

function recalcularTotales() {
  let kilos = 0, base = 0, iva = 0, total = 0;
  lineas.forEach((l) => {
    const calc = calcularLineaPreview(l);
    if (!l.articuloId) return;
    kilos += calc.kilos; base += calc.baseReal; iva += calc.iva; total += calc.total;
  });
  document.getElementById('cp-tot-kilos').textContent = fmt(kilos);
  document.getElementById('cp-tot-base').textContent = fmt(base);
  document.getElementById('cp-tot-iva').textContent = fmt(iva);
  document.getElementById('cp-tot-total').textContent = fmt(total);
}

// Tab/Enter para moverse de campo en campo, igual que en Pedidos: Cajas →
// Kilos → €/Kg → Cajas de la siguiente línea (o nueva línea si es la última).
function navegarCompra(e, i, campo) {
  if (e.key !== 'Enter' && e.key !== 'Tab') return;
  e.preventDefault();
  const orden = ['cajas', 'kilos', 'precioKg'];
  const prefijo = { cajas: 'cq_', kilos: 'ck_', precioKg: 'cr_' };
  const idx = orden.indexOf(campo);
  if (idx < orden.length - 1) {
    enfocar(prefijo[orden[idx + 1]], i);
  } else if (i < lineas.length - 1) {
    enfocar('cq_', i + 1);
  } else {
    agregarLinea();
    enfocar('cq_', lineas.length - 1);
  }
}

function enfocar(prefijo, i) {
  const el = document.getElementById(`${prefijo}${i}`);
  if (el) el.focus();
}

// ===== Artículo (autocompletar por línea) =====

function buscarArticulo(i, q) {
  lineas[i].articuloTexto = q;
  const dd = document.getElementById(`cpa_dd_${i}`);
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
  const input = document.getElementById(`cpa_${i}`);
  if (input) input.value = lineas[i].articuloTexto;
  document.getElementById(`cpa_dd_${i}`).style.display = 'none';
  if (i === lineas.length - 1) agregarLinea();
  recalcularTotales();
  // Pospuesto: esto viene de un clic (mousedown) sobre una sugerencia que
  // acaba de desaparecer del DOM al reconstruir la tabla — el navegador
  // resetea el foco a <body> justo después si se enfoca de forma síncrona
  // aquí (mismo motivo por el que elegirArtCompra usa un setTimeout en el
  // HTML actual). La navegación por teclado (navegarCompra) no tiene este
  // problema y por eso allí el enfocar() es directo.
  setTimeout(() => enfocar('cq_', i), 30);
}

// ===== Grabar =====

async function grabarCompra() {
  if (guardando) return;
  ocultarAviso('cp-aviso');

  if (!proveedorSeleccionado) {
    mostrarAviso('cp-aviso', '⚠️ Elige un proveedor de la lista.', 'error');
    return;
  }
  const lineasValidas = lineas.filter((l) => l.articuloId && !Number.isNaN(evaluarExpresionKilos(l.kilosTexto)) && evaluarExpresionKilos(l.kilosTexto) > 0);
  if (!lineasValidas.length) {
    mostrarAviso('cp-aviso', '⚠️ Añade al menos un producto con kilos.', 'error');
    return;
  }
  const puesto = definirPuesto(false);
  if (!puesto) {
    mostrarAviso('cp-aviso', '⚠️ Define el nombre de este puesto arriba a la derecha antes de grabar.', 'error');
    return;
  }

  const cuerpo = {
    idempotencyKey: idempotencyKeyActual,
    fecha: document.getElementById('cp-fecha').value,
    proveedorId: proveedorSeleccionado.id,
    albaranProveedor: document.getElementById('cp-albprov').value.trim() || null,
    puestoOrigen: puesto,
    partidaNueva: document.getElementById('cp-partida-nueva').checked,
    lineas: lineasValidas.map((l) => ({
      articuloId: l.articuloId,
      cajas: l.cajas === '' ? null : Number(l.cajas),
      kilos: l.kilosTexto,
      precioKg: l.precioKg,
      control: l.control,
    })),
  };
  const elegirWrap = document.getElementById('cp-partida-elegir-wrap');
  if (elegirWrap.style.display !== 'none' && !cuerpo.partidaNueva) {
    cuerpo.partidaElegida = Number(document.getElementById('cp-partida-elegir').value);
  }

  guardando = true;
  const btn = document.getElementById('btn-grabar');
  btn.disabled = true;
  btn.textContent = '⏳ Grabando...';
  try {
    const creada = await apiPost('/compras', cuerpo);
    mostrarAviso('cp-aviso', `✅ Compra grabada con la partida ${creada.numeroPartida}.`, 'exito');
    setTimeout(() => { reiniciarFormulario(); document.getElementById('cp-fecha').value = cuerpo.fecha; }, 1800);
  } catch (err) {
    mostrarAviso('cp-aviso', '⚠️ ' + err.message, 'error');
  } finally {
    guardando = false;
    btn.disabled = false;
    btn.textContent = '💾 Grabar compra';
  }
}

iniciar();
