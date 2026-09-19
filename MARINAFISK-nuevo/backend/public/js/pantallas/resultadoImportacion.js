// Panel de resultado de una importación de Excel (Fase 6) — mismo
// contenido que mostraban los modales del HTML actual (nuevos/modificados/
// sin cambios/…), pero como un panel normal de la pantalla en vez de un
// modal aparte.
import { el } from '../utilidades.js';

export function panelErrores(contenedorResultado, errores) {
  contenedorResultado.innerHTML = '';
  contenedorResultado.appendChild(el('div', { class: 'aviso error' }, [
    el('strong', {}, '⚠️ No se ha importado nada — corrígelo e inténtalo de nuevo:'),
    el('ul', { style: 'margin:6px 0 0 18px;' }, errores.map((e) => el('li', {}, e))),
  ]));
}

// secciones: [{ titulo, clase, items }] — cada items es un array de strings
// o de {codigo, detalle}. clase es 'ok' | 'error' | 'margen' para el color.
export function panelResumen(contenedorResultado, { resumen, secciones }) {
  contenedorResultado.innerHTML = '';
  const tarjeta = el('div', { class: 'aviso ok' }, [el('p', {}, resumen)]);
  secciones.filter((s) => s.items && s.items.length).forEach((s) => {
    tarjeta.appendChild(el('p', { style: 'font-weight:700;margin-top:8px;' }, `${s.titulo} (${s.items.length})`));
    tarjeta.appendChild(el('ul', { style: 'margin:2px 0 0 18px;font-size:13px;' }, s.items.map((it) =>
      el('li', {}, typeof it === 'string' ? it : `${it.codigo}: ${it.detalle}`))));
  });
  contenedorResultado.appendChild(tarjeta);
}
