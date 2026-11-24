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
- **Partida de venta — reescrito el 24/11/2026** (ver Fase 2 punto 4): confirmado que Víctor sigue eligiéndola a mano en producción, no en automático. Al teclear Intro/Tab en €/Kg se abre un desplegable anclado bajo la columna "Partida" con todas las disponibles de ese producto (nº, fecha, proveedor, coste, kg libres ya descontando lo reservado por otras líneas del mismo pedido sin grabar, y ✅/⚠️ según margen), con flechas+Intro para elegir y una fila "— sin partida —" para forzar explícitamente ninguna. Si la elegida no cubre el peso entero de la línea, se encadena un segundo desplegable "FALTAN X kg" para repartir el resto en otra partida, repitiendo hasta cubrirlo o hasta Esc/clic fuera (el resto se queda en la última elegida). La celda de Partida muestra el resultado ("5900" o "5900 (5kg) + 56901 (10kg)") y también se puede volver a abrir haciendo clic en ella. Al terminar, el foco pasa a Dto %. Al grabar, el aviso de éxito sigue informando cuántas líneas quedaron sin partida (si alguna), por transparencia.
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
- **Partida**: mismo desplegable y mismo reparto entre varias partidas que en Pedidos (ver Fase 2 punto 4, `abrirPopupPartida`/cascada "FALTAN X kg"), pero **sin margen** — un traspaso no tiene ningún precio de venta con el que calcular un margen, así que el desplegable no lo muestra ni filtra por eso, solo por antigüedad (FIFO) y si la partida cubre el peso. Nueva función en el backend, `elegirPartidaParaTraspaso` (`backend/src/margenPartida.js`), equivalente a `elegirPartidaParaVenta` pero sin el filtro de margen.
- **Piezas, Palets y precio por defecto**: igual que en Pedidos (ver punto 3) — mismo mecanismo, mismo componente compartido (`api.js`, `pedirPalets()`).
- **Navegación de teclado**: Cajas → Piezas → Peso → €/Kg (abre el desplegable de partida), igual que Pedidos (sin Dto %, aquí no aplica).

**Probado end-to-end con Playwright (navegador real) el 24/11/2026:**
- Precio autorrellenado con PVP1; total de línea = peso × precio calculado igual en pantalla y en la base de datos.
- Partida elegida en el desplegable, asignada correctamente y descontando los kilos disponibles de la partida real tras grabar.
- Nº de traspaso asignado automáticamente; Palets confirmado en el aviso antes de grabar y guardado correctamente.
- El servidor no se cae en ningún momento de la prueba.

---

## 5. Pendiente

- El resto de pantallas (Repartos, Listas de precio, histórico/corrección de Compras, Existencias, partidas y márgenes) — ninguna construida todavía.
- **Histórico/listado de Compras** (`RESUMEN_COMPLETO_para_Code_18-11-2026_5.md`, 20/11/2026): cuando se construya, debe incluir filtro por partida/alb. proveedor/proveedor/producto/fecha/control, listado imprimible en A4 apaisado con formato compacto (fuente pequeña, una línea por compra, sin partir fecha/producto/importes) e incluyendo códigos de proveedor y producto (para cargar en el programa de Zaragoza), exportación a Excel con los mismos filtros, y un selector de orden (fecha/partida/importe, ascendente o descendente) que afecte tanto al listado impreso como al Excel.
- **Existencias**: módulo nuevo completo (stock por fecha/artículo con cantidad, peso, precio, nota, marca de vendido y venta parcial), no modelado todavía en el esquema — ver Fase 0 punto 15.
- Las funcionalidades de impresión de `CORRECCIONES_02-09-2026_para_Code_7.md` (Hoja Transfrío también en Traspasos, Hoja CMR condicional por agencia, catálogo de modelos de impresión, impresión en lote con copias dentro del PDF y apertura de pestañas solo por clic directo, y —nuevo, punto 12— imprimir desde la propia fila del listado con botones **separados** por documento cuando se imprimen en impresoras físicas distintas, nunca combinados en un único PDF/botón — ver `FASE_0_reglas_de_negocio_MARINAFISK.md` punto 13) — Víctor las llama "Fase 4 (interfaz)" en ese documento, pero `FASE_4_facturacion_MARINAFISK.md` es solo facturación; viven en este documento de frontend, no en Fase 4.
- **[x] El patrón de autosuma con "+"/"-" ya usado en Kilos de Compras** (`evaluarExpresionKilos`) — hecho en Pedidos el 22/11/2026 y en Traspasos el 24/11/2026 (ver puntos 3-4, `evaluarExpresionPeso`); sigue pendiente en Repartos cuando se construya esa pantalla — confirmado como requisito general en `CORRECCIONES_02-09-2026_para_Code_7.md` punto 13.
- Comparación de agilidad frente al Excel/HTML actual con Víctor usando la pantalla real (Fase 2 punto 7) — ya se puede hacer para Compras.
- Sin login/roles todavía — cualquiera que abra la URL puede grabar; no se ha pedido y el HTML actual tampoco lo tiene, pero señalado aquí por si hiciera falta más adelante.

---

*Preparado como continuación de FASE_0/1/2, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
