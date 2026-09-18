# Verificación de usabilidad integral (18/09/2026)

Fecha: 2026-09-18

Hasta ahora cada fase se había probado por separado (Fase 3: sincronización entre puestos; Fase 4 Nivel 1: pantallas básicas; Fase 4 Nivel 2: repartos/traspasos/impresión). Víctor pidió expresamente comprobar que **el programa entero es utilizable** — es decir, recorrerlo como un día real de trabajo, con pantallas y flujos que hasta ahora no se habían probado juntos en una sola sesión: editar catálogos, Repartos, Traspasos, Historial con impresión en lote, Listas de precio en los dos modos, cerrar/reabrir Partidas, la integración completa compra→partida→pedido, y el aspecto en móvil.

Se ha hecho con Chromium real (Playwright) contra el backend y la base de datos reales, usando datos reales de la migración (163 clientes, 154 artículos, 51 proveedores, etc.), no datos inventados ni mocks. El guion completo de la prueba queda documentado en este informe; no se ha commiteado como script porque es un recorrido puntual, no una comprobación que deba repetirse en cada cambio (a diferencia de `verificar_migracion.js` / `verificar_fase2.js`, que sí forman parte del repositorio).

## Nota sobre el documento de correcciones recibido hoy

Junto con la petición de esta prueba llegó un documento `CORRECCIONES_02-09-2026_para_Code_5.md`. Su contenido es **idéntico**, punto por punto, al `CORRECCIONES_02-09-2026_para_Code-1.md` recibido antes — incluido el punto 10, que ya se corrigió y se probó con navegador real el 15/09/2026 (ver `VERIFICACION_FASE4_CORRECCION10_2026-09-15.md`). Es decir: no aportaba nada nuevo que abordar, así que no se ha tratado como una petición de trabajo distinta.

## Qué se ha recorrido (26 comprobaciones automáticas + inspección manual de dos hallazgos)

1. **Catálogo — editar un cliente real.** Se editó el teléfono de un cliente ya existente (PESCADOS VALDIZARBE), se comprobó que el cambio se ve en la tabla nada más guardar, y se revirtió al valor original para no dejar el catálogo alterado. *(Nota: ni el HTML actual ni el sistema nuevo tienen función de "borrar" cliente/artículo/proveedor — se comprobó en el código fuente del HTML actual que tampoco existe allí, así que no es una carencia del sistema nuevo, es un comportamiento que se mantiene igual a propósito.)*
2. **Compra → Partida → Pedido, de principio a fin (la integración entre pantallas que nunca se había probado junta).** Se dio de alta una compra real de un artículo con familia ya existente en el catálogo (LIRIO/BACALADILLA/PERLA), comprobando el cálculo en vivo del 2% de OP y el IVA. Se verificó que la partida nueva aparece inmediatamente en la pantalla de Partidas con los kilos disponibles correctos. Después, en Pedidos, se comprobó que:
   - la asignación de partida ocurre en vivo mientras se teclea, sin recargar la pantalla;
   - con un precio de venta bajo (margen insuficiente), aparece el aviso "⚠️ sin margen suficiente" **y** el desplegable para elegir partida candidata a mano — con las ~90 partidas candidatas de esa familia de artículo, cada una con su coste y margen reales;
   - la vista previa de IVA se recalcula según el tipo fiscal real del cliente elegido.
   El pedido se grabó con normalidad (nº 13941).
