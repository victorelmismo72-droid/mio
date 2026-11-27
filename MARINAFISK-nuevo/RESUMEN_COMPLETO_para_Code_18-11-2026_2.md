# RESUMEN PARA CODE — 18-11-2026 (actualiza el del 02-11; el del 02-11 sigue valiendo para Excel y reglas de negocio)

## Archivo vigente
`CARGA_DE_ALBARANES_MARINAFISK_2026-11-20_ENTER.html` (HTML de un solo fichero, localStorage `DB.get/set`). Copia espejo: `..._2026-09-02-CORREGIDO.html` (cuidado: el usuario ve copias "(1)/(3)" si el nombre se repite → entregar siempre con nombre nuevo + etiqueta amarilla visible en la barra de estado, hoy "NUEVO 19-11 · PARTIDAS RÁPIDAS").
Usuario: Víctor (Marinafisk, Lonja A Coruña); colega Pancho en Zaragoza. Español informal, un cambio cada vez, directo, "Reales, seguras". SOLO se ha probado en Playwright/jsdom/LibreOffice/openpyxl; **nunca en su Chrome/Excel/impresora reales** → decirlo siempre.

## Cambios de esta etapa
### Existencias
- Modelo `{fecha, lineas:[{art,desc,cant,peso,precio,nota,vendido}|{sep:true}]}`. Listado `exDatosListado()`: filtra fechas, modo vendidos (`exVerVendidos`/`exSoloVendidos`; select Mostrar: sin/con/solo vendidos), texto (`exFiltroTexto`, p.ej. Celeiro), limpia separadores (`exLimpiaSeps`).
- Casilla "Vendido" (rojo; si vendido total no sale en listados pero SÍ en estadísticas); bultos/kg editables para venta parcial.
- Excel propio (SheetJS 1.15 no estila): escritor xlsx a mano (`exCrc32`, `exZip` store, `exEstilos`, `exHojaXml`, `exConstruirXlsx`), bandas de día grises con día centrado y nombres gallegos (`EX_DIAS`, `exCabDia`, `exCabMatriz`), fila en blanco entre artículos, celda gris sin precio.
- Campo kilos admite suma `12,4+8,1` (Intro/Tab) con `normalizarCampoNumerico`, `resolverSumaSiProcedeEnEnter`.
### Traspasos
- Columna PIEZAS (formulario, totales, PDF, estadísticas).
### Estadísticas a pantalla completa
- `.modal-box.pc` (100vw/100vh, flex columna), `.pc-scroll` con thead sticky, totales/filtros fijos. BUSCAR ARTÍCULOS (`#modal-artcli`) con bandas de día; PRECIO MEDIO; EXISTENCIAS en dos columnas (`.ex-grid`).
- Precio medio de venta incluye kg de existencias (`kgSP`, `kgTrp`, `kgEx`, `pmv-exist`); precio/importe solo sobre kg vendidos. **Duda abierta**: existencias marcadas vendidas cuentan también en Kg (posible doble conteo); ofrecido excluirlas, sin respuesta.
### Cabecera
- Etiqueta de versión movida a la barra de estado; pestañas de navegación visibles (SINCRONIZACIÓN incluida), botones sin partir.
### COMPRAS (nuevo hoy) — formato Existencias
- `#panel-compras.active` = grid 2 columnas a pantalla total (CSS "COMPRAS pantalla total"), alto fijado por `ajustarAltoCompras()` (en goPanel, +400/1500 ms y resize; ancho 100vw saltando el contenedor).
- Izquierda `.cp-card-izq`: registrar compra (IDs intactos: cp-fecha, cp-albprov, cp-prov-*, cp-lineas, grabarCompra…). Columnas de desglose (Base Zgz/Base+IVA/2%/Base Real/IVA) ocultas salvo casilla "ver desglose IVA/2%" (clase `cp-desglose`). Debajo, "COMPRAS DE ESTE DÍA" (`renderComprasDelDia()`, se llama al cambiar `cp-fecha` y desde `filtrarCompras()`), solo lectura.
- Derecha `.cp-card-der`: histórico editable en sitio (`guardarLineaCompra`, `toggleControlLineaCompra`, `cambiarProveedorLineaCompra`, `cambiarArticuloLineaCompra`, `anularCompra`), agrupado por día con bandas (`.cp-dia`, orden fecha desc y partida desc), barra de totales fija (`cpb-*`, actualizada en `actualizarTotalesCompras`; el `tfoot` original está oculto).
- Filtros: partida, alb. proveedor (`his-cp-albprov`), proveedor, producto (código/descripción), desde/hasta, control (`his-cp-control`: todos/sin comprobar/comprobados). Lógica común `lineaPasaFiltroCompras(l)` + `obtenerComprasFiltradas()`; `obtenerLineasCompraFiltradas()` alimenta impresión (`imprimirListadoCompras`: A4 apaisado, filtro en cabecera, bandas por día) y Excel (`exportarExcelCompras`: SheetJS plano, sin estilos ni bandas).
- Se conservan: Precio medio del día, Asignar partidas de hoy, Partidas abiertas, Importar compras Excel, Próxima partida, sync carpeta compartida (`comprasCarpetaCache`, `sincronizarCompraTrasGrabar`, `_uid`, `_remoto`).
- Tests: Playwright 1366×768 y 1920×1080 (filtros, edición, totales, impresión con filtro, lista del día). Sin errores de página.

