// Pantalla de Compras. El 2% de OP y el IVA se calculan en vivo llamando al
// servidor (nunca en el navegador) — es el propio backend quien decide,
// leyendo el proveedor real, tal como pide FASE_2 punto 1.
import { api, generarUid } from '../api.js';
import { el, euros, numero, fechaHoy, debounce, mostrarAviso, conBotonDeshabilitado } from '../utilidades.js';
import { crearCampoArticulo } from './buscadorArticulo.js';
import { leerArchivoComoWorkbook, parsearComprasExcel } from '../importacionExcel.js';
import { panelErrores, panelResumen } from './resultadoImportacion.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Compras'));
  contenedor.appendChild(el('p', {}, '⚠️ Las compras no se pueden modificar ni borrar una vez grabadas (dato sagrado) — revisa bien antes de grabar.'));

  const [proveedores, articulosTodos] = await Promise.all([api.get('/api/proveedores'), api.get('/api/articulos')]);
  // Fase 6: un artículo desactivado no se ofrece al elegir artículo en una
  // compra nueva — sigue existiendo para el histórico, solo deja de
  // aparecer aquí.
  const articulos = articulosTodos.filter((a) => a.activo);
  if (!proveedores.length) {
    contenedor.appendChild(el('p', { class: 'aviso error' }, 'No hay proveedores en el catálogo todavía — crea uno primero en la pantalla Proveedores.'));
    return;
  }

  // Importación masiva desde Excel (Fase 6, hoja "COMPRAS") — nunca
  // modifica una compra ya grabada (dato sagrado): las combinaciones
  // partida+albarán+proveedor nuevas se dan de alta, las que ya existen
  // igual no se tocan, y las que ya existen con datos distintos se avisan
  // como conflicto para revisar a mano. Ver FASE_6 punto 4.
  const tarjetaImport = el('div', { class: 'tarjeta' });
  const divResultadoImport = el('div', {});
  const inputFileCompras = el('input', { type: 'file', accept: '.xlsx,.xls', style: 'display:none;' });
  inputFileCompras.addEventListener('change', async () => {
    const file = inputFileCompras.files[0];
    inputFileCompras.value = '';
    if (!file) return;
    try {
      const wb = await leerArchivoComoWorkbook(file, { cellDates: true });
      const r = parsearComprasExcel(wb);
      if (!r.ok) { panelErrores(divResultadoImport, r.errores); return; }
      const resultado = await api.post('/api/compras/importar', { grupos: r.grupos });
      const ignoradasTotal = r.ignoradas.concat(resultado.ignoradas);
      panelResumen(divResultadoImport, {
        resumen: `${r.grupos.length} compra(s) del Excel procesadas → ${resultado.nuevas} nueva(s), ${resultado.sin_cambios} ya estaban igual (no se han tocado ni duplicado).`,
        secciones: [
          { titulo: '⚠️ Ya existían con datos distintos — no se han modificado, revísalas a mano', items: resultado.conflictos },
          { titulo: '⚠️ Filas/compras ignoradas (no parecían una compra real)', items: ignoradasTotal },
        ],
      });
      await cargarRecientes();
    } catch (err) {
      panelErrores(divResultadoImport, [`Error inesperado al leer el archivo: ${err.message}`]);
    }
  });
  tarjetaImport.appendChild(el('div', { class: 'fila' }, [
    el('button', { class: 'secundario', onclick: () => inputFileCompras.click() }, '📥 Importar desde Excel (hoja "COMPRAS")'), inputFileCompras,
  ]));
  tarjetaImport.appendChild(divResultadoImport);
  contenedor.appendChild(tarjetaImport);

  const tarjeta = el('div', { class: 'tarjeta' });
  contenedor.appendChild(tarjeta);

  const selectorProveedor = el('select', {}, proveedores.map((p) => el('option', { value: p.id }, `${p.codigo} — ${p.nombre}`)));
  const campoFecha = el('input', { type: 'date', value: fechaHoy() });
  const campoPartida = el('input', { type: 'number', placeholder: 'nº de partida' });
  const botonSugerirPartida = el('button', { class: 'secundario pequeno', onclick: sugerirPartida }, 'Sugerir siguiente');
  const campoAlbaran = el('input', { type: 'text', placeholder: 'nº albarán proveedor (opcional)' });

  tarjeta.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Proveedor'), selectorProveedor]),
    el('div', { class: 'campo' }, [el('label', {}, 'Fecha'), campoFecha]),
    el('div', { class: 'campo' }, [el('label', {}, 'Nº de partida'), el('div', { class: 'fila' }, [campoPartida, botonSugerirPartida])]),
    el('div', { class: 'campo' }, [el('label', {}, 'Nº albarán proveedor'), campoAlbaran]),
  ]));

  const cuerpoTabla = el('tbody');
  const tablaLineas = el('table', { class: 'lineas-tabla' }, [
    el('thead', {}, el('tr', {}, ['Artículo', 'Cajas', 'Kilos', 'Precio/kg', 'Base', '2% OP', 'Base real', 'IVA', 'Total', ''].map((t) => el('th', {}, t)))),
    cuerpoTabla,
  ]);
  tarjeta.appendChild(tablaLineas);

  const pieTotales = el('p', {}, '');
  tarjeta.appendChild(pieTotales);

  const botonAnadir = el('button', { class: 'secundario', onclick: () => anadirLinea() }, '+ Añadir línea');
  const botonGrabar = el('button', { onclick: grabar }, '💾 Grabar compra');
  tarjeta.appendChild(el('div', { class: 'fila' }, [botonAnadir, botonGrabar]));

  const filas = []; // { tr, obtenerArticulo, cajas, kilos, precioKg, calculo, celdas }

  function proveedorActual() {
    return proveedores.find((p) => String(p.id) === String(selectorProveedor.value));
  }

  async function sugerirPartida() {
    const partidas = await api.get('/api/partidas');
    const maximo = partidas.reduce((m, p) => Math.max(m, p.numero_partida), 5899);
    campoPartida.value = maximo + 1;
  }

  function actualizarTotales() {
    const sumar = (campo) => filas.reduce((s, f) => s + (f.calculo ? Number(f.calculo[campo]) || 0 : 0), 0);
    if (!filas.some((f) => f.calculo)) { pieTotales.textContent = ''; return; }
    pieTotales.innerHTML = '';
    pieTotales.appendChild(el('strong', {}, `Totales — Base: ${euros(sumar('baseZgz'))} · 2% OP: ${euros(sumar('op2Importe'))} · Base real: ${euros(sumar('baseReal'))} · IVA: ${euros(sumar('ivaImporte'))} · Total factura: ${euros(sumar('totalFactura'))}`));
  }

  const recalcularLinea = debounce(async (fila) => {
    const proveedor = proveedorActual();
    const kilos = Number(fila.inputKilos.value);
    const precioKg = Number(fila.inputPrecio.value);
    if (!proveedor || !kilos || !precioKg) { fila.calculo = null; pintarCalculo(fila); return; }
    try {
      fila.calculo = await api.post('/api/compras/calcular-linea', { proveedor_id: proveedor.id, kilos, precio_kg: precioKg });
    } catch (err) {
      fila.calculo = null;
    }
    pintarCalculo(fila);
  }, 300);

  function pintarCalculo(fila) {
    const c = fila.calculo;
    fila.celdaBase.textContent = c ? euros(c.baseZgz) : '—';
    fila.celdaOp2.textContent = c ? euros(c.op2Importe) : '—';
    fila.celdaBaseReal.textContent = c ? euros(c.baseReal) : '—';
    fila.celdaIva.textContent = c ? euros(c.ivaImporte) : '—';
    fila.celdaTotal.textContent = c ? euros(c.totalFactura) : '—';
    actualizarTotales();
  }

  function anadirLinea() {
    const campoArt = crearCampoArticulo(articulos);
    const inputCajas = el('input', { type: 'number', step: 'any', placeholder: 'cajas' });
    const inputKilos = el('input', { type: 'number', step: 'any', placeholder: 'kg' });
    const inputPrecio = el('input', { type: 'number', step: 'any', placeholder: '€/kg' });

    const celdaBase = el('td', {}, '—');
    const celdaOp2 = el('td', {}, '—');
    const celdaBaseReal = el('td', {}, '—');
    const celdaIva = el('td', {}, '—');
    const celdaTotal = el('td', {}, '—');

    const fila = { inputKilos, inputPrecio, celdaBase, celdaOp2, celdaBaseReal, celdaIva, celdaTotal, calculo: null, campoArt };

    const botonQuitar = el('button', { class: 'pequeno peligro', onclick: () => { tr.remove(); filas.splice(filas.indexOf(fila), 1); actualizarTotales(); } }, '✕');

    inputKilos.addEventListener('input', () => recalcularLinea(fila));
    inputPrecio.addEventListener('input', () => recalcularLinea(fila));

    const tr = el('tr', {}, [
      el('td', {}, [campoArt.input, campoArt.datalist]),
      el('td', {}, inputCajas), el('td', {}, inputKilos), el('td', {}, inputPrecio),
      celdaBase, celdaOp2, celdaBaseReal, celdaIva, celdaTotal,
      el('td', {}, botonQuitar),
    ]);
    fila.tr = tr; fila.inputCajas = inputCajas;
    cuerpoTabla.appendChild(tr);
    filas.push(fila);
  }

  selectorProveedor.addEventListener('change', () => filas.forEach((f) => recalcularLinea(f)));

  async function grabar() {
    const proveedor = proveedorActual();
    if (!proveedor) return mostrarAviso(contenedor, 'Elige un proveedor.', 'error');
    if (!campoPartida.value) return mostrarAviso(contenedor, 'Falta el número de partida.', 'error');
    if (!filas.length) return mostrarAviso(contenedor, 'Añade al menos una línea.', 'error');

    const lineas = [];
    for (const f of filas) {
      const art = f.campoArt.obtener();
      const kilos = Number(f.inputKilos.value);
      const precioKg = Number(f.inputPrecio.value);
      if (!kilos || !precioKg) return mostrarAviso(contenedor, 'Todas las líneas necesitan kilos y precio/kg.', 'error');
      lineas.push({
        articulo_id: art ? art.id : null,
        articulo_codigo_snapshot: art ? art.codigo : null,
        descripcion_snapshot: art ? art.descripcion : null,
        cajas: Number(f.inputCajas.value) || null,
        kilos, precio_kg: precioKg,
      });
    }

    await conBotonDeshabilitado(botonGrabar, '⏳ Grabando…', async () => {
      try {
        const compra = await api.post('/api/compras', {
          uid: generarUid(), numero_partida: Number(campoPartida.value), fecha: campoFecha.value,
          alb_proveedor: campoAlbaran.value || null, proveedor_id: proveedor.id, lineas,
        });
        mostrarAviso(contenedor, `Compra grabada (partida ${compra.numero_partida}).`, 'ok');
        cuerpoTabla.innerHTML = ''; filas.length = 0; pieTotales.textContent = '';
        campoAlbaran.value = ''; campoPartida.value = '';
        await cargarRecientes();
      } catch (err) {
        mostrarAviso(contenedor, err.message, 'error');
      }
    });
  }

  anadirLinea();

  contenedor.appendChild(el('h3', {}, 'Compras recientes'));
  const divRecientes = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divRecientes);

  async function cargarRecientes() {
    const compras = await api.get('/api/compras');
    divRecientes.innerHTML = '';
    if (!compras.length) { divRecientes.appendChild(el('p', { class: 'vacio' }, 'No hay compras todavía.')); return; }
    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Fecha', 'Partida', 'Proveedor', 'Kilos', 'Total factura'].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const c of compras.slice(0, 30)) {
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-etiqueta': 'Fecha' }, String(c.fecha).slice(0, 10)),
        el('td', { 'data-etiqueta': 'Partida' }, String(c.numero_partida)),
        el('td', { 'data-etiqueta': 'Proveedor' }, c.proveedor_nombre_snapshot || ''),
        el('td', { 'data-etiqueta': 'Kilos' }, numero(c.total_kilos, 3)),
        el('td', { 'data-etiqueta': 'Total' }, euros(c.total_factura)),
      ]));
    }
    tabla.appendChild(tbody);
    divRecientes.appendChild(tabla);
  }
  await cargarRecientes();
}

export default { render };
