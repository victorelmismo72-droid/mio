# MARINAFISK — Fase 2: Lógica de negocio

Este documento se entrega junto con `FASE_0_reglas_de_negocio_MARINAFISK.md` y `FASE_1_base_de_datos_backend_MARINAFISK.md`, que Claude Code ya ha implementado.

**Instrucción para Claude Code:** antes de escribir nada, revisa el estado real de la Fase 1 (tablas creadas, backend existente, resultado de la verificación de migración) y los dos documentos anteriores. Esta fase construye la lógica de negocio SOBRE la base de datos ya creada — no se cambia el esquema salvo que sea estrictamente necesario, y si hace falta cambiarlo, debe documentarse por qué y volver a verificarse la migración.

---

## Objetivo de esta fase

Trasladar al backend nuevo toda la lógica de negocio que hoy vive dentro del HTML, para que el sistema nuevo calcule exactamente lo mismo que el actual (ni más ni menos), probándolo en paralelo con datos reales sin apagar el programa actual todavía.

Al final de la Fase 2 debe poder demostrarse que, dado el mismo dato de entrada, el sistema nuevo y el HTML actual producen el mismo resultado en: coste real de compra, asignación de partidas, margen, e IVA/recargo aplicado.

---

## 1. Cálculo del 2% de OP (Obras del Puerto)

- Se aplica **solo** a compras de proveedores marcados como subasta/lonja (campo ya creado en Fase 1).
- Fórmula: `baseReal = baseZgz + op2`
- **Debe calcularse siempre en vivo**, consultando el estado actual del proveedor en el momento del cálculo — nunca guardar el 2% como valor fijo/congelado en la compra. (Ver Fase 0, punto 2: esto ya causó un fallo real por congelarse la fórmula.)
- Probar explícitamente: cambiar la condición de "subasta/lonja" de un proveedor y confirmar que las compras futuras (no las pasadas, que son inmutables) reflejan el cambio.

---

## 2. IVA y Recargo de Equivalencia (usa la clasificación fiscal creada en Fase 1)

Esto es lógica nueva que no existe correctamente en el sistema actual — hay que construirla bien desde cero, no copiar el comportamiento actual tal cual, porque el HTML tiene un fallo conocido aquí (ver Fase 0, punto 4).

- **Compras:**
  - Proveedor Nacional → IVA 10% (tipo único del pescado, ver Fase 0).
  - Proveedor Comunitario / Intracomunitario / Extra-UE → **decidir explícitamente el tratamiento correcto** (por ejemplo, inversión del sujeto pasivo en operaciones intracomunitarias) y no dejarlo en blanco/sin aplicar como hace el sistema actual. Si hay dudas normativas, señalarlo a Víctor antes de dar la fase por cerrada — no asumir.
- **Ventas (para cuando exista el módulo de facturación, pero la lógica debe quedar lista ya):**
  - Cliente Nacional sin Recargo de Equivalencia → IVA 10% normal.
  - Cliente Nacional con Recargo de Equivalencia → IVA 10% + recargo de equivalencia correspondiente (confirmar porcentaje exacto vigente).
  - Cliente Intracomunitario → tratamiento de operación intracomunitaria (a confirmar con Víctor/asesoría si hace falta).
- Documentar en el código, con comentarios claros en español, qué regla se aplica y por qué, para que Víctor pueda entenderlo sin ser programador.

---

## 3. Partidas y margen

- Reproducir la asignación automática inline: al introducir producto + precio, buscar partida disponible compatible.
- Emparejamiento de partida: coincidencia de prefijo (4+ caracteres) **y** primera palabra de la descripción del catálogo — no usar solo el prefijo (ver Fase 0, punto 3, falsos positivos conocidos como C144/C1444).
- Margen mínimo de referencia: **1,30 €/kg**. Si no se alcanza con ninguna partida disponible, marcar la línea como excepción para revisión manual (no bloquear ni auto-resolver).
- Cierre de partidas: manual, con opción de cierre masivo por fecha; una partida puede cerrarse sin llegar a cero kilos (mermas).
- **Las partidas nunca deben mostrarse en documentos de cliente** — solo en la versión interna con precios.
- Compras siguen siendo inmutables (ver Fase 1) — el cálculo de margen se hace leyendo la compra original, nunca modificándola.

---

## 4. Listas de precios (Pescaderías / Mayoristas)

- Confirmar que la lógica de independencia entre listas (cada una autónoma, copia de arranque opcional desde la otra si está vacía) se traslada igual que en el HTML actual (ver Fase 0, punto 5).
- Modo automático (relleno desde compras del día) y modo manual (entrada libre), igual que hoy.
- La versión interna (con coste, margen real, existencias en cajas) debe seguir estando claramente separada de la versión de cliente, y nunca mezclarse.

