# Verificación de la lógica de negocio (Fase 2)

Fecha de esta verificación: 2026-09-14T05:40:06.109Z

## 1. 2% de OP e IVA en compras: recálculo contra las 1108 compras reales migradas

Proveedores con tipo_iva presentes en las compras migradas: NACIONAL (todos NACIONAL — no hay ningún INTRACOMUNITARIO real todavía, ver aviso de migración).
Líneas de compra recalculadas: 2990
Diferencias encontradas: 0

## 2. IVA intracomunitario (demostración): no hay proveedores reales de este tipo todavía

Proveedor de subasta + INTRACOMUNITARIO (100kg a 2,50€/kg): OP2=5€ (5% correcto, sí se aplica aunque sea intracomunitario — el 2% de OP no depende del tipo de IVA), IVA=0€ (0€, corrige el fallo del HTML actual que aplicaba 10% siempre).
✔ Correcto.

## 3. Emparejamiento de familia de producto: caso real citado en el propio código fuente del HTML actual

C255 "CABRAS/ GALLINETA (BRF)" vs C2550 "CABRACHO/ ESCARAPOTE (RSE)" → sonMismaFamilia=false (debe ser false: prefijo coincide pero son productos distintos)
C1300 "MERLUZA EUROPEA PINCHO COSTA" vs C13004 "MERLUZA EUROPEA PINCHO COSTA 400" → sonMismaFamilia=true (debe ser true: misma familia con variante de talla)
✔ Correcto.

## 4. Margen mínimo (1,30 €/kg) contra una partida real con kilos disponibles

Artículo de prueba: C250 "CONGRIO 10+  (COE)"
Precio de venta 999€/kg → estado=OK partida=56227 margen=993.594 (debe ser OK, con partida asignada)
Precio de venta 0,01€/kg → estado=AVISO_MARGEN partida=null (debe ser AVISO_MARGEN, SIN partida asignada — igual que construirCeldaPartida() en el HTML actual cuando nadie llega al margen)
✔ Correcto.

## 5. IVA / Recargo de Equivalencia en ventas (lógica nueva, FASE_2 punto 2)

Cliente NORMAL, base 100€ → IVA=10€ (10%) recargo=0€ (0%) total=110€ — correcto
Cliente RECARGO_EQUIVALENCIA, base 100€ → IVA=10€ (10%) recargo=1.4€ (1.4%) total=111.4€ — correcto
Cliente INTRACOMUNITARIO, base 100€ → IVA=0€ (0%) recargo=0€ (0%) total=100€ — correcto

⚠ El 1,4% de recargo de equivalencia usado aquí es el vigente en España para productos al 10% desde 2012 — pendiente de que la asesoría fiscal de Víctor lo confirme antes de facturar con él de verdad (ver aviso en calculosVenta.js).

## Conclusión

**Todas las comprobaciones de la Fase 2 superadas.**

### Desviaciones intencionadas respecto al comportamiento literal del HTML actual (ya pedidas por los documentos de fase, no son fallos)

- El coste usado para el margen de partidas incluye el 2% de OP (base_real), mientras que el HTML actual usa el precio de compra en bruto en ese cálculo concreto — cambio pedido explícitamente por FASE_0 punto 2.
- El Recargo de Equivalencia es una regla completamente nueva (FASE_2 punto 2): el HTML actual nunca lo aplica.
- La asignación automática inline, cuando ninguna partida llega al margen mínimo, NO asigna nada (igual que construirCeldaPartida() al teclear) — distinto de la función aparte autoAsignarPartidas() del HTML actual, que sí cae a la partida más antigua sin margen como acción manual explícita de "asignar todo lo pendiente"; esa función de asignación masiva por día no se ha reproducido todavía en esta fase.
