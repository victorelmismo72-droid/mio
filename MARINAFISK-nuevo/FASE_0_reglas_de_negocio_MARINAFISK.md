# MARINAFISK — Reglas de negocio actuales (Fase 0)

Documento de referencia para el desarrollo del nuevo sistema con base de datos.
Recoge cómo funciona HOY el programa HTML (`CARGA_DE_ALBARANES_MARINAFISK`), para que el sistema nuevo reproduzca exactamente el mismo comportamiento antes de añadir nada.

Última versión de referencia del programa actual: **2026-09-02-CORREGIDO_4**, con la mejora de agilidad en Compras del 12/09/2026 (ver punto 10) aplicada encima (sustituye a la anterior, 2026-08-21-I, que se conserva en el repo como histórico).
Última versión corregida del Excel GESTION_CORRECTA: **`GESTION_CORRECTA_precio_medio_arreglado_4.xlsx`** (guardado en este repo el 12/09/2026) — hoja `COMPRAS` (una línea por compra) y hoja `PANEL COMPRAS` (dashboard: top proveedores/productos por kilos e importe, filtrable por fecha). Es la referencia de agilidad usada para el punto 10.

---

## 1. Estructura del negocio

- **Marinafisk Pescados S.A.**, con sede/operativa en A Coruña (lonja/subasta).
- Dos puestos de trabajo sincronizados por carpeta de red compartida "PEDIDOS":
  - **CORU** = puesto de Víctor (A Coruña)
  - **PANC** = puesto de Pancho
- Cada registro guarda su origen en un campo `_uid` etiquetado CORU/PANC.
- El negocio compra pescado en subasta/lonja y a proveedores, y vende a:
  - **Pescaderías** (precio en destino)
  - **Mayoristas** (precio en Coruña)

---

## 2. Compras y el 2% de OP (Obras del Puerto)

- El 2% de OP **se aplica solo a proveedores de subasta/lonja marcados como tal** en el maestro de Proveedores — no a todos los proveedores.
- El campo `baseReal` (usado para el precio medio) se calcula:
  ```
  baseReal = baseZgz + op2
  ```
  Es decir, el 2% de OP SÍ debe estar incluido en el precio medio y en el coste, siempre que el proveedor sea de subasta.
- **Regla crítica:** el 2% de OP debe calcularse con fórmula viva (consultando el maestro de Proveedores en cada momento), nunca como valor congelado/estático. Un fallo histórico (17 compras de dos proveedores, 20–25 junio 2026) se debió justamente a que la fórmula se quedó congelada en vez de recalcularse — hay que evitar que el sistema nuevo repita este patrón.

---

## 3. Partidas (asignación de coste a ventas)

- Cada compra genera una o varias **partidas** (lotes con coste y kilos disponibles).
- Al vender, cada línea del pedido se debe asignar a una partida concreta, para poder calcular el margen real.
- **Asignación automática inline**: al introducir producto y precio en un pedido nuevo, el sistema intenta asignar partida solo.
- **Margen mínimo de referencia: 1,30 €/kg.** Si ninguna partida disponible llega a ese margen para el precio de venta introducido, se marca con aviso (⚠️ amarillo) en vez de confirmación (✅ verde), y la línea pasa a una pantalla de excepciones para resolución manual.
- **Cierre de partidas**: rara vez llegan a exactamente cero kilos por mermas y pérdida de peso en procesado. Existe un cierre manual (botón "🔒 Cerrar"), guardado aparte de las compras, y una función de cierre masivo por fecha.
- **Compras = dato sagrado.** Los datos de compras (kilos, precio, proveedor) **nunca se deben modificar** una vez introducidos — Zaragoza los usa para contabilidad de beneficio por partida con cifras exactas. El sistema nuevo debe preservar esta garantía (por ejemplo, con un log de auditoría o campos inmutables).
- **Partidas nunca deben aparecer en el albarán del cliente** (versión sin precios) — solo en la versión interna con precios.
- Emparejamiento de producto de compra con productos de venta con variantes de talla (ej. código genérico C1300 con variantes C13004/C13006/C13008): requiere coincidencia de prefijo **y** primera palabra de la descripción del catálogo — un prefijo solo no es suficiente (hay falsos positivos conocidos, ej. C144 vs C1444).

