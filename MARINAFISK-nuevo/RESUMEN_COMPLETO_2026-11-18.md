# RESUMEN PARA CODE — 18-11-2026 (actualiza el del 02-11; el del 02-11 sigue valiendo para Excel y reglas de negocio)

## Archivo vigente
`CARGA_DE_ALBARANES_MARINAFISK_2026-11-18_PARTIDAS.html` (HTML de un solo fichero, localStorage `DB.get/set`). Copia espejo: `..._2026-09-02-CORREGIDO.html` (cuidado: el usuario ve copias "(1)/(3)" si el nombre se repite → entregar siempre con nombre nuevo + etiqueta amarilla visible en la barra de estado, hoy "NUEVO 18-11 · PARTIDAS").
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
