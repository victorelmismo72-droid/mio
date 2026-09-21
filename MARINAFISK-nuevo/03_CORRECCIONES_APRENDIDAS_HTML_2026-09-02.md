# MARINAFISK — Correcciones aprendidas del HTML en producción (02/09/2026)

Este documento traduce a requisitos concretos para el sistema nuevo las once correcciones que Víctor aplicó directamente al programa HTML en producción el 02/09/2026 (documento original: `CORRECCIONES_02-09-2026_para_Code_6.md`), **fuera de este proyecto de migración**. Ninguna de ellas se ha implementado aquí — este documento existe para que no se pierdan al diseñar y verificar las fases que aún quedan por escribir o completar.

**Aviso sobre la versión de referencia:** el HTML de referencia de este repositorio (`CARGA_DE_ALBARANES_MARINAFISK_20260821I.html`, 21/08/2026) es anterior a la versión donde se aplicaron estas correcciones (`..._2026-09-02-CORREGIDO.html`). Las once correcciones de abajo **no están reflejadas** en el HTML de este repositorio. Si en algún momento se necesita inspeccionar el código fuente de alguna de ellas (por ejemplo, la calibración de la Hoja CMR o la función de reparto de nombre/ciudad), pedir a Víctor la versión `2026-09-02-CORREGIDO` o posterior — no asumir que el `.html` de aquí ya las contiene.

Cada punto indica en qué fase(s) del plan actual debe tenerse en cuenta. Fase 3 (sincronización/multiusuario) y Fase 4 (interfaz) todavía no tienen documento propio en este repositorio — cuando se escriban, deben incorporar los puntos marcados como suyos.

---

## 1. Protección contra doble grabación por clic repetido — Fase 1 y Fase 2

Origen: en el HTML actual, tres pulsaciones seguidas del botón "GRABAR" (mientras la operación async tardaba) crearon tres pedidos idénticos con números correlativos distintos (13786-13788).

**Requisito:** ninguna operación de escritura (pedidos, repartos, traspasos, compras, partidas, listas de precios, o cualquier otra) puede depender solo de deshabilitar un botón en pantalla. El backend (Fase 1/2) debe rechazar o ignorar una segunda petición de escritura idéntica/concurrente mientras la primera sigue en curso — por ejemplo, con un token de idempotencia por operación, o con una transacción que bloquee la generación del siguiente número correlativo hasta que la anterior termine. El bloqueo de botón en el frontend (Fase 4) sigue siendo deseable como primera línea de defensa, pero no sustituye a la protección de servidor.

**Dónde verificarlo:** añadir un caso de prueba explícito en el cierre de Fase 2 (o donde se cierre el backend de escritura): disparar la misma operación de guardado varias veces en rápida sucesión (simulando clics repetidos o llamadas concurrentes) y comprobar que solo se crea un registro.

---

## 2. Consistencia de contadores y datos entre puestos sin refresco manual — Fase 1 y Fase 3

Origen: en el HTML actual, los contadores de numeración podían desincronizarse entre CORU y PANC si no se refrescaba manualmente la carpeta compartida; se añadió un refresco automático de las siete cachés al primer arranque del día como parche.

**Requisito:** con base de datos real y backend propio (ver `02_ESQUEMA_BASE_DATOS_PROPUESTO.md`, contadores generados por secuencias/transacciones de la BD), este problema debería desaparecer estructuralmente — no debe existir el concepto de "caché desincronizada que hay que refrescar por la mañana". Esto ya está implícito en el diseño de Fase 1/esquema, pero se marca aquí como **criterio de verificación obligatorio de Fase 3** (o de la fase que trate la concurrencia multiusuario): dos usuarios con sesión abierta simultánea, cada uno desde su propio puesto, deben ver siempre los mismos contadores y el mismo estado, sin ningún refresco manual ni automático "de arranque diario".

---

## 3. Listados: separar siempre ventas reales de traspasos internos — Fase 2

Origen: el buscador de artículos vendidos no incluía los traspasos a Zaragoza (correcto a efectos contables), pero Víctor necesita a veces ver el total de pescado movido incluyéndolos, sin mezclarlos con las ventas.

