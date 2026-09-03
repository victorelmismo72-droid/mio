# MARINAFISK — Reglas de negocio actuales (Fase 0)

Documento de referencia para el desarrollo del nuevo sistema con base de datos.
Recoge cómo funciona HOY el programa HTML (`CARGA_DE_ALBARANES_MARINAFISK`), para que el sistema nuevo reproduzca exactamente el mismo comportamiento antes de añadir nada.

Última versión de referencia del programa actual: **2026-08-21-I**
Última versión corregida del Excel GESTION_CORRECTA: ver notas al final.

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

---

## 7. Fechas

- Usar siempre **fecha local (España/Madrid)**, nunca conversión a UTC antes de recortar la fecha — un fallo pasado (`toISOString().split('T')[0]`) causaba que pedidos introducidos después de medianoche se registraran con la fecha del día anterior. El sistema nuevo debe calcular la fecha "de hoy" en huso horario local de forma centralizada y consistente.

---

## 8. Documentos / registro sanitario

- El registro sanitario correcto es **12.01671/C** (cuidado: existió un error tipográfico histórico como "12.016171/C" — un dígito de más).
- Debe aparecer en todos los documentos que se envían a terceros: albaranes, traspasos, y fichas de envío de Reparto Super.

---

## 9. Traspasos y Repartos — alcance en estadísticas y contabilidad (confirmado por Víctor, 2026-08-26)

Son dos flujos distintos, con tratamiento opuesto en informes:

- **Traspasos (a Zaragoza)**: fiscalmente son nulos — no son una venta, es mercancía moviéndose entre almacenes propios, sin IVA ni factura de por medio. **Pero sí deben contar en las estadísticas de cantidad/movimiento de producto** (por ejemplo, un listado de "cuánto se vendió de un producto en un día concreto" debe incluir también lo que salió por traspaso a Zaragoza, aunque no sea venta). Hoy el programa actual **no lo hace así** — es un hueco a corregir en el sistema nuevo, no un comportamiento a copiar tal cual.
- **Reparto Super**: es mercancía que **sí se factura a un cliente** (el cliente es quien encarga hacer el reparto) — ya queda contabilizada como venta normal por esa vía. Por eso Reparto Super **no debe aparecer en ningún listado estadístico ni contable** (ni de ventas, ni de márgenes, ni de movimiento de producto): incluirlo ahí duplicaría datos que ya están contados en el pedido/factura al cliente.

Esto afecta directamente al diseño de los "Listados habituales de gestión" de la Fase 2 (ver `FASE_2_logica_de_negocio_MARINAFISK.md`, punto 5bis): cualquier listado de movimiento/venta por producto o por fecha debe sumar `pedidos` + `traspasos`, y debe excluir siempre `repartos`.

---

## 10. Pendiente de confirmar / decidir en el diseño nuevo

- [x] Tratamiento correcto del IVA en compras a proveedores extranjeros (ver punto 4) — resuelto: intracomunitario = sin IVA; no existen proveedores extracomunitarios, no hace falta tercer caso.
- [x] Alcance de Traspasos y Repartos Super en estadísticas/contabilidad (ver punto 9) — resuelto: traspasos cuentan en estadísticas de cantidad, repartos no cuentan en ningún informe.
- [ ] Confirmar con Víctor si hay más proveedores o casos especiales de OP aparte de "subasta/lonja marcados como tal".
- [ ] Revisar si existen otras reglas de mermas/pérdida de peso además de la ya mencionada en cierre de partidas.

---

*Este documento se ha preparado a partir del historial de conversaciones de desarrollo del programa actual (chats "Gestión del backup de MARINAFISK" y "Arquitectura de importación de catálogo maestro"). Antes de empezar a programar el sistema nuevo, conviene que Víctor revise este documento y confirme o corrija cualquier punto.*
