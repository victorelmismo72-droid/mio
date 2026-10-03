# MARINAFISK — Compras: el sistema nuevo calcula exactamente como el Excel

**Petición de Víctor (03/10/2026):** las compras del programa deben funcionar exactamente como en el Excel `GESTION_CORRECTA`.

Este documento es la especificación de referencia del módulo de compras del sistema nuevo (Fase 2). Está sacado fórmula a fórmula de `GESTION_CORRECTA_precio_medio_arreglado_40.xlsx` (hojas COMPRAS, PROVEEDORES, PRODUCTOS, PRECIO MEDIO y PANEL COMPRAS).

**No es una descripción aproximada: está comprobada.** Las reglas están escritas en Python en `compras_referencia/compras_excel.py`. El script `compras_referencia/verificar_contra_excel.py` las compara celda a celda con los resultados que tiene guardados el propio Excel. Resultado con el archivo del 03/10/2026:

| Qué se compara | Celdas | Iguales |
|---|---|---|
| COMPRAS: proveedor, OP 2 %, descripción, base Zaragoza, base + IVA, 2 % OP, base real, IVA, total factura | 9 × 4.995 | **todas** |
| COMPRAS: partida sugerida (columna W) | 9 | **todas** |
| PRODUCTOS: última fecha de compra, coste, PVP1, PVP2 | 4 × 173 | todas menos 3 → por una fórmula que falta en el Excel (ver punto 10) |
| PRECIO MEDIO: kg, base real, precio medio, nº compras | 4 × 157 | todas menos 2 → por una fórmula que falta en el Excel (ver punto 10) |
| PANEL COMPRAS: kilos e importe por proveedor | 2 × 52 | **todas** |

El sistema nuevo **no se da por bueno** hasta que dé estos mismos resultados con los mismos datos (ver punto 11).

El Excel no se sube al repositorio porque contiene datos reales; el script lo lee desde donde esté guardado y no lo modifica.

---

## 1. Qué se escribe a mano en cada línea de compra

| Columna Excel | Dato | Notas |
|---|---|---|
| A — N PARTIDA | Número de partida | Ver punto 3 |
| B — FECHA | Fecha de la compra | |
| C — ALB PROV | Nº de albarán del proveedor | Texto libre (hay números y textos) |
| D — COD PROV | Código del proveedor | **Número** (ej. 50163) |
| G — COD PROD | Código del producto | **Texto** (ej. "C250", "C130015") |
| I — CAJAS | Nº de cajas | Normalmente entero |
| J — KILOS | Kilos | Admite una suma de pesadas (`=12+13,5`); vale el resultado |
| K — EUR/KG | Precio por kilo | Admite 0 |
| R — CONTROL | Marca "S" | Si hay "S" (o "s"), el nº de albarán se pinta en verde; si no, en amarillo. **Confirmar con Víctor qué significa** (¿albarán comprobado?) |

Todo lo demás de la línea se calcula. En el sistema nuevo esos campos calculados **no se pueden escribir** (Fase 1, punto 3bis).

---

## 2. Cálculos de cada línea (columnas E a Q)

Copiados literalmente de las fórmulas del Excel:

| Columna | Qué es | Fórmula del Excel | Regla |
|---|---|---|---|
| E — PROVEEDOR | Nombre | `VLOOKUP(D, PROVEEDORES!A:B, 2)` | Nombre de la ficha. Si el código no existe: `!COD NO ENCONTRADO` |
| F — OP 2% | Marca S/N | `VLOOKUP(D, PROVEEDORES!A:C, 3)` | Se lee de la ficha del proveedor **en cada momento** |
| H — DESCRIPCION | Nombre del producto | `VLOOKUP(G, PRODUCTOS!A:B, 2)` | Igual que E |
| L — BASE IMP ZARAGOZA | | `J × K` | Solo si hay kilos y precio (0 cuenta como dato) |
| M — BASE IMP ZGZ + IVA | | `L × 1,10` | Informativo: base Zaragoza con IVA, **sin** el 2 % OP |
| N — 2% OP | | `L × 0,02` si F = "S"; si no, `0` | |
| O — BASE IMP REAL | | `L + N` | **Es el coste real**: lo que usan precio medio, coste del producto y panel |
| P — IVA 10% | | `O × 0,10` | **Siempre 10 %** (ver punto 9a) |
| Q — TOTAL FACT | | `O + P` | |

