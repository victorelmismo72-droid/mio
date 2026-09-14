# MARINAFISK — Fase 4: Interfaz

Igual que `FASE_3_sincronizacion_MARINAFISK.md`, este documento tampoco lo ha escrito Víctor de antemano — se redacta aquí reuniendo lo que Fase 0/1/2/3 ya habían dejado pendiente para esta fase, antes de construirla. Conviene que Víctor lo revise.

**Instrucción para Claude Code:** esta fase construye la pantalla sobre la API ya verificada de Fase 1/2/3 — no se toca el backend salvo que haga falta un endpoint nuevo muy concreto que la pantalla necesite y que hoy no exista.

---

## 0. Qué se sabe ya de lo que pide esta fase (recopilado de documentos anteriores)

- FASE_0/2: agilidad — cualquier flujo nuevo debe ser igual de rápido o más que el Excel/HTML actual, no más lento ni más tedioso.
- FASE_2 punto 4/5ter: aviso en vivo si un precio de venta queda por debajo del coste real de partida (ya hay endpoint: `GET /api/articulos/:id/coste-referencia`).
- FASE_2 punto 5quater / corrección 02/09/2026 punto 1: el botón de grabar debe desactivarse mientras se procesa, para que un doble clic no parezca crear nada raro (el servidor ya lo protege de verdad — esto es además, para que la pantalla no parezca "colgada" o permita clics repetidos sin sentido).
- Corrección 02/09/2026 punto 3: listados separando ventas reales de traspasos internos.
- Corrección 02/09/2026 punto 5: existencias en listas de precio admite texto libre, no solo números (ya soportado por el backend).
- Corrección 02/09/2026 punto 6: hoja Transfrío también en Traspasos (destinatario fijo "MARINA FISH ZARAGOZA").
- Corrección 02/09/2026 punto 7: hoja CMR/Carta de Porte para clientes con agencia "MOZO", con calibración en milímetros.
- Corrección 02/09/2026 punto 8: catálogo de modelos de impresión siempre actualizado.

## 1. Alcance de esta primera versión (priorizado)

Construir TODO lo anterior de una vez no es realista en una sola tanda de trabajo — así que esta fase se divide en dos niveles, explícitamente:

### Nivel 1 — se construye ahora (los flujos de trabajo diario)
- Pantalla de **Pedidos**: crear un pedido (cliente, líneas con artículo/cantidad/peso/precio), con asignación de partida en vivo mientras se teclea (llamando a `POST /api/pedidos/asignar-partida`) y aviso de margen (✅/⚠️), cálculo de IVA/Recargo visible antes de grabar, y listado de pedidos recientes.
- Pantalla de **Compras**: crear una compra (proveedor, líneas con artículo/kilos/precio), con cálculo en vivo de OP2/IVA (`POST /api/compras/calcular-linea`) antes de grabar, y listado (recuerda: nunca se puede editar ni borrar una vez grabada).
- Pantallas de catálogo: **Clientes, Artículos, Proveedores** (listar, crear, editar).
- Pantalla de **Partidas**: ver kilos disponibles y cerrar/reabrir manualmente.
- Pantalla de **Excepciones**: líneas de pedido pendientes de asignación manual de partida (`GET /api/pedidos/excepciones/lista`).
- Pantalla de **Listas de precio**: modo AUTO (vista previa desde las compras del día) y modo MANUAL (con aviso en vivo de precio por debajo de coste, y existencias en texto libre).
- Selector de **puesto** (CORU/PANC) una vez por ordenador, guardado en el propio navegador, mandado en cada petición (cabecera `X-Puesto-Codigo`, Fase 3).
- El botón de grabar se desactiva mientras se procesa el guardado, en las tres pantallas que graban (Pedidos, Compras, y las que se añadan después).

### Nivel 2 — explícitamente pendiente para después de esta tanda
- Repartos y Traspasos (mismo patrón que Pedidos, se añaden replicando la misma estructura cuando haga falta).
- Generación de documentos imprimibles: albarán de cliente, hoja Transfrío, hoja CMR/Carta de Porte, etiquetas — con su editor de calibración en milímetros (corrección 02/09/2026 puntos 6, 7, 8) y con impresión en lote de varios pedidos seleccionados a la vez (corrección 02/09/2026 punto 9, recibida el 14/09 — casillas de marcar en el listado + filtro como alternativa, con aviso de cuántos documentos se van a generar). Esto es un bloque de trabajo grande y muy visual (posicionar campos sobre un papel pre-impreso), mejor abordarlo aparte una vez que los flujos de captura de datos (Nivel 1) ya estén en uso y validados por Víctor — no tiene sentido calibrar la impresión de un pedido si la forma de crear pedidos todavía puede cambiar. Al construirlo, diseñar la selección múltiple como una capacidad transversal del listado/historial (no repetida a mano para cada documento nuevo), tal como pide el punto 9.
- Catálogo de modelos de impresión (depende de que exista al menos un modelo de impresión construido).
- Listados de gestión con la separación ventas/traspasos (corrección punto 3) — se construye junto con Traspasos.
- Cualquier tipo de inicio de sesión con usuario/contraseña (Fase 3 ya señaló que no hay todavía — sigue sin haberlo en esta fase, es aceptable en red local de confianza).

## 2. Decisión técnica

HTML + JavaScript normal (sin frameworks, sin paso de compilación) servido como archivos estáticos por el propio backend de Express — se abre con un navegador normal, igual que el programa actual, y no le añade a Víctor ninguna herramienta nueva que instalar (nada de Node/npm en el ordenador de Pancho, por ejemplo, si ese ordenador solo va a usar la pantalla). A diferencia del HTML actual (un único archivo de más de 12.000 líneas), aquí cada pantalla vive en su propio archivo, para que sea mantenible.

## 3. Verificación de esta fase (Nivel 1)

Ver `VERIFICACION_FASE4_2026-09-14.md` para el detalle completo (probado con un navegador real, Chromium vía Playwright, no solo revisando el código).

- [x] Las pantallas de Pedidos y Compras permiten completar un pedido/compra de principio a fin usando la API real (no simulada), contra la base de datos real.
- [x] La asignación de partida y el aviso de margen se ven en pantalla mientras se teclea, no solo al grabar.
- [x] El botón de grabar queda desactivado mientras se procesa — comprobado con la respuesta del servidor ralentizada a propósito, para verlo con claridad; la primera comprobación pareció fallar, pero el fallo estaba en la propia prueba (buscaba el botón por un texto que cambia al desactivarse), no en la pantalla.
- [x] Probado abriendo la pantalla en un navegador de verdad (no solo revisando el código) y completando al menos un pedido y una compra reales. También probado el aviso de precio por debajo de coste en Listas de precio.
- [x] El HTML/programa actual sigue intacto y en uso normal, en paralelo.
- [ ] Víctor ha abierto la pantalla él mismo y ha dado el visto bueno — pendiente.
