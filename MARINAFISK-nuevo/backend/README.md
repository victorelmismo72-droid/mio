# MARINAFISK — backend Fase 1

Backend mínimo (Node.js + Express + PostgreSQL) que sustituye `localStorage`
por una base de datos real, sin cambiar todavía ninguna lógica de negocio.
Ver `../FASE_1_base_de_datos_backend_MARINAFISK.md` para el encargo completo.

El HTML actual (`CARGA_DE_ALBARANES_MARINAFISK_20260821I.html`) sigue
funcionando exactamente igual, en paralelo — este backend no lo sustituye
todavía.

## 1. Instalación de PostgreSQL (local, en el ordenador de Víctor)

En Windows: instalar PostgreSQL desde https://www.postgresql.org/download/windows/
(instalador oficial, versión 16). Anotar la contraseña que se ponga al
usuario `postgres` durante la instalación.

## 2. Crear la base de datos y el usuario de la aplicación

Abrir una terminal con acceso a `psql` (o "SQL Shell" que instala el propio
instalador de Postgres) y ejecutar, conectado como `postgres`:

```sql
CREATE ROLE marinafisk_app WITH LOGIN PASSWORD 'elige-una-contraseña';
CREATE DATABASE marinafisk OWNER postgres;
GRANT USAGE ON SCHEMA public TO marinafisk_app;
```

**Importante:** la base de datos y las tablas las crea y es dueño de ellas
el usuario `postgres`, NO `marinafisk_app`. Esto es intencional: en
PostgreSQL, el dueño de una tabla puede saltarse los permisos, así que si
`marinafisk_app` fuera el dueño, la protección de `compras` (ver más abajo)
no serviría de nada.

## 3. Aplicar el esquema (crear las tablas)

```bash
psql -U postgres -d marinafisk -f src/schema.sql
psql -U postgres -d marinafisk -f src/grants.sql
```

`grants.sql` es el paso que de verdad protege `compras`: le quita a
`marinafisk_app` el permiso de `UPDATE`/`DELETE` sobre `compras` y
`compra_lineas`. Así, aunque hubiera un fallo en el código del backend,
la propia base de datos rechazaría cualquier intento de modificar o borrar
una compra ya guardada.

## 4. Configurar y arrancar el backend

```bash
cp .env.example .env
# editar .env con el usuario/contraseña creados en el paso 2
npm install
npm start
```

Comprobar que funciona: abrir `http://localhost:3000/health` — debe
responder `{"ok":true,"db":"conectada"}`.

## 5. Migrar el backup JSON de prueba

```bash
node src/migrate/migrarBackup.js /ruta/al/Backup_XXXX.json
```

El script:
- Es re-ejecutable sin duplicar datos (usa el `_uid` de cada registro para
  no insertar dos veces lo mismo).
- Al terminar, imprime una comparación de conteos (JSON vs. base de datos)
  por cada tabla — debe decir "OK" en todas antes de continuar.
- Después de los conteos, sigue pendiente (manual, ver Fase 1 punto 4) la
  comprobación campo a campo de una muestra representativa de registros,
  y comprobar específicamente que ningún registro de `compras` se alteró.

## Qué se ha construido (resumen técnico)

- **Esquema** (`src/schema.sql`): una tabla por cada tipo de dato real que
  hoy vive en `localStorage`, con los mismos nombres de campo que usa el
  HTML (traducidos a snake_case), extraídos leyendo el código del programa
  actual — no se ha inventado ningún campo.
- **Backend** (`src/routes/`): crear/leer/actualizar/borrar para cada tabla,
  excepto `compras`, que solo permite crear y leer (dato sagrado).
- **Exportación** (`GET /export`): reconstruye un JSON con la misma forma
  que el backup actual del programa, para poder compararlo campo a campo.
- **Log de escrituras** (tabla `log_escrituras`): cada creación/edición/
  borrado queda registrada con tabla, operación, referencia y fecha.
- **Migración** (`src/migrate/migrarBackup.js`): importa un backup JSON real
  a las tablas nuevas y verifica los conteos automáticamente.

## Diferencias importantes frente al programa actual (para que no sorprendan)

1. **`proveedores.tipo_iva` es un campo nuevo.** El programa actual no
   distingue proveedores nacionales de intracomunitarios en ningún campo
   — esa distinción solo existía "por fuera" del programa. Después de
   migrar el backup, esta columna estará vacía para todos los proveedores
   y hay que rellenarla antes de activar el cálculo de IVA de compras en
   la Fase 2 (ver `FASE_0_reglas_de_negocio_MARINAFISK.md`, punto 4).
2. **`partidas` no era una tabla propia en el programa actual** — era solo
   un número compartido entre varias compras del mismo proveedor/día. Aquí
   se ha creado como tabla porque la Fase 1 la pide y porque ya existe un
   dato real que necesitaba un sitio (las partidas cerradas manualmente).
   Se rellena automáticamente al migrar compras y pedidos.
3. **No existen listas de precios permanentes en el programa actual**
   (el modo automático se calcula al vuelo desde las compras del día, y el
   modo manual es un borrador de un solo día que se descarta al día
   siguiente). La tabla `listas_precios` se ha creado porque la Fase 1 la
   pide, pero no hay historial que migrar — empezará vacía.
4. **Los orígenes `CORU`/`PANC` no son constantes fijas** en el programa
   actual — son texto libre que cada puesto configura. No se ha creado
   ninguna columna `origen` porque no hay un campo real de donde extraerlo;
   si hace falta modelarlo, es una decisión de la Fase 3 (sincronización).