Ejemplo real (fila 3): 25,5 kg × 3,80 €/kg, proveedor con OP → L = 96,90 · M = 106,59 · N = 1,938 · O = 98,838 · P = 9,8838 · Q = 108,7218.

**Precisión:** el Excel **no redondea nada** en las líneas ni en los totales. Guarda todos los decimales y solo muestra 2 en importes y 3 en €/kg. Los totales suman los valores sin redondear. El sistema nuevo hace lo mismo: guarda con todos los decimales (tipo `NUMERIC`, no números de coma flotante) y redondea **solo al mostrar**. Si redondeara cada línea a 2 decimales, los totales y el precio medio dejarían de coincidir con el Excel.

**Totales de la hoja** (fila TOTALES): `SUBTOTAL(9, …)`, es decir, la suma **de las filas que se ven con el filtro puesto**. En el sistema nuevo, los totales de un listado de compras suman exactamente las líneas que cumplen el filtro aplicado.

---

## 3. Número de partida

**Regla de negocio** (punto 22 de las correcciones):

1. Mismo proveedor y mismo día que una partida ya grabada → mismo número de partida, aunque sean albaranes distintos.
2. Otro día, o primera compra de ese proveedor ese día → número nuevo = el mayor número de partida existente + 1.
3. Excepción: si un mismo proveedor trae ese día mercancía de **otro puerto**, se marca "partida nueva" y recibe número nuevo aunque coincidan proveedor y día.

**Cómo debe hacerlo el sistema nuevo:**
- El servidor asigna la partida **al grabar**, dentro de la misma operación (Fase 3, punto 2). Solo cuentan las partidas ya grabadas, nunca la línea que se está creando, y el orden en que se muestren las filas no influye.
- El usuario ve el número antes de confirmar y puede marcar "partida nueva (otro puerto)". El número no se escribe a mano.
- Implementación de referencia: `partida_correcta()` en `compras_excel.py`.

**No copiar la fórmula de la columna W tal cual.** Tiene un fallo que se ve en los datos de hoy: en las 9 líneas del 03/10 con buscador, la partida sugerida es **0**. La fórmula busca la primera fila con ese proveedor y ese día, y esa fila es la propia línea que se está escribiendo, que aún no tiene partida, así que devuelve una celda vacía (0). Ejemplo: para SUBASTAS RIVERA (50163) el 03/10 debería sugerir 56641, que es la que ya tiene en las filas 2650-2651. Corregido en `GESTION_CORRECTA_precio_medio_arreglado-2.xlsx` (punto 10ter): la fórmula solo tiene en cuenta filas que ya tienen partida y usa el código real de proveedor de la fila (D). `partida_sugerida_excel()` reproduce la fórmula corregida, y el script de verificación avisa si un archivo todavía tiene la antigua.

**Datos históricos que hay que respetar al migrar** (son dato sagrado, no se "arreglan"):
- 327 líneas (13 a 25 de junio) tienen partidas de 4 cifras (5900-5973), mientras que el resto van de 55601 a 56642. El programa HTML empieza a contar en 5900 si no tiene contador (`nextPartida`, valor por defecto 5900), lo que probablemente lo explica.
- 3 partidas tienen decimales (55906,7 · 55907,6 · 55908,5, filas 437, 441 y 444). Por eso la columna de partida del sistema nuevo no puede ser un número entero sin más: o admite decimales, o se pregunta a Víctor qué número les corresponde **antes** de migrar.
- Hay 30 combinaciones de proveedor + día con más de una partida. Pueden ser el caso "otro puerto"; se migran tal cual.

---

## 4. Coste de cada producto y PVP (hoja PRODUCTOS)

| Columna | Regla exacta |
|---|---|
| M — Última fecha de compra | El día más reciente en que se compró ese producto (a cualquier proveedor) |
| N — Fecha de referencia del coste | = M |
| H — COSTE | Precio medio **del último día de compra**: suma de base imp. real (O) de ese producto ese día ÷ suma de kilos de ese producto ese día. Junta todas las compras de ese día y de todos los proveedores. Si los kilos suman 0, queda vacío |
| I — PVP1 | Si hay precio manual (col. X), ese. Si no: `REDONDEAR(coste + 1,70 ; 2)` |
| J — PVP2 | Si hay precio manual (col. Y), ese. Si no: `REDONDEAR(coste + 1,90 ; 2)` |

