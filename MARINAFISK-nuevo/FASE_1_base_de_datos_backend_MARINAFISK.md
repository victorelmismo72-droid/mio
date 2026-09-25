# MARINAFISK — Fase 1: Base de datos y backend mínimo

Este documento se entrega junto con `FASE_0_reglas_de_negocio_MARINAFISK.md`, el backup JSON más reciente, y el archivo `CARGA_DE_ALBARANES_MARINAFISK_2026-08-21-I.html` (versión de referencia actual del programa).

**Instrucción para Claude Code:** antes de escribir nada, lee primero el documento de Fase 0 y el .html actual para entender el negocio y las estructuras de datos reales. Esta fase NO debe implementar lógica de negocio (partidas, márgenes, 2% OP, IVA) — solo la capa de almacenamiento y acceso a datos. Eso es la Fase 2.

---

## Objetivo de esta fase

Sustituir `localStorage` por una base de datos real, sin cambiar todavía cómo funciona el programa por dentro. Al final de la Fase 1 debe poder demostrarse que:

1. La base de datos tiene una tabla por cada tipo de dato que hoy vive en localStorage.
2. Existe un backend mínimo (API) que sabe leer y escribir cada tabla.
3. El backup JSON de referencia se ha migrado a la base de datos y se ha verificado dato por dato contra el original.

No se toca todavía: el HTML/frontend actual, la lógica de partidas, el cálculo del 2% de OP, el IVA, las listas de precios. Todo eso sigue funcionando igual en el programa actual mientras se construye esto en paralelo.

---

## 1. Elección de tecnología

- **Base de datos**: PostgreSQL (recomendado por robustez y porque es gratuito y estándar de la industria).
- **Instalación**: primero local, en el propio ordenador de Víctor, para poder probar sin coste ni dependencia de internet. El hosting en la nube es una decisión posterior (Fase 5).
- **Backend**: Claude Code debe elegir la tecnología más simple y mantenible dado que Víctor no es programador (por ejemplo, Node.js + Express, o Python + FastAPI) — priorizar claridad del código y buena documentación de cada paso frente a sofisticación técnica.

---

## 2. Entidades / tablas a crear

Basadas en lo que ya existe en el localStorage del programa actual (confirmar nombres de campos exactos leyendo el .html y el backup real antes de crear las tablas definitivas):

| Tabla | Contenido | Notas |
|---|---|---|
| `clientes` | Catálogo de clientes | Incluye código, nombre, tipo (pescadería/mayorista), datos de contacto |
| `articulos` | Catálogo de productos | Código, descripción, familia/talla |
| `proveedores` | Catálogo de proveedores | Debe incluir el campo que marca si es proveedor de subasta/lonja (relevante para el 2% de OP en Fase 2) |
| `compras` | Registros de compra | **Dato sagrado — nunca se modifica una vez creado** (ver Fase 0). Diseñar la tabla para que sea difícil modificar por error, ej. sin UPDATE habilitado desde la API, solo INSERT y lectura |
| `partidas` | Lotes de coste generados por compras | Relacionado con compras |
| `pedidos` / `historial` | Albaranes de venta | Incluye origen (`CORU`/`PANC`) y timestamp para desempate de duplicados |
| `repartos` | Reparto Super | |
| `traspasos` | Traspasos internos | |
| `listas_precios` | Listas Pescaderías/Mayoristas | Independientes entre sí (ver Fase 0, punto 5) |

**Importante:** no inventar campos — extraer la estructura real inspeccionando el JSON del backup y el código del .html (buscar `DB.set(...)` y las claves usadas). Si algo no está claro, preguntar a Víctor antes de asumir.

---

## 3. Backend mínimo — qué debe saber hacer

Para cada tabla: crear, leer, y (salvo `compras`, ver arriba) actualizar y borrar. Nada más en esta fase — sin cálculos, sin validaciones de negocio todavía (salvo las garantías de grabación del punto 3bis).

