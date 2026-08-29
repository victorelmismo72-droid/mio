/*
 * MARINAFISK - Etiquetas de trazabilidad (formato termico 50x145mm).
 *
 * Reproduccion fiel de MarinaFiskEtiquetas del HTML actual: mismo CSS, misma
 * rejilla de datos, mismas constantes (categoria, RSI, expedidor...), mismo
 * calculo de lote/caducidad. Se genera server-side (nunca se confia en un
 * calculo hecho en el navegador para un dato que va impreso en una etiqueta
 * sanitaria) y se sirve como una pagina HTML lista para imprimir con
 * Ctrl+P - el mismo mecanismo que ya usaba el HTML actual (imprimirDirecto:
 * un documento HTML/CSS con @page a medida, no un PDF).
 */
const QRCode = require('qrcode');
const { LOGO_MARINA_FISK_B64, SELLO_MARINA_FISK_B64 } = require('./etiquetasAssets');

// ---- Constantes fijas de trazabilidad (iguales en toda etiqueta Marina Fisk/Scanfisk) ----
const CONSTANTES_ETIQUETA = {
  categoria: 'E',
  calibre: '3',
  formaObtencion: 'CAPTURADO',
  modoPresentacion: 'C/C',
  modoConservacion: 'REFRIGERADO',
  expedidor: 'LONJA DEL PUERTO DE A CORUÑA',
  direccionExpedidor: 'A CORUÑA (A CORUÑA)',
  rsi: 'Nº R.S.I.: 12.08586/C',
};

const DIAS_CADUCIDAD_DEFECTO = 7;
const DIAS_CADUCIDAD_FRANCIA = 12; // cliente frances (Pomona) - confirmado por Victor

// El HTML actual usa un texto de RSI ligeramente distinto segun el camino
// (etiqueta de un pedido vs. etiqueta de un reparto) - se preserva la
// diferencia tal cual, no es un error, son dos textos ya usados en
// documentos reales distintos.
const RSI_PEDIDO = 'R.S.I. 12.08586/C';

// "Pescados David Sala Blanes" es su propia empresa (no Marina Fisk) - su
// etiqueta lleva su propio expedidor/RSI en vez de los de la lonja de Coruña.
const EXPEDIDOR_DAVID_SALA = {
  nombre: 'PESCADOS DAVID SALA BLANES',
  direccion: 'SERRALLARGA, 19 — 17300 BLANES (GIRONA)',
  rsi: 'N. REG. S: ES 12.023418/GI',
};

// ---- Estilo (igual que el HTML actual, ver ESTILO en MarinaFiskEtiquetas) ----
const ESTILO = {
  anchoEtiqueta: '50mm',
  altoEtiqueta: '145mm',
  margenEtiqueta: '1.5mm 2mm',
  fuenteBase: 'Arial, Helvetica, sans-serif',
  campoLabel: { fontSize: '5.6pt', color: '#000', fontWeight: '700' },
  destinatarioNombre: { fontSize: '8pt', fontWeight: '900' },
  destinatarioDato: { fontSize: '7pt', fontWeight: '700' },
  productoNombre: { fontSize: '7.2pt', fontWeight: '900' },
  productoCientifico: { fontSize: '6pt', fontStyle: 'italic', fontWeight: '700' },
  campoValor: { fontSize: '6.6pt', fontWeight: '700' },
  pesoCaja: { fontSize: '9pt', fontWeight: '900' },
  empresaNombre: { fontSize: '6.5pt', fontWeight: '900' },
  empresaDato: { fontSize: '5.4pt', color: '#000', fontWeight: '600' },
  bordeGrosor: '0.3mm',
  espacioBloques: '0.8mm',
};

function reglaCss(e) {
  const partes = [];
  if (e.fontSize) partes.push(`font-size:${e.fontSize}`);
  if (e.fontWeight) partes.push(`font-weight:${e.fontWeight}`);
  if (e.fontStyle) partes.push(`font-style:${e.fontStyle}`);
  if (e.color) partes.push(`color:${e.color}`);
  return partes.join(';');
}

// ---- Lote / caducidad (fecha "naive", nunca UTC - Fase 0 punto 7) ----
function generarLoteDesdeFecha(fechaISO) {
  const partes = String(fechaISO || '').split('-');
  if (partes.length !== 3) return '';
  return partes[2] + partes[1] + partes[0].slice(2);
}

function diasCaducidadParaFormato(formato, diasDefecto) {
  if (formato === 'marina_fisk_fr') return DIAS_CADUCIDAD_FRANCIA;
  return diasDefecto ?? DIAS_CADUCIDAD_DEFECTO;
}

