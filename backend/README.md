# MARINAFISK — Backend (Fase 1 + primera pieza de Fase 2)

Esto es el backend de la Fase 1 (guarda y lee datos: clientes, proveedores,
artículos, compras, partidas, pedidos, traspasos, repartos, listas de
precio), con toda la lógica de negocio de Fase 2 ya incorporada: la
**asignación automática del número de partida**, el **2% de OP en vivo**,
el **IVA de compras y de ventas**, la **asignación automática de partida
por margen**, las **listas de precio** (modo automático + plantilla entre
listas) y los **listados de gestión** que separan venta real de traspaso
(ver sección 5). El HTML actual (`CARGA_DE_ALBARANES_MARINAFISK_20260902CORREGIDO_4.html`)
sigue funcionando exactamente igual mientras tanto — esto se prueba aparte,
en paralelo.

**Frontend nuevo (desde el 21/09/2026):** este mismo backend sirve también
las pantallas del programa nuevo, en `public/` — sin build ni framework,
un HTML/CSS/JS por pantalla (empezado por Compras). Con el servidor
arrancado (ver sección 2 más abajo), se abren en
`http://localhost:3000/<pantalla>.html`. Ver
`MARINAFISK-nuevo/03_FRONTEND_MARINAFISK.md` para el detalle.

Ver `MARINAFISK-nuevo/FASE_1_base_de_datos_backend_MARINAFISK.md` para el
detalle de qué debía cumplir esta fase, y
`MARINAFISK-nuevo/02_ESQUEMA_BASE_DATOS_PROPUESTO.md` para la explicación de
cada tabla.

---

## 1. Instalar en tu ordenador (una sola vez)

1. **Instalar Node.js** (versión 20 o superior): https://nodejs.org — descarga
   el instalador "LTS" y sigue los pasos normales de instalación.
2. **Instalar PostgreSQL** (versión 16 o similar): https://www.postgresql.org/download/
   — durante la instalación te pedirá una contraseña para el usuario `postgres`,
   apúntala.
3. Abre una terminal dentro de esta carpeta (`backend`) y ejecuta:
   ```
   npm install
   ```
   Esto descarga las librerías necesarias (tarda un par de minutos la primera vez).
4. Crea la base de datos y un usuario dedicado (usando `psql`, la herramienta
   de línea de comandos que instala PostgreSQL, o pgAdmin si prefieres algo
   visual):
   ```sql
   CREATE ROLE marinafisk LOGIN PASSWORD 'elige-una-contraseña' CREATEDB;
   CREATE DATABASE marinafisk OWNER marinafisk;
   ```
   (El `CREATEDB` es necesario porque las migraciones de Prisma usan una
   "base de datos sombra" temporal para comprobar los cambios antes de
   aplicarlos — no guarda datos reales ahí.)
5. Copia `.env.example` a un fichero nuevo llamado `.env`, y pon ahí la
   contraseña que elegiste en el paso anterior.
6. Crea las tablas ejecutando:
   ```
   npx prisma migrate deploy
   ```

## 2. Arrancar el backend

```
npm start
```

Si todo va bien, verás en la terminal:
```
Backend MARINAFISK escuchando en http://localhost:3000
```

Para comprobar que funciona, abre esa dirección + `/health` en el navegador:
http://localhost:3000/health — debería mostrar `{"ok":true,...}`.

## 3. Ver los datos de forma visual (sin saber SQL)

```
npx prisma studio
```

Abre una pantalla en el navegador donde puedes ver y editar cada tabla como
si fuera una hoja de cálculo — útil para comprobar que los datos están bien
sin tener que usar la API ni SQL.

## 4. Protección contra doble grabación por clic repetido (a nivel de servidor)

Pedido explícito de Víctor (`CORRECCIONES_02-09-2026_para_Code.md`, punto 1 —
ver Fase 0 punto 11.3): en el HTML actual, un clic repetido en "GRABAR"
mientras el guardado tardaba en confirmarse creó el mismo pedido varias
veces, porque solo había protección en pantalla (botón deshabilitado). Aquí
la protección es del servidor, no solo de una pantalla que todavía no existe.

