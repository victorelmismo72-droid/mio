# Verificación: Listados de gestión — ventas vs traspasos (18/09/2026)

Fecha: 2026-09-18

Este era el único punto pendiente de Fase 4 Nivel 2 que tenía especificación suficiente para construirse ahora mismo (los otros dos pendientes —Etiquetas y login— siguen fuera de alcance: Etiquetas por falta de un formato definido por Víctor, y login porque Fase 3 ya decidió que no hace falta mientras el uso sea en red local de confianza). Viene de la corrección 02/09/2026 punto 3 y de `FASE_2_logica_de_negocio_MARINAFISK.md` punto 5bis: cualquier listado de ventas/movimientos por artículo y fecha debe separar siempre las ventas reales de los traspasos internos a Zaragoza, nunca mezclarlos en silencio — pero sí dejar ver, si se pide explícitamente, el total de pescado movido (venta + traspaso) para estadística de volumen.

## Qué se ha construido

- **Backend:** `GET /api/listados/ventas-articulo?desde=&hasta=&articulo_id=&incluir_traspasos=1` (`backend/src/routes/listados.js`). Por defecto solo consulta `pedido_lineas` (ventas reales). Con `incluir_traspasos=1`, añade también `traspaso_lineas`, marcadas con `tipo:"traspaso"` y sin `importe` (un traspaso no tiene precio de venta). Devuelve las líneas mezcladas y ordenadas por fecha, más los tres totales por separado: `ventas_kg`, `ventas_importe`, `traspasos_kg`, `total_movido_kg`.
- **Pantalla:** "Listados de gestión" (`#/listados`, `backend/public/js/pantallas/listados.js`), con filtro por fecha (desde/hasta) y por artículo concreto (buscador con autocompletado, igual que en las demás pantallas), y la casilla "Incluir también los traspasos internos a Zaragoza". Las filas de traspaso se pintan en gris/cursiva con la etiqueta "TRASPASO A ZARAGOZA (interno, no es venta)" y sin importe — nunca como si fueran una venta más.

## Prueba real (API directa y navegador real)

Con datos reales del backup migrado, filtro 2026-08-01 a 2026-08-05:

- **Sin marcar "incluir traspasos":** 125 líneas, todas de venta. Total: **6.583,5 kg — 29.586,75 €**.
- **Con la casilla marcada:** 147 líneas (125 ventas + 22 traspasos), las de traspaso claramente diferenciadas (fila gris/cursiva, sin importe). Totales en tres líneas separadas, tal como pide el punto 5bis:
  - Ventas reales: 6.583,5 kg — 29.586,75 €
  - Traspasado a Zaragoza (interno, no es venta): 652,8 kg
  - Total pescado movido (solo estadística de volumen): 7.236,3 kg
- **Filtro por un artículo concreto** (C387, boquerón): se comprobó que todas las filas devueltas son de ese artículo, tanto en la API como en la tabla ya pintada en pantalla.
- **Móvil (375px):** la pantalla nueva no introduce scroll horizontal (comprobado con el mismo guion de medición usado en `VERIFICACION_USABILIDAD_2026-09-18.md`).

Todo probado con Chromium real (Playwright) contra el backend y la base de datos reales — no son datos de prueba inventados, son las ventas y traspasos migrados del backup real de Víctor. Como la ruta es de solo lectura, no ha hecho falta limpiar nada en la base de datos después.

## Conclusión

**Construido y probado con datos y navegador reales.** Con esto, de lo que quedaba pendiente en Fase 4 Nivel 2 solo faltan ya Etiquetas (sin formato definido) y login (fuera de alcance por ahora) — ambos ya señalados honestamente en `FASE_4_interfaz_MARINAFISK.md` como no construidos, no como olvidados.
