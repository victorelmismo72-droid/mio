# MARINAFISK — Fase 4: Pantallas e impresión

Este documento se entrega junto con los de las fases anteriores (`FASE_0` a `FASE_3`), `02_ESQUEMA_BASE_DATOS_PROPUESTO.md`, `ESPECIFICACION_COMPRAS_EXCEL.md`, `CORRECCIONES_2026-09-02_programa_actual.md` y el HTML actual del programa.

**Instrucción para Claude Code:** antes de escribir nada, revisa el estado real de las Fases 1, 2 y 3 (base de datos, lógica de negocio, varios puestos) y abre el HTML actual para ver cada pantalla tal como la usan hoy Víctor y Pancho. Esta fase construye **las pantallas y los documentos impresos** del sistema nuevo sobre el backend ya hecho. No cambia reglas de negocio: si una pantalla necesita una regla que no existe en el backend, se añade al backend (Fase 2), no se calcula a escondidas en la pantalla.

---

## Objetivo de esta fase

Al final de la Fase 4, Víctor y Pancho pueden hacer **todo su trabajo diario** en el sistema nuevo, desde sus dos puestos, igual o más rápido que hoy, y con los mismos documentos impresos. El HTML y el Excel siguen en uso en paralelo hasta que se decida el paso definitivo, que se planifica aparte.

Debe poder demostrarse que:

1. Cada pantalla del programa actual tiene su equivalente, y no falta ninguna función que se use.
2. Cada documento impreso (albaranes, hojas de transporte, etiquetas, listas de precios) sale **igual que hoy**, y los de papel pre-impreso caen en su sitio sobre el papel real.
3. Las 22 correcciones del 02/09/2026 que tocan pantallas están cubiertas (punto 4).
4. Ningún flujo es más lento ni tiene más pasos que en el HTML o el Excel.

---

## 1. Principios para todas las pantallas

- **Mismos nombres y misma organización que hoy.** Las pestañas, los nombres de los campos y el orden de trabajo se parecen todo lo posible al HTML actual. Lo que se cambie debe ser para mejorar, y explicado a Víctor antes.
- **La pantalla no decide reglas de negocio.** Importes, IVA, 2 % OP, partidas, márgenes, costes y PVP los calcula siempre el backend (Fases 1 y 2). Si la pantalla enseña un cálculo en vivo mientras se escribe, usa la misma función del backend (una llamada al servidor, o el mismo código compartido), nunca una copia aparte que pueda dar otro resultado. Lo que se graba es siempre lo que calcula el servidor.
- **Campos calculados: se ven, no se editan** (corrección 17). Se edita el origen (código, kilos, precio) y el resultado se actualiza solo.
- **Teclado primero.** Se trabaja sin ratón: Tab y Enter avanzan entre campos y líneas, y nueva línea al terminar la última. Es como se trabaja hoy en el HTML y en el Excel.
- **Formato español en todo:** fechas `DD/MM/AAAA`, también al escribirlas (corrección 17); importes `1.234,56 €`; coma o punto decimal aceptados al escribir. La "fecha de hoy" la pone el servidor (Fase 3, punto 5).
- **Agilidad medida, no supuesta:** ver punto 7.
- **Mensajes claros y en español**, que digan qué pasa y qué hacer. Nunca un error técnico a secas.

---

## 2. Tecnología y seguridad de la interfaz

- **Aplicación web** servida por el backend en la red de la oficina (Fase 3) y usada desde el navegador de cada puesto. Nada que instalar en los ordenadores.
- Claude Code elige el framework, con el mismo criterio que en la Fase 1: lo más sencillo y mantenible, con el código comentado en español.
- **Inicio de sesión** con el usuario de cada persona (Fase 3). La sesión caduca si no se usa durante un tiempo razonable (a confirmar con Víctor) y se puede cerrar a mano.
- **En el navegador no se guardan datos del negocio** (ni en `localStorage` ni en archivos): solo preferencias de pantalla (filtros, columnas). Es el origen de los problemas de sincronización actuales.
- **Todo texto que venga de los datos** (nombres de clientes, descripciones, notas) se muestra escapado. El HTML actual monta mucho contenido con `innerHTML` y textos concatenados; el sistema nuevo no. Un nombre con `<` o comillas no puede romper la pantalla ni ejecutar nada.
- Las acciones que borran o anulan piden confirmación y quedan en el registro de quién hizo qué (Fase 3, punto 8).

