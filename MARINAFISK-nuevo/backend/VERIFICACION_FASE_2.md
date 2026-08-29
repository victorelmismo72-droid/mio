# MARINAFISK — Fase 2: lógica de negocio (estado y verificación)

Construido sobre la Fase 1 ya verificada (`VERIFICACION_FASE_1.md`). No se ha tocado el esquema de datos salvo añadir `partidas_cerradas` (cierre manual de partidas, ver Fase 0 punto 3) — el resto de tablas sigue igual.

## 1. Cálculo del 2% de OP y del IVA en compras (`src/negocio/calculoCompras.js`)

Fórmula reproducida exactamente del HTML actual (`calcLineaCompra`, línea ~10528):
```
baseZgz = kilos * precioKg
op2     = proveedor.es_subasta_op ? baseZgz * 0.02 : 0
baseReal = baseZgz + op2
```
**Corrección del fallo conocido (Fase 0 punto 4):** el HTML actual aplica siempre `iva = baseReal * 0.10`, sin mirar si el proveedor es intracomunitario. Aquí:
```
ivaPct = proveedor.tipo_iva === 'INTRACOMUNITARIO' ? 0 : 10
iva    = baseReal * ivaPct / 100
```
El proveedor se lee de la base de datos en el mismo instante de crear la compra (`POST /api/compras`) — nunca se confía en un valor de op2/iva que venga ya calculado desde fuera. Probado explícitamente:

| Proveedor de prueba | Subasta | Tipo IVA | baseZgz | op2 | baseReal | iva | totalFact |
|---|---|---|---|---|---|---|---|
| Nacional, subasta | Sí | NACIONAL | 400 | 8 | 408 | 40,80 | 448,80 |
| Intracomunitario, subasta | Sí | INTRACOMUNITARIO | 400 | 8 | 408 | 0 | 408 |

Mismo `kilos`/`precioKg` de entrada (100 kg × 4 €/kg) en ambos casos: el 2% de OP se aplica igual (depende solo de si es subasta), y el IVA cambia correctamente según la clasificación fiscal — que es exactamente el comportamiento que pedía Víctor y que el HTML actual no tenía.

## 2. IVA y Recargo de Equivalencia en ventas (`src/negocio/calculoVentas.js`)

Lógica lista para el futuro módulo de facturación (no se usa todavía en ningún documento real, el HTML actual no factura).

**Resuelto (26/08/2026):** Víctor ha confirmado que el % de Recargo de Equivalencia no debe estar fijo en el código — debe ser "el porcentaje que queramos". Ahora vive en la tabla `configuracion` (clave `recargo_equivalencia_pct`, arranca en 1,4% pero es editable vía `GET/PUT /api/configuracion`) y se lee en vivo en cada cálculo, igual que el 2% de OP.

Sigue pendiente, no urgente porque la facturación todavía no existe: el tratamiento de cliente Intracomunitario como entrega exenta (0%) es un supuesto razonable, no una confirmación de Víctor/asesoría.

## 3. Partidas y margen (`src/negocio/partidas.js`)

**Corrección importante (encontrada por Víctor probando la Fase 4, 29/08/2026):** la asignación del número de partida al registrar una compra (`POST /api/compras`, en `src/routes/compras.js`) no reproducía una regla que el HTML actual sí tiene (función `partidaParaCompra`): la partida se comparte entre **todas** las compras del **mismo proveedor** en la **misma fecha**, aunque entre medias se hayan cargado compras de otros proveedores, y sin que importe el número de albarán del proveedor (ese dato se guarda igual, pero no decide la partida). Corregido: antes de generar una partida nueva, se comprueba si ya existe una compra con la misma `fecha` + `proveedor_codigo`; si la hay, se reutiliza su número de partida.

Probado explícitamente con datos reales: compra a COPESA (día X) → partida A; compra a otro proveedor (mismo día X) → partida B (nueva); segunda compra a COPESA (mismo día X, albarán del proveedor distinto) → reutiliza la partida A; compra a COPESA al día siguiente → partida C (nueva). Coincide exactamente con el comportamiento del HTML actual.

Reproduce además el resto del algoritmo exacto del HTML actual:
- **Emparejamiento de familia de producto**: mismo código, o código corto (≥4 caracteres) que es el principio del código largo **y además** coincide la primera palabra de la descripción del catálogo — evita el falso positivo conocido (C144 vs C1444, ver Fase 0 punto 3).
- **Kilos disponibles por partida**: comprados − vendidos (pedidos) − traspasados (traspasos cuentan como salida de kilos igual que una venta, aunque no sean fiscalmente una venta).
- **Margen mínimo 1,30 €/kg**: si ninguna partida disponible llega al margen frente al precio de venta, se marca `PENDIENTE_MANUAL` con la lista de candidatas — nunca se auto-resuelve ni se bloquea la línea.
- **Cierre manual de partidas** (`partidas_cerradas`, aparte de compras) y **cierre masivo por fecha** — probado: una partida cerrada deja de aparecer como disponible; al reabrirla, vuelve a aparecer.
- **Rentabilidad por partida** (nuevo, no existe en el HTML): coste total, coste por artículo, vendido total, vendido por artículo, rentabilidad = vendido − coste. Probado contra datos reales (partida 5900: coste 98,838 €, coincide exactamente con el dato migrado en Fase 1).

