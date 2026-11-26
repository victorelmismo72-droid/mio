# MARINAFISK — Frontend del sistema nuevo

Este documento no estaba en el plan original de fases (Fase 0-5 solo cubrían reglas de negocio, base de datos/backend, lógica de negocio, sincronización, facturación y hosting) — hasta el 21/09/2026, todo lo construido era backend (API), probado a mano con `curl`/scripts, sin ninguna pantalla real. Empieza aquí porque, sin frontend, nadie puede usar de verdad lo que ya está construido, ni se puede terminar de verificar la Fase 2 (comparación de agilidad, ver `FASE_2_logica_de_negocio_MARINAFISK.md` punto 7).

**Objetivo confirmado por Víctor el 24/11/2026: el sistema nuevo debe funcionar EXACTAMENTE igual que el HTML real** (mismos campos, misma lógica de negocio), solo que con una imagen más profesional y preparado para varios puestos trabajando a la vez, cada uno con su propia impresora — esto último ya lo cubre la arquitectura (backend central en Postgres en vez de localStorage + carpeta compartida, y la impresión sigue siendo del navegador de cada puesto hacia lo que tenga configurado, sin nada especial que montar). A partir de esta fecha, además de los `RESUMEN_COMPLETO_para_Code_*.md`, Víctor puede pasar directamente el fichero HTML real (ej. `CARGA_DE_ALBARANES_MARINAFISK_2026-11-24_UNAFILA.html`) para verificar contra el código fuente real en vez de solo contra su resumen — así se encontraron varios huecos reales el mismo día (PIEZAS en Pedidos, no solo Traspasos; PALETS; precio por defecto = PVP1) que los resúmenes no habían mencionado.

---

## 1. Decisión de tecnología

**Un HTML/CSS/JS por pantalla, sin framework ni paso de compilación**, servido directamente por el propio backend (`backend/public/`, vía `express.static`) — mismo espíritu que ya pedía Fase 1 ("priorizar claridad del código... dado que Víctor no es programador") y que ya tenía el HTML actual (un solo fichero, se abre y funciona, nada que instalar ni compilar).

- `public/estilos.css` — estilos compartidos por todas las pantallas.
- `public/api.js` — ayudantes compartidos: llamadas al backend (`apiGet`/`apiPost`), generación de `idempotencyKey`, formato de número, y el "puesto" de este ordenador (ver punto 3).
- Un par `public/<pantalla>.html` + `public/<pantalla>.js` por cada pantalla (ej. `compras.html`/`compras.js`).

No hay build, no hay `npm run dev` para el frontend — se abre `http://localhost:3000/<pantalla>.html` (el mismo puerto del backend) y ya está.

---

## 2. Pantalla de Compras — implementada y probada el 21/09/2026

Primera pantalla construida, por petición explícita de Víctor ("el frontend EMPIEZA CON EL [Compras]"). Objetivo, igual que se pidió para la Fase 2 (punto 7): tan clara, concisa y rápida de teclear como el Excel `GESTION_CORRECTA`, con las mismas teclas que ya usa Pedidos en el HTML actual.

- **Campos de cabecera**: fecha (hoy por defecto), proveedor (autocompletar por código/nombre), albarán del proveedor, y **"Nº partida"** (opcional — corregido el 20/11/2026, ver Fase 2 punto 2: se teclea el número tal cual viene del Excel de Víctor; en blanco = automático).
- **Aviso de partida**: en cuanto hay fecha+proveedor, se consulta `GET /compras/partidas-del-dia` y se muestra, puramente informativo, qué números ya se usaron hoy con ese proveedor (sin tener que abrir el Excel) — ya no hay desplegable para "elegir" ni casilla de excepción: el caso raro de partida distinta el mismo día se resuelve solo tecleando otro número en "Nº partida".
- **Líneas**: producto (autocompletar por código/descripción), cajas, kilos (admite sumar varias cifras, ej. `12+13.5`, igual que el Excel — con el campo en rojo si la expresión no es válida), €/kg, control. Las columnas de cálculo (Base Zgz/2% OP/Base real/IVA/Total) son una **vista previa en vivo con la misma fórmula del servidor** (`calcularLineaCompra`) — lo que se manda al grabar son siempre los datos crudos (kilos como texto, precio, cajas), nunca un importe ya calculado; el servidor es quien decide de verdad (ver Fase 0 punto 2 / Fase 2 punto 1).
- **Navegación de teclado**: Tab/Enter recorre Cajas → Kilos → €/Kg → Cajas de la siguiente línea, y en el último campo de la última línea añade una línea nueva automáticamente — igual que `navCompra`/`navPed` del HTML actual. La navegación entre campos ya existentes es **síncrona** (sin retraso); solo el enfoque tras elegir un producto del desplegable (ratón) se pospone unos milisegundos — **mismo motivo exacto que ya resolvía `elegirArtCompra` en el HTML actual**: el elemento sobre el que se hizo clic desaparece del DOM al reconstruir la tabla, y el navegador resetea el foco al `<body>` justo después si no se pospone.
- **Grabar**: protegido con `idempotencyKey` (una por intento de compra, se reutiliza si falla y se reintenta — nunca una nueva por reintento) y con el botón deshabilitado ("⏳ Grabando...") mientras se procesa — dos capas, igual que exige `CORRECCIONES_02-09-2026_para_Code_6.md` punto 1 (servidor + pantalla, no solo pantalla). Al terminar bien, muestra la partida asignada y reinicia el formulario para la siguiente compra.
- **Puesto de este ordenador** (CORU/PANC): se pregunta una vez y se recuerda en `localStorage` de ese navegador (botón arriba a la derecha para cambiarlo) — se manda como `puestoOrigen` en cada compra.

