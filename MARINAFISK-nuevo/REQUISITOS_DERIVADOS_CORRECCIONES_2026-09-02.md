# MARINAFISK — Dónde queda recogida cada corrección del 02/09/2026

Documento de trazabilidad para `CORRECCIONES_2026-09-02_programa_actual.md`. Indica, para cada uno de los 13 puntos, en qué documento de fase se ha integrado el requisito para el sistema nuevo.

Los documentos de **Fase 3** (sincronización / varios puestos) y **Fase 4** (interfaz) todavía no existen en este repositorio. Hasta que se redacten, los requisitos de esas fases quedan guardados aquí, en la sección "Pendiente de pasar a Fase 3 / Fase 4". **Al redactar esos documentos, copiar estos puntos dentro y marcarlos aquí como trasladados.**

---

## Tabla de trazabilidad

| # | Corrección | Fase 0 | Esquema | Fase 1 | Fase 2 | Fase 3 | Fase 4 |
|---|---|---|---|---|---|---|---|
| 1 | Doble/triple grabación por el mismo clic | punto 10 | `clave_idempotencia` | punto 3bis + cierre | — | prueba concurrencia | botón bloqueado |
| 2 | Refresco de carpeta compartida al empezar el día | punto 10 | — | — | — | prueba 2 usuarios | — |
| 3 | Traspasos a Zaragoza separados de ventas en listados | punto 10 | — | — | punto 5bis | — | presentación |
| 4 | Aviso precio de venta < coste | — | — | — | punto 4 | — | aviso en vivo |
| 5 | Existencias admiten texto | — | `existencias_texto` | — | punto 4 | — | campo |
| 6 | Hoja Transfrío en Traspasos | — | constantes | — | — | — | botón |
| 7 | Hoja CMR / Carta de Porte (MOZO) | — | `transportista`, plantillas | — | — | — | hoja + calibración |
| 8 | Catálogo de modelos de impresión siempre al día | — | plantillas | — | — | — | pantalla generada |
| 9 | Impresión en lote (Transfrío, sin precios) | — | — | — | — | — | selección + lote |
| 10 | Copias por cliente dentro del PDF; pestañas por clic | — | — | — | — | — | flujo por pasos |
| 11 | Destinatario de Reparto Super duplicándose | punto 10 | `repartos` | punto 3bis + cierre | — | — | — |
| 12 | Imprimir sin precios / Transfrío desde la fila | — | — | — | — | — | 2 botones por fila |
| 13 | Autosuma "+" en la casilla de peso | — | — | — | — | — | campos numéricos |

---

## Pendiente de pasar a Fase 3 (sincronización / varios puestos)

- [ ] **(1, 2)** Prueba explícita con dos usuarios (puesto de Víctor y puesto de Pancho) que graban a la vez: ningún número de pedido, reparto o traspaso se repite ni se salta, y ambos ven los mismos contadores y el mismo estado **sin ningún refresco manual ni automático "por la mañana"**. Si hiciera falta un refresco para que cuadren, es un defecto de la fase.
- [ ] **(1)** Prueba de "doble envío": mandar al backend la misma petición de grabar dos o tres veces seguidas (o en paralelo) debe producir **un único registro**, no varios. Reproducir el caso real del 01/09/2026 (pedidos 13786, 13787 y 13788, idénticos).

## Pendiente de pasar a Fase 4 (interfaz)

**Grabación**
- [ ] **(1)** Todos los botones que escriben datos (pedidos, repartos, traspasos, compras, partidas, catálogos…) se desactivan al pulsarlos y muestran que están grabando, hasta que el servidor responde (bien o con error). Esto complementa la protección del servidor (Fase 1, punto 3bis), no la sustituye.
- [ ] **(11)** Abrir un registro y grabarlo sin tocar nada lo deja exactamente igual. Probarlo con repartos cuyo destinatario no sea ALCAMPO (ECOMORA, AHORRAMAS, TORIODIS LEÓN, MARINA FISK CORUÑA, texto libre).

**Precios**
- [ ] **(4)** En cualquier pantalla donde se escriba a mano un precio de venta: aviso en vivo si queda por debajo del coste real de la partida (casilla en rojo), aviso al salir del campo (producto, precio, coste y pérdida) y confirmación antes de generar la imagen final si queda alguno en pérdida. No bloquea: obliga a confirmarlo.
- [ ] **(5)** El campo de existencias admite número o texto libre ("AGOTADO", "POCAS"). Número → "X cajas"; texto → tal cual en mayúsculas.

**Campos numéricos**
- [ ] **(13)** En peso, kilos, cajas y campos similares: escribir `12.4+8.1+6.3` y pulsar Enter o Ctrl+= deja el resultado (`26.8`). Admite restas y coma decimal. Un número normal funciona igual que siempre.
- [ ] **(13) Seguridad:** la operación se resuelve con un analizador propio que solo acepta dígitos, espacios, `.`/`,` y los operadores `+`/`-`. **Nunca `eval()`, `new Function()` ni nada equivalente.** Cualquier otro carácter → se deja el texto como está y se avisa, sin grabar un valor incorrecto. Si el valor se envía al backend, el backend también valida que sea un número (no confía en la pantalla).

