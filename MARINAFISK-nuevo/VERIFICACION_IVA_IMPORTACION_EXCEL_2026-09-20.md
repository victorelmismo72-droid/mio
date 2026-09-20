# Verificación: Columna "TIPO IVA" en la importación de Clientes/Proveedores — 20/09/2026

Fecha: 2026-09-20

Ver `FASE_6_importacion_excel_MARINAFISK.md` §2 — pieza pedida directamente por Víctor: "en la carga de clientes y proveedores debe existir la opción de mostrar/marcar qué clase de IVA/RE tienen". Es una columna **nueva** (el Excel original de Víctor no la trae), no una réplica de algo que ya existiera en el HTML actual. Probado con Chromium real (Playwright) y ficheros `.xlsx` reales (generados con la misma librería `xlsx.js` ya usada, no simulados a mano) contra el backend y la base de datos reales.

## Qué se ha construido

- `backend/public/js/importacionExcel.js`: columna opcional "TIPO IVA" en `parsearClientesExcel` (hoja CLIENTES) y `parsearProveedoresExcel` (hoja PROVEEDORES). Admite el valor exacto de la base de datos y algunos sinónimos razonables en español (`normalizarTipoIva`): para clientes "Normal"/"Recargo de Equivalencia"/"Recargo"/"Intracomunitario"/"UE"; para proveedores "Nacional"/"Intracomunitario"/"UE". Un valor no reconocible es un error de fila que bloquea toda la importación (igual que un código repetido), con el texto exacto que no se entendió.
- `backend/src/routes/clientes.js` / `proveedores.js`: `tipo_iva` añadido a los `campos` de `upsertCatalogoPorCodigo`, con la misma validación server-side (nunca confiar solo en lo que valide el navegador) antes de tocar la base de datos.
- Si una fila no trae la columna (o la celda está vacía), el tipo de IVA se conserva tal cual estuviera — `upsertCatalogoPorCodigo` ya distinguía "el Excel no trae este campo" de "el Excel lo trae vacío", así que no ha hecho falta ningún cambio ahí.

## Qué se ha probado

1. **Proveedores, import bueno**: fichero con COPESA (existente, celda de IVA vacía → sin cambios), FORO-MAREE (existente, ya `INTRACOMUNITARIO`, celda con el sinónimo "Intracomunitario" → sin cambios, no se cuenta como modificación porque el valor final es el mismo) y un proveedor nuevo con "INTRACOMUNITARIO" en mayúsculas → alta nueva con `tipo_iva = INTRACOMUNITARIO`. Confirmado leyendo la fila real en la pantalla de Proveedores tras la importación.
2. **Proveedores, import con un valor no reconocido** ("ALEMANIA", que no es ni Nacional ni Intracomunitario): la importación entera se rechaza con el error exacto ("tipo de IVA "ALEMANIA" no reconocido…") y **no se crea ningún registro** — comprobado que el proveedor de esa fila no existe en la base de datos.
3. **Clientes, los 3 sinónimos de golpe**: "Normal" → `NORMAL`, "Recargo de Equivalencia" → `RECARGO_EQUIVALENCIA`, "Intracomunitario" → `INTRACOMUNITARIO` — los tres clientes de prueba se crearon con el valor canónico correcto, confirmado en la pantalla real de Clientes.
4. **Sin errores de consola ni de página** en ninguna prueba.

## Regresión

Se borraron los 4 registros de prueba creados (1 proveedor, 3 clientes) con `DELETE` real tras la prueba — se comprobó que el recuento de proveedores (51) y clientes (163) volvió exactamente al de antes de empezar, y que los 4 proveedores reales marcados como intracomunitarios el mismo día (`VERIFICACION_IVA_PROVEEDORES_2026-09-20.md`) siguen tal cual.

## Conclusión

Queda construida y probada con datos y ficheros reales la petición de Víctor: la carga de Clientes y Proveedores desde Excel ya puede traer el tipo de IVA/Recargo de Equivalencia, con validación estricta (nunca se adivina ni se ignora un valor no reconocido) porque un error aquí tiene consecuencia fiscal real.