---

## 4. IVA

- El pescado lleva **un único tipo de IVA (10%)** — no varía según el tipo de producto (fresco/congelado/otros).
- **Decidido (2026-08-24):** las compras a **proveedores intracomunitarios (UE)** se facturan **sin IVA**, por inversión del sujeto pasivo — es el comportamiento correcto, no un fallo. El sistema nuevo debe marcar explícitamente cada proveedor como `NACIONAL` o `INTRACOMUNITARIO` (campo `tipo_iva` en el maestro de Proveedores, igual que ya existe para Clientes) y aplicar la regla en vivo en cada compra: 10% si nacional, 0% si intracomunitario. Confirmado por Víctor: todos los proveedores son NACIONAL o INTRACOMUNITARIO, no hay proveedores extracomunitarios — no hace falta un tercer caso.
- Nota histórica: el código actual del programa HTML no tiene esta distinción implementada en el cálculo de líneas de compra (aplica 10% siempre) — el comportamiento de "sin IVA" para esos proveedores se ha estado gestionando de otra forma fuera de esa fórmula. El sistema nuevo lo incorpora como regla explícita del motor de cálculo, no como excepción manual.

---

## 5. Listas de precios (Pescaderías / Mayoristas)

- Dos listas de precios **independientes**, con productos y precios que pueden ser totalmente distintos entre sí:
  - **Pescaderías** → precio en destino
  - **Mayoristas** → precio en Coruña
- Cada lista tiene dos modos:
  - **Automático**: se rellena solo desde las compras del día.
  - **Manual**: entrada libre de productos y precios.
- En modo manual, cada lista se guarda por separado (autoguardado diario). Al abrir una lista vacía por primera vez en el día, se copian los productos de la otra lista como punto de partida (no obligatorio, solo para no escribir dos veces) — a partir de ahí, cada lista es independiente y no se pisan entre sí.
- Las imágenes generadas para el cliente llevan el precio final; existe una versión interna adicional (solo para uso propio, nunca para el cliente) con coste, margen real y existencias en cajas.

---

## 6. Sincronización entre puestos (CORU/PANC)

- Los datos (clientes, artículos, proveedores, compras, pedidos, repartos, traspasos) se sincronizan vía carpeta de red compartida, con archivos JSON por registro.
- Reglas ya aprendidas de fallos pasados, a preservar en el diseño nuevo:
  - Los contadores correlativos (nextPedido, nextPartida, nextReparto, nextTrp) deben ser siempre consistentes entre puestos — un contador desincronizado puede causar números de albarán duplicados (ya ocurrió: 667 duplicados en un incidente de 5 minutos el 28/07/2026).
  - Los backups deben **siempre** leer el estado real y completo de ambos puestos, sin usar cachés/atajos de rendimiento — un fallo pasado hizo que backups se generaran con datos "congelados" y omitieran cientos de pedidos de un puesto.
  - Las altas nuevas de clientes/artículos/proveedores en un puesto deben propagarse siempre al otro (no solo las actualizaciones de registros ya existentes).
  - **Doble/triple grabación por clic repetido (fallo real, 01/09/2026):** un mismo clic en "GRABAR" (Pedidos) repetido mientras el guardado tardaba en confirmarse generó el mismo pedido 3 veces con 3 números distintos. Corregido en el HTML bloqueando el botón (deshabilitado + texto "⏳ Grabando...") mientras la grabación está en curso, en Pedidos, Traspasos y Repartos. **El sistema nuevo debe garantizar esto de forma estructural** (idempotencia en el backend / transacción única por documento), no solo con un botón deshabilitado en el frontend — un botón deshabilitado no protege contra reintentos de red, doble pestaña, etc.
  - **Refresco incompleto de la carpeta antes de grabar (fallo relacionado, 01–02/09/2026):** los contadores podían desincronizarse entre puestos porque la carpeta compartida no se había refrescado del todo antes de grabar un documento. Corregido en el HTML con un refresco automático completo (no solo de Pedidos) la primera vez que se abre el programa cada día, con límite de 90s y aviso explícito si no llega a tiempo. El sistema nuevo elimina esta clase de fallo de raíz al no depender de archivos JSON en carpeta compartida (ver `02_ESQUEMA_BASE_DATOS_PROPUESTO.md`), pero conviene registrar el caso como prueba de regresión.

