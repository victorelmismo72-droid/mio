# MARINAFISK — Correcciones aplicadas hoy al programa actual (02/09/2026)

Este documento resume veintidós correcciones/mejoras aplicadas directamente al programa HTML y al Excel de gestión que se usan a diario, **fuera del proyecto de migración**, tras detectar un problema real de duplicados y algunos fallos de usabilidad. Se entrega a Claude Code para que las tenga en cuenta en el diseño y verificación del sistema nuevo — no se han implementado en el proyecto nuevo, pero el sistema nuevo debe evitar los mismos fallos y, donde tenga sentido, ofrecer las mismas mejoras.

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
- La Fase 4 (interfaz) debe incluir esta misma hoja CMR/Carta de Porte, con el mismo criterio de aparición condicional: **solo visible cuando el cliente tiene asignado el transportista "MOZO"** (o el campo equivalente que use el sistema nuevo para identificar transportista/agencia por cliente).
- Los datos fijos (remitente Marinafisk, lugar de entrega en Portugal, lugar de carga en A Coruña) deben poder configurarse como constantes del sistema, no como texto libre que haya que volver a escribir cada vez — igual que ya se hace aquí.
- Si en el futuro Marinafisk trabaja con más clientes de Portugal (o más transportistas con formularios CMR propios), el diseño debe permitir añadir nuevas plantillas de hoja de transporte sin rehacer la lógica desde cero — algo semejante a un "diccionario" de transportista → plantilla de impresión.
- Mantener también aquí el mismo sistema de calibración manual en milímetros que Transfrío y CMR ya tienen en el HTML actual — es una herramienta que ha demostrado ser necesaria en la práctica, no un capricho: nunca se acierta a la primera con la posición exacta sobre un papel pre-impreso real.

---

## 8. Recordatorio: mantener siempre actualizado el catálogo/documentación de modelos de impresión

**Motivo:** el HTML actual tiene una pantalla ("MODELOS DE IMPRESIÓN") que lista todo lo que el programa puede imprimir, con una explicación de para qué sirve cada uno y un botón para ver un ejemplo. Al añadir la Hoja CMR (punto 7) se detectó que esa pantalla no se había actualizado a la vez — el modelo nuevo funcionaba, pero no aparecía documentado en el listado, lo que podría hacer pensar que no existe.

**Corrección aplicada en el HTML actual:** se añadió la fila que faltaba (Hoja CMR / Carta de Porte) a la tabla principal de modelos, y su referencia técnica correspondiente en la tabla "para un técnico".

**Requisito para el sistema nuevo:** el sistema nuevo debe tener el equivalente a esta pantalla de catálogo — un listado siempre actualizado de todo lo que se puede imprimir/generar, con qué es cada uno y cuándo aparece. Cada vez que se añada un modelo de impresión nuevo (una hoja, una etiqueta, un formato de transporte, etc.), añadirlo a ese catálogo debe ser un paso obligatorio del mismo cambio — no una tarea aparte que se pueda olvidar, como pasó aquí. Si es posible, mejor que el catálogo se genere automáticamente a partir de una lista central de modelos definidos en el código, en vez de mantenerse a mano en dos sitios distintos (el catálogo y el código real), que es precisamente lo que causó este desajuste.

---

## 9. Nueva funcionalidad: imprimir varios pedidos seleccionados de golpe (Transfrío y albarán sin precios)

**Motivo:** en el día a día, cuando hay que imprimir la Hoja Transfrío de varios pedidos para el mismo camión, había que abrir pedido por pedido y sacarlo uno a uno. Ya existía este mismo problema resuelto para el albarán sin precios (versión conductor), pero no para Transfrío.

**Funcionalidad ya existente en el HTML actual (albarán sin precios):** en Historial, cada fila tiene una casilla de marcar. Se pueden marcar varios pedidos (o ninguno, y entonces se usa el filtro de arriba — agencia/fecha/cliente) y un botón genera **un único PDF con el albarán sin precios de cada uno, uno detrás de otro**, listo para imprimir todo seguido.

