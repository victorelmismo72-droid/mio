# Verificación de la corrección 02/09/2026, punto 10 (recibida el 15/09/2026)

Fecha: 2026-09-15

Este punto llegó como una actualización del documento de correcciones, con dos problemas reales que Víctor encontró al usar la impresión en lote en el HTML actual: las copias por cliente salían mal agrupadas, y las pestañas automáticas se bloqueaban en silencio. Antes de construir nada, se revisó el código de impresión ya entregado (Fase 4 Nivel 2, 14/09) — y tenía exactamente el segundo problema: la ventana se abría con `window.open()` **después** de esperar (`await`) la respuesta del servidor, no en el mismo instante del clic. No había llegado a dar problemas en las pruebas anteriores solo porque Chromium fue tolerante con la espera corta de una red local rápida — pero es precisamente el tipo de fallo silencioso que la corrección describe, y que podría aparecer con una red más lenta o un navegador más estricto.

## Qué se cambió

- `backend/public/js/impresion/motor.js` se reorganizó en dos pasos: `abrirVentanaImpresion(titulo)` (síncrono, se llama siempre dentro del propio manejador de clic) y `rellenarSobrePapel(...)` / `rellenarAlbaran(...)` (se llaman después, cuando ya han llegado los datos, para rellenar la ventana que ya estaba abierta).
- Los tres sitios que imprimen (Historial, el botón Transfrío de Traspasos, el botón CMR de Pedidos) se cambiaron para abrir la ventana **antes** de pedir nada al servidor.
- Se añadió `copiasPorDocumento` a `rellenarSobrePapel`: repite cada hoja tantas veces como se pida, seguidas, antes de pasar al siguiente documento del lote — nunca depende del ajuste "copias" del diálogo de impresión del navegador. Se pregunta con `prompt()` (por defecto 4) al imprimir Transfrío.
- Si algo falla después de abrir la ventana, el error se muestra dentro de la propia ventana (`mostrarErrorEnVentana`) en vez de dejarla colgada en "Preparando…".

## Por qué no hizo falta el panel "Siguiente cliente / Parar aquí"

El HTML actual tuvo que construir ese panel porque su solución abre **una pestaña por cliente, en secuencia** — de ahí el problema de bloqueo. El sistema nuevo, desde el principio, genera **un único documento con una página por cliente** (y ahora, copias seguidas dentro de esa misma página) en **una sola ventana**. Al no abrir varias ventanas en secuencia, el problema de fondo no se presenta de la misma forma — basta con que esa única ventana se abra en el momento correcto (el clic), que es justo lo que se ha corregido. Es una forma distinta de evitar el mismo problema, no una que lo ignore.

## Prueba real (navegador, con la API deliberadamente ralentizada)

Se marcaron 2 pedidos reales en Historial, se pidió imprimir la Hoja Transfrío con 3 copias, y se forzó a propósito que la respuesta del servidor tardase 1200 ms (muy por encima de lo normal), para poder observar con claridad si la ventana se abre antes o después de esa espera:

- **La ventana nueva se detectó a los 277 ms del clic** — no a los ~1200 ms que habría tardado si se hubiera abierto después de la respuesta del servidor. Confirma que se abre en el momento del clic, no después.
- Su contenido, justo al abrirse, era **"Preparando 'Hoja Transfrío'…"** — confirma que se abrió vacía primero y se rellenó después.
- Al terminar, contenía **6 hojas** (2 pedidos × 3 copias) en el orden correcto: las 3 copias del primer cliente seguidas, luego las 3 del segundo — nunca intercaladas.

## Conclusión

**Corregido y probado con datos y navegador reales**, no solo revisado en el código. Se re-confirmó también que la migración (Fase 1) y la lógica de negocio (Fase 2) siguen sin ninguna diferencia tras este cambio.
