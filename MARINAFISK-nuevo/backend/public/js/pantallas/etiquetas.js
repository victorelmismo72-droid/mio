// Pantalla "Etiquetas sueltas" (FASE_5) — impresión manual, sin pedido,
// traspaso ni reparto detrás. Mismo formulario que la pantalla "es-" del
// HTML actual: cliente, artículo, fecha, cantidad, y overrides opcionales
// de zona/subzona/arte de pesca/peso/lote para cuando el dato real de ese
// envío concreto no coincide con el genérico del catálogo.
import { api } from '../api.js';
import { el, fechaHoy, mostrarAviso } from '../utilidades.js';
import { crearCampoArticulo, crearCampoCliente } from './buscadorArticulo.js';
import { abrirVentanaImpresion, mostrarErrorEnVentana } from '../impresion/motor.js';
import { rellenarEtiquetas } from '../impresion/etiquetas.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Etiquetas sueltas'));
  contenedor.appendChild(el('p', {}, 'Para imprimir una o varias etiquetas de trazabilidad sin que haya un pedido, traspaso o reparto detrás.'));

  const [clientes, articulosTodos, formatos, configCaducidad] = await Promise.all([
    api.get('/api/clientes'), api.get('/api/articulos'), api.get('/api/etiquetas/formatos'), api.get('/api/configuracion/dias-caducidad'),
  ]);
  const articulos = articulosTodos.filter((a) => a.activo);

  const tarjeta = el('div', { class: 'tarjeta' });
  contenedor.appendChild(tarjeta);

  const campoCliente = crearCampoCliente(clientes);
  const campoArticulo = crearCampoArticulo(articulos);
  const campoFecha = el('input', { type: 'date', value: fechaHoy() });
  const campoCantidad = el('input', { type: 'number', min: '1', value: '1' });
  const campoFormato = el('select', {}, [
    el('option', { value: '' }, '(automático según el cliente)'),
    ...formatos.map((f) => el('option', { value: f.id }, f.nombre)),
  ]);
  campoCliente.input.addEventListener('change', () => {
    const c = campoCliente.obtener();
    campoFormato.value = (c && c.formato_etiqueta) || '';
  });

  tarjeta.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Cliente'), campoCliente.input, campoCliente.datalist]),
    el('div', { class: 'campo' }, [el('label', {}, 'Artículo'), campoArticulo.input, campoArticulo.datalist]),
    el('div', { class: 'campo' }, [el('label', {}, 'Fecha'), campoFecha]),
    el('div', { class: 'campo' }, [el('label', {}, 'Cantidad de etiquetas'), campoCantidad]),
    el('div', { class: 'campo' }, [el('label', {}, 'Formato'), campoFormato]),
  ]));

  const campoZona = el('input', { type: 'text', placeholder: '(del artículo)' });
  const campoSubzona = el('input', { type: 'text', placeholder: '(del artículo)' });
  const campoArte = el('input', { type: 'text', placeholder: '(del artículo)' });
  const campoPeso = el('input', { type: 'text', placeholder: 'vacío = del artículo' });
  const campoLote = el('input', { type: 'text', placeholder: 'vacío = calculado de la fecha' });

  tarjeta.appendChild(el('p', {}, el('small', {}, 'Solo si el dato real de este envío no coincide con el genérico del artículo:')));
  tarjeta.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Zona FAO'), campoZona]),
    el('div', { class: 'campo' }, [el('label', {}, 'Subzona'), campoSubzona]),
    el('div', { class: 'campo' }, [el('label', {}, 'Arte de pesca'), campoArte]),
    el('div', { class: 'campo' }, [el('label', {}, 'Peso (kg)'), campoPeso]),
    el('div', { class: 'campo' }, [el('label', {}, 'Lote'), campoLote]),
  ]));

  let diasCaducidad = configCaducidad.dias;
  const etiquetaCaducidad = el('span', {}, `Caducidad: fecha + ${diasCaducidad} días (12 días fijo para el formato francés).`);
  const botonConfigurarCaducidad = el('button', { class: 'pequeno secundario', onclick: configurarCaducidad }, '⚙️ Configurar días de caducidad');
  const botonImprimir = el('button', { onclick: imprimir }, '🏷️ Imprimir etiqueta(s)');
  tarjeta.appendChild(el('div', { class: 'fila' }, [botonImprimir, botonConfigurarCaducidad, etiquetaCaducidad]));

  async function configurarCaducidad() {
    const nuevo = prompt('¿Cuántos días después de la fecha del documento debe caducar la etiqueta? (no afecta al formato francés, que siempre es 12 días fijo)', String(diasCaducidad));
    if (nuevo === null) return;
    const dias = parseInt(nuevo, 10);
    if (!Number.isFinite(dias) || dias <= 0) return mostrarAviso(contenedor, 'Introduce un número de días válido.', 'error');
    try {
      await api.put('/api/configuracion/dias-caducidad', { dias });
      diasCaducidad = dias;
      etiquetaCaducidad.textContent = `Caducidad: fecha + ${diasCaducidad} días (12 días fijo para el formato francés).`;
      mostrarAviso(contenedor, 'Guardado — vale para los dos puestos (CORU y PANC).', 'ok');
    } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
  }

  function imprimir() {
    const cliente = campoCliente.obtener();
    const articulo = campoArticulo.obtener();
    if (!cliente) return mostrarAviso(contenedor, 'Elige un cliente.', 'error');
    if (!articulo) return mostrarAviso(contenedor, 'Elige un artículo.', 'error');
    if (!campoFecha.value) return mostrarAviso(contenedor, 'Falta la fecha.', 'error');

    // La ventana se abre aquí mismo, dentro del clic — mismo motivo que en
    // el resto de la impresión (ver impresion/motor.js).
    const ventana = abrirVentanaImpresion('Etiquetas');
    if (!ventana) return;

    (async () => {
      try {
        const resultado = await api.post('/api/etiquetas/sueltas', {
          cliente_id: cliente.id, articulo_id: articulo.id, fecha: campoFecha.value,
          cantidad: Number(campoCantidad.value) || 1, formato_id: campoFormato.value || undefined,
          zona: campoZona.value || undefined, subzona: campoSubzona.value || undefined,
          arte_pesca: campoArte.value || undefined, peso: campoPeso.value || undefined, lote: campoLote.value || undefined,
        });
        rellenarEtiquetas(ventana, resultado);
      } catch (err) {
        mostrarErrorEnVentana(ventana, err.message);
        mostrarAviso(contenedor, err.message, 'error');
      }
    })();
  }
}

export default { render };
