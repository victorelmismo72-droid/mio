# MARINAFISK — Correcciones aplicadas hoy al programa actual (02/09/2026)

Este documento resume ocho correcciones/mejoras aplicadas directamente al programa HTML que se usa a diario, **fuera del proyecto de migración**, tras detectar un problema real de duplicados y algunos fallos de usabilidad. Se entrega a Claude Code para que las tenga en cuenta en el diseño y verificación del sistema nuevo — no se han implementado en el proyecto nuevo, pero el sistema nuevo debe evitar los mismos fallos y, donde tenga sentido, ofrecer las mismas mejoras.

---

## 1. Fallo corregido: doble/triple grabación por el mismo clic

**Qué pasó:** el 01/09/2026 se creó el mismo pedido tres veces (números 13786, 13787 y 13788, idénticos línea por línea) porque el botón "💾 GRABAR" de Pedidos, Repartos y Traspasos no se bloqueaba mientras se procesaba el guardado. Si se pulsaba el botón más de una vez mientras tardaba en responder (por ejemplo, por la latencia de comprobar la carpeta de red compartida), cada pulsación generaba un registro nuevo e independiente, cada uno con su propio número.

**Causa raíz:** las funciones de guardado son asíncronas (`async function grabarPedido()`, `grabarReparto()`, `grabarTrp()`) y no comprobaban si ya había una grabación en curso antes de empezar otra.

**Corrección aplicada en el HTML actual:** los tres botones de guardar ahora se desactivan en cuanto se pulsan (muestran "⏳ Grabando...") y no se reactivan hasta que termina el proceso, tanto si sale bien como si hay un error. Un segundo clic mientras tanto simplemente no hace nada.

**Requisito para el sistema nuevo:** cualquier acción de guardado (pedidos, repartos, traspasos, compras, partidas, y cualquier otra que escriba datos) debe protegerse contra el mismo problema — lo habitual en un sistema con backend real es hacerlo también a nivel de servidor (que una petición de guardado ya en curso no permita otra idéntica en paralelo), no solo bloqueando el botón en la pantalla. Esto es más robusto que la solución del HTML actual, que solo protege desde la pantalla.

---

## 2. Mejora añadida: actualización automática de la carpeta compartida al empezar el día

**Motivo:** relacionado con el fallo anterior, se detectó que los contadores de numeración (próximo pedido, próximo reparto, próximo traspaso) podían quedar desincronizados entre el puesto de Víctor y el de Pancho si no se refrescaba la carpeta compartida completa antes de empezar a trabajar. Antes, al abrir el programa solo se refrescaba automáticamente la caché de Pedidos — el resto (Compras, Traspasos, Repartos, Clientes, Artículos, Proveedores) solo se actualizaba al entrar manualmente en cada pestaña.

**Corrección aplicada en el HTML actual:** ahora, la primera vez que se abre el programa cada día (en cada ordenador), se refrescan automáticamente las siete cachés de la carpeta compartida antes de que el usuario empiece a trabajar, con un aviso visual mientras se hace. El resto de veces que se recargue la página ese mismo día, no se repite (para no ralentizar innecesariamente).

**Requisito para el sistema nuevo:** con base de datos real y backend propio (Fases 1-3), este problema debería desaparecer prácticamente del todo, porque no habría "cachés desincronizadas" en el sentido en que existen hoy — todos los usuarios leerían y escribirían contra la misma base de datos en tiempo real. Aun así, verificar explícitamente en la Fase 3 (o en la verificación transversal) que dos usuarios que abren sesión a la vez, cada uno desde su ordenador, ven siempre los mismos contadores y el mismo estado — sin necesidad de ningún refresco manual ni automático "por la mañana", porque no debería hacer falta.

---

## 3. Mejora añadida: listado de artículos vendidos, con traspasos internos aparte (para estadísticas)

**Motivo:** en la pantalla "Historial → 🔍 Buscar Artículos" (filtro por cliente/artículo/fechas), los traspasos internos a Zaragoza nunca aparecían, porque viven en una tabla distinta a los pedidos de venta. Esto es **correcto para efectos contables** (un traspaso no es una venta), pero Víctor necesita también poder ver, para estadísticas de "cuánto pescado se movió en total" de un artículo, la suma incluyendo lo traspasado a Zaragoza.

**Corrección aplicada en el HTML actual:** se añadió una casilla opcional "Incluir también los traspasos internos a Zaragoza" en ese buscador. Por defecto sigue sin incluirlos (comportamiento de siempre, para no confundir a efectos contables). Si se marca, los traspasos aparecen en la lista claramente diferenciados (fila en gris/cursiva, sin precio ni importe, etiquetados como "TRASPASO A ZARAGOZA (interno, no es venta)"), y los totales se separan en tres líneas: **Ventas reales** (kg + importe, como siempre), **Traspasado a Zaragoza** (solo kg), y **Total pescado movido** (la suma de ambos, para estadística).

