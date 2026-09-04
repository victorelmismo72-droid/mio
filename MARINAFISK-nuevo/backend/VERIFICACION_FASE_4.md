# MARINAFISK — Fase 4: interfaz y gestor virtual (estado y verificación)

Construido sobre las Fases 1-3 ya verificadas. Pantallas nuevas en `public/` (HTML + JS normal, sin frameworks ni paso de compilación, coherente con `fiscal.html` de la Fase 3), servidas por el mismo backend Express — no hace falta nada nuevo que instalar.

## 1. Pantallas construidas en esta pasada

| Pantalla | Qué hace |
|---|---|
| `login.html` | Entrada única del sistema. |
| `index.html` | Inicio — panel "Clientes a Contactar Hoy" (ver punto 3). |
| `compras.html` | Registrar compra: el 2% de OP y el IVA se ven en vivo según el proveedor elegido, antes incluso de guardar. |
| `pedidos.html` | Crear albarán: asignación de partida en línea (✅ automática si llega al margen, ⚠️ para elegir a mano si no), y una vista previa que alterna entre "interna" (con precio y partida) y "cliente" (sin ninguno de los dos, como pide la Fase 0 punto 3). |
| `partidas.html` | Asignar partidas de un día entero (con pantalla de excepciones), cerrar/reabrir partidas (una a una o por fecha), consultar rentabilidad de una partida. |
| `listados.html` | Los 7 listados de la Fase 2 (punto 5bis), con filtro de fecha y exportación a CSV real (descarga el archivo, no solo lo enseña). |
| `usuarios.html` | Solo Administrador: alta de usuarios, activar/desactivar, y el cierre de año (vista previa + confirmación). |
| `catalogos.html` | Alta y edición de clientes, proveedores y artículos (tres pestañas). Añadida a raíz de que Víctor detectó que no existía ninguna forma de dar de alta un cliente/proveedor/artículo nuevo — sin esto no se podía ni facturar a un cliente nuevo ni comprar a un proveedor nuevo. |
| `traspasos.html` (29/08/2026) | Traspaso interno Coruña → Zaragoza: fecha, líneas (producto/cajas/peso/precio/**nº de partida a mano** — a diferencia de Pedidos, aquí la partida NO se asigna automáticamente, igual que en el HTML actual), total = peso×precio sin IVA (no es una venta). Crear, editar, anular y buscar en todo el historial (mismo patrón que Pedidos). |
| `repartos.html` (29/08/2026) | Registrar Reparto Super: fecha, destinatario (lista de supermercados + "OTRO" con texto libre, partido en nombre de cadena + ciudad igual que `dividirDestinatario()` del HTML actual), conductor, líneas (artículo/lote/barco/subzona/arte de pesca/cajas/kg aprox./peso de etiqueta). Al elegir un artículo se autorrellenan barco/subzona/arte de pesca desde el catálogo si la línea los tenía vacíos — y **estos datos ya estaban en la base real, migrados en la Fase 1** (153-154 de 154 artículos los tienen). Crear, editar, anular, buscar en todo el historial, imprimir etiquetas/ficha de envío/hoja de ruta. |
| `listasprecio.html` (30/08/2026) | Lista de precios (imagen para WhatsApp): modo automático (coste medio de las compras de hoy + margen) o manual (texto libre), Mayoristas/Pescaderías, borrador compartido entre usuarios. |

**Etiquetas Scanfisk (Reparto Super)** (29/08/2026): construido `src/negocio/etiquetas.js`, reproducción fiel del motor `MarinaFiskEtiquetas` del HTML actual — mismo CSS de etiqueta térmica 50×145mm (contenido rotado 90°, tamaño de página a medida), misma rejilla de datos (zona/subzona, categoría/calibre, fecha/lote/caducidad, producto+científico, arte de pesca, QR de trazabilidad, expedidor+RSI, destinatario/dirección/provincia), mismo sello sanitario (imagen real extraída tal cual del HTML actual, con el número de registro `12.01671/C` correcto — no el error tipográfico histórico), mismo RSI del expedidor (`Nº R.S.I.: 12.08586/C`, un número **distinto** al del sello, ambos correctos en su contexto), una etiqueta por caja. Caducidad = fecha del reparto + 7 días (regla configurable en el código, +12 días para el formato francés/Pomona, calculado siempre en el servidor). El QR se genera server-side (paquete `qrcode`), no en el navegador. Botón "🏷️ Etiquetas" en `repartos.html` que pide la página ya autenticada (nunca con el token en la URL) y la abre lista para imprimir con Ctrl+P.

Probado contra un reparto real de prueba (3 cajas → 3 etiquetas), verificado el HTML generado campo a campo (lote `290826`, caducidad `05/09/26` = 29/08 + 7 días, RSI y sello correctos) y visualmente con una captura de pantalla del resultado. Limpiado el dato de prueba y verificado `npm run verify`: 0 discrepancias.

**Etiquetas de Pedidos — los 6 formatos por cliente** (29/08/2026): extendido `src/negocio/etiquetas.js` con los 4 formatos restantes (Francés/Pomona, Italiano, Más y Más, David Sala) y un registro `FORMATOS`/`obtenerFormatoParaCliente(cliente)` que elige el formato según `clientes.formato_etiqueta`, igual que el HTML actual. Botón "🏷️ Etiquetas" en `pedidos.html`.

Probado contra pedidos **reales** de los 4 clientes que de verdad tienen cada formato especial migrado (POMONA francés, Más y Más, David Sala, Altida italiano):
- Traducciones exactas (ZONE/SOUS-ZONE, DESTINATAIRE, RÉFRIGÉRÉ, PLUSIEURS BATEAUX, VOIR CAISSE en francés; SOTTOZONA/DESTINATARIO/LOTTO en italiano) y nombre de producto en el idioma del artículo (`nombre_frances`/`nombre_italiano`, ya migrados).
- **Caducidad de Pomona confirmada a 12 días** (no 7): pedido del 02/06 → caduca 14/06, exactamente +12 días — la única regla de negocio "rara" de todo el bloque, y la más fácil de teclear mal, sale correcta contra un cliente real.
- David Sala con su propio expedidor/RSI (no el de la lonja de Coruña) y su propio sello de texto.
- Más y Más con el sello de texto propio (12.3894/Z) sobre el resto de la plantilla Marina Fisk estándar.

Ver `VERIFICACION_TRANSVERSAL.md` para el detalle punto por punto frente al documento de auditoría de Víctor.

**Ficha de envío y hoja de ruta de Reparto Super** (29/08/2026): nuevo `src/negocio/documentosImpresion.js` — mismo contenido que `dibujarFichaEnvioEnPdf()` del HTML actual (cabecera SCANFISK SEAFOOD SL con su Reg. San. 12.01671/C, destinatario/fecha/conductor, tabla lote/producto/barco/subzona/cajas/kg, totales), pero como página HTML lista para Ctrl+P en vez de PDF con jsPDF — mismo contenido y orden de datos, solo cambia el mecanismo (evita depender de una librería de PDF en el servidor). La hoja de ruta es la misma ficha impresa dos veces en la misma A4 (para cortar y quedarse una copia), igual que `generarPdfHojaDeRutaReparto()`. Botones "📄 Ficha envío" y "🚚 Hoja de ruta" en `repartos.html`.

Probado contra un reparto real (nº 80, ECOMORA): contenido y totales correctos, verificado visualmente con captura de pantalla.

**Hoja Transfrío** (29/08/2026): botón "🚚 Hoja Transfrío" en `pedidos.html`, para imprimir ENCIMA del papel ya impreso del transportista Transfrío. A diferencia de las etiquetas/fichas (HTML+CSS), aquí se reproduce el mecanismo exacto del HTML actual: `jsPDF` en el navegador con posiciones en milímetros (mismas coordenadas por defecto — `TRANSFRIO_COORDS_DEFECTO` —, con un modo "regla de calibración" para cuando Víctor pueda ajustarlas contra el papel físico). jsPDF se sirve desde `public/vendor/` (paquete npm, copiado localmente — no depende de un CDN externo para algo que se usa a diario). Funciona sin necesidad de guardar el pedido primero (usa los datos ya escritos en el formulario, igual que `construirPedidoTmpDesdeFormulario()`).

Probado generando un PDF real a partir de un pedido de prueba en el formulario: extraído el texto del PDF resultante y confirmado carácter a carácter — "CORUÑA 29 agosto 2026" (lugar, día, mes en español, año), nombre del cliente, bultos y kg, todo en su sitio. La posición exacta sobre el papel físico real solo la puede confirmar Víctor cuando tenga impresora a mano (ver `VERIFICACION_TRANSVERSAL.md`).

**Imprimir albarán (con/sin precios) y envío por WhatsApp/Email** (29/08/2026): completa el bloque de impresión. Reproduce `dibujarAlbaranEnPdf()`/`generarPdfAlbaranCompleto()` del HTML actual — cabecera de la empresa, datos del cliente, tabla de líneas con o sin precios, traza por línea (científico/zona/lote/arte de pesca/barco), **la versión sin precios nunca incluye el número de partida** (Fase 0 punto 3, comprobado explícitamente). "Con precios" es una sola copia; "sin precios" intenta encajar dos copias dobladas en la misma A4 (para cortar y quedarse una) y si no cabe usa una hoja por copia — igual que el original. Botones nuevos en `pedidos.html`: 🖨️ Con precios, 🖨️ Sin precios (conductor), y en el historial 📱 WhatsApp / ✉️ Email por cada pedido.

El envío por WhatsApp/Email **no es una integración real** — tampoco lo era en el HTML actual: descarga el PDF del albarán, avisa con un mensaje claro, y abre WhatsApp Web (`wa.me`) o el programa de correo (`mailto:`) con el texto ya escrito, para que solo haga falta adjuntar el PDF ya descargado y pulsar enviar. Si el cliente tiene más de un teléfono guardado (separados por coma), se pregunta cuál usar — igual que el original.

Probado contra pedidos y clientes reales: PDF "con precios" y "sin precios" verificados campo a campo extrayendo su texto (incluida la traza científica/zona/lote/arte/barco, y confirmado que la versión sin precios nunca lleva la palabra "Partida"); envío por WhatsApp probado con un cliente real de dos teléfonos (SCANFISK SEAFOOD, S.L.) — el aviso de "más de un teléfono" salió correctamente con el prefijo de España añadido a ambos; envío por email probado con un cliente real con email guardado (FRESHMAR ARANDA, S.L.) — PDF descargado y `mailto:` disparado. Verificado con `npm run verify`: 0 discrepancias.

**Imprimir varios pedidos juntos, marcándolos con una casilla** (30/08/2026, a petición de Víctor: "¿se pueden enviar todos juntos, marcándolos de alguna forma?"): igual que `imprimirListadoSinPreciosPorAgencia()` del HTML actual. Cada fila del historial de `pedidos.html` lleva una casilla, más una de "marcar todos"; el botón "🖨️ Imprimir juntos (sin precios)" genera un único PDF con un pedido detrás de otro (siempre sin precios, para el conductor). Si hay filas marcadas a mano se usan solo esas (para elegir, por ejemplo, un camión concreto); si no hay ninguna marcada, se usa lo que esté saliendo con el filtro de arriba. Los pedidos salen ordenados por fecha y número, igual que el original.

Probado con datos reales: filtrado el día 25/08/2026 (18 pedidos), marcados 3 a mano, generado el PDF combinado — confirmado con el texto extraído que salen los 3 números marcados, en el orden correcto, cada uno en su propia página, sin precios. Verificado con `npm run verify`: 0 discrepancias.

**Renumerar pedidos y traspasos** (30/08/2026): botón "🔢 Renumerar" en el historial de `pedidos.html` y `traspasos.html` (igual que `renumerarPedido()`/`renumerarTraspaso()` del HTML actual — repartos no lo tenía en el original, así que no se ha añadido ahí). Pide el número nuevo y dice sí o no según lo confirme la propia base de datos — no hace falta comprobarlo a mano, porque `UNIQUE(anio, numero)` ya lo garantiza; solo se traduce ese rechazo a un mensaje claro. No toca nada más del documento (ni cabecera ni líneas), así que no hay riesgo de perder datos al renumerar.

Probado con datos reales: pedido 13692 renumerado a 99999 (éxito, confirmado en la tabla), intento de renumerarlo a 13691 (ya usado por otro pedido — rechazado con mensaje claro), devuelto a 13692. Lo mismo con un traspaso real (27 → 999 → 27). Verificado con `npm run verify` tras cada prueba: 0 discrepancias.

**Completar el alta/edición de artículos en Catálogos** (30/08/2026): el formulario solo tenía código/descripción/tipo/PVP1/PVP2/IVA — le faltaban todos los campos de trazabilidad y etiquetas (científico, zona FAO, subzona, arte de pesca, barco, peso de etiqueta, calibre, modo de presentación, forma de obtención, nombre en francés/italiano), que ya usan las etiquetas y Reparto Super pero que hasta ahora solo se podían ver, nunca editar ni dar de alta para un artículo nuevo. Añadidos todos, con los mismos valores por defecto que el HTML actual (barco "VARIOS BARCOS", peso de etiqueta "VER CAJA", forma de obtención "CAPTURADO").

**De rebote, al completar este formulario se encontró un fallo real de migración**: el campo `calibre` nunca se había traído de la Fase 1 (ver `VERIFICACION_FASE_1.md` punto 8) — 152 de 154 artículos reales lo tenían y se estaba perdiendo. Corregido de raíz (esquema, script de migración, y una comprobación nueva campo a campo de artículos que no existía) y recuperado el dato real de los 152 artículos desde el mismo backup, sin volver a migrar nada desde cero.

Probado contra un artículo real (C650, ABADEJO RIA): todos los campos cargan con su valor real (incluido `calibre: 3`, antes vacío), editado uno a propósito, guardado, recargada la página y confirmado que persiste, devuelto a su valor original. Verificado con `npm run verify` (con la nueva comprobación de artículos incluida): 0 discrepancias.

**Lista de precios** (30/08/2026): última pantalla pendiente de la lista de Víctor. Reproduce fielmente el generador de imágenes del HTML actual (`dibujarTablaPreciosEnCanvas`/`dibujarTablaPreciosInternaEnCanvas`) — misma cabecera azul marino con el logo real de Marina Fisk, misma franja amarilla "PRECIOS DE HOY", mismo subtítulo según el tipo (Mayoristas "precio en Coruña" / Pescaderías "precio en destino"), mismas filas alternadas, mismo pie de página. Dos modos:
- **Automático**: coste medio ponderado por kilos de las compras de HOY + margen fijo de 1,70 €/kg, igual que `construirListaPreciosHoy()`.
- **Manual**: líneas de texto libre (producto, precio, y opcionalmente coste/existencias "solo para ti", que nunca aparecen en la imagen del cliente) — si al abrir un tipo su borrador de hoy está vacío, copia el del otro tipo como punto de partida, igual que el original.

**Mejora deliberada respecto al HTML actual**: el borrador ya no se guarda en `localStorage` (por ordenador) sino en la base de datos (`listas_precio`/`lista_precio_lineas`, una por tipo+día) — si Víctor empieza la lista de hoy, Pancho la ve y puede seguir donde la dejó, coherente con el multiusuario real de la Fase 3. Se amplió `lista_precio_lineas` con columnas `descripcion`/`coste`/`existencias` que no existían (el diseño original de la Fase 1 asumía que cada línea sería un artículo del catálogo, pero el HTML actual en realidad permite escribir cualquier texto libre — se ha corregido el esquema para que coincida con el comportamiento real).

Cuando hay coste/existencias, se genera además la segunda imagen "USO INTERNO" con el aviso rojo, igual que el original. Se sirve el logo real (extraído del HTML actual) como archivo estático en `public/img/logo-marina-fisk.jpg` para que el `<canvas>` pueda dibujarlo.

Probado en el navegador con datos escritos a mano: margen calculado correctamente, autoguardado con retardo confirmado (recargando la página persiste), copia automática entre Pescaderías/Mayoristas cuando uno está vacío confirmada con su aviso, imagen generada visualmente correcta (captura enviada), botón de imagen interna aparece solo cuando hay coste/existencias. Datos de prueba borrados después. Verificado con `npm run verify`: 0 discrepancias.

Con esto quedan construidas **todas** las pantallas de la lista original de Víctor.

## 2. Un principio de diseño importante para la agilidad (Fase 4 punto 2)

**Bug real encontrado y corregido durante esta fase, antes incluso de que Víctor lo viera:** las primeras versiones de `compras.html` y `pedidos.html` reconstruían toda la fila de la tabla (destruyendo y recreando los campos de texto) en cada tecla pulsada o cada vez que el usuario pasaba al siguiente campo. En las pruebas automatizadas esto no se notaba (rellenan los campos de golpe), pero un usuario de verdad tecleando carácter a carácter **perdería el foco a mitad de escribir un número** — justo lo contrario de la agilidad tipo hoja de cálculo que pide la Fase 4.

Corregido: ahora escribir en un campo solo actualiza los cálculos de esa fila (total, partida) sin tocar los campos de texto en sí; la tabla entera solo se reconstruye al añadir o quitar una línea. Verificado con una simulación de tecleo real (no solo rellenar de golpe): el foco se mantiene en el campo mientras se escribe, en las dos pantallas.

## 3. Panel "Clientes a Contactar Hoy" (Fase 4 punto 1 y 3)

Reproduce la lógica exacta del HTML actual (qué productos compra cada cliente con regularidad, cuánto lleva sin pedirlos, si el intervalo típico se ha superado con margen) y añade la ampliación que pide el punto 3: los recordatorios salen ordenados por margen real conocido (el mayor primero), y los clientes se ordenan por urgencia.

**Mejora deliberada respecto al HTML actual**: "contactado hoy" ya no se guarda en `localStorage` (por ordenador, no compartido) sino en una tabla (`contactados_hoy`) — si Víctor lo marca, Pancho también lo ve marcado, coherente con el multiusuario real de la Fase 3.

Probado contra datos reales: 53 clientes con recordatorio pendiente hoy, cálculo en 0,4 segundos — muy por debajo de cualquier problema de agilidad.

## 4. Otros fallos encontrados y corregidos durante las pruebas de esta fase

- **Campo numérico vacío rompía el guardado**: un formulario con un campo numérico sin rellenar (ej. "cajas") mandaba `''` en vez de `null`, y PostgreSQL lo rechazaba con un error 500. Corregido de forma genérica en el backend (`vacioComoNull`, en `crudCatalogo.js`, `crudDocumento.js` y `compras.js`) — no solo en el formulario, para que ninguna otra pantalla futura pueda repetir el mismo fallo.
- **Códigos mostrados como si fueran cantidades**: en los listados, un código de proveedor como `50232` se mostraba con separador de miles (`50.232`), como si fuera una cifra. Corregido para que las columnas de código/número de documento nunca se formateen como cantidad.
- **Faltaba búsqueda por código o descripción en el campo Producto/Artículo de cada línea** (encontrado por Víctor, 29/08/2026: "en cada registro se puede buscar cualquier cosa por código o descripción... si escribimos alguna letra o palabra aparecen las posibilidades"): ya existía en Proveedor (Compras) y Cliente (Pedidos), pero no en el campo más usado de todos — el Producto/Artículo de cada línea, donde había que saberse el código de memoria. Corregido en `compras.html` (campo `producto`) y `pedidos.html` (campo `articulo_codigo`): ambos llevan ahora un `<datalist>` con los 154 artículos del catálogo (`codigo — descripción`), que se filtra solo con teclear una letra o palabra, igual que ya hacía Proveedor/Cliente. Además, si el código tecleado coincide con uno del catálogo, la Descripción se rellena sola (no hay que escribirla dos veces). Se guarda siempre solo el código (nunca el texto "código — descripción" completo), igual que ya se hacía con Proveedor/Cliente.
  Probado con Playwright contra los datos reales: el datalist carga los 154 artículos reales, el foco se mantiene al escribir carácter a carácter (no rompe la corrección del punto 2), y el autorrelleno de descripción funciona en las dos pantallas.

## 5. Verificación de datos reales tras las pruebas

Todas las pruebas de esta fase se hicieron contra los datos reales migrados en Fase 1 (no hay datos de mentira en esta base). Cualquier compra/pedido de prueba creado durante las pruebas se ha borrado explícitamente después, y las asignaciones automáticas de partida hechas sobre pedidos reales (al probar "asignar partidas de un día" contra una fecha real) se han revertido. Verificado con `npm run verify` tras cada tanda de pruebas: **0 discrepancias** contra el backup original en todo momento.

## 6. Editar un pedido ya grabado (29/08/2026)

Al comprobar "todo lo que no esté comprobado" se detectó que, aunque `pedidos`/`pedido_lineas` sí se pueden actualizar (a diferencia de `compras`, que son dato sagrado), **no existía ninguna pantalla para editar un pedido ya guardado**, y además el `PUT /api/pedidos/:id` genérico (`crudDocumento.js`) solo actualizaba la cabecera — nunca las líneas, aunque nadie lo hubiera notado todavía porque no había pantalla que lo intentara.

Se comprobó primero cómo lo hace el HTML actual (`cargarPedido`/`grabarPedido`): "editar" no es un parche parcial — es recargar el pedido entero en el formulario y, al grabar, **borrar el registro entero y volver a grabarlo con el mismo número** (nunca se pide uno nuevo de la secuencia). Se ha reproducido exactamente esa misma lógica:

- `crudDocumento.js`: el `PUT` ahora también borra las líneas antiguas y graba las nuevas dentro de la misma transacción (antes solo tocaba la cabecera). Esto beneficia igual a traspasos y repartos, que comparten la misma fábrica.
- `pedidos.html`: cada fila de "Últimos pedidos" tiene un botón ✏️ Editar que carga cliente, fecha y líneas (incluida la partida ya asignada) en el formulario; el botón cambia a "Guardar cambios (editando pedido Nº X)" y un botón "Cancelar edición" permite volver a modo "pedido nuevo" sin guardar nada.
- Al cargar una línea para editar se vuelve a consultar la disponibilidad de partidas en vivo (respetando si la partida fue elegida a mano) — igual que si se acabara de escribir el artículo.

**Bug encontrado de rebote al construir esta prueba**: al cargar un pedido real para editar apareció un campo (`cantidad`, "Cajas/bultos") que sí existe en la base de datos y en el HTML actual, pero que la pantalla `pedidos.html` nunca mostraba ni guardaba — de haberse editado y grabado tal cual, ese dato se habría **perdido silenciosamente** en cualquier pedido antiguo que lo tuviera. Corregido: añadida la columna "Cajas" a la tabla de líneas (con su total), a la vista previa interna y de cliente, y al guardado.

Probado end-to-end contra un pedido real (nº 13692, cliente 50000): cargado con sus valores originales (incluidas las 2 cajas), editado el peso, guardado, comprobado el cambio, y vuelto a dejar exactamente como estaba (mismo peso, cajas, precio, base/IVA/total idénticos al backup original) — verificado con `npm run verify`: 0 discrepancias.

## 7. Informe de bugs de Víctor sobre el HTML actual (29/08/2026) — comprobado uno a uno

Víctor adjuntó un informe con 4 fallos confirmados en el HTML actual, para asegurarse de que el programa nuevo no los repite:

1. **Doble guardado crea dos registros con el mismo número** (doble clic/doble tap). En este backend el número ya se pedía a una secuencia real de PostgreSQL (nunca un contador de JS), así que dos guardados nunca podían chocar en el *mismo* número — pero sí podían crear **dos pedidos distintos** con números distintos, que es igual de malo. Corregido en `compras.html` y `pedidos.html`: en cuanto se pulsa "Guardar" se bloquea el botón de inmediato (antes de nada más) y no se libera hasta que el guardado termine, con éxito o error; cualquier clic mientras tanto se ignora. Probado con dos clics disparados a la vez: solo se creó un pedido.
2. **Fechas desplazadas un día en listados** — ver Fase 1 punto 7: era un fallo real y grave (no solo en el HTML), corregido a nivel del driver de PostgreSQL para toda la aplicación.
3. **El listado de pedidos no aplicaba el Recargo de Equivalencia** (10% fijo para todos) — ver Fase 2 punto 2: conectado el cálculo real de IVA/Recargo a la creación/edición de pedidos.
4. **Faltaba una fila de totales al exportar varios pedidos.** No existía ningún listado "plano" de pedidos (todos los existentes son resúmenes agregados) — se ha añadido uno nuevo, **"Pedidos (detalle para contabilidad)"**, con una fila por pedido (número, fecha, cliente, kilos, base, IVA ya calculado según el cliente, total) y una fila final `TOTAL` con la suma de los cuatro importes, tanto en pantalla como en el CSV exportado. Probado contra los pedidos reales del 25/08/2026: fechas correctas, IVA variable según cliente (0% para el intracomunitario, ~10% para el resto), fila TOTAL con la suma correcta.

## 8. Historial de pedidos: buscar y anular (29/08/2026)

Víctor pidió pensar qué más comprobar ("todo tiene que funcionar como en HTML"). Comparando con el HTML actual (funciones `filtrarHis`, `anularPedido`, `renumerarPedido`) se encontraron dos huecos reales de uso diario:

- **Buscar un pedido antiguo.** `pedidos.html` solo enseñaba los últimos 15 — un pedido de hace semanas era invisible salvo que se supiera consultar la API a mano. Corregido: nuevo filtro por número, cliente y rango de fechas (igual que el HTML actual), que busca en **todo** el historial, no solo en los últimos. Sin ningún filtro se siguen enseñando los más recientes (ahora 30) para no pintar de golpe los 1000+ pedidos.
- **Anular un pedido.** No existía ningún botón para borrar un pedido mal grabado — el `DELETE` ya existía en la API (Fase 2) pero nadie podía llegar a él desde la pantalla. Añadido el botón 🗑️ Anular con la misma confirmación explícita ("no se puede deshacer") que el HTML actual.

Probado contra datos reales: búsqueda por número encuentra pedidos fuera de los últimos 30, búsqueda por cliente (58 coincidencias para "scanfisk"), creación + anulación de un pedido de prueba confirmada y verificada en la base de datos (borrado real, no solo visual) — `npm run verify`: 0 discrepancias tras la prueba.

**Todavía sin construir, vistas en el HTML actual pero de menor uso diario**: renumerar un pedido a mano (`renumerarPedido`), envío de albarán por WhatsApp/Email, impresión de etiquetas — se dejan para cuando se aborde el bloque de impresión/PDF (ver punto 1).

## 9. Correcciones aplicadas hoy al HTML actual (02/09/2026) — comprobadas en el sistema nuevo

Víctor aplicó tres correcciones directamente al HTML de producción tras detectar un problema real de duplicados, y las entregó como especificación de comportamiento a cumplir aquí (no como código a copiar). Las tres estaban ya total o parcialmente resueltas por el propio diseño del backend, y se ha comprobado/reforzado cada una:

**1. Doble/triple grabación por el mismo clic.** El HTML actual solo bloqueaba el botón "GRABAR" en pantalla — protección real, pero solo desde el navegador. El informe pide explícitamente algo más robusto: que el propio servidor no permita una segunda grabación igual mientras la primera sigue en curso. Añadido `src/negocio/bloqueoGrabado.js`: mientras un usuario tiene un guardado en marcha en una tabla (pedidos, traspasos, repartos o compras — tanto crear como editar), cualquier otra petición de guardado suya para esa misma tabla se rechaza al instante (`409`, "Ya hay una grabación en curso...") en vez de crear un segundo registro; se libera siempre, incluso si el guardado falla. Es aparte del bloqueo del botón en pantalla, que sigue existiendo — son dos capas, tal como pide el informe.

Probado disparando 8 peticiones de guardado idénticas del mismo usuario en paralelo (mismo `traspaso`): 6 rechazadas por "grabación en curso", solo las 2 que de verdad no se solapaban en el tiempo llegaron a crear un traspaso — nunca dos a la vez. Repetido igual con `compras` (4 peticiones en paralelo, 1 sola creada, 3 rechazadas). Los cuatro formularios (`pedidos.html`, `traspasos.html`, `repartos.html`, `compras.html`) ya muestran cualquier error del servidor (`datos.error`) en el mismo aviso rojo de siempre — no ha hecho falta tocar la pantalla para que el nuevo mensaje se vea bien.

**2. Sincronización entre puestos sin refresco manual.** El HTML actual necesitaba refrescar 7 cachés de una carpeta compartida al empezar cada día porque los contadores podían desincronizarse entre puestos. El sistema nuevo no tiene ninguna caché de ese tipo — cada pantalla lee y escribe directamente contra la misma base de datos en cada acción, y los números de pedido/traspaso/reparto/partida los genera siempre una secuencia real de PostgreSQL (nunca un contador guardado en el navegador). Comprobado explícitamente con dos usuarios de verdad (`victor` y un usuario de prueba, sesiones distintas) grabando un pedido cada uno **a la vez**: los dos guardados tuvieron éxito sin bloquearse entre sí (el bloqueo del punto 1 es por usuario, no global) y recibieron números consecutivos sin colisión (13717 y 13718) — sin ningún refresco, manual ni automático. Pedidos de prueba borrados y usuario de prueba eliminado después; `npm run verify`: 0 discrepancias.

**3. Listado de movimiento con traspasos separados de las ventas.** El listado "Movimiento de producto" (`GET /listados/movimiento-producto`) mezclaba silenciosamente pedidos y traspasos en el mismo total — justo lo que el informe pide evitar. Corregido: por defecto el listado muestra **solo ventas reales** (pedidos); una casilla nueva en `listados.html` ("Incluir traspasos a Zaragoza (estadística, no es venta)") añade los traspasos como filas claramente etiquetadas (`TRASPASO A ZARAGOZA (interno, no es venta)`), nunca mezcladas con las de venta, y al final del listado aparecen tres totales separados en vez de uno: **Total ventas reales** (kg + importe), **Total traspasado a Zaragoza** (solo kg, sin importe) y **Total pescado movido** (kg, suma de ambos). El mismo criterio no existía como buscador dedicado en el sistema nuevo (el HTML actual lo tiene en "Historial → Buscar Artículos") — se ha aplicado sobre el listado de la Fase 2 que cubre el mismo caso de uso, tal como pide el informe ("debe aplicarse también a cualquier otro listado... que trate kilos/artículos").

Probado contra datos reales (agosto 2026): sin la casilla, el listado no trae ni una fila de traspaso; con la casilla, 35.954,45 kg / 150.122,17 € de ventas reales + 3.638,55 kg traspasados = 39.593,00 kg de pescado movido en total — la suma cuadra exactamente. `npm run verify` tras las pruebas: 0 discrepancias.

## 10. Segunda entrega del informe de Víctor (02/09/2026): aviso de pérdida y existencias en texto libre

El mismo informe llegó ampliado con dos puntos más (los tres anteriores ya estaban resueltos, ver punto 9):

**4. Aviso cuando el precio de venta queda por debajo del coste** (lista de precios manual). Implementado en `listasprecio.html`, en los tres niveles que pide el informe:
1. *En vivo*: en cuanto Precio y Coste están rellenos y Precio < Coste, el campo Precio se marca con borde rojo (`.en-perdida`) y la columna de margen pasa a "⚠️ ¡PÉRDIDA! -X,XX€" en rojo.
2. *Al salir del campo*: un aviso emergente (`alert`) nombra el producto, el precio, el coste y cuánto se pierde por kilo.
3. *Antes de generar la imagen final*: si sigue habiendo algún producto en pérdida, se listan todos con su importe de pérdida y se pide confirmación explícita (`confirm`) antes de continuar — no bloquea, pero obliga a confirmarlo a propósito, igual que el HTML actual.

**Alcance de esta corrección, explicado con honestidad**: el informe pide idealmente comparar contra "el coste real de la partida asignada", no solo un coste tecleado a mano. En el modo Automático eso ya es así (el precio sale siempre del coste medio real de las compras de hoy + margen, nunca puede dar pérdida). Pero en el modo Manual las líneas son texto libre sin vincular a ningún artículo del catálogo ni partida concreta — así es como ya funciona el HTML actual y así se decidió deliberadamente al construir esta pantalla (ver Fase 1, `lista_precio_lineas`), porque Víctor a veces escribe productos que no están en el catálogo. Por eso la comparación en modo Manual usa el coste que Víctor escribe a mano, igual que el HTML actual — vincular cada línea manual a una partida real sería un cambio de diseño mayor, no pedido aquí, y se señala como posible mejora futura si algún día interesa.

**5. Existencias admite texto libre.** La columna `lista_precio_lineas.existencias` era `NUMERIC` — se ha cambiado a `TEXT` (migración aplicada también a la base de datos real, sin pérdida de los datos existentes). El campo del formulario pasa de `type="number"` a `type="text"`; en la imagen interna, un valor numérico se sigue mostrando como "X cajas" y cualquier otro texto se muestra tal cual, en mayúsculas (ej. "AGOTADO", "POCAS").

Probado con Playwright contra un caso real con los tres casos a la vez (un producto con existencias numéricas, uno "AGOTADO" y uno "POCAS", y uno de los tres deliberadamente en pérdida): captura de los tres niveles de aviso confirmada (borde rojo + texto en vivo, `alert` al salir del campo citando el producto/precio/coste/pérdida exactos, `confirm` antes de generar listando el producto en pérdida), y la imagen interna generada muestra "12 cajas", "AGOTADO" y "POCAS" correctamente. Datos de prueba borrados después; `npm run verify`: 0 discrepancias.

## 11. Qué falta para cerrar la Fase 4 del todo

- **Víctor debe usar personalmente cada pantalla con datos reales** y confirmar que el resultado es idéntico al del programa actual — este es el requisito de cierre más importante de esta fase (punto 4 de la Fase 4) y no lo puede hacer nadie más.
- Comparación explícita de agilidad frente al HTML/Excel actuales, pantalla por pantalla (más allá de la corrección de foco del punto 2, que era un defecto claro).
- Transfrío, Reparto Super, etiquetas multi-idioma y listas de precios (ver punto 1).
- El HTML actual sigue intacto y disponible en paralelo — no se ha tocado nada de él.
