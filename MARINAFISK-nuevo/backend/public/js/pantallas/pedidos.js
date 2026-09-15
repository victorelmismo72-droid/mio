// Pantalla de Pedidos. La asignación de partida y el margen se calculan en
// vivo mientras se teclea (Fase 0 punto 3), llamando al servidor en cada
// cambio — nunca se decide en el navegador. El IVA/Recargo que se ve aquí
// antes de grabar es solo una vista previa (se recalcula de verdad, con el
// dato real del cliente, en el servidor al grabar).
import { api, generarUid } from '../api.js';
import { el, euros, numero, fechaHoy, debounce, mostrarAviso, conBotonDeshabilitado } from '../utilidades.js';
import { crearCampoArticulo, crearCampoCliente } from './buscadorArticulo.js';
import { abrirVentanaImpresion, mostrarErrorEnVentana, rellenarSobrePapel } from '../impresion/motor.js';

const IVA_PESCADO_PCT = 10;
const RECARGO_PCT = 1.4;

function previsualizarIva(tipoIva, base) {
  if (tipoIva === 'INTRACOMUNITARIO') return { ivaPct: 0, recargoPct: 0, iva: 0, recargo: 0, total: base };
  if (tipoIva === 'RECARGO_EQUIVALENCIA') {
    const iva = base * IVA_PESCADO_PCT / 100, recargo = base * RECARGO_PCT / 100;
    return { ivaPct: IVA_PESCADO_PCT, recargoPct: RECARGO_PCT, iva, recargo, total: base + iva + recargo };
  }
  const iva = base * IVA_PESCADO_PCT / 100;
  return { ivaPct: IVA_PESCADO_PCT, recargoPct: 0, iva, recargo: 0, total: base + iva };
}

