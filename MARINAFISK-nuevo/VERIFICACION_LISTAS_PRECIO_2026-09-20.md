# Verificación: Listas de precio — ¿el mismo tipo de fallo? — 20/09/2026

Fecha: 2026-09-20

Continuación de la revisión pedida por Víctor tras el fallo real de Pedidos (`VERIFICACION_AGILIDAD_2026-09-20.md`) y su comprobación en Compras (`VERIFICACION_COMPRAS_TOTAL0_2026-09-20.md`) y Traspasos/Repartos (`VERIFICACION_TRASPASOS_REPARTOS_TOTAL0_2026-09-20.md`).

Listas de precio no tiene ningún "total" — cada línea es un precio manual o automático, no una suma. Pero **sí tenía un fallo real de la misma familia**, más grave en sus consecuencias que el de Pedidos: en modo **MANUAL**, el aviso de "precio por debajo del coste" (FASE_2 punto 4/5ter — la pieza pensada precisamente para evitar vender con pérdidas sin darse cuenta) podía saltarse en silencio.

## El fallo

En `backend/public/js/pantallas/listasPrecio.js`, cada línea manual comprueba el coste de referencia real del artículo con una llamada al servidor `debounced` (300 ms) mientras se teclea, y guarda el resultado en `fila.costeReferencia`. Al pulsar "Guardar lista MANUAL", el aviso de pérdida (`conPerdida`) se calculaba filtrando por `fila.costeReferencia` — el valor de esa comprobación en vivo, que empieza en `null` y solo se rellena cuando la llamada debounced termina.

Si se elegía el artículo y se tecleaba el precio con rapidez, y se pulsaba "Guardar" antes de que esa comprobación terminara, `costeReferencia` seguía siendo `null` en ese instante — y el filtro `f.costeReferencia != null && ...` lo descartaba silenciosamente del aviso, **aunque el precio estuviera realmente por debajo del coste real**. Además, ese mismo `null` se mandaba al servidor como el `coste` a guardar, así que el registro histórico de la lista se quedaba sin el coste de referencia de verdad.

**Probado con datos reales**: BESUGO (id=10) tiene un coste de referencia real de 31,11 €/kg (partida 56013 real). Tecleando el artículo, un precio de 10 €/kg (muy por debajo) y pulsando "Guardar" sin esperar, el aviso de pérdida **sí** apareció ("1 producto(s) tienen el precio por debajo del coste…") — comprobado también que, tras confirmar, la línea se guardó con `precio=10, coste=31.11` correctamente.

## Corrección

Dos partes, la misma que ya se ha aplicado en Compras/Pedidos/Traspasos/Repartos — el servidor calcula siempre lo que puede calcular, nunca se fía de la pantalla:

- **Backend** (`backend/src/routes/listasPrecio.js`): nueva `costeReferenciaPorArticulo()` en `logica/partidas.js` (la misma lógica que ya usaba `GET /api/articulos/:id/coste-referencia`, factorizada para reutilizarla) — en modo MANUAL, el servidor recalcula el coste de cada línea con `articulo_id` él mismo antes de guardarla, ignorando el `coste` que mande la pantalla. El registro guardado nunca puede quedarse con un coste en blanco por una carrera de tiempos.
- **Frontend**: antes de calcular `conPerdida` (y decidir si hay que preguntar), `guardarManual()` vuelve a comprobar el coste de referencia de verdad para todas las líneas (en paralelo), en vez de fiarse del valor que hubiera en ese instante por la comprobación debounced — así el aviso nunca se salta por ir demasiado rápido tecleando.

El modo AUTO no tenía este problema: la vista previa se calcula una sola vez, de golpe, con un único `await` antes de que el botón "Guardar" tenga sentido pulsarlo — no hay ninguna comprobación en curso que pueda quedarse a medias.

## Regresión

La prueba creó una lista de precios real de tipo PESCADERIAS/fecha de hoy — se borró (`DELETE FROM listas_precio`, sin trigger de inmutabilidad en esta tabla, a diferencia de Compras) en cuanto se confirmó el resultado. Listas de precio es una funcionalidad nueva (no existía en el backup original — ver README §7), así que no había ningún dato real que pudiera verse afectado. Se repitió la regresión completa: `verificar_migracion.js` (71.018 comprobaciones, 0 diferencias) y `verificar_fase2.js`, ambas superadas.

## Conclusión

No tenía el fallo de "total 0€" (no aplica, no hay ningún total agregado) pero sí la misma causa raíz de fondo, con una consecuencia real más seria: un aviso de venta con pérdidas que podía saltarse en silencio justo en el caso — tecleo rápido — donde más falta hace. Corregido en servidor y en pantalla.
