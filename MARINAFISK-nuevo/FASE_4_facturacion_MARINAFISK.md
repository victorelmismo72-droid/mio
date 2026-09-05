# MARINAFISK — Fase 4: Facturación

Este documento se entrega junto con `FASE_0_reglas_de_negocio_MARINAFISK.md`, `FASE_1_base_de_datos_backend_MARINAFISK.md` y `FASE_2_logica_de_negocio_MARINAFISK.md`.

**Contexto:** el HTML actual (`CARGA_DE_ALBARANES_MARINAFISK_20260902CORREGIDO_4.html`) **no tiene ningún módulo de facturación** — no aparece la palabra "factura" en ningún sitio del código. Lo que existe son **albaranes** (documento de entrega, sin factura formal) y un Excel de apoyo para que la contabilidad se lleve fuera del programa. Fase 2 (punto 2) ya dejó preparado y corregido el cálculo de IVA/Recargo de Equivalencia por cliente "para cuando exista el módulo de facturación" — esta fase construye justamente eso.

Petición de Víctor (05/09/2026): el programa debe generar **facturas agrupando albaranes por cliente y por fecha**, con listados de todo tipo, impresión y envío igual que los albaranes, y una gestión contable "como cualquier programa".

---

## 1. Qué es una factura en este sistema

- Una factura agrupa **varios albaranes (pedidos) de un mismo cliente**, dentro de un rango de fechas elegido (ej. facturación quincenal o mensual — a confirmar la periodicidad habitual con Víctor).
- **Un albarán solo puede facturarse una vez.** Al generar una factura, los pedidos incluidos quedan marcados/vinculados a ella (`factura_id`) y dejan de aparecer como "pendientes de facturar" para ese cliente. Desde el propio albarán debe poder verse si ya está facturado y en qué factura.
- **Numeración propia**: serie de facturas independiente de la de pedidos, con contador correlativo consistente entre los dos puestos (CORU/PANC) — mismo mecanismo de contador consistente ya exigido para pedidos/partidas (ver Fase 0 punto 6 y `02_ESQUEMA_BASE_DATOS_PROPUESTO.md`). Un contador de facturas desincronizado sería tan grave como el ya conocido para pedidos.
- **Cabecera de factura**: cliente, fecha de emisión, rango de fechas cubierto, lista de números de albarán incluidos.
- **Líneas de factura**: **decidido (05/09/2026) — las dos modalidades**, seleccionable al generar/imprimir cada factura (ver punto 5).
- **IVA/Recargo**: se calcula sobre la base total de la factura con el tipo fiscal del cliente, reutilizando `calcularIvaPedido` (ya existe y es correcto para ventas, ver corrección aplicada en Fase 2 punto 2). Como todos los albaranes de una factura son del mismo cliente, el tipo fiscal es siempre uno solo por factura.
- **Inmutabilidad**: una factura ya emitida no debería poder borrarse ni editarse — cualquier corrección debe hacerse con una **factura rectificativa** enlazada a la original, no sobrescribiendo (igual que las compras son "dato sagrado", ver Fase 0 punto 3). El procedimiento exacto de rectificación es mejor confirmarlo con la asesoría de Víctor antes de cerrar esta fase — no asumir un formato.

---

## 2. Listados

- Por cliente, por rango de fechas, por estado de cobro (PENDIENTE/COBRADA/PARCIAL/VENCIDA, ver punto 4), por número de factura.
- Desde cada factura, ver qué albaranes la componen; desde cada albarán, ver si está facturado y en qué factura.
- Extender el mismo patrón que ya existe para el listado Excel de pedidos ("para grabar contabilidad", con fórmulas reales) a un listado equivalente de facturas.

---

## 3. Impresión y envío

- Reutilizar la plantilla y el motor de PDF que ya generan los albaranes (mismos datos de empresa y registro sanitario 12.01671/C, ver Fase 0 punto 8), adaptado a "FACTURA" con su propia numeración y el desglose de IVA/Recargo de la factura completa.
- Envío por WhatsApp y Email **igual que ya existe hoy para albaranes y traspasos** (`enviarAlbaranPorWhatsapp` / `enviarAlbaranPorEmail` en el HTML actual): genera el PDF y abre WhatsApp o el correo con el mensaje preparado para adjuntarlo. Mismo patrón, sin inventar uno nuevo.

---

## 4. "Gestión contable" — decidido (05/09/2026): nivel intermedio

Víctor ha confirmado: **control de cobros claro + export limpio para la gestoría**. Esto fija el alcance en el "nivel intermedio" de los tres que planteaba este documento, y descarta expresamente reconstruir una contabilidad de partida doble dentro de MARINAFISK (eso lo sigue llevando la gestoría, con su propio software).

