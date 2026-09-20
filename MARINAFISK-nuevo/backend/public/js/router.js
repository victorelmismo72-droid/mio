// Router muy sencillo basado en el "hash" de la URL (#/pedidos, #/compras...).
// Cada pantalla es un módulo con una función render(contenedor) async.
const pantallas = new Map();

export function registrarPantalla(ruta, modulo) {
  pantallas.set(ruta, modulo);
}

export function iniciarRouter(contenedor, rutaPorDefecto) {
  async function pintar() {
    const ruta = location.hash.replace(/^#\/?/, '') || rutaPorDefecto;
    const modulo = pantallas.get(ruta) || pantallas.get(rutaPorDefecto);
    document.querySelectorAll('nav.principal a').forEach((a) => {
      a.classList.toggle('activo', a.getAttribute('href') === `#/${ruta}`);
    });
    contenedor.innerHTML = '<p class="cargando">Cargando…</p>';
    try {
      await modulo.render(contenedor);
    } catch (err) {
      console.error(err);
      contenedor.innerHTML = `<div class="aviso error">Error cargando la pantalla: ${err.message}</div>`;
    }
  }
  window.addEventListener('hashchange', pintar);
  pintar();
}
