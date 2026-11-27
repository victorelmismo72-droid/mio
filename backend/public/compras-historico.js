// Histórico de Compras — filtros, edición en sitio (partida/alb.proveedor/
// cajas/kilos/€-kg/control) y anular, igual que el histórico del HTML real
// (ver RESUMEN_COMPLETO_para_Code_18-11-2026_5.md y el HTML real,
// obtenerComprasFiltradas/lineaPasaFiltroCompras/filtrarCompras). El
// filtrado y el orden se hacen aquí igual que en el HTML (en memoria,
// sobre todas las compras ya traídas) — la exportación a Excel manda los
// mismos filtros al servidor para generar el fichero con ExcelJS (ver
// backend/README.md, nota de seguridad sobre SheetJS/"xlsx").

let compras = [];

async function iniciar() {
  pintarBotonPuesto('btn-puesto');
  await cargar();

  ['f-partida', 'f-albprov', 'f-proveedor', 'f-producto', 'f-desde', 'f-hasta', 'f-control', 'f-orden'].forEach((id) => {
    document.getElementById(id).addEventListener('input', render);
    document.getElementById(id).addEventListener('change', render);
  });
  document.getElementById('btn-limpiar').addEventListener('click', () => {
    ['f-partida', 'f-albprov', 'f-proveedor', 'f-producto', 'f-desde', 'f-hasta'].forEach((id) => { document.getElementById(id).value = ''; });
    document.getElementById('f-control').value = '';
    document.getElementById('f-orden').value = 'fecha';
    render();
  });
  document.getElementById('btn-excel').addEventListener('click', exportarExcel);
}

async function cargar() {
  try {
    compras = await apiGet('/compras');
    render();
  } catch (err) {
    mostrarAviso('cp-aviso', '⚠️ No se ha podido conectar con el servidor: ' + err.message, 'error');
  }
}

function leerFiltros() {
  return {
    partida: document.getElementById('f-partida').value.trim(),
    albProveedor: document.getElementById('f-albprov').value.trim().toLowerCase(),
    proveedor: document.getElementById('f-proveedor').value.trim().toLowerCase(),
    producto: document.getElementById('f-producto').value.trim().toLowerCase(),
    desde: document.getElementById('f-desde').value,
    hasta: document.getElementById('f-hasta').value,
    control: document.getElementById('f-control').value,
    orden: document.getElementById('f-orden').value,
  };
}

// Mismo filtro que filasCompraFiltradas() en backend/src/routes/compras.js
// (duplicado a propósito, igual que el HTML real filtra en el propio
// navegador — la versión del servidor solo existe para que la exportación
// a Excel pueda generar el fichero con los mismos criterios).
function filasFiltradas(f) {
  const filas = [];
  for (const c of compras) {
    if (f.partida && !String(c.numeroPartida).includes(f.partida)) continue;
    if (f.albProveedor && !String(c.albaranProveedor || '').toLowerCase().includes(f.albProveedor)) continue;
    if (f.proveedor && !(String(c.proveedor?.codigo || '').toLowerCase().includes(f.proveedor) || String(c.proveedorNombreSnapshot || '').toLowerCase().includes(f.proveedor))) continue;
    if (f.desde && c.fecha.slice(0, 10) < f.desde) continue;
    if (f.hasta && c.fecha.slice(0, 10) > f.hasta) continue;
    for (const l of c.lineas) {
      if (f.producto && !(String(l.articulo?.codigo || '').toLowerCase().includes(f.producto) || String(l.articulo?.descripcion || '').toLowerCase().includes(f.producto))) continue;
      if (f.control === 'si' && !l.control) continue;
      if (f.control === 'no' && l.control) continue;
      filas.push({ compra: c, linea: l });
    }
  }
  const porFecha = (a, b) => (b.compra.fecha < a.compra.fecha ? -1 : b.compra.fecha > a.compra.fecha ? 1 : 0) || (b.compra.numeroPartida - a.compra.numeroPartida);
  if (f.orden === 'partida-desc') filas.sort((a, b) => (b.compra.numeroPartida - a.compra.numeroPartida) || porFecha(a, b));
  else if (f.orden === 'partida-asc') filas.sort((a, b) => (a.compra.numeroPartida - b.compra.numeroPartida) || porFecha(a, b));
  else if (f.orden === 'importe-desc') filas.sort((a, b) => (Number(b.linea.totalFactura) - Number(a.linea.totalFactura)) || porFecha(a, b));
  else if (f.orden === 'importe-asc') filas.sort((a, b) => (Number(a.linea.totalFactura) - Number(b.linea.totalFactura)) || porFecha(a, b));
  else filas.sort(porFecha);
  return filas;
}

