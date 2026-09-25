# MARINAFISK — Fase 3: Varios puestos trabajando a la vez

Este documento se entrega junto con `FASE_0_reglas_de_negocio_MARINAFISK.md`, `FASE_1_base_de_datos_backend_MARINAFISK.md`, `FASE_2_logica_de_negocio_MARINAFISK.md`, `02_ESQUEMA_BASE_DATOS_PROPUESTO.md` y `CORRECCIONES_2026-09-02_programa_actual.md`.

**Instrucción para Claude Code:** antes de escribir nada, revisa el estado real de las Fases 1 y 2 (tablas, backend, lógica de negocio, resultado de sus verificaciones) y el punto 6 de la Fase 0 (fallos de sincronización ya ocurridos). Esta fase **no añade lógica de negocio nueva ni pantallas nuevas**: hace que dos personas, cada una en su ordenador, trabajen contra la misma base de datos sin pisarse, sin duplicados y sin perder datos. Las pantallas son la Fase 4; el hosting en la nube, la Fase 5.

---

## Objetivo de esta fase

Hoy los dos puestos (**CORU** = Víctor, **PANC** = Pancho) se sincronizan copiando archivos JSON en la carpeta de red "PEDIDOS". Ese mecanismo ha causado los fallos más graves del programa actual:

- 667 números de albarán duplicados en 5 minutos (28/07/2026), por contadores desincronizados.
- Backups con datos "congelados" que omitían cientos de pedidos de un puesto.
- Altas nuevas (clientes, artículos, proveedores) que no llegaban al otro puesto.
- El mismo pedido grabado tres veces (13786, 13787, 13788 — 01/09/2026).
- Necesidad de refrescar toda la carpeta al empezar el día para que los contadores cuadren.

Al final de la Fase 3 debe poder demostrarse que:

1. Los dos puestos leen y escriben contra **una única base de datos**, sin copias locales ni cachés que puedan quedar desfasadas.
2. Ningún número (pedido, reparto, traspaso, partida) se repite ni puede repetirse, aunque los dos puestos graben en el mismo segundo.
3. Si dos personas modifican el mismo registro a la vez, ninguna pierde su cambio sin enterarse.
4. Si se corta la red o se apaga el servidor, no se pierde ni se duplica nada, y el usuario lo sabe.
5. Hay copias de seguridad automáticas y completas, y se ha probado que se pueden restaurar.

No se toca todavía: el HTML actual (sigue siendo el programa de trabajo real), el diseño de las pantallas (Fase 4) ni el alojamiento en la nube (Fase 5).

---

## 1. Dónde vive la base de datos y cómo se conecta cada puesto

- Un único servidor (PostgreSQL + backend) en la red de la oficina. Los dos puestos se conectan a él por la red local; ninguno guarda datos propios.
- **Recomendación:** que el servidor esté en un ordenador que esté siempre encendido en horario de trabajo. Si está en el ordenador de Víctor y ese ordenador se apaga, se reinicia o se actualiza, Pancho no puede trabajar. Opciones, de más a menos recomendable: un mini-PC dedicado, el ordenador de Víctor (aceptando esa dependencia), o adelantar el hosting en la nube (Fase 5). **Lo decide Víctor** (ver punto 10).
- **Seguridad mínima, ya en esta fase:**
  - El backend solo acepta conexiones desde la red local. **No se abre ningún puerto a internet** en esta fase.
  - La base de datos no es accesible directamente desde los puestos: solo el backend habla con ella.
  - Cada persona entra con su propio usuario y contraseña (tabla `usuarios`, contraseñas guardadas con hash, nunca en claro). No hay usuario compartido.
  - Las credenciales de la base de datos van en un archivo de configuración fuera del código, que **no se sube al repositorio** (igual que ya se hace con los backups JSON en `.gitignore`).
- **`puesto_origen`** deja de ser una etiqueta que escribe cada programa: lo asigna el backend a partir del usuario que ha iniciado sesión. Así no puede quedar mal puesto ni vacío.

---

