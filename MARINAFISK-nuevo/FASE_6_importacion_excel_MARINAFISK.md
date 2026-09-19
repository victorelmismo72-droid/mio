# MARINAFISK — Fase 6: Importación de catálogos desde Excel

Igual que Fase 5, este documento no lo ha escrito Víctor de antemano. Al preguntarle qué quería decir con "la importación de Excel" (porque el HTML actual tiene dos cosas distintas con ese nombre — ver más abajo), eligió los importadores reales de catálogo.

**Instrucción para Claude Code:** replicar fielmente las reglas de lectura/validación de cada importador (son reales, ya en uso) — pero donde esas reglas chocan con una garantía ya construida y probada en fases anteriores (compras inmutables; artículos referenciados por claves foráneas reales), adaptar el mecanismo sin perder la intención, y dejarlo señalado aquí, no en silencio.

---

## 0. Dos cosas distintas llamadas "importación de Excel" en el HTML actual

Al investigar `importarCargaYGenerarEtiquetasScanfisk` (Fase 5, diferida) se descubrió que es código muerto: no tiene ningún botón ni `<input type="file">` que la dispare, y hace referencia a un modal (`modal-scanfisk-hojas`) que no existe en el HTML — ejecutarla a mano fallaría. Se le preguntó a Víctor y confirmó que se refería a la otra cosa: **6 importadores de catálogo completamente reales**, cada uno con su propio botón de verdad en la pantalla correspondiente:

| Función | Hoja Excel esperada | Qué actualiza |
|---|---|---|
| `importarClientesExcel` | "CLIENTES" | Catálogo de clientes (alta/actualización, nunca borra) |
| `importarCatalogoExcel` | "PRODUCTOS" | Catálogo de artículos (alta/actualización/baja de los que ya no aparecen) |
| `importarProveedoresExcel` | "PROVEEDORES" | Catálogo de proveedores (alta/actualización, nunca borra) |
| `importarComprasExcel` | "COMPRAS" | Compras — alta masiva, con reimportación segura (ver punto 4) |
| `importarNombresItalianoExcel` | hoja que empieza por "TRADUC" | Solo el nombre en italiano de artículos ya existentes |
| `importarNombresFrancesExcel` | hoja que empieza por "TRADUC" | Solo el nombre en francés de artículos ya existentes |

Los dos últimos son la misma función parametrizada por idioma (mismo código, solo cambia el campo que escriben) — se han unificado en el sistema nuevo, no se han duplicado dos veces.

## 1. Regla común a todos: detección de la fila de cabecera

Todos localizan la fila de cabeceras dentro de las primeras 25 filas de la hoja (puede no ser la fila 1: puede haber títulos o filas en blanco antes), comparando nombres de columna normalizados (sin acentos, mayúsculas, espacios colapsados). Si no encuentra una fila con TODAS las columnas obligatorias, no importa nada y explica cuál es la fila que más se parece y qué le falta — nunca importa a medias ni adivina. Las columnas opcionales, si no aparecen en el Excel, simplemente no se tocan (no se borran ni se ponen en blanco). Filas totalmente vacías se ignoran en silencio; una fila con datos pero incompleta (falta código o nombre) es un error que bloquea toda la importación — nunca se importa "lo que se pueda" dejando huecos.

## 2. Clientes y Proveedores: alta/actualización, nunca borrado

Both funcionan igual: se valida el Excel entero primero (código y nombre son obligatorios, código repetido en el propio Excel es un error), y solo si no hay ningún error se aplica todo de golpe. Los que ya existían y cambian algún campo se actualizan; los nuevos se dan de alta; los que ya existían y NO aparecen en el Excel **se conservan tal cual** — importar un Excel parcial nunca borra lo que no menciona. Los campos que el sistema nuevo añadió y el Excel no trae (`tipo_iva`, `formato_etiqueta` en clientes) se conservan si ya existían, o usan su valor por defecto si es un alta nueva.

## 3. Catálogo de artículos (PRODUCTOS): única "baja" — adaptada para no romper el histórico real