---

## 3. Pantallas

Una por cada pestaña del HTML actual (`goPanel`: pedido, historial, traspasos, historial-traspasos, reparto, clientes, articulos, proveedores, compras, contactar, sueltas, modelos, sync), más las del Excel `GESTION_CORRECTA` que pasan al sistema nuevo. Los números entre paréntesis son los de las correcciones del 02/09/2026.

### 3.1 Hoja de pedido
- Cabecera: cliente (buscador, 14), fecha, forma de pago, agencia/transportista y **palets** (19).
- Líneas: artículo (buscador), cajas, peso con autosuma `12,4+8,1+6,3` (13), precio, partida asignada automáticamente con su aviso de margen (Fase 2, punto 3). La partida no sale nunca en el documento del cliente.
- GRABAR: botón bloqueado mientras graba (1). Antes de grabar se pregunta siempre por los palets (19).
- Botones de impresión: albarán con precios, albarán sin precios, Hoja Transfrío y Hoja CMR (esta última **solo** si el transportista del cliente es MOZO, 7). Cada uno por separado (12).

### 3.2 Historial de pedidos
- Filtros: fecha, cliente, agencia, artículo. Casillas de selección para impresión en lote (9, 10).
- Por fila: ver, modificar, anular, etiquetas, enviar, imprimir sin precios, imprimir Transfrío (12). Si no caben, menú "más acciones" con la casilla de selección siempre visible (20).
- Buscador de artículos vendidos con la opción "Incluir traspasos a Zaragoza" y los tres totales (3; Fase 2, punto 5bis).

### 3.3 Traspasos e historial de traspasos
- Mismo funcionamiento que pedidos, sin precios de venta.
- Hoja Transfrío con destinatario fijo "MARINA FISH ZARAGOZA" / "ZARAGOZA", tomado de las constantes del sistema (6). Botón en el traspaso y en cada fila del historial (12).

### 3.4 Reparto Super
- Destinatario: desplegable con buscador + texto libre. Separar nombre y ciudad nunca duplica el texto, y abrir y grabar sin cambios deja el reparto igual (11; Fase 1, punto 3bis).
- Importación desde el Excel de carga y generación de etiquetas, igual que hoy.

### 3.5 Compras (con lo que hoy hace el Excel `GESTION_CORRECTA`)
Manda `ESPECIFICACION_COMPRAS_EXCEL.md`. En pantalla:
- **Alta de compra:** fecha, proveedor (código a mano **o** buscador por nombre, independientes, 15 y 18b), nº de albarán del proveedor y líneas con producto, cajas, kilos (con autosuma, 13) y €/kg.
- Se ven, sin poder editarse, los cálculos de cada línea (base Zaragoza, base + IVA, 2 % OP, base real, IVA y total) y los totales de la compra.
- **Partida:** antes de confirmar se ve el número que se va a asignar (reutilizado o nuevo) y una casilla "Partida nueva (otro puerto)" (22). El número lo pone el servidor.
- No se graba una compra sin proveedor, producto, kilos y precio (`ESPECIFICACION_COMPRAS_EXCEL.md`, punto 9c, a falta de decisión de Víctor).
- **Historial de compras:** filtros por fecha, proveedor y producto; totales de lo filtrado (como el `SUBTOTAL` del Excel). Las compras grabadas no se editan: las correcciones se hacen con un ajuste enlazado (Fase 1).
- **Panel de compras:** tops de proveedores y productos, compras de cada proveedor y resultado para un filtro exacto (`ESPECIFICACION_COMPRAS_EXCEL.md`, punto 6).
- **Precio medio por artículo y periodo**, con "kg reales" opcional por mermas (punto 5 de esa especificación).
- **Partidas:** listado con kilos comprados, vendidos y disponibles; cierre manual y cierre masivo por fecha (Fase 2, punto 3); filtro de líneas pendientes de asignar.

### 3.6 Clientes, Artículos y Proveedores
- Listados con buscador en vivo (14) y fichas editables.
- Cliente: transportista/agencia de una lista controlada (de él depende qué hojas de transporte se ofrecen, 7) y clasificación fiscal (Fase 2).
- Proveedor: marca de subasta/lonja (2 % OP) y tipo de IVA.
- Artículo: coste, PVP1 y PVP2 calculados (no editables) y PVP manual opcional (`ESPECIFICACION_COMPRAS_EXCEL.md`, punto 4), más los datos de etiqueta.
- Un código repetido se rechaza con un mensaje claro (Fase 3, punto 3).