## 2. Numeración correlativa sin duplicados

- Cada número de negocio (pedido/albarán, reparto, traspaso, partida) se asigna **en el servidor, dentro de la misma transacción que crea el registro**. La pantalla nunca calcula ni propone el siguiente número.
- **Recomendación:** usar una tabla de contadores bloqueada durante la transacción (`SELECT … FOR UPDATE`), no las secuencias automáticas de PostgreSQL. Las secuencias no repiten números, pero **dejan huecos** si una grabación falla a medias; con la tabla de contadores, una grabación fallida no gasta número. Confirmar con Víctor si un hueco en la numeración de albaranes es aceptable (ver punto 10).
- `numero` sigue siendo `UNIQUE` en cada tabla: aunque hubiera un error de programación, la base de datos rechazaría un duplicado en vez de guardarlo.
- La protección contra doble clic (clave de idempotencia, Fase 1 punto 3bis) se comprueba aquí con los dos puestos a la vez, no solo con uno.

---

## 3. Dos personas tocando lo mismo a la vez

Hoy, si los dos puestos modifican el mismo registro, gana el último que grabó (desempate por `_modTimestamp`) y el otro cambio se pierde sin aviso. En el sistema nuevo:

- **Modificar un registro:** cada registro modificable lleva una columna `version` (número que sube en cada grabación). Al grabar, la pantalla envía la versión que leyó; si en la base de datos ya hay otra más nueva, el backend **rechaza** la grabación y devuelve el registro actual, con un mensaje claro ("Pancho ha modificado este pedido mientras lo tenías abierto"). Nunca se sobrescribe en silencio.
- **Asignar kilos de una misma partida:** si los dos puestos asignan kilos de la misma partida a la vez, la asignación se hace en una transacción que bloquea esa partida, para que los kilos disponibles se calculen siempre sobre el dato real y no se asigne dos veces lo mismo. Si la partida ya no tiene kilos suficientes, la línea pasa a revisión manual (regla de la Fase 2), no se deja en negativo sin aviso.
- **Cerrar una partida mientras otro le asigna kilos:** mismo bloqueo; la segunda operación ve la partida ya cerrada y la trata como no disponible.
- **Compras:** siguen siendo inmutables (Fase 1), así que no hay conflicto posible de edición.
- **Altas de clientes, artículos y proveedores:** al estar en una sola base de datos, un alta en un puesto existe para el otro en el mismo momento. Si los dos dan de alta el mismo código a la vez, el `UNIQUE` de `codigo` hace que el segundo reciba un error claro, no un duplicado.

---

## 4. Ver siempre el mismo estado, sin refrescar

- Toda lectura sale de la base de datos en el momento. **No hay cachés de datos en los puestos** (ni `localStorage`, ni archivos, ni copias en memoria que duren más que la pantalla abierta).
- El backend ofrece una forma sencilla de saber qué ha cambiado desde una hora dada (por ejemplo, un endpoint "cambios desde"), para que la Fase 4 pueda actualizar listados abiertos cada pocos segundos o al volver a la ventana. Cómo se muestra es trabajo de la Fase 4; aquí basta con que el dato esté disponible y sea correcto.
- **Criterio (corrección 2 del 02/09/2026):** dos usuarios que abren sesión a la vez ven siempre los mismos contadores y el mismo estado **sin ningún refresco manual ni automático "por la mañana"**. Si para que cuadren hiciera falta refrescar algo, es un defecto de esta fase.

---

## 5. Fecha y hora

- La fecha "de hoy" y las horas de creación/modificación las pone **el servidor**, en hora de España (`Europe/Madrid`), de forma centralizada (Fase 0, punto 7). No se usa el reloj de cada ordenador: si el reloj de un puesto va mal, no debe cambiar la fecha de un albarán.
- Probar explícitamente un pedido grabado entre las 00:00 y la 01:00 (y entre las 00:00 y las 02:00 en horario de verano): debe quedar con la fecha del día nuevo, no la del anterior.

---

## 6. Cortes de red y servidor apagado

