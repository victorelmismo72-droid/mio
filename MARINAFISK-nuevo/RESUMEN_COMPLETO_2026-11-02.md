# RESUMEN COMPLETO PARA CODE — Marinafisk (actualizado 02/11/2026)

Dos herramientas de Víctor (Marinafisk Pescados, Lonja de A Coruña; compañero Pancho en Zaragoza):
- **HTML**: `CARGA_DE_ALBARANES_MARINAFISK_2026-09-02-CORREGIDO.html` (un solo archivo, jsPDF; último entregado = el bueno).
- **Excel**: `GESTION_CORRECTA_precio_medio_arreglado.xlsx` (PANEL COMPRAS, PRECIO MEDIO, COMPRAS, PROVEEDORES, PRODUCTOS, CLIENTES, AGENCIAS, ZONAS Y TIPOS PESCA, LOCALIDADES SUPER, LISTA PRECIOS, AUX_BUSCADOR oculta).
Documentos anteriores que siguen valiendo: `CORRECCIONES_02-09-2026_para_Code.md` (22 puntos), `PANEL_COMPRAS_para_Code.md`, `FASE_0..4`, `MARINAFISK_TODAS_LAS_FASES.md`.
Preferencias del usuario: español informal, implementación directa, un cambio cada vez, "reales y seguras", honestidad sobre lo no probado (nada se ha probado en su Excel/WhatsApp/Chrome reales; solo jsdom, LibreOffice y PDFs renderizados).

---
## A. HTML — qué hay hecho (resumen de todo lo reciente)
1. **Palets (documento electrónico de control, desde 05/10/2026)**: al grabar Pedidos, Traspasos y Repartos se pregunta el nº de palets (por defecto 0, subrayado); si no lleva palet, se imprime **PALET VARIADO**. Sale también en la impresión sin precios. Transfrío: coords `palets:{x:180,y:103}` (justo debajo de KG). Funciones: `pedirPaletsYGrabar`, `partesPaletsDocumento`, ficha de envío en `MarinaFiskEtiquetas.dibujarFichaEnvioEnPdf`.
2. **Cantidad libre** en Repartos/Traspasos: coma decimal y sumas ("10,5+20") → `normalizarNumeroLibre`, `resolverSumaSiProcedeEnEnter`.
3. **Historial**: iconos compactos (sin desbordar).
4. **Lista de precios manual → "Dos portes" (24/10)**: tercer tipo `dosportes` (botón 🚚 Dos portes (+1 €)). El usuario escribe el precio normal y en la imagen se suma `EXTRA_DOS_PORTES = 1` (`extraTipoLista`). Margen/alerta de pérdida cuentan el euro. Se rellena copiando Pescaderías; botón "↻ Copiar precios de Pescaderías". Subtítulo "DOS PORTES — PRECIO EN DESTINO". *Suposición*: el +1 se suma a lo que escribe en esa lista propia.
5. **Enviar lista de precios por WhatsApp (24/10)**: botón 📱 en la tabla; modal para elegir clientes con teléfono + números sueltos; recuerda la selección por lista (`destListaPrecios_<tipo>`); guarda la PNG y abre `wa.me` por cliente (adjuntar a mano, igual que los albaranes); extra "📤 Compartir imagen" (Web Share API si el navegador lo permite).
6. **Carpeta compartida de Pancho (24/10)**: síntoma "no conectada" sin mensaje. Causa probable: tras cerrar/actualizar Chrome/Edge `queryPermission` = `prompt` y `intentarReconectarCarpetaGuardada` salía en silencio. Ahora: la barra dice el motivo; si hay permiso pendiente sale "🔄 Reconectar con un clic" (`reconectarCarpetaConUnClic`, `activarCarpetaDesdeHandle`). En su Chrome `requestPermission()` devolvió `prompt` → si no concede se abre `showDirectoryPicker` con `startIn` = handle recordado e `id:'marinafisk-compartida'`. **Sin confirmar si lo arregla.** (Pancho usaba un archivo llamado "…CORREGIDO (24).html": que use solo el último.)
7. **PIEZAS en pedidos (02/11)**: campo `piezas` por línea (entero ≥ 0, por defecto 0, 0 no se imprime). Hoja de pedido: columna entre CANT. y PESO KG (`pz_<i>`), "TOTAL PIEZAS"; orden de Intro: cant → piezas (seleccionado) → peso → precio → dcto (`navPed`, `updPed` fuerza entero). PDF con y sin precios: columnas reajustadas en `dibujarAlbaranEnPdf` + "Piezas: N" junto a palets. También en Búsqueda de artículos (pantalla+impresión), Listado de pedidos impreso y como ÚLTIMA columna (PIEZAS) en CSV y Excel exportados (no se movió ninguna columna existente: el gestor importa ese formato). **No** se tocó Transfrío/CMR (papel preimpreso calibrado) ni Traspasos/Repartos.
8. **Precio medio de venta (02/11)**: `abrirPrecioMedioVenta` (botón 💶 junto a "Buscar artículos"): todos los artículos o uno (código/nombre), cliente y fechas opcionales (por defecto mes en curso). Media ponderada por kg (importe sin IVA ÷ kg), mín–máx, nº líneas, piezas; con un solo artículo, desglose día a día; imprimible. Excluye traspasos. Usa `obtenerHistorialCombinado()`.
Pendiente HTML: calibrar físicamente Transfrío/CMR; decidir backups ("Cerrar sesión" lento pero completo vs rápido); región de Windows en España (decimales); piezas en Traspasos/Repartos si se quiere; revisar que el +1 € de "Dos portes" sea la intención.

