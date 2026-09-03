/*
 * MARINAFISK - Documentos A4 imprimibles (ficha de envio de Reparto Super,
 * hoja de ruta). El HTML actual los genera con jsPDF; aqui se generan como
 * una pagina HTML con CSS de impresion (@page a4) - mismo contenido y mismo
 * orden de datos, solo cambia el mecanismo de render (evita depender de una
 * libreria de PDF en el servidor). Igual que las etiquetas, el navegador
 * hace Ctrl+P sobre la pagina ya lista.
 */
const { fmtFechaCortaDesdeISO } = require('./etiquetas');

function escaparHtml(v) {
  return String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function construirCssFicha() {
  return `body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:15mm;color:#222;font-size:11px;}
    h1{font-size:15px;margin:10px 0 4px;}
    .empresa{font-size:15px;font-weight:700;}
    .empresa-datos{font-size:9px;margin:2px 0;}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px;}
    th{background:#1F4E79;color:#fff;padding:5px 6px;text-align:left;}
    td{padding:4px 6px;border-bottom:1px solid #ccc;}
    .num{text-align:right;}
    .totales{font-weight:700;margin-top:10px;border-top:1px solid #222;padding-top:6px;}
    @media print { @page { size: a4 portrait; margin: 15mm; } body{padding:0;} }`;
}

// Igual que dibujarFichaEnvioEnPdf() del HTML actual: cabecera de SCANFISK
// SEAFOOD SL (con su Reg. San. 12.01671/C - el mismo numero que en el resto
// de documentos, no el RSI del expedidor de las etiquetas), datos del
// reparto, tabla de lineas y totales.
function construirFichaEnvioHtml(reparto, lineas, copias = 1) {
  const filas = lineas.map((l) => `
    <tr>
      <td>${escaparHtml(l.lote)}</td>
      <td>${escaparHtml((l.descripcion || l.producto || '').slice(0, 42))}</td>
      <td>${escaparHtml((l.barco || '').slice(0, 16))}</td>
      <td>${escaparHtml(l.subzona)}</td>
      <td class="num">${escaparHtml(l.cajas || 0)}</td>
      <td class="num">${escaparHtml(l.kg || 0)}</td>
    </tr>`).join('');

  const ficha = `
    <div class="empresa">SCANFISK SEAFOOD SL</div>
    <div class="empresa-datos">CIF: B50607019&nbsp;&nbsp;|&nbsp;&nbsp;Calle P, Parcela 29 (Mercazaragoza)&nbsp;&nbsp;|&nbsp;&nbsp;Telf: +34 665862592</div>
    <div class="empresa-datos">Reg. San.: 12.01671/C</div>
    <h1>FICHA DE ENVÍO — Reparto Nº ${escaparHtml(reparto.numero)}</h1>
    <div>Destinatario: ${escaparHtml(reparto.destinatario_nombre)} ${escaparHtml(reparto.destinatario_ciudad)}</div>
    <div>Fecha: ${fmtFechaCortaDesdeISO(reparto.fecha)}&nbsp;&nbsp;|&nbsp;&nbsp;Conductor: ${escaparHtml(reparto.conductor || '—')}</div>
    <table>
      <thead><tr><th>Lote</th><th>Producto</th><th>Barco</th><th>Subzona</th><th class="num">Cajas</th><th class="num">Kg</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="totales">TOTALES: ${reparto.total_cajas || 0} cajas / ${reparto.total_kg || 0} kg aprox.</div>
  `;

  // La hoja de ruta imprime la misma ficha DOS veces en la misma A4 (para
  // cortar y quedarse una copia), igual que generarPdfHojaDeRutaReparto().
  const cuerpo = copias > 1
    ? `<div style="page-break-after:always;">${ficha}</div>${ficha}`
    : ficha;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ficha de envío — Reparto ${escaparHtml(reparto.numero)}</title><style>${construirCssFicha()}</style></head><body>${cuerpo}</body></html>`;
}

module.exports = { construirFichaEnvioHtml };
