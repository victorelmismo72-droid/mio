# MARINAFISK — Fase 3: multiusuario real (estado y verificación)

Construido sobre la Fase 1 y 2 ya verificadas. Cambios de esquema: tablas nuevas `usuarios`, `sesiones`, `cierres_anuales`; y en `pedidos`/`traspasos`/`repartos` se ha añadido una columna `anio` y se ha cambiado la restricción de unicidad de `numero` (global) a `(anio, numero)` — ver punto 3 más abajo, es importante.

## 1. Usuarios y roles

Modelo tal y como pide la Fase 3: **Usuario estándar** (todos, día a día) + **Administrador** (dos excepciones: modificar el programa, y cierre de año). Sin jerarquía operativa entre usuarios estándar.

- Login: `POST /api/auth/login` con usuario/contraseña, devuelve un token. Todo el resto de la API exige ese token (`Authorization: Bearer ...`) — probado: sin token, `401`.
- Sesión de 30 días (Fase 3 punto 5: el login no debe ser un obstáculo diario — con eso basta para no tener que volver a escribir la contraseña cada día).
- Contraseñas con `bcrypt` (nunca en texto plano ni en los logs).
- Gestión de usuarios (`GET/POST/PUT /api/usuarios`) exclusiva del rol Administrador — probado: un usuario estándar (`pancho`, de prueba) recibe `403` al intentar verla o modificarla, pero **sí puede** crear un pedido normal del día a día (probado: `numero` correcto, `puesto_origen` correcto).
- Los usuarios nunca se borran de verdad (solo `activo = false`), para no perder de quién es cada registro histórico.
- **`puesto_origen`** (el campo que en el HTML actual guardaba `CORU`/`PANC`) ahora se rellena siempre con el usuario real autenticado, y **nunca** con lo que mande el cliente de la petición — así se cumple de forma fiable "cada registro guarda qué usuario lo creó" (Fase 3 punto 1).

## 2. Cierre de año

`GET /api/cierre-anual/vista-previa` (Administrador) muestra qué va a pasar antes de ejecutarlo — contadores actuales y los que quedarían después — sin tocar nada. `POST /api/cierre-anual` exige `confirmacion: true` explícito (sin eso, error 400) y reinicia las secuencias de pedido/partida/traspaso/reparto a 1. Queda registrado quién lo ejecutó y cuándo, y los contadores antes/después, en `cierres_anuales`.

Probado end-to-end: vista previa → cierre confirmado → contadores en 1 → un pedido nuevo fechado en el año siguiente recibe `numero=1` correctamente → los datos de años anteriores siguen exactamente igual (verificado contra el backup real, 0 discrepancias tras deshacer la prueba).

## 3. Contadores sin colisión — corrección importante encontrada en esta fase

Al construir la Fase 3 se encontró que **la Fase 1/2 dejaban un hueco real**: los endpoints de pedidos, traspasos y repartos esperaban que el número lo mandara el cliente (correcto para probar CRUD puro en Fase 1, pero exactamente el fallo que causó los 667 duplicados históricos si se hubiera usado así en producción — ver Fase 0 punto 6). Corregido en esta fase:

- Si no se manda `numero`, el servidor lo genera con una secuencia real de PostgreSQL (`nextval`) — nunca un contador llevado por el cliente.
- **Probado con concurrencia real**: 15 peticiones de creación de pedido lanzadas a la vez (`curl ... &` en paralelo, sin esperar respuesta antes de lanzar la siguiente) — resultado: 15 números distintos, cero duplicados.

Esto además obligó a corregir un problema de diseño: si `numero` fuera único *globalmente* (como estaba en la Fase 1), el cierre de año no podría reiniciar a 1 sin chocar con los números ya usados en años anteriores. Se ha añadido una columna `anio` (calculada siempre a partir de `fecha` en texto local, nunca con conversión UTC — ver Fase 0 punto 7) y la restricción de unicidad ahora es `(anio, numero)`. Con datos reales, todo tu histórico de 2026 se ha recalculado a `anio=2026` automáticamente y sigue siendo único; un pedido nuevo en 2027 puede volver a usar el número 1 sin conflicto.

**Límite conocido, no bloqueante:** el número de partida (`numero_partida` en `compras`) sigue sin restricción de unicidad a nivel de base de datos (ya había duplicados en el histórico real antes de este sistema, ver `VERIFICACION_FASE_1.md`), así que un cierre de año no lo protege de la misma manera. No se ha forzado unicidad ahí porque haría fallar la migración de datos reales ya existentes.

## 4. Verificación de agilidad del login

Login: usuario + contraseña + un clic, sesión de 30 días. No hay pasos intermedios ni pantallas de por medio.

## 5. Qué falta para cerrar la Fase 3 del todo

- **Víctor debe ejecutar `npm run crear-admin` con su propio usuario y contraseña reales** en el despliegue definitivo — el usuario `victor` que existe en esta base de datos de pruebas se creó con una contraseña de prueba (`claveDePrueba123`), solo para poder probar el flujo; no debe usarse tal cual en producción.
- Probar con 3 usuarios simultáneos de verdad (aquí se ha probado con 2 roles distintos + 15 peticiones concurrentes bajo el mismo usuario — cubre la colisión de números, pero no un tercer humano real a la vez).
- Acceso desde al menos dos ubicaciones/dispositivos distintos — pendiente de que la base de datos esté desplegada en la VPN de la empresa (fuera del alcance de esta sesión de pruebas, que vive en un contenedor temporal).
- Código de barras/QR y etiquetas de báscula (Fase 3 punto 4): no se ha añadido ningún campo nuevo para esto todavía, pero tampoco hay ninguna decisión tomada en esta fase que lo bloquee — sigue abierto para cuando se aborde.