### 3.7 Listas de precios y "Contactar hoy"
- En el HTML es la pestaña "🎯 CONTACTAR HOY": tabla de precios del día y lista de clientes a contactar hoy.
- Listas Pescaderías y Mayoristas, independientes (Fase 0, punto 5), en modo automático (desde las compras del día, coste + 1,70 €, igual que el PVP1 del Excel) y manual.
- Botones de hoy: generar tabla, descargar imagen, copiar mensaje y descargar la versión con coste (uso interno).
- Aviso de precio por debajo del coste real de la partida, en tres niveles (4): en vivo, al salir del campo y antes de generar la imagen.
- Existencias como número o texto (5).
- Versión para el cliente y versión interna claramente separadas; la interna nunca se envía por error.
- Generación de las imágenes de la lista igual que hoy (en el HTML, con `canvas`).

### 3.8 Etiquetadora
- Etiquetas sueltas y etiquetas de pedido/reparto (formato Scanfisk con QR), con los datos de trazabilidad del artículo. El resultado debe ser idéntico al actual: se comparan con las del HTML (punto 7).

### 3.9 Modelos de impresión
- Catálogo **generado automáticamente** a partir de la lista central de plantillas: qué es cada una, cuándo aparece y un ejemplo (8). Una prueba automática falla si hay una plantilla sin entrada en el catálogo.
- Editor de calibración en milímetros para cada plantilla de papel pre-impreso, con "Ver con regla" y "Restaurar de fábrica" (7). Parte de las coordenadas ya calibradas en el HTML del 02/09/2026.

### 3.10 Coherencia de datos (nueva)
- Muestra el resultado de la comprobación diaria de la Fase 2 (punto 5ter): cada incoherencia con un enlace al registro afectado, resaltado en rojo (16 y 18a). No corrige nada: informa.

### 3.11 Estado del sistema (sustituye a "Sincronización (piloto)")
- Ya no hay carpeta compartida que sincronizar. La pantalla muestra si el servidor responde, la fecha y el resultado de la última copia de seguridad (Fase 3, punto 7) y quién está conectado.

---

## 4. Requisitos de las correcciones del 02/09/2026

Traspasados desde `REQUISITOS_DERIVADOS_CORRECCIONES_2026-09-02.md`. Se aplican en todas las pantallas donde corresponda, no solo en las nombradas.

**Grabación**
- **(1)** Todo botón que escribe datos se desactiva al pulsarlo y muestra que está grabando, hasta que el servidor responde (bien o con error). Complementa la clave de idempotencia de la Fase 1; no la sustituye.
- **(11)** Abrir un registro y grabarlo sin tocar nada lo deja exactamente igual.

**Precios y existencias**
- **(4)** Precio de venta por debajo del coste real: aviso en vivo, al salir del campo y antes de generar la imagen. No bloquea: obliga a confirmar.
- **(5)** Existencias: número ("X cajas") o texto libre (tal cual, en mayúsculas).

**Selectores, códigos y campos calculados**
- **(14)** Buscador con filtrado en vivo, por nombre y por código, en todo selector con muchas opciones.
- **(15, 18b)** Escribir el código a mano funciona siempre y muestra el nombre al lado. El buscador por nombre solo pone el código cuando el usuario lo elige de forma explícita; nunca escribe por su cuenta.
- **(17)** Campos calculados visibles y no editables.
- **(18a)** Esa protección no impide ordenar, filtrar, buscar ni añadir filas en ningún listado.
- **(16, 18a)** Pantalla de coherencia de datos (punto 3.10).
- **(17)** Fechas `DD/MM/AAAA` en toda la aplicación, documentos y exportaciones.

