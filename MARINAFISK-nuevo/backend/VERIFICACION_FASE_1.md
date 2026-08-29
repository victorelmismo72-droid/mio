# MARINAFISK — Verificación de la migración (Fase 1, punto 4)

Backup verificado: `BACKUP_MARINAFISK_20260826_2.json` (versión `MARINAFISK_BACKUP_V2`, fecha `2026-08-26T06:52:42.077Z`), aportado por Víctor.

Este documento no contiene datos reales de clientes/proveedores (nombres, direcciones, importes) — solo resultados agregados. Para ver el detalle de qué registros concretos necesitan revisión, ejecutar `npm run pendientes-fiscales` (ver más abajo), que imprime esa información localmente sin guardarla en ningún archivo versionado.

## 1. Conteo de registros (backup vs. base de datos)

| Tabla | En el backup | En PostgreSQL | ¿Coincide? |
|---|---|---|---|
| clientes | 162 | 162 | ✅ |
| articulos | 154 | 154 | ✅ |
| proveedores | 51 | 51 | ✅ |
| compras (cabeceras) | 551 | 551 | ✅ |
| compra_lineas | 1498 | 1498 | ✅ |
| pedidos / historial (cabeceras) | 1057 | 1057 | ✅ |
| pedido_lineas | 2195 | 2195 | ✅ |
| traspasos / historialTrp | 24 | 24 | ✅ |
| repartos | 78 | 78 | ✅ |

## 2. Muestra representativa campo a campo

Se comparó una muestra repartida a lo largo de toda la lista (no solo los primeros registros) de `clientes` y de `compras` con sus líneas, campo a campo, contra el JSON original. Resultado: **0 discrepancias**.

Script: `node scripts/verificar_migracion.js /ruta/al/backup.json` (se puede volver a ejecutar en cualquier momento contra el mismo backup u otro nuevo).

## 3. Compras — dato sagrado

- Todas las compras y líneas de compra migradas coinciden exactamente con el backup (ver punto 2).
- Se intentó explícitamente hacer un `UPDATE` sobre un registro de `compras` ya migrado: la base de datos lo **rechazó** con el mensaje `"Las compras son inmutables"` (trigger `trg_compras_inmutable`, ver `src/schema.sql`). Confirmado también que no existe ningún endpoint `PUT`/`DELETE` para `compras` en la API (`/api/compras` solo permite `GET` y `POST`).

## 4. Contadores correlativos

Los contadores del programa actual se han trasladado a secuencias reales de PostgreSQL, ajustadas al valor siguiente correcto (el mayor entre el contador del backup y el máximo número real encontrado en los datos):

| Contador | Valor tras la migración |
|---|---|
| `nextPedido` → `seq_pedido_numero` | 13693 |
| `nextPartida` → `seq_partida_numero` | 56275 |
| `nextTrp` → `seq_traspaso_numero` | 29 |
| `nextReparto` → `seq_reparto_numero` | 81 |

No se encontraron números de albarán/traspaso/reparto duplicados en los datos migrados.

## 5. Puntos que necesitan revisión de Víctor (no son errores, son datos que el programa antiguo no distinguía)

1. **Proveedores — clasificación fiscal.** El backup no tenía forma de indicar si un proveedor es Nacional o Intracomunitario, así que los 51 proveedores se han migrado como `NACIONAL` por defecto (campo nuevo `tipo_iva`, ver Fase 1 punto 2.1). Hace falta que Víctor marque cuáles son en realidad intracomunitarios — ejecutar `npm run pendientes-fiscales` para ver la lista completa con nombre y código.
2. **Clientes con Recargo de Equivalencia.** El campo antiguo `tipoIva` de clientes mezclaba en un único valor cosas que ahora son dos campos independientes (`tipo_iva` + `recargo_equivalencia`, ver Fase 1 punto 2.1). Había 4 clientes marcados como `RECARGO_EQUIVALENCIA`; se han migrado como Nacional + Recargo = Sí (el recargo de equivalencia es un mecanismo español, y los 4 tienen población/provincia españolas), pero conviene que Víctor lo confirme. Los 2 clientes que ya estaban marcados `INTRACOMUNITARIO` se han migrado tal cual, sin recargo.
3. **`numero_partida` no es único en el histórico.** En los datos reales, varias compras antiguas comparten el mismo número de partida (69 casos). No bloquea nada de esta fase, pero es relevante para el diseño de "rentabilidad por partida" de la Fase 2 — probablemente convenga tratar `numero_partida` como el identificador de negocio del lote y agrupar por él, en vez de asumir 1 compra = 1 partida.

## 6. Qué NO se ha migrado (a propósito)

- **Listas de precio** (Pescaderías/Mayoristas): las tablas existen (`listas_precio`, `lista_precio_lineas`) pero el backup no contiene datos históricos de ellas — en el programa actual son borradores diarios que no se guardaban en el backup. Se rellenarán con datos nuevos según se vaya usando el sistema.
- El HTML/programa actual **no se ha tocado** — sigue funcionando exactamente igual, en paralelo, mientras se construye este sistema nuevo.

## 7. Fallo crítico de zona horaria en fechas, encontrado y corregido (29/08/2026)

Víctor envió un informe de bugs confirmados en el HTML actual, para asegurar que el programa nuevo no los repitiera. Uno de ellos (fechas desplazadas un día en listados exportados, causado por dejar que una librería externa —SheetJS— convirtiera la fecha "a su manera") llevó a revisar cómo trata las fechas este backend, y se encontró un fallo real y grave, **latente en este contenedor de pruebas** (donde la zona horaria es UTC, así que aquí no se notaba) pero que habría reventado en cuanto el programa se instalara en la VPN de la empresa (zona horaria España, UTC+1/+2):

**Causa:** el driver de PostgreSQL para Node (`pg`) convierte por defecto una columna `DATE` en un objeto `Date` de JavaScript a medianoche *local*. Al pasar esa fecha por `JSON.stringify` (lo que hace `res.json()` en cada respuesta de la API), JavaScript la reinterpreta con `toISOString()`, que la pasa a UTC — y en cualquier zona horaria con desfase positivo respecto a UTC (como España), la fecha sale desplazada **un día hacia atrás**. Comprobado explícitamente forzando la zona horaria del proceso a `Europe/Madrid`: un pedido con `fecha = 2026-08-25` llegaba a la API como `"2026-08-24T22:00:00.000Z"` — exactamente el mismo síntoma que describía Víctor del HTML actual.

**Corrección:** se desactiva esa conversión a nivel del driver, una sola vez, en `src/db.js` (`types.setTypeParser(types.builtins.DATE, valor => valor)`), para que una columna `DATE` llegue siempre como texto `'AAAA-MM-DD'` tal cual, sin pasar nunca por un objeto `Date` con zona horaria de por medio. Esto aplica a **toda** la aplicación (compras, pedidos, traspasos, repartos, listados) de una sola vez, en vez de tener que acordarse pantalla por pantalla — así ninguna pantalla nueva puede reintroducir el mismo fallo sin darse cuenta. Vuelto a comprobar con `TZ=Europe/Madrid` tras el cambio: la misma fecha llega correctamente como `"2026-08-25"`.

## Cómo reproducir esta verificación

```bash
cd MARINAFISK-nuevo/backend
cp .env.example .env      # ajustar si hace falta
npm install
npm run migrate:schema    # crea las tablas (una sola vez, en una BD vacía)
npm run migrate:data /ruta/al/backup.json
npm run verify /ruta/al/backup.json
npm run pendientes-fiscales
```
