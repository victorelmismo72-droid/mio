# MARINAFISK — Estado de la Fase 1 (para Víctor, sin tecnicismos)

Este documento explica en lenguaje sencillo qué se ha hecho de la Fase 1 y
qué falta antes de pasar a la Fase 2. Va contra la lista de comprobación del
final de `FASE_1_base_de_datos_backend_MARINAFISK.md`.

## Qué se ha construido

- Una base de datos real (PostgreSQL) con una tabla para cada cosa que hoy
  se guarda en el programa: clientes, artículos, proveedores, compras,
  partidas, pedidos (albaranes de venta), traspasos, repartos y listas de
  precios. Los nombres de los datos se han sacado leyendo el código del
  programa actual, no inventados.
- Un programa pequeño (backend) que sabe guardar y leer cada una de esas
  tablas.
- Las compras están protegidas de dos formas distintas para que nadie
  pueda modificarlas ni borrarlas por error una vez guardadas — ni desde el
  programa, ni directamente en la base de datos. Esto se ha probado a
  propósito intentando modificarlas de las dos formas, y las dos veces se
  ha rechazado correctamente.
- Un botón/comando de "exportar" que saca de la base de datos un archivo
  con la misma forma que los backups que ya conoces, para poder comparar
  fácilmente que no se ha perdido ni cambiado nada.
- Un script que coge un backup tuyo y lo mete en la base de datos nueva,
  y al final te dice si el número de clientes, artículos, compras, etc.
  coincide exactamente con el del backup original.
- Se ha probado todo con datos de prueba inventados (no tuyos) y ha
  funcionado correctamente: crear, leer, y en el caso de las compras,
  confirmar que no se pueden tocar después de guardadas.

## El programa actual (HTML) no se ha tocado

Sigue funcionando exactamente igual que siempre, en paralelo. Esto es solo
la base para el sistema nuevo — todavía no lo sustituye.

## Qué falta para cerrar la Fase 1

- [ ] **Aportar tu backup JSON más reciente real** para migrarlo de verdad
  (hasta ahora solo se ha probado con datos inventados, porque el backup
  real no está en este proyecto — con razón, son datos de clientes y
  compras reales).
- [ ] Una vez migrado el backup real, revisar a mano una muestra de
  registros (no solo los primeros) y confirmar que coinciden con el
  original, sobre todo las compras.
- [ ] **Decisión pendiente que no existía en el programa actual:** hay que
  marcar cada proveedor como "Nacional" o "Intracomunitario" (para el IVA
  de las compras en la Fase 2). Hoy esa información no está guardada en
  ningún sitio del programa — hay que rellenarla desde cero.
- [ ] Que confirmes, con este documento, que entiendes lo que se ha
  construido y estás de acuerdo en seguir a la Fase 2.

## Algo a tener en cuenta, no es un error

En el programa actual, "partida" no es realmente una tabla propia — es solo
un número que comparten varias compras del mismo proveedor y día. Y las
listas de precios no se guardan de forma permanente hoy (la automática se
calcula al momento, la manual es un borrador de un solo día). El sistema
nuevo ya tiene sitio preparado para ambas cosas, pero no había historial
real que migrar para ninguna de las dos — no es una pérdida de datos.