**Corrección aplicada en el HTML actual:** se añadió un botón equivalente para la Hoja Transfrío, con el mismo mecanismo de selección (casillas marcadas, o filtro si no se marca ninguna). Genera un PDF con una página por cada pedido seleccionado, cada una pensada para imprimirse **encima de una hoja física ya impresa del transportista** — igual que la versión de un solo pedido, solo que ahora se pueden sacar varias de golpe. Importante: el programa no controla cuántas hojas físicas del transportista hay cargadas en la impresora — es responsabilidad de quien imprime cargar tantas hojas físicas como pedidos se hayan seleccionado, en el mismo orden.

**Requisito para el sistema nuevo:**
- Cualquier documento que se imprima "encima de un papel pre-impreso" (Transfrío, CMR, y cualquier otro que se añada en el futuro) debe poder imprimirse tanto de uno en uno como en lote, seleccionando varios pedidos a la vez, con el mismo mecanismo de selección que el resto de listados (casillas de marcar + filtro como alternativa si no se marca nada).
- Al imprimir en lote, avisar siempre de cuántos documentos se van a generar antes de hacerlo (para poder preparar el papel físico necesario), tal como ya hace el HTML actual con la confirmación "Se van a imprimir X pedido(s)...".
- Esta capacidad de "seleccionar varios e imprimir de golpe" debería ser una funcionalidad transversal de la pantalla de listados/historial, no algo que haya que reconstruir a mano para cada tipo de documento nuevo que se añada.

---

## 10. Corrección importante sobre impresión en lote: copias por cliente y bloqueo de pestañas del navegador

**Motivo 1 — copias seguidas por cliente, no por lote:** el papel de Transfrío se imprime en 4 copias por cliente. Al usar la función del punto 9, si se pedían "4 copias" desde el propio diálogo de impresión del navegador, el resultado era: cliente 1, cliente 2, cliente 3... y LUEGO repetía todo el ciclo 4 veces — en vez de las 4 copias del cliente 1 seguidas, luego las 4 del cliente 2, etc. Esto es un comportamiento normal (y esperable) de cualquier diálogo de impresión al pedirle "copias" de un documento multi-página: repite el documento entero, no cada página por separado.

**Corrección aplicada en el HTML actual:** en vez de usar el ajuste de "copias" del propio navegador, el número de copias por cliente se construye **dentro del PDF generado**, repitiendo cada página tantas veces como se pida, antes de pasar al siguiente cliente. Se pregunta cuántas copias por cliente (por defecto 4) antes de generar el documento.

**Motivo 2 — los navegadores bloquean las pestañas que se abren solas:** al intentar automatizar la impresión de varios clientes seguidos con una pausa entre cada uno (para poder revisar que no se atascó el papel fino de Transfrío antes de seguir), la solución inicial abría cada PDF automáticamente tras una espera (`setTimeout`) — pero **los navegadores bloquean, sin avisar, cualquier ventana/pestaña nueva que se abra fuera de una acción directa del usuario** (como un clic). Solo la primera pestaña se abría bien; las siguientes se bloqueaban en silencio, dando la sensación de que "no pasaba nada".

**Corrección aplicada en el HTML actual:** en vez de abrir las pestañas automáticamente, se muestra un panel en pantalla con el nombre del cliente actual y un botón "Abrir PDF para imprimir" que hay que pulsar cada vez. Como abrir la pestaña ocurre siempre como respuesta directa a ese clic, el navegador nunca lo bloquea. Después de abrir, aparecen los botones "Siguiente cliente" / "Parar aquí", para poder revisar cada impresión antes de continuar.

**Requisito para el sistema nuevo:**
- Cualquier impresión en lote que necesite un número de copias específico por documento (no solo uno) debe construir esas copias dentro del propio archivo generado, nunca depender de la opción "copias" del diálogo de impresión del sistema operativo/navegador — ya que esa opción siempre repite el documento completo, no cada parte por separado.
- Cualquier flujo que abra varias ventanas/pestañas nuevas en secuencia (para imprimir, descargar, o cualquier otra cosa) debe hacerlo **siempre como respuesta directa a un clic del usuario**, nunca de forma automática tras una espera o retraso temporal — los navegadores bloquean las ventanas emergentes que no vienen de una acción directa, y ese bloqueo suele ser silencioso (sin aviso visible), lo que puede parecer un fallo del programa cuando en realidad es una protección del navegador. Diseñar estos flujos como "un paso, un clic, un paso, un clic" en vez de "automático con pausas".