---
## B. EXCEL — estado y lecciones
### Cómo se carga (el usuario prefiere el método SIMPLE)
- **Buscador fijo** en COMPRAS U1:Z2 (proveedor/producto → devuelve el código para copiar). Es el que usa ahora; **no tocar**.
- **Buscador por fila (S:X) + partida sugerida (W)**: probado y abandonado. FALLO DE DISEÑO: D y G eran fórmulas `=IF($T..)` que leían S:X de su propia fila, y el rango de ordenación era A2:R → al ordenar por partida S:X no se movían y D/G se re-evaluaban contra datos de otra fila (proveedor/producto descolocados, líneas sin fecha: "he perdido las compras de hoy"). Se corrigió ampliando el filtro a A2:X4997, **sin probar en Excel real**. Regla: toda fórmula que dependa de celdas fuera del rango ordenable se rompe al ordenar.
- Regla de negocio de la partida: mismo proveedor + mismo día = misma partida; otro día = otra; correlativas; excepción dos puertos mismo proveedor/día = dos partidas.
- Dudas que quedaron sin responder (09/10): partidas 56679/56681 con el mismo proveedor 50160 el mismo día; filas 2757/2758 (COPESA, gallineta) posible duplicado.

### PRECIO MEDIO (compras) — causas de "no sale congrio/cintas/sardina…"
1. Fórmulas borradas/sobrescritas en la lista fija (G45:G56 sin "SI"; C54 = 145 a mano; el 31/10 otra vez G45 chicharro C396 y G55 congrio C250). Con el autofiltro de G (notEqual " ") las filas sin "SI" desaparecen. **No se sabe qué las borra**; se pidió al usuario que avise de qué hacía en esa hoja.
2. Artículos con compras que NO están en la lista fija (C144 merluza baka, C880 mejillón, C398 bonito norte, C3973 atún rojo, C2245 alcrique, C7033 potón, C192 pescadilla…).
3. Códigos inexistentes en COMPRAS (G20 = C2106 y G644 = C1200 → eran C142).
4. El 31/10 el filtro de PRECIO MEDIO estaba **quitado** (sin `autoFilter`, todas las filas visibles): se restauró `A9:G168` con customFilter notEqual " " y `filterMode="1"`, y se fijó `hidden` por fila según C>0.
Arreglo aplicado: fórmulas restauradas por el patrón de la fila 11; **zona automática** filas 170-221 (cab. 170, subtítulo 171, filas 172-221) que lista sola los artículos con compras en el período que no están en la lista (ayudas en AUX_BUSCADOR F:I: código, kg período, flag "falta", acumulado; zona usa `INDEX/MATCH(ROWS(..),I,0)`); **aviso rojo en A8** (fila visible); formato condicional rojo en C11:G167 `AND($A11<>"",NOT(_xlfn.ISFORMULA(C11)))`.
- `ISFORMULA` necesita prefijo `_xlfn.` en el XML (sin él, #NAME? y la alarma no salta).
- Tras cambiar fechas C4/D4 hay que reaplicar el filtro (Ctrl+Alt+L): el filtro no se refresca solo al recalcular.

### Trampas técnicas (para quien toque el xlsx)
- openpyxl pierde las validaciones x14 y estropea desplegables → editar el XML del zip directamente (sheet2 = PRECIO MEDIO, sheet3 = COMPRAS, sheet11 = AUX_BUSCADOR; sharedStrings aparte) y poner `fullCalcOnLoad="1"`. Reempaquetar con el mismo orden de entradas y SIN entradas de directorio (si no, openpyxl/LibreOffice dicen "invalid XML").
- Recalcular con LibreOffice rompe: panes congelados, botón +/- (collapsed en columna S), columnas L:R ocultas, el criterio del autofiltro de PRECIO MEDIO (quitarlo antes y restaurarlo después) y la caché de PANEL COMPRAS AA/AB. Usar LO solo en una COPIA para leer valores (`recalc.py` falla si el autofiltro tiene customFilter).
- Regex sobre XML: no usar `.*?` entre `<f>` y `<v>` sin acotar (se come celdas contiguas); usar `<f[^>]*>[^<]*</f>`.
- Los scripts de construcción (construir_total, construir_pm2, patch_*…) ya no existen; si hay que repetir, reescribir sobre XML.
- Pendiente Excel: 13 nombres de PRECIO MEDIO que difieren del catálogo PRODUCTOS (decide el usuario); decidir si se añaden a la lista fija los artículos que hoy salen solo en la zona automática; retomar partida automática solo si se prueba la ordenación real.

---
## C. Reglas de trabajo con este usuario
- Usar siempre el último archivo entregado; si sube una copia suya sin los arreglos, reaplicar sobre ella.
- Decir claramente qué NO se ha podido probar (Excel real, WhatsApp real, Chrome de Pancho, impresoras/papel Transfrío).
- Cambios pequeños, de uno en uno; no mover columnas de exportaciones que consume el gestor.