## PARTIDAS (añadido 18-11, última versión) — el Nº de partida lo pone el usuario
- Regla de negocio nueva: el Nº de partida viene del Excel de compras de Víctor (columna N PARTIDA); la app NO lo inventa salvo que se deje vacío.
- COMPRAS: casilla `#cp-partida-in` ("Nº partida"); `grabarCompra()` usa `parseInt` de esa casilla y, si está vacía, cae a `partidaParaCompra()` (siguiente automático, `nextPartida`). `#cp-partida-disp` queda oculto por compatibilidad. `initCompras()` la vacía.
- IMPORTAR (`importarComprasExcel`): ya leía N PARTIDA y agrupa por partida|alb|proveedor. Nuevo: si ALB PROV/COD PROV llegan como Date (celda con formato fecha en el Excel, p.ej. fila 4 partida 5901) se convierten al nº de serie (`numDeFecha`: 1986-07-02→31595, 2037-03-07→50106). Probado con GESTION_CORRECTA_precio_medio_arreglado_53.xlsx: 1298 compras; hay partidas compartidas por 2 proveedores (55923) y rango 5900–56936.
- ASIGNACIÓN en albaranes por producto + kilos: `obtenerPartidasDisponibles(producto, reservas)` ahora AGRUPA por nº de partida (suma kilos de todas las compras con ese nº y familia de producto, coste medio ponderado), resta `kilosVendidosDePartida` + `reservas` (líneas aún sin grabar). `reservasLineasPed(i)` (otras líneas de la pantalla de pedido) y `reservasDia` (en `asignarPartidasDelDia`). `elegirPartidaAuto(disp, peso, precioVenta)`: entre las partidas que CUBREN el peso elige la más antigua con margen ≥ `MARGEN_MINIMO_PARTIDA` (1,30); si ninguna cubre el peso entero, ordena por kilos libres desc. Devuelve `{elegida, base, conMargen}`; sin margen → el usuario elige a mano (excepciones). Lista desplegable muestra kg libres. Cierre manual de partidas (`partidas_cerradas_manual`) se mantiene.
- Test (Playwright): partidas 9001=50kg, 9002=100kg; ventas 30/30/80 → 9001, 9002, 9002.
- Limitaciones/pendiente: una línea NO se parte entre dos partidas; no se puede editar el Nº de partida de una compra ya grabada desde el histórico (hay `cambiarProveedorLineaCompra` pero no cambio de partida); pendiente preguntar a Víctor si quiere quitar la regla de margen y asignar solo por kilos. Sin probar en Chrome real.

## ACTUALIZACIÓN 18-11 mediodía — partidas en albaranes DESACTIVADAS por lentitud
- Archivo vigente: `..._2026-11-18_SINPARTIDAS.html`. Flag `PARTIDAS_ALBARAN_ACTIVAS=false` (antes de `construirCeldaPartida`): la celda de partida muestra solo la partida ya guardada o "—"; `autoAsignarPartidas()` y `asignarPartidasDelDia()` no hacen nada (alert). Se mantiene TODO lo de Compras (Nº partida manual, importar, cambio proveedor pide partida, filtros, pantalla total) y la lista de precios con EXIST. CAJAS + EXIST. KG (`.input-fila-manual-existkg`, columna EXIST. KG en la imagen interna).
- Causa de la lentitud (medida con Excel real importado, 1298 compras/103 productos + 3000 albaranes ×8 líneas + albarán de 25 líneas): `renderLineasPed()` 10,7 s con partidas vs 3 ms sin. `DB.get` hace `JSON.parse(localStorage)` en cada llamada y `obtenerPartidasDisponibles`/`kilosVendidosDePartida`/`sonMismaFamiliaProducto` lo llaman dentro de bucles (compras, historial, historialTrp, articulos) por cada línea y cada partida candidata.
- Prototipo de solución (no incluido en el HTML): caché en memoria invalidada en `DB.set` de compras/historial/historialTrp/articulos: (1) índice de artículos por código, (2) índice de vendidos por nº de partida (historial+traspasos), (3) compras sin partidas cerradas calculadas una vez. Resultado idéntico (comparado partida a partida) y 10,7 s → ~30 ms la primera vez y ~19 ms después. Pendiente de reactivar tras aprobación de Víctor (poner el flag a true + incluir la caché).

