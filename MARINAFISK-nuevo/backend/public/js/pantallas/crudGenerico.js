// Fábrica de pantallas sencillas de catálogo (listar + crear + editar),
// reutilizada por Clientes/Artículos/Proveedores para no repetir casi el
// mismo código tres veces.
import { api } from '../api.js';
import { el, mostrarAviso, conBotonDeshabilitado } from '../utilidades.js';

export function crearPantallaCrud({ titulo, ruta, columnas, camposFormulario, importadores }) {
  async function render(contenedor) {
    contenedor.innerHTML = '';
    contenedor.appendChild(el('h2', {}, titulo));

    // Fase 6: uno o varios botones "Importar desde Excel" (catálogo real,
    // no el import de etiquetas de Scanfisk — ver FASE_6). Cada importador
    // se encarga de su propio parseo/validación y de llamar a la ruta del
    // servidor; aquí solo se le da un sitio donde pintar el resultado y una
    // forma de refrescar la tabla al terminar.
    if (importadores && importadores.length) {
      const divImport = el('div', { class: 'tarjeta' });
      const divResultadoImport = el('div', {});
      const botones = importadores.map((imp) => {
        const inputFile = el('input', { type: 'file', accept: imp.accept || '.xlsx,.xls', style: 'display:none;' });
        inputFile.addEventListener('change', async () => {
          const file = inputFile.files[0];
          inputFile.value = '';
          if (!file) return;
          await imp.manejar(file, { contenedorResultado: divResultadoImport, contenedorAviso: contenedor, recargar: cargarTabla });
        });
        return el('span', {}, [el('button', { class: 'secundario', onclick: () => inputFile.click() }, imp.etiqueta), inputFile]);
      });
      divImport.appendChild(el('div', { class: 'fila' }, botones));
      divImport.appendChild(divResultadoImport);
      contenedor.appendChild(divImport);
    }

    const divFormulario = el('div', { class: 'tarjeta' });
    const divTitulo = el('h3', {}, 'Nuevo registro');
    const divTabla = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
    contenedor.appendChild(divFormulario);
    contenedor.appendChild(divTabla);

    let editandoId = null;
    let botonGuardar;
    const inputs = {};

    function campoAInput(campo) {
      if (campo.tipo === 'checkbox') {
        const input = el('input', { type: 'checkbox', id: `c-${campo.clave}` });
        input.checked = !!campo.defecto;
        return input;
      }
      if (campo.tipo === 'select') {
        return el('select', { id: `c-${campo.clave}` }, campo.opciones.map((o) => el('option', { value: o.valor }, o.etiqueta)));
      }
      return el('input', { type: campo.tipo || 'text', id: `c-${campo.clave}`, step: campo.tipo === 'number' ? 'any' : undefined });
    }

    function limpiarFormulario() {
      editandoId = null;
      divTitulo.textContent = 'Nuevo registro';
      for (const campo of camposFormulario) {
        const input = inputs[campo.clave];
        if (campo.tipo === 'checkbox') input.checked = !!campo.defecto;
        else input.value = campo.defecto ?? '';
      }
    }

    async function guardar() {
      const cuerpo = {};
      for (const campo of camposFormulario) {
        const input = inputs[campo.clave];
        if (campo.tipo === 'checkbox') cuerpo[campo.clave] = input.checked;
        else if (input.value !== '') cuerpo[campo.clave] = campo.tipo === 'number' ? Number(input.value) : input.value;
      }
      await conBotonDeshabilitado(botonGuardar, 'Guardando…', async () => {
        try {
          if (editandoId) await api.put(`${ruta}/${editandoId}`, cuerpo);
          else await api.post(ruta, cuerpo);
          mostrarAviso(contenedor, 'Guardado correctamente.', 'ok');
          limpiarFormulario();
          await cargarTabla();
        } catch (err) {
          mostrarAviso(contenedor, err.message, 'error');
        }
      });
    }

    function editar(fila) {
      editandoId = fila.id;
      divTitulo.textContent = `Editando: ${fila.codigo || fila.id}`;
      for (const campo of camposFormulario) {
        const input = inputs[campo.clave];
        if (campo.tipo === 'checkbox') input.checked = !!fila[campo.clave];
        else input.value = fila[campo.clave] ?? '';
      }
      divFormulario.scrollIntoView({ behavior: 'smooth' });
    }

    async function cargarTabla() {
      const filas = await api.get(ruta);
      divTabla.innerHTML = '';
      if (!filas.length) { divTabla.appendChild(el('p', { class: 'vacio' }, 'No hay registros todavía.')); return; }
      const tabla = el('table');
      tabla.appendChild(el('thead', {}, el('tr', {}, [...columnas.map((c) => el('th', {}, c.etiqueta)), el('th', {}, '')])));
      const tbody = el('tbody');
      for (const fila of filas) {
        tbody.appendChild(el('tr', {}, [
          ...columnas.map((c) => el('td', { 'data-etiqueta': c.etiqueta }, c.formatear ? c.formatear(fila[c.clave], fila) : String(fila[c.clave] ?? ''))),
          el('td', {}, el('button', { class: 'pequeno secundario', onclick: () => editar(fila) }, 'Editar')),
        ]));
      }
      tabla.appendChild(tbody);
      divTabla.appendChild(tabla);
    }

    const camposDom = camposFormulario.map((campo) => {
      const input = campoAInput(campo);
      inputs[campo.clave] = input;
      return el('div', { class: 'campo' }, [el('label', {}, campo.etiqueta), input]);
    });
    botonGuardar = el('button', { onclick: guardar }, 'Guardar');
    divFormulario.appendChild(divTitulo);
    divFormulario.appendChild(el('div', { class: 'fila' }, [
      ...camposDom,
      botonGuardar,
      el('button', { class: 'secundario', onclick: limpiarFormulario }, 'Cancelar'),
    ]));

    await cargarTabla();
  }
  return { render };
}