- Es una **suma fija** de 1,70 y 1,90 €/kg al coste, no un porcentaje.
- Redondeo "normal" (0,005 sube), no el redondeo bancario de algunos lenguajes de programación. Ver `redondear_excel()`.
- Las compras a **0 €/kg** también cuentan en el coste: si el último día de un producto solo hubo compras a 0 €, su coste es 0 y su PVP1 sale a 1,70 €. Hay 12 líneas así en el Excel (ej. LIRIO, fila 2642, 140 kg a 0 €). **Confirmar con Víctor** si es lo que quiere.

---

## 5. Precio medio por artículo y periodo (hoja PRECIO MEDIO)

Para cada artículo y el periodo elegido (fecha desde / hasta):
- **Total kg** = suma de kilos.
- **Total base imp. real** = suma de la columna O.
- **Precio medio €/kg** = total base real ÷ total kg. Si se escribe un "total kg real" (por mermas), se divide por ese en lugar de por los kilos comprados.
- **Nº compras** = nº de líneas.

OJO al filtro de fechas del Excel: aplica el filtro solo si hay alguna fecha puesta, y en ese caso usa las dos. **Rellenar siempre las dos fechas**: con solo una, el Excel no filtra como se espera. El sistema nuevo admite una sola fecha y la trata como periodo abierto.

---

## 6. Panel de compras

- Kilos e importe comprados por proveedor y por producto, con filtro de fechas. El **importe es la base imp. real** (sin IVA y con el 2 % OP).
- Top 15 proveedores y top 15 productos por kilos y por importe; top 10 productos de un proveedor.
- Resultado para un filtro exacto (proveedor + artículo + fechas): total kilos, total importe, nº de líneas y precio medio = importe ÷ kilos.
- Buscador con filtrado en vivo de proveedor y artículo (punto 14 de las correcciones).

OJO: los "top" del Excel usan `LARGE` + `MATCH`. Si dos proveedores o productos tienen exactamente el mismo total, el Excel repite el primero y no muestra el segundo. El sistema nuevo ordena de verdad y muestra los dos.

---

## 7. Proveedores y productos

- **PROVEEDORES:** código (número), nombre, OP 2 % (S/N) y notas ("Subasta lonja Coruna" / "Externo"). Hoy hay 52 proveedores.
- **PRODUCTOS:** código (texto), descripción, tipo (FRESCO / otros), si se muestra en la lista de precios y en qué orden, PVP manuales, y los datos de etiqueta (nombre científico, zona FAO, arte de pesca…).
- El nombre del proveedor y la descripción del producto se leen siempre de la ficha (Fase 1, punto 3bis), igual que en el Excel.

---

## 8. Programa HTML actual frente al Excel

Revisado `CARGA_DE_ALBARANES_MARINAFISK_20260821I.html` (la versión que hay en el repositorio):

| Punto | HTML | Excel | Sistema nuevo |
|---|---|---|---|
| Cálculo de la línea (L-Q) | Igual (`calcLineaCompra`) | — | Igual que los dos |
| Partida "nueva" por otro puerto | **No existe** | Casilla "¿Partida NUEVA?" | Como el Excel |
| Contador de partidas sin datos | Empieza en 5900 | Máximo + 1 | Máximo + 1 sobre todo lo grabado |
| Kilos como suma de pesadas | No (casilla numérica: `12+13,5` no se acepta) | Sí | Sí (autosuma, punto 13) |
| Nombre del proveedor | Se copia al grabar | Se lee de la ficha | Se lee de la ficha |
| 2 % OP si cambia la ficha del proveedor | Queda el del día en que se grabó; se recalcula si se edita la línea | Cambia en todas las compras, también las antiguas | **Decidir** (punto 9b) |
| Editar o mover líneas de una compra grabada | Permitido | Permitido | No: corrección mediante ajuste (dato sagrado, Fase 1) |

---

## 9. Dónde el sistema nuevo NO puede copiar el Excel sin una decisión de Víctor

