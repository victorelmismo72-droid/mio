// Pantalla de Repartos (Reparto Super). No lleva IVA ni partida — es un
// envío interno de mercancía ya facturada de otra forma.
import { api, generarUid } from '../api.js';
import { el, numero, fechaHoy, mostrarAviso, conBotonDeshabilitado } from '../utilidades.js';
import { crearCampoArticulo } from './buscadorArticulo.js';
import { abrirVentanaImpresion, mostrarErrorEnVentana } from '../impresion/motor.js';
import { rellenarEtiquetas } from '../impresion/etiquetas.js';
import { generarPdfFichaEnvio, generarPdfHojaDeRutaReparto, generarPdfCompletoReparto, nombreArchivoCompletoReparto, abrirDocumentoPdf, fechaCorta } from '../impresion/documentosReparto.js';
import { abrirWhatsappMultiple, abrirEmail, pedirYGuardarContactoScanfiskCeleiro, obtenerContactoScanfiskCeleiro } from '../envioScanfisk.js';

async function render(contenedor) {
  contenedor.innerHTML = '';
  const cabecera = el('h2', {}, 'Repartos (Reparto Super)');
  const botonContacto = el('button', { class: 'pequeno secundario', onclick: cambiarContacto, style: 'float:right;' }, '📞 Contacto Scanfisk Celeiro');
  contenedor.appendChild(el('div', {}, [cabecera, botonContacto]));

  async function cambiarContacto() {
    try {
      const guardado = await pedirYGuardarContactoScanfiskCeleiro();
      if (guardado) mostrarAviso(contenedor, '✅ Contacto de Scanfisk Celeiro actualizado (vale para los dos puestos).', 'ok');
    } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
  }

  const articulos = (await api.get('/api/articulos')).filter((a) => a.activo);
  const tarjeta = el('div', { class: 'tarjeta' });
  contenedor.appendChild(tarjeta);

  const campoFecha = el('input', { type: 'date', value: fechaHoy() });
  const campoDestNombre = el('input', { type: 'text', placeholder: 'nombre del destinatario' });
  const campoDestCiudad = el('input', { type: 'text', placeholder: 'ciudad' });
  const campoConductor = el('input', { type: 'text', placeholder: 'conductor (opcional)' });

  tarjeta.appendChild(el('div', { class: 'fila' }, [
    el('div', { class: 'campo' }, [el('label', {}, 'Fecha'), campoFecha]),
    el('div', { class: 'campo' }, [el('label', {}, 'Destinatario'), campoDestNombre]),
    el('div', { class: 'campo' }, [el('label', {}, 'Ciudad'), campoDestCiudad]),
    el('div', { class: 'campo' }, [el('label', {}, 'Conductor'), campoConductor]),
  ]));

  const cuerpoTabla = el('tbody');
  tarjeta.appendChild(el('table', { class: 'lineas-tabla' }, [
    el('thead', {}, el('tr', {}, ['Artículo', 'Lote', 'Cajas', 'Kg', 'Peso etiqueta', ''].map((t) => el('th', {}, t)))),
    cuerpoTabla,
  ]));

  const botonAnadir = el('button', { class: 'secundario', onclick: () => anadirLinea() }, '+ Añadir línea');
  const botonGrabar = el('button', { onclick: grabar }, '💾 Grabar reparto');
  // Igual que verPdfCompletoActual()/verHojaDeRutaActual() del HTML actual:
  // funcionan sobre las líneas que hay ahora mismo en el formulario, SIN
  // necesidad de grabar antes. El "PDF completo" (con las etiquetas visuales
  // de muestra) no está aquí porque necesita datos que solo resuelve el
  // servidor una vez grabado el reparto (caducidad según los días
  // configurados, datos del catálogo…) — está en "Repartos recientes".
  const botonFichaActual = el('button', { class: 'secundario', onclick: verFichaEnvioActual }, '📄 Ver ficha de envío');
  const botonHojaActual = el('button', { class: 'secundario', onclick: verHojaDeRutaActual }, '🚚 Ver hoja de ruta');
  tarjeta.appendChild(el('div', { class: 'fila' }, [botonAnadir, botonGrabar, botonFichaActual, botonHojaActual]));

  const filas = [];

  function anadirLinea() {
    const campoArt = crearCampoArticulo(articulos);
    const inputLote = el('input', { type: 'text' });
    const inputCajas = el('input', { type: 'number', step: 'any' });
    const inputKg = el('input', { type: 'number', step: 'any' });
    const inputPesoEtiqueta = el('input', { type: 'text', placeholder: 'vacío = VER CAJA' });
    campoArt.input.addEventListener('change', () => {
      const art = campoArt.obtener();
      if (art) { fila.barco = art.barco; fila.subzona = art.subzona; fila.artePesca = art.arte_pesca; }
    });
    const fila = { campoArt, inputLote, inputCajas, inputKg, inputPesoEtiqueta, barco: null, subzona: null, artePesca: null };
    const botonQuitar = el('button', { class: 'pequeno peligro', onclick: () => { tr.remove(); filas.splice(filas.indexOf(fila), 1); } }, '✕');
    const tr = el('tr', {}, [
      el('td', {}, [campoArt.input, campoArt.datalist]), el('td', {}, inputLote),
      el('td', {}, inputCajas), el('td', {}, inputKg), el('td', {}, inputPesoEtiqueta),
      el('td', {}, botonQuitar),
    ]);
    cuerpoTabla.appendChild(tr);
    filas.push(fila);
  }

  // Réplica de construirRepartoTmpDesdeFormulario() del HTML actual: un
  // "reparto" con la misma forma que devuelve la API, pero sin grabar nada,
  // para poder ver el documento antes de decidir si se graba.
  function construirRepartoDesdeFormulario() {
    const lineas = filas
      .filter((f) => f.campoArt.obtener() && (Number(f.inputCajas.value) || 0) > 0)
      .map((f) => {
        const art = f.campoArt.obtener();
        return {
          lote: f.inputLote.value || null,
          articulo_codigo_snapshot: art.codigo,
          descripcion_snapshot: art.descripcion,
          barco: f.barco, subzona: f.subzona, arte_pesca: f.artePesca,
          cajas: Number(f.inputCajas.value) || 0,
          kg: Number(f.inputKg.value) || 0,
        };
      });
    if (!lineas.length) return null;
    return {
      numero: 0,
      fecha: campoFecha.value,
      destinatario_nombre: campoDestNombre.value,
      destinatario_ciudad: campoDestCiudad.value,
      conductor: campoConductor.value,
      lineas,
      total_cajas: lineas.reduce((s, l) => s + l.cajas, 0),
      total_kg: lineas.reduce((s, l) => s + l.kg, 0),
    };
  }

  async function verFichaEnvioActual() {
    const reparto = construirRepartoDesdeFormulario();
    if (!reparto) return mostrarAviso(contenedor, 'Añade al menos una línea con cajas antes de ver el documento.', 'error');
    try {
      abrirDocumentoPdf(await generarPdfFichaEnvio(reparto));
    } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
  }

  async function verHojaDeRutaActual() {
    const reparto = construirRepartoDesdeFormulario();
    if (!reparto) return mostrarAviso(contenedor, 'Añade al menos una línea con cajas antes de ver el documento.', 'error');
    try {
      abrirDocumentoPdf(await generarPdfHojaDeRutaReparto(reparto));
    } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
  }

  async function grabar() {
    if (!campoDestNombre.value) return mostrarAviso(contenedor, 'Falta el destinatario.', 'error');
    if (!filas.length) return mostrarAviso(contenedor, 'Añade al menos una línea.', 'error');
    const lineas = filas.map((f) => {
      const art = f.campoArt.obtener();
      return {
        articulo_id: art ? art.id : null, articulo_codigo_snapshot: art ? art.codigo : null,
        descripcion_snapshot: art ? art.descripcion : null, lote: f.inputLote.value || null,
        barco: f.barco, subzona: f.subzona, arte_pesca: f.artePesca,
        cajas: Number(f.inputCajas.value) || null, kg: Number(f.inputKg.value) || null,
        peso_etiqueta: f.inputPesoEtiqueta.value || null,
      };
    });
    const totalCajas = lineas.reduce((s, l) => s + (Number(l.cajas) || 0), 0);
    const totalKg = lineas.reduce((s, l) => s + (Number(l.kg) || 0), 0);

    await conBotonDeshabilitado(botonGrabar, '⏳ Grabando…', async () => {
      try {
        const reparto = await api.post('/api/repartos', {
          uid: generarUid(), fecha: campoFecha.value, destinatario_nombre: campoDestNombre.value,
          destinatario_ciudad: campoDestCiudad.value || null, conductor: campoConductor.value || null,
          total_cajas: totalCajas, total_kg: totalKg, lineas,
        });
        mostrarAviso(contenedor, `Reparto nº ${reparto.numero} grabado.`, 'ok');
        cuerpoTabla.innerHTML = ''; filas.length = 0;
        campoDestNombre.value = ''; campoDestCiudad.value = ''; campoConductor.value = '';
        await cargarRecientes();
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }

  anadirLinea();

  contenedor.appendChild(el('h3', {}, 'Repartos recientes'));
  const divRecientes = el('div', {}, el('p', { class: 'cargando' }, 'Cargando…'));
  contenedor.appendChild(divRecientes);

  async function cargarRecientes() {
    const repartos = await api.get('/api/repartos');
    divRecientes.innerHTML = '';
    if (!repartos.length) { divRecientes.appendChild(el('p', { class: 'vacio' }, 'No hay repartos todavía.')); return; }
    const tabla = el('table');
    tabla.appendChild(el('thead', {}, el('tr', {}, ['Nº', 'Fecha', 'Destinatario', 'Cajas', 'Kg', ''].map((t) => el('th', {}, t)))));
    const tbody = el('tbody');
    for (const r of repartos.slice(0, 30)) {
      const botonEtiquetas = el('button', { class: 'pequeno secundario', onclick: () => imprimirEtiquetasReparto(r.id) }, '🏷️ Etiquetas');
      const botonFicha = el('button', { class: 'pequeno secundario', onclick: () => verFichaEnvioReparto(r.id) }, '📄 Ficha');
      const botonHoja = el('button', { class: 'pequeno secundario', onclick: () => verHojaDeRutaReparto(r.id) }, '🚚 Hoja ruta');
      const botonCompleto = el('button', { class: 'pequeno secundario', onclick: () => verPdfCompletoReparto(r.id) }, '📦 Completo');
      const botonDescargar = el('button', { class: 'pequeno secundario', onclick: () => descargarPdfCompletoReparto(r.id, botonDescargar) }, '⬇️ Descargar');
      const botonWhatsapp = el('button', { class: 'pequeno secundario', onclick: () => enviarPorWhatsapp(r.id, botonWhatsapp) }, '📲 WhatsApp');
      const botonEmail = el('button', { class: 'pequeno secundario', onclick: () => enviarPorEmail(r.id, botonEmail) }, '✉️ Email');
      tbody.appendChild(el('tr', {}, [
        el('td', { 'data-etiqueta': 'Nº' }, String(r.numero)),
        el('td', { 'data-etiqueta': 'Fecha' }, String(r.fecha).slice(0, 10)),
        el('td', { 'data-etiqueta': 'Destinatario' }, `${r.destinatario_nombre || ''} ${r.destinatario_ciudad ? '(' + r.destinatario_ciudad + ')' : ''}`),
        el('td', { 'data-etiqueta': 'Cajas' }, numero(r.total_cajas, 0)),
        el('td', { 'data-etiqueta': 'Kg' }, numero(r.total_kg, 3)),
        el('td', {}, [botonEtiquetas, botonFicha, botonHoja, botonCompleto, botonDescargar, botonWhatsapp, botonEmail]),
      ]));
    }
    tabla.appendChild(tbody);
    divRecientes.appendChild(tabla);
  }

  // Si el reparto ya se había impreso antes Y ahora hay más cajas que la
  // última vez (se añadieron líneas/cajas), pregunta qué imprimir — igual
  // que ejecutarImpresionReparto() del HTML actual. Si no hay ese conflicto,
  // imprime "todas" directamente sin preguntar nada.
  async function imprimirEtiquetasReparto(repartoId) {
    let reparto;
    try {
      reparto = await api.get(`/api/repartos/${repartoId}`);
    } catch (err) { return mostrarAviso(contenedor, err.message, 'error'); }

    const conAlgoYaImpreso = reparto.lineas.some((l) => (Number(l.cajas_impresas) || 0) > 0);
    const conAlgoNuevo = reparto.lineas.some((l) => (Number(l.cajas) || 0) > (Number(l.cajas_impresas) || 0));
    let modo = 'todas';
    if (conAlgoYaImpreso && conAlgoNuevo) {
      modo = confirm('Este reparto ya se había impreso, y parece que se han añadido cajas desde la última vez.\n\nAceptar = imprimir solo lo nuevo.\nCancelar = imprimir todo otra vez.') ? 'nuevas' : 'todas';
    }

    const ventana = abrirVentanaImpresion('Etiquetas');
    if (!ventana) return;
    (async () => {
      try {
        const resultado = await api.get(`/api/repartos/${repartoId}/etiquetas?modo=${modo}`);
        rellenarEtiquetas(ventana, resultado);
        await api.post(`/api/repartos/${repartoId}/marcar-etiquetas-impresas`, {});
      } catch (err) {
        mostrarErrorEnVentana(ventana, err.message);
        mostrarAviso(contenedor, err.message, 'error');
      }
    })();
  }

  async function verFichaEnvioReparto(repartoId) {
    try {
      const reparto = await api.get(`/api/repartos/${repartoId}`);
      abrirDocumentoPdf(await generarPdfFichaEnvio(reparto));
    } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
  }

  async function verHojaDeRutaReparto(repartoId) {
    try {
      const reparto = await api.get(`/api/repartos/${repartoId}`);
      abrirDocumentoPdf(await generarPdfHojaDeRutaReparto(reparto));
    } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
  }

  // El "PDF completo" necesita, además del reparto, los datos ya resueltos
  // de cada etiqueta (caducidad según los días configurados, datos del
  // catálogo…) — se reutiliza el mismo endpoint que ya usa el botón
  // "🏷️ Etiquetas" en vez de duplicar esa lógica de negocio aquí, y se
  // deduplica por producto+lote en generarPdfCompletoReparto porque esto es
  // una muestra visual (una etiqueta por producto distinto), no las
  // etiquetas reales para pegar en cada caja.
  async function obtenerRepartoParaPdfCompleto(repartoId) {
    const [reparto, resultado] = await Promise.all([
      api.get(`/api/repartos/${repartoId}`),
      api.get(`/api/repartos/${repartoId}/etiquetas?modo=todas`),
    ]);
    return { reparto, datosEtiquetas: resultado.datos };
  }

  async function verPdfCompletoReparto(repartoId) {
    try {
      const { reparto, datosEtiquetas } = await obtenerRepartoParaPdfCompleto(repartoId);
      abrirDocumentoPdf(await generarPdfCompletoReparto(reparto, datosEtiquetas));
    } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
  }

  async function descargarPdfCompletoReparto(repartoId, boton) {
    await conBotonDeshabilitado(boton, '⏳', async () => {
      try {
        const { reparto, datosEtiquetas } = await obtenerRepartoParaPdfCompleto(repartoId);
        const doc = await generarPdfCompletoReparto(reparto, datosEtiquetas);
        doc.save(nombreArchivoCompletoReparto(reparto));
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }

  // Réplica de enviarPdfCompletoDeReparto(uid, canal) del HTML actual: el
  // navegador no puede adjuntar el PDF solo con un enlace, así que se
  // descarga primero y se abre WhatsApp/el correo con el mensaje ya escrito
  // — la propia alerta se lo recuerda al usuario, igual que antes.
  async function enviarPorWhatsapp(repartoId, boton) {
    await conBotonDeshabilitado(boton, '⏳', async () => {
      try {
        const contacto = await obtenerContactoScanfiskCeleiro();
        if (!contacto.tel) return mostrarAviso(contenedor, 'Todavía no has puesto el teléfono de administración de Scanfisk en Celeiro. Usa el botón "📞 Contacto Scanfisk Celeiro" primero.', 'error');
        const { reparto, datosEtiquetas } = await obtenerRepartoParaPdfCompleto(repartoId);
        const doc = await generarPdfCompletoReparto(reparto, datosEtiquetas);
        const nombreArchivo = nombreArchivoCompletoReparto(reparto);
        doc.save(nombreArchivo);
        const destino = `${reparto.destinatario_nombre || ''} ${reparto.destinatario_ciudad || ''}`.trim();
        const mensaje = `Hola, adjuntamos la ficha de envío y las etiquetas del reparto Nº ${reparto.numero} de ${destino} (${fechaCorta(reparto.fecha)}). Un saludo.`;
        alert(`Archivo "${nombreArchivo}" descargado.\n\nAhora se abrirá WhatsApp con el mensaje preparado — solo tienes que ADJUNTAR ese PDF (lo tienes en tu carpeta de Descargas) y pulsar enviar.`);
        abrirWhatsappMultiple(contacto.tel, mensaje);
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }

  async function enviarPorEmail(repartoId, boton) {
    await conBotonDeshabilitado(boton, '⏳', async () => {
      try {
        const contacto = await obtenerContactoScanfiskCeleiro();
        if (!contacto.email) return mostrarAviso(contenedor, 'Todavía no has puesto el email de administración de Scanfisk en Celeiro. Usa el botón "📞 Contacto Scanfisk Celeiro" primero.', 'error');
        const { reparto, datosEtiquetas } = await obtenerRepartoParaPdfCompleto(repartoId);
        const doc = await generarPdfCompletoReparto(reparto, datosEtiquetas);
        const nombreArchivo = nombreArchivoCompletoReparto(reparto);
        doc.save(nombreArchivo);
        const destino = `${reparto.destinatario_nombre || ''} ${reparto.destinatario_ciudad || ''}`.trim();
        const asunto = `Reparto Nº ${reparto.numero} - ${destino}`;
        const cuerpo = `Buenos días,\n\nAdjuntamos la ficha de envío y las etiquetas del reparto Nº ${reparto.numero} de ${destino} de fecha ${fechaCorta(reparto.fecha)}.\n\nUn saludo,\nMARINAFISK PESCADOS, S.A.`;
        alert(`Archivo "${nombreArchivo}" descargado.\n\nAhora se abrirá tu programa de correo con el mensaje preparado — solo tienes que ADJUNTAR ese PDF (lo tienes en tu carpeta de Descargas) y pulsar enviar.`);
        abrirEmail(contacto.email, asunto, cuerpo);
      } catch (err) { mostrarAviso(contenedor, err.message, 'error'); }
    });
  }

  await cargarRecientes();
}

export default { render };
