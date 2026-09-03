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
| `clientes` | Catálogo de clientes | Incluye código, nombre, tipo (pescadería/mayorista), datos de contacto. **Debe incluir también la clasificación fiscal del cliente: Nacional / Intracomunitario (misma distinción que proveedores, ver abajo), y por separado si tiene o no Recargo de Equivalencia** (aplicable a clientes nacionales e intracomunitarios) — este campo es indispensable para el futuro módulo de facturación (ver punto 6) |
| `articulos` | Catálogo de productos | Código, descripción, familia/talla |
| `proveedores` | Catálogo de proveedores | Debe incluir el campo que marca si es proveedor de subasta/lonja (relevante para el 2% de OP en Fase 2). **Debe incluir también la clasificación fiscal del proveedor: Nacional / Intracomunitario** (Extra-UE queda fuera de alcance, ver punto 2.1) — esta clasificación determina el tratamiento correcto del IVA en cada compra (ver Fase 0, punto 4) |
| `compras` | Registros de compra | **Dato sagrado — nunca se modifica una vez creado** (ver Fase 0). Diseñar la tabla para que sea difícil modificar por error, ej. sin UPDATE habilitado desde la API, solo INSERT y lectura |
| `partidas` | Lotes de coste generados por compras | Relacionado con compras |
| `pedidos` / `historial` | Albaranes de venta | Incluye origen (`CORU`/`PANC`) y timestamp para desempate de duplicados |
| `repartos` | Reparto Super | |
| `traspasos` | Traspasos internos | |
| `listas_precios` | Listas Pescaderías/Mayoristas | Independientes entre sí (ver Fase 0, punto 5) |

**Importante:** no inventar campos — extraer la estructura real inspeccionando el JSON del backup y el código del .html (buscar `DB.set(...)` y las claves usadas). Si algo no está claro, preguntar a Víctor antes de asumir.

### 2.1 Clasificación fiscal de proveedores y clientes (importante, afecta al diseño de las tablas)

Esto es nuevo respecto al programa actual y debe quedar bien reflejado en el esquema desde el principio, aunque la lógica de cálculo de IVA/recargos en sí se implemente en la Fase 2:

- **Proveedores** — clasificar en una de estas categorías:
  - Nacional
  - Intracomunitario
  - *(Extra-UE / fuera de Europa queda fuera del alcance del proyecto — Marinafisk no opera con este tipo de proveedores, ver Fase 0 punto 4. No es necesario incluir esta categoría en el esquema, salvo que Víctor decida en el futuro que sí aplica.)*
- **Clientes** — dos clasificaciones independientes y combinables:
  - Origen: Nacional / Intracomunitario
  - Recargo de Equivalencia: Sí / No (aplicable tanto a clientes nacionales como intracomunitarios)

Diseñar los campos de forma flexible (ej. catálogos/enums en vez de texto libre) para que la Fase 2 pueda construir sobre ellos las reglas correctas de IVA sin tener que rehacer el esquema.

---

## 3. Backend mínimo — qué debe saber hacer

Para cada tabla: crear, leer, y (salvo `compras`, ver arriba) actualizar y borrar. Nada más en esta fase — sin cálculos, sin validaciones de negocio todavía.

Debe incluir también:
- Un endpoint de **exportación** que genere un JSON con la misma estructura que el backup actual, para poder comparar fácilmente contra el original durante la verificación.
- Un log básico de qué se ha escrito y cuándo (útil para depurar problemas de sincronización más adelante, en la Fase 3).

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

## 5. Requisito transversal de agilidad (aplica a todas las fases, no solo a esta)

El Excel `GESTION_CORRECTA` es hoy la referencia de rapidez de uso para la gestión de compras. **El sistema nuevo debe ser igual de ágil o más rápido de usar que ese Excel — nunca más lento ni más tedioso.** Esto condiciona decisiones desde ya en el backend (por ejemplo: respuestas rápidas, no obligar a pasos innecesarios, permitir edición rápida tipo hoja de cálculo donde tenga sentido) y deberá verificarse explícitamente en cada fase siguiente comparando el flujo de trabajo real contra el Excel actual.

Además, el sistema nuevo debe **igualar los modelos de impresión que ya existen** en el programa actual y en el Excel (fichas de envío, etiquetas, listados de compra, Transfrío, etc.) — no basta con que los datos estén bien, la salida impresa/PDF debe mantener el mismo nivel de utilidad práctica que tiene hoy.

---

## 6. Nuevo: módulo de facturación (no existe en el sistema actual)

Marinafisk no emite facturas hoy con este sistema (el HTML actual solo genera albaranes). De cara al futuro, **el sistema nuevo debe incluir desde su diseño de base de datos la posibilidad de añadir un módulo de facturación**, aunque no se implemente por completo en esta fase ni en la siguiente:

- Los campos de clasificación fiscal de clientes y proveedores (ver punto 2.1) son precisamente la base necesaria para que ese futuro módulo pueda aplicar correctamente IVA y Recargo de Equivalencia según corresponda.
- No es necesario construir el módulo de facturación completo ahora — pero sí dejar el esquema de datos preparado (relación factura-albarán, numeración de facturas independiente de la de albaranes, series si hiciera falta) para no tener que rehacer la base de datos el día que se active.
- **Nuevo requisito (añadido por Víctor):** el día que se active la facturación, debe ser posible **exportar esa facturación a un programa de contabilidad externo**, o bien **construir dentro del propio sistema una gestión contable básica basada en el Plan General Contable español (PGC)**. No es necesario decidir cuál de las dos opciones ahora, pero el diseño de las tablas de facturación (cuando se construyan, en su fase correspondiente) debe dejar ambas puertas abiertas: campos claros de base imponible, tipo de IVA/recargo aplicado, cliente/proveedor y fecha, que son los datos mínimos que cualquier exportación contable o integración con el PGC necesitaría. Se decidirá con más detalle en la fase en la que se construya el módulo de facturación en sí.
- Anotar esto como una fase futura a definir con más detalle (candidata a Fase 4 o una fase propia), pero el impacto en el diseño de tablas debe considerarse ya en esta Fase 1.

---

## 7. Criterios de cierre de la Fase 1

No pasar a la Fase 2 hasta que:

- [ ] Todas las tablas existen y corresponden a la estructura real del programa actual.
- [ ] El backend permite leer y escribir cada tabla correctamente.
- [ ] El backup de prueba está migrado y verificado sin discrepancias.
- [ ] `compras` no tiene forma de modificarse por error desde el backend.
- [ ] El HTML/programa actual sigue funcionando exactamente igual, sin tocar, en paralelo.
- [ ] Víctor ha revisado y entendido (en términos sencillos, no técnicos) qué se ha construido, antes de seguir.

---

*Preparado como continuación de FASE_0_reglas_de_negocio_MARINAFISK.md, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
