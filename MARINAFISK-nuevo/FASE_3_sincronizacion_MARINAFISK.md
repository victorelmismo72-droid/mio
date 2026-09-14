# MARINAFISK — Fase 3: Sincronización entre puestos

Este documento no lo ha escrito Víctor de antemano (a diferencia de Fase 0/1/2) — se redacta aquí mismo, reuniendo todo lo que los documentos anteriores ya habían dejado pendiente para esta fase, antes de construirla:

- FASE_0, punto 6: verificar que los fallos históricos de sincronización (contadores duplicados, backups con caché) no pueden repetirse con la base de datos nueva.
- FASE_0, punto 6 (nota añadida el 14/09): verificar que dos puestos que abren sesión a la vez ven siempre los mismos contadores y el mismo estado, sin refresco manual.
- FASE_1, punto 3: el log de escrituras existe "para depurar problemas de sincronización más adelante, en la Fase 3".
- `02_ESQUEMA_BASE_DATOS_PROPUESTO.md`: "la sincronización entre puestos deja de ser 'archivos JSON en carpeta de red' y pasa a ser la propia base de datos compartida... esto elimina de raíz la clase de fallos de sync descritos en el punto 6 de Fase 0".
- `CORRECCIONES_2026-09-02_HTML_actual_MARINAFISK.md`, punto 2: mismo requisito, con más detalle.

**Instrucción para Claude Code:** antes de escribir nada, revisar el estado real de la Fase 1 y Fase 2 (backend, esquema, verificaciones ya hechas). Esta fase NO repite trabajo de las anteriores — se apoya en que compras/pedidos ya son correctos y en que el guardado duplicado ya está resuelto a nivel de servidor (Fase 1, corrección 02/09/2026 punto 1). Lo que añade esta fase es específicamente lo que hace falta para que **dos ordenadores (CORU y PANC) usen el mismo sistema a la vez** sin pisarse.

---

## 0. Por qué esta fase es más corta de lo que parece

Con Fase 1 y Fase 2 ya construidas, la mayor parte del problema de sincronización que sufre el programa actual **ya no existe por diseño**: no hay archivos JSON por puesto que sincronizar, hay una única base de datos PostgreSQL compartida, y los números de pedido/compra/reparto/traspaso los genera la propia base de datos con `SEQUENCE` (que garantiza que nunca se repiten, ni siquiera con muchas peticiones a la vez — a diferencia de un contador en `localStorage`).

Lo que de verdad falta para que esto funcione con Víctor en un ordenador y Pancho en otro no es "sincronizar dos copias de los datos" (eso ya no aplica), sino tres cosas muy concretas:

1. Que **ambos ordenadores hablen con el mismo backend** (no que cada uno tenga su propio backend/base de datos local, que sería volver a tener dos copias).
2. Que cada peticón sepa **de qué puesto viene** (CORU/PANC), para los campos `puesto_id` y para el log de escrituras — sustituyendo al `_uid` con el nombre de puesto metido a mano en un texto libre.
3. Tener **una copia de seguridad real** de la base de datos compartida (sustituye al concepto de "backup de la carpeta compartida").

Y, además, **demostrar con una prueba de verdad** (no solo con la teoría) que dos puestos escribiendo al mismo tiempo no generan números duplicados ni pisan datos — porque eso es precisamente lo que falló en el pasado (667 duplicados el 28/07/2026, ver FASE_0 punto 6).

---

## 1. Arquitectura: un solo backend compartido, no uno por ordenador

**Decisión de esta fase:** PostgreSQL y el backend (Node/Express de la Fase 1) se instalan y arrancan en **un solo ordenador** (el que Víctor decida — puede ser el suyo de A Coruña). El otro puesto (Pancho) **no instala su propio PostgreSQL ni su propio backend** — su futura pantalla (Fase 4) se conecta por la red local a ese único backend, igual que un navegador se conecta a una página web.

Esto es distinto de cómo funciona hoy el programa (cada ordenador tiene su propia copia en `localStorage`, sincronizada por archivos). Con la base de datos nueva, **solo existe una copia de los datos**, así que no hace falta sincronizar nada entre ellas — solo hace falta que los dos ordenadores puedan llegar hasta esa copia.

Para que el ordenador de Pancho pueda conectarse:
- El backend ya escucha en todas las interfaces de red del ordenador donde corre (no solo en `localhost`), así que basta con usar la IP de ese ordenador en la red local (p.ej. `http://192.168.1.XX:3001`) en vez de `http://localhost:3001`.
- PostgreSQL **no** necesita aceptar conexiones desde otros ordenadores — solo el backend habla con PostgreSQL, y el backend vive en el mismo ordenador que PostgreSQL. El ordenador de Pancho solo necesita llegar al backend (puerto 3001), nunca a la base de datos directamente (puerto 5432 puede seguir cerrado a la red).
- Si el ordenador "servidor" se apaga, el sistema no funciona para nadie — es una limitación real a tener en cuenta (ver punto 6, "qué no resuelve esta fase").

---

## 2. Identificar el puesto de origen en cada petición