---

## 11. Fallo corregido: el nombre del destinatario de Reparto Super se duplicaba cada vez que se abría o grababa

**Qué pasó:** en Reparto Super, el destinatario se guarda como dos campos separados (nombre y ciudad), pero el desplegable ofrece un solo texto combinado (ej. "ALCAMPO ZARAGOZA", o simplemente "ECOMORA", sin ciudad). La función que separaba ese texto en nombre/ciudad solo sabía tratar bien el caso "ALCAMPO [ciudad]" — para cualquier otro destinatario (Ecomora, Ahorramas, Toriodis León, Marina Fisk Coruña, o cualquier texto libre escrito a mano), copiaba el texto completo en **los dos campos a la vez** en vez de repartirlo correctamente.

**Por qué crecía sin parar:** al volver a abrir ese reparto para modificarlo, el programa reconstruye el texto a mostrar uniendo nombre + " " + ciudad — como los dos campos ya tenían el mismo texto completo duplicado, el resultado salía doblado (ej. "ECOMORA ECOMORA"). Si se grababa así, ese texto doblado se volvía a partir mal de la misma manera, y al abrirlo otra vez se doblaba de nuevo. Cada ciclo de abrir/grabar multiplicaba el texto por dos, sin límite.

**Corrección aplicada en el HTML actual:** cuando el destinatario no encaja en un patrón conocido con ciudad separada (por ahora, solo "ALCAMPO"), se guarda todo el texto en el campo "nombre" y se deja "ciudad" vacía — así nombre + " " + ciudad siempre reconstruye exactamente el texto original, sin duplicar nada, sin importar cuántas veces se abra o grabe.

**Requisito para el sistema nuevo:**
- Si el sistema nuevo separa un dato en varios campos a partir de un texto combinado (como nombre/ciudad aquí), esa separación debe ser **reversible sin pérdida ni duplicación**: reconstruir el texto original a partir de los campos separados debe dar siempre el mismo resultado, se repita la operación las veces que se repita. Cualquier "recorte automático" que no sepa cómo separar un caso concreto debe dejar el resto de campos vacíos, nunca copiar el texto completo en más de un campo a la vez.
- Como norma general, evitar diseños donde abrir y volver a guardar el mismo registro, sin cambiar nada, pueda alterar sus datos — abrir para editar (y cancelar, o grabar sin tocar nada) debe ser siempre una operación segura que deja el dato exactamente igual.

---

## 12. Nueva funcionalidad: imprimir el albarán sin precios y la Hoja Transfrío desde la propia fila del listado

**Motivo:** hasta ahora, para imprimir el albarán sin precios (conductor) o la Hoja Transfrío de UN pedido/traspaso concreto, había que abrirlo primero. Se pidió poder hacerlo directamente desde la fila del listado (Historial de Pedidos e Historial de Traspasos), sin ese paso previo.

**Primer intento (revertido):** se probó a combinar los dos documentos en un único PDF de dos páginas, abierto con un solo botón. Esto **no sirve para el trabajo real**: cada documento se imprime en una impresora física distinta (papel normal para el albarán, papel pre-impreso del transportista para Transfrío), y no da tiempo a cambiar de impresora en mitad de un mismo trabajo de impresión.

**Corrección final aplicada en el HTML actual:** dos botones **separados** en la misma fila del listado — uno imprime solo el albarán sin precios (o el documento del traspaso), el otro imprime solo la Hoja Transfrío. Cada uno con su propio clic y su propia ventana, para poder imprimir cada uno cuando la impresora correspondiente esté lista, sin depender del otro.

