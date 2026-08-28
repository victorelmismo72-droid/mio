# MARINAFISK — Backend (Fases 1, 2 y 3)

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

### Pantalla para marcarlo tú mismo

Con el servidor arrancado (`npm start`), abre en el navegador:

```
http://localhost:3001/fiscal.html
```

Verás dos listas (Proveedores y Clientes) con un buscador arriba de cada una. Cada fila tiene su desplegable Nacional/Intracomunitario (y, en clientes, la casilla de Recargo de Equivalencia). En cuanto tocas algo se guarda solo — no hace falta ningún botón "Guardar" ni tocar código. Un fondo verde momentáneo confirma que se guardó bien.

Si prefieres solo consultar la lista sin pantalla (por ejemplo, para copiarla a otro sitio), sigue disponible:
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

# Solo la primera vez: crea el primer usuario Administrador (hace falta uno
# ya existente para poder dar de alta a los demás desde la pantalla):
npm run crear-admin -- tu_usuario "Tu Nombre" tuContraseñaReal

# Para arrancar el servidor:
npm start
```

El servidor queda escuchando en `http://localhost:3001`. Cada tabla tiene su propia dirección, por ejemplo `http://localhost:3001/api/clientes`. Hay una dirección especial, `http://localhost:3001/api/export`, que saca todos los datos en un JSON con la misma forma que el backup de siempre — útil para comparar en cualquier momento.

**Desde la Fase 3, toda la API exige haber iniciado sesión** (`POST /api/auth/login` con tu usuario y contraseña, y usar el token que devuelve en cada petición). Es decir: `npm run crear-admin` es un paso obligatorio antes de poder usar nada más, incluida la pantalla `fiscal.html`.

## Fase 2 (ya construida): cálculos de negocio

Al crear una compra (`POST /api/compras`), el servidor calcula solo el 2% de OP y el IVA correcto, leyendo el proveedor en ese mismo instante (nunca un valor congelado) — corrige el fallo histórico del IVA que el HTML actual sigue teniendo. También hay endpoints para asignar partidas automáticamente (con el mismo margen mínimo de 1,30 €/kg y el mismo emparejamiento de producto que el HTML actual), cerrar/reabrir partidas, ver la rentabilidad de una partida, y varios listados de gestión (ventas por cliente, compras por proveedor, márgenes, stock actual, etc.) exportables a CSV. Detalle completo de lo probado en `VERIFICACION_FASE_2.md`.

## Fase 3 (ya construida): usuarios, roles y cierre de año

- **Login real** (`POST /api/auth/login`) con usuario y contraseña — toda la API exige sesión iniciada. La sesión dura 30 días, para no tener que volver a entrar cada día.
- **Dos roles**: Usuario estándar (todos, día a día — compras, pedidos, partidas...) y Administrador (dos cosas exclusivas: gestionar usuarios y ejecutar el cierre de año). `npm run crear-admin` crea el primero; a partir de ahí, un Administrador da de alta a los demás desde `POST /api/usuarios`.
- **Cada registro guarda de forma fiable qué usuario lo creó** — sustituye al antiguo CORU/PANC.
- **Contadores sin colisión de verdad**: se ha corregido un hueco real (los números de pedido/traspaso/reparto los generaba antes quien llamara a la API) — ahora los genera siempre la base de datos, probado con peticiones simultáneas.
- **Cierre de año** (`GET /api/cierre-anual/vista-previa` y `POST /api/cierre-anual` con `confirmacion: true`, solo Administrador): reinicia la numeración hacia adelante sin tocar ni un dato de años anteriores, y queda registrado quién y cuándo.

Detalle completo de lo probado en `VERIFICACION_FASE_3.md`.

## Qué falta todavía

- Confirmar con Víctor un par de detalles de la Fase 2 marcados explícitamente como "pendiente de confirmar" (ver `VERIFICACION_FASE_2.md`, punto 5) — no bloquean nada, pero conviene cerrarlos.
- Exportar los listados también a PDF (hoy solo CSV/JSON) y los modelos de impresión (fichas de envío, etiquetas, Transfrío).
- Desplegar esta base de datos en la VPN de la empresa (decidido, pero no hecho todavía — esta sesión de pruebas vive en un contenedor temporal) para que tú y Pancho lleguéis a ella desde vuestros propios equipos.
- **Fase 4**: pantallas propias para el trabajo diario (hoy solo existen la API y la pantalla de clasificación fiscal `fiscal.html`; el HTML actual sigue siendo la pantalla que usas en el día a día).
