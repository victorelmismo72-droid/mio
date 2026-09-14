// Campo de texto con autocompletado (datalist nativo del navegador, sin
// librerías) para elegir un registro de una lista larga (artículo, cliente)
// por código o por nombre, sin tener que desplazarse por un desplegable
// gigante.
import { el } from '../utilidades.js';

let contador = 0;

function crearCampoBusqueda(registros, textoOpcion, seleccionInicial) {
  contador += 1;
  const idLista = `dl-buscador-${contador}`;
  const datalist = el('datalist', { id: idLista },
    registros.map((r) => el('option', { value: textoOpcion(r) })));
  const input = el('input', { list: idLista, placeholder: 'Código o nombre…' });
  let seleccionado = null;

  function resolver() {
    const texto = input.value.split('—')[0].trim().toUpperCase();
    seleccionado = registros.find((r) => String(r.codigo).toUpperCase() === texto) || null;
    return seleccionado;
  }
  input.addEventListener('change', resolver);
  input.addEventListener('blur', resolver);

  if (seleccionInicial) {
    input.value = textoOpcion(seleccionInicial);
    seleccionado = seleccionInicial;
  }
  return { input, datalist, obtener: () => seleccionado };
}

export function crearCampoArticulo(articulos, seleccionInicial) {
  return crearCampoBusqueda(articulos, (a) => `${a.codigo} — ${a.descripcion}`, seleccionInicial);
}

export function crearCampoCliente(clientes, seleccionInicial) {
  return crearCampoBusqueda(clientes, (c) => `${c.codigo} — ${c.nombre}`, seleccionInicial);
}
