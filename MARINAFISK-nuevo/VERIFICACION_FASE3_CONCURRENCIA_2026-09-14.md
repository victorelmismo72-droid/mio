# Prueba de concurrencia real (Fase 3)

Backend probado: http://localhost:3001
Fecha de esta prueba: 2026-09-14T05:37:52.226Z

## 1. 50 pedidos de CORU + 50 de PANC, en paralelo de verdad

100 peticiones en paralelo resueltas en 309 ms. Fallidas: 0
Pedidos creados en la base de datos: 100 (esperados 100). Números: 13941–14040.
Sin números repetidos: sí. Sin huecos: sí.
De los pedidos con uid "...-CORU-*", tienen puesto_id de CORU: 50/50. De los "...-PANC-*", tienen puesto_id de PANC: 50/50.

## 2. 50 compras de CORU + 50 de PANC, en paralelo de verdad (dato sagrado)

100 peticiones en paralelo resueltas en 147 ms. Fallidas: 0
Compras creadas en la base de datos: 100 (esperadas 100).

## 3. 25 peticiones EN PARALELO con el MISMO uid (el caso real del doble clic)

25 peticiones simultáneas con el mismo uid → 1 crearon (201), 24 recibieron "ya grabado" (200), 0 recibieron "en curso, no dupliques" (409).
Filas realmente creadas en la base de datos con ese uid: 1 (debe ser exactamente 1, aunque llegaran 25 peticiones a la vez).

## Conclusión

**Prueba de concurrencia superada: ni un número repetido, ni un hueco, ni un duplicado por doble clic — con peticiones de verdad en paralelo, no en teoría.**