**Requisito para el sistema nuevo:**
- Cuando dos documentos de un mismo registro se imprimen habitualmente en impresoras físicas distintas (como aquí: albarán en impresora normal, Transfrío en papel pre-impreso del transportista), deben ofrecerse siempre como **acciones independientes**, nunca combinadas en un único archivo o un único botón — aunque técnicamente sea más sencillo combinarlos, en la práctica del almacén eso obliga a tener las dos impresoras listas a la vez, lo cual no siempre es posible.
- Estas dos acciones (imprimir sin precios, imprimir Transfrío) deben estar disponibles tanto abriendo el registro como directamente desde su fila en el listado, para no obligar a abrir cada pedido/traspaso solo para imprimir.

---

## 13. Nueva funcionalidad: sumar cajas escribiendo "+" en la casilla de peso, como el autosuma de Excel

**Motivo:** al pesar varias cajas de un mismo producto para una línea de pedido, era necesario sumarlas aparte (de cabeza o con una calculadora) antes de escribir el total en la casilla de peso.

**Corrección aplicada en el HTML actual:** en la casilla de peso de cada línea de Pedido, ahora se puede escribir directamente la suma de las cajas separadas por "+" (por ejemplo `12.4+8.1+6.3`) y, al pulsar **Enter** o **Ctrl+=** (igual que el autosuma de Excel), la casilla se queda con el resultado (`26.8`). También admite restas y coma decimal. Si se escribe un número normal, sin "+" ni "-", el campo funciona exactamente igual que antes — esto es un añadido, no cambia el comportamiento existente.

**Requisito para el sistema nuevo:** cualquier campo numérico donde habitualmente se suman varias cantidades a mano antes de escribir el total (peso, kilos, cajas, y cualquier campo similar que se use igual) debería ofrecer esta misma posibilidad — escribir la operación y resolverla en el propio campo, sin necesitar una calculadora aparte ni salir de la pantalla. Por seguridad, esta función solo debe interpretar números, espacios, puntos/comas decimales y los operadores +/- — nunca evaluar la expresión como código genérico.

---

## 14. Nueva funcionalidad: buscador con filtrado en vivo para elegir proveedor/artículo (Panel de Compras, Excel)

**Motivo:** en el Panel de Compras del Excel `GESTION_CORRECTA`, los desplegables para elegir un proveedor o un artículo concreto obligaban a buscar a ojo entre más de 200 nombres. Se pidió poder escribir las primeras letras y que la lista se filtrara sola, en vez de tener que desplazarse por toda la lista.

**Corrección aplicada en el Excel actual:** encima de cada desplegable (proveedor y artículo) hay ahora una casilla de búsqueda. Al escribir unas letras, el desplegable de justo debajo se queda solo con los nombres que coinciden (más la opción "TODOS", siempre disponible). Si se borra la búsqueda, vuelven a aparecer todos. Técnicamente se resolvió con fórmulas de hoja de cálculo (sin macros), así que funciona igual en cualquier ordenador sin necesitar nada especial activado.

**Requisito para el sistema nuevo:** cualquier desplegable/selector con muchas opciones (proveedores, artículos, clientes, y cualquier lista larga similar) debe llevar un buscador con filtrado en vivo por defecto, no como añadido opcional — con listas de 150-230 elementos como las de Marinafisk, buscar a ojo en una lista sin filtro es lento y propenso a error. Esto es mucho más sencillo de construir en una aplicación real con base de datos (un simple filtro de texto sobre la consulta) que en Excel con fórmulas, donde tuvo que resolverse con una fórmula matricial bastante compleja — en el sistema nuevo no hay excusa para no tenerlo en todos los selectores de este tipo.

---

## 15. Nueva funcionalidad: elegir proveedor/producto por nombre en COMPRAS y que el código se rellene solo

**Motivo:** al grabar una compra nueva, había que saber de memoria (o ir a mirar) el código del proveedor y del producto para escribirlo en las columnas COD PROV / COD PROD. Se pidió poder buscar por nombre y que el código se rellenara solo.

**Corrección aplicada en el Excel actual:** en la hoja COMPRAS, dos columnas de búsqueda (con desplegable filtrable, formato "NOMBRE | código") permiten elegir un proveedor o producto por su nombre; al elegir, las columnas reales COD PROV y COD PROD se rellenan solas mediante fórmula, sin tocar ni una sola fila de las compras ya grabadas (se aplica solo a partir de la primera fila libre en adelante).