---

## 7. Fechas

- Usar siempre **fecha local (España/Madrid)**, nunca conversión a UTC antes de recortar la fecha — un fallo pasado (`toISOString().split('T')[0]`) causaba que pedidos introducidos después de medianoche se registraran con la fecha del día anterior. El sistema nuevo debe calcular la fecha "de hoy" en huso horario local de forma centralizada y consistente.

---

## 8. Documentos / registro sanitario

- El registro sanitario correcto es **12.01671/C** (cuidado: existió un error tipográfico histórico como "12.016171/C" — un dígito de más).
- Debe aparecer en todos los documentos que se envían a terceros: albaranes, traspasos, y fichas de envío de Reparto Super.

---

## 9. Correcciones incorporadas en la versión 2026-09-02-CORREGIDO_4

Cambios reales de negocio respecto a la versión de referencia anterior (2026-08-21-I), a preservar en el sistema nuevo:

- **Traspasos internos ≠ ventas, pero deben poder verse juntos como estadística de kg.** En el listado "Buscar artículo" ahora hay una casilla opcional "Incluir también los traspasos internos a Zaragoza" — al marcarla, los traspasos aparecen en la tabla claramente diferenciados (fila atenuada, sin precio ni importe, texto "TRASPASO A ZARAGOZA (interno, no es venta)"), y el total se desglosa en tres líneas: **VENTAS REALES** (kg + importe, como antes), **Traspasado a Zaragoza (no es venta)** (solo kg) y **TOTAL PESCADO MOVIDO** (suma de ambos, solo a efectos estadísticos). Por defecto (casilla sin marcar) el comportamiento es idéntico al de siempre. Regla para el sistema nuevo: cualquier informe agregado de "ventas" debe excluir traspasos del importe económico por defecto, pero debe ser posible incluirlos aparte para ver el movimiento físico total de kg.
- **IVA/Recargo real por cliente en el Excel de listado de pedidos.** El Excel que genera el listado de pedidos (hoja con fórmulas) calculaba el IVA de la columna de totales con un 10% fijo. Ahora se calcula con el tipo real de cada pedido según la clasificación fiscal del cliente (NORMAL / RECARGO_EQUIVALENCIA / INTRACOMUNITARIO, ver Fase 2 punto 3), usando la misma función `calcularIvaPedido` que el resto del programa. También se añadió una fila de TOTALES (suma de kg, base, IVA y total de todos los albaranes del listado).
- **Corrección de fecha en el Excel exportado.** Antes se dejaba que la librería XLSX convirtiera un objeto `Date` de JavaScript a fecha de Excel, lo que en ciertos días podía desplazar la fecha un día (fallo conocido de esa conversión con el horario de verano). Ahora se calcula a mano el número de serie de fecha de Excel a partir del ISO (YYYY-MM-DD), todo en UTC de principio a fin, sin pasar por conversiones intermedias. Relacionado con la regla ya existente del punto 7 (fecha local, nunca UTC "de paso") — aquí el cuidado es el inverso (hacer *todo* el cálculo interno en UTC de forma consistente, sin mezclarlo con el huso local a mitad de camino).
- **Aviso de venta por debajo de coste en listas de precio manuales.** Al escribir precio y coste de un producto en la tabla manual de listas de precio, si el margen sale negativo se marca en rojo fuerte junto al campo ("⚠️ ¡PÉRDIDA! X€", con el input de precio resaltado) y, al salir del campo, aparece además un aviso emergente central. Antes de generar la imagen para el cliente, si queda algún producto con precio por debajo de coste, se pide confirmación explícita con el detalle de cada caso (no bloquea, pero obliga a confirmarlo). Fallo humano real detectado el 02/09/2026 (poner sin querer el precio de venta por debajo del coste) — el sistema nuevo debe incluir esta misma protección (visual + confirmación), no solo un cálculo silencioso de margen.
- **Campo "Existencias (solo tú)" admite texto libre**, no solo número de cajas — por ejemplo "AGOTADO" o "POCAS", además de cifras. Sigue siendo un campo de uso interno que nunca aparece en la imagen que ve el cliente.
- **Hoja Transfrío también disponible en Traspasos.** Hasta ahora ese botón (imprimir encima del papel pre-impreso del transportista, con destino/fecha/bultos/kilos) solo existía en Pedidos. Se añadió el mismo botón en Traspasos — como un traspaso es un movimiento interno (no una venta a un cliente del catálogo), el destinatario se dejó fijo, **"MARINA FISH ZARAGOZA"** con destino "ZARAGOZA", sin buscar ni depender de ninguna ficha de Clientes. Regla para el sistema nuevo: esta hoja de transporte debe existir también en la pantalla de Traspasos, con el mismo criterio — el destinatario de un traspaso a Zaragoza es una constante interna del sistema, nunca un registro del catálogo de clientes ni una ficha de cliente falsa creada solo para poder imprimir.

