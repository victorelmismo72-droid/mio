# MARINAFISK — Backend Fase 1 (base de datos + API mínima)

Esto es lo que pedía `FASE_1_base_de_datos_backend_MARINAFISK.md`: sustituir los
archivos JSON de la carpeta compartida por una base de datos real
(PostgreSQL) más un programa pequeño (este backend) que sabe leer y escribir
en ella. **No calcula nada de negocio todavía** (el 2% de OP, el IVA, el
margen de las partidas...) — eso es la Fase 2. Esta fase solo demuestra que
los datos de siempre caben en la base de datos nueva sin perder ni cambiar
nada, y que hay un programa capaz de leerlos y escribirlos.

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
| `GET /api/exportar` | Vuelca todo en un JSON con el mismo formato que el backup de siempre, para comparar fácilmente |

Toda creación de compra/pedido/reparto/traspaso necesita un campo `uid`
(una clave única que genera la propia pantalla) — si se manda dos veces la
misma petición con el mismo `uid` (por ejemplo, por un doble clic en
"grabar"), la segunda vez NO crea un duplicado: devuelve el mismo resultado
que la primera. Esto es la corrección del 01/09/2026 (ver
`CORRECCIONES_2026-09-02_HTML_actual_MARINAFISK.md`, punto 1), pero
implementada aquí a nivel de servidor, no solo bloqueando un botón en
pantalla.

---

## 7. Qué NO hace esta fase todavía

- No calcula el 2% de OP, el IVA, ni el margen de las partidas — guarda lo
  que le mandan, tal cual.
- No decide automáticamente a qué partida se asigna cada línea de un
  pedido — eso también es Fase 2.
- Las listas de precio (`/api/listas-precio`) son una funcionalidad **nueva**
  (guardar un histórico real por día), porque hoy el programa actual no
  guarda ningún histórico de listas — solo un borrador del día que se pierde
  al día siguiente. No sustituye nada existente, se añade.
- Todos los proveedores se migraron marcados como `NACIONAL` (el campo
  `tipo_iva` no existía antes) — hay que revisar a mano cuáles son
  intracomunitarios.

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