Copiar el Excel al pie de la letra chocaría con decisiones ya escritas en las fases anteriores. **Hasta que Víctor decida, manda el Excel** (es lo que se ha pedido), y estas diferencias quedan señaladas:

- **a) IVA de proveedores intracomunitarios.** El Excel aplica siempre 10 %. En el esquema se decidió el 24/08/2026: proveedor intracomunitario → 0 % (inversión del sujeto pasivo). El Excel no tiene ninguna columna que distinga nacional de intracomunitario. **Pregunta:** ¿hay hoy algún proveedor intracomunitario en PROVEEDORES? Si no hay ninguno, las dos reglas dan lo mismo y no hay conflicto.
- **b) 2 % OP en compras antiguas.** En el Excel, si se cambia la marca OP de un proveedor, cambian **todas** sus compras, también las ya cerradas. La Fase 2 decía que el cambio afecta solo a las compras futuras, porque Zaragoza usa las cifras de compras ya cerradas. **Recomendación:** que el sistema nuevo calcule el 2 % en vivo mientras se escribe la compra (como el Excel) y lo deje fijo al grabarla. Con los datos actuales da lo mismo, porque ningún proveedor ha cambiado de marca. **Pregunta:** ¿se queda así?
- **c) Líneas incompletas.** El Excel deja líneas sin proveedor, sin producto o sin partida, y hoy hay varias (punto 10). **Recomendación:** el sistema nuevo no graba una compra sin proveedor, producto, kilos y precio, y asigna la partida al grabar.
- **d) La partida sugerida** no se copia con su fallo (punto 3).

---

## 10. Datos a revisar ahora en el Excel (archivo del 03/10/2026)

Estos datos los ha encontrado el script de verificación. **No se han tocado**: los tiene que revisar Víctor.

**Fórmulas que faltan** (mismo fallo que el punto 16 de las correcciones):
- **PRODUCTOS!H104** (C14415 MERLUZA EUROPEA VOLANTA COSTA 1/1,25): la celda COSTE está vacía, sin fórmula, así que no hay coste ni PVP1/PVP2 para este producto. Con la fórmula daría coste 4,998 → PVP1 6,70 y PVP2 6,90 (última compra, 18/07).
- **PRECIO MEDIO!C54** (C410 CINTAS/PEZ CINTA): en lugar de la fórmula hay un 145 fijo, así que el precio medio de cintas sale mal. Con el filtro del 02/10 sale 0,029 €/kg, cuando con la fórmula serían 1,53 €/kg.

**Compras de hoy (03/10):**
- 8 líneas **sin número de partida** (filas 2643-2649 y 2652), porque la partida sugerida sale 0 (punto 3).
- Fila 2645: 70,65 kg a 2,30 € **sin proveedor ni producto**.
- Fila 2646: C130015, 14,7 kg a 13 € **sin proveedor**, así que no se le aplica el 2 % OP aunque sea de lonja.
- Filas 2650, 2651 y 2653: el código escrito a mano **no coincide** con el que muestra el buscador de esa fila:
  - 2650: producto C130025, buscador C1300.
  - 2651: producto C130015, buscador C130020.
  - 2653: proveedor 50010 PERFECTO MONTERO y producto C250, buscador 50163 SUBASTAS RIVERA y C191.

  Puede ser un buscador que se quedó con lo de antes, o un código mal escrito: conviene comprobar con el albarán cuál es el bueno.

**Históricos:**
- Fila 4: el código de proveedor (50106) y el albarán (31595) tienen formato de fecha (se ven como 07/03/2037 y 02/07/1986). El valor es correcto y el cálculo no se ve afectado, pero confunde al leerlo.
- Fila 449: en CAJAS hay una suma de pesos (`=17,25+19,25+…` = 145), que parece la pesada escrita en la columna equivocada.
- Fila 740: 0,75 cajas.
- Filas 20 y 644: productos C2106 y C1200, que no existen en PRODUCTOS (salen como `!COD NO ENCONTRADO`).
- Partida 55923: tiene dos proveedores (50160 y 50163) el 02/07. Partida 56263: tiene una línea sin proveedor.
- **Formato de fecha:** la columna FECHA de COMPRAS sigue en **mes/día/año** (`m/d/yyyy`) en este archivo, aunque el punto 17 de las correcciones dice que se cambió a día/mes/año. O ese cambio se perdió, o es otra versión del archivo.
- No hay ninguna celda en rojo para avisar de fórmulas que faltan: el aviso del punto 18a no está en este archivo. El único formato condicional de COMPRAS es el verde/amarillo de la columna C.