function badgePartida(resultado) {
  if (!resultado) return el('span', { class: 'badge pendiente' }, '—');
  if (resultado.estado_asignacion === 'OK') return el('span', { class: 'badge ok' }, `✅ partida ${resultado.numero_partida}`);
  if (resultado.estado_asignacion === 'AVISO_MARGEN') return el('span', { class: 'badge margen' }, '⚠️ sin margen suficiente');
  return el('span', { class: 'badge pendiente' }, '⚠️ sin compras de este artículo');
}

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Pedidos'));

  const [clientes, articulos] = await Promise.all([api.get('/api/clientes'), api.get('/api/articulos')]);
  if (!clientes.length) {
    contenedor.appendChild(el('p', { class: 'aviso error' }, 'No hay clientes en el catálogo todavía — crea uno primero en la pantalla Clientes.'));
    return;
  }

  const tarjeta = el('div', { class: 'tarjeta' });
  contenedor.appendChild(tarjeta);

  const campoCliente = crearCampoCliente(clientes);
  const campoFecha = el('input', { type: 'date', value: fechaHoy() });
  const campoAgencia = el('input', { type: 'text', placeholder: '(se rellena del cliente)' });
  const campoFormaPago = el('input', { type: 'text', placeholder: '(se rellena del cliente)' });

  tarjeta.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Cliente'), campoCliente.input, campoCliente.datalist]),
    el('div', { class: 'campo' }, [el('label', {}, 'Fecha'), campoFecha]),
    el('div', { class: 'campo' }, [el('label', {}, 'Agencia'), campoAgencia]),
    el('div', { class: 'campo' }, [el('label', {}, 'Forma de pago'), campoFormaPago]),
  ]));

  campoCliente.input.addEventListener('change', () => {
    const c = campoCliente.obtener();
    if (c) { campoAgencia.value = c.agencia || ''; campoFormaPago.value = c.forma_pago || ''; }
    actualizarTotales();
  });

  const cuerpoTabla = el('tbody');
  const tablaLineas = el('table', { class: 'lineas-tabla' }, [
    el('thead', {}, el('tr', {}, ['Artículo', 'Cajas', 'Peso (kg)', 'Precio €/kg', 'Dcto %', 'Total', 'Partida', ''].map((t) => el('th', {}, t)))),
    cuerpoTabla,
  ]);
  tarjeta.appendChild(tablaLineas);

  const pieTotales = el('p', {}, '');
  tarjeta.appendChild(pieTotales);

  const botonAnadir = el('button', { class: 'secundario', onclick: () => anadirLinea() }, '+ Añadir línea');
  const botonGrabar = el('button', { onclick: grabar }, '💾 Grabar pedido');
  tarjeta.appendChild(el('div', { class: 'fila' }, [botonAnadir, botonGrabar]));

  const filas = [];

  function actualizarTotales() {
    const base = filas.reduce((s, f) => s + (f.total || 0), 0);
    const cliente = campoCliente.obtener();
    pieTotales.innerHTML = '';
    if (!base) { return; }
    if (!cliente) {
      pieTotales.appendChild(el('strong', {}, `Base: ${euros(base)} (elige un cliente para ver el IVA/Recargo)`));
      return;
    }
    const p = previsualizarIva(cliente.tipo_iva, base);
    let texto = `Base: ${euros(base)} · IVA (${p.ivaPct}%): ${euros(p.iva)}`;
    if (p.recargoPct) texto += ` · Recargo Eq. (${p.recargoPct}%): ${euros(p.recargo)}`;
    texto += ` · Total: ${euros(p.total)}`;
    pieTotales.appendChild(el('strong', {}, texto));
  }

  const recalcularLinea = debounce(async (fila) => {
    const art = fila.campoArt.obtener();
    const peso = Number(fila.inputPeso.value) || 0;
    const precio = Number(fila.inputPrecio.value) || 0;
    const descuento = Number(fila.inputDescuento.value) || 0;
    fila.total = peso && precio ? peso * precio * (1 - descuento / 100) : 0;
    fila.celdaTotal.textContent = fila.total ? euros(fila.total) : '—';

    fila.celdaPartida.innerHTML = '';
    fila.resultadoPartida = null;
    if (art && precio) {
      try {
        fila.resultadoPartida = await api.post('/api/pedidos/asignar-partida', {
          articulo_codigo: art.codigo, articulo_descripcion: art.descripcion, precio,
        });
      } catch (err) { /* se deja sin resolver, se reintentará al grabar */ }
    }
    fila.celdaPartida.appendChild(badgePartida(fila.resultadoPartida));
    if (fila.resultadoPartida && fila.resultadoPartida.estado_asignacion === 'AVISO_MARGEN' && fila.resultadoPartida.candidatas.length) {
      const select = el('select', {}, [
        el('option', { value: '' }, '— elegir partida a mano —'),
        ...fila.resultadoPartida.candidatas.map((c) => el('option', { value: c.numero_partida },
          `${c.numero_partida} · ${String(c.fecha).slice(0, 10)} · coste ${numero(c.coste_medio_kg, 2)}€/kg · margen ${numero(c.margen, 2)}€`)),
      ]);
      select.addEventListener('change', () => { fila.partidaElegidaManual = select.value ? Number(select.value) : null; });
      fila.celdaPartida.appendChild(select);
    } else {
      fila.partidaElegidaManual = null;
    }
    actualizarTotales();
  }, 350);

  function anadirLinea() {
    const campoArt = crearCampoArticulo(articulos);
    const inputCantidad = el('input', { type: 'number', step: 'any', placeholder: 'cajas' });
    const inputPeso = el('input', { type: 'number', step: 'any', placeholder: 'kg' });
    const inputPrecio = el('input', { type: 'number', step: 'any', placeholder: '€/kg' });
    const inputDescuento = el('input', { type: 'number', step: 'any', placeholder: '0', value: '0' });
    const celdaTotal = el('td', {}, '—');
    const celdaPartida = el('td', {});

    const fila = { campoArt, inputCantidad, inputPeso, inputPrecio, inputDescuento, celdaTotal, celdaPartida, total: 0, resultadoPartida: null, partidaElegidaManual: null };
    const botonQuitar = el('button', { class: 'pequeno peligro', onclick: () => { tr.remove(); filas.splice(filas.indexOf(fila), 1); actualizarTotales(); } }, '✕');

    inputPeso.addEventListener('input', () => recalcularLinea(fila));
    inputPrecio.addEventListener('input', () => recalcularLinea(fila));
    inputDescuento.addEventListener('input', () => recalcularLinea(fila));
    campoArt.input.addEventListener('change', () => recalcularLinea(fila));

    const tr = el('tr', {}, [
      el('td', {}, [campoArt.input, campoArt.datalist]),
      el('td', {}, inputCantidad), el('td', {}, inputPeso), el('td', {}, inputPrecio), el('td', {}, inputDescuento),
      celdaTotal, celdaPartida,
      el('td', {}, botonQuitar),
    ]);
    fila.tr = tr;
    cuerpoTabla.appendChild(tr);
    filas.push(fila);
  }

  async function grabar() {
    const cliente = campoCliente.obtener();
    if (!cliente) return mostrarAviso(contenedor, 'Elige un cliente.', 'error');
    if (!filas.length) return mostrarAviso(contenedor, 'Añade al menos una línea.', 'error');

    const lineas = [];
    for (const f of filas) {
      const art = f.campoArt.obtener();
      const peso = Number(f.inputPeso.value);
      const precio = Number(f.inputPrecio.value);
      if (!art || !peso || !precio) return mostrarAviso(contenedor, 'Todas las líneas necesitan artículo, peso y precio.', 'error');
      lineas.push({
        articulo_id: art.id, articulo_codigo_snapshot: art.codigo, descripcion_snapshot: art.descripcion,
        cantidad: Number(f.inputCantidad.value) || null, peso, precio,
        descuento: Number(f.inputDescuento.value) || 0, iva_pct: 10, total: f.total,
        // Si el usuario ha elegido una partida a mano (caso AVISO_MARGEN), se
        // manda ya resuelta; si no, el servidor la vuelve a calcular él mismo
        // al grabar (nunca se confía en el cálculo hecho mientras se tecleaba).
        numero_partida: f.partidaElegidaManual || undefined,
      });
    }

    await conBotonDeshabilitado(botonGrabar, '⏳ Grabando…', async () => {
      try {
        const pedido = await api.post('/api/pedidos', {
          uid: generarUid(), fecha: campoFecha.value, cliente_id: cliente.id,
          agencia: campoAgencia.value || null, forma_pago: campoFormaPago.value || null, lineas,
        });
        mostrarAviso(contenedor, `Pedido nº ${pedido.numero} grabado.`, 'ok');
        cuerpoTabla.innerHTML = ''; filas.length = 0; pieTotales.textContent = '';
        await cargarRecientes();
      } catch (err) {
        mostrarAviso(contenedor, err.message, 'error');
      }
    });
  }

  anadirLinea();

  contenedor.appendChild(el('h3', {}, 'Pedidos recientes'));
  const divRecientes = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divRecientes);

  function imprimirCmr(pedidoId) {
    // La ventana se abre aquí mismo, dentro del clic — ver corrección
    // 02/09/2026 punto 10, motivo 2, en impresion/motor.js.
    const ventana = abrirVentanaImpresion('Hoja CMR');
    if (!ventana) return;
    (async () => {
      try {
        const modelo = await api.get('/api/modelos-impresion/cmr');
        const datos = await api.get(`/api/pedidos/imprimir?ids=${pedidoId}&modelo=cmr`);
        rellenarSobrePapel(ventana, { modelo, listaValores: datos.map((d) => d.valores) });
      } catch (err) {
        mostrarErrorEnVentana(ventana, err.message);
        mostrarAviso(contenedor, err.message, 'error');
      }
    })();
  }

  async function cargarRecientes() {
    const pedidos = await api.get('/api/pedidos');
    divRecientes.innerHTML = '';
    if (!pedidos.length) { divRecientes.appendChild(el('p', { class: 'vacio' }, 'No hay pedidos todavía.')); return; }
    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Nº', 'Fecha', 'Cliente', 'Total', ''].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const p of pedidos.slice(0, 30)) {
      // Corrección 02/09/2026 punto 7: el botón CMR solo aparece para
      // clientes con agencia "MOZO" — para el resto queda oculto.
      const acciones = String(p.agencia || '').toUpperCase() === 'MOZO'
        ? el('button', { class: 'pequeno secundario', onclick: () => imprimirCmr(p.id) }, '📄 CMR')
        : '';
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-etiqueta': 'Nº' }, String(p.numero)),
        el('td', { 'data-etiqueta': 'Fecha' }, String(p.fecha).slice(0, 10)),
        el('td', { 'data-etiqueta': 'Cliente' }, p.cliente_nombre_snapshot || ''),
        el('td', { 'data-etiqueta': 'Total' }, euros(p.total)),
        el('td', {}, acciones),
      ]));
    }
    tabla.appendChild(tbody);
    divRecientes.appendChild(tabla);
  }
  await cargarRecientes();
}

export default { render };
