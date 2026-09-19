// Historial de pedidos: buscar/filtrar, y la capacidad TRANSVERSAL de
// seleccionar varios (casillas de marcar) o usar el filtro como alternativa
// si no se marca ninguno, para imprimir de golpe (corrección 02/09/2026
// punto 9) — vale tanto para el albarán sin precios como para la Hoja
// Transfrío, sin repetir el mecanismo de selección para cada una.
import { api } from '../api.js';
import { el, euros, mostrarAviso } from '../utilidades.js';
import { abrirVentanaImpresion, mostrarErrorEnVentana, rellenarAlbaran, rellenarSobrePapel } from '../impresion/motor.js';
import { abrirPanelEtiquetasPedido } from './dialogoEtiquetas.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Historial de pedidos'));

  const tarjetaFiltro = el('div', { class: 'tarjeta' });
  const campoDesde = el('input', { type: 'date' });
  const campoHasta = el('input', { type: 'date' });
  const campoAgencia = el('input', { type: 'text', placeholder: '(cualquiera)' });
  const botonBuscar = el('button', { onclick: () => buscar() }, 'Buscar');
  tarjetaFiltro.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Desde'), campoDesde]),
    el('div', { class: 'campo' }, [el('label', {}, 'Hasta'), campoHasta]),
    el('div', { class: 'campo' }, [el('label', {}, 'Agencia'), campoAgencia]),
    botonBuscar,
  ]));
  contenedor.appendChild(tarjetaFiltro);

  const tarjetaAcciones = el('div', { class: 'tarjeta' });
  const etiquetaSeleccion = el('span', {}, '');
  const botonAlbaranConPrecios = el('button', { class: 'secundario', onclick: () => accionImprimir('albaran_con_precios') }, 'Imprimir albarán (con precios)');
  const botonAlbaranSinPrecios = el('button', { class: 'secundario', onclick: () => accionImprimir('albaran_sin_precios') }, 'Imprimir albarán (sin precios)');
  const botonTransfrio = el('button', { class: 'secundario', onclick: () => accionImprimir('transfrio') }, '🚚 Imprimir Hoja Transfrío');
  const botonCmr = el('button', { class: 'secundario', onclick: () => accionImprimir('cmr') }, '📄 Imprimir Hoja CMR');
  tarjetaAcciones.appendChild(el('p', {}, ['Marca uno o varios pedidos de la tabla, o deja sin marcar ninguno para usar todos los que salen con el filtro de arriba. ', etiquetaSeleccion]));
  tarjetaAcciones.appendChild(el('div', { class: 'fila' }, [botonAlbaranConPrecios, botonAlbaranSinPrecios, botonTransfrio, botonCmr]));
  contenedor.appendChild(tarjetaAcciones);

  const divTabla = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divTabla);
  const divPanelEtiquetas = el('div', {});
  contenedor.appendChild(divPanelEtiquetas);

  let pedidosActuales = [];
  const seleccionados = new Set();

  function actualizarEtiquetaSeleccion() {
    etiquetaSeleccion.textContent = seleccionados.size
      ? `(${seleccionados.size} marcado(s) — se usarán esos)`
      : `(ninguno marcado — se usarán los ${pedidosActuales.length} del filtro actual)`;
  }

  async function buscar() {
    const params = new URLSearchParams();
    if (campoDesde.value) params.set('desde', campoDesde.value);
    if (campoHasta.value) params.set('hasta', campoHasta.value);
    let pedidos = await api.get(`/api/pedidos?${params.toString()}`);
    if (campoAgencia.value) {
      const filtro = campoAgencia.value.toUpperCase();
      pedidos = pedidos.filter((p) => String(p.agencia || '').toUpperCase().includes(filtro));
    }
    pedidosActuales = pedidos;
    seleccionados.clear();
    pintarTabla();
    actualizarEtiquetaSeleccion();
  }

  function pintarTabla() {
    divTabla.innerHTML = '';
    if (!pedidosActuales.length) { divTabla.appendChild(el('p', { class: 'vacio' }, 'No hay pedidos con ese filtro.')); return; }
    const casillaTodos = el('input', { type: 'checkbox', onchange: () => {
      seleccionados.clear();
      if (casillaTodos.checked) pedidosActuales.forEach((p) => seleccionados.add(p.id));
      pintarTabla(); actualizarEtiquetaSeleccion();
    } });
    casillaTodos.checked = pedidosActuales.length > 0 && seleccionados.size === pedidosActuales.length;

    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, [el('th', {}, casillaTodos), ...['Nº', 'Fecha', 'Cliente', 'Agencia', 'Total', ''].map((t) => el('th', {}, t))])));
    const tbody = el('tbody');
    for (const p of pedidosActuales) {
      const casilla = el('input', { type: 'checkbox', onchange: () => {
        if (casilla.checked) seleccionados.add(p.id); else seleccionados.delete(p.id);
        actualizarEtiquetaSeleccion();
      } });
      casilla.checked = seleccionados.has(p.id);
      tbody.appendChild(el('tr', {}, [
        el('td', {}, casilla),
        el('td', { 'data-etiqueta': 'Nº' }, String(p.numero)),
        el('td', { 'data-etiqueta': 'Fecha' }, String(p.fecha).slice(0, 10)),
        el('td', { 'data-etiqueta': 'Cliente' }, p.cliente_nombre_snapshot || ''),
        el('td', { 'data-etiqueta': 'Agencia' }, p.agencia || ''),
        el('td', { 'data-etiqueta': 'Total' }, euros(p.total)),
        el('td', {}, el('button', { class: 'pequeno secundario', onclick: () => abrirPanelEtiquetasPedido(divPanelEtiquetas, p.id, contenedor) }, '🏷️')),
      ]));
    }
    tabla.appendChild(tbody);
    divTabla.appendChild(tabla);
  }

  function accionImprimir(modeloId) {
    const idsAImprimir = seleccionados.size ? [...seleccionados] : pedidosActuales.map((p) => p.id);
    if (!idsAImprimir.length) return mostrarAviso(contenedor, 'No hay ningún pedido para imprimir.', 'error');
    if (!confirm(`Se van a imprimir ${idsAImprimir.length} documento(s). ¿Continuar?`)) return;

    // Corrección 02/09/2026 punto 10, motivo 1: el Transfrío se suele
    // imprimir en varias copias seguidas por cliente — se preguntan aquí,
    // ANTES de pedir nada al servidor, y se construyen dentro del propio
    // documento (nunca con el ajuste "copias" del diálogo de impresión).
    let copias = 1;
    if (modeloId === 'transfrio') {
      const respuesta = prompt('¿Cuántas copias por pedido? (Transfrío se suele imprimir en 4 copias seguidas por cliente)', '4');
      if (respuesta === null) return;
      copias = Math.max(1, parseInt(respuesta, 10) || 1);
    }

    // Corrección punto 10, motivo 2: la ventana se abre AQUÍ MISMO, todavía
    // dentro del clic — nunca después de esperar al servidor, o el
    // navegador puede bloquearla sin avisar. Se rellena más abajo, cuando
    // ya hayan llegado los datos.
    const modeloParaTitulo = { albaran_con_precios: 'Albarán (con precios)', albaran_sin_precios: 'Albarán (sin precios)', transfrio: 'Hoja Transfrío', cmr: 'Hoja CMR' };
    const ventana = abrirVentanaImpresion(modeloParaTitulo[modeloId] || 'Documento');
    if (!ventana) return;

    cargarYRellenar(ventana, modeloId, idsAImprimir, copias);
  }

  async function cargarYRellenar(ventana, modeloId, ids, copias) {
    try {
      if (modeloId === 'albaran_con_precios' || modeloId === 'albaran_sin_precios') {
        const datos = await api.get(`/api/pedidos/imprimir?ids=${ids.join(',')}`);
        rellenarAlbaran(ventana, { listaPedidos: datos, conPrecios: modeloId === 'albaran_con_precios' });
        return;
      }
      const modelo = await api.get(`/api/modelos-impresion/${modeloId}`);
      const datos = await api.get(`/api/pedidos/imprimir?ids=${ids.join(',')}&modelo=${modeloId}`);
      // El servidor omite del lote, en silencio, los pedidos que no cumplen
      // la condición del modelo (p.ej. CMR solo vale para agencia MOZO) en
      // vez de abortar la impresión entera — aquí se avisa de cuántos se han
      // quedado fuera, para que no parezca que faltan sin más explicación.
      if (datos.length < ids.length) {
        const omitidos = ids.length - datos.length;
        mostrarAviso(contenedor, `${omitidos} de ${ids.length} pedido(s) no llevan "${modelo.nombre}" y se han omitido del lote (revisa el motivo: ${modelo.descripcion.split('.')[0]}).`, 'error');
      }
      if (!datos.length) { mostrarErrorEnVentana(ventana, `Ningún pedido de los seleccionados lleva "${modelo.nombre}".`); return; }
      rellenarSobrePapel(ventana, { modelo, listaValores: datos.map((d) => d.valores), copiasPorDocumento: copias });
    } catch (err) {
      mostrarErrorEnVentana(ventana, err.message);
      mostrarAviso(contenedor, err.message, 'error');
    }
  }

  await buscar();
}

export default { render };