## ACTUALIZACIÓN 19-11 — partidas en albaranes REACTIVADAS con caché (archivo vigente: `..._2026-11-19_PARTIDAS_RAPIDAS.html`)
- `PARTIDAS_ALBARAN_ACTIVAS = true` (poner a false para desactivar de nuevo; sigue disponible).
- Bloque "CACHÉ DE PARTIDAS" al final del último `<script>` (copia en `PROTOTIPO_cache_partidas.js`, versión del HTML con la corrección de cerradas): sobrescribe `sonMismaFamiliaProducto`, `kilosVendidosDePartida`, `obtenerPartidasDisponibles` y envuelve `DB.set`. Caches: índice de artículos por código, memo de pares de familia, índice de vendidos por nº partida (historial+historialTrp), lista de compras. Se invalidan al `DB.set` de compras/historial/historialTrp/articulos y en el evento `storage`. Partidas cerradas manualmente (`localStorage partidas_cerradas_manual`) se leen en cada llamada (no cacheadas). Todas las escrituras de datos del programa pasan por `DB.set` (verificado con grep).
- Medido con Excel real (1298 compras, 103 productos) + 3000 albaranes×8 líneas + albarán de 25 líneas: `renderLineasPed` 12,7 s → 0,09 s; resultados idénticos (partidas disponibles, asignación, tras cerrar/reabrir partida y tras grabar una venta) comparados contra la versión sin caché. Test de kilos 9001/9002 sigue dando 9001,9002,9002.
- Pendiente: que Víctor confirme velocidad en su Chrome real con sus datos.

## 19-11 — panel "📋 MODELOS" (catálogo de listados)
- Interpretación: "carpeta de listados" = panel `#panel-modelos`. Añadida tarjeta "📊 LISTADOS Y ESTADÍSTICAS" con 10 entradas + botón Abrir (listado pedidos, sin precios por agencia, líneas a cero, buscar artículos, precio medio de venta, existencias, compras, precio medio día/partidas abiertas, lista de precios clientes, lista uso interno). Ejemplos de albarán/traspaso con PIEZAS. Archivo: `..._2026-11-19_LISTADOS.html` (etiqueta "NUEVO 19-11 · LISTADOS"). Sin confirmar con Víctor que era este panel.

## 19-11 — Agencias de transporte (archivo vigente `..._2026-11-19_AGENCIAS.html`, etiqueta "NUEVO 19-11 · AGENCIAS")
- Agencias válidas SOLO: TRANSFRIO, KARTIN, OLANO, MOUZO, FARIÑA. Antes el select `#c-ag` tenía HOLLANO/CARPIN/MOZO (mal escritos).
- `normalizarAgencia()` (CARPIN→KARTIN, HOLLANO/HOLANO→OLANO, MOZO→MOUZO) aplicada al leer: ficha cliente, pedido, PDF albarán, filtros de HISTORIAL/listados/Excel, lista de agencias, importación de clientes. Botón CMR ahora depende de 'MOUZO'.
- `migrarNombresAgencias()` (una vez, flag `mig_agencias_20261119`, en `window.onload`) reescribe `agencia` en `clientes` (con `_modTimestamp`) y `historial` local. Los pedidos remotos de la carpeta compartida no se reescriben, solo se normalizan al leer.

## 19-11 08:45 — partidas en albaranes OTRA VEZ DESACTIVADAS a petición de Víctor (`PARTIDAS_ALBARAN_ACTIVAS=false`, caché sigue en el código). Archivo vigente `..._2026-11-19_AGENCIAS2.html`. Compras sigue con todo (Nº partida manual, etc.).

## 19-11 08:55 — AGENCIAS3: la migración de agencias hacía saltar el aviso "datos DISTINTOS en este ordenador y en la carpeta compartida" en ~45 clientes (local KARTIN vs remoto CARPIN). `obtenerClientesCombinado()` ahora compara con `normalizarAgencia()` en ambos lados y normaliza los remotos al mostrarlos.