**Hojas de transporte y documentos sobre papel pre-impreso**
- [ ] **(6)** Hoja Transfrío también en Traspasos. Destinatario fijo **"MARINA FISH ZARAGOZA"**, destino **"ZARAGOZA"**, tomado de las constantes del sistema — nunca del catálogo de clientes ni de una ficha de cliente falsa. Fecha, bultos y kilos, de las líneas del traspaso.
- [ ] **(7)** Hoja CMR / Carta de Porte, visible **solo** cuando el cliente tiene como transportista `MOZO` (hoy solo MARIA CUSTODIA ALVES E FILLOS, código 50540). Casillas: 1 (remitente Marinafisk, 4 líneas), 2 (cliente + dirección repartida en líneas), 3 ("INSTALACIONES CUSTODIA - PORTUGAL"), 4 ("A CORUÑA, ESPAÑA" + fecha), 5 (nº albarán), 6 ("VER ALBARÁN ADJUNTO" + nº cajas), 11 (peso bruto kg), 21 (A CORUÑA + fecha). Los textos fijos salen de las constantes del sistema.
- [ ] **(7)** Diseño por "diccionario" transportista → plantilla de impresión, para añadir nuevos transportistas/formularios sin rehacer la lógica.
- [ ] **(7)** Calibración en milímetros para cada plantilla sobre papel pre-impreso (editor X/Y por campo, "Ver con regla", "Restaurar de fábrica"), igual que hoy en Transfrío y CMR. Partir de las coordenadas ya calibradas en el HTML del 02/09/2026, no de cero.
- [ ] **(8)** Pantalla "Modelos de impresión" **generada automáticamente** a partir de la lista central de plantillas del código (nombre, para qué sirve, cuándo aparece, ejemplo). Añadir una plantilla sin que aparezca en el catálogo no debe ser posible. Añadir una prueba automática que lo compruebe.
- [ ] **(9)** Todo documento sobre papel pre-impreso (Transfrío, CMR y futuros) se puede imprimir de uno en uno y en lote, con el mecanismo común del listado: casillas marcadas, o el filtro si no se marca ninguna. Es una función transversal del listado, no algo que se repita para cada documento.
- [ ] **(9)** Antes de imprimir en lote, avisar de cuántos documentos se van a generar ("Se van a imprimir X pedido(s)…") para preparar el papel físico, en el mismo orden.
- [ ] **(10)** Las copias por cliente (Transfrío: 4 por defecto, se pregunta) se construyen **dentro del PDF**: 4 del cliente 1, luego 4 del cliente 2… Nunca depender de la opción "copias" del diálogo de impresión.
- [ ] **(10)** Todo flujo que abra varias pestañas/ventanas lo hace **un clic → una pestaña** (panel con cliente actual, "Abrir PDF para imprimir", "Siguiente cliente", "Parar aquí"). Nunca con `setTimeout` ni aperturas automáticas, que el navegador bloquea sin avisar.
- [ ] **(12)** En Historial de Pedidos y de Traspasos, cada fila tiene **dos botones separados**: "sin precios" (o documento del traspaso) y "Transfrío". Nunca combinados en un único PDF ni un único botón: van a impresoras distintas. Las mismas dos acciones también dentro del registro abierto.

---

## Notas encontradas al revisar el HTML de referencia del repositorio (versión 2026-08-21-I)

El HTML corregido del 02/09/2026 (`CARGA_DE_ALBARANES_MARINAFISK_2026-09-02-CORREGIDO.html`) **no está en este repositorio**; el que hay es la versión `20260821I`. Revisando esa versión, dos detalles relacionados con el punto 11 conviene comprobar en la versión corregida:

1. **`dividirDestinatario()` también duplicaba en el caso ALCAMPO sin ciudad.** En la rama de ALCAMPO, la ciudad se calcula como `texto.substring(...).trim() || texto`. Si el destinatario es solo "ALCAMPO" (sin ciudad), la ciudad queda "ALCAMPO" y al reabrir se ve "ALCAMPO ALCAMPO", con el mismo crecimiento sin fin. El documento de correcciones describe el arreglo del caso "no ALCAMPO"; comprobar que en la versión corregida esa rama deja la ciudad vacía (`''`) en vez de repetir el texto.
2. **La importación de Reparto Super desde Excel (`procesarHojaCarga`) usa el mismo patrón** (`... .trim() || localidadCelda`) para la ciudad. Aquí el texto no se vuelve a partir al grabar, así que probablemente no crece, pero puede dejar nombre y ciudad iguales ("ALCAMPO" / "ALCAMPO"). Comprobar si afecta a lo que se imprime.

Para el sistema nuevo, ambos casos quedan cubiertos por la regla general de la Fase 1, punto 3bis: separar y volver a unir un texto nunca puede cambiarlo.

**Pendiente de aclarar:** el documento de correcciones cita los "listados de gestión ya especificados en la Fase 2, punto 5bis", pero la versión de la Fase 2 que hay en este repositorio no tiene ese punto. Se ha añadido un punto 5bis con lo que pide la corrección 3. Si existe otra versión de la Fase 2 con más contenido en ese punto, hay que subirla para unir las dos.

---

*Preparado a partir de `CORRECCIONES_2026-09-02_programa_actual.md`.*
