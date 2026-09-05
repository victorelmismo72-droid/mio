# MARINAFISK — Backend (Fase 1)

Esto es el backend mínimo de la Fase 1: solo guarda y lee datos (clientes,
proveedores, artículos, compras, partidas, pedidos, traspasos, repartos,
listas de precio). **No calcula nada todavía** — el 2% de OP, el margen, la
asignación de partidas y el IVA se añaden en la Fase 2. El HTML actual
(`CARGA_DE_ALBARANES_MARINAFISK_20260902CORREGIDO_4.html`) sigue funcionando
exactamente igual mientras tanto — esto se prueba aparte, en paralelo.

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

## 4. Qué endpoints existen ya

- `GET /health` — comprobar que el backend está vivo.
- `GET /export` — vuelca todas las tablas en un JSON, para comparar contra
  el backup del programa actual durante la migración.
- `/clientes`, `/proveedores`, `/articulos` — CRUD completo (crear, leer,
  editar, borrar).
- `/compras` — **solo crear y leer** (`GET`, `POST`). A propósito no existen
  rutas `PUT` ni `DELETE`: las compras son "dato sagrado" (ver Fase 0,
  punto 3) y no deben poder modificarse nunca desde la API.
- `/partidas` — crear y leer, más `POST /partidas/:id/cerrar` para el cierre
  manual. Todavía no calcula kilos disponibles ni margen (eso es Fase 2).
- `/pedidos`, `/traspasos`, `/repartos`, `/listas-precio` — CRUD completo.

## 5. Lo que falta para cerrar la Fase 1 (ver el documento de la fase)

- [ ] **Migrar el backup JSON real** del programa actual a estas tablas, y
      verificar registro a registro que coincide (pendiente de que aportes
      el backup JSON más reciente — el script de migración se escribirá en
      cuanto lo tengamos).
- [ ] Revisar y entender, en términos sencillos, qué se ha construido aquí.

No se ha tocado nada del HTML/programa actual — sigue funcionando igual,
en paralelo, mientras se prueba esto.