**Requisito para el sistema nuevo:** esto conecta directamente con los **listados de gestión ya especificados en la Fase 2, punto 5bis**. Al construir el listado de ventas/movimientos por artículo y fecha, aplicar el mismo principio:
- Por defecto, mostrar solo ventas reales (lo que ya se pidió).
- Añadir la opción de incluir los traspasos internos a Zaragoza como una categoría aparte y claramente diferenciada, nunca mezclada silenciosamente con las ventas — con un total económico (solo ventas) y un total de kilos "estadístico" que sume ambos.
- Este mismo criterio (separar claramente lo que es venta real de lo que es movimiento interno) debe aplicarse también a cualquier otro listado o informe que trate kilos/artículos, no solo a este buscador concreto.

---

## 4. Mejora añadida: aviso cuando el precio de venta queda por debajo del coste (lista de precios manual)

**Motivo:** al rellenar manualmente la lista de precios (Pescaderías/Mayoristas), es fácil equivocarse y escribir un precio de venta menor que el coste, sin darse cuenta.

**Corrección aplicada en el HTML actual, en tres niveles:**
1. Mientras se escribe: la casilla de margen se pone roja con "⚠️ ¡PÉRDIDA!" y el propio campo de precio se resalta con borde rojo.
2. Al salir del campo: salta un aviso emergente en pantalla indicando el producto concreto, el precio, el coste y cuánto se pierde.
3. Antes de generar la imagen final: si sigue habiendo algún producto en pérdida, se lista todo y se pide confirmación explícita antes de continuar (no bloquea, por si alguna vez es intencionado, pero obliga a confirmarlo conscientemente).

**Requisito para el sistema nuevo:** en la Fase 4 (interfaz) y en la lógica de listas de precios (Fase 2), cualquier pantalla donde se introduzca manualmente un precio de venta debe comparar en vivo contra el coste real de la partida asignada (no solo un coste tecleado a mano, que puede no reflejar el coste real) y avisar de la misma manera — idealmente de forma más fiable que en el HTML, ya que el sistema nuevo sí conoce el coste real de la partida en todo momento, no depende de que Víctor lo escriba bien.

## 5. Mejora añadida: campo de existencias admite texto además de números

**Motivo:** en la misma lista de precios manual, el campo de "existencias (cajas)" solo aceptaba números. A veces es más útil poder escribir algo como "AGOTADO" o "POCAS" en vez de forzar un número.

**Corrección aplicada en el HTML actual:** el campo ahora admite texto libre además de números. Si se escribe un número, se muestra como "X cajas" en la imagen interna; si se escribe texto, se muestra tal cual (en mayúsculas).

**Requisito para el sistema nuevo:** el campo de existencias/stock en las pantallas de precios y partidas debe admitir igualmente texto libre además de cantidades numéricas exactas, para cubrir el mismo caso de uso (indicar disponibilidad aproximada sin un número exacto).

---

## 6. Mejora añadida: hoja Transfrío también disponible en Traspasos (a Zaragoza)

**Motivo:** la pantalla de Pedidos ya tenía el botón "🚚 HOJA TRANSFRÍO" para imprimir encima del papel del transportista (rellenando destino, fecha, bultos y kilos). La pantalla de Traspasos no lo tenía — nunca se había construido ahí, así que no había forma de generar esa misma hoja para los traspasos internos a Zaragoza.

**Corrección aplicada en el HTML actual:** se añadió el mismo botón en Traspasos, junto al de grabar. Como un traspaso es un movimiento interno (no una venta a un cliente), no tiene ficha en el catálogo de Clientes — así que el destinatario se puso fijo: **"MARINA FISH ZARAGOZA"**, con destino "ZARAGOZA", sin depender de ninguna búsqueda en Clientes. Rellena automáticamente fecha, bultos (cajas) y kilos a partir de las líneas del traspaso.

**Requisito para el sistema nuevo:** la Fase 4 (interfaz) debe incluir esta misma hoja de transporte también en la pantalla de Traspasos, no solo en Pedidos — con el mismo criterio: el destinatario de los traspasos a Zaragoza es una entidad fija interna ("MARINA FISH ZARAGOZA"), no un cliente del catálogo, así que no debe intentar buscarlo ahí ni obligar a crear una ficha de cliente falsa solo para poder imprimir la hoja de transporte.

---

## 7. Nueva funcionalidad: hoja CMR / Carta de Porte para clientes de Portugal (transportista Mouzo)

**Motivo:** los clientes servidos por el transportista "Mouzo Campos Trans, S.L." (agencia "MOZO" en el catálogo — actualmente solo un cliente: "MARIA CUSTODIA ALVES E FILLOS", código 50540) necesitan imprimir, además del albarán normal, una hoja CMR/Carta de Porte internacional para el transporte a Portugal. Es un papel pre-impreso del transportista (igual que Transfrío), sobre el que hay que imprimir encima solo los datos variables.