*(Confirmado y detallado por Víctor el 02/09/2026 en `CORRECCIONES_02-09-2026_para_Code.md`, guardado en este repo — ese documento añade además dos puntos que Víctor ya tiene funcionando en su programa pero que TODAVÍA NO están en el HTML de referencia que tenemos aquí: ver punto 11.)*

---

## 10. Mejora de agilidad en Compras (12/09/2026)

Petición de Víctor, comparando el programa con el Excel `GESTION_CORRECTA_precio_medio_arreglado_4.xlsx`: quería que la pantalla de Compras fuera igual de clara, concisa y rápida de teclear que ese Excel, con las mismas teclas para pasar de un campo al siguiente. Comparando la hoja `COMPRAS` de ese Excel (fila = una línea de compra: N PARTIDA/FECHA/COD PROV/COD PROD/CAJAS/KILOS/EUR-KG, el resto calculado) con el panel de Compras del programa, se encontró que **Compras no tenía la navegación por teclado que Pedidos ya tiene** (`navPed`) — había que usar el ratón para moverse entre Cajas/Kilos/€-Kg. Corregido:

- **Tab/Enter entre campos de la línea de compra** (`navCompra`, mismo patrón que `navPed` en Pedidos): Cajas → Kilos → €/Kg → Cajas de la siguiente línea, añadiendo una línea nueva automáticamente igual que en Pedidos.
- **Al elegir un artículo, el foco salta solo a Cajas** (antes había que hacer clic).
- **El campo Kilos admite sumar varias cifras**, igual que ya se hacía a mano en el Excel `GESTION_CORRECTA` al pesar cajas por separado (ej. escribir `12+13.5` en vez de sumarlo antes con calculadora aparte — en el Excel real esto aparece como fórmula en la columna KILOS). Si lo escrito no es una suma válida, se marca en rojo (mismo tipo de aviso ya usado en listas de precio para margen negativo) sin bloquear ni corromper el resto de la línea.
- **Corrección técnica importante para que esto no se rompiera**: al escribir en Kilos ahora se actualiza solo esa línea (sin redibujar toda la tabla en cada tecla), igual que ya hacía Pedidos — si no, el cursor se habría desplazado cada vez que se escribía un carácter. El valor que se guarda en `kilos` siempre es el número ya calculado (ej. `25.5`), nunca el texto de la fórmula (`"12+13.5"`) — importante porque el resto del programa (listados, backups, Excel) lee ese campo con `parseFloat`, que solo entendería el primer número y perdería el resto silenciosamente si se guardara como texto.

Probado en navegador real (no solo revisado el código): navegación Tab/Enter completa fila a fila, escritura de una expresión sin perder el foco carácter a carácter, cálculo correcto de Base/2% OP/IVA/Total, aviso visual ante una expresión inválida, y grabado final con el kilos numérico correcto sin el texto de la fórmula.

**Revisado también el HISTORIAL de Compras** (petición de Víctor, misma fecha), donde se corrigen líneas ya grabadas sin tener que reabrir la compra:

- **Enter en Cajas/Kilos/€-Kg guarda la línea** (mismo efecto que pulsar 💾) — antes no hacía nada, había que ir al ratón.
- **Base/2% OP/IVA/Total se recalculan en vivo** mientras se corrige, igual que en la pantalla de alta — antes solo se veía el resultado después de guardar.
- **Kilos admite la misma suma de cifras** (`12+13.5`) que en la pantalla de alta, por coherencia — antes solo aceptaba un número suelto.
- Si la expresión de Kilos no es válida, **se bloquea el guardado con un aviso claro** (no se deja grabar un valor sin sentido) — antes se habría guardado tal cual la escribiera el usuario, sin ninguna validación.