**Probado end-to-end con Playwright (navegador real, no solo revisado) el 21/09/2026, y re-probado el 20/11/2026 tras el cambio de regla de partida:**
- Autocompletar de proveedor y de producto, con el emparejamiento de familia ya existente en el backend.
- Navegación completa por teclado (Cajas→Kilos→€/Kg→siguiente línea) tecleando del tirón, sin usar el ratón.
- Vista previa en vivo coincidiendo exactamente con lo que grabó el servidor (ej. 12+13,5 kg × 4 €/kg con 2% OP → 114,44 € en pantalla y en la base de datos).
- Aviso de kilos inválidos (rojo) apareciendo y desapareciendo correctamente al corregir.
- Partida manual tecleada (número alto, sin chocar con la secuencia automática), partida manual coincidiendo con la de otro proveedor (se reutiliza sin error), y la excepción (número manual distinto al de la principal del día) registrándose sola como excepción sin ningún flag.
- El servidor no se cae en ningún momento de la prueba (`GET /health` responde en todo momento).

---

## 3. Pantalla de Pedidos — implementada y probada el 22/11/2026

Segunda pantalla construida (`public/pedidos.html`/`pedidos.js`), mismo patrón y mismo objetivo que Compras.

- **Campos de cabecera**: Nº de albarán (opcional — corregido el 22/11/2026: antes no existía ninguna forma de generarlo, ver más abajo), fecha (hoy por defecto), cliente (autocompletar por código/nombre), agencia de transporte (desplegable con la lista cerrada de `backend/src/agencias.js`) y forma de pago — las dos últimas se rellenan por defecto con las del cliente elegido en cuanto se elige, pero siguen siendo editables para ese pedido en concreto (un envío puntual puede ir por una agencia distinta a la habitual del cliente). En cuanto se elige cliente se muestra, puramente informativo, su tipo de IVA (badge Normal/Recargo de Equivalencia/Intracomunitario) y su dirección.
- **Corrección real encontrada al construir esta pantalla (22/11/2026): `Pedido.numero` no tenía ninguna forma de generarse.** A diferencia de `Partida.numeroPartida`, el campo era `Int @unique` sin ningún valor por defecto — ni el backend ni ninguna pantalla lo rellenaban nunca, así que la pantalla no podía grabar nada. Se ha añadido una secuencia real de Postgres (`pedidos_numero_seq`, mismo patrón que `partidas_numero_partida_seq`) como `DEFAULT` de la columna: si se deja "Nº albarán" en blanco, el servidor asigna el siguiente número automáticamente (seguro con dos puestos grabando a la vez, a nivel de base de datos — ver Fase 0 punto 74 sobre el fallo real de 667 números duplicados con el contador antiguo en memoria); si Víctor teclea uno a mano (ej. para encajar con un albarán ya impreso), se usa tal cual y un número repetido da un error claro en vez de un fallo interno.
- **Líneas**: producto (autocompletar), cajas, peso (admite sumar varias cifras, ej. `12+13.5`, igual que Kilos en Compras), €/kg, descuento %. **Corrección real encontrada al construir esta pantalla:** el peso de una línea de pedido nunca se evaluaba como expresión en el servidor (`calcularTotalLineaPedido` hacía `Number(peso)`, que da `NaN`→0 con un texto como `"12+13.5"`) — ya estaba confirmado como requisito pendiente en este mismo documento (ver antiguo punto 3 de "Pendiente"). Añadido `evaluarExpresionPeso` en `backend/src/ivaVentas.js` (puerto directo de `evaluarExpresionKilos` de Compras), evaluado una sola vez en `prepararPedido` antes de la asignación de partida/reservas (para que la reserva de kilos tampoco se confunda con el texto crudo) y antes del cálculo del total.
- La columna de Total de cada línea es una **vista previa en vivo** (misma fórmula que `calcularTotalLineaPedido`); el pie muestra peso total, base imponible, IVA (con la etiqueta cambiando según el tipo fiscal del cliente: "IVA (10%)" / "IVA+Recargo (11,4%)" / "IVA (0% intracom.)") y el total del pedido — igual filosofía que Compras: el servidor es quien decide de verdad al grabar (`backend/src/ivaVentas.js`).
- **Partida de venta — reescrito el 24/11/2026** (ver Fase 2 punto 4): confirmado que Víctor sigue eligiéndola a mano en producción, no en automático. Al teclear Intro/Tab en €/Kg se abre un desplegable anclado bajo la columna "Partida" con todas las disponibles de ese producto (nº, fecha, proveedor, coste, kg libres ya descontando lo reservado por otras líneas del mismo pedido sin grabar, y ✅/⚠️ según margen), con flechas+Intro para elegir y una fila "— sin partida —" para forzar explícitamente ninguna (solo en el primer paso). La celda de Partida muestra el resultado ("5900" si es una sola, o la forma compacta "5900+56901" si se repartió entre varias — **compactado el 25/11/2026, "PARTIDAS DOBLES MÁS COMPACTAS" del HTML real**: el texto completo con los kilos de cada una ("5900 (5,00kg) + 56901 (10,00kg)") sigue disponible como tooltip al pasar el ratón, columna con ancho fijo de 130px y ellipsis para que un reparto largo no descoloque el resto de la tabla) y también se puede volver a abrir haciendo clic en ella. Al terminar, el foco pasa a Dto %. Al grabar, el aviso de éxito sigue informando cuántas líneas quedaron sin partida (si alguna), por transparencia.
- **"Elegir partida aunque se pase de kilos" + partidas cerradas visibles — cambio de comportamiento el 26/11/2026** (HTML real): **Intro/clic normal ya NO reparte sola la línea entre varias partidas** — asigna TODO el peso que falta a la partida elegida, aunque se pase de lo que le queda libre (se avisa con un aviso flotante no bloqueante abajo en el centro de la pantalla, que se cierra solo a los 6s, sin interrumpir nada). Repartir de verdad entre varias partidas ("FALTAN X kg") sigue existiendo pero es ahora una acción explícita: **Mayús+Intro / Mayús+clic**. Las partidas cerradas a mano ahora también se listan en el desplegable (al final de todo, después de las agotadas, en gris/cursiva con 🔒 junto al número) — se muestran como referencia pero **nunca se pueden elegir** (clic o Intro sobre ellas solo repite el aviso, sin cerrar el desplegable). **De paso, corregido un matiz que arrastrábamos desde el 24/11/2026**: en el paso "FALTAN X kg" la fila vacía ("— dejar el resto en la última —") ya conserva correctamente el reparto parcial de los pasos anteriores en vez de vaciarlo por error.
- **Navegación de teclado**: Tab/Enter recorre Cajas → Piezas → Peso → €/Kg (abre el desplegable de partida) → Dto % → Cajas de la siguiente línea, igual que Compras.
- **Piezas, PALETS y precio por defecto — añadido el 24/11/2026, leyendo el HTML real vigente ese día** (ver Fase 0, hallazgos nuevos): columna "Piezas" por línea (número de ejemplares sueltos, distinto de Cajas); campo "🚛 Palets" en la cabecera (documento electrónico de control, 0 = PALET VARIADO) que se vuelve a confirmar en un aviso propio justo antes de grabar (`api.js`, `pedirPalets()` — Enter confirma y graba, Esc/clic fuera cancela sin grabar nada, puerto directo de `pedirPaletsYGrabar()` del HTML real); el precio de cada línea se autorrellena con el PVP1 del artículo al elegirlo (sigue editable).
- **Grabar**: protegido con `idempotencyKey` y botón deshabilitado durante el guardado, igual que Compras.
- Barra superior con enlaces de navegación entre pantallas (Compras ⇄ Pedidos ⇄ Traspasos) — antes cada pantalla era una página aislada sin forma de pasar de una a otra salvo tecleando la URL.

