# Verificación: Excepciones y Catálogo — ¿el mismo tipo de fallo? — 20/09/2026

Fecha: 2026-09-20

Última tanda de la ronda pedida por Víctor. Ninguna de las dos tiene nada que corregir, por motivos distintos entre sí.

## Excepciones: no aplica — "asignar a mano" es una decisión humana, no un cálculo

`POST /api/pedidos/excepciones/:lineaId/asignar` (`backend/src/routes/pedidos.js`) guarda directamente el `numero_partida` que manda la pantalla, sin recalcularlo — a primera vista parece el mismo patrón que el fallo de Pedidos, pero no lo es: aquí no hay ningún "valor correcto" que el servidor pudiera calcular en su lugar. Esta acción existe precisamente para que Víctor **elija a mano** una partida que el sistema, por sí solo, no habría asignado (típicamente porque ninguna llega al margen mínimo) — es una decisión humana deliberada, no un total derivado de otros campos.

Las partidas candidatas que ve en el desplegable (`candidatas`, con su coste medio y margen) sí se calculan en el servidor, en `GET /excepciones/lista`, en el momento de cargar la pantalla — no hay ningún cálculo hecho en el navegador que se pueda quedar a medias. El "Reasignar pendientes" en bloque (`POST /excepciones/reasignar`) tampoco acepta nada calculado por la pantalla: recalcula las candidatas de cada línea él mismo, de cero, en el servidor.

Revisado también el frontend (`backend/public/js/pantallas/excepciones.js`): el botón "Asignar" manda directamente el valor ya elegido en el `<select>`, sin ningún `debounce` ni cálculo asíncrono de por medio — no hay ninguna carrera de tiempos posible entre teclear y pulsar el botón, porque no hay nada que teclear.

## Catálogo (Clientes, Artículos, Proveedores): no aplica — son formularios de datos, no calculadoras

Las tres pantallas usan la misma fábrica genérica (`crudGenerico.js`). Revisado su `guardar()`: construye el cuerpo de la petición leyendo **directamente** `input.value` de cada campo del formulario, en el mismo instante del clic — no existe, en ninguna de las tres pantallas ni en la fábrica que comparten, ningún campo cuyo valor se calcule en el navegador (ni con `debounce` ni de ninguna otra forma) antes de guardarse. Cada campo es exactamente lo que el usuario ha escrito o elegido, sin ningún paso intermedio que pudiera quedarse desactualizado.

## Con esto queda cerrada la revisión completa

Todas las pantallas de la aplicación han sido revisadas. Resumen final:

| Pantalla | Resultado |
|---|---|
| Pedidos | **Tenía el fallo real (importe 0€) — corregido** |
| Listas de precio (MANUAL) | **Tenía el fallo real (aviso de pérdida silenciado) — corregido** |
| Traspasos, Repartos | Mismo defecto de fondo sin ser explotable — corregidos por coherencia |
| Compras, Partidas, Listados de gestión, Excepciones, Clientes, Artículos, Proveedores | No aplica — sin cambios, confirmado con código y, donde tenía sentido, con datos reales |

Principio ya consistente en toda la aplicación: el servidor calcula siempre lo que él mismo puede calcular con datos ya validados, nunca acepta un total, base o coste ya calculado por la pantalla — salvo, por diseño y a propósito, las decisiones que son explícitamente una elección manual de Víctor (como elegir una partida a mano en Excepciones), donde no hay ningún "valor correcto" que recalcular.
