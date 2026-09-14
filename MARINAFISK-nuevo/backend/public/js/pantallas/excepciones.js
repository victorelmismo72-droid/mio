// Líneas de pedido pendientes de revisión manual (sin partida asignada, o
// con aviso de margen) — la "pantalla de excepciones" que pide FASE_0
// punto 3. De momento es de solo lectura: para resolver una, hay que volver
// a grabar esa línea en Pedidos (con una partida elegida a mano). Una
// edición en el sitio se puede añadir más adelante si hace falta.
import { api } from '../api.js';
import { el, euros, numero } from '../utilidades.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Excepciones — partidas pendientes de revisar a mano'));

  const divTabla = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divTabla);

  const lineas = await api.get('/api/pedidos/excepciones/lista');
  divTabla.innerHTML = '';
  if (!lineas.length) {
    divTabla.appendChild(el('p', { class: 'vacio' }, '✔ No hay ninguna línea pendiente ahora mismo.'));
    return;
  }
  const tabla = el('table');
  tabla.appendChild(el('thead', {}, el('tr', {}, ['Pedido', 'Fecha', 'Artículo', 'Peso', 'Precio', 'Estado'].map((t) => el('th', {}, t)))));
  const tbody = el('tbody');
  for (const l of lineas) {
    tbody.appendChild(el('tr', {}, [
      el('td', { 'data-etiqueta': 'Pedido' }, String(l.pedido_numero)),
      el('td', { 'data-etiqueta': 'Fecha' }, String(l.pedido_fecha).slice(0, 10)),
      el('td', { 'data-etiqueta': 'Artículo' }, `${l.articulo_codigo_snapshot || ''} ${l.descripcion_snapshot || ''}`),
      el('td', { 'data-etiqueta': 'Peso' }, numero(l.peso, 3)),
      el('td', { 'data-etiqueta': 'Precio' }, euros(l.precio)),
      el('td', { 'data-etiqueta': 'Estado' }, el('span', { class: `badge ${l.estado_asignacion === 'AVISO_MARGEN' ? 'margen' : 'pendiente'}` },
        l.estado_asignacion === 'AVISO_MARGEN' ? '⚠️ sin margen suficiente' : '⚠️ sin compras de este artículo')),
    ]));
  }
  tabla.appendChild(tbody);
  divTabla.appendChild(tabla);
}

export default { render };