**Probado end-to-end con Playwright (navegador real) el 22/11/2026, repetido el 24/11/2026 tras los cambios de partida/palets/piezas:**
- Autocompletar de cliente y de producto; agencia/forma de pago rellenadas por defecto desde el cliente; precio autorrellenado con PVP1.
- Badge e IVA del pie cambiando correctamente entre los tres clientes de prueba (Normal/Recargo de Equivalencia/Intracomunitario).
- Peso con expresión (`12+13.5` → 25,5 kg) calculado igual en la vista previa y en la base de datos tras grabar.
- Pedido con dos líneas de productos distintos grabado correctamente, con el Nº de albarán asignado automáticamente, el total coincidiendo exacto entre pantalla y servidor, y el aviso de "línea sin partida asignada" apareciendo cuando correspondía.
- Nº de albarán duplicado tecleado a mano rechazado con un mensaje claro en vez de un error interno.
- Aviso de Palets apareciendo siempre antes de grabar, con el valor ya puesto en la cabecera como punto de partida, y el valor confirmado (incluso si se cambia en el propio aviso) es el que se graba de verdad.
- Reparto de una línea entre dos partidas con cascada "FALTAN X kg" sigue funcionando igual después de añadir Piezas/Palets (regresión).
- El servidor no se cae en ningún momento de la prueba.

