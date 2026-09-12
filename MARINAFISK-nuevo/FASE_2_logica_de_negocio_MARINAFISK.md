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

## 2. Asignación automática del número de partida — implementado el 12/09/2026

Regla confirmada por Víctor (12/09/2026): el número de partida se genera **automáticamente**, igual que en el Excel — una partida por día+proveedor, independientemente de cuántas compras (albaranes) distintas de ese proveedor se registren ese día. Existe una excepción real y poco frecuente: por necesidades de producción, a veces hace falta una partida distinta para el mismo proveedor el mismo día.

**Diseño implementado en `backend/`:**

- La tabla `partidas` (ver `02_ESQUEMA_BASE_DATOS_PROPUESTO.md`) es ahora el **registro canónico** de qué números de partida existen, con `fecha`, `proveedor_id` y un campo `es_principal`.
- **Caso normal**: al grabar una compra, el servidor busca si ya existe una partida `es_principal=true` para ese día+proveedor. Si existe, la reutiliza. Si no, crea una — el número lo genera una secuencia de PostgreSQL (`partidas_numero_partida_seq`), nunca lo escribe el cliente.
- **Caso de excepción**: se puede pedir explícitamente (`partidaNueva: true` en la petición) una partida **nueva y distinta** para ese mismo día+proveedor (`es_principal=false`). Nunca se sugiere sola — solo se usa cuando se pide a propósito, compra a compra.
- Si ya hay más de una partida para un día+proveedor (por una excepción anterior), se puede elegir explícitamente a cuál va una compra nueva (`partidaElegida: <número>`) — endpoint `GET /compras/partidas-del-dia?fecha=...&proveedorId=...` para listarlas (la principal siempre primero).
- **Concurrencia (el mismo tipo de fallo que ya causó 667 duplicados en pedidos, ver Fase 0 punto 6):** un índice único **parcial** en PostgreSQL (`UNIQUE(fecha, proveedor_id) WHERE es_principal`) garantiza que nunca pueda haber dos partidas principales para el mismo día+proveedor, **incluso si los dos puestos intentan crear la primera compra del día para el mismo proveedor exactamente a la vez** — probado en real con dos peticiones disparadas literalmente en paralelo: ambas obtienen el mismo número de partida.
- El botón "🔢 Próxima partida" del HTML actual (ajustar el contador para sincronizar con el Excel) tiene su equivalente en `POST /partidas/ajustar-siguiente-numero`.
- La importación de Excel (que trae el número de partida ya dado, sin recalcularlo — ver `backend/README.md`) registra igualmente cada número en esta tabla; si el propio histórico del Excel ya tenía una excepción (dos partidas distintas el mismo día para el mismo proveedor), la segunda se registra automáticamente como excepción (`es_principal=false`) en vez de fallar.

Ver `backend/src/asignacionPartida.js` para la implementación y `backend/src/routes/compras.js` para cómo se usa al grabar una compra.

---

## 3. IVA y Recargo de Equivalencia (usa la clasificación fiscal creada en Fase 1)

**Corrección (2026-09-05):** el párrafo original de este punto decía que "el IVA es lógica nueva que no existe correctamente en el sistema actual" y citaba el fallo de Fase 0 punto 4 — eso era impreciso. El fallo de Fase 0 punto 4 es solo del lado de **compras** (proveedores). El lado de **ventas** ya funciona en el HTML actual: la función `calcularIvaPedido(base, tipoIva)` calcula correctamente IVA 10% (NORMAL), IVA 10%+1,4% (RECARGO_EQUIVALENCIA) e IVA 0% (INTRACOMUNITARIO) según el tipo fiscal del cliente, y se usa ya en pedidos, PDFs y (desde la versión 2026-09-02-CORREGIDO_4) también en el Excel de listado. El sistema nuevo debe **reproducir ese cálculo tal cual**, no rediseñarlo desde cero.
Lo que sí falta de verdad es el lado de compras:

- **Compras:**
  - Proveedor Nacional → IVA 10% (tipo único del pescado, ver Fase 0).
  - Proveedor Intracomunitario → sin IVA, por inversión del sujeto pasivo — **este es el hueco real**: el HTML actual aplica 10% siempre en el cálculo de líneas de compra, sin mirar el tipo de proveedor (ver Fase 0, punto 4). El sistema nuevo debe corregirlo aquí, no reproducir el fallo.
- **Ventas** (ya funciona en el HTML, replicar el mismo comportamiento):
  - Cliente Nacional sin Recargo de Equivalencia → IVA 10% normal.
  - Cliente Nacional con Recargo de Equivalencia → IVA 10% + 1,4% de recargo de equivalencia.
  - Cliente Intracomunitario → IVA 0%.
- Documentar en el código, con comentarios claros en español, qué regla se aplica y por qué, para que Víctor pueda entenderlo sin ser programador.

---

## 4. Partidas y margen

