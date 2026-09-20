import { api } from '../api.js';
import { el, numero, mostrarAviso } from '../utilidades.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Partidas'));
  contenedor.appendChild(el('p', {}, 'Kilos disponibles calculados en vivo (comprado − vendido) — nunca es un número guardado fijo.'));

  const divTabla = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divTabla);

  async function cargar() {
    const partidas = await api.get('/api/partidas');
    divTabla.innerHTML = '';
    if (!partidas.length) { divTabla.appendChild(el('p', { class: 'vacio' }, 'No hay partidas todavía.')); return; }
    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Partida', 'Comprado (kg)', 'Vendido (kg)', 'Disponible (kg)', 'Cerrada', ''].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const p of partidas) {
      const boton = p.cerrada_manual
        ? el('button', { class: 'pequeno secundario', onclick: () => accion(p.numero_partida, 'reabrir') }, 'Reabrir')
        : el('button', { class: 'pequeno peligro', onclick: () => accion(p.numero_partida, 'cerrar') }, 'Cerrar');
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-etiqueta': 'Partida' }, String(p.numero_partida)),
        el('td', { 'data-etiqueta': 'Comprado' }, numero(p.kilos_comprados, 3)),
        el('td', { 'data-etiqueta': 'Vendido' }, numero(p.kilos_vendidos, 3)),
        el('td', { 'data-etiqueta': 'Disponible' }, numero(p.kilos_disponibles, 3)),
        el('td', { 'data-etiqueta': 'Cerrada' }, p.cerrada_manual ? 'Sí' : 'No'),
        el('td', {}, boton),
      ]));
    }
    tabla.appendChild(tbody);
    divTabla.appendChild(tabla);
  }

  async function accion(numeroPartida, cual) {
    try {
      await api.post(`/api/partidas/${numeroPartida}/${cual}`, {});
      await cargar();
    } catch (err) {
      mostrarAviso(contenedor, err.message, 'error');
    }
  }

  await cargar();
}

export default { render };