Solo se importan filas con `MOSTRAR EN LISTA = "S"`. Aquí el HTML actual hace algo distinto a Clientes/Proveedores: **sustituye el catálogo entero** por lo que trae el Excel — cualquier artículo que no aparezca (o que tenga `MOSTRAR EN LISTA` distinto de "S") se borra del catálogo sin más.

**Eso no se puede replicar literalmente aquí.** A diferencia del HTML actual (un array en `localStorage`), el sistema nuevo tiene compras y pedidos reales con una clave foránea real hacia `articulos` — borrar un artículo que ya se ha comprado o vendido alguna vez (es decir, casi cualquier artículo real) rompería esa referencia y la base de datos lo rechazaría. Se ha añadido una columna `articulos.activo` (por defecto `true`): un artículo que no viene en el Excel (o viene con `MOSTRAR EN LISTA` distinto de "S") se marca `activo = false` en vez de borrarse — sigue existiendo para el histórico, pero deja de ofrecerse al elegir artículo en una compra/pedido/reparto/traspaso/lista de precio nuevos, que es el efecto real que Víctor busca con "MOSTRAR EN LISTA". El catálogo de Artículos (pantalla de gestión) lo sigue mostrando, con su estado, para poder reactivarlo a mano si hiciera falta.

## 4. Compras: alta masiva, reimportación segura, nunca modificación — adaptada para respetar "dato sagrado"

El HTML actual agrupa las filas del Excel por partida+albarán+proveedor y, si esa combinación ya existía, **la actualiza en su sitio** si el contenido cambió (para poder reimportar el mismo Excel varias veces mientras contabilidad lo va completando, sin duplicar nada).

**Tampoco se puede replicar esa parte literalmente.** FASE_0 estableció que una compra, una vez grabada, es un dato sagrado — no se puede modificar ni borrar (hay un trigger en la base de datos que lo impide, y toda la Fase 2/3 se ha verificado apoyándose en esa garantía). Así que aquí:
- Si la combinación partida+albarán+proveedor **no existe todavía**, se da de alta como una compra nueva (con su 2% de OP e IVA calculados en el servidor, igual que al grabar una compra a mano).
- Si ya existe **con el mismo contenido**, se considera ya importada — no se toca, no se duplica (se puede reimportar el mismo Excel sin miedo).
- Si ya existe **con contenido distinto**, no se modifica — se avisa explícitamente en el resumen para que Víctor lo revise y decida a mano (es exactamente el mismo caso donde el HTML actual la sobrescribiría en silencio; aquí se prefiere avisar antes que tocar un dato sagrado).

Las filas sin un número de partida real (p.ej. una fila de totales al final de la hoja) se ignoran, como en el HTML actual, sin bloquear el resto.

## 5. Qué se deja fuera, señalado honestamente

- **"Deshacer última importación"**: el HTML actual guarda una copia en `localStorage` antes de cada importación para poder deshacerla con un botón. Aquí no tiene sentido replicarlo así — el sistema ya tiene un mecanismo real de copia de seguridad (`backend/scripts/backup.js`, `pg_dump`) pensado exactamente para esto. La recomendación, señalada en la propia pantalla, es hacer una copia de seguridad antes de una importación grande si hay dudas, en vez de un "deshacer" de un solo paso que solo cubriría la última importación.
- **Sincronización con la carpeta compartida tras importar** (`sincronizarClienteTrasGrabar`, etc. del HTML actual): no aplica — el sistema nuevo ya no usa una carpeta compartida, todo pasa por la base de datos compartida real (Fase 3).

## 6. Verificación de esta fase

Ver `VERIFICACION_IMPORTACION_EXCEL_2026-09-19.md`: probado con ficheros `.xlsx` reales (generados con la misma librería XLSX ya usada, no simulados a mano) contra el backend y la base de datos reales, incluyendo los casos de error (columna que falta, código duplicado) y los dos casos adaptados (artículo que deja de aparecer → se desactiva, no se borra; compra que ya existía con datos distintos → no se toca, se avisa).
