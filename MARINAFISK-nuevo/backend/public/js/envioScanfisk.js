// Envío del PDF completo de un reparto (ficha + etiquetas de muestra) a
// Scanfisk Celeiro por WhatsApp/Email — FASE_5, último punto pendiente.
// Réplica de enviarPdfCompletoDeReparto()/enviarWhatsappMultiple() del HTML
// actual. La "muestra" del HTML actual (enviarMuestraScanfiskPorWhatsapp/
// Email) dependía por completo de la importación de Excel "CARGA [super]",
// ya documentada en FASE_5 como código muerto (sin botón que la dispare,
// ver §2) — aquí se envía en su lugar el PDF completo de un reparto real ya
// grabado, que es el mismo documento (ficha + una etiqueta de muestra por
// producto/lote) pero sobre un dato de verdad, no uno que nunca llega a
// generarse.
import { api } from './api.js';

export function limpiarNumerosTelefono(numerosStr) {
  return String(numerosStr || '').split(/[,;]/).map((n) => n.trim()).filter(Boolean).map((n) => {
    let limpio = n.replace(/[^0-9+]/g, '');
    if (limpio.indexOf('+') !== 0 && limpio.length <= 9) limpio = `34${limpio}`;
    return limpio;
  });
}

// Si hay más de un número, el navegador no deja abrir todas las pestañas de
// WhatsApp de golpe (cada window.open() después del primero se bloquearía,
// igual que se comprobó con los PDF en documentosReparto.js) — se muestra
// un botón por número, cada uno su propio clic/gesto del usuario, igual que
// el modal dinámico del HTML actual.
export function abrirWhatsappMultiple(numerosStr, mensaje) {
  const numeros = limpiarNumerosTelefono(numerosStr);
  if (!numeros.length) return;
  if (numeros.length === 1) {
    window.open(`https://wa.me/${numeros[0].replace('+', '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
    return;
  }
  const overlay = document.createElement('div');
  overlay.setAttribute('style', 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;');
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });

  const caja = document.createElement('div');
  caja.setAttribute('style', 'background:#fff;padding:20px;border-radius:8px;max-width:320px;width:90%;');
  caja.innerHTML = '<p><strong>Enviar por WhatsApp — varios números</strong></p>'
    + '<p style="font-size:13px;color:#666;">Toca cada uno para abrirlo (uno detrás de otro, el navegador no deja abrir todos de golpe):</p>';

  numeros.forEach((n) => {
    const boton = document.createElement('button');
    boton.className = 'secundario';
    boton.style.display = 'block';
    boton.style.width = '100%';
    boton.style.marginBottom = '6px';
    boton.textContent = `📱 ${n}`;
    boton.addEventListener('click', () => window.open(`https://wa.me/${n.replace('+', '')}?text=${encodeURIComponent(mensaje)}`, '_blank'));
    caja.appendChild(boton);
  });
  const cerrar = document.createElement('button');
  cerrar.className = 'pequeno';
  cerrar.textContent = 'Cerrar';
  cerrar.addEventListener('click', () => overlay.remove());
  caja.appendChild(cerrar);

  overlay.appendChild(caja);
  document.body.appendChild(overlay);
}

export function abrirEmail(email, asunto, cuerpo) {
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

export function obtenerContactoScanfiskCeleiro() {
  return api.get('/api/configuracion/contacto-scanfisk-celeiro');
}

// Réplica de cambiarContactoScanfiskCeleiro() del HTML actual (mismos dos
// prompt() seguidos) — solo cambia dónde se guarda: antes localStorage por
// ordenador, ahora la tabla "configuracion" compartida entre CORU y PANC.
export async function pedirYGuardarContactoScanfiskCeleiro() {
  const actual = await obtenerContactoScanfiskCeleiro();
  const telNuevo = prompt('Teléfono(s) de WhatsApp de administración de Scanfisk en Celeiro. Si quieres varios, sepáralos con comas, ej: 699111222, 699333444', actual.tel);
  if (telNuevo === null) return null;
  const emailNuevo = prompt('Email de administración de Scanfisk en Celeiro (déjalo vacío si no aplica):', actual.email);
  if (emailNuevo === null) return null;
  return api.put('/api/configuracion/contacto-scanfisk-celeiro', { tel: telNuevo.trim(), email: emailNuevo.trim() });
}
