# Verificación: Envío del PDF completo del reparto por WhatsApp/Email — 20/09/2026

Fecha: 2026-09-20

Ver `FASE_5_etiquetas_MARINAFISK.md` (§2, último punto) para el porqué del cambio de alcance: la pieza pedida como "envío de la muestra Scanfisk por WhatsApp/email" (`enviarMuestraScanfiskPorWhatsapp/Email` del HTML actual) resultó depender por completo de la importación de Excel "CARGA [super]", ya documentada como código muerto (sin botón real que la dispare) — así que, igual que se hizo con el importador de etiquetas de Scanfisk en Fase 5/Fase 6, se construyó en su lugar la función hermana que sí es alcanzable de verdad desde la interfaz: `enviarPdfCompletoDeReparto(uid, canal)`, que envía el PDF completo (ficha + etiquetas de muestra) de un **reparto real ya grabado**, exactamente el mismo documento que ya se probó en `VERIFICACION_DOCUMENTOS_REPARTO_2026-09-20.md`.

Probado con Chromium real (Playwright) contra el backend y la base de datos reales — reparto real nº 137 (ALCAMPO, MADRID).

## Qué se ha construido

- `backend/src/lib/configuracion.js` / `backend/src/routes/configuracion.js`: `GET`/`PUT /api/configuracion/contacto-scanfisk-celeiro` — el teléfono(s) y email de administración de Scanfisk Celeiro, guardados en la tabla `configuracion` compartida (antes vivían en `localStorage`, por ordenador — con dos puestos reales, CORU y PANC, cada uno tenía que configurarlo por su cuenta y podían acabar desincronizados).
- `backend/public/js/envioScanfisk.js`: `limpiarNumerosTelefono` (mismo prefijo +34 automático que el HTML actual), `abrirWhatsappMultiple` (un número → pestaña directa; varios → un botón por número, para no toparse con el bloqueo de ventanas emergentes al intentar abrir varias de golpe), `abrirEmail` (`mailto:` con asunto y cuerpo), `pedirYGuardarContactoScanfiskCeleiro` (mismos dos `prompt()` seguidos que `cambiarContactoScanfiskCeleiro()` del HTML actual, ahora guardando en la tabla compartida).
- Pantalla de Repartos: botón "📞 Contacto Scanfisk Celeiro" (junto al título) y, en cada fila de "Repartos recientes", "📲 WhatsApp" / "✉️ Email" — generan el mismo PDF completo que "📦 Completo"/"⬇️ Descargar", lo descargan (el navegador no puede adjuntar un fichero a un enlace `wa.me`/`mailto:` por sí solo) y abren WhatsApp/el correo con el mensaje ya escrito, con un aviso explícito de que hay que adjuntar el PDF a mano — igual que el HTML actual.

## Qué se ha probado

1. **Sin contacto configurado todavía**: al pulsar "📲 WhatsApp" sobre un reparto real, sale el aviso correcto ("Todavía no has puesto el teléfono…") y no se genera ni descarga ningún PDF ni se abre ninguna ventana — comprobado que no hace la petición de más.
2. **Configurar el contacto** (botón "📞 Contacto Scanfisk Celeiro"): los dos `prompt()` se contestaron con un teléfono con dos números ("699111222, 699333444") y un email de prueba; se comprobó, leyendo directamente de la API, que ambos quedan guardados tal cual en la tabla `configuracion` compartida.
3. **Envío por WhatsApp con dos números**: al pulsar "📲 WhatsApp" aparece primero la alerta de "archivo descargado, adjúntalo a mano" con el nombre real del fichero, y luego — al haber más de un número — un modal con un botón por número en vez de intentar abrir las dos pestañas de golpe (se comprobó explícitamente que no se abre ninguna pestaña sola). Al pulsar el botón del primer número se abre una pestaña nueva hacia `https://wa.me/34699111222?text=...` — comprobada la URL exacta capturada en la propia llamada a `window.open()`: número normalizado con el prefijo 34 y el mensaje real ("...reparto Nº 137 de ALCAMPO MADRID (11/09/26)...") correctamente codificado.
4. **Envío por Email**: al pulsar "✉️ Email" aparece la alerta equivalente y se asigna `location.href` a un `mailto:` — comprobado que la propia pestaña de la aplicación NO navega a ningún sitio (el navegador intercepta el esquema `mailto:` para abrir el cliente de correo del sistema, tal como se espera; no se generó ningún evento de navegación real en la página).
5. **Sin errores de consola ni de página** en ninguno de los pasos anteriores.

## Regresión

Después de las pruebas se dejó el contacto de Scanfisk Celeiro vacío de nuevo (`PUT` con `tel`/`email` en blanco), para no dejar un contacto de prueba guardado como si fuera real. No hizo falta reconstruir la base de datos: el resto de las pruebas son de solo lectura sobre el reparto real (mismos endpoints que en `VERIFICACION_DOCUMENTOS_REPARTO_2026-09-20.md`) — se comprobó que el recuento de repartos siguió en 135 antes y después.

## Conclusión

Queda construida y probada con datos reales la pieza realmente alcanzable de "enviar la muestra de etiquetas de un reparto por WhatsApp/email" — con un cambio de alcance justificado y documentado (la función literalmente llamada así en el HTML actual es, en la práctica, código inalcanzable, igual que el importador de Excel del que depende). Con esto se cierran los tres puntos que `FASE_5_etiquetas_MARINAFISK.md` había dejado diferidos, salvo la importación de hojas Excel "CARGA [super]" de Scanfisk, que sigue pendiente si Víctor la sigue necesitando de verdad.