**Toda petición `POST` que crea un documento nuevo** (`/clientes`,
`/proveedores`, `/articulos`, `/compras`, `/partidas`, `/pedidos`,
`/traspasos`, `/repartos`, `/listas-precio`) **exige un campo
`idempotencyKey`** en el cuerpo — una cadena que el cliente genera **una
vez por intento de guardado** (por ejemplo, un UUID generado en el momento
de pulsar el botón) y que debe **reenviar tal cual** si ese mismo intento se
reintenta (por un clic de más, un fallo de red, etc.) — nunca generar una
clave nueva para reintentar el mismo intento, porque eso anularía la
protección.

Qué hace el servidor con esa clave:
- Primera vez que se ve esa clave: procesa la petición normalmente.
- Si la clave ya se usó y esa petición **ya terminó**: devuelve la misma
  respuesta de entonces, sin crear nada nuevo — un reintento es indistinguible
  de la primera vez, en vez de duplicar.
- Si la clave ya se usó y esa petición **todavía se está procesando**
  (dos clics casi a la vez): la segunda petición recibe `409 Conflict` en
  vez de crear un segundo registro — probado con dos peticiones disparadas
  literalmente a la vez, solo se crea un registro.
- Si la petición real falla (ej. datos inválidos), la clave se libera —
  un reintento posterior con la misma clave, ya con datos correctos, se
  procesa con normalidad, sin quedar bloqueada para siempre.

Sin `idempotencyKey` en el cuerpo, estas rutas devuelven `400` — a propósito,
para que sea imposible integrar un frontend nuevo sin esta protección por
descuido.

## 5. Qué endpoints existen ya

- `GET /health` — comprobar que el backend está vivo.
- `GET /export` — vuelca todas las tablas en un JSON, para comparar contra
  el backup del programa actual durante la migración.
- `/clientes`, `/proveedores`, `/articulos` — CRUD completo (crear, leer,
  editar, borrar). **El campo `agencia` de un cliente solo admite una lista
  cerrada de transportistas** (`TRANSFRIO`, `KARTIN`, `OLANO`, `MOUZO`,
  `FARIÑA` — añadido el 20/11/2026, ver `src/agencias.js`): un valor fuera
  de esa lista da `400`, y los nombres mal escritos que ya existían en el
  catálogo real (`CARPIN`, `HOLLANO`/`HOLANO`, `MOZO`) se corrigen solos al
  guardar. El mismo campo en `/pedidos` (foto de la agencia en el momento
  del pedido) se normaliza igual.
- `/compras` — crear, leer, **y editar/anular** (corregido el 22/11/2026,
  decisión de Víctor — ver Fase 0 punto 15: las compras dejaron de ser
  "dato sagrado"). No hay `DELETE` real nunca: "borrar" una compra es
  `POST /compras/:id/anular` (marca `anulada`/`anulada_en`/`anulada_por`,
  la fila nunca desaparece). Para corregir una ya grabada:
  - `PUT /compras/:id` — cambia `numeroPartida`, `albaranProveedor` y/o
    `proveedorId` de la cabecera; si cambia el proveedor, **todas las
    líneas se recalculan en vivo** contra el proveedor nuevo (2% de OP,
    IVA — nunca se queda con la fórmula del proveedor antiguo).
  - `PUT /compras/:id/lineas/:lineaId` — cambia `articuloId`, `cajas`,
    `kilos` (admite expresión, igual que al crear), `precioKg` y/o
    `control` de una línea concreta; recalcula esa línea y los totales de
    la compra.
  - Una compra `anulada` no se puede editar (hay que grabar una nueva).
  **El número de partida lo teclea Víctor** (corregido el 20/11/2026 — antes
  era al revés): `POST /compras` admite un campo opcional `numeroPartida`
  — si se manda, se registra tal cual (puede coincidir con una partida ya
  usada por otro proveedor/fecha, se reutiliza sin más) y se asegura de que
  la numeración automática nunca lo repita más adelante; si se deja vacío,
  el servidor asigna el siguiente automático de siempre (ver Fase 2, punto
  2, y `src/asignacionPartida.js`). El caso de excepción (necesidad de
  producción de otra partida distinta el mismo día+proveedor) ya no
  necesita ningún flag: basta con teclear un número distinto al de la
  partida principal de ese día, se registra solo como excepción.
  `GET /compras/partidas-del-dia?fecha=...&proveedorId=...` sigue existiendo
  pero ahora es solo informativo (qué números ya se usaron hoy con ese
  proveedor).
  **Tampoco se envía ningún importe calculado (12/09/2026):** cada línea de
  `lineas` solo lleva datos crudos (`articuloId`, `cajas`, `kilos`,
  `precioKg`, `control`) — el campo `kilos` admite también una suma simple
  como en el Excel (ej. `"12+13.5"`, para pesar cajas por separado). El
  servidor calcula `baseZgz`, el 2% de OP, el IVA y el total de factura **en
  vivo**, consultando el proveedor tal cual está en ese momento en la base
  de datos (ver Fase 2, puntos 1 y 3, y `src/calculoCompra.js`) — nunca se
  acepta un importe ya calculado desde el cliente, para que un frontend con
  la fórmula desactualizada no pueda grabar una compra con el 2% de OP o el
  IVA equivocados. Probado el 12/09/2026 con un proveedor de cada
  combinación (subasta/no subasta, Nacional/Intracomunitario): el cálculo
  coincide con la fórmula esperada en todos los casos.
