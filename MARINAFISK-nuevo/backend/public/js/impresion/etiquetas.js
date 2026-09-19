// Motor de impresión de Etiquetas (FASE_5) — mismo patrón de dos pasos que
// impresion/motor.js: abrirVentanaImpresion() se reutiliza tal cual, y aquí
// solo se añade el "paso 2" propio de etiquetas (rellenarEtiquetas), porque
// la rejilla física (50x145mm, rotada, con QR y encabezados de empresa
// distintos por formato) no tiene nada que ver con los documentos "sobre
// papel pre-impreso" que ya sabe rellenar motor.js.
//
// Los 6 formatos comparten la MISMA rejilla de datos — solo cambian el
// encabezado de empresa (franja izquierda) y, en francés/italiano, el
// idioma de las etiquetas de campo y algunos valores traducidos. Ver
// FASE_5_etiquetas_MARINAFISK.md punto 1.3.
import { mostrarErrorEnVentana } from './motor.js';

// Rutas absolutas (con origen incluido): la ventana de impresión se abre en
// blanco (about:blank) y luego se le escribe el HTML entero — una ruta que
// empezara solo por "/" no tendría desde dónde resolverse ahí dentro.
const RUTA_LOGO = `${location.origin}/img/logo_marina_fisk.jpg`;
const RUTA_SELLO = `${location.origin}/img/sello_marina_fisk.jpg`;

// ---- Estilo (mismos tamaños/tipos de letra que el HTML actual) ----
const ESTILO = {
  anchoEtiqueta: '50mm',
  altoEtiqueta: '145mm',
  campoLabel: 'font-size:5.6pt;font-weight:700;',
  destinatarioNombre: 'font-size:8pt;font-weight:900;',
  destinatarioDato: 'font-size:7pt;font-weight:700;',
  productoNombre: 'font-size:7.2pt;font-weight:900;',
  productoCientifico: 'font-size:6pt;font-style:italic;font-weight:700;',
  campoValor: 'font-size:6.6pt;font-weight:700;',
  pesoCaja: 'font-size:9pt;font-weight:900;',
  empresaNombre: 'font-size:6.5pt;font-weight:900;',
  empresaDato: 'font-size:5.4pt;font-weight:600;',
  bordeGrosor: '0.3mm',
};

function construirCssEtiquetas() {
  const E = ESTILO;
  return `*{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;}
    .hoja{width:calc(${E.anchoEtiqueta} * 2);height:${E.altoEtiqueta};display:flex;flex-direction:row;page-break-after:always;break-after:page;overflow:hidden;}
    .hoja:last-child{page-break-after:auto;}
    .etiqueta{width:${E.anchoEtiqueta};height:${E.altoEtiqueta};border:${E.bordeGrosor} solid #000;position:relative;overflow:hidden;}
    .hueco{width:${E.anchoEtiqueta};height:${E.altoEtiqueta};}
    .contenido-rotado{width:${E.altoEtiqueta};height:${E.anchoEtiqueta};position:absolute;top:0;left:${E.anchoEtiqueta};
      transform-origin:top left;transform:rotate(90deg);box-sizing:border-box;padding:1mm;display:flex;flex-direction:row;gap:1mm;}
    .franja-empresa{width:19mm;flex-shrink:0;border-right:${E.bordeGrosor} solid #000;padding-right:1mm;
      display:flex;flex-direction:column;align-items:center;text-align:center;gap:0.5mm;overflow:hidden;}
    .sello{width:13mm;height:13mm;display:flex;align-items:center;justify-content:center;}
    .sello-texto{border:0.3mm solid #000;border-radius:50%;font-size:5px;line-height:1.15;font-weight:700;text-align:center;padding:1mm;}
    .sello img{width:100%;height:100%;object-fit:contain;}
    .empresa-nombre{${E.empresaNombre}} .empresa-dato{${E.empresaDato}}
    .logo-fisk{margin-top:auto;} .logo-fisk img{width:13mm;height:auto;}
    .celda-qr{flex:0 0 auto;width:15mm;align-items:center;justify-content:center;}
    .celda-qr svg{width:13mm;height:13mm;}
    .rejilla{flex:1;display:flex;flex-direction:column;overflow:hidden;height:100%;}
    .fila{display:flex;flex-direction:row;border-bottom:${E.bordeGrosor} solid #000;overflow:hidden;flex-shrink:0;}
    .fila:last-child{border-bottom:none;}
    .fila-superior{height:13mm;} .fila-producto{height:8mm;} .fila-traza{height:10mm;} .fila-destinatario{height:14mm;border-bottom:none;align-items:center;}
    .celda{flex:1;display:flex;flex-direction:column;justify-content:center;gap:0.2mm;border-right:0.25mm solid #999;padding:0.4mm 1mm;overflow:hidden;line-height:1.05;}
    .celda:last-child{border-right:none;}
    .celda-chica{flex:0 0 auto;width:16mm;align-items:center;text-align:center;}
    .celda-producto{flex:2.2;}
    .campo-label{${E.campoLabel}display:block;} .campo-valor{${E.campoValor}display:block;}
    .campo-valor .campo-label{display:inline;} .campo-grande{font-size:9pt;font-weight:900;}
    .producto-nombre{${E.productoNombre}} .producto-cientifico{${E.productoCientifico}}
    .destinatario-nombre{${E.destinatarioNombre}display:block;} .destinatario-dato{${E.destinatarioDato}display:block;}
    .peso-caja{${E.pesoCaja}text-align:center;border:${E.bordeGrosor} solid #000;padding:0.8mm;margin-top:0.3mm;}
    @page{size:calc(${E.anchoEtiqueta} * 2) ${E.altoEtiqueta};margin:0;}`;
}

