// Reparto a supermercados (Alcampo, Ecomora, Ahorramas...) — pantalla
// nueva (ver Fase 0 punto 15, 03_FRONTEND_MARINAFISK.md). A diferencia de
// Pedidos/Traspasos, NO lleva precio ni importe (no se factura desde aquí,
// ver el HTML real: grabarReparto nunca calcula un total económico) — es
// puramente logístico/trazabilidad: cada línea lleva lote/barco/subzona/
// arte de pesca (para la etiqueta Scanfisk — cuya generación en sí queda
// pendiente, ver 03_FRONTEND_MARINAFISK.md), además de cajas/kg/peso de
// etiqueta.
//
// Deliberadamente NO construido en esta ronda (ver 03_FRONTEND_MARINAFISK.md
// punto 7): cargar un reparto ya grabado para modificarlo desde el
// historial, y la generación de etiquetas/PDF/envío por WhatsApp o email —
// el historial de aquí abajo es de solo lectura salvo Anular.

const DESTINATARIOS_CADENA = ['ALCAMPO']; // ver dividirDestinatario() del HTML real

let articulos = [];
let lineas = [];
let repartos = [];
let idempotencyKeyActual = nuevaIdempotencyKey();
let guardando = false;

const lineaVacia = () => ({
  articuloId: null, articuloTexto: '', lote: '', barco: '', subzona: '', artePesca: '', cajas: '', pesoTexto: '', pesoEtiquetaTexto: '',
});

// Admite sumar varias cifras (ej. "12+13.5"), igual que Kilos en Compras —
// el servidor es quien manda de verdad al grabar; esto es solo para marcar
// en rojo una expresión inválida.
function evaluarExpresionKilos(valorTexto) {
  const texto = String(valorTexto == null ? '' : valorTexto).trim();
  if (texto === '') return 0;
  if (!/^[0-9.,+\-\s]+$/.test(texto)) return NaN;
  const tokens = texto.replace(/,/g, '.').replace(/\s+/g, '').match(/[+-]?[0-9]*\.?[0-9]+/g);
  if (!tokens || !tokens.length) return NaN;
  return tokens.reduce((s, t) => s + parseFloat(t), 0);
}

async function iniciar() {
  pintarBotonPuesto('btn-puesto');
  document.getElementById('rp-fecha').value = new Date().toISOString().slice(0, 10);
  lineas = [lineaVacia()];
  try {
    articulos = await apiGet('/articulos');
  } catch (err) {
    mostrarAviso('rp-aviso', '⚠️ No se ha podido conectar con el servidor: ' + err.message, 'error');
  }
  renderLineas();

  document.getElementById('rp-destinatario').addEventListener('change', (e) => {
    document.getElementById('rp-destinatario-otro-fg').style.display = e.target.value === 'OTRO' ? 'block' : 'none';
  });
  document.getElementById('btn-add-linea').addEventListener('click', () => { lineas.push(lineaVacia()); renderLineas(); enfocarArticulo(lineas.length - 1); });
  document.getElementById('btn-grabar').addEventListener('click', grabarReparto);
  ['rp-his-desde', 'rp-his-hasta', 'rp-his-dest'].forEach((id) => document.getElementById(id).addEventListener('input', renderHistorial));

  await cargarHistorial();
}

function enfocarArticulo(i) {
  document.getElementById(`repa_${i}`)?.focus();
}

// ===== Líneas =====

function actualizarLinea(i, campo, valor) {
  lineas[i][campo] = valor;
  if (campo === 'cajas' || campo === 'pesoTexto' || campo === 'pesoEtiquetaTexto') {
    const idCampo = { cajas: 'repc_', pesoTexto: 'repp_', pesoEtiquetaTexto: 'repe_' }[campo];
    const input = document.getElementById(`${idCampo}${i}`);
    if (input) input.classList.toggle('invalido', Number.isNaN(evaluarExpresionKilos(valor)));
  }
}

function quitarLinea(i) {
  lineas.splice(i, 1);
  if (!lineas.length) lineas.push(lineaVacia());
  renderLineas();
}

