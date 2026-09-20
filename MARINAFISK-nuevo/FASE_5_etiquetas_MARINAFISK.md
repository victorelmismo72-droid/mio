# MARINAFISK — Fase 5: Etiquetas

Este documento no lo ha escrito Víctor de antemano — se redacta aquí, igual que Fase 3/4, reuniendo lo que hacía falta antes de construirlo. A diferencia de las fases anteriores, aquí no partimos de una corrección escrita por Víctor: `FASE_4_interfaz_MARINAFISK.md` había dejado Etiquetas como pendiente con la nota "no hay especificación de formato suficiente de Víctor todavía". Esa nota estaba equivocada — no se había leído todavía, línea a línea, el módulo `MarinaFiskEtiquetas` del HTML actual (`CARGA_DE_ALBARANES_MARINAFISK_20260821I.html`, funciones desde `initEtiquetasSueltas` hasta el `return` final del IIFE, aprox. líneas 5350-6790), que resulta contener una especificación completa y ya en uso real: 6 formatos de etiqueta, generación de QR, cálculo de lote/caducidad, y tres orígenes de datos (pedido, traspaso, reparto) además de la impresión suelta manual. La confirmación de que esto es real y en uso, no solo código muerto, está en los propios datos migrados: 153/154 artículos tienen `cientifico` real, 127/154 tienen `zona_fao`, los 154 tienen `peso_etiqueta`, y 6 clientes reales ya tienen `formato_etiqueta` puesto a uno de los 6 ids exactos que usa el HTML actual (`marina_fisk`, `marina_fisk_fr`, `marina_fisk_it`, `marina_fisk_masymas`, `david_sala`, `scanfisk`).

**Instrucción para Claude Code:** replicar fielmente los datos/cálculos de trazabilidad (lote, caducidad, campos fijos) y los 6 formatos ya reales — esto no es una funcionalidad "a diseñar", es una funcionalidad "a migrar", igual que Transfrío/CMR. Lo nuevo de esta fase es solo la pantalla y el motor de impresión (Fase 4), reutilizando el patrón ya construido (ventana síncrona en el clic, relleno después).

---

## 1. Qué hay ya construido en el HTML actual (leído del código real, no supuesto)

### 1.1 El dato de una etiqueta

Un objeto con: `producto` (+ `productoFrances`/`productoItaliano`), `cientifico`, `zona`, `subzona`, `artePesca`, `barco`, `pesoEtiqueta`, `fecha`, `lote`, `caducidad`, `destinatario`, `direccion`, `provincia`, `categoria`, `calibre`, `formaObtencion`, `modoPresentacion`, `modoConservacion`, `expedidor`, `direccionExpedidor`, `rsi`. Se construye de tres formas distintas según el origen:

- **`datosEtiquetaLinea(pedido, línea)`** — desde una línea de un pedido de venta: el artículo/cliente se leen del catálogo real; `expedidor`/`direccionExpedidor`/`rsi` cambian si el cliente es David Sala (su propio registro sanitario, no el de Marina Fisk).
- **`datosEtiquetaTraspaso`** (`abrirDialogoImpresionTraspaso`) — un traspaso se adapta a la misma forma que un pedido (mismo motor), con destinatario fijo "MARINA FISK ZARAGOZA" y sin partida.
- **`datosEtiquetaCarga(fila, destinatario)` / reparto** — desde un reparto: el barco/zona/arte de pesca son los reales de esa entrega concreta (no los genéricos del artículo, que pueden no coincidir con el barco real de ese día), formato fijo `scanfisk`, una etiqueta por caja.
- **Suelta** (pantalla "Etiquetas sueltas") — todo a mano: cliente, artículo, fecha, cantidad, con overrides opcionales de zona/subzona/arte/peso/lote.

### 1.2 Lote y caducidad

- `lote = DDMMAA` de la fecha del documento (no un número correlativo — el mismo lote para todo lo grabado ese día).
- `caducidad = fecha del documento + N días`. **N es 12 días fijo si el formato es `marina_fisk_fr`** (cliente francés Pomona, confirmado por Víctor en el propio código), y para el resto un número configurable (por defecto 7). En el HTML actual esa configuración vive en `localStorage` **por ordenador** — un defecto real que el sistema nuevo corrige de raíz: aquí se guarda en una tabla compartida (`configuracion`), visible igual desde CORU y PANC, consistente con todo lo demás de Fase 3.
- `fmtFechaCorta = DD/MM/AA`.