Probado end-to-end contra los datos reales migrados: `GET /api/partidas/disponibles?articulo=C250` devuelve las partidas reales correctamente ordenadas por fecha (de más antigua a más nueva).

**Resuelto (26/08/2026):** Víctor ha confirmado que el 2% de OP es un gasto real, así que debe contar como coste también al comparar el margen mínimo — a diferencia del HTML actual, que compara el precio de venta solo contra `precioKg` (sin el 2% de OP). Corregido: el coste usado para el margen es ahora `baseReal / kilos` (incluye el 2% de OP cuando el proveedor es de subasta). Esto es una corrección deliberada respecto al HTML actual, no un fallo de paridad — probado con la partida real 5900: antes de la corrección el coste usado era 3,80 €/kg (`precioKg`), ahora es 3,876 €/kg (`baseReal/kilos` = 98,838 € / 25,5 kg), que es el coste real correcto.

**El margen mínimo (1,30 €/kg) también es ahora configurable**, no fijo en el código (clave `margen_minimo_partida` en `configuracion`, mismo mecanismo que el recargo de equivalencia) — preparado para cuando en la Fase 3 esto pase a ser un parámetro que solo el Administrador puede cambiar.

**Bug encontrado y corregido durante las pruebas de esta fase (no venía del HTML, era nuevo en este backend):** el orden por fecha de las partidas disponibles comparaba las fechas como texto tal cual las devuelve la librería de PostgreSQL (que las entrega como objeto `Date` de JavaScript), lo que las ordenaba por día de la semana en inglés en vez de cronológicamente. Corregido comparando por su valor temporal real; verificado que ahora las partidas salen de más antigua a más nueva.

## 4. Listados de gestión (`src/routes/listados.js`, Fase 2 punto 5bis)

Implementados con filtro por fecha (`?desde=&hasta=`) y exportación (`?formato=csv`):
- Ventas por cliente, compras por proveedor, rentabilidad por partida, márgenes por artículo, clientes sin actividad reciente, movimiento de producto.
- **Regla obligatoria aplicada** (confirmada por Víctor, ver Fase 0 punto 9): el listado de movimiento de producto suma pedidos + traspasos, y **ningún listado incluye Reparto Super** (ya se factura al cliente que lo encarga; incluirlo duplicaría el dato).
- Probados todos contra los datos reales migrados — resultados con sentido (ej. el cliente con más pedidos y volumen es SCANFISK SEAFOOD, con 54 pedidos).
- Pendiente: exportación a PDF (solo hay CSV/JSON por ahora) y los "modelos de impresión" del punto 5 de la Fase 1 (fichas de envío, etiquetas, Transfrío) — no se han abordado todavía en esta fase.

## 5. Qué falta para cerrar la Fase 2 del todo

- Confirmar el supuesto fiscal de ventas que queda pendiente en el punto 2 (cliente intracomunitario exento) — no urgente porque la facturación todavía no existe.
- Comparación explícita de agilidad frente al Excel `GESTION_CORRECTA` (punto 5 de la Fase 1/2) — no se ha hecho todavía, requiere que Víctor use el flujo real.
- Exportación a PDF de los listados.
- Conectar una pantalla real a estos endpoints (hoy solo son API + la pantalla de clasificación fiscal `fiscal.html`) para el uso diario.

## 6. Parámetros de negocio configurables (`src/negocio/configuracion.js`, nuevo)

A raíz de las dos respuestas de Víctor de arriba, se ha añadido una tabla `configuracion` (clave/valor) para parámetros que no deben estar fijos en el código:
- `margen_minimo_partida` (arranca en 1,30 €/kg)
- `recargo_equivalencia_pct` (arranca en 1,4%)

Se consultan `GET /api/configuracion` y se cambian con `PUT /api/configuracion/:clave` (body `{"valor": ...}`). Probado: cambiar el recargo a 2% y volver a 1,4% se refleja inmediatamente; una clave inventada da error 400 (no rompe el servidor). De momento sin restricción de usuario — en la Fase 3 esto pasa a ser exclusivo del rol Administrador (ver Fase 3 punto 1).