---

## 4. Pantalla de Traspasos — implementada y probada el 24/11/2026

Tercera pantalla construida (`public/traspasos.html`/`traspasos.js`), mismo patrón que Pedidos con las diferencias reales de un traspaso frente a una venta (ver Fase 0 punto 3/9): no hay cliente ni IVA, pero sí lleva precio.

- **Campos de cabecera**: Nº de traspaso (opcional, igual que Pedidos — ver más abajo, mismo hueco real que tenía `Pedido.numero`), fecha, Palets. Aviso fijo de que es un movimiento interno a MARINA FISH ZARAGOZA, con valor estimado no fiscal.
- **Corrección real encontrada al construir esta pantalla: `Traspaso.numero` tenía el mismo hueco que `Pedido.numero` tuvo hasta el 22/11/2026** (sin ninguna forma de generarse) — resuelto igual, con una secuencia real de Postgres (`traspasos_numero_seq`).
- **Líneas**: producto (autocompletar), cajas, piezas, peso (con expresión, ej. `12+13.5`), €/Kg (precio **estimado, no fiscal** — así lo rotula el propio HTML real: "Valor estimado (no fiscal)" — autorrellenado con el PVP1 del artículo, sigue editable), partida. Total de línea = peso × precio, sin descuento ni IVA (no es una venta).
- **Corrección real importante encontrada al construir esta pantalla**: la primera versión de este backend (antes de leer el HTML real) asumía que un traspaso se valoraba "a coste", usando el coste de la partida asignada — **esto era incorrecto**. El HTML real confirma que lleva un precio tecleado por Víctor (con PVP1 como valor de partida), igual que en Pedidos. Corregido antes de dar la pantalla por terminada.
- **Partida**: mismo desplegable y mismo reparto entre varias partidas que en Pedidos (ver Fase 2 punto 4, `abrirPopupPartida`/cascada "FALTAN X kg", y el punto 3 de este documento para la celda compacta "5900+56901" con tooltip), pero **sin margen** — un traspaso no tiene ningún precio de venta con el que calcular un margen, así que el desplegable no lo muestra ni filtra por eso, solo por antigüedad (FIFO) y si la partida cubre el peso. Nueva función en el backend, `elegirPartidaParaTraspaso` (`backend/src/margenPartida.js`), equivalente a `elegirPartidaParaVenta` pero sin el filtro de margen.
- **Piezas, Palets y precio por defecto**: igual que en Pedidos (ver punto 3) — mismo mecanismo, mismo componente compartido (`api.js`, `pedirPalets()`).
- **Navegación de teclado**: Cajas → Piezas → Peso → €/Kg (abre el desplegable de partida), igual que Pedidos (sin Dto %, aquí no aplica).

**Probado end-to-end con Playwright (navegador real) el 24/11/2026:**
- Precio autorrellenado con PVP1; total de línea = peso × precio calculado igual en pantalla y en la base de datos.
- Partida elegida en el desplegable, asignada correctamente y descontando los kilos disponibles de la partida real tras grabar.
- Nº de traspaso asignado automáticamente; Palets confirmado en el aviso antes de grabar y guardado correctamente.
- El servidor no se cae en ningún momento de la prueba.

---

## 5. Histórico de Compras + Kilos por partida — implementado y probado el 24/11/2026

