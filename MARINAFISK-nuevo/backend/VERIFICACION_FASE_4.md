# MARINAFISK — Fase 4: interfaz y gestor virtual (estado y verificación)

Construido sobre las Fases 1-3 ya verificadas. Pantallas nuevas en `public/` (HTML + JS normal, sin frameworks ni paso de compilación, coherente con `fiscal.html` de la Fase 3), servidas por el mismo backend Express — no hace falta nada nuevo que instalar.

## 1. Pantallas construidas en esta pasada

| Pantalla | Qué hace |
|---|---|
| `login.html` | Entrada única del sistema. |
| `index.html` | Inicio — panel "Clientes a Contactar Hoy" (ver punto 3). |
| `compras.html` | Registrar compra: el 2% de OP y el IVA se ven en vivo según el proveedor elegido, antes incluso de guardar. |
| `pedidos.html` | Crear albarán: asignación de partida en línea (✅ automática si llega al margen, ⚠️ para elegir a mano si no), y una vista previa que alterna entre "interna" (con precio y partida) y "cliente" (sin ninguno de los dos, como pide la Fase 0 punto 3). |
| `partidas.html` | Asignar partidas de un día entero (con pantalla de excepciones), cerrar/reabrir partidas (una a una o por fecha), consultar rentabilidad de una partida. |
| `listados.html` | Los 7 listados de la Fase 2 (punto 5bis), con filtro de fecha y exportación a CSV real (descarga el archivo, no solo lo enseña). |
| `usuarios.html` | Solo Administrador: alta de usuarios, activar/desactivar, y el cierre de año (vista previa + confirmación). |

**No construidas todavía en esta pasada** (quedan para una siguiente): Transfrío, Reparto Super con etiquetas Scanfisk, etiquetas multi-idioma con reglas de caducidad, listas de precios. Necesitan estudiar a fondo el código de impresión/PDF del HTML actual, que no se ha abordado aún.

## 2. Un principio de diseño importante para la agilidad (Fase 4 punto 2)

**Bug real encontrado y corregido durante esta fase, antes incluso de que Víctor lo viera:** las primeras versiones de `compras.html` y `pedidos.html` reconstruían toda la fila de la tabla (destruyendo y recreando los campos de texto) en cada tecla pulsada o cada vez que el usuario pasaba al siguiente campo. En las pruebas automatizadas esto no se notaba (rellenan los campos de golpe), pero un usuario de verdad tecleando carácter a carácter **perdería el foco a mitad de escribir un número** — justo lo contrario de la agilidad tipo hoja de cálculo que pide la Fase 4.

Corregido: ahora escribir en un campo solo actualiza los cálculos de esa fila (total, partida) sin tocar los campos de texto en sí; la tabla entera solo se reconstruye al añadir o quitar una línea. Verificado con una simulación de tecleo real (no solo rellenar de golpe): el foco se mantiene en el campo mientras se escribe, en las dos pantallas.

## 3. Panel "Clientes a Contactar Hoy" (Fase 4 punto 1 y 3)

Reproduce la lógica exacta del HTML actual (qué productos compra cada cliente con regularidad, cuánto lleva sin pedirlos, si el intervalo típico se ha superado con margen) y añade la ampliación que pide el punto 3: los recordatorios salen ordenados por margen real conocido (el mayor primero), y los clientes se ordenan por urgencia.

**Mejora deliberada respecto al HTML actual**: "contactado hoy" ya no se guarda en `localStorage` (por ordenador, no compartido) sino en una tabla (`contactados_hoy`) — si Víctor lo marca, Pancho también lo ve marcado, coherente con el multiusuario real de la Fase 3.

Probado contra datos reales: 53 clientes con recordatorio pendiente hoy, cálculo en 0,4 segundos — muy por debajo de cualquier problema de agilidad.

## 4. Otros fallos encontrados y corregidos durante las pruebas de esta fase

- **Campo numérico vacío rompía el guardado**: un formulario con un campo numérico sin rellenar (ej. "cajas") mandaba `''` en vez de `null`, y PostgreSQL lo rechazaba con un error 500. Corregido de forma genérica en el backend (`vacioComoNull`, en `crudCatalogo.js`, `crudDocumento.js` y `compras.js`) — no solo en el formulario, para que ninguna otra pantalla futura pueda repetir el mismo fallo.
- **Códigos mostrados como si fueran cantidades**: en los listados, un código de proveedor como `50232` se mostraba con separador de miles (`50.232`), como si fuera una cifra. Corregido para que las columnas de código/número de documento nunca se formateen como cantidad.

## 5. Verificación de datos reales tras las pruebas

Todas las pruebas de esta fase se hicieron contra los datos reales migrados en Fase 1 (no hay datos de mentira en esta base). Cualquier compra/pedido de prueba creado durante las pruebas se ha borrado explícitamente después, y las asignaciones automáticas de partida hechas sobre pedidos reales (al probar "asignar partidas de un día" contra una fecha real) se han revertido. Verificado con `npm run verify` tras cada tanda de pruebas: **0 discrepancias** contra el backup original en todo momento.

## 6. Qué falta para cerrar la Fase 4 del todo

- **Víctor debe usar personalmente cada pantalla con datos reales** y confirmar que el resultado es idéntico al del programa actual — este es el requisito de cierre más importante de esta fase (punto 4 de la Fase 4) y no lo puede hacer nadie más.
- Comparación explícita de agilidad frente al HTML/Excel actuales, pantalla por pantalla (más allá de la corrección de foco del punto 2, que era un defecto claro).
- Transfrío, Reparto Super, etiquetas multi-idioma y listas de precios (ver punto 1).
- El HTML actual sigue intacto y disponible en paralelo — no se ha tocado nada de él.
