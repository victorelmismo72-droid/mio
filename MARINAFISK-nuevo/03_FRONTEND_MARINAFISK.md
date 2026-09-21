# MARINAFISK — Frontend del sistema nuevo

Este documento no estaba en el plan original de fases (Fase 0-5 solo cubrían reglas de negocio, base de datos/backend, lógica de negocio, sincronización, facturación y hosting) — hasta el 21/09/2026, todo lo construido era backend (API), probado a mano con `curl`/scripts, sin ninguna pantalla real. Empieza aquí porque, sin frontend, nadie puede usar de verdad lo que ya está construido, ni se puede terminar de verificar la Fase 2 (comparación de agilidad, ver `FASE_2_logica_de_negocio_MARINAFISK.md` punto 7).

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

- **Campos de cabecera**: fecha (hoy por defecto), proveedor (autocompletar por código/nombre), albarán del proveedor.
- **Aviso de partida**: en cuanto hay fecha+proveedor, se consulta `GET /compras/partidas-del-dia` y se muestra "se creará la partida principal de hoy", el número si ya existe, o un desplegable para elegir si ya hay más de una (excepción anterior) — con la casilla "Partida nueva para esta compra" para el caso raro (ver Fase 2 punto 2).
- **Líneas**: producto (autocompletar por código/descripción), cajas, kilos (admite sumar varias cifras, ej. `12+13.5`, igual que el Excel — con el campo en rojo si la expresión no es válida), €/kg, control. Las columnas de cálculo (Base Zgz/2% OP/Base real/IVA/Total) son una **vista previa en vivo con la misma fórmula del servidor** (`calcularLineaCompra`) — lo que se manda al grabar son siempre los datos crudos (kilos como texto, precio, cajas), nunca un importe ya calculado; el servidor es quien decide de verdad (ver Fase 0 punto 2 / Fase 2 punto 1).
- **Navegación de teclado**: Tab/Enter recorre Cajas → Kilos → €/Kg → Cajas de la siguiente línea, y en el último campo de la última línea añade una línea nueva automáticamente — igual que `navCompra`/`navPed` del HTML actual. La navegación entre campos ya existentes es **síncrona** (sin retraso); solo el enfoque tras elegir un producto del desplegable (ratón) se pospone unos milisegundos — **mismo motivo exacto que ya resolvía `elegirArtCompra` en el HTML actual**: el elemento sobre el que se hizo clic desaparece del DOM al reconstruir la tabla, y el navegador resetea el foco al `<body>` justo después si no se pospone.
- **Grabar**: protegido con `idempotencyKey` (una por intento de compra, se reutiliza si falla y se reintenta — nunca una nueva por reintento) y con el botón deshabilitado ("⏳ Grabando...") mientras se procesa — dos capas, igual que exige `CORRECCIONES_02-09-2026_para_Code_6.md` punto 1 (servidor + pantalla, no solo pantalla). Al terminar bien, muestra la partida asignada y reinicia el formulario para la siguiente compra.
- **Puesto de este ordenador** (CORU/PANC): se pregunta una vez y se recuerda en `localStorage` de ese navegador (botón arriba a la derecha para cambiarlo) — se manda como `puestoOrigen` en cada compra.

**Probado end-to-end con Playwright (navegador real, no solo revisado) el 21/09/2026:**
- Autocompletar de proveedor y de producto, con el emparejamiento de familia ya existente en el backend.
- Navegación completa por teclado (Cajas→Kilos→€/Kg→siguiente línea) tecleando del tirón, sin usar el ratón.
- Vista previa en vivo coincidiendo exactamente con lo que grabó el servidor (ej. 12+13,5 kg × 4 €/kg con 2% OP → 114,44 € en pantalla y en la base de datos).
- Aviso de kilos inválidos (rojo) apareciendo y desapareciendo correctamente al corregir.
- Excepción "partida nueva": crea una partida distinta en vez de reutilizar la del día, y a partir de ahí ofrece el desplegable para elegir entre las dos.
- El servidor no se cae en ningún momento de la prueba (`GET /health` responde en todo momento).

---

## 3. Pendiente

- El resto de pantallas (Pedidos, Traspasos, Repartos, Listas de precio, historial/corrección de Compras, partidas y márgenes) — ninguna construida todavía.
- Las funcionalidades de impresión de `CORRECCIONES_02-09-2026_para_Code_6.md` (Hoja Transfrío también en Traspasos, Hoja CMR condicional por agencia, catálogo de modelos de impresión, impresión en lote con copias dentro del PDF y apertura de pestañas solo por clic directo — ver `FASE_0_reglas_de_negocio_MARINAFISK.md` punto 13) — Víctor las llama "Fase 4 (interfaz)" en ese documento, pero `FASE_4_facturacion_MARINAFISK.md` es solo facturación; viven en este documento de frontend, no en Fase 4.
- Comparación de agilidad frente al Excel/HTML actual con Víctor usando la pantalla real (Fase 2 punto 7) — ya se puede hacer para Compras.
- Sin login/roles todavía — cualquiera que abra la URL puede grabar; no se ha pedido y el HTML actual tampoco lo tiene, pero señalado aquí por si hiciera falta más adelante.

---

*Preparado como continuación de FASE_0/1/2, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