- `/partidas` — crear y leer, más `POST /partidas/:id/cerrar` para el cierre
  manual y `POST /partidas/ajustar-siguiente-numero` (equivalente al botón
  "🔢 Próxima partida" del HTML — para sincronizar la numeración con el
  Excel de Víctor). `GET /partidas/disponibles?articuloId=&precioVenta=`
  (12/09/2026, ver Fase 2 punto 4): partidas disponibles para un artículo
  (o su familia — mismo producto en otra talla, ver `src/margenPartida.js`),
  con los kilos que quedan de cada una y el margen ya calculado si se pasa
  un precio de venta — para construir el desplegable de "elegir partida".
  **Corregidos el 22/11/2026, dos fallos reales en `obtenerPartidasDisponibles`
  (`src/margenPartida.js`):** no excluía las compras anuladas (sus kilos
  seguían contando como vendibles) y, cuando varias compras compartían el
  mismo número de partida (proveedores distintos o varios albaranes del
  mismo día), solo se tenía en cuenta la primera encontrada en vez de sumar
  los kilos de todas con coste medio ponderado. Ambos corregidos y probados
  con datos reales (ver Fase 2 punto 4).
- `/pedidos` — CRUD completo. `POST /pedidos` y `PUT /pedidos/:id` calculan
  varias cosas en el servidor en vez de aceptarlas ya calculadas del
  cliente (mismo motivo que en compras — Fase 0 punto 2):
  - **Nº de albarán (`numero`) — corregido el 22/11/2026, fallo real
    encontrado al construir la pantalla de Pedidos:** la columna era
    `Int @unique` sin ningún valor por defecto, y nada lo rellenaba nunca
    (a diferencia de `Partida.numeroPartida`). Añadida una secuencia real
    de Postgres (`pedidos_numero_seq`, mismo patrón que
    `partidas_numero_partida_seq`) como `DEFAULT` de la columna: si no se
    manda `numero` (o se manda vacío), se asigna el siguiente automático,
    seguro aunque dos puestos graben a la vez (ver Fase 0 punto 74, el
    incidente real de 667 números duplicados con el contador antiguo en
    memoria). Si se manda un número a mano que ya existe, se devuelve un
    error claro en vez de un fallo interno de Prisma.
  - **IVA de ventas (12/09/2026, ver Fase 2 punto 3):** `baseImponible`,
    `iva` y `total` del pedido se calculan a partir de las líneas y del
    `tipoIva` del cliente (`clienteId`) consultado en ese momento en la
    base de datos — Normal → 10%, Recargo de Equivalencia → 10%+1,4%,
    Intracomunitario → 0% (`src/ivaVentas.js`, puerto de
    `calcularIvaPedido()` del HTML). El total de cada línea también se
    calcula en el servidor (`peso * precio * (1 - descuento/100)`), con el
    peso evaluado como expresión (ver el punto siguiente). Los campos
    "foto" del cliente (`clienteNombreSnapshot`, etc.) se rellenan también
    desde el cliente real en ese momento, no hace falta que el cliente
    HTTP los mande.
  - **Peso con expresión ("12+13.5") — corregido el 22/11/2026, fallo real
    encontrado al construir la pantalla de Pedidos:** el peso de una línea
    nunca se evaluaba como expresión (`Number("12+13.5")` da `NaN`→0), a
    diferencia de Kilos en Compras. Añadido `evaluarExpresionPeso` en
    `src/ivaVentas.js` (puerto directo de `evaluarExpresionKilos` de
    `calculoCompra.js`), evaluado una sola vez en `prepararPedido` antes de
    la asignación de partida/reservas (para que la reserva de kilos no se
    confunda con el texto crudo) y antes del cálculo del total.
  - **Partida de venta — reescrito el 24/11/2026 (ver Fase 2 punto 4):**
    cada línea admite `partidas: [{numeroPartida, kilos}, ...]` (el reparto
    elegido a mano en el desplegable del frontend, una o varias — ver
    `public/pedidos.js`), o un `partidaNumero` suelto (compatibilidad, una
    sola partida), o nada en absoluto: en ese caso el servidor sigue
    pudiendo autoasignar en silencio la partida disponible más antigua que
    llegue al margen mínimo (1,30 €/kg) y cubra el peso entero (red de
    seguridad, no el camino normal — Víctor elige a mano en producción). Si
    ninguna llega al margen, la línea queda sin partida (excepción). Un
    `partidaNumero: null` mandado explícitamente (no omitido) fuerza "sin
    partida" de verdad, sin autoasignar.
  - `POST /pedidos/asignar-partidas-dia` (`{fecha}` en el cuerpo, por
    defecto hoy) — equivalente al botón "📦 ASIGNAR PARTIDAS DE HOY": asigna
    en lote todo lo que puede de los pedidos de esa fecha y devuelve las
    excepciones restantes (con sus partidas disponibles) para revisión
    manual.
  - `PATCH /pedidos/lineas/:id/partida` (`{partidaNumero}`) — aplica a mano
    la partida elegida para una línea que quedó como excepción.
  - **"Reservas" (ver Fase 2 punto 4):** dos o más líneas del MISMO pedido
    sin grabar todavía que pidan el mismo producto ya no pueden recibir
    ambas la misma disponibilidad sin reducir — cada línea (con partida a
    mano, repartida o automática) "reserva" sus kilos en memoria antes de
    calcular la siguiente. `POST /pedidos/asignar-partidas-dia` no necesita
    este arreglo porque graba cada línea en la base de datos antes de pasar
    a la siguiente.
  - **Reparto de una línea entre varias partidas (24/11/2026):** si ninguna
    partida disponible cubre el peso entero de la línea, se puede repartir
    entre varias (`PedidoLineaPartida`/`TraspasoLineaPartida` en
    schema.prisma — solo se crean filas aquí cuando de verdad hay más de
    una partida, el caso normal sigue usando solo `partidaNumero`). Los
    kilos de la ÚLTIMA partida del reparto nunca se guardan tal cual: se
    recalculan siempre como "lo que falte hasta el peso de la línea"
    (`datosLineaParaCrear` en `routes/pedidos.js`), para que un pedido
    editado más tarde (cambio de peso) nunca deje un reparto desincronizado.
    `GET /pedidos`/`GET /pedidos/:id` incluyen `lineas[].partidas` (vacío
    salvo que la línea esté repartida).
