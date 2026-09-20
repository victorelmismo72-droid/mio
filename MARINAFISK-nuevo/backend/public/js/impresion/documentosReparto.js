// Documentos de transporte del reparto (FASE_5, deferida en su momento por
// no ser etiquetas de producto): ficha de envío, hoja de ruta (para el
// camionero, normalmente 2 copias en la misma hoja A4) y el "PDF completo"
// (ficha de envío + una etiqueta visual de muestra por cada producto/lote
// distinto, para no mandar dos archivos sueltos). Réplica fiel de
// dibujarFichaEnvioEnPdf/generarPdfHojaDeRutaReparto/generarPdfCompletoReparto
// del HTML actual — misma librería jsPDF (js/vendor/jspdf.js) y el mismo QR
// vectorial dibujado a mano (sin depender de una imagen ni de internet).
const RUTA_SELLO = `${location.origin}/img/sello_marina_fisk.jpg`;
let selloBase64Promesa = null;

function cargarSelloBase64() {
  if (!selloBase64Promesa) {
    selloBase64Promesa = fetch(RUTA_SELLO)
      .then((r) => r.blob())
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }));
  }
  return selloBase64Promesa;
}

function fechaCorta(fechaIso) {
  if (!fechaIso) return '';
  const iso = String(fechaIso).slice(0, 10);
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio.slice(2)}`;
}

// ---- Etiqueta visual Scanfisk, dibujada a mano (líneas, celdas, texto y
// QR de verdad) en la página actual del PDF — misma rejilla de datos que
// impresion/etiquetas.js, en formato jsPDF en vez de HTML/CSS. ----
function dibujarEtiquetaScanfiskEnPdf(doc, d, selloBase64) {
  const W = 145, H = 50;
  doc.setLineWidth(0.25);
  doc.rect(0, 0, W, H);

  const FR = 19;
  doc.line(FR, 0, FR, H);
  const cx = FR / 2;
  doc.addImage(selloBase64, 'JPEG', cx - 6.5, 2.5, 13, 13);
  doc.setFontSize(6.2); doc.setFont(undefined, 'bold');
  doc.text(['SCANFISK', 'SEAFOOD SL'], cx, 20, { align: 'center' });
  doc.setFontSize(3.6); doc.setFont(undefined, 'normal');
  doc.text('CIF: B50607019', cx, 27, { align: 'center' });
  doc.text('Telf: +34 665862592', cx, 30, { align: 'center' });
  doc.text(['Calle P, Parcela 29', '(Mercazaragoza)'], cx, 35, { align: 'center' });

  const gx = FR;
  const filaY = [0, 13, 21, 31, H];
  filaY.forEach((yy) => { if (yy > 0 && yy < H) doc.line(gx, yy, W, yy); });

  const f1 = [gx, gx + 34, gx + 50, gx + 66, gx + 100, W];
  for (let i = 1; i < f1.length - 1; i++) doc.line(f1[i], filaY[0], f1[i], filaY[1]);
  doc.setFontSize(4.5); doc.setFont(undefined, 'normal');
  doc.text(`ZONA: ${d.zona || ''}`, f1[0] + 1.5, 4);
  doc.text(`SUBZONA: ${d.subzona || ''}`, f1[0] + 1.5, 8);
  doc.setFontSize(3.8); doc.text('CATEGORÍA', f1[1] + 1, 3.5);
  doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.text(String(d.categoria || ''), (f1[1] + f1[2]) / 2, 9, { align: 'center' });
  doc.setFontSize(3.8); doc.setFont(undefined, 'normal'); doc.text('CALIBRE', f1[2] + 1, 3.5);
  doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.text(String(d.calibre || ''), (f1[2] + f1[3]) / 2, 9, { align: 'center' });
  doc.setFontSize(4.5); doc.setFont(undefined, 'normal');
  doc.text(`FECHA: ${d.fecha || ''}`, f1[3] + 1.5, 4);
  doc.text(`LOTE: ${d.lote || ''}`, f1[3] + 1.5, 8);
  doc.text(`CAD: ${d.caducidad || ''}`, f1[3] + 1.5, 11.5);
  doc.setFontSize(3.8); doc.text('PESO NETO', f1[4] + 1, 3.5);
  doc.setFontSize(4.5); doc.text(String(d.pesoEtiqueta || ''), (f1[4] + f1[5]) / 2, 9, { align: 'center' });

  const f2 = [gx, gx + 56, gx + 95, W];
  for (let i = 1; i < f2.length - 1; i++) doc.line(f2[i], filaY[1], f2[i], filaY[2]);
  doc.setFontSize(5.2); doc.setFont(undefined, 'bold');
  doc.text(String(d.producto || '').substring(0, 34), f2[0] + 1.5, 16.5);
  doc.setFontSize(3.6); doc.setFont(undefined, 'italic');
  doc.text(String(d.cientifico || ''), f2[0] + 1.5, 19.5);
  doc.setFont(undefined, 'normal'); doc.setFontSize(3.8);
  doc.text('Arte de Pesca', f2[1] + 1, 15.5);
  doc.text(String(d.artePesca || '').substring(0, 22), f2[1] + 1, 19);
  doc.text('Modo de conservación', f2[2] + 1, 15.5);
  doc.text(String(d.modoConservacion || ''), f2[2] + 1, 19);

  const f3 = [gx, gx + 15, gx + 31, gx + 52, W];
  for (let i = 1; i < f3.length - 1; i++) doc.line(f3[i], filaY[2], f3[i], filaY[3]);
  try {
    const texto = `MARINAFISK|PROD:${d.producto}|LOTE:${d.lote}|CAD:${d.caducidad}|DEST:${d.destinatario}`;
    const qr = window.qrcode(0, 'M'); qr.addData(texto, 'Byte'); qr.make();
    const n = qr.getModuleCount();
    const qrSize = 9, cell = qrSize / n;
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(f3[0] + 1 + c * cell, filaY[2] + 1 + r * cell, cell, cell, 'F');
  } catch (errQr) { /* si falla el QR, la etiqueta se dibuja igual, sin él */ }
  doc.setFontSize(3.6); doc.setFont(undefined, 'normal');
  doc.text(`OBT: ${d.formaObtencion || ''}`, f3[1] + 1, 24.5);
  doc.text(`PRES: ${d.modoPresentacion || ''}`, f3[1] + 1, 27.5);
  doc.text('BARCO', f3[2] + 1, 24);
  doc.text(String(d.barco || '').substring(0, 16), f3[2] + 1, 27.5);
  doc.text(`EXPEDIDOR: ${d.expedidor || ''}`, f3[3] + 1, 24.5);
  doc.text(String(d.rsi || ''), f3[3] + 1, 28);

  const f4 = [gx, gx + 55, gx + 100, W];
  for (let i = 1; i < f4.length - 1; i++) doc.line(f4[i], filaY[3], f4[i], filaY[4]);
  doc.setFontSize(3.6); doc.text('DESTINATARIO', f4[0] + 1, 33.5);
  doc.setFontSize(5.5); doc.setFont(undefined, 'bold');
  doc.text(String(d.destinatario || ''), f4[0] + 1, 39);
  doc.setFontSize(3.6); doc.setFont(undefined, 'normal');
  doc.text('DIRECCIÓN', f4[1] + 1, 33.5);
  doc.text(String(d.direccion || ''), f4[1] + 1, 39);
  doc.text('PROVINCIA', f4[2] + 1, 33.5);
  doc.text(String(d.provincia || ''), f4[2] + 1, 39);
}

// ---- Ficha de envío (documento normal A4) ----
function dibujarFichaEnvioEnPdf(doc, reparto, yInicial, limiteY) {
  let y = yInicial || 15;
  const limite = limiteY || 275;
  doc.setFontSize(15); doc.setFont(undefined, 'bold');
  doc.text('SCANFISK SEAFOOD SL', 15, y); y += 6;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('CIF: B50607019   |   Calle P, Parcela 29 (Mercazaragoza)   |   Telf: +34 665862592', 15, y); y += 4.5;
  doc.text('Reg. San.: 12.01671/C', 15, y); y += 5.5;

  doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text(`FICHA DE ENVÍO — Reparto Nº ${reparto.numero}`, 15, y); y += 7;
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text(`Destinatario: ${reparto.destinatario_nombre || ''} ${reparto.destinatario_ciudad || ''}`, 15, y); y += 5;
  doc.text(`Fecha: ${fechaCorta(reparto.fecha)}   |   Conductor: ${reparto.conductor || '—'}`, 15, y); y += 9;

  doc.setFont(undefined, 'bold');
  doc.text('Lote', 15, y); doc.text('Producto', 40, y); doc.text('Barco', 110, y); doc.text('Subzona', 140, y); doc.text('Cajas', 162, y); doc.text('Kg', 180, y);
  doc.setFont(undefined, 'normal');
  y += 2; doc.line(15, y, 195, y); y += 5;
  (reparto.lineas || []).forEach((l) => {
    if (y > limite) { doc.addPage('a4', 'portrait'); y = 15; }
    doc.text(String(l.lote || ''), 15, y);
    doc.text(String(l.descripcion_snapshot || l.articulo_codigo_snapshot || '').substring(0, 42), 40, y);
    doc.text(String(l.barco || '').substring(0, 16), 110, y);
    doc.text(String(l.subzona || ''), 140, y);
    doc.text(String(l.cajas || 0), 162, y);
    doc.text(String(l.kg || 0), 180, y);
    y += 6;
  });
  y += 3; doc.line(15, y, 195, y); y += 6;
  doc.setFont(undefined, 'bold');
  doc.text(`TOTALES:  ${reparto.total_cajas || 0} cajas   /   ${reparto.total_kg || 0} kg aprox.`, 15, y);
  return y;
}

export async function generarPdfFichaEnvio(reparto) {
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  dibujarFichaEnvioEnPdf(doc, reparto);
  return doc;
}

// Hoja de ruta para el camionero: solo la ficha de envío, por defecto en
// DOS copias en la misma hoja A4 (para cortar y quedarte una) — si el
// reparto tiene demasiadas líneas para caber dos veces, la segunda copia
// simplemente continúa en la página siguiente.
export async function generarPdfHojaDeRutaReparto(reparto) {
  const pruebaDoc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const finalY = dibujarFichaEnvioEnPdf(pruebaDoc, reparto, 15, 9999);
  const cabeDoblado = finalY <= 130 && pruebaDoc.internal.getNumberOfPages() === 1;

  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  if (cabeDoblado) {
    dibujarFichaEnvioEnPdf(doc, reparto, 15, 130);
    doc.setDrawColor(180, 180, 180); doc.setLineDashPattern([2, 2], 0);
    doc.line(15, 140, 195, 140);
    doc.setLineDashPattern([], 0);
    dibujarFichaEnvioEnPdf(doc, reparto, 150, 275);
  } else {
    dibujarFichaEnvioEnPdf(doc, reparto, 15, 270);
    doc.addPage('a4', 'portrait');
    dibujarFichaEnvioEnPdf(doc, reparto, 15, 270);
  }
  return doc;
}

// Documento único: ficha de envío (página 1) + una etiqueta visual de
// muestra por cada producto/lote distinto del reparto (una página por
// etiqueta, 145x50mm) — "datosEtiquetas" son los mismos que ya resuelve el
// servidor en GET /api/repartos/:id/etiquetas (uno por caja); aquí se
// deduplican por producto+lote porque esto es una MUESTRA visual, no las
// etiquetas reales a pegar en cada caja.
export async function generarPdfCompletoReparto(reparto, datosEtiquetas) {
  const selloBase64 = await cargarSelloBase64();
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  dibujarFichaEnvioEnPdf(doc, reparto);

  const vistos = new Set();
  for (const d of datosEtiquetas) {
    const clave = `${d.producto}|${d.lote}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    doc.addPage([145, 50], 'landscape');
    dibujarEtiquetaScanfiskEnPdf(doc, d, selloBase64);
  }
  return doc;
}