---

## 5bis. Listados de gestión: separar ventas reales de traspasos internos

Ver `CORRECCIONES_2026-09-02_HTML_actual_MARINAFISK.md` (punto 3) para el caso concreto que motivó esto.

- Cualquier listado/informe de ventas o movimientos por artículo y fecha debe, por defecto, mostrar solo ventas reales (nunca mezclar traspasos internos a Zaragoza silenciosamente).
- Debe existir la opción de incluir también los traspasos internos, siempre como categoría aparte y claramente diferenciada (no como fila de venta más).
- Cuando se incluyen, los totales se presentan en tres líneas separadas: ventas reales (kg + importe), traspasado a Zaragoza (solo kg, sin precio/importe porque no es venta), y total de pescado movido (suma de ambos, solo para estadística de volumen).
- Este criterio (separar venta real de movimiento interno) se aplica a todo listado o informe de kilos/artículos, no solo a un buscador concreto.

## 5ter. Aviso de precio de venta por debajo del coste, y existencias en texto libre

Ver `CORRECCIONES_2026-09-02_HTML_actual_MARINAFISK.md` (puntos 4 y 5).

- En listas de precios (y en cualquier pantalla donde se introduzca manualmente un precio de venta), comparar en vivo contra el coste real de la partida asignada — el sistema nuevo conoce ese coste siempre, a diferencia del HTML actual que dependía de que Víctor lo tecleara bien — y avisar de forma clara si el precio queda por debajo del coste, antes de confirmar/generar el documento final.
- El campo de existencias/stock debe admitir texto libre además de cantidades numéricas exactas (ej. "AGOTADO", "POCAS"), para indicar disponibilidad aproximada sin forzar un número.

## 5quater. Guardado protegido contra doble grabación (a nivel de servidor)

Ver `CORRECCIONES_2026-09-02_HTML_actual_MARINAFISK.md` (punto 1). Cualquier operación de guardado (pedidos, repartos, traspasos, compras, partidas, listas de precios) debe impedir que una segunda petición idéntica mientras la primera sigue en curso cree un registro duplicado — la protección debe vivir en el backend (rechazar/ignorar una grabación concurrente para el mismo origen), no solo en el botón de la pantalla.

---

## 6. Requisitos ya identificados para cuando se desarrolle la Fase 4 (interfaz)

Estos puntos no se implementan en esta fase, pero deben tenerse en cuenta al escribir el documento de Fase 4 (interfaz), para no perderlos: hoja Transfrío también en Traspasos (con destinatario fijo "MARINA FISH ZARAGOZA", sin depender del catálogo de Clientes), hoja CMR/Carta de Porte para clientes con agencia "MOZO" (visible solo condicionalmente, con datos fijos configurables y diseño extensible tipo "transportista → plantilla"), sistema de calibración manual en milímetros para hojas sobre papel pre-impreso, y una pantalla de catálogo de modelos de impresión que idealmente se genere a partir de una lista central en el código en vez de mantenerse a mano en dos sitios. Ver `CORRECCIONES_2026-09-02_HTML_actual_MARINAFISK.md` (puntos 6, 7 y 8) para el detalle completo.

---

## 7. Requisito transversal de agilidad (recordatorio, ya introducido en Fase 1)

Sigue aplicando aquí: cada flujo de esta fase (registrar compra, asignar partida, generar lista de precios) debe probarse comparando el número de pasos/tiempo frente al Excel `GESTION_CORRECTA` actual. Si algún flujo nuevo resulta más lento o más tedioso que el Excel o que el HTML actual, se considera un defecto de esta fase, no un detalle menor.

---

## 8. Verificación de esta fase

Ver `VERIFICACION_FASE2_2026-09-14.md` para el detalle completo y reproducible (script `backend/scripts/verificar_fase2.js`).

No pasar a la Fase 3 hasta que:

