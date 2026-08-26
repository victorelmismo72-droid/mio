# MARINAFISK — Backend (Fase 1)

Explicación en términos sencillos de qué es esto, para Víctor.

## ¿Qué se ha construido?

Una base de datos real (PostgreSQL) que sustituye al `localStorage` del programa HTML actual, más un pequeño servidor (backend) que sabe leer y escribir en ella. El HTML actual **sigue funcionando exactamente igual, sin tocar** — esto es un sistema nuevo que se está construyendo en paralelo, todavía sin conectar al día a día real.

Esta fase **no cambia ningún cálculo** (2% de OP, IVA, márgenes, partidas...) — solo mueve los datos a un sitio más sólido y seguro. Los cálculos de negocio son la Fase 2, que viene después.

## ¿Qué tablas hay?

Una tabla por cada tipo de dato que el programa actual guarda hoy: clientes, artículos, proveedores, compras, pedidos (albaranes), traspasos, repartos y listas de precio. Los nombres de campo se han sacado directamente del backup real y del código del HTML — no se ha inventado nada.

Dos añadidos nuevos, ya preparados para cuando se necesiten (Fase 2 y el futuro módulo de facturación):
- **Clasificación fiscal** de clientes y proveedores (Nacional / Intracomunitario, y Recargo de Equivalencia en clientes).
- **Contadores sin colisión**: los números de pedido, partida, traspaso y reparto ahora los genera la propia base de datos (nunca se pueden repetir por accidente, ni con dos personas trabajando a la vez).

## La garantía más importante: las compras no se pueden tocar

Las compras son "dato sagrado" — una vez metidas, no se pueden modificar ni borrar, ni por accidente ni a propósito. Esto no es solo una norma escrita: la propia base de datos lo impide técnicamente (si alguien lo intenta, sea desde donde sea, recibe un error). Está comprobado y documentado en `VERIFICACION_FASE_1.md`.

## Migración del backup real

Se ha cogido el backup real que aportaste (`BACKUP_MARINAFISK_20260826_2.json`, del 26/08/2026) y se ha volcado entero en la base de datos nueva. Se ha comprobado, registro por registro y campo por campo, que no falta ni sobra nada. El resultado completo de esa comprobación está en `VERIFICACION_FASE_1.md`.

Hay dos cosas que el backup antiguo no distinguía y que necesitan que las revises tú (no son errores, es que el programa actual nunca guardó ese dato):
1. **Qué proveedores son intracomunitarios** (de otro país de la UE) — de momento se han marcado todos como "Nacional" por defecto.
2. **Los 4 clientes con Recargo de Equivalencia** — se han migrado como Nacionales (parecía lo más razonable porque el recargo de equivalencia es un mecanismo español), pero conviene que lo confirmes.

Para ver la lista exacta de qué revisar (con nombres y códigos reales), ejecuta:
```
npm run pendientes-fiscales
```
Esto se imprime en tu pantalla, no se guarda en ningún documento — son datos reales de tu negocio.

## Cómo se usa (para revisarlo tú mismo o para que un programador continúe)

Requiere tener PostgreSQL y Node.js instalados.

```bash
cd MARINAFISK-nuevo/backend
cp .env.example .env        # revisa que los datos de conexión sean correctos
npm install

# Solo la primera vez, con la base de datos vacía:
createdb marinafisk         # o el nombre que hayas puesto en .env
npm run migrate:schema      # crea todas las tablas
npm run migrate:data /ruta/al/backup.json   # vuelca tu backup real

# Para comprobar que todo ha migrado bien:
npm run verify /ruta/al/backup.json

# Para arrancar el servidor:
npm start
```

El servidor queda escuchando en `http://localhost:3001`. Cada tabla tiene su propia dirección, por ejemplo `http://localhost:3001/api/clientes`. Hay una dirección especial, `http://localhost:3001/api/export`, que saca todos los datos en un JSON con la misma forma que el backup de siempre — útil para comparar en cualquier momento.

## Qué falta todavía (fases siguientes)

- **Fase 2**: que el sistema calcule solo el 2% de OP, el IVA correcto, el margen y la asignación de partidas — hoy la base de datos solo guarda los datos, no calcula nada.
- **Fase 3**: usuarios reales con contraseña, para que varias personas trabajen a la vez sin la carpeta compartida de hoy.
- Conectar una pantalla/interfaz nueva a este backend (hoy solo existe la API; el HTML actual sigue siendo la pantalla que usas en el día a día).
