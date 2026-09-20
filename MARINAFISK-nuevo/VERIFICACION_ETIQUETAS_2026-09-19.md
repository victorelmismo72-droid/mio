# Verificación: Etiquetas (FASE_5) — 19/09/2026

Fecha: 2026-09-19

Ver `FASE_5_etiquetas_MARINAFISK.md` para de dónde sale cada regla (todas ya reales en el HTML actual, no inventadas) y qué se ha dejado fuera de esta tanda a propósito (importación Excel Scanfisk, envío WhatsApp/email de la muestra, ficha de envío/hoja de ruta). Probado con Chromium real (Playwright) contra el backend y la base de datos reales — los 154 artículos y 163 clientes migrados, incluidos los 6 clientes reales que ya tenían un `formato_etiqueta` distinto del estándar.

## Qué se ha probado

1. **Los 6 formatos, con clientes y artículos reales** — se generó una etiqueta con cada uno de los 6 formatos (`marina_fisk`, `marina_fisk_fr`, `marina_fisk_it`, `marina_fisk_masymas`, `david_sala`, `scanfisk`), usando en cada caso un cliente real que ya tenía ese formato asignado en el catálogo migrado (p.ej. POMONA - TERRE AZUR para francés, PESCADOS DAVID SALA BLANES para David Sala, ECOMORA para Scanfisk). Se comprobó visualmente (capturas de pantalla) que:
   - El encabezado de empresa (franja izquierda) es el correcto en cada caso — logo y sello reales para Marina Fisk/Scanfisk, sello de texto propio para Más y Más/David Sala, sin logo para David Sala.
   - El idioma de las etiquetas de campo y las traducciones (p.ej. "PLUSIEURS BATEAUX", "VOIR CAISSE", "MERLAN BLEU" en francés) son correctos.
   - La caducidad del formato francés es fecha + 12 días fijo (19/09 → 01/10), distinta del resto (fecha + 7 días, configurable).
   - El QR se genera dentro de la etiqueta y el logo/sello (imágenes JPEG reales extraídas del HTML actual) cargan correctamente, sin romperse por abrirse la ventana de impresión en blanco (`about:blank`) — las rutas de imagen se construyen con el origen completo, no solo la ruta.
2. **Detectado y corregido un fallo real de programación**: el motor de impresión (`impresion/etiquetas.js`) esperaba una clave `formatoId` (camelCase) pero la API siempre devuelve `formato_id` (snake_case, como el resto del sistema) — como resultado, **toda etiqueta se imprimía siempre en el formato español por defecto**, en silencio, sin ningún error visible, sin importar qué formato correspondiera de verdad. Se detectó al comprobar visualmente la etiqueta en italiano y ver las etiquetas de campo en español. Corregido y vuelto a probar con los 6 formatos — confirmado con capturas de pantalla que cada uno ya sale en su idioma/encabezado correcto.
3. **Pedido real — las 4 opciones del diálogo** (todas/selección/prueba/repetir), abierto desde el botón 🏷️ en Historial: "todas" generó una etiqueta por cada línea (respetando `copiasPorLinea`), "prueba" generó exactamente 1, "repetir" con 4 generó exactamente 4 de la misma línea.
4. **Traspaso real** — botón 🏷️ en Traspasos: etiquetas con destinatario fijo "MARINA FISH ZARAGOZA" (unificado con la misma constante que ya usa la Hoja Transfrío, ver nota en `datosEtiquetas.js`).
5. **Reparto real, con seguimiento de "ya impreso"** — primera impresión: genera las etiquetas y marca las cajas como impresas. Segunda impresión sin cambios: reimprime "todas" directamente sin preguntar nada (no hay conflicto ya-impreso/nuevo). No se ha podido probar en esta sesión el caso "se añaden cajas después de imprimir, y hay que elegir entre todas otra vez / solo lo nuevo" con un reparto real que de verdad creciera entre dos impresiones — la lógica (`conAlgoYaImpreso && conAlgoNuevo`) es la misma condición, ya probada por separado, que usa el HTML actual.
6. **Etiquetas sueltas** — pantalla nueva: el formato se autocompleta según el `formato_etiqueta` real del cliente elegido, y se pudo forzar cantidad/overrides de zona/subzona/arte/peso/lote.
7. **Clientes — el desplegable de formato de etiqueta no corrompe datos reales**: se comprobó explícitamente que, al editar el cliente ECOMORA (formato real `scanfisk`, uno de los 6 valores ya en uso), el desplegable muestra "Scanfisk Seafood" seleccionado — si el desplegable no hubiera incluido ese id como opción, guardar sin querer lo habría reseteado en silencio.
8. **Móvil (375px)**: la pantalla "Etiquetas sueltas" no tiene scroll horizontal.

## Regresión

Tras las pruebas se reconstruyó la base de datos desde el backup real (`DROP`/`CREATE DATABASE`, `schema.sql`, `migrar_backup.js`) para deshacer los cambios de prueba — en concreto, la marca de "cajas ya impresas" que se tocó en un reparto real al probar el flujo de reparto. Se volvió a ejecutar:

- `verificar_migracion.js`: 71.018 comprobaciones de campo, 0 diferencias.
- `verificar_fase2.js`: todas las comprobaciones de OP2/IVA/Recargo/asignación de partida siguen correctas.

Ambas idénticas a las de la primera verificación (14/09/2026), solo cambia la fecha de ejecución.

## Conclusión

**Los 4 orígenes de etiqueta (sueltas, pedido, traspaso, reparto) y los 6 formatos, probados con datos y navegador reales**, no solo revisados en el código — incluyendo un fallo real de programación detectado y corregido durante la propia prueba (formato siempre en español por un desajuste de nombre de campo entre la API y el motor de impresión). Sigue pendiente, tal como quedó señalado en `FASE_5_etiquetas_MARINAFISK.md`: la importación de hojas Excel "CARGA [super]" de Scanfisk, el envío de la muestra en PDF por WhatsApp/email, y los documentos de transporte del reparto (ficha de envío, hoja de ruta) — ninguno de los tres es una etiqueta en sí, son piezas complementarias que se pueden seguir haciendo a mano mientras tanto.