Hoy el `_uid` de cada registro lleva metido el nombre del puesto (p.ej. `CORU`), tomado de un texto libre que cada operario escribe una vez en su ordenador (`cambiarNombreDeEstePuesto()`). El esquema nuevo (Fase 1) ya sustituyó eso por una tabla `puestos` controlada (`CORU`, `PANC`), pero hasta ahora la API esperaba que quien llama ya supiera el `id` numérico del puesto.

**Añadido en esta fase:** un pequeño middleware que identifica el puesto de origen de cada petición a partir de una cabecera HTTP sencilla, `X-Puesto-Codigo: CORU` (o `PANC`), en vez de tener que mandar el `id` interno. Si la petición no trae esa cabecera, sigue funcionando igual que antes (el campo queda sin puesto, como hasta ahora) — no es obligatorio, es una comodidad para cuando exista la Fase 4.

---

## 3. Prueba real de concurrencia (no solo teoría)

Esto es el corazón de esta fase, y lo que de verdad hay que demostrar por escrito (como pide FASE_0): simular a CORU y PANC escribiendo pedidos y compras **al mismo tiempo, de verdad, con peticiones en paralelo**, y comprobar que:

- Ningún número de pedido/compra/reparto/traspaso se repite ni se salta.
- Todos los registros creados por ambos "puestos" simulados aparecen correctamente, con su `puesto_id` correcto.
- Ninguna petición se pierde ni se cuela dos veces (reutilizando la protección de guardado duplicado de Fase 1).
- No hace falta ningún refresco manual: en cuanto un puesto graba algo, el otro lo ve inmediatamente si pregunta (trivial con una única base de datos, pero se prueba igualmente porque es justo la garantía que fallaba antes).

## 4. Copia de seguridad real de la base de datos

Sustituye al concepto de "backup de la carpeta compartida" (que en el programa actual a veces se generó con datos incompletos por usar cachés — ver FASE_0 punto 6, "un fallo pasado hizo que backups se generaran con datos congelados"). Con PostgreSQL, una copia de seguridad siempre lee el estado real y completo en el momento de hacerla (no hay caché de por medio) — se usa la herramienta estándar de PostgreSQL (`pg_dump`), no un mecanismo hecho a mano.

## 5. Qué NO resuelve esta fase (a propósito)

- **No** hay usuarios/contraseñas todavía — cualquiera que llegue al backend por la red puede usar la API tal cual. Para dos ordenadores dentro de la misma red local de confianza (como es el caso hoy) esto es aceptable como paso intermedio, pero **antes de exponer esto a Internet (Fase 5, hosting en la nube) hace falta añadir autenticación real** — no se debe saltar ese paso.
- **No** resuelve qué pasa si el ordenador que hace de servidor se apaga o se estropea — eso es una decisión de infraestructura (¿un ordenador dedicado? ¿la nube ya en Fase 5?) que Víctor debe valorar, esta fase solo dejarlo explícitamente señalado, no decidido en su lugar.
- **No** construye ninguna pantalla — sigue sin haber interfaz (Fase 4).

---

## 6. Verificación de esta fase

No pasar a la Fase 4 hasta que:

- [x] El backend acepta peticiones desde otro ordenador de la misma red local (no solo desde `localhost`), probado de verdad, no solo revisando la configuración. Ver `VERIFICACION_FASE3_2026-09-14.md`, punto 1.
- [x] La prueba de concurrencia real (punto 3) se ha ejecutado y no aparece ningún número duplicado ni salteado, con los datos reales migrados como base. Ver `VERIFICACION_FASE3_CONCURRENCIA_2026-09-14.md`: 100 pedidos + 100 compras creados en paralelo de verdad, 0 duplicados, 0 huecos; 25 peticiones simultáneas con el mismo uid → exactamente 1 registro creado.
- [x] Existe un procedimiento de copia de seguridad real de la base de datos (`pg_dump`), probado (se genera una copia y se restaura en una base de datos de prueba para comprobar que sirve de verdad). Ver `VERIFICACION_FASE3_2026-09-14.md`, punto 4 — incluida la comprobación de que la inmutabilidad de compras sobrevive a la restauración.
- [x] El campo de puesto de origen (`X-Puesto-Codigo`) funciona y queda registrado correctamente en `puesto_id` y en `log_escrituras`. Ver `VERIFICACION_FASE3_2026-09-14.md`, punto 2.
- [x] Documentado explícitamente, para que Víctor lo entienda sin tecnicismos: dónde debe vivir el backend/base de datos (un ordenador concreto), qué pasa si ese ordenador se apaga, y que todavía no hay usuarios/contraseñas (aceptable por ahora, pero no antes de salir a Internet). Ver punto 1 y punto 5 de este documento, y `backend/README.md`.
- [x] El HTML/programa actual sigue intacto y en uso normal, en paralelo — no se ha tocado.
- [ ] Víctor ha revisado y entendido, en términos sencillos, qué se ha construido y ha decidido en qué ordenador concreto va a vivir el backend + PostgreSQL — pendiente de que Víctor lo revise y decida.

---

*Preparado como continuación de FASE_0/1/2, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code. A diferencia de los documentos anteriores, este lo ha redactado Claude Code a partir de lo que Fase 0/1/2 ya dejaban pendiente — conviene que Víctor lo revise antes de considerarlo definitivo.*
