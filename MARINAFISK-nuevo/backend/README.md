# MARINAFISK — Sistema nuevo (Fases 1, 2, 3 y 4)

Sustituye los archivos JSON de la carpeta compartida por una base de datos
real (PostgreSQL) más un backend que sabe leer y escribir en ella, calcula
la lógica de negocio (2% de OP, IVA, Recargo de Equivalencia, asignación de
partidas — Fase 2), ya puede usarse desde más de un ordenador a la vez en
la misma red local (Fase 3), y tiene una pantalla de verdad para el día a
día (Pedidos y Compras, con asignación de partida y avisos en vivo — Fase 4).

**Para usarlo cada día**: arranca el backend (`npm start`, ver más abajo) y
abre `http://localhost:3001` en el navegador (o la dirección de red que
imprime al arrancar, desde el otro ordenador). Todo lo demás de este
documento es para instalarlo la primera vez o para quien quiera tocar el
código.

El HTML de siempre (`CARGA_DE_ALBARANES_MARINAFISK_...html`) sigue
funcionando exactamente igual, sin tocar, en paralelo. Esto de aquí es un
sistema nuevo que se construye al lado, no un reemplazo todavía.

---

## 1. Qué hay en esta carpeta

- `db/schema.sql` — la definición de todas las tablas de la base de datos.
- `src/` — el programa del backend (la API): permite crear/leer/actualizar/
  borrar cada tipo de dato.
- `scripts/migrar_backup.js` — coge un backup JSON de los de siempre y lo
  mete en la base de datos nueva.
- `scripts/verificar_migracion.js` — comprueba, campo a campo, que lo que
  quedó en la base de datos es exactamente igual al backup original.
- `VERIFICACION_MIGRACION_*.md` (en la carpeta de arriba, `MARINAFISK-nuevo/`)
  — el resultado por escrito de esa comprobación, ya hecha con un backup
  real.

---

## 2. Instalar PostgreSQL en tu ordenador (una sola vez)

1. Descarga el instalador oficial desde <https://www.postgresql.org/download/>
   (elige tu sistema operativo) e instálalo con las opciones por defecto.
   Durante la instalación te pedirá una contraseña para el usuario
   `postgres` — apúntala en algún sitio seguro.
2. Abre una terminal (en Windows, "SQL Shell (psql)" que instala el propio
   PostgreSQL, o PowerShell) y crea el usuario y la base de datos para
   MARINAFISK:
   ```sql
   CREATE ROLE marinafisk_app LOGIN PASSWORD 'elige-tu-propia-contraseña';
   CREATE DATABASE marinafisk OWNER marinafisk_app;
   ```
3. Aplica el esquema (crea todas las tablas):
   ```
   psql -h localhost -U marinafisk_app -d marinafisk -f db/schema.sql
   ```
   Te pedirá la contraseña que elegiste en el paso 2.

Si en el futuro hace falta reinstalar desde cero (por ejemplo, para
practicar sin miedo a romper nada), basta con borrar la base de datos
(`DROP DATABASE marinafisk;`), volver a crearla y repetir el paso 3 — no
borra nada del HTML actual, son sistemas completamente separados.

---

## 3. Configurar y arrancar el backend

