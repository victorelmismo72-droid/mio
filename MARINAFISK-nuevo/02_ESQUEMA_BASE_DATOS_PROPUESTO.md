# MARINAFISK — Esquema de base de datos propuesto (borrador Fase 0)

Basado en:
- `FASE_0_reglas_de_negocio_MARINAFISK.md` (reglas de negocio confirmadas por Víctor)
- `FASE_4_facturacion_MARINAFISK.md` (facturas, pagos y facturación por lotes — reglas ya confirmadas por Víctor)
- Análisis del código real de `CARGA_DE_ALBARANES_MARINAFISK_20260902CORREGIDO_4.html`

Este documento es un borrador de discusión, no una migración definitiva. Objetivo: reproducir el comportamiento actual con una base de datos real (en vez de JSON sueltos en carpeta compartida), preservando las garantías ya conocidas (compras inmutables, contadores consistentes, fecha local, etc.).

---

## Convenciones generales

- Toda tabla de "documento" (compra, pedido, traspaso, reparto) lleva:
  - `id` interno (PK autoincremental de la BD)
  - `numero` (el correlativo de negocio visible al usuario, ej. nº de pedido/albarán)
  - `puesto_origen` (sustituye a `_uid`/etiqueta libre CORU/PANC — mejor como columna controlada que como texto libre)
  - `creado_en`, `modificado_en` (sustituyen a `_modTimestamp`)
- La sincronización entre puestos deja de ser "archivos JSON en carpeta de red" y pasa a ser la propia base de datos compartida (un único origen de verdad) — esto elimina de raíz la clase de fallos de sync descritos en el punto 6 del documento Fase 0 (contadores desincronizados, backups con caché, altas no propagadas). Los contadores (`numero`) se generan con secuencias/transacciones de la BD, no con contadores en localStorage.

---

## Tablas

### `clientes`
```
id, codigo (unique), nombre, cif, direccion, cp, poblacion, provincia,
telefono, email, forma_pago, agencia, tipo_iva (NORMAL|INTRACOMUNITARIO|RECARGO_EQUIVALENCIA),
formato_etiqueta, creado_en, modificado_en
```

### `proveedores`
```
id, codigo (unique), nombre, es_subasta_op (bool),  -- sustituye a op2:'S'/'N'
tipo_iva (NACIONAL|INTRACOMUNITARIO), notas, creado_en, modificado_en
```
`es_subasta_op` es el único campo que decide si se aplica el 2% de OP — debe consultarse en vivo en cada cálculo (nunca copiarse/congelarse en la compra), tal como exige la regla crítica del punto 2.

`tipo_iva` decide el tratamiento fiscal de las compras a ese proveedor (ver regla de IVA en `compra_lineas` más abajo). Análogo al `tipo_iva` que ya existe en `clientes`, pero aplicado al lado de compras en vez de ventas.

### `articulos` (catálogo)
```
id, codigo (unique), descripcion, tipo, pvp1, pvp2, iva_pct (default 10),
familia_prefijo,        -- para el emparejamiento C1300 -> C13004/C13006/C13008
primera_palabra_desc,   -- para evitar falsos positivos (C144 vs C1444)
cientifico, zona_fao, subzona, arte_pesca, barco, peso_etiqueta, calibre,
modo_presentacion, forma_obtencion, nombre_frances, nombre_italiano,
creado_en, modificado_en
```

### `compras` (cabecera — un albarán de proveedor)
```
id, numero_partida (NO unique — ver nota), fecha, albaran_proveedor, proveedor_id (FK),
proveedor_nombre_snapshot,   -- nombre del proveedor tal como estaba EN EL MOMENTO de la compra
total_kilos, total_base_zgz, total_base_real, total_iva, total_factura,
puesto_origen, creado_en
-- SIN modificado_en / SIN UPDATE permitido tras creación (ver más abajo)
```
**Corrección real (05/09/2026), leyendo `grabarCompra()` en el HTML actual:** `numero_partida` **NO es único por compra**. Una partida se comparte entre TODOS los albaranes de un mismo proveedor en un mismo día (`partidaParaCompra(fecha, proveedorCod, ...)` reutiliza el número si ya existe una compra con esa fecha+proveedor) — el número de albarán del proveedor no forma parte de esa clave. Es decir: **varias filas de `compras` pueden compartir el mismo `numero_partida`.** La primera versión de este documento asumía 1 compra = 1 partida, y era incorrecto; ver la tabla `partidas` corregida más abajo.
`proveedor_nombre_snapshot` es nuevo respecto a la primera versión: el HTML actual sí guarda `proveedorNombre` en cada compra (además del código), para que el nombre impreso no cambie si el proveedor se renombra después — mismo espíritu que "compras = dato sagrado".