Quinta y sexta pantallas construidas (`public/compras-historico.html`/`.js` y `public/kilos-por-partida.html`/`.js`), usando el HTML real como referencia exacta de columnas y filtros (`obtenerComprasFiltradas`/`filtrarCompras`/`datosKilosPorPartida`).

- **Histórico de Compras**: filtros por partida, alb. proveedor, proveedor (código o nombre), producto (código o descripción), fecha desde/hasta y control (todos/comprobados/sin comprobar), más un selector de orden (fecha/partida/importe, ascendente o descendente) — el filtrado y el orden se hacen en el propio navegador sobre todas las compras ya traídas, igual que en el HTML real. Bandas por día (solo cuando el orden es por fecha, igual que el HTML). Edición en sitio de Nº partida y Alb. proveedor (a nivel de compra) y Cajas/Kilos/€-Kg/Control (a nivel de línea) — reutiliza los endpoints `PUT /compras/:id` y `PUT /compras/:id/lineas/:lineaId` ya construidos en la ronda de "compras editables" (ver Fase 0 punto 15); botón Anular por compra. Una compra anulada se pinta atenuada y sin inputs editables. **Pendiente deliberado en esta primera versión** (no construido todavía, ver Fase 0/HTML real): cambiar el proveedor o el artículo de una línea desde esta pantalla — las ediciones más frecuentes (partida, alb. proveedor, cajas/kilos/precio, control, anular) sí están cubiertas.
- **Kilos por partida**: filtros por producto, partida, fecha de compra desde/hasta, "solo con pendiente o exceso" y "solo VENDIDO DE MÁS". Todo el cálculo lo hace el servidor (`calcularKilosPorPartida` en `backend/src/margenPartida.js`) — la pantalla solo pinta la respuesta. **Merma añadida el 25/11/2026** ("MERMA DEL CONGRIO EN LISTADO DE PARTIDAS" del HTML real): el congrio pierde ~10% de peso en la tripa antes de poder venderse, así que `PENDIENTE = comprados − merma − vendidos − traspasos` para ese producto (lista cerrada de mermas conocidas, `MERMAS_LISTADO` en `margenPartida.js`, por ahora solo congrio) — se ve como una nota en naranja bajo "Comprados" (ej. "− 10,00 tripa 10%") y como dos columnas nuevas en el Excel (MERMA KG/MERMA %). **No afecta** a ninguna venta, traspaso ni a la disponibilidad real de una partida (`obtenerPartidasDisponibles`) — es solo una estimación de este informe de lectura.
- **Exportación a Excel** en ambas pantallas: a diferencia del resto de la lógica (que se filtra en el navegador, igual que el HTML real), la generación del fichero la hace el servidor con `exceljs` (nunca SheetJS/"xlsx" en el navegador, ver la nota de seguridad en `backend/README.md`) — `GET /compras/exportar-excel` y `GET /listados/kilos-por-partida/excel`, mismos filtros que la pantalla, mismas columnas que el HTML real.
- **Deliberadamente no construido todavía**: el listado imprimible en A4 apaisado (formato compacto, códigos de proveedor/producto) — vive en el mismo bloque ya documentado como pendiente de "Fase 4/interfaz" (impresión en general, ver más abajo), no es específico de esta pantalla.

**Probado end-to-end con Playwright (navegador real) el 24/11/2026:**
- Filtro por producto reduciendo correctamente el nº de líneas y los totales.
- Edición en sitio de Kilos (guardado real, recálculo de Base/IVA/Total correcto) y de Control (checkbox, con el filtro "solo comprobados" reflejando el cambio).
- Anular una compra (verificado llamando a la función y con un `.click()` nativo del DOM — el `page.click()` sintético de Playwright no dispara de forma fiable un `confirm()` nativo del navegador, limitación conocida de la herramienta de prueba, no de la aplicación).
- Informe de Kilos por partida mostrando exactamente "20,00 comprados / 30,00 vendidos / 10,00 VENDIDO DE MÁS" para una partida de prueba con sobreventa conocida, y el filtro "solo VENDIDO DE MÁS" aislándola correctamente.
- Export a Excel de ambas pantallas devolviendo un fichero `.xlsx` válido (`Content-Type` correcto).
- El servidor no se cae en ningún momento de la prueba.

---

## 6. Pantalla de Existencias en cámara — implementada y probada el 24/11/2026

Séptima pantalla construida (`public/existencias.html`/`existencias.js`), módulo enteramente nuevo (ver Fase 0 punto 15) — descubierto leyendo el HTML real (`abrirExistencias()` y las funciones "ex..."), no documentado en ningún resumen anterior. No es ni una compra ni una venta: es un apunte manual de lo que queda en la cámara, día a día (bultos/kg/precio/nota), con marca de "vendido" cuando se agota del todo.

