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

## 5. Criterios de cierre de la Fase 1

No pasar a la Fase 2 hasta que:

- [x] Todas las tablas existen y corresponden a la estructura real del programa actual — creadas con PostgreSQL + Prisma (ver `backend/prisma/schema.prisma`), reflejando `02_ESQUEMA_BASE_DATOS_PROPUESTO.md`.
- [x] El backend permite leer y escribir cada tabla correctamente — probado a mano (crear proveedor, cliente, artículo, compra con líneas, pedido con líneas, listado, exportación) el 05/09/2026, todo correcto.
- [ ] El backup de prueba está migrado y verificado sin discrepancias — **pendiente de que Víctor aporte el backup JSON más reciente**; sin ese fichero no se puede escribir ni ejecutar el script de migración.
- [x] `compras` no tiene forma de modificarse por error desde el backend — verificado: `PUT /compras/:id` y `DELETE /compras/:id` devuelven 404 (esas rutas no existen), solo hay `GET` y `POST`.
- [x] El HTML/programa actual sigue funcionando exactamente igual, sin tocar, en paralelo — no se ha modificado ningún `.html` del repositorio en esta fase.
- [ ] Víctor ha revisado y entendido (en términos sencillos, no técnicos) qué se ha construido, antes de seguir — ver `backend/README.md`, pensado para eso.

---

*Preparado como continuación de FASE_0_reglas_de_negocio_MARINAFISK.md, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