Alcance cerrado para esta fase:

- **Estado de cobro por factura**: PENDIENTE / COBRADA / PARCIAL / VENCIDA, con fecha de vencimiento y forma de pago.
- **Registro de cobros/pagos parciales**: cada pago contra una factura se anota con fecha e importe (una factura puede tener varios pagos parciales hasta quedar COBRADA). El estado se recalcula a partir de la suma de pagos frente al total de la factura — no se marca "COBRADA" a mano si no cuadra el importe.
- **Listado de pendientes de cobro por cliente** (quién debe, cuánto, desde cuándo — para saber a quién reclamar).
- **Export limpio para la gestoría**: fichero estructurado (Excel, mismo patrón que el listado de pedidos "para grabar contabilidad") con una fila por factura — número, fecha, cliente, CIF, base, IVA/Recargo, total, estado de cobro — para que la gestoría lo importe en su propio programa. No incluye asientos ni plan de cuentas: eso es trabajo de la gestoría, no de este programa.
- **Fuera de alcance de esta fase** (explícitamente, para no dar pie a confusión más adelante): plan de cuentas, asientos debe/haber, libro diario/mayor, modelo 303. Si en el futuro se decide llevar la contabilidad completa dentro de MARINAFISK, sería una fase nueva y separada, no una ampliación silenciosa de esta.

---

## 5. Formato de líneas de factura — decidido (05/09/2026): las dos modalidades

Víctor ha confirmado que quiere **ambas posibilidades disponibles**, no una sola fija:

- **Detalle completo**: una línea de factura por cada línea de cada albarán incluido (como si se pegaran los albaranes uno detrás de otro).
- **Resumen por albarán**: una línea de factura por albarán (ej. "Albarán nº 1234 — 20/08/2026 — 145,30 €").

Diseño consecuente: el vínculo entre factura y albaranes se guarda siempre a nivel de línea de pedido (trazabilidad completa, para poder reconstruir cualquiera de los dos formatos en cualquier momento sin perder información), y el formato "detalle" o "resumen" es una **opción de presentación** que se elige al generar o reimprimir cada factura — no una decisión que haya que tomar una sola vez para todas las facturas. Un mismo cliente podría pedir un mes la factura en detalle y otro mes en resumen, sin que eso afecte a los datos guardados.

---

## 6. Relación con las fases ya escritas

- No cambia nada de las reglas ya fijadas en Fase 0/1/2, salvo la corrección ya aplicada en Fase 2 punto 2 (el cálculo de IVA/Recargo de ventas ya funciona en el HTML actual; lo que de verdad falta es el IVA de compras a proveedores intracomunitarios).
- Depende de que Fase 1 (base de datos) y Fase 2 (lógica de negocio: partidas, margen, IVA) estén implementadas — facturar agrupa pedidos ya grabados, no cambia cómo se graban ni su cálculo.
- Se numera como **Fase 4** porque la Fase 3 (sincronización entre puestos) y la Fase 5 (hosting en la nube) ya estaban reservadas en los documentos anteriores.

---

## 7. Criterios de cierre de esta fase

No dar la fase por cerrada hasta que:

- [x] Víctor ha decidido y confirmado el nivel de "gestión contable" (punto 4) — nivel intermedio: control de cobros + export para gestoría, sin contabilidad de partida doble.
- [x] Víctor ha confirmado el formato de líneas de factura (punto 5) — ambas modalidades disponibles, elegibles al generar cada factura.
- [ ] Un mismo albarán no puede quedar incluido en dos facturas.
- [ ] La factura impresa reproduce exactamente el mismo IVA/Recargo que ya calculan los albaranes originales del cliente, en detalle y en resumen.
- [ ] El estado de cobro se recalcula siempre a partir de la suma de pagos registrados, nunca se marca "COBRADA" a mano sin que cuadre el importe.
- [ ] El export para la gestoría se ha probado con un caso real y Víctor confirma que su asesoría puede trabajar con ese formato.
- [ ] Envío de factura por WhatsApp/Email probado igual que ya funciona hoy para albaranes.
- [ ] Numeración de facturas consistente entre CORU y PANC, probada bajo el mismo tipo de estrés que causó el incidente de contadores duplicados en pedidos (ver Fase 0 punto 6).
- [ ] El procedimiento de rectificación de una factura ya emitida está confirmado con la asesoría, no asumido.

---

*Preparado como continuación de FASE_0/1/2_MARINAFISK.md, a partir de la petición de Víctor de un módulo de facturación (05/09/2026). Los puntos 4 y 5 quedaron confirmados el mismo día — pendiente ya solo de implementar y verificar contra los criterios de cierre (punto 7).*