- [x] Se ha recalculado el 2% de OP y el IVA con la nueva lógica contra las **1108 compras reales migradas** (2990 líneas): 0 diferencias. El caso IVA intracomunitario se ha demostrado con un proveedor de prueba, porque en los datos reales todavía no hay ninguno marcado como tal (todos entraron como NACIONAL en la migración, ver Fase 0 punto 4 — pendiente de que Víctor revise y marque los que correspondan). La asignación de partida y el cálculo de margen se han probado con partidas reales con kilos disponibles, no con un día completo lado a lado (ver más abajo lo que falta).
- [x] IVA/Recargo de Equivalencia implementado y probado para los tres tipos de cliente (NORMAL, RECARGO_EQUIVALENCIA, INTRACOMUNITARIO) y los dos tipos de proveedor (NACIONAL, INTRACOMUNITARIO) — la redacción original de este punto hablaba de "cuatro clasificaciones fiscales de proveedores", pero Fase 0 ya había resuelto que solo existen dos (NACIONAL/INTRACOMUNITARIO), no cuatro. **Duda normativa señalada a Víctor, no asumida:** el 1,4% de recargo de equivalencia (vigente en España desde 2012 para productos al 10%) debe confirmarlo su asesoría fiscal antes de facturar con él de verdad.
- [x] El caso conocido de falsos positivos en emparejamiento de partidas se ha probado explícitamente y no reaparece — **corrección**: el ejemplo citado en este documento como "C144 vs C1444" no es el caso real; el comentario del propio código fuente del HTML actual cita explícitamente **C255 "CABRAS/GALLINETA" vs C2550 "CABRACHO/ESCARAPOTE"** como el falso positivo conocido, y es ese caso real el que se ha probado (con las descripciones reales del catálogo migrado) y no reaparece. También se ha probado un caso positivo real (C1300 vs C13004, variante de talla) para confirmar que la familia sigue reconociéndose cuando sí toca.
- [ ] Las partidas no aparecen en ningún documento de cliente generado por el sistema nuevo — **pendiente de verificar de verdad**: todavía no existe ningún generador de documentos de cliente (albaranes, etc.) en el sistema nuevo, eso es Fase 4. La API interna sí puede devolver `numero_partida` en las respuestas (es información de gestión, no un documento de cliente).
- [x] Los listados de ventas/movimientos por artículo separan ventas reales de traspasos internos según el punto 5bis — construido el 18/09/2026 (`GET /api/listados/ventas-articulo` + pantalla "Listados de gestión"), como parte de Fase 4 Nivel 2. Probado con datos y navegador reales: por defecto solo ventas; con "incluir traspasos" marcado, los traspasos aparecen como filas aparte (gris/cursiva, sin importe) y se calculan los tres totales pedidos (ventas reales, traspasado a Zaragoza, total movido). Ver `VERIFICACION_LISTADOS_GESTION_2026-09-18.md`.
- [x] El aviso de precio por debajo de coste (punto 5ter) tiene ya la pieza de backend que necesita: `GET /api/articulos/:id/coste-referencia` devuelve el coste real de la partida que se usaría ahora mismo, probado contra datos reales. La comparación en vivo mientras se teclea es cosa de la pantalla (Fase 4). El campo de existencias en listas de precio ya admite texto libre desde la Fase 1 (columna `existencias` de tipo texto).
- [x] Ninguna operación de guardado permite crear un registro duplicado por una segunda petición mientras la primera sigue en curso (punto 5quater) — verificado en Fase 1 con una carrera real de peticiones simultáneas; sigue aplicando igual en Fase 2 (no se ha tocado ese mecanismo).
- [ ] Comparación de agilidad frente al Excel realizada y documentada (ver punto 7) — pendiente: necesita una pantalla real (Fase 4) para poder cronometrar pasos, no se puede hacer solo con la API.
- [x] El HTML/programa actual sigue intacto y en uso normal, en paralelo — no se ha tocado.
- [ ] Víctor ha revisado y entendido, en términos sencillos, qué se ha construido y qué puntos quedaron pendientes de confirmación normativa (IVA) — pendiente de que Víctor lo revise.

**Nota importante sobre una diferencia deliberada frente al HTML actual, descubierta al leer el código fuente real** (no un fallo de esta fase, sino una decisión ya pedida por FASE_0 punto 2): el margen de partida se calcula aquí con `base_real` (incluye el 2% de OP), mientras que la función equivalente del HTML actual (`obtenerPartidasDisponibles`) usa el precio de compra en bruto para ese cálculo concreto. FASE_0 pide explícitamente que el 2% de OP esté incluido en el coste, así que el sistema nuevo lo hace bien aunque eso signifique que el margen mostrado no sea *literalmente* idéntico byte a byte al del HTML actual para partidas de subasta — es una mejora ya encargada, no una discrepancia sin explicar.

**Nota sobre la asignación automática:** se ha reproducido fielmente el comportamiento de `construirCeldaPartida()` (la asignación mientras se teclea, la que pide FASE_0 punto 3): si ninguna partida llega al margen mínimo, no se asigna nada automáticamente, se avisa y se deja a mano. El HTML actual tiene además una función aparte, `autoAsignarPartidas()` (acción explícita de "asignar todo lo pendiente del pedido"), que si nadie llega al margen cae a la partida más antigua igualmente — esa función masiva no se ha reproducido todavía en esta fase; queda pendiente si Víctor la necesita.

---

*Preparado como continuación de FASE_0_reglas_de_negocio_MARINAFISK.md y FASE_1_base_de_datos_backend_MARINAFISK.md, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