- **Modelo nuevo** (`Existencia`/`ExistenciaLinea` en schema.prisma, migración `20261124211108_existencias_modulo_nuevo`): una fila por día (fecha única) con líneas reales en base de datos — a diferencia del HTML real, que guarda cada día como un array JSON indexado por posición, aquí cada línea tiene su propio id estable, así la edición desde el listado nunca se desincroniza si cambia el orden.
- **Dos paneles en vez de un modal** (mismo contenido que `abrirExistencias()`, adaptado al patrón de pantalla separada de este sistema): a la izquierda el editor de un día concreto (fecha, líneas con Artículo/Bultos/Kg/€-kg/Nota/Vendido, + línea, + línea en blanco para separar grupos, Grabar día, Borrar día); a la derecha el listado por días (filtros desde/hasta/producto·texto/agrupación, con edición en sitio de bultos/kg/vendido), Imprimir y Excel.
- **Artículo con texto libre** (diferencia real frente a Pedidos/Traspasos/Compras, que exigen catálogo): si lo tecleado no coincide con ninguna sugerencia elegida del catálogo, se guarda tal cual como texto libre (`ExistenciaLinea.descripcionLibre`) — igual que el HTML real, que admite "lo que sea" en esa columna (ej. pescado sin catalogar, encargos puntuales).
- **Kilos admite suma** (ej. "12,4+8,1"), igual que Compras/Pedidos/Traspasos — mismo `evaluarExpresionKilos` del lado servidor, evaluado también al editar una línea desde el listado (`PATCH /existencias/:fecha/lineas/:id`).
- **Vendido**: una línea marcada deja de salir en el listado por defecto (selector "Mostrar": sin vendidos / con vendidos en rojo / solo vendidos) pero sigue contando en los totales de "con vendidos" — igual que el HTML real; el listado separa siempre TOTAL EXISTENCIAS de QUEDA EN CÁMARA (sin vendidos) cuando se piden ver los vendidos.
- **Agrupación del listado** (detalle por días / por día / por semana ISO / por mes / un solo total) y **banda de día en gallego** (`LUNS, MERCORES...` — igual que `EX_DIAS` del HTML real, detalle que Víctor usa a diario en A Coruña) — calculado en el propio navegador sobre los días ya traídos del servidor (mismo patrón que el histórico de Compras).
- **Excel** (`GET /existencias/excel`) con las tres mismas hojas que `exExportarExcel()` del HTML real — LISTADO (con la banda oscura por día, igual que la hoja de la cámara), DETALLE (una fila por línea, con semana/mes, para filtrar) y RESUMEN (por el modo de agrupación elegido) — generado en el servidor con `exceljs`, nunca en el navegador.
- **Grabar día es un upsert por fecha**: sustituye por completo las líneas de ese día (borra las anteriores, crea las nuevas); si no queda ninguna línea válida (sin peso>0), se borra el día entero — igual que "Día sin líneas con kilos: no se guarda nada para esa fecha" del HTML real.

**Bug real encontrado y corregido durante la prueba (24/11/2026):** el aviso de éxito ("✅ Grabado"/"🗑️ Borrado") desaparecía antes de que se pudiera leer, porque se mostraba ANTES de refrescar el editor del día — y ese refresco (`cambiarFecha()`) oculta el aviso cuando el día queda sin líneas visibles (caso normal tras grabar un día vacío o borrar). Corregido invirtiendo el orden: primero refrescar, después mostrar el aviso final.

**Probado end-to-end con Playwright (navegador real) el 24/11/2026:**
- Línea con artículo del catálogo (autocompletar) y línea con texto libre (no catalogado) en el mismo día, grabadas y recuperadas tal cual tras recargar la página entera.
- Línea en blanco (separador) conservada en su posición exacta tras grabar y recargar.
- Línea vacía sin rellenar (añadida sin querer) descartada automáticamente al grabar, sin error.
- Marcar "Vendido" desde el listado: la línea desaparece en modo "sin vendidos" y aparece en rojo en modo "con los vendidos", con QUEDA EN CÁMARA calculado correctamente.
- Edición de kilos en sitio desde el listado, con la misma suma admitida que al grabar.
- Agrupación por mes mostrando la etiqueta correcta ("enero 2026").
- Export a Excel con las tres hojas, bandas de día y totales coincidiendo con lo esperado para un caso de prueba conocido.
- Protección de doble clic en "Grabar día" (misma clave de idempotencia reenviada en un reintento no duplica la línea).
- Validaciones del servidor: borrar un día sin existencias da un error claro (no un 500); editar kilos a 0 desde el listado se rechaza con el mismo mensaje que el HTML real.
- El servidor no se cae en ningún momento de la prueba.