---

### 10bis. Revisión del archivo `GESTION_CORRECTA_precio_medio_arreglado-1.xlsx` (enviado como corregido, 03/10/2026)

Comparado celda a celda con el anterior (`…_40.xlsx`): **los valores, las fórmulas y los formatos de las 11 hojas son idénticos**. El único cambio es que las columnas de búsqueda de COMPRAS (S, "Buscar PROVEEDOR", y U, "Buscar PRODUCTO", desde la fila 2643) tienen ahora un desplegable con las listas de AUX_BUSCADOR.

Por tanto, **todo lo del punto 10 sigue igual en este archivo**: PRODUCTOS!H104 sin fórmula, PRECIO MEDIO!C54 con el 145 fijo, la partida sugerida en 0, las 8 líneas de hoy sin partida, las filas 2645/2646 sin proveedor, el desajuste código/buscador de las filas 2650, 2651 y 2653, y la fecha en formato mes/día/año.

Además, este archivo se guardó con un programa que no es Excel (openpyxl) y **no lleva guardados los resultados de las fórmulas**. Excel los recalcula al abrirlo, así que el uso diario no se ve afectado. Pero cualquier programa que lea el archivo sin Excel (visores, importaciones, este script) ve las celdas calculadas vacías. Antes de usarlo como fuente para migrar datos, abrirlo en Excel y guardarlo. El script de verificación ahora lo detecta y avisa, en vez de dar miles de diferencias falsas.

---

### 10ter. Copia corregida preparada: `GESTION_CORRECTA_precio_medio_arreglado-2.xlsx` (03/10/2026)

Hecha a partir de `…_arreglado-1.xlsx`. Solo cambia esto:

| Dónde | Cambio |
|---|---|
| PRODUCTOS!H104 | Puesta la fórmula de COSTE, igual que en las filas de al lado |
| PRECIO MEDIO!C54 | El 145 fijo sustituido por la fórmula de TOTAL KG, igual que en las filas de al lado |
| COMPRAS!W2643:W4997 | Fórmula de "Partida sugerida" corregida (punto 3) |
| COMPRAS!B3:B4997 | Formato de fecha `dd/mm/yyyy` en lugar de `m/d/yyyy` (solo el formato; las fechas no cambian) |
| COMPRAS!C4 y D4 | Quitado el formato de fecha: se ven 31595 y 50106, que es lo que contienen |

No se ha tocado ningún dato: ni compras, ni códigos, ni las líneas de hoy sin partida o sin proveedor. Esas las tiene que revisar Víctor con los albaranes.

---

## 11. Cómo se comprueba en el sistema nuevo (criterio de cierre de la Fase 2)

1. Migrar las compras del Excel (o del backup del HTML) al sistema nuevo.
2. Para cada línea, comparar los valores del sistema nuevo con los del Excel: base Zaragoza, base + IVA, 2 % OP, base real, IVA y total factura. Deben coincidir con tolerancia de una milésima de céntimo y, redondeados a 2 decimales, al céntimo exacto.
3. Comparar coste, PVP1 y PVP2 de cada producto, precio medio por artículo (todas las fechas y, al menos, un día y un mes concretos) y totales por proveedor.
4. Asignar partidas a compras nuevas de prueba: mismo proveedor y día, otro día, "otro puerto" y dos puestos grabando a la vez. Tiene que dar lo que dice `partida_correcta()`.
5. Las únicas diferencias admitidas son las del punto 9, decididas por Víctor y escritas.

Para repetir la verificación contra el Excel:

```
cd MARINAFISK-nuevo/compras_referencia
python verificar_contra_excel.py RUTA/GESTION_CORRECTA_....xlsx
```

---

*Preparado a partir de `GESTION_CORRECTA_precio_medio_arreglado_40.xlsx` (03/10/2026) y de `CARGA_DE_ALBARANES_MARINAFISK_20260821I.html`.*
