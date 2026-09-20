// Listado de gestión: ventas por artículo y fecha, con los traspasos
// internos a Zaragoza SIEMPRE aparte (corrección 02/09/2026 punto 3,
// FASE_2 punto 5bis) — nunca mezclados en silencio con una venta real,
// porque un traspaso no es una venta a efectos contables. Por defecto solo
// se ven ventas; la casilla "incluir traspasos" los añade como categoría
// claramente diferenciada, con su propio total de kilos (sin importe).
import { api } from '../api.js';
import { el, euros, numero, mostrarAviso } from '../utilidades.js';
import { crearCampoArticulo } from './buscadorArticulo.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Listados de gestión — ventas por artículo y fecha'));

  const articulos = await api.get('/api/articulos');
  const tarjeta = el('div', { class: 'tarjeta' });
  contenedor.appendChild(tarjeta);

  const campoDesde = el('input', { type: 'date' });
  const campoHasta = el('input', { type: 'date' });
  const campoArticulo = crearCampoArticulo(articulos);
  const casillaTraspasos = el('input', { type: 'checkbox', id: 'incluir-traspasos' });
  const botonBuscar = el('button', { onclick: () => buscar() }, 'Buscar');

  tarjeta.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Desde'), campoDesde]),
    el('div', { class: 'campo' }, [el('label', {}, 'Hasta'), campoHasta]),
    el('div', { class: 'campo' }, [el('label', {}, 'Artículo (vacío = todos)'), campoArticulo.input, campoArticulo.datalist]),
    el('div', { class: 'campo' }, [
      el('label', {}, [casillaTraspasos, ' Incluir también los traspasos internos a Zaragoza']),
    ]),
    botonBuscar,
  ]));

  const divResultado = el('div', {}, el('p', { class: 'vacio' }, 'Elige un rango de fechas (o déjalo vacío para todo) y pulsa Buscar.'));
  contenedor.appendChild(divResultado);

  async function buscar() {
    const params = new URLSearchParams();
    if (campoDesde.value) params.set('desde', campoDesde.value);
    if (campoHasta.value) params.set('hasta', campoHasta.value);
    const articulo = campoArticulo.obtener();
    if (articulo) params.set('articulo_id', articulo.id);
    if (casillaTraspasos.checked) params.set('incluir_traspasos', '1');

    divResultado.innerHTML = '';
    divResultado.appendChild(el('p', { class: 'cargando' }, 'Cargando…'));
    let datos;
    try {
      datos = await api.get(`/api/listados/ventas-articulo?${params.toString()}`);
    } catch (err) {
      divResultado.innerHTML = '';
      mostrarAviso(contenedor, err.message, 'error');
      return;
    }
    pintar(datos);
  }

  function pintar({ lineas, totales }) {
    divResultado.innerHTML = '';
    if (!lineas.length) { divResultado.appendChild(el('p', { class: 'vacio' }, 'No hay movimientos con ese filtro.')); return; }

    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Fecha', 'Nº', 'Cliente / destino', 'Artículo', 'Cajas', 'Kg', 'Importe'].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const l of lineas) {
      const esTraspaso = l.tipo === 'traspaso';
      tbody.appendChild(el('tr', { class: esTraspaso ? 'fila-traspaso' : '' }, [
        el('td', { 'data-etiqueta': 'Fecha' }, String(l.fecha).slice(0, 10)),
        el('td', { 'data-etiqueta': 'Nº' }, String(l.documento_numero)),
        el('td', { 'data-etiqueta': 'Cliente / destino' }, esTraspaso ? l.etiqueta : (l.cliente_nombre || '')),
        el('td', { 'data-etiqueta': 'Artículo' }, `${l.articulo_codigo || ''} — ${l.descripcion || ''}`),
        el('td', { 'data-etiqueta': 'Cajas' }, numero(l.cajas, 0)),
        el('td', { 'data-etiqueta': 'Kg' }, numero(l.peso, 3)),
        el('td', { 'data-etiqueta': 'Importe' }, esTraspaso ? '—' : euros(l.importe)),
      ]));
    }
    tabla.appendChild(tbody);
    divResultado.appendChild(tabla);

    // Los tres totales que pide el punto 5bis — siempre en líneas
    // separadas, nunca sumados como si el traspaso fuera una venta más.
    const divTotales = el('div', { class: 'tarjeta' });
    divTotales.appendChild(el('p', {}, el('strong', {}, `Ventas reales: ${numero(totales.ventas_kg, 3)} kg — ${euros(totales.ventas_importe)}`)));
    if (totales.traspasos_kg || document.getElementById('incluir-traspasos').checked) {
      divTotales.appendChild(el('p', {}, `Traspasado a Zaragoza (interno, no es venta): ${numero(totales.traspasos_kg, 3)} kg`));
      divTotales.appendChild(el('p', {}, el('em', {}, `Total pescado movido (solo estadística de volumen): ${numero(totales.total_movido_kg, 3)} kg`)));
    }
    divResultado.appendChild(divTotales);
  }
}

export default { render };