- `/traspasos` — **reescrito el 24/11/2026** (hasta entonces solo guardaba
  tal cual lo que mandaba el cliente HTTP, sin validar ni calcular nada —
  hueco real de la Fase 1 nunca actualizado a los criterios de Fase 2):
  - `Traspaso.numero` por secuencia real (`traspasos_numero_seq`), mismo
    patrón y mismo hueco real que tenía `Pedido.numero` antes del
    22/11/2026.
  - Cada línea admite `piezas` (nº de ejemplares sueltos, distinto de
    `cantidad`/cajas — confirmado leyendo el HTML real el 24/11/2026, ver
    Fase 0) y `precio` — un valor ESTIMADO, no fiscal (así lo rotula el PDF
    real: "Valor estimado (no fiscal)"), tecleado por el cliente HTTP (con
    el PVP1 del artículo como valor de partida en el frontend) y NUNCA
    derivado del coste de la partida (la primera versión de esta ruta
    asumía "a coste", corregido antes de dar la pantalla por terminada).
    El total de cada línea (`peso * precio`) lo calcula siempre el
    servidor, igual que en compras/pedidos.
  - Partida: mismo contrato que `/pedidos` (`partidas: [{numeroPartida,
    kilos}]`, `partidaNumero` suelto, autoasignación como red de
    seguridad, `partidaNumero: null` explícito para forzar "sin partida"),
    pero con `elegirPartidaParaTraspaso` (`src/margenPartida.js`) en vez de
    `elegirPartidaParaVenta` — un traspaso no es una venta, no hay margen
    que comprobar, solo antigüedad (FIFO) y si la partida cubre el peso.
  - `palets` (documento electrónico de control, ver `Pedido.palets` más
    abajo) — también en `Traspaso`.