- Reproducir la asignación automática inline: al introducir producto + precio, buscar partida disponible compatible.
- Emparejamiento de partida: coincidencia de prefijo (4+ caracteres) **y** primera palabra de la descripción del catálogo — no usar solo el prefijo (ver Fase 0, punto 3, falsos positivos conocidos como C144/C1444).
- Margen mínimo de referencia: **1,30 €/kg**. Si no se alcanza con ninguna partida disponible, marcar la línea como excepción para revisión manual (no bloquear ni auto-resolver).
- Cierre de partidas: manual, con opción de cierre masivo por fecha; una partida puede cerrarse sin llegar a cero kilos (mermas).
- **Las partidas nunca deben mostrarse en documentos de cliente** — solo en la versión interna con precios.
- Compras siguen siendo inmutables (ver Fase 1) — el cálculo de margen se hace leyendo la compra original, nunca modificándola.
- **Existencias en texto libre también aquí** (no solo en listas de precio, ver Fase 0 punto 9): el campo de existencias/stock asociado a una partida debe admitir texto ("AGOTADO", "POCAS") además de un número exacto de cajas — mismo motivo, indicar disponibilidad aproximada sin forzar una cifra.

---

## 5. Listas de precios (Pescaderías / Mayoristas)

- Confirmar que la lógica de independencia entre listas (cada una autónoma, copia de arranque opcional desde la otra si está vacía) se traslada igual que en el HTML actual (ver Fase 0, punto 5).
- Modo automático (relleno desde compras del día) y modo manual (entrada libre), igual que hoy.
- La versión interna (con coste, margen real, existencias en cajas) debe seguir estando claramente separada de la versión de cliente, y nunca mezclarse.
- **Aviso de venta por debajo de coste — versión robusta (petición de Víctor, `CORRECCIONES_02-09-2026_para_Code.md` punto 4; ver Fase 0 punto 11.3):** el HTML actual compara el precio tecleado contra un campo de "coste" **también tecleado a mano** en esa misma pantalla — puede estar mal o desactualizado. El sistema nuevo, en cambio, **conoce el coste real de la partida asignada** en todo momento (viene de la compra original, inmutable). El aviso de margen negativo debe compararse contra ese coste real siempre que la línea tenga una partida asignada, no contra una cifra escrita a mano — más fiable que el HTML, no solo igual. Mismo tipo de aviso ya decidido (visual en rojo + confirmación explícita antes de generar la imagen), ver Fase 0 punto 9.

---

## 6. Listados de gestión: separar siempre venta real de movimiento interno

**Añadido a partir de `CORRECCIONES_02-09-2026_para_Code.md` punto 3 (Víctor), generalizando lo ya corregido en el HTML actual para el buscador "Buscar Artículos" (ver Fase 0 punto 9):**

- Los traspasos internos a Zaragoza **no son ventas** (no hay cliente, no hay cobro) — un traspaso y un pedido son conceptualmente distintos, aunque ambos muevan kilos de pescado.
- Regla para **cualquier** listado o informe de esta fase que trate kilos/artículos/importes (no solo el buscador de artículos ya corregido en el HTML): por defecto, mostrar y sumar solo ventas reales. Ofrecer, como opción explícita (nunca activada por defecto), incluir también los traspasos — y si se incluyen, deben verse claramente diferenciados en la lista (nunca mezclados en la misma fila/categoría que una venta) y con un total aparte: un total económico (solo ventas) y un total de kilos "estadístico" que sume ventas + traspasos.
- Esto aplica a cualquier listado de gestión que se construya en esta fase o más adelante (por ejemplo, listados por cliente/artículo/fecha, exports para contabilidad, etc.) — no es una regla de una sola pantalla.

---

## 7. Requisito transversal de agilidad (recordatorio, ya introducido en Fase 1)

Sigue aplicando aquí: cada flujo de esta fase (registrar compra, asignar partida, generar lista de precios) debe probarse comparando el número de pasos/tiempo frente al Excel `GESTION_CORRECTA` actual. Si algún flujo nuevo resulta más lento o más tedioso que el Excel o que el HTML actual, se considera un defecto de esta fase, no un detalle menor.

---

## 8. Verificación de esta fase

No pasar a la Fase 3 hasta que:

- [ ] Se ha tomado un conjunto de datos reales (un día completo de compras y ventas, por ejemplo) y se ha comparado el resultado del sistema nuevo contra el HTML actual: mismo coste real, mismas partidas asignadas, mismo margen.
- [ ] El tratamiento de IVA/Recargo de Equivalencia está implementado y documentado para las cuatro clasificaciones fiscales de proveedores y las combinaciones de clientes — con las dudas normativas señaladas explícitamente a Víctor, no asumidas.
- [ ] El caso conocido de falsos positivos en emparejamiento de partidas (ej. C144 vs C1444) se ha probado explícitamente y no reaparece.
- [ ] Las partidas no aparecen en ningún documento de cliente generado por el sistema nuevo.
- [ ] El aviso de margen negativo compara contra el coste real de la partida asignada, no contra un coste tecleado a mano (ver punto 5).
- [ ] Todo listado de gestión de esta fase separa ventas reales de traspasos por defecto, con la opción de incluirlos aparte y diferenciados (ver punto 6).
- [ ] Comparación de agilidad frente al Excel realizada y documentada (ver punto 7).
- [x] Asignación automática del número de partida implementada y probada, incluyendo la excepción manual y la concurrencia entre puestos (ver punto 2).
- [ ] El HTML/programa actual sigue intacto y en uso normal, en paralelo.
- [ ] Víctor ha revisado y entendido, en términos sencillos, qué se ha construido y qué puntos quedaron pendientes de confirmación normativa (IVA).

---

*Preparado como continuación de FASE_0_reglas_de_negocio_MARINAFISK.md y FASE_1_base_de_datos_backend_MARINAFISK.md, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