- **Recomendación: no hay modo "sin conexión".** Trabajar sin conexión y sincronizar después es exactamente lo que hoy causa los fallos de la carpeta compartida. Si el servidor no responde, la pantalla lo dice claramente y no deja grabar.
- Si la red se corta **mientras** se graba, el usuario no sabe si se guardó o no. Por eso la clave de idempotencia (Fase 1): al volver la red, reintentar la misma grabación devuelve el registro ya creado si llegó a crearse, o lo crea si no. Nunca dos.
- Una grabación es todo o nada: un pedido no puede quedar con la cabecera guardada y la mitad de las líneas (transacción única).
- Qué hacer mientras el servidor esté caído (seguir con el HTML, esperar, apuntar en papel) es una decisión de Víctor (ver punto 10), y debe quedar escrita antes de dejar de usar el HTML.

---

## 7. Copias de seguridad

Lección de la Fase 0: un backup que lee cachés o datos parciales no sirve. En el sistema nuevo:

- Copia automática **diaria** de la base de datos completa (`pg_dump`), más la exportación JSON de la Fase 1 para poder compararla con los backups del programa actual.
- Las copias se guardan **fuera del ordenador del servidor** (otro ordenador, disco externo o almacenamiento en la nube cifrado). Una copia en el mismo disco no protege si ese disco falla.
- Se conservan al menos 30 copias diarias y 12 mensuales (a confirmar con Víctor).
- Cada copia comprueba al terminar que contiene lo esperado: número de registros por tabla y **por puesto** (CORU y PANC) igual al de la base de datos en ese momento. Si no cuadra, avisa.
- **Restaurar se prueba de verdad**, al menos una vez en esta fase: restaurar una copia en una base de datos aparte y comprobar que los recuentos y una muestra de registros coinciden.

---

## 8. Registro de quién hizo qué

- El log básico de la Fase 1 se amplía con **usuario y puesto**: quién creó, modificó o borró cada registro, cuándo, y qué valores tenía antes y después.
- El log no se puede modificar desde el backend (solo añadir), igual que las compras.
- Sirve para responder, sin adivinar, preguntas como "¿quién cambió este pedido?" o "¿por qué hay tres pedidos iguales?".

---

## 9. Convivencia con el programa HTML durante esta fase

El HTML sigue siendo el programa de trabajo real. El sistema nuevo se prueba en paralelo, sin riesgo para los datos reales:

- El sistema nuevo **nunca escribe en la carpeta compartida "PEDIDOS"** ni en ningún archivo que use el HTML. Solo puede leerla, si se decide importar desde ella.
- Los datos reales entran en el sistema nuevo volviendo a ejecutar la migración de la Fase 1 con un backup reciente, las veces que haga falta. Todo lo que se grabe en el sistema nuevo durante las pruebas es de prueba.
- Los números que asigne el sistema nuevo durante las pruebas **no son números reales de albarán** y no deben usarse en ningún documento que salga a un cliente o transportista. Las pruebas se marcan como tales (base de datos de pruebas separada, o prefijo claramente distinto).
- El paso definitivo del HTML al sistema nuevo (con qué número arranca cada contador, qué día se deja de grabar en el HTML) **no se hace en esta fase**: se planifica aparte, con Víctor, cuando las Fases 3 y 4 estén cerradas.

---

## 10. Preguntas para Víctor antes de cerrar la fase

- [ ] ¿Los dos puestos están en la misma oficina/red local? Si Pancho trabaja desde otro sitio, hace falta una conexión segura (VPN) o adelantar la Fase 5 — **no** abrir el servidor a internet.
- [ ] ¿Dónde va el servidor: mini-PC dedicado, ordenador de Víctor, o nube (punto 1)?
- [ ] ¿Es aceptable un hueco en la numeración de albaranes si una grabación falla, o tiene que ser estrictamente seguida (punto 2)?
- [ ] Si el servidor no está disponible, ¿qué se hace (punto 6)?
- [ ] ¿Dónde se guardan las copias de seguridad fuera del servidor, y cuánto tiempo (punto 7)?
- [ ] ¿Qué usuarios hacen falta (Víctor, Pancho, alguien más) y si alguno debe tener permisos limitados (por ejemplo, no poder cerrar partidas)?

