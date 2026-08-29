# MARINAFISK — Verificación transversal (informe para Víctor)

Este documento responde punto por punto al documento de auditoría que Víctor envió (`VERIFICACION_TRANSVERSAL_MARINAFISK.md`), antes de avanzar a la Fase 5. Se actualiza según se van comprobando más puntos — **no está completo todavía**, y no se avanza a la Fase 5 hasta que Víctor lo revise.

Leyenda: ✅ comprobado y coincide · ⚠️ diferencia encontrada (se explica cuál) · ⏳ no comprobado todavía (se explica por qué) · 🙋 necesita que Víctor lo haga él mismo (no se puede desde este entorno).

## 1. Listados y documentos de salida

- ⏳ Totales de los listados (ventas por cliente, compras por proveedor, rentabilidad, stock, márgenes, sin actividad) calculados a mano desde el HTML actual para el mismo periodo — no se ha hecho todavía el cálculo manual comparativo; lo ya verificado hasta ahora (Fase 1/2) fue contra el backup migrado, no contra un cálculo manual independiente.
- ⏳ Filtro de fecha con 3 rangos que crucen fin de mes y fin de año — probado el filtro en general (Fase 4), pero no específicamente con rangos que crucen fin de año.
- ✅ Exportación CSV: probada repetidamente (Fase 2/4), los números coinciden con lo mostrado en pantalla.
- ⏳ Exportación PDF de listados: no existe todavía (solo CSV/JSON).

## 2. Etiquetas e impresión

- ✅ **Etiquetas Reparto Super (Scanfisk)** (29/08/2026): construidas y probadas contra un reparto real. Reproduce exactamente el motor `MarinaFiskEtiquetas` del HTML actual — mismo CSS de etiqueta térmica 50×145mm, misma rejilla de datos, mismo sello sanitario (imagen real, extraída tal cual del HTML actual), mismo QR, una etiqueta por caja. Ver captura enviada.
- ✅ **Registro sanitario**: comprobado que el sello (imagen real) lleva "12.01671/C" y el campo RSI del expedidor lleva "Nº R.S.I.: 12.08586/C" — son dos números distintos y correctos para dos contextos distintos (registro sanitario de Marina Fisk/Scanfisk vs. RSI de la lonja expedidora), no un error. No se ha encontrado el error tipográfico histórico "12.016171/C" en ningún sitio.
- ✅ **Caducidad por defecto (7 días)**: probado con una fecha real (29/08/2026 → caduca 05/09/2026) — coincide.
- ✅ **Caducidad Francia/Pomona (12 días)** (29/08/2026): probado contra un pedido real de POMONA - (TERRE AZUR) (cliente 50262, único cliente real con este formato) — fecha 02/06/2026 → caduca 14/06/2026, exactamente +12 días.
- ✅ **Etiquetas multi-idioma (Francés/Italiano)** (29/08/2026): construidas y probadas contra pedidos reales de los clientes que de verdad tienen cada formato — POMONA (francés) y Altida Trade (italiano), los únicos clientes reales con esos formatos migrados. Traducciones de campo (zona/destinatario/modo de conservación/etc.) y nombre de producto (`nombre_frances`/`nombre_italiano` del artículo) verificados campo a campo contra el HTML. De regalo, también construidos y probados los otros dos formatos de cliente especiales que existían en el HTML actual (Más y Más con su propio sello, David Sala con su propio expedidor/RSI) — cada uno contra un pedido real de su único cliente migrado con ese formato.
- ✅/🙋 **Transfrío** (29/08/2026): construido con jsPDF (mismo mecanismo que el HTML actual), mismas coordenadas por defecto, modo regla de calibración incluido. Probado extrayendo el texto del PDF generado — todos los datos (lugar, fecha con mes en español, cliente, bultos, kg) en su sitio y correctos. La posición exacta sobre el papel físico (que es lo que de verdad importa aquí, ya que se imprime encima de un papel ya impreso) solo la puede confirmar Víctor con impresora real — puede necesitar un ajuste fino de milímetros la primera vez.
- ✅ **Ficha de envío / hoja de ruta de Reparto Super** (29/08/2026): construida y probada contra un reparto real (ECOMORA, nº 80) — mismo contenido que el HTML actual (cabecera, destinatario, tabla, totales), como página HTML lista para imprimir en vez de PDF.
- ✅ **Albarán con precios vs. sin precios**: ya verificado en Fase 4 (vista interna vs. vista cliente en `pedidos.html`) — la vista cliente nunca muestra partida, coste ni margen.
- 🙋 **Impresión física real** (en la impresora que se usa a diario): no se puede probar desde este entorno — hace falta que Víctor lo pruebe él mismo con la pantalla ya construida.

## 3. Cálculos económicos

- ✅ **2% de OP**: verificado en Fase 2 con datos de prueba controlados (no 5 compras reales concretas todavía) — fórmula confirmada correcta.
- ✅ **Margen y partidas**: verificado en Fase 2/4 con datos reales (partida 5900, partida compartida entre compras del mismo proveedor/día).
- ✅ **Rentabilidad por partida**: verificado contra el dato migrado (partida 5900).
- ✅ **IVA Nacional vs. Intracomunitario**: verificado explícitamente en Fase 2 con datos de prueba (tabla comparativa en `VERIFICACION_FASE_2.md`).
- ⏳ Falta repetir estas comprobaciones con 5 compras **reales** concretas señaladas por Víctor (no datos de prueba), y con un día completo de ventas reales revisado línea a línea contra el HTML.

## 4. Sincronización y multiusuario

- ✅ Cada registro nuevo (compra/pedido/traspaso/reparto) guarda de forma fiable qué usuario lo creó (`puesto_origen`, siempre el usuario autenticado, nunca lo que mande el navegador).
- ✅ Números de documento sin colisión: se generan con secuencias reales de PostgreSQL (no un contador de JavaScript), que son atómicas por diseño — dos guardados simultáneos nunca pueden obtener el mismo número.
- 🙋 **Pancho y Víctor conectados a la vez, creando un pedido en el mismo minuto**: no se puede simular de forma realista desde este entorno (hace falta un segundo usuario real); lo que sí está garantizado por diseño (secuencias atómicas) se explica arriba, pero la prueba con las dos personas reales queda pendiente.
- ⏳ Permisos ESTÁNDAR vs. ADMINISTRADOR: construidos (Fase 3) pero no re-verificados en esta pasada.

## 5. Agilidad

- 🙋 **Cronometrar con Víctor haciéndolo él mismo**: no se puede hacer desde este entorno — Víctor no puede instalar/ejecutar el programa por su cuenta todavía; esto requiere una sesión con él usando la pantalla real.
- ✅ Un fallo real de agilidad (pérdida de foco al escribir, ver Fase 4 punto 2) se encontró y se corrigió antes de que llegara a verse.

## Qué sigue

Por petición explícita de Víctor ("etiquetas superior, repartos superior y Zaragoza"), el orden de trabajo actual es: Reparto Super y Traspasos (ya construidos), etiquetas Scanfisk (ya construidas y probadas), y a continuación etiquetas multi-idioma, Transfrío, y el resto de puntos ⏳ de este documento.
