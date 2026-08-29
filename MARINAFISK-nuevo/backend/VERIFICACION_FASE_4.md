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
| `repartos.html` (29/08/2026) | Registrar Reparto Super: fecha, destinatario (lista de supermercados + "OTRO" con texto libre, partido en nombre de cadena + ciudad igual que `dividirDestinatario()` del HTML actual), conductor, líneas (artículo/lote/barco/subzona/arte de pesca/cajas/kg aprox./peso de etiqueta). Al elegir un artículo se autorrellenan barco/subzona/arte de pesca desde el catálogo si la línea los tenía vacíos — y **estos datos ya estaban en la base real, migrados en la Fase 1** (153-154 de 154 artículos los tienen). Crear, editar, anular, buscar en todo el historial. Sin impresión de etiquetas todavía (siguiente punto). |

**Etiquetas Scanfisk (Reparto Super)** (29/08/2026): construido `src/negocio/etiquetas.js`, reproducción fiel del motor `MarinaFiskEtiquetas` del HTML actual — mismo CSS de etiqueta térmica 50×145mm (contenido rotado 90°, tamaño de página a medida), misma rejilla de datos (zona/subzona, categoría/calibre, fecha/lote/caducidad, producto+científico, arte de pesca, QR de trazabilidad, expedidor+RSI, destinatario/dirección/provincia), mismo sello sanitario (imagen real extraída tal cual del HTML actual, con el número de registro `12.01671/C` correcto — no el error tipográfico histórico), mismo RSI del expedidor (`Nº R.S.I.: 12.08586/C`, un número **distinto** al del sello, ambos correctos en su contexto), una etiqueta por caja. Caducidad = fecha del reparto + 7 días (regla configurable en el código, +12 días para el formato francés/Pomona, calculado siempre en el servidor). El QR se genera server-side (paquete `qrcode`), no en el navegador. Botón "🏷️ Etiquetas" en `repartos.html` que pide la página ya autenticada (nunca con el token en la URL) y la abre lista para imprimir con Ctrl+P.

Probado contra un reparto real de prueba (3 cajas → 3 etiquetas), verificado el HTML generado campo a campo (lote `290826`, caducidad `05/09/26` = 29/08 + 7 días, RSI y sello correctos) y visualmente con una captura de pantalla del resultado. Limpiado el dato de prueba y verificado `npm run verify`: 0 discrepancias.

Ver `VERIFICACION_TRANSVERSAL.md` para el detalle punto por punto frente al documento de auditoría de Víctor.

**No construidas todavía**: etiquetas multi-idioma (Francés/Italiano) y de otros formatos de cliente (Más y Más, David Sala), Transfrío, ficha de envío/hoja de ruta de Reparto Super, WhatsApp/Email — y, de menor prioridad confirmada por Víctor: listas de precio, renumerar pedido, completar el alta de artículos en Catálogos con científico/zona FAO/etc.

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

## 9. Qué falta para cerrar la Fase 4 del todo

- **Víctor debe usar personalmente cada pantalla con datos reales** y confirmar que el resultado es idéntico al del programa actual — este es el requisito de cierre más importante de esta fase (punto 4 de la Fase 4) y no lo puede hacer nadie más.
- Comparación explícita de agilidad frente al HTML/Excel actuales, pantalla por pantalla (más allá de la corrección de foco del punto 2, que era un defecto claro).
- Transfrío, Reparto Super, etiquetas multi-idioma y listas de precios (ver punto 1).
- El HTML actual sigue intacto y disponible en paralelo — no se ha tocado nada de él.