// Abre el PDF ya generado en una pestaña nueva. A diferencia de las hojas
// HTML de impresion/motor.js (que sí necesitan abrir la ventana ANTES de
// pedir nada al servidor, para no toparse con el bloqueo de ventanas
// emergentes), aquí se ha comprobado con Playwright que abrir la ventana
// DESPUÉS de tener el PDF listo (aunque haya habido una petición de por
// medio) no se bloquea — lo que sí falla, en cambio, es intentar rellenar
// con un blob/datauri una ventana que ya se había abierto en blanco antes
// (Chrome no deja navegar así una ventana ya existente a esa clase de URL),
// así que aquí NO se usa ese patrón de dos pasos.
export function abrirDocumentoPdf(doc) {
  const ventana = window.open(doc.output('bloburl'), '_blank');
  if (!ventana) alert('El navegador ha bloqueado la ventana del documento — permite las ventanas emergentes para esta página e inténtalo de nuevo.');
  return ventana;
}

export function nombreArchivoCompletoReparto(reparto) {
  const destino = `${reparto.destinatario_nombre || ''}_${reparto.destinatario_ciudad || ''}`.replace(/[^a-zA-Z0-9]/g, '_');
  return `REPARTO_${reparto.numero}_${destino}.pdf`;
}

// Solo las etiquetas de muestra (sin ficha de envío) — para la muestra que
// se manda a Scanfisk Celeiro (ver pantallas/muestraScanfisk.js).
export async function generarPdfMuestraScanfisk(datosEtiquetas) {
  const selloBase64 = await cargarSelloBase64();
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: [145, 50], orientation: 'landscape' });
  const vistos = new Set();
  let primera = true;
  for (const d of datosEtiquetas) {
    const clave = `${d.producto}|${d.lote}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    if (!primera) doc.addPage([145, 50], 'landscape');
    primera = false;
    dibujarEtiquetaScanfiskEnPdf(doc, d, selloBase64);
  }
  return doc;
}