Probado igual en navegador real: previsualización en vivo sin perder el foco, expresión inválida bloqueando el guardado con aviso, y guardado final con Enter dejando el kilos numérico correcto en el registro.

**Hallazgo relacionado, no resuelto aquí — necesita tu confirmación:** revisando el historial se ve que el HTML actual sí permite corregir/mover/anular compras ya grabadas (`guardarLineaCompra`, `cambiarProveedorLineaCompra`, `cambiarArticuloLineaCompra`, `anularCompra`), lo cual está en tensión con la regla "compras = dato sagrado, nunca se modifican" del punto 3 — la misma tensión que ya salió con la reimportación del Excel de compras (ver la decisión de Víctor al respecto en `backend/README.md`, sección del endpoint de importación). No se toca nada de esto ahora (son funciones ya existentes y usadas por Víctor); queda anotado para cuando se diseñe cómo la Fase 1/2 del sistema nuevo debe tratar las correcciones a compras ya grabadas — probablemente con el mismo patrón de "registro de ajuste enlazado" en vez de sobrescribir en silencio, pero eso lo debe confirmar Víctor antes de construirlo.

---

## 11. Funcionalidad ya en producción de Víctor, TODAVÍA NO incluida en nuestro HTML de referencia

Según `CORRECCIONES_02-09-2026_para_Code.md` (guardado en este repo), Víctor ya tiene esto funcionando en su programa real, pero el fichero `CARGA_DE_ALBARANES_MARINAFISK_20260902CORREGIDO_4.html` que tenemos en el repo **no lo incluye todavía** (comprobado: no aparece "CMR" ni "Carta de Porte" en ese archivo). Se documenta aquí como especificación funcional para el sistema nuevo, a la espera de que Víctor nos pase la versión de su HTML que ya lo tiene.

### 11.1 Hoja CMR / Carta de Porte para clientes de Portugal (transportista Mouzo)

- Los clientes con transportista **"Mouzo Campos Trans, S.L."** (agencia `MOZO` en el catálogo — hoy solo un cliente: MARIA CUSTODIA ALVES E FILLOS, código 50540) necesitan, además del albarán normal, una hoja CMR/Carta de Porte internacional para el transporte a Portugal — un papel pre-impreso del transportista, igual que Transfrío.
- Botón **"📄 HOJA CMR / CARTA DE PORTE"** en Pedidos, visible **solo si el cliente tiene la agencia "MOZO"** — oculto para el resto.
- Rellena, sobre el papel pre-impreso, las casillas oficiales del formulario CMR: remitente (datos fijos de Marinafisk), consignatario (cliente, con dirección repartida en varias líneas según longitud), lugar de entrega (fijo: "INSTALACIONES CUSTODIA - PORTUGAL"), lugar/fecha de carga (fijo: "A CORUÑA, ESPAÑA" + fecha del pedido), número de albarán, texto fijo "VER ALBARÁN ADJUNTO" + nº de cajas, peso bruto total, y lugar/fecha de formalización.
- Usa el mismo sistema de calibración en milímetros que ya existe para Transfrío (pantalla "MODELOS DE IMPRESIÓN" → editor visual X/Y por campo, "📐 Ver con regla", "↩️ Restaurar de fábrica") — las coordenadas se estimaron de una foto real y se fueron ajustando con impresiones de prueba.

**Requisitos para el sistema nuevo:**
- Misma visibilidad condicional: solo aparece si el cliente tiene asignado el transportista "MOZO" (o el campo equivalente de transportista/agencia que use el sistema nuevo).
- Los datos fijos (remitente, lugar de entrega en Portugal, lugar de carga en A Coruña) deben ser **constantes configurables del sistema**, no texto libre que haya que volver a escribir.
- El diseño debe permitir añadir nuevas plantillas de hoja de transporte (más clientes de Portugal, más transportistas con CMR propio) sin rehacer la lógica desde cero — algo como un "diccionario" transportista → plantilla de impresión.
- Mantener el mismo sistema de calibración manual en milímetros que Transfrío/CMR ya tienen — es una herramienta necesaria en la práctica (nunca se acierta a la primera sobre un papel pre-impreso real), no un capricho.