- `/repartos` — CRUD completo (sin actualizar todavía a los criterios de
  Fase 2 — pendiente cuando se construya esa pantalla).
- **PALETS** (documento electrónico de control obligatorio desde el
  5/10/2026, confirmado el 24/11/2026 leyendo el HTML real): `Pedido.palets`
  y `Traspaso.palets` (`Int`, por defecto 0 = "PALET VARIADO" al imprimir).
  El frontend lo vuelve a confirmar en un aviso propio justo antes de
  grabar (`public/api.js`, `pedirPalets()`), con el valor ya puesto en la
  cabecera como punto de partida.
- **PIEZAS** (nº de ejemplares sueltos, distinto de `cantidad`/cajas,
  confirmado el 24/11/2026): `piezas Int?` en `PedidoLinea` y
  `TraspasoLinea`.
- `/listas-precio` — CRUD completo, más (13/09/2026, ver Fase 2 punto 5):
  - `GET /listas-precio/auto?fecha=` — modo automático: coste medio real de
    las compras de esa fecha por artículo (ponderado por kilos) más el
    margen fijo de esta pantalla (1,70 €/kg — no confundir con el margen
    mínimo de 1,30 €/kg de la asignación de partida a ventas).
  - `GET /listas-precio/plantilla?tipo=&fecha=` — punto de partida para el
    modo manual: las líneas propias si ya existen, o si no, las de la OTRA
    lista (Mayorista/Pescadería) de esa misma fecha como plantilla — cada
    lista sigue siendo independiente una vez guardada.
  - `GET /listas-precio/coste-referencia?articuloId=` — coste real actual
    de un artículo (media ponderada de las partidas disponibles), para el
    aviso de venta por debajo de coste, en vez de una cifra tecleada a
    mano.
  - Cada línea admite `articuloId` (del catálogo) **o** `descripcionLibre`
    (texto suelto, igual que el modo manual del HTML actual, que no obliga
    a un producto del catálogo) — una de las dos es obligatoria. También
    admite `coste` y `existencias` (texto libre, igual que en partidas),
    la "versión interna" que nunca debe mandarse al cliente.
- `GET /listados/gestion?desde=&hasta=&incluirTraspasos=&clienteId=&articuloId=`
  (13/09/2026, ver Fase 2 punto 6) — un traspaso interno a Zaragoza no es
  una venta (no hay cliente, no hay cobro): por defecto este listado solo
  cuenta ventas reales (`pedidos`). Con `incluirTraspasos=true` añade
  también filas de `traspasos`, siempre claramente diferenciadas
  (`tipo: "VENTA"` / `"TRASPASO"`, nunca mezcladas) y con los totales
  separados: `totalEconomico` (solo ventas) y `totalKilosConTraspasos`
  (ventas + traspasos). Pensado como función compartida
  (`src/listadoGestion.js`) para que cualquier listado nuevo la reutilice
  en vez de reimplementar la regla cada vez.

### Fechas: siempre acepta el formato local del HTML (`YYYY-MM-DD`)

