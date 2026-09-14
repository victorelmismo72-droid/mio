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

### Nivel 2 — construido en la segunda tanda (14/09/2026)

Ver `VERIFICACION_FASE4_NIVEL2_2026-09-14.md` para el detalle completo, probado con navegador y datos reales.

- [x] Repartos y Traspasos, mismo patrón que Pedidos/Compras.
- [x] Hoja Transfrío también en Traspasos, con destinatario fijo "MARINA FISH ZARAGOZA" (corrección punto 6) — probado con un traspaso real.
- [x] Hoja CMR/Carta de Porte, visible solo para clientes con agencia "MOZO" (corrección punto 7) — probado con el cliente real citado en la corrección (MARIA CUSTODIA ALVES E FILHOS, código 50540): el botón aparece solo en ese pedido, comprobado explícitamente entre 30 pedidos recientes.
- [x] Editor de calibración en milímetros, con "📐 Ver con regla" y "↩️ Restaurar de fábrica" (corrección punto 7) — probado de verdad: guardar, recargar la página entera y comprobar que persiste en la base de datos, y restaurar.
- [x] Catálogo de modelos de impresión, generado desde el registro central `backend/src/modelosImpresion.js` (corrección punto 8).
- [x] Selección múltiple e impresión en lote en Historial, como capacidad transversal (corrección punto 9, recibida el 14/09) — una única mecánica de selección (casillas + filtro como alternativa) sirve para las cuatro acciones de imprimir.
- [x] Albarán con precios y sin precios — comprobado explícitamente que la versión sin precios no contiene ningún importe en el HTML generado.

**Pendiente, señalado honestamente:** las coordenadas en milímetros de partida de Transfrío y CMR son una estimación sobre una hoja en blanco, no están calibradas contra el papel físico real de los transportistas — este entorno no tiene impresora ni el papel real para hacerlo, exactamente la misma limitación que tuvo el HTML actual la primera vez. La herramienta para que Víctor (o quien imprima) haga esa calibración con impresiones reales ya está construida y probada.

**Sigue sin construirse** (no pedido explícitamente en las correcciones para esta tanda):
- Etiquetas — no hay especificación de formato suficiente de Víctor todavía.
- Listados de gestión con la separación ventas/traspasos (corrección punto 3).
- Cualquier tipo de inicio de sesión con usuario/contraseña (Fase 3 ya señaló que no hay todavía — aceptable en red local de confianza, no antes de salir a Internet).

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