**Requisito para cualquier listado o informe que trate kilos/artículos vendidos o movidos** (incluyendo el listado de ventas/movimientos por artículo y fecha de `FASE_2_logica_de_negocio_MARINAFISK.md`, sección 3, y cualquier informe de gestión futuro):
- Por defecto, mostrar solo ventas reales (pedidos), nunca traspasos.
- Ofrecer una opción explícita para incluir también los traspasos internos a Zaragoza, mostrados siempre en una categoría visualmente diferenciada (nunca mezclados silenciosamente con las ventas), sin precio ni importe asociado.
- Cuando se incluyan, separar los totales en tres cifras: ventas reales (kg + importe), traspasado a Zaragoza (solo kg), y total de pescado movido (suma de ambos, solo a efectos estadísticos, nunca como cifra de facturación).

---

## 4. Aviso de precio de venta por debajo del coste real de partida — Fase 2 y Fase 4

Origen: en la lista de precios manual, era fácil introducir un precio de venta inferior al coste sin darse cuenta; se añadieron avisos en tres momentos (mientras se escribe, al salir del campo, antes de generar la imagen final).

**Requisito:** en cualquier pantalla donde se introduzca manualmente un precio de venta (listas de precios de `FASE_2_logica_de_negocio_MARINAFISK.md` sección 4, y cualquier pantalla equivalente de Fase 4), comparar en vivo el precio introducido contra el **coste real de la partida asignada** (no un coste tecleado a mano) y avisar de forma clara si el margen resultante es negativo o queda por debajo del margen mínimo de referencia (1,30 €/kg, ver `FASE_0_reglas_de_negocio_MARINAFISK.md` punto 3). El sistema nuevo tiene ventaja aquí sobre el HTML actual porque conoce el coste real de la partida en todo momento — el aviso no debe depender de que Víctor lo transcriba bien. No debe bloquear el guardado (puede ser intencionado), pero sí exigir confirmación explícita cuando haya productos en pérdida antes de dar por generada la lista final.

---

## 5. Campo de existencias/stock admite texto libre además de números — Fase 2 y Fase 4

**Requisito:** el campo de existencias/stock en pantallas de precios y partidas debe aceptar tanto cantidades numéricas ("X cajas") como texto libre (p. ej. "AGOTADO", "POCAS"), mostrando cada caso tal cual corresponda en la imagen/documento generado. Añadir esto explícitamente a la sección 4 de `FASE_2_logica_de_negocio_MARINAFISK.md` (listas de precios) y a la especificación de Fase 4 cuando se escriba.

---

## 6. Hoja Transfrío también en Traspasos — Fase 4

**Requisito:** la funcionalidad de imprimir la Hoja Transfrío (ya existente para Pedidos) debe estar disponible también en la pantalla de Traspasos. El destinatario de un traspaso a Zaragoza es una entidad interna fija ("MARINA FISH ZARAGOZA"), no un cliente del catálogo — la Fase 4 no debe intentar buscarlo en Clientes ni obligar a crear una ficha de cliente falsa solo para poder imprimir esta hoja.

---

## 7. Hoja CMR / Carta de Porte para clientes con transportista Mouzo (Portugal) — Fase 4 (y catálogo/maestro de clientes)

**Requisito:**
- La Fase 4 debe incluir una hoja CMR/Carta de Porte, visible **solo** cuando el cliente seleccionado tiene asignado el transportista "MOZO" (Mouzo Campos Trans, S.L.) — o el campo equivalente de transportista/agencia por cliente que use el sistema nuevo.
- Los datos fijos (remitente Marinafisk, lugar de entrega en Portugal, lugar de carga en A Coruña) deben ser constantes configurables del sistema, no texto libre que haya que reescribir cada vez.
- El diseño debe permitir añadir en el futuro más plantillas de hoja de transporte para otros transportistas/clientes internacionales sin rehacer la lógica desde cero — un "diccionario" transportista → plantilla de impresión, no un caso especial cableado a mano.
- Mantener el mismo sistema de calibración manual en milímetros (editor visual X/Y, "ver con regla", restaurar de fábrica) que ya existe en el HTML para Transfrío — es una necesidad real de imprimir sobre papel pre-impreso físico, no un capricho.

---

## 8. Catálogo de modelos de impresión siempre actualizado, idealmente autogenerado — Fase 4

Origen: al añadir la Hoja CMR se olvidó actualizar a la vez la pantalla de catálogo ("MODELOS DE IMPRESIÓN") que documenta qué se puede imprimir.

