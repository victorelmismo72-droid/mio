// Catálogo de modelos de impresión (corrección 02/09/2026 punto 8):
// generado automáticamente desde el registro central del backend, nunca
// mantenido a mano en dos sitios. Incluye el editor de calibración en
// milímetros para los que se imprimen sobre papel pre-impreso (punto 7).
import { api } from '../api.js';
import { el, mostrarAviso, conBotonDeshabilitado } from '../utilidades.js';

function verConRegla(modelo) {
  const ventana = window.open('', '_blank');
  if (!ventana) return;
  ventana.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Regla — ${modelo.nombre}</title>
    <style>
      @page { size: A4; margin: 0; }
      body { margin: 0; }
      .hoja { position: relative; width: 210mm; height: 297mm;
        background-image: linear-gradient(to right, #ddd 0.2mm, transparent 0.2mm), linear-gradient(to bottom, #ddd 0.2mm, transparent 0.2mm);
        background-size: 10mm 10mm; }
      .campo { position: absolute; font-size: 8pt; color: #b00; border: 0.3mm dashed #b00; padding: 0.5mm; white-space: nowrap; }
    </style></head><body><div class="hoja">
      ${modelo.campos.map((c) => `<div class="campo" style="left:${c.xMmActual}mm; top:${c.yMmActual}mm;">${c.etiqueta}</div>`).join('')}
    </div></body></html>`);
  ventana.document.close();
}

function construirEditorCalibracion(contenedor, modelo, alGuardar) {
  const divEditor = el('div', { class: 'tarjeta' });
  divEditor.appendChild(el('h3', {}, `Calibrar: ${modelo.nombre}`));
  divEditor.appendChild(el('p', {}, 'Posición de cada campo en milímetros desde la esquina superior izquierda del papel. Ajusta, imprime una prueba, y repite hasta que quede bien encima del papel real — nunca se acierta a la primera.'));

  const inputs = modelo.campos.map((campo) => {
    const inputX = el('input', { type: 'number', step: '0.5', value: campo.xMmActual });
    const inputY = el('input', { type: 'number', step: '0.5', value: campo.yMmActual });
    return { clave: campo.clave, etiqueta: campo.etiqueta, inputX, inputY };
  });

  for (const c of inputs) {
    divEditor.appendChild(el('div', { class: 'fila' }, [
      el('div', { class: 'campo', style: 'min-width:220px' }, c.etiqueta),
      el('div', { class: 'campo' }, [el('label', {}, 'X (mm)'), c.inputX]),
      el('div', { class: 'campo' }, [el('label', {}, 'Y (mm)'), c.inputY]),
    ]));
  }

  const botonGuardar = el('button', { onclick: guardar }, 'Guardar calibración');
  const botonRegla = el('button', { class: 'secundario', onclick: () => verConRegla({ ...modelo, campos: modelo.campos.map((c, i) => ({ ...c, xMmActual: Number(inputs[i].inputX.value), yMmActual: Number(inputs[i].inputY.value) })) }) }, '📐 Ver con regla');
  const botonRestaurar = el('button', { class: 'secundario', onclick: restaurar }, '↩️ Restaurar de fábrica');
  divEditor.appendChild(el('div', { class: 'fila' }, [botonGuardar, botonRegla, botonRestaurar]));

  async function guardar() {
    await conBotonDeshabilitado(botonGuardar, 'Guardando…', async () => {
      try {
        await api.put(`/api/modelos-impresion/${modelo.id}/calibracion`, {
          campos: inputs.map((c) => ({ clave: c.clave, x_mm: Number(c.inputX.value), y_mm: Number(c.inputY.value) })),
        });
        mostrarAviso(contenedor, 'Calibración guardada.', 'ok');
        await alGuardar();
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }
  async function restaurar() {
    if (!confirm('¿Restaurar las posiciones de fábrica de este modelo? Se perderá el ajuste manual.')) return;
    try {
      await api.del(`/api/modelos-impresion/${modelo.id}/calibracion`);
      mostrarAviso(contenedor, 'Restaurado de fábrica.', 'ok');
      await alGuardar();
    } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
  }

  return divEditor;
}

async function render(contenedor) {
  contenedor.innerHTML = '';
  contenedor.appendChild(el('h2', {}, 'Modelos de impresión'));
  contenedor.appendChild(el('p', {}, 'Todo lo que el sistema puede imprimir o generar — esta lista se genera sola desde el código, nunca hay que actualizarla a mano por separado (corrección 02/09/2026, punto 8).'));

  async function recargar() {
    const modelos = await api.get('/api/modelos-impresion');
    const listado = contenedor.querySelector('#listado-modelos');
    listado.innerHTML = '';
    for (const m of modelos) {
      const tarjeta = el('div', { class: 'tarjeta' });
      tarjeta.appendChild(el('h3', {}, m.nombre));
      tarjeta.appendChild(el('p', {}, m.descripcion));
      tarjeta.appendChild(el('p', {}, [
        el('span', { class: `badge ${m.sobrePapelPreimpreso ? 'margen' : 'ok'}` }, m.sobrePapelPreimpreso ? 'Sobre papel pre-impreso' : 'Documento normal'),
        ' · Se usa en: ' + m.aplicaA.join(', '),
      ]));
      if (m.sobrePapelPreimpreso) {
        const contenedorEditor = el('div', {});
        const botonMostrar = el('button', { class: 'secundario', onclick: async () => {
          contenedorEditor.innerHTML = '';
          contenedorEditor.appendChild(construirEditorCalibracion(contenedor, m, recargar));
        } }, 'Ajustar calibración');
        tarjeta.appendChild(botonMostrar);
        tarjeta.appendChild(contenedorEditor);
      }
      listado.appendChild(tarjeta);
    }
  }

  contenedor.appendChild(el('div', { id: 'listado-modelos' }, el('p', { class: 'cargando' }, 'Cargando…')));
  await recargar();
}

export default { render };
