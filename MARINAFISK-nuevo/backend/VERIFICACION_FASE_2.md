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

Lógica lista para el futuro módulo de facturación (no se usa todavía en ningún documento real, el HTML actual no factura). **Dos cosas marcadas explícitamente en el código como pendientes de confirmar, tal y como pedía la Fase 2 — no se han dado por buenas sin más:**
- El 1,4% de Recargo de Equivalencia (el que corresponde al 10% de IVA) — confirmar que sigue vigente.
- El tratamiento de cliente Intracomunitario como entrega exenta (0%) es un supuesto razonable, no una confirmación de Víctor/asesoría.

## 3. Partidas y margen (`src/negocio/partidas.js`)

Reproduce el algoritmo exacto del HTML actual:
- **Emparejamiento de familia de producto**: mismo código, o código corto (≥4 caracteres) que es el principio del código largo **y además** coincide la primera palabra de la descripción del catálogo — evita el falso positivo conocido (C144 vs C1444, ver Fase 0 punto 3).
- **Kilos disponibles por partida**: comprados − vendidos (pedidos) − traspasados (traspasos cuentan como salida de kilos igual que una venta, aunque no sean fiscalmente una venta).
- **Margen mínimo 1,30 €/kg**: si ninguna partida disponible llega al margen frente al precio de venta, se marca `PENDIENTE_MANUAL` con la lista de candidatas — nunca se auto-resuelve ni se bloquea la línea.
- **Cierre manual de partidas** (`partidas_cerradas`, aparte de compras) y **cierre masivo por fecha** — probado: una partida cerrada deja de aparecer como disponible; al reabrirla, vuelve a aparecer.
- **Rentabilidad por partida** (nuevo, no existe en el HTML): coste total, coste por artículo, vendido total, vendido por artículo, rentabilidad = vendido − coste. Probado contra datos reales (partida 5900: coste 98,838 €, coincide exactamente con el dato migrado en Fase 1).

Probado end-to-end contra los datos reales migrados: `GET /api/partidas/disponibles?articulo=C250` devuelve las partidas reales correctamente ordenadas por fecha (de más antigua a más nueva).

**Nota de diseño para revisar con Víctor:** el HTML actual calcula el margen de una partida comparando el precio de venta contra `precioKg` (el precio de compra por kilo, sin el 2% de OP), no contra `baseReal/kilos` (que sí lo incluiría). Esta fase reproduce ese mismo criterio para no romper la paridad de comportamiento que pide la Fase 2 — pero conviene confirmar con Víctor si el margen de 1,30 €/kg debería en realidad descontar también el 2% de OP cuando aplica, o si es correcto dejarlo como está hoy.

**Bug encontrado y corregido durante las pruebas de esta fase (no venía del HTML, era nuevo en este backend):** el orden por fecha de las partidas disponibles comparaba las fechas como texto tal cual las devuelve la librería de PostgreSQL (que las entrega como objeto `Date` de JavaScript), lo que las ordenaba por día de la semana en inglés en vez de cronológicamente. Corregido comparando por su valor temporal real; verificado que ahora las partidas salen de más antigua a más nueva.

## 4. Listados de gestión (`src/routes/listados.js`, Fase 2 punto 5bis)

Implementados con filtro por fecha (`?desde=&hasta=`) y exportación (`?formato=csv`):
- Ventas por cliente, compras por proveedor, rentabilidad por partida, márgenes por artículo, clientes sin actividad reciente, movimiento de producto.
- **Regla obligatoria aplicada** (confirmada por Víctor, ver Fase 0 punto 9): el listado de movimiento de producto suma pedidos + traspasos, y **ningún listado incluye Reparto Super** (ya se factura al cliente que lo encarga; incluirlo duplicaría el dato).
- Probados todos contra los datos reales migrados — resultados con sentido (ej. el cliente con más pedidos y volumen es SCANFISK SEAFOOD, con 54 pedidos).
- Pendiente: exportación a PDF (solo hay CSV/JSON por ahora) y los "modelos de impresión" del punto 5 de la Fase 1 (fichas de envío, etiquetas, Transfrío) — no se han abordado todavía en esta fase.

## 5. Qué falta para cerrar la Fase 2 del todo

- Confirmar con Víctor la nota de diseño del punto 3 (precioKg vs baseReal en el margen de partida).
- Confirmar los dos supuestos fiscales de ventas del punto 2 (recargo 1,4%, intracomunitario exento) — no urgente porque la facturación todavía no existe.
- Comparación explícita de agilidad frente al Excel `GESTION_CORRECTA` (punto 5 de la Fase 1/2) — no se ha hecho todavía, requiere que Víctor use el flujo real.
- Exportación a PDF de los listados.
- Conectar una pantalla real a estos endpoints (hoy solo son API + la pantalla de clasificación fiscal `fiscal.html`) para el uso diario.