### `compra_lineas`
```
id, compra_id (FK), articulo_id (FK), cajas, kilos, precio_kg,
base_zgz, base_zgz_con_iva, op2_importe, base_real, iva_importe, total_factura,
control (bool),
creado_en
```
**Corrección real:** el HTML actual guarda un campo adicional `baseZgzIva` (base de Zaragoza con IVA, antes de calcular el resto) que la primera versión de este documento no incluía — añadido como `base_zgz_con_iva`. `control` es un booleano (casilla de verificación manual sobre la línea), no estaba en la primera versión.
**Inmutabilidad**: `compras` y `compra_lineas` no permiten UPDATE ni DELETE a nivel de aplicación tras su creación (permiso de BD revocado o trigger que lo bloquee) — solo INSERT. Cualquier corrección se hace con un registro de ajuste enlazado, nunca sobrescribiendo. Esto sustituye a la garantía manual actual ("Compras = dato sagrado") por una garantía estructural.

`op2_importe` y `iva_importe` se calculan y **congelan en el momento de la compra** (son historial), pero el cálculo en sí (fórmula) debe ser código centralizado y testeado, no reimplementado en varios sitios — el fallo histórico de fórmula congelada vino de que el valor no se recalculaba nunca al vuelo, no de guardar el resultado.

**Regla de IVA en compras (decidida):**
```
iva_pct  = proveedor.tipo_iva == 'INTRACOMUNITARIO' ? 0 : 10
iva_importe = base_real * iva_pct / 100
total_factura = base_real + iva_importe
```
Proveedor intracomunitario (UE) → compra sin IVA, por inversión del sujeto pasivo (el IVA no lo paga el proveedor extranjero, se autorrepercute internamente en la contabilidad, fuera del alcance de este sistema). Proveedor nacional → 10% como siempre. Igual que en compras, `iva_pct` debe leerse en vivo del maestro de `proveedores` en el momento de la compra, nunca congelarse como fórmula fija en el código (misma regla crítica que el 2% de OP).

### `partidas` (cierre manual de un GRUPO de compras, no de una sola compra)
```
id, numero_partida (unique), cerrada_manual (bool), cerrada_en, cerrada_por, creado_en
```
**Corrección real (05/09/2026):** en el HTML actual **no existe una tabla "partidas" separada** — es un concepto derivado: varias filas de `compras` con el mismo `numero_partida` (mismo proveedor + mismo día) FORMAN una partida. Lo único que se persiste aparte es la lista de partidas cerradas manualmente (`localStorage['partidas_cerradas_manual']`). Por eso esta tabla ya no referencia `compra_id` (no tiene sentido 1:1, una partida puede agrupar varias compras) — referencia directamente `numero_partida`, y `kilos_disponibles`/coste se calculan siempre agregando todas las filas de `compras` que compartan ese `numero_partida` (vista calculada, Fase 2), nunca como columna. `cerrada_manual` sigue siendo el único estado real a persistir aquí.

### `pedidos` (albaranes de venta)
```
id, numero (unique), fecha, cliente_id (FK), tipo_iva_aplicado,
cliente_nombre_snapshot, cliente_cif_snapshot, cliente_dir_snapshot,
cliente_pob_snapshot, cliente_tel_snapshot, agencia, forma_pago,
base_imponible, iva, total, puesto_origen, creado_en, modificado_en
```
**Corrección real:** el HTML actual guarda una "foto" de los datos del cliente en cada pedido (`clienteNombre`, `clienteCif`, `clienteDir`, `clientePob`, `clienteTel`) además del código, más `agencia` y `formaPago` — ninguno de estos campos estaba en la primera versión de este documento. Mismo motivo que en compras: si el cliente cambia de dirección más adelante, el albarán ya impreso no debe cambiar retroactivamente.