**Lección importante de tipos de dato:** el código de proveedor está guardado como **número** en su ficha, pero el texto extraído de una lista combinada ("nombre | código") es siempre **texto** — aunque a la vista "50232" y 50232 parezcan lo mismo, para una búsqueda exacta (VLOOKUP y equivalentes) son cosas distintas y la búsqueda falla en silencio o da "no encontrado". El código de producto, en cambio, es alfanumérico (ej. "C387") y sí es texto de forma nativa. **Requisito para el sistema nuevo:** cualquier extracción de un identificador desde un texto combinado debe convertirse explícitamente al mismo tipo de dato (número o texto) que tiene ese identificador en su tabla de origen, columna por columna — no asumir que todos los códigos son del mismo tipo.

---

## 16. Fallo grave: fórmulas de compras ya grabadas aparecieron convertidas en valores fijos

**Qué pasó:** en algún momento, 51 filas de compras ya grabadas (de casi 2.500) tenían sus fórmulas de proveedor/producto/importes convertidas en texto o número fijo, en vez de la fórmula viva. No se detectó cómo ni cuándo ocurrió exactamente.

**Cómo se diagnosticó y corrigió:** antes de tocar nada, se comprobó cada valor fijo contra el catálogo real (Proveedores/Productos) y contra el cálculo esperado (kilos × precio, etc.) — 49 de las 51 filas ya tenían el valor correcto (solo faltaba la fórmula), y 2 tenían un valor desactualizado (un nombre de producto viejo, un importe que no cuadraba con los kilos/precio actuales). Se restauró la fórmula estándar en las 51 filas, lo que corrigió automáticamente esas 2 discrepancias. Se verificó, fila por fila, que ninguna de las ~2.400 filas restantes cambió ni un solo carácter.

**Requisito para el sistema nuevo:** esto es exactamente el tipo de fallo que una base de datos real con columnas calculadas (en vez de fórmulas de hoja de cálculo copiables/machacables) evita por diseño — un valor calculado (nombre de proveedor a partir de su código, importe a partir de kilos y precio) nunca debería poder "congelarse" ni desincronizarse de su origen. Además, cualquier proceso de importación/migración de datos debe incluir una comprobación de coherencia como la descrita aquí (contrastar cada valor calculado contra su fuente y su fórmula esperada) antes de dar por buena una carga de datos histórica.

---

## 17. Protección de celdas con fórmula, y formato de fecha europeo

**Motivo (relacionado con el punto 16):** para que no se pueda repetir el fallo de fórmulas congeladas por accidente, se pidió bloquear las celdas calculadas. De paso, se detectó que la columna de fecha de COMPRAS estaba en formato americano (mes/día/año) en vez de europeo.

**Corrección aplicada en el Excel actual:**
- Todas las celdas con fórmula (proveedor, OP 2%, descripción, y los importes: base, IVA, total) quedaron **bloqueadas** con protección de hoja (sin contraseña — es para evitar despistes, no para restringir al equipo). El resto de columnas (fecha, códigos, cajas, kilos, precio, los buscadores) siguen totalmente editables.
- La columna de fecha se cambió a formato `DD/MM/YYYY` en las casi 5.000 filas de la hoja.

**Requisito para el sistema nuevo:**
- Cualquier campo que se calcule a partir de otros (nombre desde código, importes desde cantidad y precio) debe ser **no editable directamente** por el usuario en la interfaz — se edita el origen (kilos, precio, código) y el calculado se actualiza solo, sin posibilidad de que alguien escriba encima y lo desincronice. Esto no es opcional: es precisamente el fallo del punto 16, y una base de datos con columnas calculadas lo evita de raíz.
- Todas las fechas deben mostrarse siempre en formato español/europeo (día/mes/año), en toda la aplicación, sin excepción — nunca en formato americano.

---

## 18. Marcha atrás en dos diseños del Excel actual — lecciones para no repetir en el sistema nuevo

