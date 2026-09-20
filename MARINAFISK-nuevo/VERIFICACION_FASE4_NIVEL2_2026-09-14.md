# Verificación de la Fase 4, Nivel 2 (documentos imprimibles, Repartos, Traspasos)

Fecha: 2026-09-14

Probado con un navegador real (Chromium vía Playwright), contra el backend y la base de datos reales, igual que el Nivel 1.

## 1. Repartos y Traspasos

Se grabó un reparto y un traspaso reales de principio a fin, con las mismas garantías que Pedidos/Compras (protección de guardado duplicado, botón que se desactiva mientras se procesa). Ambos aparecieron correctamente en sus listados de "recientes".

## 2. Hoja Transfrío en Traspasos (corrección 02/09/2026, punto 6)

Se imprimió la Hoja Transfrío del traspaso recién grabado. El destinatario salió como **"MARINA FISH ZARAGOZA" / "ZARAGOZA"**, fijo — no se ha consultado el catálogo de Clientes en ningún momento (los traspasos no tienen cliente). Fecha, bultos y kilos se rellenaron solos a partir de las líneas del traspaso.

## 3. Hoja CMR condicional (corrección 02/09/2026, punto 7)

Se creó un pedido real para el cliente **"MARIA CUSTODIA ALVES E FILHOS LDA." (código 50540)** — el mismo cliente citado literalmente en la corrección, el único con agencia "MOZO" en los datos reales. Resultado:

- El botón "📄 CMR" apareció en su fila de la lista de pedidos recientes.
- Se comprobó explícitamente que, de 30 pedidos recientes en pantalla, **solo 1** (el de este cliente) muestra el botón — los otros 29 no lo muestran.
- Se imprimió la Hoja CMR real: casillas 1 (remitente Marinafisk, con el registro sanitario correcto 12.01671/C), 2 (cliente y su dirección real de Portugal, repartida en varias líneas), 3 y 4 (textos fijos), 5 (número de pedido), 6, 11 y 21 — todas con los datos reales del pedido.

## 4. Catálogo de modelos de impresión (corrección punto 8)

La pantalla se genera sola desde `backend/src/modelosImpresion.js` — se comprobó que los 4 modelos (albarán con/sin precios, Transfrío, CMR) aparecen con su descripción y a qué documentos se aplican, sin haber escrito nada a mano en la pantalla.

## 5. Editor de calibración en milímetros (corrección punto 7)

Probado de verdad, no solo revisando el código — con la base de datos real, no simulada:

1. Se cambió la coordenada X de un campo de 25 a 99,5 y se guardó.
2. **Se recargó la página entera** (no solo se comprobó en memoria) y se volvió a abrir el editor: seguía en 99,5 — confirma que se guarda de verdad en la base de datos, no solo en el navegador.
3. Se pulsó "↩️ Restaurar de fábrica": volvió a 25 (el valor del código).

## 6. Historial con selección múltiple e impresión en lote (corrección punto 9)

Se marcó un pedido en el Historial y se imprimió su albarán sin precios: se comprobó que el documento generado **no contiene el símbolo "€" en ningún sitio** (confirma que de verdad es la versión sin precios, no la normal con los precios ocultos por CSS). El mecanismo de selección (casillas + "si no marcas nada, se usa el filtro") es el mismo para las cuatro acciones de impresión (albarán con precios, sin precios, Transfrío, CMR) — no se ha repetido a mano para cada una, tal como pide la corrección.

## 7. Fallo real encontrado y corregido durante estas pruebas

Al comprobar la Hoja Transfrío de un pedido real, la fecha salía como **"Tue Jun 02"** en vez de "2026-06-02" — un fallo real de coma flotante entre cómo PostgreSQL devuelve una columna `DATE` (como objeto `Date` de JavaScript) y cómo se estaba formateando (`String(fecha).slice(0,10)`, que en un objeto `Date` da la fecha en formato "día de la semana, mes, día" en vez de ISO). Corregido en `backend/src/logica/datosImpresion.js` (pasar por `toISOString()` antes de recortar) y reprobado: ya sale "2026-06-02" correctamente. Es precisamente el tipo de fallo de fechas que FASE_0 (punto 7) pedía vigilar.

## Conclusión

**El Nivel 2 de la Fase 4 está verificado con datos y un navegador reales**, incluido el caso más específico y frágil de toda la corrección (el cliente CMR real, con sus datos reales). Como en el resto de este proyecto, se encontró y corrigió un fallo real durante la propia verificación (la fecha en formato incorrecto), no se dio nada por bueno a la primera.

## Pendiente, señalado honestamente para Víctor

Las **coordenadas en milímetros de partida** de Transfrío y CMR (en `backend/src/modelosImpresion.js`) son una estimación de partida sobre una hoja A4 en blanco — **no están calibradas contra el papel real de los transportistas**, porque este entorno no tiene una impresora ni el papel físico para poder hacerlo. Esto es exactamente la misma situación que se describe en el propio HTML actual ("las coordenadas de partida se estimaron a partir de una foto... y se han ido calibrando en varias rondas con impresiones de prueba reales") — nadie puede saltarse ese paso sin un papel y una impresora de verdad delante. La herramienta para hacerlo (pantalla "Modelos de impresión" → "Ajustar calibración", con "📐 Ver con regla") está construida, probada, y guarda los ajustes de verdad en la base de datos — a Víctor (o a quien imprima) le queda solo el trabajo de ajustar los números mirando el papel real, exactamente como se hizo la primera vez con el HTML actual.