### 11.2 Catálogo de "Modelos de impresión" siempre actualizado

- El HTML tiene una pantalla "MODELOS DE IMPRESIÓN" que lista todo lo que el programa puede imprimir/generar, con su propósito y un ejemplo. Al añadir la Hoja CMR se detectó que esa pantalla no se había actualizado a la vez — el modelo nuevo funcionaba pero no aparecía documentado, lo que podría hacer pensar que no existe.

**Requisito para el sistema nuevo:** el equivalente a esta pantalla debe existir, y actualizarla debe ser **parte obligatoria del mismo cambio** cada vez que se añada un modelo de impresión nuevo — no una tarea aparte que se pueda olvidar. Si es posible, generar el catálogo automáticamente a partir de una lista central de modelos definidos en el código, en vez de mantenerlo a mano en dos sitios distintos (el catálogo y el código real) — eso es precisamente lo que causó el desajuste esta vez.

### 11.3 Matices añadidos por Víctor sobre correcciones ya documentadas (puntos 9-10)

- **Doble/triple grabación (punto 9):** Víctor pide explícitamente que la protección en el sistema nuevo sea **también a nivel de servidor** (que una petición de guardado ya en curso no permita otra idéntica en paralelo), no solo un botón deshabilitado en pantalla como hace hoy el HTML. **Resuelto (12/09/2026):** todas las rutas `POST` que crean un documento en `backend/` (clientes/proveedores/artículos/compras/partidas/pedidos/traspasos/repartos/listas de precio) exigen ya un `idempotencyKey`, con garantía real a nivel de base de datos (no solo en memoria) — ver Fase 1, criterios de cierre y `backend/README.md`.
- **Refresco automático al empezar el día (punto 9 bis):** con base de datos real, este problema desaparece de raíz (no hay "cachés" que refrescar). Víctor pide verificar explícitamente en la Fase 3 que dos sesiones abiertas a la vez, cada una desde su ordenador, vean siempre los mismos contadores y el mismo estado sin ningún refresco manual ni automático — porque no debería hacer falta.
- **Traspasos ≠ ventas en TODOS los listados, no solo en "Buscar Artículos"** (generaliza el punto 9): cualquier listado o informe que trate kilos/artículos debe separar claramente ventas reales de movimientos internos (traspasos) — un total económico (solo ventas) y un total de kilos "estadístico" que sume ambos, nunca mezclados en silencio. Ver Fase 2, nueva sección de listados de gestión.
- **Aviso de margen negativo, versión robusta** (mejora sobre el punto 9): el sistema nuevo, a diferencia del HTML actual, sí conoce el coste real de la partida asignada en todo momento — el aviso de venta por debajo de coste debe compararse contra ese coste real, no contra un campo de coste tecleado a mano (que puede estar mal o desactualizado). Ver Fase 2, partidas y margen.
- **Existencias en texto libre**, aplicar también en pantallas de partidas, no solo en listas de precio.

---

## 13. Correcciones de `CORRECCIONES_02-09-2026_para_Code_6.md` (13/09/2026)

Once puntos aplicados directamente al HTML actual, fuera del proyecto de migración. Ya resueltos en el backend nuevo (nada que hacer, solo constancia) / pendientes para cuando se construya la pantalla correspondiente:

