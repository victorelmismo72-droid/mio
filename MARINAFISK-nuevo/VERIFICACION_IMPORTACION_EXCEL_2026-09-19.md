# Verificación: Importación de catálogos desde Excel (FASE_6) — 19/09/2026

Fecha: 2026-09-19

Ver `FASE_6_importacion_excel_MARINAFISK.md` para el porqué de cada regla y las dos adaptaciones necesarias frente al HTML actual (artículos: baja = desactivar, nunca borrar; compras: nunca modificar una ya existente). Probado con ficheros `.xlsx` **reales**, generados con la misma librería XLSX ya usada por el sistema (no construidos a mano campo a campo), subidos de verdad a través de un Chromium real (Playwright) contra el backend y la base de datos reales.

## Qué se ha probado

1. **Clientes** (hoja "CLIENTES", con dos filas de título antes de la cabecera real, para comprobar que la detección de la fila de cabecera no asume que es la fila 1): un cliente nuevo (90001) dado de alta y un cliente real ya existente (50003, PESCADOS VALDIZARBE) con el nombre actualizado — ambos visibles en la tabla tras la importación, y los 162 clientes restantes que no venían en el Excel se conservaron tal cual.
2. **Proveedores** (hoja "PROVEEDORES"): alta de un proveedor nuevo, visible en la tabla.
3. **Catálogo de artículos** (hoja "PRODUCTOS", `MOSTRAR EN LISTA` con "S" y "s" en minúscula, para comprobar que no es sensible a mayúsculas): con solo 3 artículos marcados (dos reales + uno nuevo), los **154 artículos reales pasaron a 3 activos**, y los 152 restantes se marcaron `activo = false` **sin borrarse** — el total de artículos (activos + inactivos) pasó de 154 a 155 (el nuevo), confirmando que nada se perdió. Los artículos desactivados dejan de ofrecerse al elegir artículo en Compras/Pedidos/Repartos/Traspasos/Listas de precio/Etiquetas sueltas nuevas (se filtran por `activo` en las 6 pantallas que dan de alta documentos), pero se siguen viendo y pudiendo reactivar a mano en la propia pantalla de Artículos.
4. **Traducciones** (hoja que empieza por "TRADUC", con columnas "Código" y "TRADUCCIÓN COMPLETA"): nombre en francés actualizado correctamente para un artículo real (C650 → "LIEU JAUNE DE CÔTE"), y un código inexistente en el Excel correctamente listado como "no encontrado" sin detener el resto de la importación.
5. **Compras** (hoja "COMPRAS"): una compra real nueva dada de alta (partida 60500, 2 líneas agrupadas por partida+albarán+proveedor), con dos filas del Excel correctamente **ignoradas** sin bloquear el resto: una fila de totales sin número de partida real, y una fila sin código de proveedor. **Reimportar el mismo Excel una segunda vez** dio "0 nuevas, 1 ya estaba igual" — no duplicó nada. Por separado (antes de esta prueba, con `curl` directo contra la API) se comprobó también el caso adaptado: si la misma partida+albarán+proveedor ya existe con datos **distintos**, la compra real no se toca (se sigue pudiendo comprobar con `SELECT` que sus cajas/kilos originales no cambiaron) y aparece en "conflictos" para que Víctor lo revise a mano — nunca se sobrescribe en silencio, a diferencia del HTML actual.
6. **Móvil (375px)**: las 4 pantallas con botón de importación (Clientes, Artículos, Proveedores, Compras) sin scroll horizontal.

## Un problema real de mi propio guion de pruebas, no de la aplicación

Al construir el primer `.xlsx` de prueba para Compras con una fecha como objeto `Date` de JavaScript, la celda salía vacía al volver a leerla (un problema de cómo mi guion de generación escribía la fecha, no de la lógica de importación real). Se detectó porque la importación decía "no se ha encontrado ninguna compra válida" con un Excel que a simple vista tenía datos — se investigó con un guion aparte que vuelca fila a fila lo que lee el navegador, confirmando que la celda de fecha llegaba vacía. Se corrigió construyendo la fecha de prueba como texto ("2026-09-15", el mismo formato que cualquier Excel real exporta o que alguien teclea a mano), que es exactamente el otro camino real que ya contempla el código (`new Date(fechaRaw)` si no es ya un objeto `Date`). Con esto, la importación funcionó correctamente — quedó demostrado que el fallo era del generador de prueba, no de `parsearComprasExcel`.

## Regresión

Tras las pruebas se reconstruyó la base de datos desde el backup real. Se repitió `verificar_migracion.js` (71.018 comprobaciones, 0 diferencias) y `verificar_fase2.js` (todas correctas) — idénticas a las anteriores, sin ninguna diferencia introducida por esta fase.

## Conclusión

**Los 5 importadores de catálogo probados con ficheros `.xlsx` reales y navegador real**, incluyendo los casos límite (cabecera desplazada, mayúsculas/minúsculas en "S", filas de totales, código repetido — validado también aparte con `curl`, columna que falta) y las dos adaptaciones de seguridad frente al HTML actual (artículos: baja = desactivar; compras: nunca modificar una ya grabada). Queda fuera, tal como ya señalaba `FASE_6_importacion_excel_MARINAFISK.md`: el "deshacer última importación" (sustituido por el mecanismo real de copia de seguridad, `backend/scripts/backup.js`) y la sincronización con la carpeta compartida (ya no aplica, Fase 3 usa base de datos compartida real).