function render() {
  const f = leerFiltros();
  const filas = filasFiltradas(f);
  const tbody = document.getElementById('cp-body');

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;color:#888;padding:16px;">No hay compras con ese filtro.</td></tr>';
  } else {
    const html = [];
    let ultimaFecha = null;
    const pintarBandas = f.orden === 'fecha';
    filas.forEach(({ compra: c, linea: l }) => {
      if (pintarBandas && c.fecha !== ultimaFecha) {
        ultimaFecha = c.fecha;
        html.push(`<tr class="banda-dia"><td colspan="16">${new Date(c.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</td></tr>`);
      }
      html.push(filaHtml(c, l));
    });
    tbody.innerHTML = html.join('');

    filas.forEach(({ compra: c, linea: l }) => {
      const partidaIn = document.getElementById(`part_${c.id}`);
      if (partidaIn) partidaIn.addEventListener('change', () => guardarCabecera(c.id, { numeroPartida: Number(partidaIn.value) }));
      const albIn = document.getElementById(`alb_${c.id}`);
      if (albIn) albIn.addEventListener('change', () => guardarCabecera(c.id, { albaranProveedor: albIn.value.trim() || null }));
      if (!c.anulada) {
        document.getElementById(`caj_${l.id}`).addEventListener('change', (e) => guardarLinea(c.id, l.id, { cajas: e.target.value === '' ? null : Number(e.target.value) }));
        document.getElementById(`kg_${l.id}`).addEventListener('change', (e) => guardarLinea(c.id, l.id, { kilos: e.target.value }));
        document.getElementById(`pr_${l.id}`).addEventListener('change', (e) => guardarLinea(c.id, l.id, { precioKg: e.target.value }));
        document.getElementById(`ctl_${l.id}`).addEventListener('change', (e) => guardarLinea(c.id, l.id, { control: e.target.checked }));
        document.getElementById(`anular_${c.id}`).addEventListener('click', () => anular(c.id));
      }
    });
  }

  let kilos = 0, base = 0, iva = 0, total = 0;
  filas.forEach(({ linea: l }) => { kilos += Number(l.kilos) || 0; base += Number(l.baseReal) || 0; iva += Number(l.ivaImporte) || 0; total += Number(l.totalFactura) || 0; });
  document.getElementById('cp-tot-lineas').textContent = filas.length;
  document.getElementById('cp-tot-kilos').textContent = fmt(kilos);
  document.getElementById('cp-tot-base').textContent = fmt(base);
  document.getElementById('cp-tot-iva').textContent = fmt(iva);
  document.getElementById('cp-tot-total').textContent = fmt(total);
  document.getElementById('cp-resumen').textContent = `${filas.length} línea${filas.length === 1 ? '' : 's'}`;
}

function filaHtml(c, l) {
  const anuladaClase = c.anulada ? ' anulada' : '';
  const soloLectura = c.anulada ? 'disabled' : '';
  return `<tr class="${anuladaClase.trim()}">
    <td class="col-partida"><input type="number" id="part_${c.id}" value="${c.numeroPartida}" min="1" ${soloLectura}></td>
    <td>${new Date(c.fecha).toLocaleDateString('es-ES')}</td>
    <td class="col-alb"><input type="text" id="alb_${c.id}" value="${c.albaranProveedor || ''}" ${soloLectura}></td>
    <td>${c.proveedor?.codigo || ''}</td>
    <td>${c.proveedorNombreSnapshot || ''}</td>
    <td title="${l.articulo?.descripcion || ''}">${l.articulo?.codigo || ''} — ${l.articulo?.descripcion || ''}</td>
    <td class="col-mini"><input type="number" id="caj_${l.id}" value="${l.cajas ?? ''}" min="0" ${soloLectura}></td>
    <td class="col-mini"><input type="text" id="kg_${l.id}" value="${l.kilos}" ${soloLectura}></td>
    <td class="col-mini"><input type="number" id="pr_${l.id}" value="${l.precioKg}" step="0.001" min="0" ${soloLectura}></td>
    <td class="num">${fmt(l.baseZgz)}</td>
    <td class="num">${fmt(l.op2Importe)}</td>
    <td class="num">${fmt(l.baseReal)}</td>
    <td class="num">${fmt(l.ivaImporte)}</td>
    <td class="num" style="font-weight:700;">${fmt(l.totalFactura)}</td>
    <td style="text-align:center;"><input type="checkbox" id="ctl_${l.id}" ${l.control ? 'checked' : ''} ${soloLectura}></td>
    <td>${c.anulada ? '<span style="color:var(--rojo);font-weight:700;">ANULADA</span>' : `<button class="btn btn-peligro btn-mini" id="anular_${c.id}" type="button">Anular</button>`}</td>
  </tr>`;
}

async function guardarCabecera(compraId, cambios) {
  try {
    await apiPost(`/compras/${compraId}`, { ...cambios, puestoOrigen: puestoActual() }, 'PUT');
    mostrarAviso('cp-aviso', '✅ Guardado.', 'exito');
    await cargar();
  } catch (err) {
    mostrarAviso('cp-aviso', '⚠️ ' + err.message, 'error');
    await cargar();
  }
}

async function guardarLinea(compraId, lineaId, cambios) {
  try {
    await apiPost(`/compras/${compraId}/lineas/${lineaId}`, { ...cambios, puestoOrigen: puestoActual() }, 'PUT');
    mostrarAviso('cp-aviso', '✅ Guardado.', 'exito');
    await cargar();
  } catch (err) {
    mostrarAviso('cp-aviso', '⚠️ ' + err.message, 'error');
    await cargar();
  }
}

async function anular(compraId) {
  if (!confirm('¿Anular esta compra? No se podrá editar después (quedará marcada, nunca se borra).')) return;
  try {
    await apiPost(`/compras/${compraId}/anular`, { anuladaPor: puestoActual(), puestoOrigen: puestoActual() });
    mostrarAviso('cp-aviso', '✅ Compra anulada.', 'exito');
    await cargar();
  } catch (err) {
    mostrarAviso('cp-aviso', '⚠️ ' + err.message, 'error');
  }
}

function exportarExcel() {
  const f = leerFiltros();
  const params = new URLSearchParams();
  if (f.partida) params.set('partida', f.partida);
  if (f.albProveedor) params.set('albProveedor', f.albProveedor);
  if (f.proveedor) params.set('proveedor', f.proveedor);
  if (f.producto) params.set('producto', f.producto);
  if (f.desde) params.set('desde', f.desde);
  if (f.hasta) params.set('hasta', f.hasta);
  if (f.control) params.set('control', f.control);
  if (f.orden) params.set('orden', f.orden);
  window.location.href = `/compras/exportar-excel?${params.toString()}`;
}

iniciar();