- **Punto 1 (doble grabación por clic repetido)** — [x] resuelto en el backend desde el 12/09/2026, y de forma más robusta que el HTML (protección de servidor con `idempotencyKey` + `UNIQUE`, no solo el botón deshabilitado en pantalla — ver Fase 1 punto 5).
- **Punto 2 (refresco de cachés al empezar el día)** — ya recogido en el punto 11 de este documento; con base de datos real desaparece de raíz. Pendiente solo la verificación explícita en Fase 3 (dos sesiones a la vez, mismos contadores sin refresco).
- **Punto 3 (traspasos aparte en listados)** — [x] resuelto en el backend el 13/09/2026 (`GET /listados/gestion`, ver Fase 2 punto 6).
- **Punto 4 (aviso de margen negativo contra coste real)** — [x] backend resuelto el 13/09/2026 (`GET /listas-precio/coste-referencia`, ver Fase 2 punto 5); falta conectarlo a una pantalla.
- **Punto 5 (existencias en texto libre)** — [x] backend resuelto el 13/09/2026 (campo `existencias` de `ListaPrecioLinea`, ver Fase 2 punto 5); mismo criterio pendiente de aplicar también en la pantalla de partidas cuando exista.
- **Punto 6 (Hoja Transfrío también en Traspasos, destinatario fijo "MARINA FISH ZARAGOZA")** — pendiente, Fase 4 (interfaz/impresión). Nuevo: el destinatario de un traspaso es una entidad fija interna, nunca una búsqueda en el catálogo de Clientes.
- **Punto 7 (Hoja CMR/Carta de Porte para clientes con agencia "MOZO")** — pendiente, Fase 4. **Responde a la pregunta pendiente que teníamos anotada aquí** (verificación campo a campo de la Hoja CMR): casillas 1/2/3/4/5/6/11/21 del formulario CMR oficial, con datos fijos (remitente Marinafisk, entrega en Portugal, carga en A Coruña) como constantes del sistema, no texto libre repetido cada vez. Solo visible cuando el cliente tiene agencia "MOZO". Diseñar como un "diccionario" transportista→plantilla, para poder añadir otras plantillas CMR sin rehacer la lógica.
- **Punto 8 (catálogo de modelos de impresión siempre actualizado)** — pendiente, Fase 4. Mejor generado automáticamente desde una lista central de modelos en el código, no mantenido a mano en dos sitios (causa real de que se olvidara documentar la Hoja CMR al añadirla).
- **Punto 9 (imprimir en lote varios pedidos seleccionados)** — pendiente, Fase 4. Transversal a cualquier listado/historial: casillas de marcar + filtro como alternativa si no se marca nada; avisar cuántos documentos se van a generar antes de imprimir.
- **Punto 10 (copias por cliente dentro del PDF, no del diálogo de impresión; nunca abrir pestañas automáticamente)** — pendiente, Fase 4. Dos reglas de diseño para cuando se construya cualquier impresión en lote: (a) las copias por documento se repiten dentro del propio PDF generado, nunca vía la opción "copias" del navegador (repite el documento entero, no cada parte); (b) cualquier apertura de pestaña/ventana nueva en secuencia debe ser siempre respuesta directa a un clic ("un paso, un clic"), nunca automática tras una espera — el navegador bloquea en silencio las que no lo son.
- **Punto 11 (nombre/ciudad de destinatario de Reparto se duplicaba en cada ciclo abrir-grabar)** — pendiente para cuando se construya la pantalla de Repartos. Regla general de diseño: si se separa un dato combinado en varios campos, la reconstrucción debe ser siempre reversible sin duplicar ni perder nada; un caso no reconocido debe dejar el resto de campos vacíos, nunca copiar el texto completo en más de uno. Y en general: abrir un registro para editarlo (sin cambiar nada) y grabarlo debe dejarlo exactamente igual, nunca alterarlo por el simple hecho de abrirlo.

---

## 14. Pendiente de confirmar / decidir en el diseño nuevo

- [x] Tratamiento correcto del IVA en compras a proveedores extranjeros (ver punto 4) — resuelto: intracomunitario = sin IVA; no existen proveedores extracomunitarios, no hace falta tercer caso.
- [ ] Confirmar con Víctor si hay más proveedores o casos especiales de OP aparte de "subasta/lonja marcados como tal".
- [ ] Revisar si existen otras reglas de mermas/pérdida de peso además de la ya mencionada en cierre de partidas.
- [x] Pedir a Víctor la versión del HTML que ya tiene la Hoja CMR/Carta de Porte — recibido el 13/09/2026 como `CORRECCIONES_02-09-2026_para_Code_6.md` punto 7 (ver punto 13 de este documento); queda pendiente construirla en Fase 4, no verificarla de nuevo.

---

*Este documento se ha preparado a partir del historial de conversaciones de desarrollo del programa actual (chats "Gestión del backup de MARINAFISK" y "Arquitectura de importación de catálogo maestro"). Antes de empezar a programar el sistema nuevo, conviene que Víctor revise este documento y confirme o corrija cualquier punto.*