Corrección real (13/09/2026): varias rutas (`/pedidos`, `/traspasos`,
`/repartos`, `/partidas`, `/listas-precio`) exigían sin darse cuenta una
fecha en formato ISO completo con hora — si se les mandaba una fecha tal
cual la genera `fechaLocalISO()` del HTML (`"2026-09-13"`, sin hora),
Prisma la rechazaba. Corregido con un pequeño ayudante compartido
(`src/fechas.js`) que todas estas rutas usan antes de grabar — el formato
local de siempre ya funciona en todas ellas.
- `POST /importar/compras-excel` — importar el Excel de compras (equivalente
  al botón "📥 IMPORTAR COMPRAS EXCEL" del programa actual). Sube el fichero
  como `archivo` (multipart/form-data), opcionalmente `puestoOrigen`. Busca
  una hoja llamada "COMPRAS" con las columnas N PARTIDA/FECHA/COD PROV/COD
  PROD/KILOS/EUR-KG (y opcionalmente ALB PROV/CAJAS/CONTROL), agrupa filas
  por partida+albarán+proveedor igual que hoy, y calcula cada línea con la
  misma fórmula de siempre — **con una corrección deliberada**: el IVA de
  compras ya tiene en cuenta si el proveedor es intracomunitario (0%) en vez
  del 10% fijo que usa el HTML actual (ver Fase 0 punto 4 / Fase 2 punto 3).
  Si el Excel trae un producto que no existe en el catálogo, se crea
  automáticamente (con la descripción provisional = su código) en vez de
  perder esa compra. **Decisión de Víctor (05/09/2026):** si se reimporta el
  mismo Excel y una compra ya existente cambió, se sobrescribe en su sitio
  — igual que hace hoy el programa — guardando antes una copia de lo que
  había en `importaciones_backup`. Desde el 22/11/2026 esta ya no es la
  única vía por la que una compra puede cambiar — también se puede editar
  a mano con `PUT /compras/:id` (ver más arriba).
  **Corregido el 20/11/2026:** una compra cargada a mano sin "Alb.
  proveedor" se duplicaba al reimportar el Excel, porque la clave exacta
  (partida+alb+proveedor) no la reconocía como la misma compra en cuanto el
  alb. proveedor no coincidía (vacío en un lado, con el dato real del Excel
  en el otro). Ahora, si no hay coincidencia exacta, se busca entre las
  compras del mismo proveedor+fecha con alb. proveedor vacío que además
  coincidan en número de partida o en el conjunto de líneas (mismo
  artículo+kilos) — se trata como la misma compra y se actualiza en su
  sitio (rellenando el alb. proveedor) en vez de duplicarla.
  **Corregido el 22/11/2026:** las dos búsquedas de coincidencia (la de
  clave exacta y el fallback de arriba) no excluían las compras anuladas —
  una compra anulada se podía "resucitar" en silencio si el Excel traía
  algo parecido. Ahora las dos añaden `anulada: false`: si no hay ninguna
  coincidencia activa se crea una compra nueva y la anulada se queda tal
  cual estaba. Probado con una compra anulada y un reimport con los mismos
  datos → crea una compra nueva, no toca la anulada.

### Nota de seguridad sobre la lectura de Excel

Se usa la librería `exceljs`, no `xlsx` (SheetJS): la versión de `xlsx`
publicada en el registro de npm tiene una vulnerabilidad de severidad alta
sin parche disponible ahí (los propios autores solo la corrigen en su CDN
propio, no accesible desde este entorno de desarrollo). `exceljs` no tiene
ese aviso abierto.

## 6. Un servidor mal formado nunca debe tirar el backend entero

Fallo real encontrado y corregido el 12/09/2026: al añadir una ruta nueva
por descuido *después* de una ruta genérica `/:id` (Express interpretó la
ruta nueva como si "id" fuera el texto de su nombre), un id no numérico
llegó sin comprobar hasta una consulta a la base de datos, que lanzó un
error no capturado — y **eso tiró todo el proceso del backend**, dejando a
cualquiera que estuviera usándolo sin servicio, no solo a quien hizo esa
petición. Corregido en dos niveles, no solo arreglando esa ruta:

- `express-async-errors` (cargado al principio de `src/index.js`, antes de
  definir ninguna ruta): cualquier error dentro de una ruta `async` que
  nadie capture ahora llega al manejador de errores de Express (responde
  `500` a esa petición) en vez de crashear el proceso entero — red de
  seguridad para todo el backend, no solo para las rutas ya revisadas.
- Además, cada ruta `GET/PUT/DELETE /:id` valida explícitamente que el id
  sea un número entero antes de tocar la base de datos, devolviendo `400`
  con un mensaje claro en vez de dejar que el error llegue tan lejos.

Probado reproduciendo el fallo original (la ruta mal ordenada) y con un id
no numérico directo: el servidor responde el error correspondiente y sigue
funcionando con normalidad después, en vez de quedarse caído.

## 7. Lo que falta para cerrar la Fase 1 (ver el documento de la fase)

- [ ] **Migrar el backup JSON real** del programa actual a estas tablas, y
      verificar registro a registro que coincide (pendiente de que aportes
      el backup JSON más reciente — el script de migración se escribirá en
      cuanto lo tengamos).
- [ ] Revisar y entender, en términos sencillos, qué se ha construido aquí.

No se ha tocado nada del HTML/programa actual — sigue funcionando igual,
en paralelo, mientras se prueba esto.
