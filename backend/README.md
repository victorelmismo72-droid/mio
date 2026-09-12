# MARINAFISK — Backend (Fase 1 + primera pieza de Fase 2)

Esto es el backend de la Fase 1 (guarda y lee datos: clientes, proveedores,
artículos, compras, partidas, pedidos, traspasos, repartos, listas de
precio), con varias piezas de Fase 2 ya incorporadas: la **asignación
automática del número de partida**, el **2% de OP en vivo** y el **IVA de
compras** (ver sección 5) — el cálculo de margen y el IVA de ventas siguen
pendientes de Fase 2. El HTML actual (`CARGA_DE_ALBARANES_MARINAFISK_20260902CORREGIDO_4.html`)
sigue funcionando exactamente igual mientras tanto — esto se prueba aparte,
en paralelo.

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
  editar, borrar).
- `/compras` — **solo crear y leer** (`GET`, `POST`). A propósito no existen
  rutas `PUT` ni `DELETE`: las compras son "dato sagrado" (ver Fase 0,
  punto 3) y no deben poder modificarse nunca desde la API.
  **El número de partida ya no lo envía el cliente**: `POST /compras` recibe
  `fecha` y `proveedorId` (en vez de `numeroPartida`) y el servidor decide el
  número — reutiliza la partida "de siempre" de ese día+proveedor, o crea
  una nueva si es la primera compra de ese proveedor ese día (ver Fase 2,
  punto 2, y `src/asignacionPartida.js`). Para el caso raro de excepción
  (necesidad de producción de otra partida distinta el mismo día+proveedor),
  se puede mandar `partidaNueva: true`; para elegir explícitamente entre
  varias partidas ya existentes ese día, `partidaElegida: <número>`.
  `GET /compras/partidas-del-dia?fecha=...&proveedorId=...` lista las
  partidas de ese día+proveedor (la principal primero) para poder elegir.
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
  manual (todavía no calcula kilos disponibles ni margen, eso sigue siendo
  Fase 2) y `POST /partidas/ajustar-siguiente-numero` (equivalente al botón
  "🔢 Próxima partida" del HTML — para sincronizar la numeración con el
  Excel de Víctor).
- `/pedidos`, `/traspasos`, `/repartos`, `/listas-precio` — CRUD completo.
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
  había en `importaciones_backup`. Esta es la única vía por la que una
  compra puede cambiar tras crearse; el resto de la API la sigue tratando
  como "dato sagrado" (sin `PUT`/`DELETE`).

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