// ---- Traducciones de valores de campo (mismos diccionarios que el HTML actual) ----
const DICCIONARIO_FR = {
  REFRIGERADO: 'RÉFRIGÉRÉ', CONGELADO: 'CONGELÉ', CAPTURADO: 'CAPTURÉ',
  ACUICULTURA: 'AQUACULTURE', 'PESCA EXTRACTIVA': 'PÊCHE', PESCADO: 'PÊCHÉ',
  'C/C': 'A/T', 'S/C': 'S/T', 'VARIOS BARCOS': 'PLUSIEURS BATEAUX', 'VER CAJA': 'VOIR CAISSE',
};
const DICCIONARIO_IT = {
  REFRIGERADO: 'REFRIGERATO', CONGELADO: 'CONGELATO', CAPTURADO: 'CATTURATO',
  ACUICULTURA: 'ACQUACOLTURA', 'PESCA EXTRACTIVA': 'PESCA', PESCADO: 'PESCATO',
  'C/C': 'C/T', 'S/C': 'S/T', 'VARIOS BARCOS': 'VARIE BARCHE', 'VER CAJA': 'VEDI SCATOLA',
};
function traducir(diccionario, valor) {
  const v = String(valor || '').trim();
  return diccionario[v.toUpperCase()] || v;
}

// Etiquetas de campo por idioma — la propia rejilla de datos (posiciones,
// tamaños) es idéntica; solo cambia el texto fijo y, en fr/it, el nombre del
// producto y algunos valores traducidos.
const TEXTOS = {
  es: { subzona: 'SUBZONA', categoria: 'CATEGORÍA', calibre: 'CALIBRE', fecha: 'FECHA', lote: 'LOTE', cad: 'CAD', peso: 'PESO NETO', arte: 'Arte de Pesca', conserv: 'Modo de conservación', obt: 'OBT', pres: 'PRES', barco: 'BARCO', exp: 'EXPEDIDOR', dest: 'DESTINATARIO', dir: 'DIRECCIÓN', prov: 'PROVINCIA' },
  fr: { subzona: 'SOUS-ZONE', categoria: 'CATÉGORIE', calibre: 'CALIBRE', fecha: 'DATE', lote: 'LOT', cad: 'DLC', peso: 'POIDS NET', arte: 'Engin de pêche', conserv: 'Mode de conservation', obt: 'OBT.', pres: 'PRÉS.', barco: 'NAVIRE', exp: 'EXPÉDITEUR', dest: 'DESTINATAIRE', dir: 'ADRESSE', prov: 'PROVINCE' },
  it: { subzona: 'SOTTOZONA', categoria: 'CATEGORIA', calibre: 'CALIBRO', fecha: 'DATA', lote: 'LOTTO', cad: 'SCAD.', peso: 'PESO NETTO', arte: 'Attrezzo da pesca', conserv: 'Modalità di conservazione', obt: 'OTT.', pres: 'PRES.', barco: 'NAVE', exp: 'SPEDITORE', dest: 'DESTINATARIO', dir: 'INDIRIZZO', prov: 'PROVINCIA' },
};

