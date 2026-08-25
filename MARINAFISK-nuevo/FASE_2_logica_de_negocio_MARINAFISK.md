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

## 5. Requisito transversal de agilidad (recordatorio, ya introducido en Fase 1)

Sigue aplicando aquí: cada flujo de esta fase (registrar compra, asignar partida, generar lista de precios) debe probarse comparando el número de pasos/tiempo frente al Excel `GESTION_CORRECTA` actual. Si algún flujo nuevo resulta más lento o más tedioso que el Excel o que el HTML actual, se considera un defecto de esta fase, no un detalle menor.

---

## 6. Verificación de esta fase

No pasar a la Fase 3 hasta que:

- [ ] Se ha tomado un conjunto de datos reales (un día completo de compras y ventas, por ejemplo) y se ha comparado el resultado del sistema nuevo contra el HTML actual: mismo coste real, mismas partidas asignadas, mismo margen.
- [ ] El tratamiento de IVA/Recargo de Equivalencia está implementado y documentado para las cuatro clasificaciones fiscales de proveedores y las combinaciones de clientes — con las dudas normativas señaladas explícitamente a Víctor, no asumidas.
- [ ] El caso conocido de falsos positivos en emparejamiento de partidas (ej. C144 vs C1444) se ha probado explícitamente y no reaparece.
- [ ] Las partidas no aparecen en ningún documento de cliente generado por el sistema nuevo.
- [ ] Comparación de agilidad frente al Excel realizada y documentada (ver punto 5).
- [ ] El HTML/programa actual sigue intacto y en uso normal, en paralelo.
- [ ] Víctor ha revisado y entendido, en términos sencillos, qué se ha construido y qué puntos quedaron pendientes de confirmación normativa (IVA).

---

*Preparado como continuación de FASE_0_reglas_de_negocio_MARINAFISK.md y FASE_1_base_de_datos_backend_MARINAFISK.md, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
