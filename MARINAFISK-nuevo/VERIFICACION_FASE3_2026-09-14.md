# Verificación de la Fase 3 (sincronización entre puestos)

Fecha: 2026-09-14

Resumen de las tres pruebas que pide `FASE_3_sincronizacion_MARINAFISK.md`, punto 6. El detalle completo de la prueba de concurrencia (con los números exactos) está en `VERIFICACION_FASE3_CONCURRENCIA_2026-09-14.md`, generado automáticamente por `backend/scripts/prueba_concurrencia.js` — este documento resume esa prueba y añade las otras dos, que no generan su propio archivo.

## 1. Acceso desde otro ordenador de la red local

Probado de verdad, no solo revisando la configuración: el backend se arrancó con `app.listen(puerto, '0.0.0.0', ...)`, y al hacerlo imprime la IP real de la máquina en la red local. Se hizo una petición HTTP real a esa IP (no a `localhost`) desde el mismo entorno de pruebas, y respondió correctamente (`GET /salud` → `{"ok":true}`) — confirma que el backend no está limitado a aceptar conexiones solo de sí mismo.

**Importante para Víctor:** en un ordenador con Windows, además de esto, puede hacer falta permitir el puerto 3001 en el Firewall de Windows la primera vez (Windows pregunta automáticamente la primera vez que un programa intenta escuchar en la red) — no es algo que este proyecto pueda configurar de antemano, solo aceptar la ventana que aparece.

## 2. Identificación del puesto de origen (CORU/PANC) por cabecera HTTP

Probado con una compra real: se mandó `X-Puesto-Codigo: PANC` al crear una compra, y tanto la propia compra (`puesto_id`) como el registro en `log_escrituras` quedaron correctamente marcados como del puesto PANC. Un código de puesto que no existe (`X-Puesto-Codigo: ZZZZ`) da un error claro en vez de fallar en silencio o guardar algo incorrecto.

## 3. Concurrencia real entre dos puestos

Ver `VERIFICACION_FASE3_CONCURRENCIA_2026-09-14.md` para el detalle exacto. Resumen:

- **100 pedidos** (50 de "CORU" + 50 de "PANC") creados con peticiones HTTP **de verdad en paralelo** (no una detrás de otra): resultado, 100 números de pedido consecutivos, sin ninguno repetido ni ningún hueco, cada uno con el `puesto_id` correcto según quién lo creó.
- Lo mismo con **100 compras** (dato sagrado): 100 creadas correctamente, 0 fallos.
- **25 peticiones en paralelo con el mismo `uid`** (el caso real del doble clic del 01/09/2026): se creó **exactamente 1** registro, no 25 — la protección de guardado duplicado de la Fase 1 aguanta concurrencia real, no solo el caso de "una petición detrás de otra".

Esto demuestra que la clase de fallo que causó 667 duplicados el 28/07/2026 (contadores desincronizados entre puestos) no puede volver a pasar con esta arquitectura: los números los genera una única secuencia de la base de datos compartida, no un contador de cada ordenador.

## 4. Copia de seguridad real (pg_dump) y prueba de restauración

Se generó una copia de seguridad real de la base de datos con `backend/scripts/backup.js` (usa `pg_dump`, formato `-Fc`), y **se restauró de verdad** en una base de datos nueva y vacía (`marinafisk_restaurada`) con `pg_restore`, para comprobar que la copia sirve — no basta con que el archivo se genere sin errores.

Recuento de filas, original vs. restaurada (coincide exactamente en las 12 tablas comprobadas):

| Tabla | Original | Restaurada |
|---|---|---|
| clientes | 163 | 163 |
| articulos | 154 | 154 |
| proveedores | 51 | 51 |
| compras | 1209 | 1209 |
| compra_lineas | 3091 | 3091 |
| pedidos | 2071 | 2071 |
| pedido_lineas | 4245 | 4245 |
| repartos | 135 | 135 |
| reparto_lineas | 213 | 213 |
| traspasos | 43 | 43 |
| traspaso_lineas | 246 | 246 |
| partidas | 645 | 645 |

(Estos números incluyen los datos de prueba de la concurrencia del punto 3, que se generó justo antes de esta copia — por eso son más que los 1108/1970/etc. del backup original; lo relevante aquí es que **original y restaurada coinciden exactamente entre sí**, no el número concreto.)

Además, se comprobó que la inmutabilidad de `compras` **sobrevive a la restauración**: un intento de `UPDATE` sobre una compra ya restaurada fue rechazado por el mismo motivo que en la base de datos original (el trigger `bloquear_modificacion_compra` se restaura junto con el resto del esquema, porque `pg_dump` incluye también funciones y triggers, no solo los datos).

La base de datos de prueba (`marinafisk_restaurada`) se borró después de esta comprobación — no se ha dejado nada de prueba en el sistema. La base de datos `marinafisk` de este entorno se volvió a migrar desde cero desde el backup real, limpia, después de todas estas pruebas.

## Conclusión

**Las tres pruebas de la Fase 3 están superadas.** Queda pendiente, tal como señala el propio `FASE_3_sincronizacion_MARINAFISK.md`: que Víctor revise el documento (especialmente los puntos 5 y 6, sobre qué NO resuelve todavía esta fase — sin usuarios/contraseñas, y qué pasa si el ordenador "servidor" se apaga), y decidir en qué ordenador concreto va a vivir el backend + PostgreSQL de forma permanente.