1. Instala [Node.js](https://nodejs.org/) (versión 18 o superior) si no lo
   tienes ya.
2. En esta carpeta (`backend/`), copia `.env.example` a `.env` y ajusta la
   contraseña si pusiste una distinta a `marinafisk_dev` en el paso anterior.
3. Instala las dependencias (una sola vez, o cada vez que este proyecto
   cambie):
   ```
   npm install
   ```
4. Arranca el backend:
   ```
   npm start
   ```
   Si todo va bien, verás `MARINAFISK backend escuchando en
   http://localhost:3001`. Puedes comprobarlo abriendo
   <http://localhost:3001/salud> en el navegador: debe mostrar `{"ok":true}`.

---

## 4. Migrar un backup real (una vez que la base de datos está creada y vacía)

```
node scripts/migrar_backup.js /ruta/al/Backup_XXXX.json
```

Esto copia clientes, artículos, proveedores, compras, pedidos, traspasos y
repartos del backup a la base de datos, tal cual están (sin inventar ni
cambiar nada), y dice al final cuántos registros migró de cada tipo y si
encontró algo raro que convenga revisar (por ejemplo, un proveedor citado en
una compra que ya no existe en el catálogo).

**Solo funciona sobre una base de datos vacía** (recién creada con el paso 2
de arriba) — si ya tiene clientes, el script se para y no hace nada, para no
mezclar datos por error.

## 5. Comprobar que la migración salió bien

```
node scripts/verificar_migracion.js /ruta/al/Backup_XXXX.json
```

Compara TODO (no solo una muestra) contra el backup original, campo a
campo, y escribe un informe (`VERIFICACION_MIGRACION_<fecha>.md`) con el
resultado. Si dice "VERIFICACIÓN SUPERADA", está todo correcto.

---

## 6. Qué sabe hacer ya la API (para cuando la use la Fase 4 o para pruebas)

Todo bajo `http://localhost:3001/api/...`. Los datos se mandan y reciben en
formato JSON.

| Ruta | Qué hace |
|---|---|
| `GET/POST/PUT/DELETE /api/clientes` | Catálogo de clientes |
| `GET/POST/PUT/DELETE /api/articulos` | Catálogo de artículos |
| `GET/POST/PUT/DELETE /api/proveedores` | Catálogo de proveedores |
| `GET /api/partidas` | Estado de las partidas (kilos disponibles, cerradas...) |
| `POST /api/partidas/:numero/cerrar` y `/reabrir` | Cierre manual de una partida |
| `POST /api/partidas/cerrar-masivo` | Cierre masivo por fecha |
| `GET, POST /api/compras` | Compras — **solo crear y leer, nunca modificar ni borrar** (dato sagrado) |
| `GET/POST/PUT/DELETE /api/pedidos` | Pedidos (albaranes de venta) |
| `GET/POST/PUT/DELETE /api/repartos` | Repartos (Reparto Super) |
| `GET/POST/PUT/DELETE /api/traspasos` | Traspasos internos |
| `GET/POST /api/listas-precio` | Listas de precio (histórico nuevo, ver más abajo) |
| `GET /api/listas-precio/auto-preview?fecha=YYYY-MM-DD` | Vista previa del modo AUTO (coste medio del día + 1,70 €/kg), sin guardar nada |
| `GET /api/exportar` | Vuelca todo en un JSON con el mismo formato que el backup de siempre, para comparar fácilmente |
| `POST /api/compras/calcular-linea` | Vista previa (Fase 2): calcula OP2/IVA de una línea sin guardar nada, leyendo el proveedor en vivo |
| `POST /api/pedidos/asignar-partida` | Vista previa (Fase 2): asignación automática de partida + margen para un artículo/precio, sin guardar nada |
| `GET /api/pedidos/excepciones/lista` | Líneas de pedido pendientes de revisión manual (sin partida, o con aviso de margen) |
| `GET /api/articulos/:id/coste-referencia` | Coste real de la partida que se asignaría ahora mismo a este artículo (para avisos de precio por debajo de coste) |
| `GET /api/listados/ventas-articulo?desde=&hasta=&articulo_id=&incluir_traspasos=1` | Listado de gestión (corrección punto 3, FASE_2 5bis): ventas por artículo/fecha, con los traspasos internos siempre aparte y sin mezclarlos en el total económico |
| `GET /api/etiquetas/formatos` | Los 6 formatos de etiqueta (FASE_5) |
| `POST /api/etiquetas/sueltas` | Etiqueta(s) suelta(s), sin pedido/traspaso/reparto detrás |
| `GET /api/pedidos/:id/etiquetas?modo=todas\|seleccion\|prueba\|repetir` | Etiquetas de un pedido, en los 4 modos del diálogo (FASE_5) |
| `GET /api/traspasos/:id/etiquetas` | Etiquetas de un traspaso (destinatario fijo Zaragoza) |
| `GET /api/repartos/:id/etiquetas?modo=todas\|nuevas` | Etiquetas de un reparto (formato Scanfisk fijo); "nuevas" solo las cajas no impresas todavía |
| `POST /api/repartos/:id/marcar-etiquetas-impresas` | Registra las cajas actuales como ya impresas, para que la próxima vez "nuevas" sepa desde dónde contar |
| `GET/PUT /api/configuracion/dias-caducidad` | Días de caducidad de las etiquetas (compartido entre CORU y PANC — antes vivía en localStorage, por ordenador) |

### Lógica de negocio ya incorporada (Fase 2)

Desde la Fase 2, `POST /api/compras` y `POST/PUT /api/pedidos` ya NO se
limitan a guardar lo que les manden: calculan ellos mismos, en el servidor
y leyendo los datos en vivo (nunca congelados):

- El 2% de OP y el IVA de cada línea de compra (según si el proveedor es de
  subasta y su tipo de IVA).
- El IVA y el Recargo de Equivalencia de cada pedido (según el tipo fiscal
  del cliente) — esto es lógica nueva, el HTML actual nunca aplica recargo.
- La partida asignada a cada línea de un pedido, si no se manda ya resuelta
  desde la pantalla — con el margen mínimo de 1,30 €/kg.

El código de esta lógica vive en `src/logica/` (un archivo por tema:
`calculosCompra.js`, `calculosVenta.js`, `familiaProducto.js`,
`partidas.js`, `listaPrecioAuto.js`), con comentarios en español explicando
qué regla aplica cada uno y por qué (tal como pide FASE_2).

Para comprobar que esta lógica da los mismos resultados que el HTML actual
sobre datos reales:
```
node scripts/verificar_fase2.js
```
Recalcula el 2% de OP y el IVA de las 1108 compras reales migradas (0
diferencias esperadas), prueba el caso real de falso positivo de familia de
producto citado en el propio código fuente del HTML actual, el margen
mínimo, y el IVA/Recargo de venta. Escribe el resultado en
`VERIFICACION_FASE2_<fecha>.md`.

Toda creación de compra/pedido/reparto/traspaso necesita un campo `uid`
(una clave única que genera la propia pantalla) — si se manda dos veces la
misma petición con el mismo `uid` (por ejemplo, por un doble clic en
"grabar"), la segunda vez NO crea un duplicado: devuelve el mismo resultado
que la primera. Esto es la corrección del 01/09/2026 (ver
`CORRECCIONES_2026-09-02_HTML_actual_MARINAFISK.md`, punto 1), pero
implementada aquí a nivel de servidor, no solo bloqueando un botón en
pantalla.

---

## 7. Qué NO hace todavía el sistema (tras Fase 1 + Fase 2)

- No hay ninguna pantalla — todo esto se usa hoy por API (`curl`, o algo
  como Postman). La interfaz de verdad es la Fase 4.
- No genera ningún documento (albarán, hoja Transfrío, CMR...) — eso
  también es Fase 4.
- No hay "asignación masiva de partidas de todos los pedidos de un día"
  (la función `asignarPartidasDelDia()`/`autoAsignarPartidas()` del HTML
  actual) — solo la asignación inline línea a línea. Se puede añadir cuando
  haga falta.
- Los listados de gestión (ventas por artículo separando traspasos, etc. —
  corrección 02/09/2026 punto 3) todavía no existen como tales.
- Las listas de precio (`/api/listas-precio`) son una funcionalidad **nueva**
  (guardar un histórico real por día), porque hoy el programa actual no
  guarda ningún histórico de listas — solo un borrador del día que se pierde
  al día siguiente. No sustituye nada existente, se añade.
- Todos los proveedores se migraron marcados como `NACIONAL` (el campo
  `tipo_iva` no existía antes) — hay que revisar a mano cuáles son
  intracomunitarios; mientras tanto, ningún proveedor real prueba todavía la
  rama de código del IVA intracomunitario con datos reales (sí está probada
  con un proveedor de prueba, ver `VERIFICACION_FASE2_*.md`).
- El 1,4% de recargo de equivalencia está pendiente de confirmación por la
  asesoría fiscal de Víctor (ver `src/logica/calculosVenta.js`).

---

## 8. Diferencias encontradas entre "lo que se supuso al principio" y "lo que hay de verdad" en los datos reales

Al analizar el backup real de Víctor durante esta fase, aparecieron algunos
casos que no se sabían de antemano (documentados también como comentarios
en `db/schema.sql`):

- En traspasos, el campo "partida" no siempre es un número limpio: a veces
  son varias partidas juntas (`"56236+56238"`) o partida con código de
  artículo (`"C250-56167"`). Se guarda el texto original tal cual
  (`partida_texto`) y, además, el número cuando es interpretable
  (`numero_partida`), sin forzar ni inventar nada.
- Hay ~76 números de partida citados en pedidos o traspasos que no
  corresponden a ninguna compra de este backup — probablemente de algún
  reinicio manual pasado del contador de partidas (ver `FASE_0`, punto 6).
  Se han dejado como partidas sin compra asociada, no se ha inventado una
  compra falsa para taparlo.
- Los importes de compras vienen con hasta 6 decimales significativos
  (el programa actual nunca redondea los cálculos intermedios) — la base de
  datos los guarda con esa misma precisión exacta, sin redondear.

---

## 9. Usar esto desde dos ordenadores (Fase 3)

Ver `FASE_3_sincronizacion_MARINAFISK.md` para la explicación completa.
Resumen práctico:

### 9.1. Dónde vive todo

PostgreSQL y este backend se instalan **en un solo ordenador** (el que
Víctor decida — puede ser el de A Coruña). El otro puesto (Pancho) **no**
instala su propia base de datos ni su propio backend: su pantalla (cuando
exista, Fase 4) se conecta por la red local al backend del primer
ordenador, igual que un navegador se conecta a una página web.

Al arrancar (`npm start`), el backend imprime en la pantalla la dirección
que hay que usar desde el otro ordenador, por ejemplo:

```
MARINAFISK backend escuchando en el puerto 3001.
  - En este mismo ordenador: http://localhost:3001
  - Desde OTRO ordenador de la misma red local, usar una de estas direcciones:
      http://192.168.1.23:3001
```

Si Windows pregunta si permitir el acceso a la red la primera vez que se
arranca, hay que aceptarlo (si no, el otro ordenador no podrá conectarse).

**Si el ordenador que hace de "servidor" está apagado, nadie puede usar el
sistema** — es una limitación real, a tener en cuenta hasta que se decida
(más adelante, Fase 5) si esto pasa a vivir en la nube en vez de en un
ordenador concreto.

### 9.2. Decir de qué puesto viene cada petición

Cada petición que escribe datos (compras, pedidos, repartos, traspasos)
puede llevar la cabecera `X-Puesto-Codigo: CORU` o `X-Puesto-Codigo: PANC`.
No es obligatoria, pero si se manda, queda registrado correctamente en
`puesto_id` y en el log de escrituras. Ejemplo:

```
curl -X POST http://192.168.1.23:3001/api/pedidos \
  -H "X-Puesto-Codigo: PANC" -H "Content-Type: application/json" \
  -d '{ "uid": "...", "fecha": "2026-09-14", "cliente_id": 1, "lineas": [...] }'
```

### 9.3. Comprobar que dos puestos a la vez no se pisan

```
node scripts/prueba_concurrencia.js http://localhost:3001
```

Crea 100 pedidos y 100 compras simulando a CORU y PANC escribiendo a la vez
de verdad (peticiones en paralelo, no una detrás de otra), y comprueba que
no hay ningún número repetido ni ningún hueco. También comprueba que 25
peticiones simultáneas con el mismo `uid` (el caso del doble clic) solo
crean 1 registro. Escribe el resultado en `VERIFICACION_FASE3_CONCURRENCIA_<fecha>.md`.

⚠️ Esta prueba **crea datos de verdad** en la base de datos donde se
ejecute (incluidas compras, que no se pueden borrar después, por ser dato
sagrado) — no ejecutarla contra la base de datos de producción real una vez
que Víctor la esté usando a diario, solo contra una base de datos de
pruebas.

### 9.4. Copia de seguridad real

```
node scripts/backup.js
```

Genera una copia de seguridad completa de la base de datos con `pg_dump` en
`backend/backups/` (esa carpeta no se sube al repositorio — contiene datos
reales de clientes). Para restaurarla, el propio script imprime al final
los dos comandos exactos a copiar y pegar (`createdb` + `pg_restore`).

Conviene programar esto para que se ejecute solo, por ejemplo una vez al
día (en Windows, con el "Programador de tareas"; en Linux/Mac, con `cron`)
— eso ya es una decisión de Víctor sobre cuándo y con qué frecuencia, no
algo que este proyecto deba fijar de antemano.

### 9.5. Qué falta todavía (a propósito, señalado para más adelante)

- No hay usuarios ni contraseñas — cualquiera en la misma red local puede
  usar la API. Aceptable por ahora (red local de confianza), pero **hace
  falta añadir autenticación real antes de exponer esto a Internet**
  (Fase 5).

---

## 10. La pantalla (Fase 4)

Ver `FASE_4_interfaz_MARINAFISK.md` para el alcance completo. Vive en
`public/` — HTML y JavaScript normal, sin React ni paso de compilación —
y la sirve este mismo backend (`http://localhost:3001`, o la IP de red
local del punto 9.1 desde el otro ordenador). No hace falta instalar nada
aparte en el ordenador que solo vaya a usar la pantalla.

**Pantallas ya construidas (Nivel 1 — el día a día):**
- **Pedidos**: crear un pedido con asignación de partida y aviso de margen
  en vivo mientras se teclea, y cálculo de IVA/Recargo antes de grabar.
- **Compras**: crear una compra con cálculo en vivo del 2% de OP y el IVA.
- **Partidas**: ver kilos disponibles, cerrar/reabrir a mano.
- **Excepciones**: líneas de pedido pendientes de revisar a mano (sin
  partida asignada, o con aviso de margen) — de momento solo de lectura.
- **Listas de precio**: modo AUTO (vista previa desde las compras del día)
  y modo MANUAL, con aviso en vivo de precio por debajo de coste real y
  existencias en texto libre.
- **Clientes / Artículos / Proveedores**: catálogo (listar, crear, editar).

Antes de elegir un puesto (CORU/PANC) en la cabecera, las peticiones se
mandan sin esa cabecera (sigue funcionando, simplemente no queda registrado
de qué puesto vino cada cosa) — elegirlo es recomendable pero no obligatorio.

**Nivel 2, ya construido (14/09/2026):**
- **Repartos** y **Traspasos** — mismo patrón que Pedidos/Compras.
- **Historial**: buscar pedidos y seleccionar varios (o usar el filtro) para
  imprimir de golpe.
- **Modelos de impresión**: catálogo de todo lo que se puede imprimir,
  generado solo desde `src/modelosImpresion.js`, con el editor de
  calibración en milímetros para lo que se imprime sobre papel pre-impreso.
- Documentos: **albarán** (con y sin precios), **Hoja Transfrío** (en
  Pedidos y en Traspasos, con destinatario fijo "MARINA FISH ZARAGOZA" en
  este último), **Hoja CMR/Carta de Porte** (solo visible para clientes con
  agencia "MOZO").

⚠️ **Las coordenadas en milímetros de Transfrío y CMR son un punto de
partida sobre una hoja en blanco, no están calibradas contra el papel real
de los transportistas** — hace falta imprimir de prueba sobre el papel
físico y ajustar con el editor de calibración (pantalla "Modelos de
impresión" → "Ajustar calibración"), exactamente igual que se tuvo que
hacer la primera vez con el HTML actual. Nadie puede saltarse ese paso sin
tener el papel y una impresora delante.

**Sigue sin construirse:** etiquetas (sin especificación de formato
todavía), listados de gestión con separación ventas/traspasos, y cualquier
inicio de sesión con usuario/contraseña.

**15/09/2026 — corrección importante sobre la impresión en lote:** la
ventana de impresión ahora se abre **siempre en el mismo instante del
clic** (antes de pedir nada al servidor) y se rellena después — si se abre
tras un `await`, el navegador puede bloquearla en silencio, sin avisar. Al
imprimir Transfrío se pregunta cuántas copias por pedido (por defecto 4) y
se construyen dentro del propio documento, nunca con el ajuste "copias"
del diálogo de impresión (que repetiría el lote entero de cabo a rabo en
vez de las copias de cada cliente seguidas). Ver
`VERIFICACION_FASE4_CORRECCION10_2026-09-15.md`.

Probado con un navegador real (no solo revisando el código) — ver
`VERIFICACION_FASE4_2026-09-14.md`.

**18/09/2026 — prueba integral de usabilidad (recorrido de un día real de
trabajo, no una fase concreta):** se recorrieron juntas, en una sola sesión
de navegador real, pantallas y flujos que hasta entonces solo se habían
probado por separado — catálogos, compra→partida→pedido de principio a
fin, repartos, traspasos, impresión en lote desde Historial, listas de
precio en los dos modos, cerrar/reabrir partidas, y las 12 pantallas del
menú en móvil (375px). Aparecieron dos fallos reales, ya corregidos:

- Imprimir la Hoja CMR en lote desde Historial con una selección mixta de
  agencias (lo normal) bloqueaba **todo** el lote en cuanto encontraba el
  primer pedido sin agencia MOZO, en vez de imprimir los que sí
  correspondían y avisar de los demás.
- En móvil, la pantalla de Compras desbordaba horizontalmente por el
  desplegable de Proveedor (un `<select>` no se encoge por debajo de su
  opción más larga dentro de un flex-column salvo que se le indique
  explícitamente) — con los nombres de proveedor reales del catálogo, no
  con datos de prueba cortos.

Ver `VERIFICACION_USABILIDAD_2026-09-18.md` para el detalle completo,
incluida la corrección aplicada a cada uno.

**18/09/2026 — último punto pendiente de Fase 4 Nivel 2 con especificación
suficiente ya construido:** pantalla "Listados de gestión" (`#/listados`,
`GET /api/listados/ventas-articulo`) — corrección punto 3 / FASE_2 punto
5bis. Filtra por fecha y artículo; por defecto solo muestra ventas reales
(pedidos); con la casilla "incluir traspasos" marcada, añade los traspasos
internos a Zaragoza como filas aparte (gris/cursiva, sin precio ni
importe, etiquetadas "TRASPASO A ZARAGOZA (interno, no es venta)") y
calcula los tres totales pedidos: ventas reales (kg + importe),
traspasado a Zaragoza (solo kg) y total de pescado movido (kg, solo para
estadística de volumen) — nunca mezclados en el total económico. Probado
con datos y navegador reales, incluido el filtro por artículo concreto —
ver `VERIFICACION_LISTADOS_GESTION_2026-09-18.md`.

## 11. Fase 5: Etiquetas (19/09/2026)

La nota anterior sobre Etiquetas ("sin especificación de formato de Víctor
todavía") estaba equivocada — no se había leído todavía, línea a línea, el
módulo `MarinaFiskEtiquetas` del HTML actual, que resulta tener una
especificación completa y ya en uso real: 6 formatos, QR, lote/caducidad, y
tres orígenes (pedido, traspaso, reparto) además de la impresión suelta
manual. Ver `FASE_5_etiquetas_MARINAFISK.md` para el detalle completo leído
del código real, y `VERIFICACION_ETIQUETAS_2026-09-19.md` para la prueba con
navegador y datos reales.

Construido: los 6 formatos (`marina_fisk`, `marina_fisk_fr`, `marina_fisk_it`,
`marina_fisk_masymas`, `david_sala`, `scanfisk`) con la misma rejilla física
(50×145mm) que ya usa Víctor, QR real (misma librería `qrcode-generator` ya
incluida en el HTML actual, sin llamadas externas), logo/sello reales
extraídos del HTML actual; etiquetas desde Pedidos (con los 4 modos del
diálogo: todas/selección/prueba/repetir), desde Traspasos (destinatario fijo
Zaragoza) y desde Repartos (una por caja, con seguimiento de "ya impreso" —
igual que el HTML actual, para no repetir etiquetas de cajas que no han
cambiado); pantalla "Etiquetas sueltas" para uso manual; el campo de formato
de etiqueta del cliente pasó de texto libre a desplegable con los 6 ids
reales. Los días de caducidad configurables ahora son un valor compartido en
base de datos (`GET/PUT /api/configuracion/dias-caducidad`), no localStorage
por ordenador como en el HTML actual — CORU y PANC ven siempre el mismo
valor.

Durante la propia prueba con navegador real se encontró y corrigió un fallo
real: el motor de impresión esperaba la clave `formatoId` pero la API
siempre devuelve `formato_id` — como resultado, toda etiqueta se imprimía en
español por defecto sin ningún aviso, con independencia del formato real que
le tocara. Se detectó al comprobar visualmente una etiqueta en italiano.

**Se deja fuera de esta fase, señalado honestamente, no construido:** la
importación de hojas Excel "CARGA [super]" de Scanfisk (formato de fichero
específico de un flujo externo, no forma parte del resto del sistema), el
envío de la muestra en PDF por WhatsApp/email a Scanfisk Celeiro (atajos
sobre un PDF aparte, se puede seguir haciendo a mano), y los documentos de
transporte del reparto — ficha de envío, hoja de ruta (no son etiquetas de
producto). Ninguno de los tres afecta a la trazabilidad ni a la impresión
real de etiquetas.

De lo que quedaba señalado como pendiente en Fase 4 Nivel 2, solo falta ya
cualquier sistema de login (fuera de alcance mientras el uso sea en red
local de confianza).

## 12. Fase 6: Importación de catálogos desde Excel (19/09/2026)

Al pedir "seguir con las etiquetas y la importación de Excel", se encontró
que el HTML actual tiene dos cosas distintas con ese nombre: la
importación de Excel para generar etiquetas de Scanfisk (código muerto,
sin botón que la dispare — ver Fase 5) y 6 importadores de catálogo
completamente reales, cada uno con su propio botón. Se le preguntó a
Víctor y confirmó que se refería a estos últimos. Ver
`FASE_6_importacion_excel_MARINAFISK.md` para el detalle leído del código
real, y `VERIFICACION_IMPORTACION_EXCEL_2026-09-19.md` para la prueba con
ficheros `.xlsx` reales.

Construido: importación de **Clientes** (hoja "CLIENTES"), **Proveedores**
("PROVEEDORES"), **catálogo de Artículos** ("PRODUCTOS"), **nombres en
francés/italiano** (hoja "TRADUC…") y **Compras** ("COMPRAS") — misma
detección tolerante de la fila de cabecera y las mismas reglas de
validación que el HTML actual. Dos adaptaciones deliberadas, señaladas en
el propio documento de fase, porque el HTML actual hace algo que
rompería garantías ya construidas y probadas en fases anteriores:

- **Artículos**: el HTML actual sustituye el catálogo entero por lo que
  trae el Excel (borra lo que no aparece). Aquí eso rompería el histórico
  real de compras/pedidos (clave foránea real hacia `articulos`) — se
  añadió una columna `articulos.activo`: un artículo que no viene en el
  Excel se **desactiva**, no se borra, y deja de ofrecerse al elegir
  artículo en compras/pedidos/repartos/traspasos/listas de
  precio/etiquetas sueltas nuevas (se sigue viendo, y se puede reactivar a
  mano, en la propia pantalla de Artículos).
- **Compras**: el HTML actual sobrescribe en silencio una compra ya
  grabada si el Excel trae datos distintos para la misma
  partida+albarán+proveedor. Las compras son un dato sagrado (FASE_0) —
  aquí, si ya existe con el mismo contenido no se toca (se puede
  reimportar el mismo Excel sin duplicar), y si existe con contenido
  **distinto** tampoco se toca: se avisa en "conflictos" para que Víctor lo
  revise a mano.

Se deja fuera, señalado honestamente: el "deshacer última importación" del
HTML actual (aquí se recomienda usar el mecanismo real de copia de
seguridad, `backend/scripts/backup.js`, antes de una importación grande) y
la sincronización con la carpeta compartida (ya no aplica, Fase 3 usa base
de datos compartida real).

## 13. Fase 5: Documentos de transporte del reparto (20/09/2026)

Uno de los tres puntos que `FASE_5_etiquetas_MARINAFISK.md` había dejado
señalado como diferido. Réplica fiel de `generarPdfFichaEnvio`,
`generarPdfHojaDeRutaReparto` y `generarPdfCompletoReparto` del HTML
actual, misma librería jsPDF (extraída verbatim en
`backend/public/js/vendor/jspdf.js`) y mismo dibujo vectorial de la
etiqueta Scanfisk. Nuevo módulo `backend/public/js/impresion/documentosReparto.js`,
con botones en la pantalla de Repartos: sobre el formulario sin grabar
("📄 Ver ficha de envío", "🚚 Ver hoja de ruta") y sobre cada reparto ya
grabado en "Repartos recientes" (los mismos dos, más "📦 Completo" y
"⬇️ Descargar"). Ver `VERIFICACION_DOCUMENTOS_REPARTO_2026-09-20.md`.

Un hallazgo real de plataforma durante la prueba con Playwright: el patrón
de dos pasos de `impresion/motor.js` (abrir la ventana en blanco antes del
`await`, rellenarla después) sirve para HTML pero NO para un PDF — Chrome
bloquea en silencio la navegación de una ventana ya abierta hacia una URL
`blob:`/`data:` si la ordena un documento distinto del que la creó. La
solución, comprobada con Playwright, es la contraria para este caso: pedir
los datos primero y abrir la ventana después, ya con el PDF listo
(`window.open(doc.output('bloburl'), '_blank')`) — eso no se bloquea ni
con una petición real al servidor de por medio. Queda documentado en el
propio código (`documentosReparto.js`, función `abrirDocumentoPdf`).

## 14. Fase 5: Envío del PDF completo del reparto por WhatsApp/Email (20/09/2026)

Último punto que quedaba diferido en FASE_5. Al construirlo se encontró que
la función pedida literalmente (`enviarMuestraScanfiskPorWhatsapp/Email`
del HTML actual) depende de la importación de Excel "CARGA [super]", ya
señalada como código muerto — es decir, tampoco es alcanzable de verdad en
el HTML actual. Se construyó en su lugar su función hermana, esa sí con
botón real: `enviarPdfCompletoDeReparto(uid, canal)`, que envía el PDF
completo (ficha + etiquetas de muestra) de un reparto real ya grabado. Ver
`VERIFICACION_ENVIO_SCANFISK_2026-09-20.md`.

Nuevo `backend/public/js/envioScanfisk.js` y `GET`/`PUT
/api/configuracion/contacto-scanfisk-celeiro` (el contacto de
administración de Scanfisk Celeiro pasa de `localStorage` por ordenador a
la tabla `configuracion` compartida, igual que ya se hizo con los días de
caducidad de las etiquetas). Botones nuevos en Repartos: "📞 Contacto
Scanfisk Celeiro" y, por cada reparto grabado, "📲 WhatsApp"/"✉️ Email".

Con esto se cierran los tres puntos diferidos de FASE_5, salvo la
importación de hojas Excel "CARGA [super]" de Scanfisk, que sigue
pendiente si Víctor la sigue necesitando de verdad.
