# Verificación de la Fase 4 (interfaz — Nivel 1)

Fecha: 2026-09-14

Probado de verdad abriendo la pantalla en un navegador real (Chromium, vía Playwright, en modo automatizado — no revisando solo el código), contra el backend real y la base de datos real migrada. No es una simulación: cada acción de la lista siguiente hizo una petición HTTP real contra la API y comprobó el resultado real en pantalla y en la base de datos.

## 1. Flujo completo de un pedido, de principio a fin

1. Se abrió `http://localhost:3001/` (la pantalla la sirve el propio backend, sin ningún paso de instalación aparte).
2. Se eligió el puesto "CORU" en el selector de la cabecera.
3. Se buscó un cliente por código (`50000`) con el campo de autocompletado.
4. Se añadió una línea con el artículo `C144` (MERLUZA BAKA DIA), 10 kg a 999 €/kg (precio alto a propósito, para forzar margen suficiente).
5. **La partida se asignó sola mientras se tecleaba** (llamada en vivo a `POST /api/pedidos/asignar-partida`), mostrando en pantalla "✅ partida 55947" — sin que hiciera falta grabar nada todavía.
6. Se pulsó "Grabar pedido": el pedido se creó de verdad (nº 13941/13942 en las distintas ejecuciones de prueba), con aviso de confirmación en pantalla.
7. El pedido apareció inmediatamente en la lista de "Pedidos recientes" de la misma pantalla.

## 2. Flujo completo de una compra, de principio a fin

1. Se eligió un proveedor real del desplegable.
2. Se pidió "Sugerir siguiente" número de partida (calculado desde las partidas existentes).
3. Se añadió una línea con el artículo `C144`, 20 kg a 2,50 €/kg.
4. **El 2% de OP se calculó en vivo mientras se tecleaba** (llamada a `POST /api/compras/calcular-linea`), mostrando "1,00 €" en pantalla (2% de 50€ de base = 1,00€, correcto).
5. Se pulsó "Grabar compra": se creó de verdad, con aviso de confirmación.

## 3. El botón de grabar se desactiva de verdad mientras se procesa

Esto se probó con especial cuidado, porque es justo la corrección del 01/09/2026 (punto 1) que originó todo este proyecto. Primera comprobación ingenua: pareció que el botón NO se desactivaba — pero al investigarlo, el fallo estaba en la propia prueba (buscaba el botón por su texto "Grabar pedido", que cambia a "⏳ Grabando…" en cuanto se desactiva, así que el propio selector de la prueba dejaba de encontrarlo justo en ese instante). Repetida la prueba con un selector estable (por posición, no por texto) y con la respuesta del servidor ralentizada a propósito (800-1500 ms, para poder observarlo con claridad):

- Justo al pulsar: `disabled = true`, texto cambia a "⏳ Grabando…".
- Se mantiene así durante todo el guardado, incluida la recarga posterior de la lista de recientes.
- Al terminar del todo: `disabled = false`, texto vuelve a "💾 Grabar pedido".

Confirmado con logs añadidos temporalmente al propio código (ya retirados) y con comprobación externa vía Playwright — coinciden.

## 4. Aviso de precio por debajo de coste (Listas de precio, modo MANUAL)

Se seleccionó el artículo `C144` y se escribió un precio de 0,10 €/kg (muy por debajo del coste real de partida, que la propia pantalla consulta en vivo con `GET /api/articulos/:id/coste-referencia`). Resultado:
- El campo de precio se resalta con borde rojo.
- Aparece el aviso "⚠️ ¡PÉRDIDA! -4,11 €/kg por debajo del coste (4,21 €)" — con el importe exacto, no un aviso genérico.
- Al intentar guardar con productos en pérdida, aparece una confirmación explícita antes de continuar (igual que el HTML actual, corrección 02/09/2026 punto 4).

## 5. Resto de pantallas

Se recorrieron Partidas, Excepciones, Listas de precio, Clientes, Artículos y Proveedores tras las pruebas anteriores: cargan sin ningún aviso de error, y **no se detectó ningún error en la consola del navegador** en toda la sesión de pruebas.

## Conclusión

**La Fase 4 (Nivel 1: Pedidos, Compras, catálogos, Partidas, Excepciones, Listas de precio) está verificada de verdad, con un navegador real, no solo revisando el código.** Como es habitual en este proyecto, la propia prueba tuvo un fallo al principio (el selector por texto) que se detectó, se explicó por qué pasaba, y se corrigió antes de dar la verificación por buena — no se ha dado nada por bueno sin comprobarlo dos veces cuando el primer resultado no cuadraba.

Pendiente (Nivel 2 de `FASE_4_interfaz_MARINAFISK.md`, explícitamente no incluido en esta tanda): Repartos, Traspasos, y toda la generación de documentos imprimibles (albarán, Transfrío, CMR, etiquetas) con su calibración en milímetros e impresión en lote.
