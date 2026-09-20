# Verificación: ¿Traspasos y Repartos tienen el mismo fallo? — 20/09/2026

Fecha: 2026-09-20

Continuación de `VERIFICACION_COMPRAS_TOTAL0_2026-09-20.md` — pedido explícitamente por Víctor ("revisa traspasos y repartos por si acaso") tras el fallo real encontrado y corregido en Pedidos (`VERIFICACION_AGILIDAD_2026-09-20.md`).

## Traspasos: no tenía el fallo exacto, pero sí el mismo defecto de fondo — corregido

La pantalla de Traspasos calcula el total (peso × precio) de forma **síncrona** al pulsar "Grabar", directamente de los campos del formulario — a diferencia de Pedidos, aquí no hay ningún cálculo asíncrono/debounced de por medio (no hace ninguna llamada al servidor mientras se teclea), así que el fallo concreto de Pedidos (grabar antes de que termine un cálculo en curso) **no podía reproducirse tal cual**.

Pero el servidor (`backend/src/routes/traspasos.js`) sí tenía el mismo defecto de fondo: aceptaba directamente `base`/`total`/`total_kg` y el `total` de cada línea que mandara la pantalla, sin recalcularlos él mismo — exactamente lo que ya se corrigió en Pedidos y lo que Compras nunca ha hecho. Aunque hoy no era explotable por una vía normal de uso, no tiene sentido dejar esa puerta abierta cuando el servidor ya tiene todos los datos (peso, precio) para calcularlo él mismo. **Corregido, por coherencia con el mismo principio ya aplicado en Compras y Pedidos**: nueva `calcularCabeceraTraspaso()`, reutiliza `calcularTotalLinea()` (la misma función ya usada para Pedidos) para el total de cada línea — el servidor ya no acepta ningún total/base venido de la pantalla, los calcula siempre él mismo a partir de peso/precio.

## Repartos: mismo defecto de fondo (sin dinero de por medio) — corregido por coherencia

Reparto Super no lleva IVA ni partida ni precio — solo cajas y kilos, así que aquí no hay ningún riesgo de facturar mal. Pero el servidor (`backend/src/routes/repartos.js`) también aceptaba `total_cajas`/`total_kg` directamente de la pantalla en vez de sumarlos él mismo desde las líneas. Corregido igual, por la misma coherencia: nueva `calcularCabeceraReparto()`, suma cajas/kg de las líneas en el servidor.

## Probado con datos reales

Con Playwright, creando un traspaso real (4 cajas, 12 kg, 5,00 €/kg de ABADEJO RIA) y un reparto real (7 cajas, 21 kg del mismo artículo, destinatario de prueba):

- Traspaso nº 49: `total_kg=12`, `base=60,00 €`, `total=60,00 €` — correcto (12 × 5,00).
- Reparto nº 138: `total_cajas=7`, `total_kg=21` — correcto.

Ambos registros de prueba se borraron después (a diferencia de Compras, Traspasos y Repartos sí tienen `DELETE` real — no son "dato sagrado"). Se comprobó que los recuentos volvieron exactamente a los reales (43 traspasos, 135 repartos) y se repitió la regresión completa: `verificar_migracion.js` (71.018 comprobaciones, 0 diferencias) y `verificar_fase2.js` (todas superadas).

## Conclusión

Ninguno de los dos tenía el fallo EXACTO de Pedidos (ninguno tiene un cálculo asíncrono en el camino que pudiera quedarse a medias), pero ambos compartían la misma causa raíz — el servidor confiando en un total calculado por la pantalla — y ya están corregidos por el mismo principio que Compras aplicaba desde el principio: **el servidor calcula siempre lo que él mismo puede calcular con los datos que ya está validando, nunca se fía de la pantalla.** Con esto, las cuatro pantallas que graban dinero o cantidades agregadas (Compras, Pedidos, Traspasos, Repartos) quedan consistentes en este punto.