**Palets, acciones por fila y listados**
- **(19)** Palets en el pedido (0 por defecto). Al grabar se pregunta siempre, con cliente, bultos y kg de contexto. Enter confirma y Esc cancela; se rechazan negativos y decimales, y un segundo clic no abre otra pregunta.
- **(19)** Los palets salen en **todos** los documentos y caminos de impresión: albarán con y sin precios, Hoja Transfrío (subrayado, junto al destino), impresión individual, en lote y desde la fila.
- **(19)** Regla general: todo dato que pase a ser obligatorio por norma lleva valor por defecto para los registros antiguos, se confirma al grabar y llega a todos los documentos relacionados.
- **(20)** Muchas acciones por fila → menú "más acciones"; la casilla de selección, siempre fija y visible.
- **(21a)** Ordenar un listado mueve siempre la fila completa.
- **(21b)** Los datos de apoyo de buscadores viven aparte de los datos que se editan.
- **(22)** Compras: partida visible antes de grabar y casilla "otro puerto".

**Campos numéricos**
- **(13)** Peso, kilos, cajas y similares admiten `12,4+8,1+6,3` y se resuelven con Enter o Ctrl+=. También restas y coma decimal; un número normal funciona igual que siempre.
- **(13) Seguridad:** analizador propio que solo acepta dígitos, espacios, `.`, `,`, `+` y `-`. **Nunca `eval()`, `new Function()` ni nada equivalente.** Ante otro carácter, se deja el texto, se avisa y no se graba. El backend vuelve a validar que llega un número.

**Hojas de transporte y papel pre-impreso**
- **(6)** Transfrío en Traspasos con destinatario fijo de las constantes del sistema; nunca una ficha de cliente falsa.
- **(7)** CMR / Carta de Porte solo para transportista MOZO, con las casillas 1, 2, 3, 4, 5, 6, 11 y 21 tal como están en `CORRECCIONES_2026-09-02_programa_actual.md`, punto 7. Los textos fijos salen de las constantes del sistema.
- **(7)** Relación transportista → plantilla, para añadir formularios nuevos sin rehacer la lógica.
- **(7)** Calibración en milímetros por plantilla.
- **(8)** Catálogo de modelos generado automáticamente, con su prueba automática.
- **(9)** Todo documento sobre papel pre-impreso se imprime uno a uno o en lote, con el mismo mecanismo en todos los listados: casillas marcadas, o el filtro si no se marca ninguna.
- **(9)** Antes de imprimir en lote, aviso de cuántos documentos salen ("Se van a imprimir X pedido(s)…").
- **(10)** Las copias por cliente se construyen **dentro del PDF** (Transfrío: se pregunta, 4 por defecto). Nunca con la opción "copias" del diálogo de impresión.
- **(10)** Varias pestañas o ventanas: siempre **un clic, una pestaña**, con panel "Abrir PDF para imprimir" / "Siguiente cliente" / "Parar aquí". Nunca aperturas automáticas ni `setTimeout`.
- **(12)** Albarán sin precios y Transfrío, siempre como **dos acciones separadas**, tanto en la fila del listado como dentro del registro abierto: van a impresoras distintas.

---

## 5. Documentos que se imprimen

Lista inicial del catálogo (punto 3.9). Claude Code la completa revisando el HTML actual (pantalla "MODELOS" y las funciones que generan PDF):

| Documento | Papel | Cuándo aparece |
|---|---|---|
| Albarán con precios | Normal | Pedido |
| Albarán sin precios (conductor) | Normal | Pedido; uno, en lote o desde la fila |
| Documento de traspaso | Normal | Traspaso |
| Hoja Transfrío | Pre-impreso Transfrío | Pedido y traspaso; uno o en lote; copias por cliente |
| Hoja CMR / Carta de Porte | Pre-impreso Mouzo | Solo clientes con transportista MOZO |
| Ficha de envío Reparto Super | Normal | Reparto |
| Etiquetas (Scanfisk, QR, sueltas) | Etiqueta | Pedido, reparto, etiquetadora |
| Lista de precios (cliente) | Imagen | Listas de precios |
| Lista de precios (interna) | Imagen | Listas de precios; nunca para el cliente |

Reglas comunes:
- Registro sanitario **12.01671/C** en todo documento que va a terceros (Fase 0, punto 8). Se comprueba con una prueba automática que busque el texto en cada documento generado.
- Las partidas no salen nunca en documentos de cliente (Fase 2, punto 3).
- **Recomendación:** generar los PDF en el servidor, a partir de las plantillas centrales. Así un documento sale igual desde los dos puestos y desde cualquier navegador, y el lote y las copias por cliente se construyen en un único sitio. La pantalla solo abre el PDF, con un clic por documento.

