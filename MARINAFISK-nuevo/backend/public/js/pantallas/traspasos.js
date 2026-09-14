// Pantalla de Traspasos (movimiento interno a Zaragoza). No lleva IVA — el
// total es una copia de la base, igual que en el HTML actual.
import { api, generarUid } from '../api.js';
import { el, euros, numero, fechaHoy, mostrarAviso, conBotonDeshabilitado } from '../utilidades.js';
import { crearCampoArticulo } from './buscadorArticulo.js';
import { imprimirSobrePapel } from '../impresion/motor.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Traspasos internos (a Zaragoza)'));

  const articulos = await api.get('/api/articulos');
  const tarjeta = el('div', { class: 'tarjeta' });
  contenedor.appendChild(tarjeta);

  const campoFecha = el('input', { type: 'date', value: fechaHoy() });
  tarjeta.appendChild(el('div', { class: 'fila' }, [el('div', { class: 'campo' }, [el('label', {}, 'Fecha'), campoFecha])]));

  const cuerpoTabla = el('tbody');
  tarjeta.appendChild(el('table', { class: 'lineas-tabla' }, [
    el('thead', {}, el('tr', {}, ['Artículo', 'Cajas', 'Peso (kg)', 'Precio €/kg', 'Total', 'Partida (opcional)', ''].map((t) => el('th', {}, t)))),
    cuerpoTabla,
  ]));
  const pieTotales = el('p', {}, '');
  tarjeta.appendChild(pieTotales);

  const botonAnadir = el('button', { class: 'secundario', onclick: () => anadirLinea() }, '+ Añadir línea');
  const botonGrabar = el('button', { onclick: grabar }, '💾 Grabar traspaso');
  tarjeta.appendChild(el('div', { class: 'fila' }, [botonAnadir, botonGrabar]));

  const filas = [];

  function actualizarTotales() {
    const base = filas.reduce((s, f) => s + (Number(f.inputPeso.value) || 0) * (Number(f.inputPrecio.value) || 0), 0);
    pieTotales.textContent = base ? `Total: ${euros(base)}` : '';
  }

  function anadirLinea() {
    const campoArt = crearCampoArticulo(articulos);
    const inputCajas = el('input', { type: 'number', step: 'any' });
    const inputPeso = el('input', { type: 'number', step: 'any' });
    const inputPrecio = el('input', { type: 'number', step: 'any' });
    const inputPartida = el('input', { type: 'number', placeholder: 'nº partida' });
    const celdaTotal = el('td', {}, '—');
    inputPeso.addEventListener('input', actualizar);
    inputPrecio.addEventListener('input', actualizar);
    function actualizar() {
      const total = (Number(inputPeso.value) || 0) * (Number(inputPrecio.value) || 0);
      celdaTotal.textContent = total ? euros(total) : '—';
      actualizarTotales();
    }
    const fila = { campoArt, inputCajas, inputPeso, inputPrecio, inputPartida };
    const botonQuitar = el('button', { class: 'pequeno peligro', onclick: () => { tr.remove(); filas.splice(filas.indexOf(fila), 1); actualizarTotales(); } }, '✕');
    const tr = el('tr', {}, [
      el('td', {}, [campoArt.input, campoArt.datalist]), el('td', {}, inputCajas), el('td', {}, inputPeso),
      el('td', {}, inputPrecio), celdaTotal, el('td', {}, inputPartida), el('td', {}, botonQuitar),
    ]);
    cuerpoTabla.appendChild(tr);
    filas.push(fila);
  }

  async function grabar() {
    if (!filas.length) return mostrarAviso(contenedor, 'Añade al menos una línea.', 'error');
    const lineas = filas.map((f) => {
      const art = f.campoArt.obtener();
      const peso = Number(f.inputPeso.value) || 0;
      const precio = Number(f.inputPrecio.value) || 0;
      return {
        articulo_id: art ? art.id : null, articulo_codigo_snapshot: art ? art.codigo : null,
        descripcion_snapshot: art ? art.descripcion : null,
        cajas: Number(f.inputCajas.value) || null, peso, precio, total: peso * precio,
        partida_texto: f.inputPartida.value || null, numero_partida: f.inputPartida.value ? Number(f.inputPartida.value) : null,
      };
    });
    const totalKg = lineas.reduce((s, l) => s + l.peso, 0);
    const base = lineas.reduce((s, l) => s + l.total, 0);

    await conBotonDeshabilitado(botonGrabar, '⏳ Grabando…', async () => {
      try {
        const traspaso = await api.post('/api/traspasos', {
          uid: generarUid(), fecha: campoFecha.value, total_kg: totalKg, base, total: base, lineas,
        });
        mostrarAviso(contenedor, `Traspaso nº ${traspaso.numero} grabado.`, 'ok');
        cuerpoTabla.innerHTML = ''; filas.length = 0; pieTotales.textContent = '';
        await cargarRecientes();
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }

  anadirLinea();

  contenedor.appendChild(el('h3', {}, 'Traspasos recientes'));
  const divRecientes = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divRecientes);

  async function cargarRecientes() {
    const traspasos = await api.get('/api/traspasos');
    divRecientes.innerHTML = '';
    if (!traspasos.length) { divRecientes.appendChild(el('p', { class: 'vacio' }, 'No hay traspasos todavía.')); return; }
    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Nº', 'Fecha', 'Kg', 'Total', ''].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const t of traspasos.slice(0, 30)) {
      const botonTransfrio = el('button', { class: 'pequeno secundario', onclick: () => imprimirTransfrio(t.id) }, '🚚 Transfrío');
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-etiqueta': 'Nº' }, String(t.numero)),
        el('td', { 'data-etiqueta': 'Fecha' }, String(t.fecha).slice(0, 10)),
        el('td', { 'data-etiqueta': 'Kg' }, numero(t.total_kg, 3)),
        el('td', { 'data-etiqueta': 'Total' }, euros(t.total)),
        el('td', {}, botonTransfrio),
      ]));
    }
    tabla.appendChild(tbody);
    divRecientes.appendChild(tabla);
  }
  async function imprimirTransfrio(traspasoId) {
    try {
      const modelo = await api.get('/api/modelos-impresion/transfrio');
      const datos = await api.get(`/api/traspasos/imprimir?ids=${traspasoId}&modelo=transfrio`);
      imprimirSobrePapel({ titulo: modelo.nombre, modelo, listaValores: datos.map((d) => d.valores) });
    } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
  }

  await cargarRecientes();
}

export default { render };