**18a. La protección de hoja de Excel bloqueaba trabajo normal (ordenar, filtrar, insertar filas) por defecto.** Se probó a proteger la hoja COMPRAS (bloqueando solo las celdas con fórmula) para evitar el fallo del punto 16. Pero Excel bloquea **ordenar filas enteras** en cuanto el rango incluye una sola celda bloqueada, aunque el permiso "ordenar" esté activado — una limitación de Excel, no algo evitable manteniendo el bloqueo. Como ordenar es imprescindible para el trabajo diario, se revirtió: **la hoja ya no está protegida**, y en su lugar se añadió un **aviso visual automático** (formato condicional: la celda se pone roja si debería tener fórmula y no la tiene) para detectar el fallo del punto 16 al instante si se repite, en vez de impedirlo. **Requisito para el sistema nuevo:** no depender de "bloquear campos calculados" como mecanismo único de protección si eso puede chocar con operaciones básicas como ordenar — mejor una combinación de: (a) los campos calculados nunca son editables porque la interfaz no lo permite (no por un bloqueo de hoja de cálculo que tiene efectos secundarios), y (b) una validación/aviso que detecte y señale cualquier inconsistencia de datos.

**18b. El autorrelleno de código al elegir por nombre (puntos 14-15) chocaba con escribir el código a mano.** Se había diseñado que las columnas COD PROV / COD PROD llevaran una fórmula ligada a un buscador (elegías el nombre, el código aparecía solo). Pero al mezclarlo con la costumbre de escribir el código directamente a mano (que Víctor necesita poder hacer siempre, indistintamente), el enlace por fórmula era frágil y podía romperse. **Solución final aplicada:** el buscador por nombre **ya no escribe nada automáticamente** — es un buscador fijo y independiente que solo **muestra el código en pantalla** para copiarlo a mano; las columnas COD PROV / COD PROD vuelven a ser siempre campos de escritura libre, sin fórmula ni enlace de ningún tipo. **Requisito para el sistema nuevo:** si se ofrece "elegir por nombre" como ayuda para rellenar un código, y el mismo campo también se puede escribir a mano libremente, **las dos formas no deben depender la una de la otra** — el buscador debe limitarse a mostrar/sugerir el valor para que el usuario lo confirme o lo copie, nunca escribirlo él solo de forma automática en el campo real, precisamente para que ambas formas de trabajar (buscando o a mano) sean independientes y no puedan interferir entre sí.

---

## 19. Nueva funcionalidad obligatoria: número de palets (documento electrónico de control, desde el 5/10/2026)

**Motivo:** a partir del 5 de octubre de 2026 es obligatorio que la hoja de pedido sin precios para el conductor incluya cajas, kilos, productos y **número de palets** — de esto, solo faltaba el número de palets. Por definición es siempre 0; si el pedido lleva palets, se indica el número.

**Corrección aplicada en el HTML actual:**
- Nuevo campo **PALETS** en el formulario de pedido (junto a Fecha/Forma de pago/Agencia), con 0 por defecto.
- Al pulsar **GRABAR**, el programa **siempre pregunta primero** cuántos palets lleva el pedido (aviso grande, con el cliente y los bultos/kg de contexto, 0 por defecto, Enter para confirmar) — así ningún pedido se graba sin haber confirmado el dato a conciencia. Un segundo clic en GRABAR mientras el aviso está abierto no abre otro ni graba dos veces; Esc/Volver cancela sin grabar; un valor negativo o decimal se rechaza.
- El número de palets se imprime en el albarán (con y sin precios), en la misma línea que "Total bultos" y "Total kg", y en la Hoja Transfrío, **subrayado**, junto al destino — en todos los caminos de impresión (individual, listado de seleccionados, botón de fila).
- Los pedidos antiguos que no tenían este campo salen con **0**, nunca en blanco.

**Requisito para el sistema nuevo:** cualquier dato que pase a ser obligatorio por una norma externa (como este documento de control) debe: (a) tener un valor por defecto sensato para no romper los registros antiguos, (b) pedirse expresamente en el momento de confirmar/guardar cuando conviene que quede confirmado a conciencia (no solo como un campo más del formulario, fácil de pasar por alto), y (c) propagarse automáticamente a **todos** los documentos y caminos de impresión relacionados, no solo al principal — aquí hubo que revisar por separado el albarán con precios, el sin precios, la Hoja Transfrío, el listado de varios seleccionados y el botón de imprimir por fila.