## 7. Pantalla de Reparto a supermercados — implementada y probada el 24/11/2026

Octava pantalla construida (`public/repartos.html`/`repartos.js`), reescribiendo también la ruta `/repartos` (hasta entonces sin actualizar a los criterios de Fase 2 — mismo hueco real que tenía `/traspasos` hasta hoy, ver Fase 0 punto 15).

- **No lleva precio ni importe** (diferencia real frente a Pedidos/Traspasos, confirmada leyendo `grabarReparto()` del HTML real): un reparto a supermercado (Alcampo, Ecomora, Ahorramas...) no se factura desde esta pantalla — es puramente logístico/trazabilidad.
- **Campos de cabecera**: Nº de reparto (opcional, secuencia real `repartos_numero_seq`, mismo patrón que Pedido/Traspaso), fecha, destinatario (desplegable cerrado con las cadenas reales — ALCAMPO ZARAGOZA/MADRID/VILLANUBLA/BARCELONA/MIRANDA/VIGO/ASTURIAS, ECOMORA, AHORRAMAS, TORIODIS LEON, MARINA FISK CORUÑA — más "OTRO" en texto libre), conductor, Palets (documento electrónico de control, mismo `pedirPalets()` compartido — quedaba pendiente en `Reparto` hasta construir esta pantalla, ver Fase 0 punto 15).
- **Líneas de trazabilidad** (para la futura etiqueta Scanfisk, ver "Pendiente" más abajo): Artículo (autocompletar, obligatorio del catálogo — a diferencia de Existencias, aquí NO se admite texto libre, igual que `elegirArtReparto()` del HTML real), Lote (siempre tecleado a mano, no es una FK a partidas), Barco/Subzona/Arte de pesca (se autorrellenan de `Articulo.barco/subzona/artePesca` al elegir el artículo, pero siguen editables por línea — una misma referencia puede repartirse entre varios barcos/lotes mezclados, placeholder "VARIOS BARCOS"), Cajas, Kg aprox y Peso de etiqueta (en blanco = la etiqueta futura pondría "VER CAJA"). Cajas/Kg/Peso de etiqueta admiten la misma suma que Kilos en Compras.
- **Validez de una línea**: artículo elegido Y cajas>0 — a diferencia de Pedidos/Traspasos/Compras/Existencias, el peso (kg) NO es obligatorio para que cuente (igual que el HTML real).
- **Destinatario dividido en nombre+ciudad** (`dividirDestinatario()`, puerto directo del HTML real): "ALCAMPO ZARAGOZA" se separa en nombre="ALCAMPO"/ciudad="ZARAGOZA"; el resto de destinatarios (sin prefijo de cadena reconocido) se guardan enteros en "nombre" con "ciudad" vacía — evita el bug real que tuvo el HTML (`ECOMORA` doblándose en `ECOMORA ECOMORA ECOMORA...` al reabrir/regrabar repetidamente, corregido allí el 15/09/2026 y replicado aquí ya corregido desde el principio).
- **Historial** (debajo, en la misma pantalla): filtros por fecha desde/hasta y destinatario (texto), con botón Anular (borrado real — `ON DELETE CASCADE` se lleva las líneas).
- **Grabar**: protegido con `idempotencyKey` y botón deshabilitado durante el guardado, igual que el resto de pantallas.

**Deliberadamente no construido en esta ronda** (ver "Pendiente" más abajo): cargar un reparto ya grabado para modificarlo (el HTML real lo permite reabriendo por número y regrabando encima); la generación de etiquetas Scanfisk/PDF de ficha de envío/hoja de ruta, y su envío por WhatsApp o email — todo eso vive en el HTML real en `MarinaFiskEtiquetas` y funciones `generarPdf...`/`enviarPdfCompletoDeReparto`, con QR y réplica vectorial de la etiqueta física; es una pieza grande de impresión que encaja con el resto de impresión pendiente (Fase 4/interfaz).

