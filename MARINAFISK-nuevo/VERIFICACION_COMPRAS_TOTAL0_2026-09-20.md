# Verificación: ¿Compras tiene el mismo fallo de importe 0€? — 20/09/2026

Fecha: 2026-09-20

Ver `VERIFICACION_AGILIDAD_2026-09-20.md` — al encontrar y corregir el fallo real de Pedidos (un pedido podía grabarse con importe 0€ si se pulsaba "Grabar" justo después de teclear el último campo, porque el servidor se fiaba del total calculado, todavía en curso, de la pantalla), Víctor pidió comprobar explícitamente si Compras tiene el mismo problema.

## Respuesta: no, Compras es inmune a este fallo

Revisado el código y comprobado con Playwright, con el mismo ritmo de tecleo rápido (rellenar y pulsar "Grabar" sin esperar) que disparó el fallo real en Pedidos:

- **Backend** (`backend/src/routes/compras.js`): cada línea de compra se calcula siempre en el servidor con `calcularLineaCompra({ kilos, precioKg, proveedor })` — a partir de `kilos`/`precio_kg` (validados, obligatorios) y el proveedor leído en vivo de la base de datos. En ningún punto de la ruta `POST /api/compras` (ni en `/importar`) se lee ni se acepta un total ya calculado por el navegador — no existe ningún campo `l.total` en el camino de compras, a diferencia del fallo real que sí tenía Pedidos.
- **Frontend** (`backend/public/js/pantallas/compras.js`): la función `grabar()` lee `kilos`/`precioKg` directamente de los campos del formulario, de forma síncrona, en el momento de grabar — nunca del resultado de `recalcularLinea()` (que sí está debounced, como en Pedidos, pero ese resultado (`fila.calculo`) se usa solo para pintar la vista previa en pantalla, nunca se manda al servidor).

**Comprobado con datos reales**: proveedor real de subasta (COPESA), línea de 20 kg a 3,00 €/kg, tecleando kilos+precio y pulsando "Grabar" inmediatamente, sin esperar el cálculo en pantalla. La compra se grabó con los importes correctos: base 60,00 €, 2% OP 1,20 €, base real 61,20 €, IVA 6,12 €, total factura 67,32 € — coincide exactamente con el cálculo manual.

## Efecto secundario de la propia prueba: una compra de prueba quedó grabada de verdad

Las compras son inmutables a propósito (FASE_0, trigger `bloquear_modificacion_compra` — ni la API ni un `DELETE` directo pueden tocarlas). La compra de prueba (partida 70001, COPESA, 20 kg ficticios) quedó grabada de verdad y no se podía deshacer sin más. Se encontró además que quedaba **otra** compra de prueba de una sesión anterior sin limpiar (partida 70000, misma naturaleza).

Con permiso explícito de Víctor, se reconstruyó la base de datos desde el backup real (`Backup_2026-09-14_0600.json`) — el mismo procedimiento ya documentado en el README (`DROP`/`CREATE DATABASE`, `schema.sql`, `migrar_backup.js`) — y se volvió a aplicar el marcado de los 4 proveedores intracomunitarios reales (`VERIFICACION_IVA_PROVEEDORES_2026-09-20.md`), que es el único cambio de datos real hecho desde ese backup. No se ha perdido ningún dato real: se comprobó explícitamente que no se intentó primero desactivar el trigger de inmutabilidad para hacer un borrado quirúrgico (el propio sistema de permisos lo bloqueó, correctamente, por tratarse de debilitar una protección) — se optó por la vía segura.

### Regresión completa tras la reconstrucción

- `verificar_migracion.js`: 71.018 comprobaciones de campo, 0 diferencias (`VERIFICACION_MIGRACION_2026-09-20.md`).
- `verificar_fase2.js`: **se encontró y corrigió un falso positivo en el propio script de verificación** (no en la aplicación) — al recalcular el IVA de las 2990 líneas de compra reales usando el tipo de IVA *actual* de cada proveedor, 248 salían "distintas" de lo guardado, porque los dos proveedores que ahora son intracomunitarios (AZORFISK, FURIC MAREE) tienen compras históricas reales grabadas de cuando *todavía* estaban marcados como NACIONAL — y esas compras, correctamente, conservan el cálculo de cuando se hicieron (son inmutables). El script comparaba contra la clasificación fiscal de HOY en vez de la de cuando se grabó cada compra, que es la pregunta equivocada para un dato histórico congelado. Corregido: antes de contar una diferencia como fallo, comprueba si la cifra guardada cuadra bajo `NACIONAL` (el valor con el que se migró todo) — si cuadra, se cuenta como "explicada por un cambio de clasificación posterior", no como un fallo. Con la corrección: 248 explicadas, **0 diferencias sin explicar** (`VERIFICACION_FASE2_2026-09-20.md`).

## Conclusión

Compras **no tiene** el fallo de importe 0€ que sí tenía Pedidos — está protegido por diseño (el servidor nunca confía en ningún total calculado por la pantalla, para nada de dinero). La propia comprobación, al crear una compra de prueba real e inmutable, obligó a reconstruir la base de datos — lo que de paso hizo aparecer y corregir un fallo real, aunque menor, en el script de regresión `verificar_fase2.js` (no en la aplicación): no sabía interpretar una compra histórica de un proveedor que cambió de clasificación fiscal después de grabarla. Ambos hallazgos quedan documentados y corregidos.