---

## 20. Corrección: los iconos de acción de una fila dejaron de caber en pantalla al añadir más

**Qué pasó:** cada fila de Historial de Pedidos tiene botones de acción (ver, editar, anular, etiquetas, imprimir, enviar...). Al añadir dos botones nuevos (imprimir sin precios e imprimir Transfrío directamente desde la fila, ver punto 12) la fila pasó de 6 a 8 botones y dejó de caber entera en pantallas normales — el último botón (enviar por email) quedaba fuera de la vista, y para verlo desplazándose hacia la derecha se perdía de vista la casilla de selección de la izquierda.

**Corrección aplicada:** la columna de la casilla de selección se queda **fija** (no se mueve) al desplazarse horizontalmente por la fila, y los botones se hicieron un poco más compactos.

**Requisito para el sistema nuevo:** cualquier fila de una tabla con varias acciones por elemento debe pensarse para que **crecer en número de acciones no rompa la usabilidad** — con una interfaz real (no una tabla HTML simple) esto se resuelve mejor con un menú desplegable de "más acciones" en vez de ir añadiendo iconos en horizontal sin límite, pero si se usan iconos en fila, cualquier columna de selección/checkbox debe quedar siempre fija con independencia de cuántas acciones haya.

---

## 21. Lecciones adicionales del buscador de proveedor/producto en Excel (continuación del punto 18b)

Al revisar a fondo el buscador de la hoja COMPRAS, salieron dos problemas más, con su lección para el sistema nuevo:

**21a. Ordenar rompía datos porque el filtro/rango no cubría todas las columnas con datos por fila.** La tabla tenía columnas con datos reales (miles de filas en la columna CONTROL) que quedaban **fuera** del rango que Excel usa al ordenar con la flechita del filtro — al ordenar, esas columnas no se movían junto con el resto de su fila y quedaban descuadradas respecto al resto de datos de esa fila. **Requisito para el sistema nuevo:** no aplica igual (una base de datos no tiene este problema, cada fila es una unidad atómica), pero es un recordatorio de que cualquier operación de reordenación debe mover **la fila completa**, campo por campo, sin dejar nada atrás por estar en una columna "no contemplada".

**21b. Las listas de apoyo de un buscador deben vivir separadas de la zona de trabajo, no intercaladas en ella.** La primera versión guardaba las listas del buscador en columnas ocultas de la propia hoja de trabajo (COMPRAS) — al limpiar/rehacer esa zona para otro ajuste, se acabaron borrando por error las primeras filas de esas listas. Se solucionó moviéndolas a una **hoja aparte, completamente oculta**, dedicada solo a eso. **Requisito para el sistema nuevo:** los datos de apoyo de un buscador o selector (listas, índices, cachés) deben vivir en su propio espacio, claramente separado de los datos que el usuario edita o reorganiza — nunca intercalados en la misma tabla de trabajo, para que una operación sobre esa tabla (ordenar, limpiar, insertar) no pueda tocarlos por accidente.

---

## 22. Número de partida automático por proveedor+fecha, y dos referencias circulares encontradas por el camino

**Regla de negocio:** el número de partida es siempre el mismo para un proveedor en un mismo día; si es otro día (aunque sea el mismo proveedor), es un número distinto; los números son siempre correlativos. Excepción real descubierta después: un mismo proveedor puede traer mercancía de **dos puertos distintos el mismo día**, y eso debe contar como dos partidas distintas, no una.

**Diseño final (Excel):**
- Cada fila de carga tiene su propia zona de ayuda a la derecha (columnas S-X de esa misma fila): buscador de proveedor → código automático; buscador de producto → código automático; número de partida sugerido (reutiliza el existente si coincide proveedor+fecha, o da el siguiente correlativo si no); y una casilla "¿Partida NUEVA?" para marcar el caso del puerto distinto, que fuerza un número nuevo aunque coincida proveedor+fecha.
- Código de proveedor y de producto se rellenan **automáticamente** en la fila (son fórmulas que solo dependen de su propia fila — nunca de otras filas).
- El número de partida, en cambio, **no se rellena solo**: se copia a mano desde la celda de "sugerida". Motivo: ver el fallo 22b.