3. **Repartos.** Alta de un reparto con una línea, comprobando que aparece en "recientes" nada más grabar.
4. **Traspasos + impresión Transfrío.** Alta de un traspaso, e impresión de la Hoja Transfrío con 2 copias pedidas por `prompt()` — se abrió la ventana y generó exactamente 2 hojas, confirmando que la corrección del 15/09 (ventana síncrona + copias agrupadas) sigue funcionando en este flujo también.
5. **Historial — impresión en lote, incluyendo el caso mixto MOZO / no-MOZO.** Aquí ha aparecido el hallazgo real de hoy (ver más abajo): se marcaron 8 pedidos de Historial (mezcla real de agencias) y se pidió "Imprimir Hoja CMR" — la Hoja CMR solo aplica a clientes con agencia MOZO. Después de corregir el fallo, se comprobó que la impresión ya no bloquea el lote entero y avisa correctamente de cuántos pedidos se han omitido y por qué. También se probó el caso normal — albarán sin precios en lote de los mismos 8 pedidos — comprobando que genera 8 hojas, una por pedido, y que efectivamente no muestra ningún importe.
6. **Listas de precio, los dos modos.** AUTO: se calculó la vista previa del día de hoy (que incluye la compra recién dada de alta) y se guardó. MANUAL: se comprobó el aviso en vivo "⚠️ ¡PÉRDIDA!" al teclear un precio por debajo del coste real de partida, y se guardó una lista limpia (sin pérdida) para no dejar un caso de pérdida grabado como si fuera real.
7. **Partidas — cerrar y reabrir.** Sobre la partida de prueba creada en el paso 2 (para no tocar ninguna partida real del negocio): "Cerrar" la marca como cerrada, "Reabrir" lo revierte.
8. **Vista móvil (375px, ancho de iPhone).** Se comprobaron las 12 pantallas del menú sin scroll horizontal. Aquí ha aparecido el segundo hallazgo real de hoy (ver más abajo).

## Hallazgo 1 (real, corregido): imprimir Hoja CMR en lote desde Historial bloqueaba todo el lote si había un solo pedido sin agencia MOZO

**Cómo se encontró:** en Historial, el botón "Imprimir Hoja CMR" está siempre visible (a diferencia de Pedidos, donde el botón CMR de cada fila solo aparece si esa fila es de agencia MOZO — corrección 02/09/2026 punto 7). Al marcar una selección real de Historial (que normalmente mezcla clientes con y sin agencia MOZO) y pedir la Hoja CMR, la ruta del servidor (`GET /api/pedidos/imprimir`) recorría los pedidos uno a uno y, en cuanto encontraba el primero que no era MOZO, **abortaba toda la petición** con un solo mensaje de error, en vez de imprimir los que sí correspondían. La ventana de impresión, ya abierta (correctamente, de forma síncrona), se quedaba con un único mensaje de error y ningún documento — sin más contexto, parecía que la función entera estaba rota, cuando en realidad casi siempre habría al menos un pedido válido en la mezcla.

**Corrección aplicada:**
- `backend/src/routes/pedidos.js`, ruta `GET /imprimir`: ahora, cuando un pedido no cumple la condición del modelo (p.ej. CMR y agencia distinta de MOZO), se omite ese pedido del lote con `continue` y se sigue con el resto — nunca se aborta la petición entera. La forma de la respuesta (array de `{pedido, lineas, valores}`) no cambia, así que no afecta a ningún otro sitio que llame a esta misma ruta (Traspasos y Pedidos, que solo la usan para Transfrío o para un único pedido MOZO ya filtrado).
- `backend/public/js/pantallas/historial.js`, `cargarYRellenar`: compara cuántos pedidos se pidieron contra cuántos ha devuelto el servidor. Si faltan, avisa en la pantalla principal cuántos se han omitido y por qué (usando la propia descripción del modelo, sin repetirla a mano). Si no queda ninguno válido, la ventana de impresión (ya abierta) muestra un mensaje claro en vez de quedarse vacía o con un error genérico.

**Prueba real tras la corrección:** con la misma selección mixta de 8 pedidos, "Imprimir Hoja CMR" ya no bloquea nada — la pantalla principal avisa "8 de 8 pedido(s) no llevan 'Hoja CMR / Carta de Porte' y se han omitido del lote..." (en este caso concreto, ninguno de los 8 primeros del listado era de agencia MOZO; con una selección que sí incluyera algún MOZO, esos se habrían impreso con normalidad y solo se habría avisado de los demás). El caso normal — albarán sin precios en el mismo lote de 8 — generó las 8 hojas correctamente, confirmando que la corrección no ha afectado a los demás modelos de impresión.

