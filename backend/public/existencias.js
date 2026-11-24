// EXISTENCIAS EN CAMARA — pantalla nueva (ver Fase 0 punto 15,
// 03_FRONTEND_MARINAFISK.md): lo que queda en la cámara, día a día — no es
// ni una compra ni una venta, es un apunte manual de stock físico. Puerto
// directo de abrirExistencias() y las funciones "ex..." del HTML real
// (CARGA_DE_ALBARANES_MARINAFISK_2026-11-24_UNAFILA.html), con dos paneles
// en vez de un modal: el editor del día a la izquierda y el listado por
// días a la derecha — mismo patrón que el resto de pantallas nuevas.
//
// A diferencia de Pedidos/Traspasos/Compras, el artículo aquí NO es
// obligatorio del catálogo: si lo tecleado no coincide con ninguna
// sugerencia elegida, se guarda como texto libre (igual que el HTML real,
// que admite "lo que sea" en esa columna).

let articulos = [];
let lineas = [];
let diasListado = [];

const lineaVacia = () => ({
  id: null, separador: false, articuloId: null, textoArticulo: '', cantidad: '', pesoTexto: '', precio: '', nota: '', vendido: false,
});

// Admite sumar varios pesos (ej. "12,4+8,1"), igual que el resto del
// programa — el servidor (evaluarExpresionKilos) es quien manda de verdad
// al grabar; esto es solo para marcar en rojo una expresión inválida.
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
  const hoy = new Date().toISOString().slice(0, 10);
  const hace14 = new Date(); hace14.setDate(hace14.getDate() - 14);
  document.getElementById('ex-fecha').value = hoy;
  document.getElementById('ex-desde').value = hace14.toISOString().slice(0, 10);
  document.getElementById('ex-hasta').value = hoy;

  try {
    articulos = await apiGet('/articulos');
  } catch (err) {
    mostrarAviso('ex-aviso', '⚠️ No se ha podido conectar con el servidor: ' + err.message, 'error');
  }

  document.getElementById('ex-fecha').addEventListener('change', cambiarFecha);
  document.getElementById('btn-anadir-linea').addEventListener('click', () => { lineas.push(lineaVacia()); renderFilas(); enfocarArticulo(lineas.length - 1); });
  document.getElementById('btn-anadir-sep').addEventListener('click', () => { lineas.push({ ...lineaVacia(), separador: true }); renderFilas(); });
  document.getElementById('btn-grabar-dia').addEventListener('click', grabarDia);
  document.getElementById('btn-borrar-dia').addEventListener('click', borrarDia);
  ['ex-desde', 'ex-hasta', 'ex-agrupa', 'ex-ver-vend', 'ex-filtro'].forEach((id) => {
    document.getElementById(id).addEventListener('input', cargarListado);
    document.getElementById(id).addEventListener('change', cargarListado);
  });
  document.getElementById('btn-imprimir').addEventListener('click', imprimirListado);
  document.getElementById('btn-excel').addEventListener('click', exportarExcel);

  await cambiarFecha();
  await cargarListado();
}

function enfocarArticulo(i) {
  const el = document.getElementById(`exa_${i}`);
  if (el) el.focus();
}

// ===== Editor del día =====

async function cambiarFecha() {
  const fecha = document.getElementById('ex-fecha').value;
  if (!fecha) return;
  ocultarAviso('ex-aviso');
  try {
    const resp = await apiGet(`/existencias/${fecha}`);
    lineas = resp.lineas.map((l) => ({
      id: l.id,
      separador: !!l.separador,
      articuloId: l.articuloId,
      textoArticulo: l.articuloId ? `${l.articuloCodigo} — ${l.articuloDescripcion}` : (l.descripcionLibre || ''),
      cantidad: l.cantidad == null ? '' : l.cantidad,
      pesoTexto: l.peso == null ? '' : String(l.peso),
      precio: l.precio == null ? '' : l.precio,
      nota: l.nota || '',
      vendido: !!l.vendido,
    }));
    if (!lineas.length) lineas.push(lineaVacia());
    if (resp.lineas.length) mostrarAviso('ex-aviso', 'Este día ya tiene existencias cargadas: puedes corregirlas y volver a grabar.', 'exito');
    else ocultarAviso('ex-aviso');
  } catch (err) {
    mostrarAviso('ex-aviso', '⚠️ ' + err.message, 'error');
  }
  renderFilas();
}

function actualizarLinea(i, campo, valor) {
  lineas[i][campo] = valor;
  if (campo === 'pesoTexto') {
    const input = document.getElementById(`exp_${i}`);
    if (input) input.classList.toggle('invalido', Number.isNaN(evaluarExpresionKilos(valor)));
  }
}

