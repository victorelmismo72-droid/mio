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
- **Líneas de factura**: por decidir con Víctor (ver punto 5) si se detalla línea a línea de cada albarán, o un resumen de una línea por albarán.
- **IVA/Recargo**: se calcula sobre la base total de la factura con el tipo fiscal del cliente, reutilizando `calcularIvaPedido` (ya existe y es correcto para ventas, ver corrección aplicada en Fase 2 punto 2). Como todos los albaranes de una factura son del mismo cliente, el tipo fiscal es siempre uno solo por factura.
- **Inmutabilidad**: una factura ya emitida no debería poder borrarse ni editarse — cualquier corrección debe hacerse con una **factura rectificativa** enlazada a la original, no sobrescribiendo (igual que las compras son "dato sagrado", ver Fase 0 punto 3). El procedimiento exacto de rectificación es mejor confirmarlo con la asesoría de Víctor antes de cerrar esta fase — no asumir un formato.

---

## 2. Listados

- Por cliente, por rango de fechas, por estado de cobro (ver punto 4), por número de factura.
- Desde cada factura, ver qué albaranes la componen; desde cada albarán, ver si está facturado y en qué factura.
- Extender el mismo patrón que ya existe para el listado Excel de pedidos ("para grabar contabilidad", con fórmulas reales) a un listado equivalente de facturas.

---

## 3. Impresión y envío

- Reutilizar la plantilla y el motor de PDF que ya generan los albaranes (mismos datos de empresa y registro sanitario 12.01671/C, ver Fase 0 punto 8), adaptado a "FACTURA" con su propia numeración y el desglose de IVA/Recargo de la factura completa.
- Envío por WhatsApp y Email **igual que ya existe hoy para albaranes y traspasos** (`enviarAlbaranPorWhatsapp` / `enviarAlbaranPorEmail` en el HTML actual): genera el PDF y abre WhatsApp o el correo con el mensaje preparado para adjuntarlo. Mismo patrón, sin inventar uno nuevo.

---

## 4. "Gestión contable" — punto que necesita tu decisión antes de diseñar las tablas

Pediste "una gestión contable como cualquier programa". Esa frase puede significar niveles muy distintos de trabajo, así que antes de tocar el esquema de base de datos conviene fijar cuál quieres:

- **Nivel básico (punto de partida recomendado):** cada factura tiene un estado de cobro (PENDIENTE / COBRADA / PARCIAL / VENCIDA), fecha de vencimiento y forma de pago, y hay un listado de facturas pendientes de cobro por cliente. Sin contabilidad de partida doble.
- **Nivel intermedio:** lo anterior, más un registro de cobros/pagos parciales (fecha e importe) contra cada factura, y un export estructurado para que tu asesoría lo importe en su propio programa de contabilidad.
- **Nivel completo (contabilidad real):** plan de cuentas, asientos (debe/haber), libro diario/mayor, IVA repercutido/soportado con modelo 303 trimestral, etc. — esto es lo que hace un programa de contabilidad dedicado (el que ya use tu asesoría), y **normalmente no conviene reconstruirlo dentro de este programa**: es mucho trabajo, alto riesgo si hay un fallo con implicaciones fiscales, y ya existe software homologado para ello.

**Recomendación de este documento:** que MARINAFISK gestione bien las facturas (numeración, estado de cobro, listados, PDF, envío) y produzca un export limpio para la asesoría — no que sustituya a un programa de contabilidad dedicado. Pero es tu decisión, no la doy por cerrada: dime qué nivel quieres y lo marco como confirmado antes de diseñar las tablas de esta fase.

---

## 5. Otro punto que necesita tu confirmación

- **Formato de las líneas de factura**: ¿una línea por cada línea de cada albarán incluido (detalle completo, como si se pegaran los albaranes uno detrás de otro), o un resumen de una línea por albarán (ej. "Albarán nº 1234 — 20/08/2026 — 145,30 €")? Afecta al diseño de la tabla `factura_lineas` y a cómo queda la factura impresa.

---

## 6. Relación con las fases ya escritas

- No cambia nada de las reglas ya fijadas en Fase 0/1/2, salvo la corrección ya aplicada en Fase 2 punto 2 (el cálculo de IVA/Recargo de ventas ya funciona en el HTML actual; lo que de verdad falta es el IVA de compras a proveedores intracomunitarios).
- Depende de que Fase 1 (base de datos) y Fase 2 (lógica de negocio: partidas, margen, IVA) estén implementadas — facturar agrupa pedidos ya grabados, no cambia cómo se graban ni su cálculo.
- Se numera como **Fase 4** porque la Fase 3 (sincronización entre puestos) y la Fase 5 (hosting en la nube) ya estaban reservadas en los documentos anteriores.

---

## 7. Criterios de cierre de esta fase

No dar la fase por cerrada hasta que:

- [ ] Víctor ha decidido y confirmado el nivel de "gestión contable" (punto 4).
- [ ] Víctor ha confirmado el formato de líneas de factura (punto 5).
- [ ] Un mismo albarán no puede quedar incluido en dos facturas.
- [ ] La factura impresa reproduce exactamente el mismo IVA/Recargo que ya calculan los albaranes originales del cliente.
- [ ] Envío de factura por WhatsApp/Email probado igual que ya funciona hoy para albaranes.
- [ ] Numeración de facturas consistente entre CORU y PANC, probada bajo el mismo tipo de estrés que causó el incidente de contadores duplicados en pedidos (ver Fase 0 punto 6).
- [ ] El procedimiento de rectificación de una factura ya emitida está confirmado con la asesoría, no asumido.

---

*Preparado como continuación de FASE_0/1/2_MARINAFISK.md, a partir de la petición de Víctor de un módulo de facturación (05/09/2026). Pendiente de que Víctor confirme los puntos 4 y 5 antes de pasar a diseño de base de datos.*