## Hallazgo 2 (real, corregido): desbordamiento horizontal en móvil en las pantallas con formulario (Compras, y potencialmente cualquier pantalla con un `<select>` de opciones largas)

**Cómo se encontró:** al comprobar las 12 pantallas a 375px de ancho (iPhone), la pantalla de Compras desbordaba 21px por la derecha (contenido de 396px en una pantalla de 375px) — las demás estaban bien. Se localizó el elemento exacto con un guion de depuración que mide qué elemento sobresale del viewport: era el desplegable de Proveedor. La causa es un problema clásico de flexbox: `.fila { flex-direction: column }` (la regla que apila los campos verticalmente en móvil) no reduce por sí sola el ancho de un `<select>` cuyo contenido (el nombre de proveedor más largo del catálogo real, "PESCADO Y MARISCOS ADELAIDA S.L.", 40 caracteres) es más ancho que la pantalla — un elemento flex, por defecto, nunca se encoge por debajo de su contenido mínimo salvo que se le indique explícitamente. Con datos de prueba cortos esto no se nota; con los nombres reales de proveedores, sí.

**Corrección aplicada** (`backend/public/css/estilo.css`, dentro de `@media (max-width: 640px)`): se añadió `min-width: 0` a `.fila` y `.campo` (para que puedan encogerse por debajo del contenido de sus hijos) y `width: 100%; max-width: 100%` a `input, select, textarea` (para que ocupen el ancho disponible real en vez del ancho de su contenido). Esto no afecta al escritorio (la regla vive dentro del `@media` de móvil) ni a las tablas (que ya se apilaban aparte).

**Prueba real tras la corrección:** las 12 pantallas del menú, a 375px, sin ningún desbordamiento horizontal (comprobado con el mismo guion de medición, no solo visualmente).

## Regresión

Tras encontrar el segundo hallazgo se reconstruyó la base de datos desde cero a partir del backup real (`DROP`/`CREATE DATABASE`, `schema.sql`, `migrar_backup.js`) para dejarla limpia de los datos de prueba de este recorrido — las compras, al ser un dato inmutable por diseño (igual que en producción), no se pueden borrar una vez grabadas, así que reconstruir desde el backup es la única forma limpia de deshacer la compra/pedido/reparto/traspaso/partida/lista de precio de prueba sin tocar la regla de negocio. Se volvieron a ejecutar las comprobaciones de:

- `verificar_migracion.js` contra el backup real: 71.018 comprobaciones de campo, 0 diferencias.
- `verificar_fase2.js`: todas las comprobaciones de OP2/IVA/Recargo/asignación de partida siguen correctas.

Ambas idénticas a las de la primera verificación (14/09/2026), solo cambia la fecha de ejecución — no se han guardado como informes nuevos porque no aportan información distinta a los ya existentes.

## Conclusión

**26 de 26 comprobaciones automáticas correctas** tras las dos correcciones anteriores (antes de corregirlas, 2 habían fallado — ambas relacionadas con hallazgos reales, no con fallos de la prueba). El programa es utilizable de principio a fin para un día real de trabajo: catálogos, compras, pedidos con asignación de partida y margen en vivo, repartos, traspasos, impresión en lote (con el caso mixto MOZO/no-MOZO ya corregido), listas de precio en los dos modos, y cierre/reapertura de partidas — todo probado con datos y navegador reales, no solo revisado en el código. La vista móvil funciona en las 12 pantallas del menú tras la corrección del desbordamiento en formularios con desplegables largos.

Sigue pendiente, como ya estaba documentado en `FASE_4_interfaz_MARINAFISK.md`: Etiquetas (sin especificación de formato de Víctor), listados de gestión con separación ventas/traspasos, cualquier sistema de login, la función de "asignar partidas del día" en bloque, y la calibración en milímetros de Transfrío/CMR contra el papel físico real (la herramienta está hecha y probada; la calibración de verdad la tiene que hacer Víctor con una impresora y el papel real delante).
