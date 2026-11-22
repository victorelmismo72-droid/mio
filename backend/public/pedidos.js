// Pantalla de Pedidos (albaranes de venta) del frontend nuevo — mismo
// objetivo y mismo patrón que compras.js: tan rápida de teclear como el
// Excel/HTML actual, con las mismas teclas para moverse entre campos
// (Tab/Enter recorre Cajas → Peso → €/Kg → Dto → siguiente línea).
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
// La asignación automática de partida a cada línea (ver Fase 2 punto 4)
// la sigue haciendo el servidor igual que siempre, en silencio — esta
// pantalla no la fuerza ni la bloquea (Víctor la tiene desactivada en el
// HTML real por su propia decisión, no solo por rendimiento). Tras grabar,
// se informa de qué partida le tocó a cada línea, solo como transparencia.

// Agencias de transporte: lista cerrada (ver backend/src/agencias.js, única
// fuente de verdad para la validación real — esto es solo para construir
// el desplegable; el servidor vuelve a validar/normalizar igual que hoy).
const AGENCIAS_VALIDAS = ['TRANSFRIO', 'KARTIN', 'OLANO', 'MOUZO', 'FARIÑA'];

let clientes = [];
let articulos = [];
let clienteSeleccionado = null;
let lineas = [];
let idempotencyKeyActual = nuevaIdempotencyKey();
let guardando = false;

const lineaVacia = () => ({ articuloId: null, articuloTexto: '', cajas: '', pesoTexto: '', precioKg: '', descuento: '' });

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
      <td><input type="text" inputmode="decimal" id="pp_${i}" placeholder="ej. 12+13.5" title="Puedes sumar varios bultos, igual que en Compras: 12+13.5" value="${l.pesoTexto}"></td>
      <td class="col-estrecha"><input type="number" id="pr_${i}" min="0" step="0.01" value="${l.precioKg}"></td>
      <td class="col-estrecha"><input type="number" id="pdto_${i}" min="0" max="100" step="0.01" value="${l.descuento}"></td>
      <td class="num" id="ptot_${i}" style="font-weight:700;">0,00</td>
      <td><button class="btn btn-peligro btn-mini" type="button" data-i="${i}">✕</button></td>
    </tr>`).join('');

  lineas.forEach((l, i) => {
    document.getElementById(`pda_${i}`).addEventListener('input', (e) => buscarArticulo(i, e.target.value));
    document.getElementById(`pq_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'cajas', e.target.value));
    document.getElementById(`pq_${i}`).addEventListener('keydown', (e) => navegarPedido(e, i, 'cajas'));
    document.getElementById(`pp_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'pesoTexto', e.target.value));
    document.getElementById(`pp_${i}`).addEventListener('keydown', (e) => navegarPedido(e, i, 'peso'));
    document.getElementById(`pr_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'precioKg', e.target.value));
    document.getElementById(`pr_${i}`).addEventListener('keydown', (e) => navegarPedido(e, i, 'precioKg'));
    document.getElementById(`pdto_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'descuento', e.target.value));
    document.getElementById(`pdto_${i}`).addEventListener('keydown', (e) => navegarPedido(e, i, 'descuento'));
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
// en Compras.
function navegarPedido(e, i, campo) {
  if (e.key !== 'Enter' && e.key !== 'Tab') return;
  e.preventDefault();
  const orden = ['cajas', 'peso', 'precioKg', 'descuento'];
  const prefijo = { cajas: 'pq_', peso: 'pp_', precioKg: 'pr_', descuento: 'pdto_' };
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
  const input = document.getElementById(`pda_${i}`);
  if (input) input.value = lineas[i].articuloTexto;
  document.getElementById(`pda_dd_${i}`).style.display = 'none';
  if (i === lineas.length - 1) agregarLinea();
  recalcularTotales();
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

  const numeroTexto = document.getElementById('pd-numero-in').value.trim();
  const cuerpo = {
    idempotencyKey: idempotencyKeyActual,
    numero: numeroTexto === '' ? undefined : Number(numeroTexto),
    fecha: document.getElementById('pd-fecha').value,
    clienteId: clienteSeleccionado.id,
    agencia: document.getElementById('pd-agencia').value || null,
    formaPago: document.getElementById('pd-formapago').value.trim() || null,
    puestoOrigen: puesto,
    lineas: lineasValidas.map((l) => ({
      articuloId: l.articuloId,
      cantidad: l.cajas === '' ? null : Number(l.cajas),
      peso: l.pesoTexto,
      precio: Number(l.precioKg) || 0,
      descuento: Number(l.descuento) || 0,
    })),
  };

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
