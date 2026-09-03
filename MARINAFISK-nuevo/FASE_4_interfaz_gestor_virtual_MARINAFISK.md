# MARINAFISK — Fase 4: Interfaz y gestor virtual

Este documento se entrega junto con `FASE_0_reglas_de_negocio_MARINAFISK.md`, `FASE_1_base_de_datos_backend_MARINAFISK.md`, `FASE_2_logica_de_negocio_MARINAFISK.md` y `FASE_3_multiusuario_MARINAFISK.md`, ya implementados por Claude Code.

**Instrucción obligatoria para Claude Code:** antes de escribir o modificar nada, comprueba el estado real del proyecto (qué existe ya de las fases anteriores) y revisa el HTML actual (`CARGA_DE_ALBARANES_MARINAFISK_2026-08-21-I.html`) para entender exactamente cómo funciona cada pantalla hoy. No rediseñar por rediseñar: el objetivo de esta fase es que Víctor y Pancho puedan trabajar igual o mejor que hoy, no aprender un programa nuevo desde cero. No tocar el HTML actual ni los backups — siguen siendo la referencia y la red de seguridad.

---

## Objetivo de esta fase

Construir la interfaz (pantallas) del sistema nuevo, conectada ya a la base de datos y lógica de negocio de las fases 1-3, reproduciendo los flujos de trabajo actuales del HTML y añadiendo las primeras funciones "inteligentes" del gestor virtual.

Al final de esta fase, Víctor y Pancho deben poder hacer en el sistema nuevo, con interfaz propia (no el HTML antiguo), todo el trabajo diario habitual: compras, partidas, pedidos/albaranes, listas de precios, Transfrío, Reparto Super — con igual o mayor agilidad que hoy.

---

## 1. Pantallas a reproducir (paridad con el HTML actual)

Para cada una, Claude Code debe revisar cómo funciona exactamente hoy en el HTML antes de construirla:

- **Compras** — registro de compra, con el 2% de OP aplicado automáticamente cuando corresponda (Fase 2).
- **Partidas** — asignación automática inline, pantalla de excepciones (margen no alcanzado), cierre manual y cierre masivo por fecha, vista de rentabilidad por partida (Fase 2, punto 3).
- **Pedidos/Albaranes** — creación de albaranes con y sin precios (recordar: partidas nunca visibles en la versión sin precios), etiquetas multi-idioma (Español, Francés, Italiano) con sus reglas de caducidad (7 ó 12 días según corresponda).
- **Transfrío** — impresión con la disposición de campos ya corregida (coordenadas CORUÑA/FECHA).
- **Reparto Super** — con etiquetas Scanfisk.
- **Listas de precios** — Pescaderías y Mayoristas, modo automático y manual, independientes entre sí.
- **Panel "Clientes a Contactar Hoy"** — con margen real y botón de contactado.
- **Listados de gestión** (Fase 2, punto 5bis) — ventas por cliente, compras por proveedor, rentabilidad por partida, existencias, márgenes, clientes sin actividad — con filtro por fecha y exportación.
- **Login y gestión de usuarios** (Fase 3) — pantalla de acceso, y para el rol Administrador, pantalla de alta/baja de usuarios y cierre de año.

---

## 2. Requisito de agilidad (crítico en esta fase, más que en ninguna otra)

Esta es la fase donde el requisito de agilidad (introducido en Fase 1, recordado en Fase 2 y 3) se pone a prueba de verdad, porque es la primera vez que Víctor y Pancho van a *usar* el sistema nuevo con sus manos, no solo confiar en que "por dentro" funciona bien.

- Cada pantalla debe compararse explícitamente contra el HTML actual y contra el Excel `GESTION_CORRECTA`: mismo número de clics/pasos o menos para completar la misma tarea.
- Priorizar atajos de teclado y flujos de entrada rápida (tipo hoja de cálculo) donde el HTML actual ya los tiene.
- Si alguna pantalla nueva resulta más lenta o más tediosa de usar que la actual, se considera un defecto de esta fase y debe corregirse antes de darla por cerrada — no es un detalle estético, es un requisito funcional.
- Víctor debe poder probar cada pantalla nueva con datos reales (no de prueba/ficticios) antes de darla por buena.

---

## 3. Primeras funciones del "gestor virtual" (inteligencia añadida)

Empezar solo por lo más simple y de mayor valor inmediato — no intentar todo de golpe:

- **Sugerencia de precio de venta**: al crear una lista de precios o un albarán, sugerir un precio de partida basado en el coste real de la partida asignada y el margen mínimo de 1,30€/kg (o superior si el histórico reciente de ese cliente/artículo lo permite) — como sugerencia editable, nunca imponiendo el precio.
- **Alertas de partida en riesgo**: avisar si una partida lleva abierta más tiempo del habitual sin venderse (a definir umbral con Víctor) para evitar mermas excesivas.
- **Ampliación del panel de clientes a contactar**: además del aviso diario ya existente, sugerir con qué prioridad contactar según el margen real que suele dejar ese cliente y cuánto tiempo lleva sin pedido.
- Estas funciones deben poder desactivarse o ignorarse fácilmente — son ayuda, no automatización obligatoria. Víctor y Pancho mantienen siempre el control final de cada decisión.
- Dejar explícitamente fuera de esta fase (para fases futuras a definir): previsión de demanda avanzada, integración con WhatsApp, lector de código de barras/QR y etiquetas de báscula (ya anticipados en el diseño de datos en la Fase 3, pero no se implementan aún).

---

## 4. Verificación de esta fase

No dar la fase por cerrada hasta que:

- [ ] Todas las pantallas del punto 1 existen en el sistema nuevo y reproducen fielmente el comportamiento del HTML actual.
- [ ] Víctor ha usado personalmente cada pantalla con datos reales y confirma que el resultado (documentos generados, cálculos, etiquetas) es idéntico al del sistema actual.
- [ ] Se ha hecho la comparación de agilidad de cada pantalla frente al HTML/Excel actuales, documentando cualquier caso donde el nuevo sistema sea más lento, y corrigiéndolo.
- [ ] Las funciones del gestor virtual del punto 3 están implementadas como sugerencias editables, nunca como acciones automáticas sin confirmación.
- [ ] El HTML actual sigue disponible y funcionando en paralelo como red de seguridad — no se apaga todavía.
- [ ] Víctor ha revisado y entendido, en términos sencillos, qué pantallas están listas para uso diario y cuáles (si alguna) aún no.

---

*Preparado como continuación de FASE_0, FASE_1, FASE_2 y FASE_3, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