**Requisito:** el sistema nuevo debe tener un catálogo equivalente de todo lo que se puede imprimir/generar. Si es posible, generarlo automáticamente a partir de una lista central de modelos definidos en el código (una sola fuente de verdad), en vez de mantenerlo a mano en dos sitios (catálogo y código real) — que es precisamente lo que causó el desajuste en el HTML actual. Si no se genera automáticamente, añadir la entrada al catálogo debe ser un paso obligatorio del mismo cambio que añade el modelo nuevo, nunca una tarea aparte.

---

## 9. Impresión en lote de documentos sobre papel pre-impreso — Fase 4

**Requisito:** cualquier documento que se imprima "encima de un papel pre-impreso del transportista" (Transfrío, CMR, y cualquiera que se añada después) debe poder generarse tanto de uno en uno como en lote (varios pedidos seleccionados a la vez, con casillas de marcar + filtro como alternativa si no se marca ninguna). Esta capacidad de "seleccionar varios e imprimir de golpe" debe ser una funcionalidad transversal de la pantalla de listados/historial — no algo que se reconstruya a mano para cada tipo de documento nuevo. Al imprimir en lote, avisar siempre antes de cuántos documentos se van a generar, para poder preparar el papel físico necesario.

---

## 10. Reglas técnicas para impresión en lote: copias dentro del PDF y aperturas solo por clic directo — Fase 4

Dos reglas técnicas que evitaron fallos reales al construir la impresión en lote:

1. **Copias por documento dentro del propio PDF generado**, nunca dependiendo del ajuste "copias" del diálogo de impresión del navegador/SO — esa opción siempre repite el documento completo entero (cliente 1, cliente 2, cliente 3... y luego otra vuelta), nunca cada parte por separado seguida. Si un flujo necesita varias copias seguidas de la misma página antes de pasar a la siguiente, deben construirse repitiendo la página dentro del PDF.
2. **Abrir cada ventana/pestaña nueva siempre como respuesta directa a un clic del usuario**, nunca de forma automática tras una espera (`setTimeout` o similar) — los navegadores bloquean en silencio, sin aviso visible, las ventanas emergentes que no vienen de una acción directa. Diseñar flujos de "abrir varios documentos en secuencia" como "un paso, un clic, un paso, un clic" (botón "abrir siguiente"), nunca como automatización con pausas.

**Aplica a:** cualquier flujo de Fase 4 que genere documentos en lote o abra varias ventanas/pestañas seguidas (impresión, descarga, o cualquier otra cosa).

---

## 11. Separación de campos combinados: siempre reversible, nunca duplicable — Fase 1 (diseño de esquema) y Fase 2

Origen: en Reparto Super, un destinatario combinado ("ECOMORA") se guardaba mal repartido entre los campos `nombre`/`ciudad` (todo el texto en los dos campos a la vez, en vez de solo en uno) para cualquier caso que no fuera "ALCAMPO [ciudad]". Cada vez que se reabría y regrababa el reparto sin tocar nada, el texto se reconstruía duplicado y se volvía a partir mal — duplicándose sin límite en cada ciclo de abrir/grabar.

**Requisito general de diseño**, aplicable a cualquier campo combinado que el sistema nuevo separe en varios campos (no solo nombre/ciudad de repartos):
- La separación debe ser **reversible sin pérdida ni duplicación**: reconstruir el texto original a partir de los campos separados debe dar siempre el mismo resultado, se repita la operación las veces que se repita.
- Cualquier "recorte automático" que no reconozca un patrón conocido debe dejar el resto de campos vacíos, **nunca copiar el texto completo en más de un campo a la vez**.
- Norma general para todo el sistema: abrir un registro existente para editarlo (y cancelar, o grabar sin cambiar nada) debe ser siempre una operación segura que deja el dato exactamente igual que estaba. Esto debe formar parte de los criterios de verificación de cualquier fase que implemente edición de registros (Fase 2 en adelante).

---

*Preparado a partir de `CORRECCIONES_02-09-2026_para_Code_6.md`, entregado por Víctor el 02/09/2026, como complemento de `FASE_0_reglas_de_negocio_MARINAFISK.md`, `FASE_1_base_de_datos_backend_MARINAFISK.md` y `FASE_2_logica_de_negocio_MARINAFISK.md`. No implementado en este proyecto — es especificación de comportamiento esperado para las fases pendientes.*
