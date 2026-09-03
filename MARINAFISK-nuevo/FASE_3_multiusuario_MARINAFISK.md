# MARINAFISK — Fase 3: Multiusuario real

Este documento se entrega junto con `FASE_0_reglas_de_negocio_MARINAFISK.md`, `FASE_1_base_de_datos_backend_MARINAFISK.md` y `FASE_2_logica_de_negocio_MARINAFISK.md`, ya implementados por Claude Code.

**Instrucción para Claude Code:** revisa el estado real de las Fases 1 y 2 antes de empezar. Esta fase sustituye la sincronización actual por carpeta de red compartida ("PEDIDOS") por usuarios y permisos reales sobre la misma base de datos. No se cambia la lógica de negocio de la Fase 2, solo quién puede acceder y desde dónde.

---

## Objetivo de esta fase

Eliminar el "parche" de la carpeta compartida y sustituirlo por acceso multiusuario real y seguro: varias personas (no solo dos) trabajando sobre la misma base de datos al mismo tiempo, cada una con su propio usuario, sin los problemas de desincronización y duplicados que tiene el sistema actual (ver Fase 0, punto 6).

---

## 1. Usuarios y roles

- El sistema debe soportar **más de dos usuarios** (hoy son Víctor/CORU y Pancho/PANC, pero mañana pueden ser 3, 4, 5 o más — no diseñar nada que asuma solo dos).
- Cada usuario tiene su propio login (usuario + contraseña).
- **Modelo de permisos (simple, según indicación de Víctor):**
  - **Todos los usuarios pueden hacer lo mismo en el día a día**: registrar compras, crear albaranes, hacer traspasos, repartos, listas de precios, etc. No hay jerarquía operativa entre Víctor, Pancho y futuros usuarios.
  - **Excepción 1 — Modificar el programa**: cambios de configuración estructural del propio sistema (no del día a día operativo) quedan reservados a un rol Administrador protegido por contraseña propia. A definir con Víctor exactamente qué cuenta como "modificar el programa" (ej. dar de alta usuarios nuevos, cambiar parámetros como el margen mínimo de 1,30€/kg, activar el módulo de facturación) — pero en cualquier caso NO incluye el trabajo diario normal.
  - **Excepción 2 — Cierre de año**: la operación de cerrar el año (para poder empezar de nuevo la numeración de albaranes, facturas, etc. desde el número 1, o desde donde corresponda) es una acción especial, solo accesible al rol Administrador, porque afecta a todos los usuarios y a la numeración compartida.
- No hace falta un tercer rol intermedio por ahora — el modelo es: **Usuario estándar (todos, incluido Víctor en el día a día) + Administrador (Víctor, para las dos excepciones anteriores)**. Aun así, diseñar el sistema de permisos de forma que añadir un rol nuevo en el futuro no obligue a rehacerlo.
- Cada registro (compra, pedido, traspaso, etc.) debe guardar de forma fiable qué usuario lo creó — sustituyendo el actual campo CORU/PANC por el usuario real, sin perder la capacidad de saber "quién hizo qué".

---

## 1bis. Cierre de año y renumeración

- Debe existir una función de **Cierre de año**, solo para el rol Administrador, que permita empezar una nueva numeración de albaranes, traspasos, partidas, repartos y (cuando exista) facturas — típicamente al inicio de cada año natural, aunque debe poder ejecutarse cuando Víctor decida, no solo automáticamente el 1 de enero.
- Debe dejar claro y documentado, antes de ejecutarse, qué va a pasar (qué contadores se reinician, a qué número) y pedir confirmación explícita — es una acción sensible y no debe poder deshacerse por accidente.
- Los datos de años anteriores **no se borran ni se modifican** al hacer el cierre — solo se reinicia la numeración hacia adelante. Esto es coherente con la regla de que las compras y el histórico son datos sagrados (ver Fase 0).
- Debe quedar registrado quién hizo el cierre de año y cuándo (log de auditoría).

---

## 2. Contadores correlativos sin colisiones