function generarQrSvg(d) {
  try {
    const texto = `MARINAFISK|PROD:${d.producto}|LOTE:${d.lote}|CAD:${d.caducidad}|DEST:${d.destinatario}`;
    const qr = window.qrcode(0, 'M');
    qr.addData(texto, 'Byte');
    qr.make();
    return qr.createSvgTag({ cellSize: 2, margin: 0 });
  } catch (err) {
    return ''; // si falla el QR, la etiqueta se imprime igual, sin él (igual que el HTML actual)
  }
}

function construirRejilla(d, idioma) {
  const t = TEXTOS[idioma] || TEXTOS.es;
  const trad = idioma === 'fr' ? (v) => traducir(DICCIONARIO_FR, v) : idioma === 'it' ? (v) => traducir(DICCIONARIO_IT, v) : (v) => v;
  const nombreProducto = idioma === 'fr' ? (d.productoFrances || d.producto) : idioma === 'it' ? (d.productoItaliano || d.producto) : d.producto;
  return `<div class="rejilla">
    <div class="fila fila-superior">
      <div class="celda"><span class="campo-valor"><span class="campo-label">ZONA:</span> ${d.zona}</span><span class="campo-valor"><span class="campo-label">${t.subzona}:</span> ${d.subzona}</span></div>
      <div class="celda celda-chica"><span class="campo-label">${t.categoria}</span><span class="campo-valor">${d.categoria}</span></div>
      <div class="celda celda-chica"><span class="campo-label">${t.calibre}</span><span class="campo-valor campo-grande">${d.calibre}</span></div>
      <div class="celda"><span class="campo-valor"><span class="campo-label">${t.fecha}:</span> ${d.fecha}</span><span class="campo-valor"><span class="campo-label">${t.lote}:</span> ${d.lote}</span><span class="campo-valor"><span class="campo-label">${t.cad}:</span> ${d.caducidad}</span></div>
      <div class="celda celda-chica"><span class="campo-label">${t.peso}</span><div class="peso-caja">${trad(d.pesoEtiqueta)}</div></div>
    </div>
    <div class="fila fila-producto">
      <div class="celda celda-producto"><div class="producto-nombre">${nombreProducto}</div><div class="producto-cientifico">${d.cientifico}</div></div>
      <div class="celda"><span class="campo-label">${t.arte}</span><span class="campo-valor">${d.artePesca}</span></div>
      <div class="celda"><span class="campo-label">${t.conserv}</span><span class="campo-valor">${trad(d.modoConservacion)}</span></div>
    </div>
    <div class="fila fila-traza">
      <div class="celda celda-qr">${generarQrSvg(d)}</div>
      <div class="celda celda-chica"><span class="campo-valor"><span class="campo-label">${t.obt}:</span> ${trad(d.formaObtencion)}</span><span class="campo-valor"><span class="campo-label">${t.pres}:</span> ${trad(d.modoPresentacion)}</span></div>
      <div class="celda" style="flex:0.8;"><span class="campo-label">${t.barco}</span><span class="campo-valor">${trad(d.barco)}</span></div>
      <div class="celda" style="flex:1.6;"><span class="campo-valor"><span class="campo-label">${t.exp}:</span> ${d.expedidor}</span><span class="campo-valor">${d.rsi}</span></div>
    </div>
    <div class="fila fila-destinatario">
      <div class="celda"><span class="campo-label">${t.dest}</span><span class="destinatario-nombre">${d.destinatario}</span></div>
      <div class="celda"><span class="campo-label">${t.dir}</span><span class="destinatario-dato">${d.direccion}</span></div>
      <div class="celda celda-chica"><span class="campo-label">${t.prov}</span><span class="destinatario-dato">${d.provincia}</span></div>
    </div>
  </div>`;
}