---

## 11. Requisito transversal de agilidad

Sigue aplicando (Fases 1 y 2): trabajar desde cualquiera de los dos puestos no puede ser más lento que hoy. Medir el tiempo de grabar un pedido, abrir el historial y buscar un artículo desde el puesto que **no** tiene el servidor, y compararlo con el HTML actual. Si es más lento, es un defecto de esta fase.

---

## 12. Verificación de esta fase

No pasar a la Fase 4 hasta que:

- [ ] **Dos puestos grabando a la vez:** dos personas (o dos scripts, uno por ordenador) graban pedidos, repartos y traspasos a la vez durante 5 minutos seguidos, a ritmo rápido. Resultado: cero números repetidos, cero saltos inesperados, y el número de registros coincide con las grabaciones hechas. (Reproduce el incidente del 28/07/2026.)
- [ ] **Doble envío:** la misma petición de grabar enviada 2–3 veces seguidas y en paralelo, desde uno y desde los dos puestos, crea **un único registro**. Reproducir el caso de los pedidos 13786/13787/13788 del 01/09/2026.
- [ ] **Mismo estado sin refrescar:** tras grabar en un puesto, el otro ve el registro nuevo y el mismo contador siguiente, sin refresco manual ni "de la mañana".
- [ ] **Edición a la vez:** dos puestos abren el mismo pedido, los dos lo modifican; el segundo en grabar recibe el aviso y ningún cambio se pierde en silencio.
- [ ] **Partida a la vez:** dos puestos asignan kilos de la misma partida a la vez; los kilos disponibles quedan correctos y nunca se asigna dos veces lo mismo.
- [ ] **Alta a la vez:** los dos puestos dan de alta el mismo código de cliente a la vez; queda uno solo y el otro recibe un error claro.
- [ ] **Corte de red:** se corta la red a mitad de una grabación y se reintenta: queda un registro, completo, no dos ni uno a medias.
- [ ] **Fecha:** un pedido grabado después de medianoche queda con la fecha del día nuevo, aunque el reloj del puesto esté mal.
- [ ] **Backup:** la copia automática se ha ejecutado, contiene los mismos recuentos por tabla y por puesto que la base de datos, y **se ha restaurado** con éxito en una base de datos aparte.
- [ ] **Seguridad:** el backend no responde desde fuera de la red local; la base de datos no acepta conexiones directas desde los puestos; no hay contraseñas en el código ni en el repositorio.
- [ ] **Log:** para un registro modificado desde los dos puestos se puede ver quién hizo cada cambio y cuándo.
- [ ] Comparación de agilidad frente al HTML actual realizada y documentada (punto 11).
- [ ] El HTML/programa actual sigue intacto y en uso normal, y el sistema nuevo no ha escrito nada en la carpeta compartida.
- [ ] Las preguntas del punto 10 están respondidas por Víctor.
- [ ] Víctor ha revisado y entendido, en términos sencillos, qué se ha construido y qué queda para la Fase 4.

---

## Cambios de esquema que pide esta fase

Siguiendo la regla de la Fase 2 (no cambiar el esquema sin documentarlo y volver a verificar la migración):

- Tabla `usuarios`: `id, nombre, usuario (unique), hash_contrasena, puesto (CORU|PANC), activo, creado_en`.
- Columna `version` en cada tabla modificable (no en `compras` ni `compra_lineas`, que son inmutables).
- Tabla `contadores`: `tipo (PEDIDO|REPARTO|TRASPASO|PARTIDA), siguiente`.
- Log de auditoría ampliado con `usuario_id` y `puesto`.

Después de añadirlos, repetir la verificación de migración de la Fase 1.

---

*Preparado como continuación de FASE_0, FASE_1 y FASE_2, e incorporando los puntos 1 y 2 de CORRECCIONES_2026-09-02_programa_actual.md, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