function quitarLinea(i) {
  lineas.splice(i, 1);
  if (!lineas.length) lineas.push(lineaVacia());
  renderFilas();
}

function renderFilas() {
  const tbody = document.getElementById('ex-filas');
  tbody.innerHTML = lineas.map((l, i) => {
    if (l.separador) {
      return `<tr class="ex-fila-sep"><td colspan="6">— fila en blanco (separa grupos) —</td><td><button class="btn btn-peligro btn-mini" type="button" data-i="${i}">✕</button></td></tr>`;
    }
    return `
    <tr class="${l.vendido ? 'vendida' : ''}">
      <td class="autocompletar">
        <input type="text" id="exa_${i}" placeholder="Código, nombre o texto libre..." value="${String(l.textoArticulo).replace(/"/g, '&quot;')}" autocomplete="off">
        <div class="sugerencias" id="exa_dd_${i}"></div>
      </td>
      <td class="col-bultos"><input type="text" inputmode="decimal" id="exc_${i}" value="${l.cantidad}"></td>
      <td class="col-kilos"><input type="text" inputmode="decimal" id="exp_${i}" placeholder="ej. 12,4+8,1" title="Puedes sumar varios pesos: 12,4+8,1" value="${l.pesoTexto}"></td>
      <td class="col-precio"><input type="text" inputmode="decimal" id="exr_${i}" value="${l.precio}"></td>
      <td><input type="text" id="exn_${i}" value="${String(l.nota).replace(/"/g, '&quot;')}"></td>
      <td class="col-check"><input type="checkbox" id="exv_${i}" ${l.vendido ? 'checked' : ''} title="Vendido del todo: sale en rojo y deja de salir en el listado (sí en estadísticas)"></td>
      <td><button class="btn btn-peligro btn-mini" type="button" data-i="${i}">✕</button></td>
    </tr>`;
  }).join('');

  lineas.forEach((l, i) => {
    if (l.separador) return;
    document.getElementById(`exa_${i}`).addEventListener('input', (e) => buscarArticulo(i, e.target.value));
    document.getElementById(`exa_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'articulo'));
    document.getElementById(`exc_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'cantidad', e.target.value));
    document.getElementById(`exc_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'cantidad'));
    document.getElementById(`exp_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'pesoTexto', e.target.value));
    document.getElementById(`exp_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'peso'));
    document.getElementById(`exr_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'precio', e.target.value));
    document.getElementById(`exr_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'precio'));
    document.getElementById(`exn_${i}`).addEventListener('input', (e) => actualizarLinea(i, 'nota', e.target.value));
    document.getElementById(`exn_${i}`).addEventListener('keydown', (e) => teclaLinea(e, i, 'nota'));
    document.getElementById(`exv_${i}`).addEventListener('change', (e) => { lineas[i].vendido = e.target.checked; renderFilas(); });
  });
  tbody.querySelectorAll('button[data-i]').forEach((btn) => {
    btn.addEventListener('click', () => quitarLinea(Number(btn.dataset.i)));
  });
}

function buscarArticulo(i, q) {
  lineas[i].textoArticulo = q;
  lineas[i].articuloId = null; // hasta que no se elija una sugerencia, cuenta como texto libre
  const dd = document.getElementById(`exa_dd_${i}`);
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
  lineas[i].textoArticulo = `${a.codigo} — ${a.descripcion}`;
  const input = document.getElementById(`exa_${i}`);
  if (input) input.value = lineas[i].textoArticulo;
  document.getElementById(`exa_dd_${i}`).style.display = 'none';
  // Pospuesto a propósito — mismo motivo que elegirArtCompra en compras.js:
  // el elemento sobre el que se hizo clic desaparece del DOM al reconstruir
  // la fila y el navegador resetea el foco al <body> si no se pospone.
  setTimeout(() => document.getElementById(`exc_${i}`)?.focus(), 30);
}

function teclaLinea(ev, i, campo) {
  if (ev.key !== 'Enter' && ev.key !== 'Tab') return;
  ev.preventDefault();
  const orden = ['articulo', 'cantidad', 'peso', 'precio', 'nota'];
  const prefijo = { articulo: 'exa_', cantidad: 'exc_', peso: 'exp_', precio: 'exr_', nota: 'exn_' };
  const idx = orden.indexOf(campo);
  if (idx < orden.length - 1) {
    document.getElementById(`${prefijo[orden[idx + 1]]}${i}`)?.focus();
  } else if (i < lineas.length - 1) {
    enfocarArticulo(i + 1);
  } else {
    lineas.push(lineaVacia());
    renderFilas();
    enfocarArticulo(lineas.length - 1);
  }
}

async function grabarDia() {
  const fecha = document.getElementById('ex-fecha').value;
  if (!fecha) { mostrarAviso('ex-aviso', 'Pon la fecha.', 'error'); return; }
  const cuerpo = {
    fecha,
    puestoOrigen: puestoActual(),
    idempotencyKey: nuevaIdempotencyKey(),
    lineas: lineas.map((l) => (l.separador ? { separador: true } : {
      articuloId: l.articuloId,
      descripcionLibre: l.articuloId ? null : l.textoArticulo,
      cantidad: l.cantidad,
      peso: l.pesoTexto,
      precio: l.precio,
      nota: l.nota,
      vendido: l.vendido,
    })),
  };
  const boton = document.getElementById('btn-grabar-dia');
  boton.disabled = true;
  boton.textContent = '⏳ Grabando...';
  try {
    const resp = await apiPost('/existencias', cuerpo);
    await cambiarFecha();
    await cargarListado();
    // Va DESPUÉS de cambiarFecha() a propósito: ese refresco oculta el
    // aviso si el día queda sin líneas — así el mensaje final de "grabado"
    // no desaparece antes de que Víctor lo vea (bug real encontrado al
    // probar "Grabar día" con Playwright el 24/11/2026).
    mostrarAviso('ex-aviso', resp.borrado ? '✅ Día sin líneas con kilos: no se guarda nada para esa fecha.' : `✅ Grabado el ${fecha}.`, 'exito');
  } catch (err) {
    mostrarAviso('ex-aviso', '⚠️ ' + err.message, 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = '💾 GRABAR DÍA';
  }
}

async function borrarDia() {
  const fecha = document.getElementById('ex-fecha').value;
  if (!fecha) return;
  if (!confirm(`¿Borrar las existencias del ${fecha}?`)) return;
  try {
    const resp = await fetch(`/existencias/${fecha}?puestoOrigen=${encodeURIComponent(puestoActual() || '')}`, { method: 'DELETE' });
    const cuerpo = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(cuerpo.error || `Error al borrar (HTTP ${resp.status}).`);
    await cambiarFecha();
    await cargarListado();
    mostrarAviso('ex-aviso', `🗑️ Borrado el ${fecha}.`, 'exito'); // ver comentario en grabarDia()
  } catch (err) {
    mostrarAviso('ex-aviso', '⚠️ ' + err.message, 'error');
  }
}

// ===== Listado por días =====

function leerFiltrosListado() {
  return {
    desde: document.getElementById('ex-desde').value,
    hasta: document.getElementById('ex-hasta').value,
    agrupa: document.getElementById('ex-agrupa').value,
    verVendidosModo: document.getElementById('ex-ver-vend').value, // no|si|solo
    filtro: document.getElementById('ex-filtro').value.trim(),
  };
}

function normalizarTexto(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const DIAS_GALEGO = ['DOMINGO', 'LUNS', 'MARTES', 'MERCORES', 'XOVES', 'VENRES', 'SABADO'];
function cabeceraDia(fechaIso) {
  const d = new Date(`${fechaIso}T12:00:00`);
  const p = fechaIso.split('-');
  return `${DIAS_GALEGO[d.getDay()]}, ${p[2]}-${p[1]}-${p[0].slice(2)}`;
}

function semanaIso(fechaIso) {
  const d = new Date(`${fechaIso}T12:00:00`);
  const dia = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dia + 3);
  const anio = d.getFullYear();
  const ene4 = new Date(anio, 0, 4, 12);
  const sem = 1 + Math.round((((d - ene4) / 86400000) - 3 + ((ene4.getDay() + 6) % 7)) / 7);
  return `${anio}-S${String(sem).padStart(2, '0')}`;
}

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function etiquetaGrupo(clave, modo) {
  if (modo === 'mes') { const [y, m] = clave.split('-'); return `${MESES[parseInt(m, 10)]} ${y}`; }
  if (modo === 'semana') { const [y, s] = clave.split('-S'); return `Semana ${s} (${y})`; }
  if (modo === 'total') return 'Todo el período';
  return new Date(`${clave}T12:00:00`).toLocaleDateString('es-ES');
}

function totalesLinea(l) {
  return { bultos: Number(l.cantidad) || 0, kilos: Number(l.peso) || 0, importe: (Number(l.peso) || 0) * (Number(l.precio) || 0) };
}

async function cargarListado() {
  const f = leerFiltrosListado();
  ocultarAviso('ex-listado-aviso');
  try {
    const params = new URLSearchParams();
    if (f.desde) params.set('desde', f.desde);
    if (f.hasta) params.set('hasta', f.hasta);
    diasListado = await apiGet(`/existencias?${params.toString()}`);
    renderListado();
  } catch (err) {
    mostrarAviso('ex-listado-aviso', '⚠️ ' + err.message, 'error');
  }
}

// Filtra por texto y por si se ven/solo se ven los vendidos — exDatosListado().
function diasFiltradosParaMostrar() {
  const f = leerFiltrosListado();
  const filtroNorm = normalizarTexto(f.filtro);
  const verVendidos = f.verVendidosModo !== 'no';
  const soloVendidos = f.verVendidosModo === 'solo';
  return diasListado
    .map((d) => {
      const lineas2 = (d.lineas || []).filter((l) => {
        if (l.separador) return !filtroNorm;
        if (filtroNorm) {
          const texto = normalizarTexto(`${l.articuloCodigo || ''} ${l.articuloDescripcion || l.descripcionLibre || ''} ${l.nota || ''}`);
          if (!texto.includes(filtroNorm)) return false;
        }
        return soloVendidos ? !!l.vendido : (verVendidos || !l.vendido);
      });
      return { fecha: d.fecha, lineas: lineas2 };
    })
    .filter((d) => d.lineas.length);
}

function renderListado() {
  const cont = document.getElementById('ex-listado');
  const f = leerFiltrosListado();
  const dias = diasFiltradosParaMostrar();
  if (!dias.length) { cont.innerHTML = '<p style="text-align:center;color:#888;padding:16px;">No hay existencias cargadas en esas fechas.</p>'; return; }

  if (f.agrupa !== 'detalle') {
    const grupos = agruparPorModo(dias, f.agrupa);
    let tb = 0, tk = 0, ti = 0;
    const filas = grupos.map((g) => {
      tb += g.bultos; tk += g.kilos; ti += g.importe;
      return `<tr><td>${etiquetaGrupo(g.clave, f.agrupa)}</td><td class="num">${g.dias}</td><td class="num">${g.bultos}</td><td class="num">${fmt(g.kilos)}</td><td class="num">${fmt(g.importe)} €</td></tr>`;
    }).join('');
    cont.innerHTML = `<table class="ex-listado"><thead><tr><th>Período</th><th class="num">Días</th><th class="num">Bultos</th><th class="num">Kilos</th><th class="num">Importe</th></tr></thead><tbody>${filas}</tbody>${grupos.length > 1 ? `<tfoot><tr class="ex-total-general"><td>TOTAL</td><td></td><td class="num">${tb}</td><td class="num">${fmt(tk)}</td><td class="num">${fmt(ti)} €</td></tr></tfoot>` : ''}</table>`;
    return;
  }

  const verVendidos = f.verVendidosModo !== 'no';
  const soloVendidos = f.verVendidosModo === 'solo';
  let totB = 0, totK = 0, totI = 0, penB = 0, penK = 0, penI = 0;
  let html = '<table class="ex-listado"><thead><tr><th style="width:70px;">Bultos</th><th style="width:90px;">Kilos</th><th>Pescado</th><th style="width:90px;">Precio</th><th style="width:110px;">Importe</th><th style="width:62px;">Vendido</th></tr></thead><tbody>';
  for (const d of dias) {
    html += `<tr class="ex-banda"><td colspan="6">${cabeceraDia(d.fecha)}</td></tr>`;
    let dB = 0, dK = 0, dI = 0;
    for (const l of d.lineas) {
      if (l.separador) { html += '<tr><td colspan="6">&nbsp;</td></tr>'; continue; }
      const t = totalesLinea(l);
      const v = !!l.vendido;
      dB += t.bultos; dK += t.kilos; dI += t.importe;
      if (!v) { penB += t.bultos; penK += t.kilos; penI += t.importe; }
      const desc = `${l.articuloDescripcion || l.descripcionLibre || ''}${l.nota ? ' — ' + l.nota : ''}${v ? ' (VENDIDO)' : ''}`;
      html += `<tr class="${v ? 'ex-vendida' : ''}">` +
        `<td class="num"><input type="text" inputmode="decimal" value="${l.cantidad ?? ''}" onchange="editarLineaListado('${d.fecha}',${l.id},'cantidad',this.value)"></td>` +
        `<td class="num"><input type="text" inputmode="decimal" value="${l.peso ?? ''}" title="Puedes sumar: 12,4+8,1" onchange="editarLineaListado('${d.fecha}',${l.id},'peso',this.value)"></td>` +
        `<td>${desc}</td>` +
        `<td class="num">${l.precio != null ? fmt(l.precio) + ' €' : ''}</td>` +
        `<td class="num">${t.importe ? fmt(t.importe) + ' €' : ''}</td>` +
        `<td style="text-align:center;"><input type="checkbox" ${v ? 'checked' : ''} onchange="editarLineaListado('${d.fecha}',${l.id},'vendido',this.checked)"></td></tr>`;
    }
    html += `<tr class="ex-total-dia"><td class="num">${dB}</td><td class="num">${fmt(dK)}</td><td>Total del día</td><td></td><td class="num">${fmt(dI)} €</td><td></td></tr>`;
    totB += dB; totK += dK; totI += dI;
  }
  html += `<tr class="ex-total-general"><td class="num">${totB}</td><td class="num">${fmt(totK)}</td><td>${soloVendidos ? 'TOTAL VENDIDO' : 'TOTAL EXISTENCIAS' + (verVendidos ? ' (con vendidos)' : '')}</td><td></td><td class="num">${fmt(totI)} €</td><td></td></tr>`;
  if (verVendidos && !soloVendidos) {
    html += `<tr class="ex-pendiente"><td class="num">${penB}</td><td class="num">${fmt(penK)}</td><td>QUEDA EN CÁMARA (sin vendidos)</td><td></td><td class="num">${fmt(penI)} €</td><td></td></tr>`;
  }
  html += '</tbody></table>';
  cont.innerHTML = html;
}

function agruparPorModo(dias, modo) {
  const grupos = new Map();
  const orden = [];
  for (const d of dias) {
    const clave = modo === 'semana' ? semanaIso(d.fecha) : (modo === 'mes' ? d.fecha.slice(0, 7) : (modo === 'total' ? 'TOTAL' : d.fecha));
    if (!grupos.has(clave)) { grupos.set(clave, { clave, bultos: 0, kilos: 0, importe: 0, dias: 0 }); orden.push(clave); }
    const g = grupos.get(clave);
    g.dias += 1;
    for (const l of d.lineas) {
      if (l.separador) continue;
      const t = totalesLinea(l);
      g.bultos += t.bultos; g.kilos += t.kilos; g.importe += t.importe;
    }
  }
  return orden.map((c) => grupos.get(c));
}

// Edición directa desde el listado (bultos/kilos/vendido) — exEditarLinea()/
// exMarcarVendido() — PATCH /existencias/:fecha/lineas/:id.
async function editarLineaListado(fecha, lineaId, campo, valor) {
  try {
    await apiPost(`/existencias/${fecha}/lineas/${lineaId}`, { [campo]: valor, puestoOrigen: puestoActual() }, 'PATCH');
    await cargarListado();
  } catch (err) {
    mostrarAviso('ex-listado-aviso', '⚠️ ' + err.message, 'error');
    renderListado();
  }
}

function imprimirListado() {
  const f = leerFiltrosListado();
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Existencias en cámara</title><style>body{font-family:Arial,sans-serif;margin:20px;color:#222;}th{background:#1F4E79;color:white;padding:5px 8px;text-align:left;}td{padding:4px 8px;border-bottom:1px solid #ccc;}tr.ex-banda td{background:#969696;font-weight:700;text-align:center;}tr.ex-vendida td{color:#c00000;background:#fdeaea;}tr.ex-total-dia td,tr.ex-total-general td{font-weight:700;background:#eef;}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>` +
    `<h2 style="text-align:center;margin:0;">EXISTENCIAS</h2><div style="text-align:center;margin:4px 0 8px;">Del ${f.desde} al ${f.hasta}${f.filtro ? ' — solo: ' + f.filtro : ''}</div>` +
    document.getElementById('ex-listado').innerHTML.replace(/<input[^>]*value="([^"]*)"[^>]*>/g, '$1').replace(/<input[^>]*checked[^>]*>/g, 'VENDIDO').replace(/<input[^>]*>/g, '') +
    '</body></html>');
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

function exportarExcel() {
  const f = leerFiltrosListado();
  const params = new URLSearchParams();
  if (f.desde) params.set('desde', f.desde);
  if (f.hasta) params.set('hasta', f.hasta);
  if (f.filtro) params.set('filtro', f.filtro);
  if (f.agrupa) params.set('agrupa', f.agrupa);
  if (f.verVendidosModo !== 'no') params.set('verVendidos', 'true');
  if (f.verVendidosModo === 'solo') params.set('soloVendidos', 'true');
  window.location.href = `/existencias/excel?${params.toString()}`;
}

iniciar();