## 19-11 09:10 — AGENCIAS4: Víctor siguió viendo el aviso de conflictos de clientes con AGENCIAS3. `obtenerClientesCombinado()` compara ahora solo campos de ficha (sin claves que empiezan por _), trim, vacío=inexistente, agencia normalizada; y devuelve `detalles` (campo: "local" ≠ "remoto") que `renderCli` muestra junto a cada código para diagnosticar. Causa real pendiente de ver con su captura.

## 19-11 09:20 — ALBPROV: columna "Alb. Prov" del histórico de Compras ahora es un input editable (Intro/salir de la casilla) → `guardarAlbProvCompra(uid, valor)` cambia `albProveedor` de TODA la compra (mismo uid), actualiza `_modTimestamp`, `DB.set` y `sincronizarCompraTrasGrabar`. Pendiente posible: Nº de partida editable en el histórico.

## 19-11 09:35 — COMPRASEDIT: "COMPRAS DE ESTE DÍA" (izquierda) ahora EDITABLE: alb. prov., cajas, kilos, €/Kg (ids `cpd_caj_/cpd_kg_/cpd_pr_/cpd_tot_<uid>_<li>`), se guarda al salir de la casilla vía `guardarLineaCompra(uid,li,'cpd')` (nuevo parámetro de prefijo de ids) y `guardarAlbProvCompra`. `window.__noDia` evita re-renderizar la lista del día mientras se edita (mantiene el foco). Corregido bug CSS: ocultar columnas de desglose ahora solo afecta a `.cp-form-tabla` (antes también recortaba la lista del día). Sin editar aún: partida, proveedor, artículo en la lista del día (sí en el histórico de la derecha, salvo partida).

## 19-11 09:25 — PARTIDAEDIT: Nº de partida editable en histórico (derecha) y en "compras de este día" (izquierda): `guardarPartidaCompra(uid,valor,input)` cambia `partida` de toda la compra; confirma si hay albaranes/traspasos que ya usan la partida antigua (no se reescriben); sube `nextPartida` si procede; sincroniza.

## 19-11 13:05 — HISTORIAL1: en HISTORIAL de pedidos, la barra "N pedidos… / Actualizar ahora / Corregir contadores / Verificación completa" va en UNA línea (flex nowrap, el texto de estado se recorta con …) y cliente (cód., nombre, agencia) con `white-space:nowrap` → filas de una sola línea.

## 20-11 · Enter = siguiente casilla + suma de kilos (Compras y estadísticas)
- Formulario de carga de compra (`renderLineasCompra`): ids `cpa_/cpc_/cpk_/cpp_<i>`; `cpTecla(ev,i,col)` mueve artículo → cajas → kilos → €/Kg → artículo de la línea siguiente (crea línea nueva si es la última). En artículo, Intro elige la primera sugerencia.
- Kilos del formulario ahora `type=text inputmode=decimal`; admite sumas `12,4+8,1` (primer Intro resuelve la suma, el segundo pasa de casilla) vía `normalizarNumeroLibre` / `resolverSumaSiProcedeEnEnter`.
- `updLineaCompra` ya no reconstruye la tabla: solo recalcula las 6 celdas de importes de esa fila (el cursor no se pierde).
- Histórico (`cph_kg_`) y lista "compras de este día" (`cpd_kg_`): kilos con suma; `guardarLineaCompra` normaliza.
- Listener global `keydown` al final del último `<script>`: Intro → siguiente input dentro de `#his-cp-body`, `#cp-dia-body`, `#modal-artcli`, `#modal-listado-analisis`, `.cp-filtros`.
- Probado solo con Playwright (no en entorno real). Partidas en albarán siguen DESACTIVADAS (`PARTIDAS_ALBARAN_ACTIVAS=false`).

## Pendiente / ideas
- Lista del día en Compras editable (hoy solo lectura; se edita en el histórico).
- Excel de compras con el mismo estilo que Existencias (bandas de día, estilos) usando el escritor xlsx propio.
- Matriz tipo Excel (artículos × días) en Existencias.
- Decidir doble conteo existencias vendidas en precio medio.
- Ley de envases (RD 1055/2022 / Implica / SCRAP): esperando datos de Víctor (ver /areas/envases-normativa).
- Documentos CORRECCIONES / PANEL_COMPRAS_para_Code siguen describiendo el panel de compras ANTIGUO.

## Trampas técnicas
- Parches Python por reemplazo de cadenas: asegurar que el patrón es único (`count==1`); algunos textos de estilos se repiten entre pedidos y compras.
- Los overlays modales de inicio (carpeta/puesto) tapan la pantalla en tests: ocultarlos antes de capturar.
- Entregar archivo con nombre distinto cada vez.
