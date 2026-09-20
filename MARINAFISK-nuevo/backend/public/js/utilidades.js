// Pequeñas ayudas usadas por varias pantallas, para no repetir código.

export function el(etiqueta, atributos = {}, hijos = []) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (clave === 'class') nodo.className = valor;
    else if (clave.startsWith('on') && typeof valor === 'function') nodo.addEventListener(clave.slice(2), valor);
    else if (valor !== undefined && valor !== null) nodo.setAttribute(clave, valor);
  }
  for (const hijo of [].concat(hijos)) {
    if (hijo === null || hijo === undefined) continue;
    nodo.appendChild(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo);
  }
  return nodo;
}

export function euros(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function numero(valor, decimales = 2) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

export function fechaHoy() {
  // Fecha local (España), nunca UTC — ver FASE_0 punto 7: un fallo pasado
  // usaba toISOString(), que puede dar el día equivocado pasada la
  // medianoche. Aquí se construye la fecha a mano con las piezas locales.
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function debounce(fn, ms = 300) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), ms);
  };
}

export function mostrarAviso(contenedor, mensaje, tipo = 'ok') {
  const aviso = el('div', { class: `aviso ${tipo}` }, mensaje);
  contenedor.prepend(aviso);
  setTimeout(() => aviso.remove(), 6000);
  return aviso;
}

// Deshabilita un botón mientras se ejecuta una acción async, y lo reactiva
// pase lo que pase (éxito o error) — corrección 02/09/2026 punto 1: el
// servidor ya protege contra el doble clic de verdad, pero además la
// pantalla no debe dejar que parezca que no ha pasado nada al pulsar dos
// veces.
export async function conBotonDeshabilitado(boton, textoProcesando, fn) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoProcesando;
  try {
    return await fn();
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}