**22a. Referencia circular al encadenar la sugerencia con el relleno automático.** Al hacer que la celda de partida se rellenara sola a partir de la celda "sugerida" (que necesita mirar toda la columna de partidas para saber el máximo y si ya existe), la propia celda de partida pasó a formar parte del rango que la fórmula necesitaba mirar para calcularse a sí misma — bucle. Con un proveedor+fecha que ya existía antes en la tabla no se notaba (encontraba antes esa otra coincidencia), pero con una combinación totalmente nueva, sí daba error. **Requisito para el sistema nuevo:** cuidado con cualquier campo "autocalculado" cuyo cálculo necesite mirar una colección que incluye al propio registro que se está creando — en una base de datos esto se evita calculando el siguiente correlativo en el momento de insertar (consulta al motor, no una fórmula que se mira a sí misma), pero es un patrón a vigilar si se replica una lógica parecida.

**22b. Referencia circular distinta, esta vez al ordenar.** Aun arreglado el punto anterior, **ordenar la tabla por partida de mayor a menor volvía a romperlo**: la fórmula de "sugerida" miraba solo "las filas de arriba mía" (para no repetir el bucle del punto 22a), pero al ordenar, las filas cambian de posición y "las de arriba" ya no son las mismas — daba números incorrectos o error. Se solucionó separando los dos problemas: el campo de partida real deja de estar enlazado por fórmula a la sugerencia (se copia a mano, rompiendo el bucle del 22a de raíz), y con eso la sugerencia ya puede mirar la tabla entera sin orden ninguno (MAX/CONTAR.SI.CONJUNTO sobre todo el rango, sin importar el orden de las filas). **Requisito para el sistema nuevo:** un correlativo o "siguiente número libre" debe calcularse siempre sobre el **conjunto completo de datos ya guardados**, nunca sobre "una posición relativa dentro de una lista que el usuario puede reordenar" — y si un campo autocalculado puede chocar con el campo que depende de él (como pasó aquí), es más seguro que el usuario confirme el valor antes de que quede grabado, en vez de encadenar los dos automáticamente.

---

## RESUMEN RÁPIDO DE PENDIENTES (para no releer todo el documento)

- **Nada roto activo ahora mismo** en el HTML ni en el Excel — todo lo de los puntos 1 a 22 está ya corregido y en uso.
- **Pendiente de decidir por Víctor** (no requiere acción de Code): si el backup con "Cerrar sesión" (que actualiza todo desde la carpeta compartida antes de guardar) debe hacerse más rápido a costa de poder quedarse sin la última actualización del otro puesto, o seguir tardando pero siempre 100% completo. Aún sin respuesta.
- **Pendiente de calibrar con papel real** (no es un fallo de código, es un ajuste físico): las posiciones de la Hoja Transfrío y del CMR/Carta de Porte de Mouzo deben comprobarse imprimiendo sobre el papel de verdad, desde el editor de MODELOS DE IMPRESIÓN.
- **Pendiente de revisar**: si la región de Windows está puesta en España en los dos ordenadores (para que las fechas salgan siempre en formato europeo sin ajustes manuales).
- El resto de puntos del documento (1-22) son **lecciones ya aplicadas y cerradas**, documentadas para que el sistema nuevo no repita los mismos fallos — no son tareas pendientes de Víctor, son requisitos de diseño para Code.

---

*Estas correcciones ya están en producción en el HTML actual (versión `CARGA_DE_ALBARANES_MARINAFISK_2026-09-02-CORREGIDO.html`) y en el Excel `GESTION_CORRECTA` (Panel de Compras y hoja COMPRAS), y sirven de referencia de comportamiento esperado para el sistema nuevo — no como código a copiar literalmente, sino como especificación de qué debe hacer bien el sistema nuevo en estos puntos.*