function calcularFechaCaducidad(fechaISO, formato, diasDefecto) {
  if (!fechaISO) return null;
  const [anio, mes, dia] = String(fechaISO).split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia); // medianoche local, inmune a huso horario
  fecha.setDate(fecha.getDate() + diasCaducidadParaFormato(formato, diasDefecto));
  return fecha;
}

function fmtFechaCorta(d) {
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

function fmtFechaCortaDesdeISO(fechaISO) {
  if (!fechaISO) return '';
  const [anio, mes, dia] = String(fechaISO).split('-').map(Number);
  return fmtFechaCorta(new Date(anio, mes - 1, dia));
}

async function generarQrEtiqueta(d) {
  try {
    const texto = `MARINAFISK|PROD:${d.producto}|LOTE:${d.lote}|CAD:${d.caducidad}|DEST:${d.destinatario}`;
    return await QRCode.toString(texto, { type: 'svg', margin: 0, width: 100 });
  } catch (err) {
    return ''; // si falla el QR, la etiqueta se imprime igual sin el (igual que el HTML actual)
  }
}

// ---- Datos de una etiqueta a partir de una linea de Reparto Super ----
// `fila`: { lote, codArt, descripcion, barco, zonaPesca, tipoPesca, fecha, pesoEtiqueta }
// (mismos nombres que datosEtiquetaCarga() del HTML actual). El barco/zona/arte de pesca
// vienen YA en la propia linea del reparto (son los reales de ese envio concreto) - solo se
// completa desde el catalogo de articulos lo que falte (cientifico, calibre...).
function datosEtiquetaCarga(fila, destinatario, articulo) {
  const art = articulo || {};
  const fechaCorta = fmtFechaCortaDesdeISO(fila.fecha);
  const fechaCad = calcularFechaCaducidad(fila.fecha, null, null);
  return {
    producto: fila.descripcion || art.descripcion || fila.codArt || '(artículo sin descripción)',
    cientifico: art.cientifico || '',
    zona: 'FAO 27',
    subzona: fila.zonaPesca || art.subzona || '',
    artePesca: fila.tipoPesca || art.arte_pesca || '',
    barco: fila.barco || art.barco || 'VARIOS BARCOS',
    pesoEtiqueta: (fila.pesoEtiqueta !== undefined && fila.pesoEtiqueta !== null && fila.pesoEtiqueta !== '')
      ? `${fila.pesoEtiqueta} kg`
      : (art.peso_etiqueta || 'VER CAJA'),
    fecha: fechaCorta,
    lote: fila.lote || generarLoteDesdeFecha(fila.fecha),
    caducidad: fmtFechaCorta(fechaCad),
    destinatario: destinatario.nombre,
    direccion: destinatario.ciudad,
    provincia: destinatario.ciudad,
    categoria: CONSTANTES_ETIQUETA.categoria,
    calibre: art.calibre || CONSTANTES_ETIQUETA.calibre,
    formaObtencion: art.forma_obtencion || CONSTANTES_ETIQUETA.formaObtencion,
    modoPresentacion: art.modo_presentacion || CONSTANTES_ETIQUETA.modoPresentacion,
    modoConservacion: CONSTANTES_ETIQUETA.modoConservacion,
    expedidor: CONSTANTES_ETIQUETA.expedidor,
    direccionExpedidor: CONSTANTES_ETIQUETA.direccionExpedidor,
    rsi: CONSTANTES_ETIQUETA.rsi,
  };
}

// ---- Rejilla de datos (igual que construirRejillaEtiqueta del HTML actual) ----
function construirRejillaEtiqueta(d, qrSvg) {
  return `<div class="rejilla">
    <div class="fila fila-superior">
      <div class="celda"><span class="campo-valor"><span class="campo-label">ZONA:</span> ${d.zona}</span><span class="campo-valor"><span class="campo-label">SUBZONA:</span> ${d.subzona}</span></div>
      <div class="celda celda-chica"><span class="campo-label">CATEGORÍA</span><span class="campo-valor">${d.categoria}</span></div>
      <div class="celda celda-chica"><span class="campo-label">CALIBRE</span><span class="campo-valor campo-grande">${d.calibre}</span></div>
      <div class="celda"><span class="campo-valor"><span class="campo-label">FECHA:</span> ${d.fecha}</span><span class="campo-valor"><span class="campo-label">LOTE:</span> ${d.lote}</span><span class="campo-valor"><span class="campo-label">CAD:</span> ${d.caducidad}</span></div>
      <div class="celda celda-chica"><span class="campo-label">PESO NETO</span><div class="peso-caja">${d.pesoEtiqueta}</div></div>
    </div>
    <div class="fila fila-producto">
      <div class="celda celda-producto"><div class="producto-nombre">${d.producto}</div><div class="producto-cientifico">${d.cientifico}</div></div>
      <div class="celda"><span class="campo-label">Arte de Pesca</span><span class="campo-valor">${d.artePesca}</span></div>
      <div class="celda"><span class="campo-label">Modo de conservación</span><span class="campo-valor">${d.modoConservacion}</span></div>
    </div>
    <div class="fila fila-traza">
      <div class="celda celda-qr">${qrSvg || ''}</div>
      <div class="celda celda-chica"><span class="campo-valor"><span class="campo-label">OBT:</span> ${d.formaObtencion}</span><span class="campo-valor"><span class="campo-label">PRES:</span> ${d.modoPresentacion}</span></div>
      <div class="celda" style="flex:0.8;"><span class="campo-label">BARCO</span><span class="campo-valor">${d.barco}</span></div>
      <div class="celda" style="flex:1.6;"><span class="campo-valor"><span class="campo-label">EXPEDIDOR:</span> ${d.expedidor}</span><span class="campo-valor">${d.rsi}</span></div>
    </div>
    <div class="fila fila-destinatario">
      <div class="celda"><span class="campo-label">DESTINATARIO</span><span class="destinatario-nombre">${d.destinatario}</span></div>
      <div class="celda"><span class="campo-label">DIRECCIÓN</span><span class="destinatario-dato">${d.direccion}</span></div>
      <div class="celda celda-chica"><span class="campo-label">PROVINCIA</span><span class="destinatario-dato">${d.provincia}</span></div>
    </div>
  </div>`;
}

// Traduce valores de campo conocidos (modo de conservacion, forma de obtencion...) que son texto
// libre por articulo - si no reconoce el valor exacto, lo deja tal cual (nunca se pierde
// informacion, simplemente no se traduce ese texto concreto). Igual que traducirValorFrances()
// del HTML actual.
const DICCIONARIO_FRANCES = {
  REFRIGERADO: 'RÉFRIGÉRÉ', CONGELADO: 'CONGELÉ', CAPTURADO: 'CAPTURÉ',
  ACUICULTURA: 'AQUACULTURE', 'PESCA EXTRACTIVA': 'PÊCHE', PESCADO: 'PÊCHÉ',
  'C/C': 'A/T', 'S/C': 'S/T', 'VARIOS BARCOS': 'PLUSIEURS BATEAUX', 'VER CAJA': 'VOIR CAISSE',
};
const DICCIONARIO_ITALIANO = {
  REFRIGERADO: 'REFRIGERATO', CONGELADO: 'CONGELATO', CAPTURADO: 'CATTURATO',
  ACUICULTURA: 'ACQUACOLTURA', 'PESCA EXTRACTIVA': 'PESCA', PESCADO: 'PESCATO',
  'C/C': 'C/T', 'S/C': 'S/T', 'VARIOS BARCOS': 'VARIE BARCHE', 'VER CAJA': 'VEDI SCATOLA',
};
function traducirValor(valor, diccionario) {
  const v = String(valor || '').trim();
  return diccionario[v.toUpperCase()] || v;
}
const traducirValorFrances = (v) => traducirValor(v, DICCIONARIO_FRANCES);
const traducirValorItaliano = (v) => traducirValor(v, DICCIONARIO_ITALIANO);

// Etiqueta Marina Fisk en FRANCES - mismos datos y trazabilidad, solo cambian las palabras fijas
// de la plantilla y el nombre del producto (usa el nombre frances del articulo si ya esta puesto;
// si no, cae en el nombre en espanol para no dejar la etiqueta en blanco).
function construirRejillaEtiquetaFrances(d, qrSvg) {
  const nombreProducto = d.productoFrances || d.producto;
  return `<div class="rejilla">
    <div class="fila fila-superior">
      <div class="celda"><span class="campo-valor"><span class="campo-label">ZONE:</span> ${d.zona}</span><span class="campo-valor"><span class="campo-label">SOUS-ZONE:</span> ${d.subzona}</span></div>
      <div class="celda celda-chica"><span class="campo-label">CATÉGORIE</span><span class="campo-valor">${d.categoria}</span></div>
      <div class="celda celda-chica"><span class="campo-label">CALIBRE</span><span class="campo-valor campo-grande">${d.calibre}</span></div>
      <div class="celda"><span class="campo-valor"><span class="campo-label">DATE:</span> ${d.fecha}</span><span class="campo-valor"><span class="campo-label">LOT:</span> ${d.lote}</span><span class="campo-valor"><span class="campo-label">DLC:</span> ${d.caducidad}</span></div>
      <div class="celda celda-chica"><span class="campo-label">POIDS NET</span><div class="peso-caja">${traducirValorFrances(d.pesoEtiqueta)}</div></div>
    </div>
    <div class="fila fila-producto">
      <div class="celda celda-producto"><div class="producto-nombre">${nombreProducto}</div><div class="producto-cientifico">${d.cientifico}</div></div>
      <div class="celda"><span class="campo-label">Engin de pêche</span><span class="campo-valor">${d.artePesca}</span></div>
      <div class="celda"><span class="campo-label">Mode de conservation</span><span class="campo-valor">${traducirValorFrances(d.modoConservacion)}</span></div>
    </div>
    <div class="fila fila-traza">
      <div class="celda celda-qr">${qrSvg || ''}</div>
      <div class="celda celda-chica"><span class="campo-valor"><span class="campo-label">OBT.:</span> ${traducirValorFrances(d.formaObtencion)}</span><span class="campo-valor"><span class="campo-label">PRÉS.:</span> ${traducirValorFrances(d.modoPresentacion)}</span></div>
      <div class="celda" style="flex:0.8;"><span class="campo-label">NAVIRE</span><span class="campo-valor">${traducirValorFrances(d.barco)}</span></div>
      <div class="celda" style="flex:1.6;"><span class="campo-valor"><span class="campo-label">EXPÉDITEUR:</span> ${d.expedidor}</span><span class="campo-valor">${d.rsi}</span></div>
    </div>
    <div class="fila fila-destinatario">
      <div class="celda"><span class="campo-label">DESTINATAIRE</span><span class="destinatario-nombre">${d.destinatario}</span></div>
      <div class="celda"><span class="campo-label">ADRESSE</span><span class="destinatario-dato">${d.direccion}</span></div>
      <div class="celda celda-chica"><span class="campo-label">PROVINCE</span><span class="destinatario-dato">${d.provincia}</span></div>
    </div>
  </div>`;
}

function construirEtiquetaHtmlMarinaFiskFrances(d, qrSvg) {
  return `<div class="etiqueta"><div class="contenido-rotado">
      <div class="franja-empresa">
        <div class="sello"><img src="${SELLO_MARINA_FISK_B64}" alt="Sello sanitario"></div>
        <div class="empresa-nombre">MARINA FISK SA</div>
        <div class="empresa-dato">CIF A50789742</div>
        <div class="empresa-dato">Telf 981 28 22 98 - Fax 981 23 70 50</div>
        <div class="empresa-dato">Lonja de Linares Rivas 34-35, 15006 A Coruña</div>
        <div class="logo-fisk"><img src="${LOGO_MARINA_FISK_B64}" alt="Marina Fisk"></div>
      </div>
      ${construirRejillaEtiquetaFrances(d, qrSvg)}
    </div></div>`;
}

// Etiqueta Marina Fisk en ITALIANO - mismo criterio que la francesa.
function construirRejillaEtiquetaItaliano(d, qrSvg) {
  const nombreProducto = d.productoItaliano || d.producto;
  return `<div class="rejilla">
    <div class="fila fila-superior">
      <div class="celda"><span class="campo-valor"><span class="campo-label">ZONA:</span> ${d.zona}</span><span class="campo-valor"><span class="campo-label">SOTTOZONA:</span> ${d.subzona}</span></div>
      <div class="celda celda-chica"><span class="campo-label">CATEGORIA</span><span class="campo-valor">${d.categoria}</span></div>
      <div class="celda celda-chica"><span class="campo-label">CALIBRO</span><span class="campo-valor campo-grande">${d.calibre}</span></div>
      <div class="celda"><span class="campo-valor"><span class="campo-label">DATA:</span> ${d.fecha}</span><span class="campo-valor"><span class="campo-label">LOTTO:</span> ${d.lote}</span><span class="campo-valor"><span class="campo-label">SCAD.:</span> ${d.caducidad}</span></div>
      <div class="celda celda-chica"><span class="campo-label">PESO NETTO</span><div class="peso-caja">${traducirValorItaliano(d.pesoEtiqueta)}</div></div>
    </div>
    <div class="fila fila-producto">
      <div class="celda celda-producto"><div class="producto-nombre">${nombreProducto}</div><div class="producto-cientifico">${d.cientifico}</div></div>
      <div class="celda"><span class="campo-label">Attrezzo da pesca</span><span class="campo-valor">${d.artePesca}</span></div>
      <div class="celda"><span class="campo-label">Modalità di conservazione</span><span class="campo-valor">${traducirValorItaliano(d.modoConservacion)}</span></div>
    </div>
    <div class="fila fila-traza">
      <div class="celda celda-qr">${qrSvg || ''}</div>
      <div class="celda celda-chica"><span class="campo-valor"><span class="campo-label">OTT.:</span> ${traducirValorItaliano(d.formaObtencion)}</span><span class="campo-valor"><span class="campo-label">PRES.:</span> ${traducirValorItaliano(d.modoPresentacion)}</span></div>
      <div class="celda" style="flex:0.8;"><span class="campo-label">NAVE</span><span class="campo-valor">${traducirValorItaliano(d.barco)}</span></div>
      <div class="celda" style="flex:1.6;"><span class="campo-valor"><span class="campo-label">SPEDITORE:</span> ${d.expedidor}</span><span class="campo-valor">${d.rsi}</span></div>
    </div>
    <div class="fila fila-destinatario">
      <div class="celda"><span class="campo-label">DESTINATARIO</span><span class="destinatario-nombre">${d.destinatario}</span></div>
      <div class="celda"><span class="campo-label">INDIRIZZO</span><span class="destinatario-dato">${d.direccion}</span></div>
      <div class="celda celda-chica"><span class="campo-label">PROVINCIA</span><span class="destinatario-dato">${d.provincia}</span></div>
    </div>
  </div>`;
}

function construirEtiquetaHtmlMarinaFiskItaliano(d, qrSvg) {
  return `<div class="etiqueta"><div class="contenido-rotado">
      <div class="franja-empresa">
        <div class="sello"><img src="${SELLO_MARINA_FISK_B64}" alt="Sello sanitario"></div>
        <div class="empresa-nombre">MARINA FISK SA</div>
        <div class="empresa-dato">CIF A50789742</div>
        <div class="empresa-dato">Telf 981 28 22 98 - Fax 981 23 70 50</div>
        <div class="empresa-dato">Lonja de Linares Rivas 34-35, 15006 A Coruña</div>
        <div class="logo-fisk"><img src="${LOGO_MARINA_FISK_B64}" alt="Marina Fisk"></div>
      </div>
      ${construirRejillaEtiquetaItaliano(d, qrSvg)}
    </div></div>`;
}

function construirEtiquetaHtml(d, qrSvg) {
  return `<div class="etiqueta"><div class="contenido-rotado">
      <div class="franja-empresa">
        <div class="sello"><img src="${SELLO_MARINA_FISK_B64}" alt="Sello sanitario"></div>
        <div class="empresa-nombre">MARINA FISK SA</div>
        <div class="empresa-dato">CIF A50789742</div>
        <div class="empresa-dato">Telf 981 28 22 98 - Fax 981 23 70 50</div>
        <div class="empresa-dato">Lonja de Linares Rivas 34-35, 15006 A Coruña</div>
        <div class="logo-fisk"><img src="${LOGO_MARINA_FISK_B64}" alt="Marina Fisk"></div>
      </div>
      ${construirRejillaEtiqueta(d, qrSvg)}
    </div></div>`;
}

// Etiqueta de Scanfisk Seafood SL - misma rejilla, solo cambia la franja de empresa (sin logo
// propio, comparte el sello sanitario real con Marina Fisk - mismo numero de registro).
// Etiqueta para el cliente "Más y Más" (Hijos de Luis Rodríguez / Mercasturias) - igual que la
// Marina Fisk estandar (mismo logo/nombre/CIF/direccion), pero con SU PROPIO registro sanitario
// (12.3894/Z), distinto al habitual de Marina Fisk - se dibuja como texto (no hay imagen real de
// este sello concreto).
function construirEtiquetaHtmlMasYMas(d, qrSvg) {
  return `<div class="etiqueta"><div class="contenido-rotado">
      <div class="franja-empresa">
        <div class="sello sello-texto">ES<br>12.3894/Z<br>CE</div>
        <div class="empresa-nombre">MARINA FISK SA</div>
        <div class="empresa-dato">CIF A50789742</div>
        <div class="empresa-dato">Telf 981 28 22 98 - Fax 981 23 70 50</div>
        <div class="empresa-dato">Lonja de Linares Rivas 34-35, 15006 A Coruña</div>
        <div class="logo-fisk"><img src="${LOGO_MARINA_FISK_B64}" alt="Marina Fisk"></div>
      </div>
      ${construirRejillaEtiqueta(d, qrSvg)}
    </div></div>`;
}

// Etiqueta para "Pescados David Sala Blanes" - encabezado completamente distinto (su propia
// empresa, no Marina Fisk): sin logo, con su nombre/telefono/direccion/registro sanitario propios.
function construirEtiquetaHtmlDavidSala(d, qrSvg) {
  return `<div class="etiqueta"><div class="contenido-rotado">
      <div class="franja-empresa">
        <div class="sello sello-texto">ES<br>12.023418/GI<br>CE</div>
        <div class="empresa-nombre" style="font-size:6.5px;">PESCADOS DAVID<br>SALA BLANES</div>
        <div class="empresa-dato">Tlf: +34 872 981 526</div>
        <div class="empresa-dato">Serrallarga, 19 — 17300 Blanes (Girona)</div>
      </div>
      ${construirRejillaEtiqueta(d, qrSvg)}
    </div></div>`;
}

function construirEtiquetaHtmlScanfisk(d, qrSvg) {
  return `<div class="etiqueta"><div class="contenido-rotado">
      <div class="franja-empresa">
        <div class="sello"><img src="${SELLO_MARINA_FISK_B64}" alt="Sello sanitario"></div>
        <div class="empresa-nombre">SCANFISK<br>SEAFOOD SL</div>
        <div class="empresa-dato">CIF: B50607019</div>
        <div class="empresa-dato">Telf: +34 665862592</div>
        <div class="empresa-dato">Calle P, Parcela 29 (Mercazaragoza)</div>
      </div>
      ${construirRejillaEtiqueta(d, qrSvg)}
    </div></div>`;
}

function construirCssEtiquetas() {
  const E = ESTILO;
  return `*{box-sizing:border-box;} body{font-family:${E.fuenteBase};margin:0;padding:0;}
    .hoja{width:calc(${E.anchoEtiqueta} * 2);height:${E.altoEtiqueta};display:flex;flex-direction:row;page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;overflow:hidden;}
    .hoja:last-child{page-break-after:auto;}
    .etiqueta{width:${E.anchoEtiqueta};height:${E.altoEtiqueta};border:${E.bordeGrosor} solid #000;position:relative;overflow:hidden;page-break-inside:avoid;break-inside:avoid;}
    .hueco{width:${E.anchoEtiqueta};height:${E.altoEtiqueta};}
    .contenido-rotado{width:${E.altoEtiqueta};height:${E.anchoEtiqueta};position:absolute;top:0;left:${E.anchoEtiqueta};
      transform-origin:top left;transform:rotate(90deg);box-sizing:border-box;padding:1mm;
      display:flex;flex-direction:row;gap:1mm;}
    .franja-empresa{width:19mm;flex-shrink:0;border-right:${E.bordeGrosor} solid #000;padding-right:1mm;
      display:flex;flex-direction:column;align-items:center;text-align:center;gap:0.5mm;overflow:hidden;}
    .sello{width:13mm;height:13mm;display:flex;align-items:center;justify-content:center;}
    .sello-texto{border:0.3mm solid #000;border-radius:50%;font-size:5px;line-height:1.15;font-weight:700;text-align:center;padding:1mm;}
    .sello img{width:100%;height:100%;object-fit:contain;}
    .empresa-nombre{${reglaCss(E.empresaNombre)}}
    .empresa-dato{${reglaCss(E.empresaDato)}}
    .logo-fisk{margin-top:auto;display:flex;flex-direction:column;align-items:center;}
    .logo-fisk img{width:13mm;height:auto;}
    .celda-qr{flex:0 0 auto;width:15mm;align-items:center;justify-content:center;}
    .celda-qr svg{width:13mm;height:13mm;}
    .rejilla{flex:1;display:flex;flex-direction:column;overflow:hidden;height:100%;}
    .fila{display:flex;flex-direction:row;border-bottom:${E.bordeGrosor} solid #000;overflow:hidden;flex-shrink:0;}
    .fila:last-child{border-bottom:none;}
    .fila-superior{height:13mm;}
    .fila-producto{height:8mm;}
    .fila-traza{height:10mm;}
    .fila-destinatario{height:14mm;border-bottom:none;align-items:center;}
    .celda{flex:1;display:flex;flex-direction:column;justify-content:center;gap:0.2mm;border-right:0.25mm solid #999;padding:0.4mm 1mm;overflow:hidden;line-height:1.05;}
    .celda:last-child{border-right:none;}
    .celda-chica{flex:0 0 auto;width:16mm;align-items:center;text-align:center;}
    .celda-producto{flex:2.2;}
    .campo-label{${reglaCss(E.campoLabel)};display:block;}
    .campo-valor{${reglaCss(E.campoValor)};display:block;}
    .campo-valor .campo-label{display:inline;}
    .campo-grande{font-size:9pt;font-weight:900;}
    .producto-nombre{${reglaCss(E.productoNombre)}}
    .producto-cientifico{${reglaCss(E.productoCientifico)}}
    .destinatario-nombre{${reglaCss(E.destinatarioNombre)};display:block;}
    .destinatario-dato{${reglaCss(E.destinatarioDato)};display:block;}
    .peso-caja{${reglaCss(E.pesoCaja)};text-align:center;border:${E.bordeGrosor} solid #000;padding:0.8mm;margin-top:0.3mm;}
    @page{size:calc(${E.anchoEtiqueta} * 2) ${E.altoEtiqueta};margin:0;}`;
}

// Expande las lineas de un reparto en una etiqueta por caja (mismo criterio que
// prepararMuestraParaReparto del HTML actual), consulta el QR de cada una en paralelo, y
// devuelve la pagina HTML completa lista para imprimir (Ctrl+P).
async function generarPaginaEtiquetasReparto({ lineas, destinatarioNombre, destinatarioCiudad, articulosPorCodigo }) {
  const destinatario = { nombre: destinatarioNombre, ciudad: destinatarioCiudad };
  const datos = [];
  for (const l of lineas) {
    const fila = {
      lote: l.lote, codArt: l.producto, descripcion: l.descripcion, barco: l.barco,
      zonaPesca: l.subzona, tipoPesca: l.arte_pesca, fecha: l._fecha, pesoEtiqueta: l.peso_etiqueta,
    };
    const art = articulosPorCodigo[l.producto] || {};
    const d = datosEtiquetaCarga(fila, destinatario, art);
    const cajas = parseInt(l.cajas, 10) || 0;
    for (let c = 0; c < cajas; c += 1) datos.push(d);
  }
  if (!datos.length) return null;

  const filasHtml = [];
  for (let i = 0; i < datos.length; i += 2) {
    // eslint-disable-next-line no-await-in-loop
    const qr1 = await generarQrEtiqueta(datos[i]);
    let etiqueta2 = '<div class="hueco"></div>';
    if (datos[i + 1]) {
      // eslint-disable-next-line no-await-in-loop
      const qr2 = await generarQrEtiqueta(datos[i + 1]);
      etiqueta2 = construirEtiquetaHtmlScanfisk(datos[i + 1], qr2);
    }
    filasHtml.push(`<div class="hoja">${construirEtiquetaHtmlScanfisk(datos[i], qr1)}${etiqueta2}</div>`);
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title><style>${construirCssEtiquetas()}</style></head><body>${filasHtml.join('')}</body></html>`;
}

// ---- Registro de formatos por cliente (mismo id que clientes.formato_etiqueta, ver
// FORMATOS/obtenerFormatoParaCliente del HTML actual) ----
const FORMATOS = {
  marina_fisk: { nombre: 'Marina Fisk (estándar)', construir: construirEtiquetaHtml },
  marina_fisk_fr: { nombre: 'Marina Fisk (Francés — Pomona)', construir: construirEtiquetaHtmlMarinaFiskFrances },
  marina_fisk_it: { nombre: 'Marina Fisk (Italiano)', construir: construirEtiquetaHtmlMarinaFiskItaliano },
  marina_fisk_masymas: { nombre: 'Marina Fisk (Más y Más)', construir: construirEtiquetaHtmlMasYMas },
  david_sala: { nombre: 'Pescados David Sala Blanes', construir: construirEtiquetaHtmlDavidSala },
  scanfisk: { nombre: 'Scanfisk Seafood (reparto supermercados)', construir: construirEtiquetaHtmlScanfisk },
};

function obtenerFormatoParaCliente(cliente) {
  const id = (cliente && cliente.formato_etiqueta) || 'marina_fisk';
  return FORMATOS[id] || FORMATOS.marina_fisk;
}

// ---- Datos de una etiqueta a partir de una linea de Pedido/Albaran ----
// Igual que datosEtiquetaLinea() del HTML actual: a diferencia de un reparto, aqui el
// barco/zona/arte de pesca salen SIEMPRE del catalogo del articulo (no se registran por
// pedido), y el destinatario es el cliente del pedido (usando la instantanea guardada en el
// propio pedido si el maestro de clientes no tiene el dato).
function datosEtiquetaLinea(ped, linea, articulo, cliente) {
  const art = articulo || {};
  const cli = cliente || {};
  const formatoId = cli.formato_etiqueta || 'marina_fisk';
  const esDavidSala = formatoId === 'david_sala';
  const lote = generarLoteDesdeFecha(ped.fecha);
  const fechaCad = calcularFechaCaducidad(ped.fecha, formatoId, null);
  const fechaCorta = fmtFechaCortaDesdeISO(ped.fecha);
  return {
    producto: art.descripcion || linea.articulo_codigo || '(artículo sin descripción)',
    productoFrances: art.nombre_frances || art.descripcion || linea.articulo_codigo || '(artículo sin descripción)',
    productoItaliano: art.nombre_italiano || art.descripcion || linea.articulo_codigo || '(artículo sin descripción)',
    cientifico: art.cientifico || '',
    zona: art.zona_fao || '',
    subzona: art.subzona || '',
    artePesca: art.arte_pesca || '',
    barco: art.barco || 'VARIOS BARCOS',
    pesoEtiqueta: art.peso_etiqueta || 'VER CAJA',
    fecha: fechaCorta,
    lote,
    caducidad: fmtFechaCorta(fechaCad),
    cantidad: linea.cantidad || '',
    destinatario: ped.cliente_nombre_snapshot || ped.cliente_codigo,
    direccion: cli.direccion || ped.cliente_dir_snapshot || '',
    provincia: cli.provincia || ped.cliente_pob_snapshot || '',
    categoria: CONSTANTES_ETIQUETA.categoria,
    calibre: art.calibre || CONSTANTES_ETIQUETA.calibre,
    formaObtencion: art.forma_obtencion || CONSTANTES_ETIQUETA.formaObtencion,
    modoPresentacion: art.modo_presentacion || CONSTANTES_ETIQUETA.modoPresentacion,
    modoConservacion: CONSTANTES_ETIQUETA.modoConservacion,
    expedidor: esDavidSala ? EXPEDIDOR_DAVID_SALA.nombre : CONSTANTES_ETIQUETA.expedidor,
    direccionExpedidor: esDavidSala ? EXPEDIDOR_DAVID_SALA.direccion : CONSTANTES_ETIQUETA.direccionExpedidor,
    rsi: esDavidSala ? EXPEDIDOR_DAVID_SALA.rsi : RSI_PEDIDO,
  };
}

// Cuantas etiquetas corresponden a cada linea - igual que copiasPorLinea() del HTML actual:
// normalmente una etiqueta por caja (cantidad), pero si hay un valor de descuento puesto se usa
// ese numero en su lugar (asi es como ya lo hacia el HTML actual - un "override" manual del
// numero de etiquetas para esa linea concreta).
function copiasPorLinea(linea) {
  const cantidad = Math.round(Number(linea.cantidad) || 0);
  const descuento = Number(linea.descuento) || 0;
  return descuento > 0 ? Math.round(descuento) : cantidad;
}

// Expande las lineas de un pedido en una etiqueta por caja, en el formato del cliente
// (marina_fisk por defecto, o el que tenga asignado - frances/italiano/masymas/david_sala), y
// devuelve la pagina HTML completa lista para imprimir.
async function generarPaginaEtiquetasPedido({ pedido, lineas, cliente, articulosPorCodigo }) {
  const formato = obtenerFormatoParaCliente(cliente);
  const datos = [];
  for (const l of lineas) {
    const art = articulosPorCodigo[l.articulo_codigo] || {};
    const d = datosEtiquetaLinea(pedido, l, art, cliente);
    const copias = copiasPorLinea(l);
    for (let c = 0; c < copias; c += 1) datos.push(d);
  }
  if (!datos.length) return null;

  const filasHtml = [];
  for (let i = 0; i < datos.length; i += 2) {
    // eslint-disable-next-line no-await-in-loop
    const qr1 = await generarQrEtiqueta(datos[i]);
    let etiqueta2 = '<div class="hueco"></div>';
    if (datos[i + 1]) {
      // eslint-disable-next-line no-await-in-loop
      const qr2 = await generarQrEtiqueta(datos[i + 1]);
      etiqueta2 = formato.construir(datos[i + 1], qr2);
    }
    filasHtml.push(`<div class="hoja">${formato.construir(datos[i], qr1)}${etiqueta2}</div>`);
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title><style>${construirCssEtiquetas()}</style></head><body>${filasHtml.join('')}</body></html>`;
}

module.exports = {
  CONSTANTES_ETIQUETA,
  DIAS_CADUCIDAD_DEFECTO,
  DIAS_CADUCIDAD_FRANCIA,
  generarLoteDesdeFecha,
  calcularFechaCaducidad,
  fmtFechaCorta,
  fmtFechaCortaDesdeISO,
  datosEtiquetaCarga,
  generarQrEtiqueta,
  construirRejillaEtiqueta,
  construirEtiquetaHtml,
  construirEtiquetaHtmlScanfisk,
  construirCssEtiquetas,
  generarPaginaEtiquetasReparto,
  FORMATOS,
  obtenerFormatoParaCliente,
  datosEtiquetaLinea,
  copiasPorLinea,
  generarPaginaEtiquetasPedido,
};