**Funcionalidad implementada en el HTML actual:**
- Nuevo botón **"📄 HOJA CMR / CARTA DE PORTE"** en la pantalla de Pedidos, que **solo aparece cuando el cliente seleccionado tiene la agencia "MOZO"** — para el resto de clientes permanece oculto.
- Rellena automáticamente, sobre el papel pre-impreso del transportista, estos campos (numeración según las casillas oficiales del formulario CMR):
  - **Casilla 1** (remitente — datos fijos de Marinafisk, en 4 líneas con letra reducida): nombre, dirección (partida en 2 líneas), y teléfono/CIF/registro sanitario.
  - **Casilla 2** (consignatario — cliente): nombre del cliente y su dirección, repartida automáticamente en tantas líneas como haga falta según su longitud (letra reducida).
  - **Casilla 3** (lugar de entrega): texto fijo **"INSTALACIONES CUSTODIA - PORTUGAL"** — la entrega es siempre en el mismo sitio.
  - **Casilla 4** (lugar y fecha de carga): fijo **"A CORUÑA, ESPAÑA"** + la fecha del pedido — la carga es siempre en nuestro almacén.
  - **Casilla 5**: número de albarán.
  - **Casilla 6**: texto fijo **"VER ALBARÁN ADJUNTO"** con el número de cajas debajo (el detalle completo del pescado va en el albarán, no se repite aquí).
  - **Casilla 11**: peso bruto total en kg.
  - **Casilla 21**: lugar (A CORUÑA) y fecha de formalización.
- Tiene el mismo sistema de calibración por milímetros que ya existe para Transfrío (pantalla "MODELOS DE IMPRESIÓN" → editor visual con cada campo ajustable en X/Y, botón "📐 Ver con regla" para calibrar, y "↩️ Restaurar de fábrica").
- Las coordenadas de partida se estimaron a partir de una foto del papel real (no de una medición exacta) y se han ido calibrando en varias rondas con impresiones de prueba hasta dejarlas ajustadas.

**Requisito para el sistema nuevo:**
- La Fase 4 (interfaz) debe incluir esta misma hoja CMR/Carta de Porte, con el mismo criterio de aparición condicional: **solo visible quando el cliente tiene asignado el transportista "MOZO"** (o el campo equivalente que use el sistema nuevo para identificar transportista/agencia por cliente).
- Los datos fijos (remitente Marinafisk, lugar de entrega en Portugal, lugar de carga en A Coruña) deben poder configurarse como constantes del sistema, no como texto libre que haya que volver a escribir cada vez — igual que ya se hace aquí.
- Si en el futuro Marinafisk trabaja con más clientes de Portugal (o más transportistas con formularios CMR propios), el diseño debe permitir añadir nuevas plantillas de hoja de transporte sin rehacer la lógica desde cero — algo semejante a un "diccionario" de transportista → plantilla de impresión.
- Mantener también aquí el mismo sistema de calibración manual en milímetros que Transfrío y CMR ya tienen en el HTML actual — es una herramienta que ha demostrado ser necesaria en la práctica, no un capricho: nunca se acierta a la primera con la posición exacta sobre un papel pre-impreso real.

---

## 8. Recordatorio: mantener siempre actualizado el catálogo/documentación de modelos de impresión

**Motivo:** el HTML actual tiene una pantalla ("MODELOS DE IMPRESIÓN") que lista todo lo que el programa puede imprimir, con una explicación de para qué sirve cada uno y un botón para ver un ejemplo. Al añadir la Hoja CMR (punto 7) se detectó que esa pantalla no se había actualizado a la vez — el modelo nuevo funcionaba, pero no aparecía documentado en el listado, lo que podría hacer pensar que no existe.

**Corrección aplicada en el HTML actual:** se añadió la fila que faltaba (Hoja CMR / Carta de Porte) a la tabla principal de modelos, y su referencia técnica correspondiente en la tabla "para un técnico".

**Requisito para el sistema nuevo:** el sistema nuevo debe tener el equivalente a esta pantalla de catálogo — un listado siempre actualizado de todo lo que se puede imprimir/generar, con qué es cada uno y cuándo aparece. Cada vez que se añada un modelo de impresión nuevo (una hoja, una etiqueta, un formato de transporte, etc.), añadirlo a ese catálogo debe ser un paso obligatorio del mismo cambio — no una tarea aparte que se pueda olvidar, como pasó aquí. Si es posible, mejor que el catálogo se genere automáticamente a partir de una lista central de modelos definidos en el código, en vez de mantenerse a mano en dos sitios distintos (el catálogo y el código real), que es precisamente lo que causó este desajuste.

---

*Estas correcciones ya están en producción en el HTML actual (versión `CARGA_DE_ALBARANES_MARINAFISK_2026-09-02-CORREGIDO.html`) y sirven de referencia de comportamiento esperado para el sistema nuevo — no como código a copiar literalmente, sino como especificación de qué debe hacer bien el sistema nuevo en estos puntos.*
