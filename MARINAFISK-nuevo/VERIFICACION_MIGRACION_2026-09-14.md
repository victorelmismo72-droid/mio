# Verificación de la migración del backup a PostgreSQL (Fase 1)

Backup verificado: `Backup_2026-09-14_0600.json` (generado 2026-09-14T04:02:22.763Z)
Fecha de esta verificación: 2026-09-14T05:22:35.214Z

## Recuento de registros

| Tabla | Original | Base de datos | ¿Coincide? |
|---|---|---|---|
| clientes | 163 | 163 | Sí |
| articulos | 154 | 154 | Sí |
| proveedores | 51 | 51 | Sí |
| pedidos | 1970 | 1970 | Sí |
| pedido_lineas | 4144 | 4144 | Sí |
| traspasos | 43 | 43 | Sí |
| traspaso_lineas | 246 | 246 | Sí |
| compras | 1108 | 1108 | Sí |
| compra_lineas | 2990 | 2990 | Sí |
| repartos | 135 | 135 | Sí |
| reparto_lineas | 213 | 213 | Sí |

## Comparación campo a campo

Se comprobaron 71018 valores individuales (campos de cabecera y de líneas) contra el backup original, incluyendo el 100% de las 1108 compras (dato sagrado) y sus 2990 líneas — no solo una muestra.

**Diferencias encontradas: 0**

## Compras: inmutabilidad

1108/1108 compras migradas sin ninguna diferencia respecto al backup. Además, la base de datos bloquea estructuralmente cualquier UPDATE/DELETE sobre `compras`/`compra_lineas` (trigger `bloquear_modificacion_compra`), probado explícitamente: un intento manual de UPDATE y de DELETE sobre una compra recién creada fue rechazado por la base de datos.

## Contadores de numeración

nextPedido/nextTrp/nextReparto/nextPartida reiniciados a los mismos valores que traía el backup: coinciden.

## Avisos ya señalados por el script de migración (no son errores de migración, son datos del propio backup)

- 76 números de partida citados en pedido_lineas/traspaso_lineas no tienen compra correspondiente en este backup (probablemente de algún reinicio manual pasado del contador `nextPartida` — ver FASE_0 punto 6). Se han registrado igualmente como partidas "huérfanas" (0 kg comprados), sin inventar una compra falsa para taparlo.
- Todos los proveedores se migraron con `tipo_iva = NACIONAL` por defecto, porque ese campo no existe en el origen (es nuevo, ver FASE_0 punto 4). Víctor debe revisar y marcar manualmente los proveedores intracomunitarios.

## Conclusión

**La migración se considera verificada: coinciden los recuentos y no se encontró ninguna diferencia de datos.**