- Los números de albarán, partida, reparto y traspaso deben generarse de forma que **dos usuarios trabajando a la vez nunca puedan obtener el mismo número** (causa raíz del incidente de 667 duplicados del 28/07/2026, ver Fase 0, punto 6).
- Esto se resuelve de forma nativa en una base de datos real (secuencias/autoincrementales gestionadas por la propia base de datos), pero debe probarse explícitamente: simular dos usuarios creando un albarán en el mismo segundo y confirmar que no colisionan.

---

## 3. Acceso desde varios sitios

- La base de datos debe ser accesible por todos los usuarios autorizados desde sus propios dispositivos (ordenador de Víctor, ordenador de Pancho, y los que se añadan), no solo desde el ordenador donde se instaló originalmente.
- Esto implica decidir dónde vive la base de datos de forma que todos puedan llegar a ella (servidor accesible en red, no solo en un ordenador local) — si esto no se ha resuelto ya en una fase anterior, debe resolverse aquí como requisito de esta fase.

---

## 4. Diseño preparado para el futuro (no implementar todavía, pero dejar hueco)

Víctor tiene dos ideas para más adelante que **no se implementan en esta fase**, pero el diseño de esta fase (usuarios, permisos, estructura de datos) debe dejarlas fáciles de añadir después, sin tener que rehacer el sistema de usuarios/permisos:

- **Lectura de códigos de barras / QR**: en el futuro, algún usuario podría escanear un código de barras o QR (por ejemplo de un producto o de una etiqueta) para incorporar datos rápidamente, en vez de teclear. Dejar pensado que en el futuro exista un campo tipo "código de barras/QR" asociado a artículos y/o partidas, aunque no se use todavía.
- **Etiquetas de báscula con peso**: la idea a futuro es que una báscula imprima una etiqueta simple con producto y peso, y que un usuario con un lector pueda incorporar esa etiqueta directamente a un albarán de cliente (en vez de teclear el peso a mano). Esto es una integración de hardware que se abordará en detalle en una fase futura propia — aquí basta con que el modelo de datos de partidas/albaranes no impida en el futuro añadir una línea a partir de un dato leído (producto + peso) en vez de tecleado manualmente.
- No es necesario documentar más detalle técnico de estas dos ideas ahora — solo evitar decisiones en esta fase que las bloqueen innecesariamente más adelante (por ejemplo, evitar diseños donde el peso o el producto de una línea *solo* puedan introducirse por teclado desde una pantalla concreta).

---

## 5. Requisito transversal de agilidad (recordatorio)

El login y cambio de usuario no debe convertirse en un obstáculo para la velocidad de trabajo diaria (ver Fase 1/2). Un usuario habitual debería poder entrar y ponerse a trabajar en segundos, no con un proceso largo cada vez.

---

## 6. Verificación de esta fase

No pasar a la Fase 4 hasta que:

- [ ] El modelo de permisos está implementado correctamente: todos los usuarios pueden hacer lo mismo en el día a día operativo; solo el rol Administrador puede modificar el programa y ejecutar el cierre de año.
- [ ] La función de Cierre de año existe, pide confirmación explícita, no borra ni modifica datos de años anteriores, y queda registrada (quién y cuándo).
- [ ] Se ha probado con al menos 3 usuarios simultáneos (Víctor, Pancho, y un tercero de prueba) trabajando a la vez sin colisiones de números ni pérdida de datos.
- [ ] Se ha simulado explícitamente el escenario de dos usuarios creando un albarán en el mismo instante, confirmando que no se duplica el número.
- [ ] Cada registro guarda de forma fiable qué usuario lo creó.
- [ ] El acceso funciona desde al menos dos ubicaciones/dispositivos distintos (no solo desde el ordenador original).
- [ ] Se ha revisado que el diseño no bloquea las dos ideas futuras del punto 4 (código de barras/QR, etiqueta de báscula).
- [ ] El sistema de login es rápido de usar en el día a día (ver punto 5).
- [ ] El HTML/programa actual y la carpeta compartida siguen disponibles como red de seguridad mientras se prueba esta fase.
- [ ] Víctor ha revisado y entendido, en términos sencillos, cómo funcionan los roles y qué usuario administrador tiene la contraseña de más permisos.

---

*Preparado como continuación de FASE_0, FASE_1 y FASE_2, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