### `pedido_lineas`
```
id, pedido_id (FK), articulo_id (FK), descripcion_editada, cantidad, peso,
precio, descuento, iva_pct, total, partida_numero (nullable, NO es FK a una tabla partidas)
```
**Corrección real:** el HTML actual guarda directamente el número de partida asignado a la línea (`l.partida`, vacío si no se ha asignado) — no hay un `estado_asignacion` con tres valores persistido; "pendiente de asignar" es simplemente `partida_numero IS NULL`. El aviso de margen insuficiente (⚠️ amarillo) es un cálculo en pantalla en el momento de escribir el precio, no algo que se guarde en la línea. La "pantalla de excepciones" sigue siendo una vista/filtro (`partida_numero IS NULL`) sobre esta misma tabla, no una estructura aparte.

### `traspasos`
```
id, numero (unique), fecha, total_kg, base, total, puesto_origen, creado_en
```
### `traspaso_lineas`
```
id, traspaso_id (FK), articulo_id (FK), cantidad, peso, partida_id (FK nullable)
```

### `repartos`
```
id, numero (unique), fecha, destinatario_nombre, destinatario_ciudad,
conductor, total_cajas, total_kg, puesto_origen, creado_en
```
### `reparto_lineas`
```
id, reparto_id (FK), articulo_id (FK), cantidad, peso
```

### `listas_precio`
```
id, tipo (MAYORISTA|PESCADERIA), fecha, modo (AUTO|MANUAL), creado_en
```
### `lista_precio_lineas`
```
id, lista_precio_id (FK), articulo_id (FK), precio
```
Con `UNIQUE(tipo, fecha)` por lista, y lógica de aplicación: si `modo=AUTO`, las líneas se generan/recalculan desde las compras del día; si `MANUAL`, entrada libre pero cada lista (mayorista/pescadería) guarda de forma independiente — sin pisarse entre sí, solo se copian como plantilla inicial la primera vez que una lista está vacía en el día.

**Hallazgo real (05/09/2026):** hoy, la lista manual **no se sincroniza entre puestos ni se incluye en el backup** — se guarda solo en `localStorage` de cada ordenador (`borradorTablaPreciosManual_mayoristas` / `_pescaderias`, un borrador por tipo y por día, con campos `desc, precio, coste, existencias`), a diferencia de clientes/artículos/proveedores/compras/pedidos/traspasos/repartos, que sí se sincronizan vía carpeta compartida (el propio código solo refresca esas siete cachés, sin mencionar listas de precio). Guardar esto en la base de datos compartida es, por tanto, **una mejora deliberada respecto al comportamiento actual** (hoy, si se pierde el ordenador, se pierde la lista del día) — no un simple traslado 1:1 de lo que ya existía. Señalado aquí para que quede explícito, no asumido en silencio.

---

### `facturas`
```
id, numero (unique dentro de su serie), serie (NORMAL|RECTIFICATIVA),
cliente_id (FK), fecha_emision, fecha_desde, fecha_hasta,
tipo_iva_aplicado, base_imponible, iva, recargo_equivalencia, total,
factura_original_id (FK nullable, solo si serie=RECTIFICATIVA),
motivo_rectificacion (nullable, solo si serie=RECTIFICATIVA),
fecha_vencimiento, forma_pago, lote_id (nullable, agrupa las facturas generadas juntas en una misma tanda por lotes),
puesto_origen, creado_en
-- SIN modificado_en / SIN UPDATE permitido tras creación (mismo criterio que `compras`, ver Fase 0 punto 3 y Fase 4 punto 1)
```
Basado en `FASE_4_facturacion_MARINAFISK.md`. Dos series de numeración independientes y correlativas (NORMAL / RECTIFICATIVA), cada una consistente entre puestos con el mismo mecanismo de secuencias/transacciones de BD ya descrito en "Convenciones generales" para `numero_partida`/pedidos — un contador de facturas desincronizado sería tan grave como el ya conocido para pedidos (Fase 0 punto 6).
Una factura RECTIFICATIVA siempre referencia su `factura_original_id` y no se puede crear si esa factura no existe. `fecha_desde`/`fecha_hasta` es el rango de fechas de albaranes que cubre (elegido libremente cada vez, sin periodicidad fija — Fase 4 punto 1). `lote_id` es opcional y solo sirve para poder ver juntas, después, las facturas que se generaron en una misma ejecución de facturación por lotes (Fase 4 punto 2) — no cambia ninguna regla de la factura en sí.