### 1.3 Formatos (6), un único tamaño físico

Los 6 formatos comparten **exactamente la misma rejilla física** (etiqueta vertical de 50×145mm, contenido construido en horizontal y rotado 90° para encajar en el rollo, dos etiquetas por hoja A4-ancho) y el mismo contenido de trazabilidad (zona/subzona, categoría, calibre, fecha/lote/caducidad, peso, producto+nombre científico, arte de pesca, modo de conservación, QR, forma de obtención/presentación, barco, expedidor+RSI, destinatario+dirección+provincia). Lo único que cambia entre formatos es la franja de empresa (izquierda) y el idioma de las etiquetas:

| id | Nombre | Diferencia |
|---|---|---|
| `marina_fisk` | Marina Fisk (estándar) | Sello+logo reales, español |
| `marina_fisk_fr` | Marina Fisk (Francés — Pomona) | Igual, en francés; usa `productoFrances`; caducidad fija 12 días |
| `marina_fisk_it` | Marina Fisk (Italiano) | Igual, en italiano; usa `productoItaliano` |
| `marina_fisk_masymas` | Marina Fisk (Más y Más) | Igual que estándar, pero registro sanitario propio del cliente (ES 12.3894/Z) en vez del de Marina Fisk |
| `david_sala` | Pescados David Sala Blanes | Empresa distinta (no Marina Fisk): sin logo, nombre/teléfono/dirección/RSI propios |
| `scanfisk` | Scanfisk Seafood (reparto supermercados) | Empresa Scanfisk (mismo sello sanitario que Marina Fisk), usada para repartos |

El formato de un pedido se decide por el `formato_etiqueta` del cliente (ya migrado, columna `clientes.formato_etiqueta`); si está vacío, `marina_fisk` por defecto. El de un traspaso siempre cae al defecto (`marina_fisk`, el traspaso no tiene cliente real). El de un reparto siempre es `scanfisk` (fijo en el HTML actual, no configurable — así se mantiene aquí).

El QR se genera con la librería `qrcode-generator` (dominio público, ya incluida entera en el HTML actual, sin llamada a ningún servicio externo) codificando `MARINAFISK|PROD:...|LOTE:...|CAD:...|DEST:...`.

### 1.4 Cuántas etiquetas por línea de pedido — quirk detectado, replicado y señalado

`copiasPorLinea(linea)`: si la columna "descuento" de la línea es mayor que 0, se imprimen **esa cantidad** de etiquetas (redondeada), no la cantidad/cajas de la línea; solo si el descuento es 0 se usa la cantidad normal. Es decir, en el HTML actual el mismo campo numérico de una línea de pedido sirve para dos cosas completamente distintas según el contexto: un % de descuento sobre el precio (al facturar) y, si alguien lo rellena, un número de etiquetas a imprimir que sustituye a la cantidad (al etiquetar) — nunca a la vez, porque si hay descuento real puesto, las etiquetas saldrían con un número que no tiene nada que ver con las cajas reales de esa línea. **Se replica tal cual** (es el comportamiento real que Víctor conoce y usa hoy), pero queda señalado aquí explícitamente por si en algún momento le sorprende un número de etiquetas que no coincide con la cantidad — la causa sería un descuento puesto en esa línea.

### 1.5 Diálogo de impresión por pedido

Cuatro modos, ya reales: **todas** las líneas, **selección** de líneas (casillas), **una etiqueta de prueba** (de una línea concreta, para comprobar la impresora), **repetir** N etiquetas de una línea concreta a mano. Se recuerda la última opción elegida (en el HTML actual, en `localStorage` — aquí no hace falta que sea compartido entre puestos, es una preferencia de uso, así que se deja igual, en el navegador).

### 1.6 Vista previa antes de imprimir

Antes de mandar a imprimir de verdad, se muestra un resumen (cliente, lote, caducidad, tabla de productos con cuántas etiquetas de cada uno, total, formato) y un aviso fijo para comprobar tamaño de papel/escala 100% en el diálogo de impresión del navegador — se mantiene, es información real que Víctor necesita cada vez.

---

## 2. Qué se construye en esta fase (y qué se difiere, explícitamente)

