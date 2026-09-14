// Listas de precio: modo AUTO (vista previa desde las compras del día) y
// modo MANUAL (con aviso en vivo si el precio queda por debajo del coste
// real de partida — corrección 02/09/2026 puntos 4 y 5 — y existencias en
// texto libre, no solo números).
import { api } from '../api.js';
import { el, euros, numero, fechaHoy, debounce, mostrarAviso, conBotonDeshabilitado } from '../utilidades.js';
import { crearCampoArticulo } from './buscadorArticulo.js';

const TIPOS = [
  { valor: 'PESCADERIAS', etiqueta: 'Pescaderías (precio en destino)' },
  { valor: 'MAYORISTAS', etiqueta: 'Mayoristas (precio en Coruña)' },
];

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Listas de precio'));

  const articulos = await api.get('/api/articulos');
  const mapaArticulosPorCodigo = new Map(articulos.map((a) => [a.codigo, a]));

  // ---------------- Modo AUTO ----------------
  const tarjetaAuto = el('div', { class: 'tarjeta' });
  tarjetaAuto.appendChild(el('h3', {}, 'Modo AUTO — desde las compras de un día'));
  const campoTipoAuto = el('select', {}, TIPOS.map((t) => el('option', { value: t.valor }, t.etiqueta)));
  const campoFechaAuto = el('input', { type: 'date', value: fechaHoy() });
  const botonCalcular = el('button', { class: 'secundario', onclick: calcularAuto }, 'Calcular vista previa');
  const botonGuardarAuto = el('button', { onclick: guardarAuto, disabled: true }, 'Guardar como lista AUTO');
  tarjetaAuto.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Tipo'), campoTipoAuto]),
    el('div', { class: 'campo' }, [el('label', {}, 'Fecha'), campoFechaAuto]),
    botonCalcular,
  ]));
  const divPreviaAuto = el('div', {});
  tarjetaAuto.appendChild(divPreviaAuto);
  tarjetaAuto.appendChild(botonGuardarAuto);
  contenedor.appendChild(tarjetaAuto);

  let filasAuto = [];

  async function calcularAuto() {
    const r = await api.get(`/api/listas-precio/auto-preview?fecha=${campoFechaAuto.value}`);
    filasAuto = r.filas;
    divPreviaAuto.innerHTML = '';
    if (!filasAuto.length) { divPreviaAuto.appendChild(el('p', { class: 'vacio' }, 'No hay compras esa fecha.')); botonGuardarAuto.disabled = true; return; }
    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Artículo', 'Coste medio del día', 'Precio (coste + 1,70€)'].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const f of filasAuto) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, `${f.articulo_codigo} — ${f.descripcion || ''}`),
        el('td', {}, euros(f.coste_medio_hoy)),
        el('td', {}, euros(f.precio)),
      ]));
    }
    tabla.appendChild(tbody);
    divPreviaAuto.appendChild(tabla);
    botonGuardarAuto.disabled = false;
  }

  async function guardarAuto() {
    await conBotonDeshabilitado(botonGuardarAuto, 'Guardando…', async () => {
      try {
        const lineas = filasAuto.map((f) => {
          const art = mapaArticulosPorCodigo.get(f.articulo_codigo);
          return { articulo_id: art ? art.id : null, descripcion: f.descripcion, precio: f.precio, coste: f.coste_medio_hoy };
        });
        await api.post('/api/listas-precio', { tipo: campoTipoAuto.value, fecha: campoFechaAuto.value, modo: 'AUTO', lineas });
        mostrarAviso(contenedor, 'Lista AUTO guardada.', 'ok');
        await cargarHistorico();
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }

  // ---------------- Modo MANUAL ----------------
  const tarjetaManual = el('div', { class: 'tarjeta' });
  tarjetaManual.appendChild(el('h3', {}, 'Modo MANUAL'));
  const campoTipoManual = el('select', {}, TIPOS.map((t) => el('option', { value: t.valor }, t.etiqueta)));
  const campoFechaManual = el('input', { type: 'date', value: fechaHoy() });
  tarjetaManual.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Tipo'), campoTipoManual]),
    el('div', { class: 'campo' }, [el('label', {}, 'Fecha'), campoFechaManual]),
  ]));
  const cuerpoManual = el('tbody');
  tarjetaManual.appendChild(el('table', { class: 'lineas-tabla' }, [
    el('thead', {}, el('tr', {}, ['Artículo', 'Precio', 'Existencias (número o texto)', 'Aviso', ''].map((t) => el('th', {}, t)))),
    cuerpoManual,
  ]));
  const botonAnadirManual = el('button', { class: 'secundario', onclick: () => anadirLineaManual() }, '+ Añadir línea');
  const botonGuardarManual = el('button', { onclick: guardarManual }, '💾 Guardar lista MANUAL');
  tarjetaManual.appendChild(el('div', { class: 'fila' }, [botonAnadirManual, botonGuardarManual]));
  contenedor.appendChild(tarjetaManual);

  const filasManual = [];

  function anadirLineaManual() {
    const campoArt = crearCampoArticulo(articulos);
    const inputPrecio = el('input', { type: 'number', step: 'any', placeholder: '€/kg' });
    const inputExistencias = el('input', { type: 'text', placeholder: 'ej. 12 o AGOTADO' });
    const celdaAviso = el('td', {}, '');
    const fila = { campoArt, inputPrecio, inputExistencias, celdaAviso, costeReferencia: null };

    const comprobarPrecio = debounce(async () => {
      const art = campoArt.obtener();
      fila.costeReferencia = null;
      celdaAviso.innerHTML = '';
      if (!art) return;
      try {
        const r = await api.get(`/api/articulos/${art.id}/coste-referencia`);
        fila.costeReferencia = r.coste_referencia;
      } catch (err) { return; }
      const precio = Number(inputPrecio.value);
      if (fila.costeReferencia != null && precio && precio < fila.costeReferencia) {
        const margen = precio - fila.costeReferencia;
        inputPrecio.style.borderColor = 'var(--rojo)';
        celdaAviso.appendChild(el('span', { class: 'badge pendiente' }, `⚠️ ¡PÉRDIDA! ${numero(margen, 2)} €/kg por debajo del coste (${euros(fila.costeReferencia)})`));
      } else {
        inputPrecio.style.borderColor = '';
      }
    }, 300);
    campoArt.input.addEventListener('change', comprobarPrecio);
    inputPrecio.addEventListener('input', comprobarPrecio);

    const botonQuitar = el('button', { class: 'pequeno peligro', onclick: () => { tr.remove(); filasManual.splice(filasManual.indexOf(fila), 1); } }, '✕');
    const tr = el('tr', {}, [
      el('td', {}, [campoArt.input, campoArt.datalist]),
      el('td', {}, inputPrecio),
      el('td', {}, inputExistencias),
      celdaAviso,
      el('td', {}, botonQuitar),
    ]);
    cuerpoManual.appendChild(tr);
    filasManual.push(fila);
  }

  async function guardarManual() {
    if (!filasManual.length) return mostrarAviso(contenedor, 'Añade al menos una línea.', 'error');
    const conPerdida = filasManual.filter((f) => f.costeReferencia != null && Number(f.inputPrecio.value) < f.costeReferencia);
    if (conPerdida.length) {
      const seguir = confirm(`${conPerdida.length} producto(s) tienen el precio por debajo del coste. ¿Seguro que quieres guardar así?`);
      if (!seguir) return;
    }
    await conBotonDeshabilitado(botonGuardarManual, 'Guardando…', async () => {
      try {
        const lineas = filasManual.map((f) => {
          const art = f.campoArt.obtener();
          return {
            articulo_id: art ? art.id : null, descripcion: art ? art.descripcion : null,
            precio: Number(f.inputPrecio.value) || null, coste: f.costeReferencia,
            existencias: f.inputExistencias.value || null,
          };
        });
        await api.post('/api/listas-precio', { tipo: campoTipoManual.value, fecha: campoFechaManual.value, modo: 'MANUAL', lineas });
        mostrarAviso(contenedor, 'Lista MANUAL guardada.', 'ok');
        cuerpoManual.innerHTML = ''; filasManual.length = 0;
        await cargarHistorico();
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }
  anadirLineaManual();

  // ---------------- Histórico ----------------
  contenedor.appendChild(el('h3', {}, 'Listas guardadas'));
  const divHistorico = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divHistorico);

  async function cargarHistorico() {
    const listas = await api.get('/api/listas-precio');
    divHistorico.innerHTML = '';
    if (!listas.length) { divHistorico.appendChild(el('p', { class: 'vacio' }, 'Todavía no se ha guardado ninguna.')); return; }
    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Fecha', 'Tipo', 'Modo'].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const l of listas) {
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-etiqueta': 'Fecha' }, String(l.fecha).slice(0, 10)),
        el('td', { 'data-etiqueta': 'Tipo' }, l.tipo),
        el('td', { 'data-etiqueta': 'Modo' }, l.modo),
      ]));
    }
    tabla.appendChild(tbody);
    divHistorico.appendChild(tabla);
  }
  await cargarHistorico();
}

export default { render };