**Estado de cobro — no es una columna, es un valor calculado** (mismo criterio que `partidas.kilos_disponibles`, ver más abajo): `PENDIENTE` si no hay pagos, `PARCIAL` si `SUM(pagos_factura.importe) < total`, `COBRADA` si `SUM(pagos_factura.importe) >= total`, y `VENCIDA` si además `fecha_vencimiento < hoy` y no está `COBRADA`. Así nunca puede quedar "marcada a mano" sin que cuadre el importe (Fase 4 punto 5).

### `factura_pedidos`
```
id, factura_id (FK), pedido_id (FK, UNIQUE)
```
Tabla de vínculo entre una factura y los albaranes (pedidos) que agrupa. El `UNIQUE` en `pedido_id` es lo que garantiza a nivel de base de datos que **un mismo albarán no puede quedar incluido en dos facturas** (Fase 4 punto 1) — no basta con controlarlo solo en el código de la aplicación.
**No existe una tabla `factura_lineas` separada**: las líneas de la factura (en modo detalle o en modo resumen por albarán) se derivan siempre de `pedido_lineas` a través de `factura_pedidos → pedidos → pedido_lineas`, igual que `partidas` se modela como vista sobre `compras` para no duplicar la fuente de verdad. El formato detalle/resumen (Fase 4 punto 6) es una consulta distinta sobre los mismos datos, no dos formas distintas de guardarlos.
**Bloqueo tras facturar**: una vez que un `pedido` aparece en `factura_pedidos`, ese pedido y sus `pedido_lineas` pasan a ser inmutables (mismo mecanismo que `compras`) — si se pudiera seguir editando un albarán ya facturado, la factura impresa dejaría de coincidir con lo que se cobró.

### `pagos_factura`
```
id, factura_id (FK), fecha, importe, forma_pago, notas, creado_en
```
Un pago parcial o total contra una factura (Fase 4 punto 5). Se permite más de un pago por factura. Solo INSERT — un pago registrado por error no se borra, se corrige con un pago negativo/de ajuste explícito, para mantener el mismo historial fiable que exige la regla de "dato sagrado".

---

## Puntos abiertos que este esquema no resuelve todavía (dependen de respuestas de Víctor)

1. ~~IVA en compras a proveedor extranjero~~ — **Resuelto (2026-08-24):** proveedor intracomunitario (UE) → compra sin IVA (inversión del sujeto pasivo). Añadido `tipo_iva` a `proveedores` y regla explícita en `compra_lineas`. Confirmado por Víctor: los proveedores solo son **NACIONAL** o **INTRACOMUNITARIO** — no existen proveedores extracomunitarios, así que `tipo_iva` no necesita un tercer valor.
2. Si existen más casos especiales de OP aparte de "subasta/lonja marcados como tal" (punto 9 del documento Fase 0).
3. Reglas de mermas/pérdida de peso más allá del cierre de partidas.
4. `traspasos`/`traspaso_lineas` y `repartos`/`reparto_lineas` se han revisado por encima (localizados en `historialTrp` y `repartos` del código), pero no se ha hecho todavía la misma verificación campo a campo que sí se hizo para `compras`/`compra_lineas` y `pedidos`/`pedido_lineas` el 05/09/2026 — pendiente antes de dar el esquema por definitivo.
5. Los proveedores de hoy **no tienen ningún campo de tipo de IVA** en los datos reales (`tipo_iva` es un campo nuevo, ver punto 1) — al migrar el backup real, cada proveedor existente tendrá que clasificarse manualmente como NACIONAL o INTRACOMUNITARIO; no se puede deducir del JSON porque esa distinción no existía hasta ahora.

---

*Borrador para revisión de Víctor antes de crear las migraciones reales.*