**Se construye:**
- Los 6 formatos, el motor de impresión (mismo patrón ventana-síncrona-luego-relleno que Transfrío/CMR/albaranes), el QR, lote/caducidad (con la configuración de días ahora compartida en base de datos, no por ordenador).
- Etiquetas desde Pedidos (con los 4 modos: todas/selección/prueba/repetir) y desde Traspasos (mismo motor, destinatario fijo Zaragoza).
- Etiquetas desde Repartos (una por caja, formato Scanfisk fijo).
- Pantalla "Etiquetas sueltas" para uso manual, igual que la actual.
- El campo `formato_etiqueta` del formulario de Clientes pasa de texto libre a desplegable con los 6 ids reales (evita errores de escritura que antes caerían silenciosamente al formato por defecto).

**Se difiere, señalado honestamente, no construido en esta fase:**
- **Importación de hojas Excel "CARGA [super]"** (`importarCargaYGenerarEtiquetasScanfisk`) — es un formato de fichero específico de un proveedor de datos concreto (columnas fijas de una hoja de cálculo de Scanfisk), un flujo de entrada externo distinto del resto del sistema (que ya no depende de Excel para nada). Si Víctor sigue necesitando este flujo concreto, se puede añadir después como su propia pieza, sin que bloquee el resto de Etiquetas.
- **Envío de la muestra en PDF por WhatsApp/email a Scanfisk Celeiro** (`enviarMuestraScanfiskPorWhatsapp/Email`) — son atajos que abren WhatsApp Web/el cliente de correo con un mensaje ya escrito; sirven sobre el PDF de muestra generado con `dibujarEtiquetaScanfiskEnPdf`/`jsPDF`, una pieza aparte de la impresión de etiquetas en sí. Se puede seguir haciendo a mano (descargar el PDF y mandarlo como siempre) hasta que se construya esta pieza.
- ~~**Ficha de envío / Hoja de ruta / PDF completo de reparto**~~ — **construido el 2026-09-20** (ver `VERIFICACION_DOCUMENTOS_REPARTO_2026-09-20.md`). Réplica fiel de `generarPdfFichaEnvio`/`generarPdfHojaDeRutaReparto`/`generarPdfCompletoReparto` con la misma librería jsPDF (`backend/public/js/vendor/jspdf.js`) y el mismo dibujo vectorial de la etiqueta Scanfisk, en `backend/public/js/impresion/documentosReparto.js`, con botones en la pantalla de Repartos (sobre el formulario sin grabar, y sobre cada reparto ya grabado en "Repartos recientes"). Un hallazgo real durante las pruebas con Playwright, documentado en el código (`abrirDocumentoPdf`): el patrón de "abrir la ventana en blanco antes del *await* y rellenarla después" que usa `impresion/motor.js` para las hojas HTML NO sirve para un PDF de jsPDF — Chrome bloquea en silencio la navegación de una ventana YA abierta hacia una URL `blob:`/`data:` aunque no haya bloqueo de ventanas emergentes de por medio. La solución real, comprobada con Playwright, es la contraria: pedir primero los datos que hagan falta y abrir la ventana DESPUÉS, ya con el PDF listo (`window.open(doc.output('bloburl'), '_blank')`) — eso no se bloquea, ni siquiera tras una petición real al servidor de por medio.

**Sigue diferido:**
- **Importación de hojas Excel "CARGA [super]"** (`importarCargaYGenerarEtiquetasScanfisk`, ver arriba).
- **Envío de la muestra en PDF por WhatsApp/email a Scanfisk Celeiro** (ver arriba) — pendiente como siguiente pieza.

Ninguno de estos dos puntos afecta a la trazabilidad ni a la impresión real de etiquetas — son atajos/documentos complementarios alrededor de ellas.

---

## 3. Verificación de esta fase

Ver `VERIFICACION_ETIQUETAS_2026-09-19.md` cuando esté escrito: probado con navegador real (Playwright) y datos reales — al menos un pedido con cliente en formato `marina_fisk` (por defecto) y uno con formato distinto de los 6 ya presentes en los datos migrados, un traspaso, un reparto, y la pantalla de sueltas. Se comprueba explícitamente que el número de etiquetas generadas coincide con lo esperado en cada modo del diálogo de pedido, y que cada formato pinta el encabezado de empresa correcto.