Debe incluir también:
- Un endpoint de **exportación** que genere un JSON con la misma estructura que el backup actual, para poder comparar fácilmente contra el original durante la verificación.
- Un log básico de qué se ha escrito y cuándo (útil para depurar problemas de sincronización más adelante, en la Fase 3).

---

## 3bis. Garantías de grabación (añadido tras las correcciones del 02/09/2026)

Aunque esta fase no lleva lógica de negocio, estas dos garantías son de la capa de datos y deben existir desde el principio (ver `CORRECCIONES_2026-09-02_programa_actual.md`, puntos 1 y 11):

- **Grabación sin duplicados, protegida en el servidor.** El 01/09/2026 el mismo pedido se creó tres veces (13786, 13787, 13788) por pulsar GRABAR varias veces. Toda operación de crear (pedidos, repartos, traspasos, compras, partidas y cualquier otra que escriba) debe aceptar una **clave de idempotencia** que genera la pantalla una vez por intento de grabar (columna `clave_idempotencia` única, ver esquema). Si llega una segunda petición con la misma clave —repetida o en paralelo— el servidor devuelve el registro ya creado, sin crear otro ni gastar otro número. Esto se garantiza en la base de datos (restricción `UNIQUE` dentro de la misma transacción que asigna el número), no solo bloqueando el botón en la pantalla.
- **Guardar sin cambios no altera nada.** Leer un registro y volver a enviarlo tal cual debe dejarlo idéntico en la base de datos. En particular, en `repartos` el destinatario se guarda como `destinatario_nombre` + `destinatario_ciudad`: si un texto no encaja en un patrón conocido con ciudad (hoy solo "ALCAMPO [ciudad]"), va entero a `destinatario_nombre` y `destinatario_ciudad` queda vacía. Nunca se copia el mismo texto en los dos campos. Tampoco para "ALCAMPO" sin ciudad.

---

## 4. Migración del backup de prueba

1. Coger el backup JSON más reciente que Víctor aporte.
2. Escribir un script de migración que lea ese JSON y lo inserte en las tablas nuevas.
3. Ejecutar la migración.
4. **Verificación obligatoria antes de cerrar la fase:**
   - Mismo número de registros en cada tabla que en el JSON original (contar clientes, artículos, compras, pedidos, etc. uno a uno).
   - Comprobar una muestra representativa de registros (no solo los primeros) campo por campo.
   - Revisar específicamente que ningún registro de `compras` haya sido alterado en el proceso (dato sagrado).
   - Documentar el resultado de esta verificación por escrito antes de continuar a la Fase 2.

---

## 5. Criterios de cierre de la Fase 1

No pasar a la Fase 2 hasta que:

- [ ] Todas las tablas existen y corresponden a la estructura real del programa actual.
- [ ] El backend permite leer y escribir cada tabla correctamente.
- [ ] El backup de prueba está migrado y verificado sin discrepancias.
- [ ] `compras` no tiene forma de modificarse por error desde el backend.
- [ ] Probado: enviar la misma petición de grabar 3 veces seguidas y 3 veces en paralelo (con la misma clave de idempotencia) crea **un solo** pedido/reparto/traspaso/compra y un solo número (caso real 13786/13787/13788).
- [ ] Probado: leer un reparto con destinatario no ALCAMPO (ej. ECOMORA), otro con "ALCAMPO" sin ciudad y otro con "ALCAMPO ZARAGOZA", y volver a grabarlos sin cambios 3 veces: los datos quedan idénticos.
- [ ] El HTML/programa actual sigue funcionando exactamente igual, sin tocar, en paralelo.
- [ ] Víctor ha revisado y entendido (en términos sencillos, no técnicos) qué se ha construido, antes de seguir.

---

*Preparado como continuación de FASE_0_reglas_de_negocio_MARINAFISK.md, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
