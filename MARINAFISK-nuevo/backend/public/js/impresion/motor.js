// Motor genérico de impresión. Dos modos:
//   - "sobre papel pre-impreso" (Transfrío, CMR): cada campo se coloca con
//     posición absoluta en milímetros sobre una hoja A4 en blanco, para
//     imprimir encima del papel ya impreso del transportista.
//   - documentos normales (albarán): una página con su propio maquetado,
//     sin necesidad de calibrar nada.
// Ambos admiten "en lote": varias páginas seguidas en un único documento,
// listas para imprimir de golpe (corrección 02/09/2026 punto 9).

function ventanaConEstilo(titulo, estiloExtra) {
  const ventana = window.open('', '_blank');
  if (!ventana) {
    alert('El navegador ha bloqueado la ventana de impresión — permite las ventanas emergentes para esta página e inténtalo de nuevo.');
    return null;
  }
  ventana.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${titulo}</title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      .hoja { position: relative; width: 210mm; height: 297mm; page-break-after: always; overflow: hidden; }
      .hoja:last-child { page-break-after: auto; }
      ${estiloExtra || ''}
    </style></head><body></body></html>`);
  ventana.document.close();
  return ventana;
}

// ---------------- Sobre papel pre-impreso (Transfrío, CMR) ----------------
export function imprimirSobrePapel({ titulo, modelo, listaValores }) {
  const ventana = ventanaConEstilo(titulo, `
    .campo { position: absolute; white-space: pre-line; font-size: 10.5pt; line-height: 1.25; }
  `);
  if (!ventana) return;

  const cuerpo = ventana.document.body;
  for (const valores of listaValores) {
    const hoja = ventana.document.createElement('div');
    hoja.className = 'hoja';
    for (const campo of modelo.campos) {
      const texto = valores[campo.clave];
      if (texto === undefined || texto === null || texto === '') continue;
      const div = ventana.document.createElement('div');
      div.className = 'campo';
      div.style.left = `${campo.xMmActual}mm`;
      div.style.top = `${campo.yMmActual}mm`;
      div.textContent = texto;
      hoja.appendChild(div);
    }
    cuerpo.appendChild(hoja);
  }
  ventana.focus();
  setTimeout(() => ventana.print(), 300);
}

// ---------------- Albarán (con o sin precios) ----------------
export function imprimirAlbaran({ listaPedidos, conPrecios }) {
  const ventana = ventanaConEstilo(conPrecios ? 'Albarán' : 'Albarán (sin precios)', `
    .hoja { padding: 15mm; }
    h2 { margin: 0 0 2mm 0; }
    .cabecera-doc { margin-bottom: 6mm; font-size: 10.5pt; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td { border: 1px solid #999; padding: 2mm 3mm; text-align: left; }
    th { background: #eee; }
    .totales { margin-top: 4mm; text-align: right; font-size: 11pt; }
  `);
  if (!ventana) return;
  const d = ventana.document;
  const cuerpo = d.body;

  for (const { pedido, lineas } of listaPedidos) {
    const hoja = d.createElement('div');
    hoja.className = 'hoja';
    hoja.innerHTML = `
      <h2>MARINAFISK PESCADOS S.A.</h2>
      <div class="cabecera-doc">
        Albarán nº <strong>${pedido.numero}</strong> — ${String(pedido.fecha).slice(0, 10)}<br>
        Cliente: ${pedido.cliente_nombre_snapshot || ''}${pedido.cliente_dir_snapshot ? ' — ' + pedido.cliente_dir_snapshot : ''}${pedido.cliente_pob_snapshot ? ' — ' + pedido.cliente_pob_snapshot : ''}
      </div>
      <table>
        <thead><tr>
          <th>Artículo</th><th>Cajas</th><th>Peso (kg)</th>
          ${conPrecios ? '<th>Precio €/kg</th><th>Total</th>' : ''}
        </tr></thead>
        <tbody>
          ${lineas.map((l) => `<tr>
            <td>${l.descripcion_editada || l.descripcion_snapshot || l.articulo_codigo_snapshot || ''}</td>
            <td>${l.cantidad ?? ''}</td><td>${l.peso ?? ''}</td>
            ${conPrecios ? `<td>${Number(l.precio || 0).toFixed(2)} €</td><td>${Number(l.total || 0).toFixed(2)} €</td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>
      ${conPrecios ? `<div class="totales">Base: ${Number(pedido.base || 0).toFixed(2)} € · IVA: ${Number(pedido.iva || 0).toFixed(2)} €${pedido.recargo_importe ? ' · Recargo: ' + Number(pedido.recargo_importe).toFixed(2) + ' €' : ''} · <strong>Total: ${Number(pedido.total || 0).toFixed(2)} €</strong></div>` : ''}
    `;
    cuerpo.appendChild(hoja);
  }
  ventana.focus();
  setTimeout(() => ventana.print(), 300);
}
