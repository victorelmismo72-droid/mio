// Pantalla de Repartos (Reparto Super). No lleva IVA ni partida — es un
// envío interno de mercancía ya facturada de otra forma.
import { api, generarUid } from '../api.js';
import { el, numero, fechaHoy, mostrarAviso, conBotonDeshabilitado } from '../utilidades.js';
import { crearCampoArticulo } from './buscadorArticulo.js';
import { abrirVentanaImpresion, mostrarErrorEnVentana } from '../impresion/motor.js';
import { rellenarEtiquetas } from '../impresion/etiquetas.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Repartos (Reparto Super)'));

  const articulos = await api.get('/api/articulos');
  const tarjeta = el('div', { class: 'tarjeta' });
  contenedor.appendChild(tarjeta);

  const campoFecha = el('input', { type: 'date', value: fechaHoy() });
  const campoDestNombre = el('input', { type: 'text', placeholder: 'nombre del destinatario' });
  const campoDestCiudad = el('input', { type: 'text', placeholder: 'ciudad' });
  const campoConductor = el('input', { type: 'text', placeholder: 'conductor (opcional)' });

  tarjeta.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Fecha'), campoFecha]),
    el('div', { class: 'campo' }, [el('label', {}, 'Destinatario'), campoDestNombre]),
    el('div', { class: 'campo' }, [el('label', {}, 'Ciudad'), campoDestCiudad]),
    el('div', { class: 'campo' }, [el('label', {}, 'Conductor'), campoConductor]),
  ]));

  const cuerpoTabla = el('tbody');
  tarjeta.appendChild(el('table', { class: 'lineas-tabla' }, [
    el('thead', {}, el('tr', {}, ['Artículo', 'Lote', 'Cajas', 'Kg', 'Peso etiqueta', ''].map((t) => el('th', {}, t)))),
    cuerpoTabla,
  ]));

  const botonAnadir = el('button', { class: 'secundario', onclick: () => anadirLinea() }, '+ Añadir línea');
  const botonGrabar = el('button', { onclick: grabar }, '💾 Grabar reparto');
  tarjeta.appendChild(el('div', { class: 'fila' }, [botonAnadir, botonGrabar]));

  const filas = [];

  function anadirLinea() {
    const campoArt = crearCampoArticulo(articulos);
    const inputLote = el('input', { type: 'text' });
    const inputCajas = el('input', { type: 'number', step: 'any' });
    const inputKg = el('input', { type: 'number', step: 'any' });
    const inputPesoEtiqueta = el('input', { type: 'text', placeholder: 'vacío = VER CAJA' });
    campoArt.input.addEventListener('change', () => {
      const art = campoArt.obtener();
      if (art) { fila.barco = art.barco; fila.subzona = art.subzona; fila.artePesca = art.arte_pesca; }
    });
    const fila = { campoArt, inputLote, inputCajas, inputKg, inputPesoEtiqueta, barco: null, subzona: null, artePesca: null };
    const botonQuitar = el('button', { class: 'pequeno peligro', onclick: () => { tr.remove(); filas.splice(filas.indexOf(fila), 1); } }, '✕');
    const tr = el('tr', {}, [
      el('td', {}, [campoArt.input, campoArt.datalist]), el('td', {}, inputLote),
      el('td', {}, inputCajas), el('td', {}, inputKg), el('td', {}, inputPesoEtiqueta),
      el('td', {}, botonQuitar),
    ]);
    cuerpoTabla.appendChild(tr);
    filas.push(fila);
  }

  async function grabar() {
    if (!campoDestNombre.value) return mostrarAviso(contenedor, 'Falta el destinatario.', 'error');
    if (!filas.length) return mostrarAviso(contenedor, 'Añade al menos una línea.', 'error');
    const lineas = filas.map((f) => {
      const art = f.campoArt.obtener();
      return {
        articulo_id: art ? art.id : null, articulo_codigo_snapshot: art ? art.codigo : null,
        descripcion_snapshot: art ? art.descripcion : null, lote: f.inputLote.value || null,
        barco: f.barco, subzona: f.subzona, arte_pesca: f.artePesca,
        cajas: Number(f.inputCajas.value) || null, kg: Number(f.inputKg.value) || null,
        peso_etiqueta: f.inputPesoEtiqueta.value || null,
      };
    });
    const totalCajas = lineas.reduce((s, l) => s + (Number(l.cajas) || 0), 0);
    const totalKg = lineas.reduce((s, l) => s + (Number(l.kg) || 0), 0);

    await conBotonDeshabilitado(botonGrabar, '⏳ Grabando…', async () => {
      try {
        const reparto = await api.post('/api/repartos', {
          uid: generarUid(), fecha: campoFecha.value, destinatario_nombre: campoDestNombre.value,
          destinatario_ciudad: campoDestCiudad.value || null, conductor: campoConductor.value || null,
          total_cajas: totalCajas, total_kg: totalKg, lineas,
        });
        mostrarAviso(contenedor, `Reparto nº ${reparto.numero} grabado.`, 'ok');
        cuerpoTabla.innerHTML = ''; filas.length = 0;
        campoDestNombre.value = ''; campoDestCiudad.value = ''; campoConductor.value = '';
        await cargarRecientes();
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }

  anadirLinea();

  contenedor.appendChild(el('h3', {}, 'Repartos recientes'));
  const divRecientes = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divRecientes);

  async function cargarRecientes() {
    const repartos = await api.get('/api/repartos');
    divRecientes.innerHTML = '';
    if (!repartos.length) { divRecientes.appendChild(el('p', { class: 'vacio' }, 'No hay repartos todavía.')); return; }
    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Nº', 'Fecha', 'Destinatario', 'Cajas', 'Kg', ''].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const r of repartos.slice(0, 30)) {
      const botonEtiquetas = el('button', { class: 'pequeno secundario', onclick: () => imprimirEtiquetasReparto(r.id) }, '🏷️ Etiquetas');
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-etiqueta': 'Nº' }, String(r.numero)),
        el('td', { 'data-etiqueta': 'Fecha' }, String(r.fecha).slice(0, 10)),
        el('td', { 'data-etiqueta': 'Destinatario' }, `${r.destinatario_nombre || ''} ${r.destinatario_ciudad ? '(' + r.destinatario_ciudad + ')' : ''}`),
        el('td', { 'data-etiqueta': 'Cajas' }, numero(r.total_cajas, 0)),
        el('td', { 'data-etiqueta': 'Kg' }, numero(r.total_kg, 3)),
        el('td', {}, botonEtiquetas),
      ]));
    }
    tabla.appendChild(tbody);
    divRecientes.appendChild(tabla);
  }

  // Si el reparto ya se había impreso antes Y ahora hay más cajas que la
  // última vez (se añadieron líneas/cajas), pregunta qué imprimir — igual
  // que ejecutarImpresionReparto() del HTML actual. Si no hay ese conflicto,
  // imprime "todas" directamente sin preguntar nada.
  async function imprimirEtiquetasReparto(repartoId) {
    let reparto;
    try {
      reparto = await api.get(`/api/repartos/${repartoId}`);
    } catch (err) { return mostrarAviso(contenedor, err.message, 'error'); }

    const conAlgoYaImpreso = reparto.lineas.some((l) => (Number(l.cajas_impresas) || 0) > 0);
    const conAlgoNuevo = reparto.lineas.some((l) => (Number(l.cajas) || 0) > (Number(l.cajas_impresas) || 0));
    let modo = 'todas';
    if (conAlgoYaImpreso && conAlgoNuevo) {
      modo = confirm('Este reparto ya se había impreso, y parece que se han añadido cajas desde la última vez.\n\nAceptar = imprimir solo lo nuevo.\nCancelar = imprimir todo otra vez.') ? 'nuevas' : 'todas';
    }

    const ventana = abrirVentanaImpresion('Etiquetas');
    if (!ventana) return;
    (async () => {
      try {
        const resultado = await api.get(`/api/repartos/${repartoId}/etiquetas?modo=${modo}`);
        rellenarEtiquetas(ventana, resultado);
        await api.post(`/api/repartos/${repartoId}/marcar-etiquetas-impresas`, {});
      } catch (err) {
        mostrarErrorEnVentana(ventana, err.message);
        mostrarAviso(contenedor, err.message, 'error');
      }
    })();
  }
  await cargarRecientes();
}

export default { render };