// ---- Encabezado de empresa (franja izquierda) por formato ----
function franjaMarinaFisk(origen) {
  return `<div class="franja-empresa">
    <div class="sello"><img src="${RUTA_SELLO}" alt="Sello sanitario"></div>
    <div class="empresa-nombre">MARINA FISK SA</div>
    <div class="empresa-dato">CIF A50789742</div>
    <div class="empresa-dato">Telf 981 28 22 98 - Fax 981 23 70 50</div>
    <div class="empresa-dato">Lonja de Linares Rivas 34-35, 15006 A Coruña</div>
    <div class="logo-fisk"><img src="${RUTA_LOGO}" alt="Marina Fisk"></div>
  </div>`;
}
function franjaMasYMas() {
  return `<div class="franja-empresa">
    <div class="sello sello-texto">ES<br>12.3894/Z<br>CE</div>
    <div class="empresa-nombre">MARINA FISK SA</div>
    <div class="empresa-dato">CIF A50789742</div>
    <div class="empresa-dato">Telf 981 28 22 98 - Fax 981 23 70 50</div>
    <div class="empresa-dato">Lonja de Linares Rivas 34-35, 15006 A Coruña</div>
    <div class="logo-fisk"><img src="${RUTA_LOGO}" alt="Marina Fisk"></div>
  </div>`;
}
function franjaDavidSala() {
  return `<div class="franja-empresa">
    <div class="sello sello-texto">ES<br>12.023418/GI<br>CE</div>
    <div class="empresa-nombre" style="font-size:6.5px;">PESCADOS DAVID<br>SALA BLANES</div>
    <div class="empresa-dato">Tlf: +34 872 981 526</div>
    <div class="empresa-dato">Serrallarga, 19 — 17300 Blanes (Girona)</div>
  </div>`;
}
function franjaScanfisk() {
  return `<div class="franja-empresa">
    <div class="sello"><img src="${RUTA_SELLO}" alt="Sello sanitario"></div>
    <div class="empresa-nombre">SCANFISK<br>SEAFOOD SL</div>
    <div class="empresa-dato">CIF: B50607019</div>
    <div class="empresa-dato">Telf: +34 665862592</div>
    <div class="empresa-dato">Calle P, Parcela 29 (Mercazaragoza)</div>
  </div>`;
}

const FORMATOS = {
  marina_fisk: { idioma: 'es', franja: franjaMarinaFisk },
  marina_fisk_fr: { idioma: 'fr', franja: franjaMarinaFisk },
  marina_fisk_it: { idioma: 'it', franja: franjaMarinaFisk },
  marina_fisk_masymas: { idioma: 'es', franja: franjaMasYMas },
  david_sala: { idioma: 'es', franja: franjaDavidSala },
  scanfisk: { idioma: 'es', franja: franjaScanfisk },
};

function construirEtiquetaHtml(d, formatoId) {
  const formato = FORMATOS[formatoId] || FORMATOS.marina_fisk;
  return `<div class="etiqueta"><div class="contenido-rotado">${formato.franja()}${construirRejilla(d, formato.idioma)}</div></div>`;
}

// Paso 2 — se llama con la ventana ya abierta (ver abrirVentanaImpresion en
// motor.js), cuando ya han llegado los datos reales del servidor.
export function rellenarEtiquetas(ventana, { formato_id: formatoId, datos }) {
  if (!ventana || ventana.closed) return;
  if (!datos || !datos.length) { mostrarErrorEnVentana(ventana, 'No hay ninguna etiqueta que imprimir.'); return; }

  let filasHtml = '';
  for (let i = 0; i < datos.length; i += 2) {
    filasHtml += `<div class="hoja">${construirEtiquetaHtml(datos[i], formatoId)}` +
      (datos[i + 1] ? construirEtiquetaHtml(datos[i + 1], formatoId) : '<div class="hueco"></div>') + '</div>';
  }
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Etiquetas</title><style>${construirCssEtiquetas()}</style></head><body>${filasHtml}</body></html>`;
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();

  // Igual que imprimirDirecto() del HTML actual: esperar de verdad a que el
  // sello/logo hayan cargado antes de imprimir (si no, con muchas etiquetas
  // a la vez el sello puede salir en blanco) — con una red de seguridad por
  // si alguna imagen no llega a cargar nunca.
  const imagenes = ventana.document.querySelectorAll('img');
  let pendientes = Array.prototype.filter.call(imagenes, (img) => !img.complete).length;
  function lanzarImpresion() { ventana.focus(); ventana.print(); }
  if (pendientes === 0) {
    setTimeout(lanzarImpresion, 100);
  } else {
    const margenSeguridad = setTimeout(lanzarImpresion, 3000);
    Array.prototype.forEach.call(imagenes, (img) => {
      if (img.complete) return;
      img.addEventListener('load', comprobarTodasCargadas);
      img.addEventListener('error', comprobarTodasCargadas);
    });
    function comprobarTodasCargadas() {
      pendientes--;
      if (pendientes <= 0) { clearTimeout(margenSeguridad); setTimeout(lanzarImpresion, 100); }
    }
  }
}