function renderLineas() {
  const tbody = document.getElementById('rp-lineas');
  tbody.innerHTML = lineas.map((l, i) => `
    <tr>
      <td class="col-producto autocompletar">
        <input type="text" id="repa_${i}" placeholder="Código o nombre..." value="${String(l.articuloTexto).replace(/"/g, '&quot;')}" autocomplete="off">
        <div class="sugerencias" id="repa_dd_${i}"></div>
      </td>
      <td><input type="text" id="repl_${i}" value="${l.lote}" placeholder="Nº lote"></td>
      <td><input type="text" id="repb_${i}" value="${l.barco}" placeholder="VARIOS BARCOS"></td>
      <td><input type="text" id="reps_${i}" value="${l.subzona}" placeholder="ej. VIIIc"></td>
      <td><input type="text" id="repap_${i}" value="${l.artePesca}" placeholder="ej. ARRASTRE"></td>
      <td class="col-estrecha"><input type="text" inputmode="decimal" id="repc_${i}" value="${l.cajas}"></td>
      <td class="col-estrecha"><input type="text" inputmode="decimal" id="repp_${i}" placeholder="ej. 12+13.5" value="${l.pesoTexto}"></td>
      <td class="col-estrecha"><input type="text" inputmode="decimal" id="repe_${i}" placeholder="VER CAJA" value="${l.pesoEtiquetaTexto}"></td>
      <td><button class="btn btn-peligro btn-mini" type="button" data-i="${i}">✕</button></td>
    </tr>`).join('');

  lineas.forEach((l, i) => {
    document.getElementById(`repa_${i}`).addEventListener('input', (e) => buscarArticulo(i, e.target.value));
    document.getElementById(`repa_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'articulo'));
    document.getElementById(`repl_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'lote', e.target.value));
    document.getElementById(`repl_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'lote'));
    document.getElementById(`repb_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'barco', e.target.value));
    document.getElementById(`repb_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'barco'));
    document.getElementById(`reps_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'subzona', e.target.value));
    document.getElementById(`reps_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'subzona'));
    document.getElementById(`repap_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'artePesca', e.target.value));
    document.getElementById(`repap_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'artePesca'));
    document.getElementById(`repc_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'cajas', e.target.value));
    document.getElementById(`repc_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'cajas'));
    document.getElementById(`repp_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'pesoTexto', e.target.value));
    document.getElementById(`repp_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'peso'));
    document.getElementById(`repe_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'pesoEtiquetaTexto', e.target.value));
    document.getElementById(`repe_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'pesoEtiqueta'));
  });
  tbody.querySelectorAll('button[data-i]').forEach((btn) => {
    btn.addEventListener('click', () => quitarLinea(Number(btn.dataset.i)));
  });

  recalcularTotales();
}

function recalcularTotales() {
  const cajas = lineas.reduce((s, l) => s + (Number.isNaN(evaluarExpresionKilos(l.cajas)) ? 0 : evaluarExpresionKilos(l.cajas)), 0);
  const kg = lineas.reduce((s, l) => s + (Number.isNaN(evaluarExpresionKilos(l.pesoTexto)) ? 0 : evaluarExpresionKilos(l.pesoTexto)), 0);
  document.getElementById('rp-tot-cajas').textContent = cajas;
  document.getElementById('rp-tot-kg').textContent = fmt(kg);
}

function buscarArticulo(i, q) {
  lineas[i].articuloTexto = q;
  lineas[i].articuloId = null;
  const dd = document.getElementById(`repa_dd_${i}`);
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
  // Barco/subzona/arte de pesca se autorrellenan del artículo SOLO si la
  // línea todavía no tenía nada escrito — igual que elegirArtReparto() del
  // HTML real: siguen siendo editables, una misma referencia puede venir
  // de varios barcos/lotes mezclados ("VARIOS BARCOS").
  if (!lineas[i].barco && a.barco) lineas[i].barco = a.barco;
  if (!lineas[i].subzona && a.subzona) lineas[i].subzona = a.subzona;
  if (!lineas[i].artePesca && a.artePesca) lineas[i].artePesca = a.artePesca;
  document.getElementById(`repa_dd_${i}`).style.display = 'none';
  if (i === lineas.length - 1) lineas.push(lineaVacia());
  renderLineas();
  setTimeout(() => document.getElementById(`repl_${i}`)?.focus(), 30);
}

function teclaLinea(ev, i, campo) {
  if (ev.key !== 'Enter' && ev.key !== 'Tab') return;
  ev.preventDefault();
  const orden = ['articulo', 'lote', 'barco', 'subzona', 'artePesca', 'cajas', 'peso', 'pesoEtiqueta'];
  const prefijo = { articulo: 'repa_', lote: 'repl_', barco: 'repb_', subzona: 'reps_', artePesca: 'repap_', cajas: 'repc_', peso: 'repp_', pesoEtiqueta: 'repe_' };
  const idx = orden.indexOf(campo);
  if (idx < orden.length - 1) {
    document.getElementById(`${prefijo[orden[idx + 1]]}${i}`)?.focus();
  } else if (i < lineas.length - 1) {
    enfocarArticulo(i + 1);
  } else {
    lineas.push(lineaVacia());
    renderLineas();
    enfocarArticulo(lineas.length - 1);
  }
}

// ===== Destinatario (mismo split que dividirDestinatario() del HTML real) =====

function dividirDestinatario(texto) {
  const t = String(texto || '').trim();
  for (const cadena of DESTINATARIOS_CADENA) {
    if (t.toUpperCase().startsWith(cadena)) return { nombre: cadena, ciudad: t.slice(cadena.length).trim() };
  }
  return { nombre: t, ciudad: '' };
}

function destinatarioElegido() {
  const sel = document.getElementById('rp-destinatario').value;
  const texto = sel === 'OTRO' ? document.getElementById('rp-destinatario-otro').value.trim() : sel;
  return dividirDestinatario(texto);
}

// ===== Grabar =====

async function grabarReparto() {
  if (guardando) return;
  ocultarAviso('rp-aviso');

  const lineasValidas = lineas.filter((l) => l.articuloId && !Number.isNaN(evaluarExpresionKilos(l.cajas)) && evaluarExpresionKilos(l.cajas) > 0);
  if (!lineasValidas.length) {
    mostrarAviso('rp-aviso', '⚠️ Añade al menos un producto con cajas.', 'error');
    return;
  }
  const destinatario = destinatarioElegido();
  if (!destinatario.nombre) {
    mostrarAviso('rp-aviso', '⚠️ Indica el destinatario.', 'error');
    return;
  }
  const puesto = definirPuesto(false);
  if (!puesto) {
    mostrarAviso('rp-aviso', '⚠️ Define el nombre de este puesto arriba a la derecha antes de grabar.', 'error');
    return;
  }

  const cajas = lineasValidas.reduce((s, l) => s + evaluarExpresionKilos(l.cajas), 0);
  const kg = lineasValidas.reduce((s, l) => s + (evaluarExpresionKilos(l.pesoTexto) || 0), 0);
  const palets = await pedirPalets({
    titulo: '¿CUÁNTOS PALETS LLEVA ESTE REPARTO?',
    contexto: `${(destinatario.nombre + ' ' + destinatario.ciudad).trim()} — ${cajas} cajas, ${fmt(kg)} kg`,
    valorActual: document.getElementById('rp-palets').value,
  });
  if (palets === null) return; // cancelado - no se graba nada

  const numeroTexto = document.getElementById('rp-numero-in').value.trim();
  const cuerpo = {
    idempotencyKey: idempotencyKeyActual,
    numero: numeroTexto === '' ? undefined : Number(numeroTexto),
    fecha: document.getElementById('rp-fecha').value,
    destinatarioNombre: destinatario.nombre,
    destinatarioCiudad: destinatario.ciudad,
    conductor: document.getElementById('rp-conductor').value.trim() || null,
    palets,
    puestoOrigen: puesto,
    lineas: lineasValidas.map((l) => ({
      articuloId: l.articuloId,
      cajas: l.cajas,
      peso: l.pesoTexto,
      pesoEtiqueta: l.pesoEtiquetaTexto,
      lote: l.lote,
      barco: l.barco,
      subzona: l.subzona,
      artePesca: l.artePesca,
    })),
  };
  document.getElementById('rp-palets').value = palets;

  guardando = true;
  const btn = document.getElementById('btn-grabar');
  btn.disabled = true;
  btn.textContent = '⏳ Grabando...';
  try {
    const creado = await apiPost('/repartos', cuerpo);
    mostrarAviso('rp-aviso', `✅ Reparto nº ${creado.numero} grabado (${fmt(creado.totalCajas)} cajas, ${fmt(creado.totalKg)} kg).`, 'exito');
    document.getElementById('rp-numero-chip').innerHTML = `Nº <strong>${creado.numero}</strong>`;
    idempotencyKeyActual = nuevaIdempotencyKey();
    document.getElementById('rp-numero-in').value = '';
    document.getElementById('rp-conductor').value = '';
    document.getElementById('rp-palets').value = 0;
    lineas = [lineaVacia()];
    renderLineas();
    await cargarHistorial();
  } catch (err) {
    mostrarAviso('rp-aviso', '⚠️ ' + err.message, 'error');
  } finally {
    guardando = false;
    btn.disabled = false;
    btn.textContent = '💾 Grabar reparto';
  }
}

// ===== Historial =====

async function cargarHistorial() {
  try {
    repartos = await apiGet('/repartos');
    renderHistorial();
  } catch (err) {
    mostrarAviso('rp-aviso', '⚠️ No se ha podido leer el historial: ' + err.message, 'error');
  }
}

function renderHistorial() {
  const desde = document.getElementById('rp-his-desde').value;
  const hasta = document.getElementById('rp-his-hasta').value;
  const destTexto = document.getElementById('rp-his-dest').value.trim().toLowerCase();
  const filas = repartos
    .filter((r) => (!desde || r.fecha.slice(0, 10) >= desde) && (!hasta || r.fecha.slice(0, 10) <= hasta))
    .filter((r) => !destTexto || `${r.destinatarioNombre || ''} ${r.destinatarioCiudad || ''}`.toLowerCase().includes(destTexto))
    .sort((a, b) => b.numero - a.numero);

  const tbody = document.getElementById('rp-his-body');
  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;padding:16px;">No hay repartos.</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map((r) => `
    <tr>
      <td><strong>${r.numero}</strong></td>
      <td>${new Date(r.fecha).toLocaleDateString('es-ES')}</td>
      <td>${r.destinatarioNombre || ''} ${r.destinatarioCiudad || ''}</td>
      <td>${r.conductor || ''}</td>
      <td class="num">${r.lineas.length}</td>
      <td class="num">${fmt(r.totalCajas)}</td>
      <td class="num">${fmt(r.totalKg)}</td>
      <td><button class="btn btn-peligro btn-mini" type="button" data-id="${r.id}" data-num="${r.numero}">🗑️ Anular</button></td>
    </tr>`).join('');
  tbody.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => anularReparto(Number(btn.dataset.id), btn.dataset.num));
  });
}

async function anularReparto(id, numero) {
  if (!confirm(`¿Anular el reparto nº ${numero}? Esta acción no se puede deshacer.`)) return;
  try {
    const resp = await fetch(`/repartos/${id}?puestoOrigen=${encodeURIComponent(puestoActual() || '')}`, { method: 'DELETE' });
    if (!resp.ok) {
      const cuerpo = await resp.json().catch(() => ({}));
      throw new Error(cuerpo.error || `Error al anular (HTTP ${resp.status}).`);
    }
    await cargarHistorial();
  } catch (err) {
    mostrarAviso('rp-aviso', '⚠️ ' + err.message, 'error');
  }
}

iniciar();
