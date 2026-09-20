# Verificación: Agilidad frente al programa actual, y un fallo real encontrado — 20/09/2026

Fecha: 2026-09-20

Ver `FASE_2_logica_de_negocio_MARINAFISK.md` punto 7 y su checklist (punto 107) — quedaba pendiente desde Fase 2 porque hacía falta una pantalla real para poder cronometrar pasos de verdad, no solo comparar la API. Con Fase 4 ya construida, esta prueba cronometra con Chromium real (Playwright) el mismo flujo en los dos programas, con los mismos datos reales.

No se ha localizado el fichero Excel `GESTION_CORRECTA` citado en `FASE_0` (no está en este repositorio) — la comparación se ha hecho, como alternativa explícitamente aceptada por el propio FASE_2 ("más lento… que el Excel **o que el HTML actual**"), contra el HTML actual real (`CARGA_DE_ALBARANES_MARINAFISK_20260821I.html`), restaurado con el mismo backup real (`Backup_2026-09-14_0600.json`, el mismo que se usó para migrar el sistema nuevo) para que ambos programas partan de exactamente los mismos clientes y artículos reales.

## Tarea cronometrada

**"Grabar un pedido de venta a un cliente real (PESCADOS VALDIZARBE, S.L., código 50003) con 2 líneas de artículo real — ABADEJO RIA 2 cajas/10 kg/5,50 €/kg y ACEDIA 3 cajas/15 kg/4,20 €/kg — e imprimir el albarán con precios."**

Se cuenta el tiempo y las interacciones (clics + campos escritos) **desde el primer tecleo hasta que se abre el documento**, sin contar la carga inicial de la pantalla.

| | HTML actual | Sistema nuevo |
|---|---|---|
| Tiempo | **4,0 s** | **4,0 s** |
| Clics | 6 | 5 |
| Campos escritos | 9 | 9 |
| Total interacciones | 15 | 14 |
| Dónde se imprime | En la misma pantalla del pedido, un botón | Hay que ir a la pantalla **Historial**, localizar el pedido y pulsar el botón — un paso más |

**Empate técnico en tiempo e interacciones**, con una diferencia real de flujo: en el HTML actual, "imprimir con precios" es un botón en la propia pantalla donde se acaba de grabar el pedido; en el sistema nuevo, hay que cambiar a la pantalla Historial (donde el pedido recién grabado ya aparece el primero de la lista, sin necesidad de buscarlo). No es un defecto grave — es una decisión de diseño ya tomada en Fase 4 (Historial concentra toda la impresión en lote, ver README §10) — pero si Víctor imprime el albarán inmediatamente después de grabar la mayoría de las veces, es un candidato razonable para un botón "imprimir" directamente en Pedidos, como acceso rápido al mismo Historial.

## Un fallo real encontrado durante la propia prueba (no un detalle menor)

Al cronometrar el sistema nuevo escribiendo los campos rápido y pulsando "Grabar" inmediatamente después del último campo (un ritmo de tecleo realista, no artificialmente lento), **el pedido se grabó con importe 0,00 €** pese a que las dos líneas tenían peso y precio correctos.

**Causa:** en la pantalla de Pedidos, el total de cada línea se recalcula en el navegador con un pequeño retraso (`debounce` de 350 ms, para no llamar al servidor en cada tecla) — y ese cálculo, todavía en curso, es el que la pantalla mandaba al grabar. El servidor, en `calcularCabeceraVenta`/`insertarLineasPedido` (`backend/src/routes/pedidos.js`), se fiaba de ese total en vez de recalcularlo él mismo a partir de peso/precio/descuento — al contrario de lo que ya se hacía, correctamente, con el 2% de OP y el IVA en Compras. Si el usuario pulsa "Grabar" antes de que ese cálculo termine (perfectamente posible tecleando a un ritmo normal, no solo en una prueba automatizada), el pedido se guarda en silencio con el importe equivocado — sin ningún aviso, sin ningún error.

**Corregido:** nueva función `calcularTotalLinea({ peso, precio, descuento })` en `backend/src/logica/calculosVenta.js`, usada tanto para el total de cada línea guardada como para la base sobre la que se calcula el IVA — el servidor ya no acepta ningún total calculado por la pantalla, lo calcula siempre él mismo a partir de los datos ya validados (peso, precio, descuento), igual que ya hace con OP2/IVA en Compras. Aplica tanto a `POST /api/pedidos` como a `PUT /api/pedidos/:id` (comparten la misma función).

**Reproducido y confirmado corregido**: se repitió la tarea exacta antes y después de la corrección, sin cambiar nada más del guion de la prueba —
- Antes: pedido grabado con `base=0, iva=0, total=0` (comprobado leyendo el pedido real de la base de datos).
- Después: pedido grabado con `base=118,00 €, iva=11,80 €, total=129,80 €` — exactamente lo mismo que calcula el HTML actual para las mismas dos líneas — confirmado también visualmente en el albarán impreso (captura de pantalla real).

## Regresión

Los pedidos de prueba creados durante esta verificación (números 13945-13948, todos con el cliente y artículos reales pero datos de prueba) se borraron con `DELETE /api/pedidos/:id` en cuanto dejaron de hacer falta — no queda ningún rastro en la base de datos real. No ha hecho falta reconstruir la base de datos porque no se tocó ningún otro dato.

## Conclusión

La agilidad del sistema nuevo, para el flujo probado, **es igual que la del HTML actual** (mismo tiempo, una interacción menos) — con una diferencia de diseño real y menor (imprimir el albarán vive en Historial, no en la propia pantalla de Pedidos) que merece una decisión de Víctor, no un cambio unilateral. Más importante que el cronómetro: la propia prueba, hecha con datos y ritmo de tecleo reales en vez de solo revisando el código, encontró un fallo real de guardado silencioso de pedidos a 0€ — ya corregido y confirmado. Quedan, si Víctor lo pide, los otros dos flujos que FASE_2 señalaba (registrar una compra, generar una lista de precios) para una comparación igual de exhaustiva — no se han encontrado indicios de que Compras tenga el mismo problema (ya calcula OP2/IVA enteramente en el servidor, sin fiarse de ningún total de la pantalla).
