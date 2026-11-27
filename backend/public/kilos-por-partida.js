// "Kilos vendidos y pendientes por partida" (ver Fase 2 punto 4,
// actualización 24/11/2026) — informe de solo lectura: todo el cálculo
// (comprados/vendidos/traspasos/pendiente/vendido de más) lo hace el
// servidor (backend/src/margenPartida.js, calcularKilosPorPartida), aquí
// solo se piden los filtros y se pinta la respuesta.

async function iniciar() {
  pintarBotonPuesto('btn-puesto');
  ['f-producto', 'f-partida', 'f-desde', 'f-hasta', 'f-solopend', 'f-soloexceso'].forEach((id) => {
    document.getElementById(id).addEventListener('input', cargar);
    document.getElementById(id).addEventListener('change', cargar);
  });
  document.getElementById('btn-excel').addEventListener('click', exportarExcel);
  await cargar();
}

function leerFiltros() {
  return {
    producto: document.getElementById('f-producto').value.trim(),
    partida: document.getElementById('f-partida').value.trim(),
    desde: document.getElementById('f-desde').value,
    hasta: document.getElementById('f-hasta').value,
    soloPendiente: document.getElementById('f-solopend').checked,
    soloExceso: document.getElementById('f-soloexceso').checked,
  };
}

function paramsDe(f) {
  const params = new URLSearchParams();
  if (f.producto) params.set('producto', f.producto);
  if (f.partida) params.set('partida', f.partida);
  if (f.desde) params.set('desde', f.desde);
  if (f.hasta) params.set('hasta', f.hasta);
  if (f.soloPendiente) params.set('soloPendiente', 'true');
  if (f.soloExceso) params.set('soloExceso', 'true');
  return params;
}

async function cargar() {
  const f = leerFiltros();
  try {
    const resp = await apiGet(`/listados/kilos-por-partida?${paramsDe(f).toString()}`);
    render(resp.filas);
  } catch (err) {
    mostrarAviso('kpp-aviso', '⚠️ ' + err.message, 'error');
  }
}

function render(filas) {
  const tbody = document.getElementById('kpp-body');
  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#888;padding:16px;">No hay partidas con ese filtro.</td></tr>';
  } else {
    tbody.innerHTML = filas.map((g) => `
      <tr>
        <td style="font-weight:700;">${g.numeroPartida}</td>
        <td>${g.fecha ? new Date(g.fecha).toLocaleDateString('es-ES') : ''}</td>
        <td title="${g.proveedorNombre}">${g.proveedorNombre}</td>
        <td>${g.articuloCodigo}</td>
        <td>${g.articuloDescripcion}</td>
        <td class="num">${fmt(g.comprados)}${g.mermaKg ? `<div class="merma-nota">− ${fmt(g.mermaKg)} ${g.mermaMotivo} ${g.mermaPct}%</div>` : ''}</td>
        <td class="num">${fmt(g.vendidos)}</td>
        <td class="num">${fmt(g.traspasos)}</td>
        <td class="num pendiente">${g.pendiente ? fmt(g.pendiente) : ''}</td>
        <td class="num exceso">${g.vendidoDeMas ? fmt(g.vendidoDeMas) : ''}</td>
        <td>${g.cerrada ? '🔒' : ''}</td>
      </tr>`).join('');
  }

  const sum = (campo) => filas.reduce((s, g) => s + (Number(g[campo]) || 0), 0);
  document.getElementById('kpp-tot-comprados').textContent = fmt(sum('comprados'));
  document.getElementById('kpp-tot-vendidos').textContent = fmt(sum('vendidos'));
  document.getElementById('kpp-tot-traspasos').textContent = fmt(sum('traspasos'));
  document.getElementById('kpp-tot-pendiente').textContent = fmt(sum('pendiente'));
  document.getElementById('kpp-tot-exceso').textContent = fmt(sum('vendidoDeMas'));
  document.getElementById('kpp-resumen').textContent = `${filas.length} partida${filas.length === 1 ? '' : 's'}/producto`;
}

function exportarExcel() {
  const f = leerFiltros();
  window.location.href = `/listados/kilos-por-partida/excel?${paramsDe(f).toString()}`;
}

iniciar();
