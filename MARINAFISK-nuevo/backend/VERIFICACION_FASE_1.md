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
