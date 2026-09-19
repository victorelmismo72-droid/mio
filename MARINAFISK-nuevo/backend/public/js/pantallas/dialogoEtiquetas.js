// Panel de impresión de etiquetas de UN pedido concreto — mismas 4 opciones
// que el diálogo del HTML actual (FASE_5 punto 1.5): todas las líneas, una
// selección de líneas, una etiqueta de prueba, o repetir N de una línea a
// mano. Se usa igual desde Pedidos (recientes) e Historial, para no repetir
// el diálogo dos veces.
import { api } from '../api.js';
import { el, mostrarAviso } from '../utilidades.js';
import { abrirVentanaImpresion, mostrarErrorEnVentana } from '../impresion/motor.js';
import { rellenarEtiquetas } from '../impresion/etiquetas.js';

// Reemplaza el contenido de "contenedorPanel" con el formulario para el
// pedido "pedidoId". "avisosEn" es el contenedor donde mostrar los avisos de
// error (normalmente la pantalla entera, no el propio panel, que puede
// cerrarse).
export async function abrirPanelEtiquetasPedido(contenedorPanel, pedidoId, avisosEn) {
  contenedorPanel.innerHTML = '';
  contenedorPanel.appendChild(el('p', { class: 'cargando' }, 'Cargando líneas del pedido…'));
  let pedido;
  try {
    pedido = await api.get(`/api/pedidos/${pedidoId}`);
  } catch (err) {
    contenedorPanel.innerHTML = '';
    return mostrarAviso(avisosEn, err.message, 'error');
  }
  if (!pedido.lineas.length) {
    contenedorPanel.innerHTML = '';
    return mostrarAviso(avisosEn, 'Este pedido no tiene líneas.', 'error');
  }

  contenedorPanel.innerHTML = '';
  const tarjeta = el('div', { class: 'tarjeta' });
  contenedorPanel.appendChild(tarjeta);
  tarjeta.appendChild(el('h3', {}, `Etiquetas — pedido nº ${pedido.numero}`));

  const descripcionLinea = (l) => `${l.articulo_codigo_snapshot || '?'} — ${l.descripcion_snapshot || ''} (cant. ${l.cantidad || 0})`;

  const opciones = [
    { valor: 'todas', texto: 'Imprimir todas las etiquetas del albarán' },
    { valor: 'seleccion', texto: 'Imprimir solo las líneas seleccionadas' },
    { valor: 'prueba', texto: 'Imprimir una sola etiqueta de prueba' },
    { valor: 'repetir', texto: 'Repetir etiquetas de una línea concreta' },
  ];
  const radios = opciones.map((o) => el('input', { type: 'radio', name: `etq-opcion-${pedidoId}`, value: o.valor, checked: o.valor === 'todas' ? '' : undefined }));
  const filaOpciones = el('div', {}, opciones.map((o, i) => el('label', { style: 'display:block;margin-bottom:4px;' }, [radios[i], ' ', o.texto])));
  tarjeta.appendChild(filaOpciones);

  const subSeleccion = el('div', { style: 'margin-left:20px;display:none;' },
    pedido.lineas.map((l) => el('label', { style: 'display:block;font-size:13px;' }, [
      el('input', { type: 'checkbox', class: 'etq-chk-linea', value: l.id, checked: '' }), ` ${descripcionLinea(l)}`,
    ])));
  const selectLineaPrueba = el('select', {}, pedido.lineas.map((l) => el('option', { value: l.id }, descripcionLinea(l))));
  const subPrueba = el('div', { style: 'margin-left:20px;display:none;' }, [el('label', {}, ['Línea a probar: ', selectLineaPrueba])]);
  const selectLineaRepetir = el('select', {}, pedido.lineas.map((l) => el('option', { value: l.id }, descripcionLinea(l))));
  const campoNumRepetir = el('input', { type: 'number', min: '1', value: '1', style: 'width:70px;' });
  const subRepetir = el('div', { style: 'margin-left:20px;display:none;' }, [
    el('label', {}, ['Línea: ', selectLineaRepetir]), el('br'),
    el('label', {}, ['Número de etiquetas: ', campoNumRepetir]),
  ]);
  tarjeta.appendChild(subSeleccion);
  tarjeta.appendChild(subPrueba);
  tarjeta.appendChild(subRepetir);

  function actualizarSubopciones() {
    const opcion = radios.find((r) => r.checked).value;
    subSeleccion.style.display = opcion === 'seleccion' ? 'block' : 'none';
    subPrueba.style.display = opcion === 'prueba' ? 'block' : 'none';
    subRepetir.style.display = opcion === 'repetir' ? 'block' : 'none';
  }
  radios.forEach((r) => r.addEventListener('change', actualizarSubopciones));
  actualizarSubopciones();

  const botonImprimir = el('button', { onclick: imprimir }, '🏷️ Imprimir etiquetas');
  const botonCerrar = el('button', { class: 'secundario', onclick: () => { contenedorPanel.innerHTML = ''; } }, 'Cerrar');
  tarjeta.appendChild(el('div', { class: 'fila' }, [botonImprimir, botonCerrar]));

  function imprimir() {
    const opcion = radios.find((r) => r.checked).value;
    const params = new URLSearchParams({ modo: opcion });
    if (opcion === 'seleccion') {
      const ids = Array.from(tarjeta.querySelectorAll('.etq-chk-linea:checked')).map((c) => c.value);
      if (!ids.length) return mostrarAviso(avisosEn, 'Selecciona al menos una línea.', 'error');
      params.set('lineas', ids.join(','));
    } else if (opcion === 'prueba') {
      params.set('linea', selectLineaPrueba.value);
    } else if (opcion === 'repetir') {
      params.set('linea', selectLineaRepetir.value);
      params.set('cantidad', campoNumRepetir.value || '1');
    }

    // La ventana se abre aquí mismo, dentro del clic — mismo motivo que en
    // el resto de la impresión (ver impresion/motor.js).
    const ventana = abrirVentanaImpresion('Etiquetas');
    if (!ventana) return;

    (async () => {
      try {
        const resultado = await api.get(`/api/pedidos/${pedidoId}/etiquetas?${params.toString()}`);
        rellenarEtiquetas(ventana, resultado);
        contenedorPanel.innerHTML = '';
      } catch (err) {
        mostrarErrorEnVentana(ventana, err.message);
        mostrarAviso(avisosEn, err.message, 'error');
      }
    })();
  }
}
