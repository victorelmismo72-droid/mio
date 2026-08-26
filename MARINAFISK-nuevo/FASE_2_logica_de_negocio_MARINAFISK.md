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
  - Proveedor Intracomunitario → **sin IVA repercutido por el proveedor** (confirmado, ver Fase 0 punto 4): aplicar inversión del sujeto pasivo — Marinafisk autorepercute el IVA en su propia contabilidad al registrar la compra. No es un fallo, es el comportamiento correcto y debe implementarse así explícitamente.
  - Proveedores Extra-UE → **fuera de alcance de esta fase y del proyecto** (ver Fase 0 punto 4) — no implementar ningún tratamiento para este caso.
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
- **Rentabilidad por partida** (nuevo, importante — no existe hoy en el HTML): el sistema debe poder mostrar, para cualquier partida:
  - **Coste total** de la partida completa (lo que costó la compra que la originó).
  - **Coste por artículo/línea** dentro de esa partida, cuando una compra se reparte en varios artículos/tallas.
  - **Total vendido** de esa partida (suma de todas las ventas que se han asignado a ella).
  - **Vendido por artículo** dentro de esa partida.
  - A partir de estos datos, la **rentabilidad real** = total vendido − coste total (y también desglosada por artículo), en vez de solo el margen por línea individual que ya existe hoy.
  - Esta vista debe poder consultarse en cualquier momento de la vida de la partida (abierta o ya cerrada), no solo al cierre.
- **Las partidas nunca deben mostrarse en documentos de cliente** — solo en la versión interna con precios.
- Compras siguen siendo inmutables (ver Fase 1) — el cálculo de margen se hace leyendo la compra original, nunca modificándola.

---

## 4. Listas de precios (Pescaderías / Mayoristas)

- Confirmar que la lógica de independencia entre listas (cada una autónoma, copia de arranque opcional desde la otra si está vacía) se traslada igual que en el HTML actual (ver Fase 0, punto 5).
- Modo automático (relleno desde compras del día) y modo manual (entrada libre), igual que hoy.
- La versión interna (con coste, margen real, existencias en cajas) debe seguir estando claramente separada de la versión de cliente, y nunca mezclarse.

---

## 5. Requisito transversal de agilidad (recordatorio, ya introducido en Fase 1)

Sigue aplicando aquí: cada flujo de esta fase (registrar compra, asignar partida, generar lista de precios) debe probarse comparando el número de pasos/tiempo frente al Excel `GESTION_CORRECTA` actual. Si algún flujo nuevo resulta más lento o más tedioso que el Excel o que el HTML actual, se considera un defecto de esta fase, no un detalle menor.

---

## 5bis. Listados habituales de gestión (nuevo, no cubierto en el HTML actual)

El HTML actual cubre los documentos operativos del día a día (albaranes, traspasos, Reparto Super), pero le faltan listados de gestión típicos de este tipo de programas. Añadir, como mínimo:

- **Listado de ventas por cliente** (por rango de fechas): qué se le ha vendido a un cliente, cuánto, y a qué precio.
- **Listado de compras por proveedor** (por rango de fechas).
- **Listado de rentabilidad por partida** (usa los datos del punto 3 de esta fase) — todas las partidas de un periodo con su coste, ventas y rentabilidad.
- **Listado de existencias/stock actual** (qué partidas siguen abiertas y cuánto kg queda en cada una).
- **Listado de márgenes por artículo** (qué artículos dan más o menos margen en un periodo).
- **Listado de clientes sin actividad reciente** (relacionado con el panel ya existente "Clientes a Contactar Hoy", pero como informe exportable por rango de fechas, no solo el aviso diario).
- Todos los listados deben poder **filtrarse por fecha** y **exportarse** (como mínimo a PDF o Excel/CSV, coherente con el requisito de igualar o mejorar el Excel actual, ver punto 5).
- Antes de dar esta sección por cerrada, revisar con Víctor si hace falta algún listado adicional específico del negocio del pescado que no esté en esta lista — esta es una base mínima, no necesariamente completa.

---

## 6. Verificación de esta fase

No pasar a la Fase 3 hasta que:

- [ ] Se ha tomado un conjunto de datos reales (un día completo de compras y ventas, por ejemplo) y se ha comparado el resultado del sistema nuevo contra el HTML actual: mismo coste real, mismas partidas asignadas, mismo margen.
- [ ] El tratamiento de IVA/Recargo de Equivalencia está implementado y documentado para Nacional e Intracomunitario, en proveedores y clientes (Extra-UE queda fuera de alcance, no se implementa).
- [ ] El caso conocido de falsos positivos en emparejamiento de partidas (ej. C144 vs C1444) se ha probado explícitamente y no reaparece.
- [ ] La rentabilidad por partida (coste total, coste por artículo, vendido total, vendido por artículo) se puede consultar correctamente en partidas de prueba, tanto abiertas como cerradas.
- [ ] Los listados mínimos del punto 5bis existen, filtran por fecha y se pueden exportar (PDF o Excel/CSV).
- [ ] Las partidas no aparecen en ningún documento de cliente generado por el sistema nuevo.
- [ ] Comparación de agilidad frente al Excel realizada y documentada (ver punto 5).
- [ ] El HTML/programa actual sigue intacto y en uso normal, en paralelo.
- [ ] Víctor ha revisado y entendido, en términos sencillos, qué se ha construido y qué puntos quedaron pendientes de confirmación normativa (IVA).

---

*Preparado como continuación de FASE_0_reglas_de_negocio_MARINAFISK.md y FASE_1_base_de_datos_backend_MARINAFISK.md, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
