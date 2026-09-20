# Verificación: Listados de gestión y Partidas — ¿el mismo tipo de fallo? — 20/09/2026

Fecha: 2026-09-20

Última comprobación de la ronda pedida por Víctor tras el fallo real de Pedidos. Ninguna de las dos pantallas tiene nada que corregir — están estructuralmente a salvo de esta familia de fallo, por motivos distintos.

## Listados de gestión: no aplica — es de solo lectura

`backend/src/routes/listados.js` es una única ruta `GET /ventas-articulo`, sin ningún `POST`/`PUT`/`DELETE`. No graba nada: filtra y suma en la propia consulta SQL, en el momento de pedirlo, con los datos reales de pedidos/traspasos ya guardados. No hay ningún total calculado en la pantalla que luego se mande a guardar — el problema de fondo (el servidor aceptando un cálculo hecho por el navegador) no tiene dónde ocurrir aquí, porque el navegador no calcula nada que se vaya a persistir.

## Partidas: no aplica — los kilos disponibles son una vista SQL, nunca un número guardado

`backend/src/routes/partidas.js` solo tiene tres acciones de escritura: cerrar una partida a mano, reabrirla, y el cierre masivo por fecha — las tres son un simple `UPDATE` de un booleano (`cerrada_manual`) y quién/cuándo lo cerró, sin ningún número de por medio. Los "kilos disponibles" y el "coste medio" que se ven en la pantalla vienen de la vista `partidas_disponibles` (`db/schema.sql`), calculada en directo por PostgreSQL en cada consulta — nunca se guardan como una cifra fija en ninguna tabla, así que no existe ningún "total" que pudiera quedarse desactualizado o llegar en blanco al guardar.

El frontend (`backend/public/js/pantallas/partidas.js`) confirma lo mismo: los botones "Cerrar"/"Reabrir" llaman directamente a la ruta correspondiente sin mandar ningún dato calculado, sin debounce, sin nada que pueda ir por delante o por detrás de un clic.

## Con esto se cierra la ronda completa

Todas las pantallas que escriben algo en la base de datos han quedado revisadas:

| Pantalla | ¿Tenía el fallo? | Estado |
|---|---|---|
| Compras | No — ya calculaba todo en el servidor desde siempre | Sin cambios, confirmado |
| Pedidos | **Sí** — importe 0€ si se grababa justo tras teclear | **Corregido** |
| Traspasos | No exactamente (sin carrera posible), pero sí el mismo defecto de fondo | **Corregido por coherencia** |
| Repartos | Igual que Traspasos, sin dinero de por medio | **Corregido por coherencia** |
| Listas de precio (MANUAL) | **Sí** — el aviso de venta con pérdidas podía saltarse en silencio | **Corregido** |
| Partidas | No aplica — no hay ningún total, todo es una vista SQL en vivo | Sin cambios, confirmado |
| Listados de gestión | No aplica — pantalla de solo lectura | Sin cambios, confirmado |
| Excepciones, Clientes, Artículos, Proveedores | No aplica — sin ningún total/coste calculado que guardar | Sin cambios |

El principio que queda consistente en todas las pantallas que sí mueven dinero o cantidades agregadas: **el servidor calcula siempre lo que él mismo puede calcular con datos ya validados, nunca acepta un total, base o coste ya calculado por la pantalla.**