**Probado end-to-end con Playwright (navegador real) el 24/11/2026:**
- Autocompletar de artículo con autorrelleno de barco/subzona/arte de pesca al elegirlo (editable después).
- Cajas con expresión (`10+5` → 15) y Kg sumados correctamente en el pie y en la base de datos tras grabar.
- Línea con Peso de etiqueta puesto y línea sin él (debe quedar `null`, no `0`) — ambas correctas tras grabar.
- Aviso de Palets con el modal propio (no `window.prompt`), valor confirmado grabado de verdad.
- Reparto grabado con número automático, total de cajas/kg correcto, destinatario dividido correctamente (ECOMORA sin prefijo reconocido → nombre completo, ciudad vacía).
- Validación: grabar sin ninguna línea con cajas da un aviso claro, sin tocar el servidor.
- Número manual duplicado rechazado con mensaje claro; número automático posterior no choca con uno manual ya usado.
- Protección de doble clic (misma clave de idempotencia reenviada no duplica el reparto).
- Anular borra el reparto de verdad (confirmado también que sus líneas desaparecen con él).
- El servidor no se cae en ningún momento de la prueba.

## 8. Pendiente

- **Hallazgo nuevo, 25/11/2026 (leyendo `CARGA_DE_ALBARANES_MARINAFISK_2026-11-25_MERMACONGRIO_1.html`): columna "DESCRIPCIÓN / CALIDAD / TALLA" por línea, en Pedidos Y Traspasos** — un campo de texto libre por línea (independiente del nombre del artículo del catálogo, para anotar calidad/talla concretas de ese albarán) que ya existía en el HTML real ANTES de esta actualización (no es de hoy) y que el sistema nuevo todavía no tiene en ningún punto de Fase 0-2 ni construido. Lleva además una "traza impresa" por línea (especie científica, zona FAO/subzona, lote, partida, arte de pesca, barco — todo ya disponible en `Articulo`/la línea, solo falta componerlo para imprimir) que vive junto al resto de impresión pendiente (Fase 4/interfaz). **Pendiente de construir**: el campo de texto en sí (dato nuevo, `PedidoLinea.descripcion`/`TraspasoLinea.descripcion`, sin lógica de negocio) es sencillo y debería priorizarse antes que la traza impresa.
- El resto de pantallas (Listas de precio, partidas y márgenes) — ninguna construida todavía. La de partidas incluye, según el HTML real (botón "🔒 PARTIDAS CERRADAS", visto el 26/11/2026), ver y reabrir las partidas cerradas a mano — el backend ya tiene `POST /partidas/:id/cerrar`, falta el endpoint de reabrir y la pantalla en sí.
- **Listado imprimible de Compras** en A4 apaisado con formato compacto (fuente pequeña, una línea por compra, códigos de proveedor y producto) — deliberadamente no construido en esta ronda (ver punto 5), vive junto al resto de impresión pendiente (Fase 4/interfaz, más abajo).
- **Cambiar proveedor o artículo de una línea** desde el histórico de Compras — deliberadamente no construido en esta ronda (ver punto 5).
- **Reparto a supermercados**: cargar un reparto ya grabado para modificarlo desde el historial, y toda la generación de etiquetas Scanfisk/PDF/envío por WhatsApp o email — deliberadamente no construido en esta ronda (ver punto 7).
- Las funcionalidades de impresión de `CORRECCIONES_02-09-2026_para_Code_7.md` (Hoja Transfrío también en Traspasos, Hoja CMR condicional por agencia, catálogo de modelos de impresión, impresión en lote con copias dentro del PDF y apertura de pestañas solo por clic directo, y —nuevo, punto 12— imprimir desde la propia fila del listado con botones **separados** por documento cuando se imprimen en impresoras físicas distintas, nunca combinados en un único PDF/botón — ver `FASE_0_reglas_de_negocio_MARINAFISK.md` punto 13) — Víctor las llama "Fase 4 (interfaz)" en ese documento, pero `FASE_4_facturacion_MARINAFISK.md` es solo facturación; viven en este documento de frontend, no en Fase 4.
- **[x] El patrón de autosuma con "+"/"-" ya usado en Kilos de Compras** (`evaluarExpresionKilos`) — hecho en Pedidos el 22/11/2026, en Traspasos y Existencias el 24/11/2026 (ver puntos 3-4 y 6) y en Repartos el 24/11/2026 (ver punto 7, Cajas/Kg/Peso de etiqueta) — confirmado como requisito general en `CORRECCIONES_02-09-2026_para_Code_7.md` punto 13.
- Comparación de agilidad frente al Excel/HTML actual con Víctor usando la pantalla real (Fase 2 punto 7) — ya se puede hacer para Compras.
- Sin login/roles todavía — cualquiera que abra la URL puede grabar; no se ha pedido y el HTML actual tampoco lo tiene, pero señalado aquí por si hiciera falta más adelante.

---

*Preparado como continuación de FASE_0/1/2, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
