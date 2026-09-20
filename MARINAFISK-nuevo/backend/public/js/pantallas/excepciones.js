// Líneas de pedido pendientes de revisión manual (sin partida asignada, o
// con aviso de margen) — la "pantalla de excepciones" que pide FASE_0
// punto 3. Incluye la acción en bloque "reasignar pendientes" (adaptación
// de asignarPartidasDelDia() del HTML actual — ver el comentario en
// backend/src/routes/pedidos.js sobre por qué aquí nunca se fuerza una
// partida sin margen) y la resolución a mano de cada excepción restante.
import { api } from '../api.js';
import { el, euros, numero, mostrarAviso, conBotonDeshabilitado } from '../utilidades.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Excepciones — partidas pendientes de revisar a mano'));
  contenedor.appendChild(el('p', {}, 'Puede que una línea lleve aquí desde que se grabó el pedido y ya haya llegado compra nueva que sí cumpla el margen — "Reasignar pendientes" lo vuelve a comprobar todo de golpe, sin forzar nunca una partida que no llegue al margen mínimo.'));

  const botonReasignar = el('button', { onclick: reasignarPendientes }, '🔁 Reasignar pendientes (comprobar de nuevo con las compras de hoy)');
  contenedor.appendChild(el('div', { class: 'tarjeta' }, botonReasignar));

  const divTabla = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divTabla);

  function pintar(lineas) {
    divTabla.innerHTML = '';
    if (!lineas.length) {
      divTabla.appendChild(el('p', { class: 'vacio' }, '✔ No hay ninguna línea pendiente ahora mismo.'));
      return;
    }
    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Pedido', 'Fecha', 'Artículo', 'Peso', 'Precio', 'Estado', 'Asignar a mano'].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const l of lineas) {
      const celdaAsignar = el('td', {});
      if (l.candidatas && l.candidatas.length) {
        const select = el('select', {}, [
          el('option', { value: '' }, '— elegir partida —'),
          ...l.candidatas.map((c) => el('option', { value: c.numero_partida },
            `${c.numero_partida} · ${String(c.fecha).slice(0, 10)} · coste ${numero(c.coste_medio_kg, 2)}€/kg · margen ${c.margen == null ? '—' : numero(c.margen, 2) + '€'}`)),
        ]);
        const boton = el('button', { class: 'pequeno secundario', onclick: () => asignarAMano(l.id, select.value, boton) }, 'Asignar');
        celdaAsignar.appendChild(select);
        celdaAsignar.appendChild(boton);
      } else {
        celdaAsignar.textContent = '—';
      }
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-etiqueta': 'Pedido' }, String(l.pedido_numero)),
        el('td', { 'data-etiqueta': 'Fecha' }, String(l.pedido_fecha).slice(0, 10)),
        el('td', { 'data-etiqueta': 'Artículo' }, `${l.articulo_codigo_snapshot || ''} ${l.descripcion_snapshot || ''}`),
        el('td', { 'data-etiqueta': 'Peso' }, numero(l.peso, 3)),
        el('td', { 'data-etiqueta': 'Precio' }, euros(l.precio)),
        el('td', { 'data-etiqueta': 'Estado' }, el('span', { class: `badge ${l.estado_asignacion === 'AVISO_MARGEN' ? 'margen' : 'pendiente'}` },
          l.estado_asignacion === 'AVISO_MARGEN' ? '⚠️ sin margen suficiente' : '⚠️ sin compras de este artículo')),
        celdaAsignar,
      ]));
    }
    tabla.appendChild(tbody);
    divTabla.appendChild(tabla);
  }

  async function asignarAMano(lineaId, numeroPartida, boton) {
    if (!numeroPartida) return mostrarAviso(contenedor, 'Elige una partida antes de asignar.', 'error');
    await conBotonDeshabilitado(boton, '⏳', async () => {
      try {
        await api.post(`/api/pedidos/excepciones/${lineaId}/asignar`, { numero_partida: Number(numeroPartida) });
        mostrarAviso(contenedor, 'Partida asignada a mano.', 'ok');
        await cargar();
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }

  async function reasignarPendientes() {
    await conBotonDeshabilitado(botonReasignar, '⏳ Comprobando…', async () => {
      try {
        const r = await api.post('/api/pedidos/excepciones/reasignar', {});
        mostrarAviso(contenedor, `📦 ${r.asignadas} línea(s) asignada(s) automáticamente. ${r.pendientes.length} siguen sin ninguna partida que llegue al margen — elígelas a mano abajo.`, 'ok');
        pintar(r.pendientes);
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }

  async function cargar() {
    const lineas = await api.get('/api/pedidos/excepciones/lista');
    pintar(lineas);
  }
  await cargar();
}

export default { render };