---

## 6. Ayuda y avisos en pantalla

- Cada pantalla lleva una línea de ayuda breve, como hoy en el HTML ("Se actualiza solo…", "Escribe unas letras…").
- Cuando el servidor no responde, la pantalla lo dice claramente y no deja grabar (Fase 3, punto 6); lo escrito y aún no grabado se mantiene en pantalla para reintentar.
- Si otro puesto ha modificado el registro abierto, se avisa al grabar con el nombre de quién lo cambió (Fase 3, punto 3).

---

## 7. Verificación de esta fase

No dar la fase por cerrada hasta que:

- [ ] **Cobertura:** lista de cada pantalla y cada botón del HTML actual con su equivalente en el sistema nuevo, revisada con Víctor. Lo que se elimine a propósito queda escrito y aceptado.
- [ ] **Agilidad:** medidos con cronómetro y con Víctor/Pancho los flujos diarios (pedido completo, compra completa de un albarán, imprimir Transfrío de los pedidos de un camión, reparto, lista de precios), comparados con el HTML y el Excel. Ninguno más lento ni con más pasos.
- [ ] **Documentos iguales:** para un mismo pedido, traspaso o reparto real, cada documento del sistema nuevo comparado con el del HTML: mismos datos, mismo orden y registro sanitario correcto.
- [ ] **Papel pre-impreso real:** Transfrío y CMR impresos sobre el papel físico del transportista y revisados por Víctor. Lote de 3 clientes con 4 copias: salen en orden 1-1-1-1, 2-2-2-2, 3-3-3-3.
- [ ] **Pestañas:** el lote se imprime de principio a fin sin que el navegador bloquee ninguna pestaña.
- [ ] **Palets:** pedido con 2 palets y pedido antiguo (0) impresos por todos los caminos.
- [ ] **Autosuma y seguridad:** `12,4+8,1+6,3` da 26,8. Textos como `2*3`, `alert(1)` o `1e9` no se calculan, se avisa y no se graba nada.
- [ ] **Escapado:** un cliente de prueba llamado `<b>PRUEBA</b> "O'NEILL"` se ve tal cual en todas las pantallas y documentos, sin romper nada.
- [ ] **Doble clic:** pulsar GRABAR varias veces seguidas en pedido, traspaso, reparto y compra crea un solo registro.
- [ ] **Reparto:** abrir y grabar sin cambios 3 veces repartos con ECOMORA, "ALCAMPO" y "ALCAMPO ZARAGOZA" deja los datos idénticos.
- [ ] **Compras:** una compra hecha en pantalla da los mismos importes, partida, coste y PVP que daría el Excel (`ESPECIFICACION_COMPRAS_EXCEL.md`, punto 11).
- [ ] **Catálogo de modelos:** la prueba automática falla si se añade una plantilla sin entrada en el catálogo.
- [ ] **Uso en paralelo:** Víctor y Pancho trabajan al menos una semana real con el sistema nuevo en paralelo con el HTML, en modo prueba (Fase 3, punto 9), y apuntan todo lo que falte o moleste.
- [ ] El HTML y el Excel siguen intactos y en uso normal.
- [ ] Víctor ha revisado y aprobado las pantallas y los documentos.

---

## 8. Preguntas para Víctor antes de empezar

- [ ] ¿Qué navegador se usa en cada puesto (Chrome, Edge…)? ¿Pantallas de qué tamaño?
- [ ] ¿Qué impresoras hay, y cuál se usa para cada documento (normal, Transfrío, CMR, etiquetas)?
- [ ] ¿Alguien tendría que usar el sistema desde una tablet o un móvil (por ejemplo, en el almacén)? Si es así, ¿para qué pantallas?
- [ ] ¿Qué pantallas usa Pancho y cuáles solo Víctor? ¿Hay algo que Pancho no deba poder ver o hacer?
- [ ] ¿Cuánto tiempo sin uso antes de que se cierre la sesión?
- [ ] ¿Hay algo del HTML actual que no se use y se pueda dejar fuera?

---

*Preparado como continuación de FASE_0 a FASE_3, e incorporando los requisitos de pantalla de CORRECCIONES_2026-09-02_programa_actual.md (puntos 1-22) y de ESPECIFICACION_COMPRAS_EXCEL.md, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
