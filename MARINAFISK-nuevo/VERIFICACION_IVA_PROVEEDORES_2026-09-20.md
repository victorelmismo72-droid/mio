# Verificación: Revisión del tipo de IVA de proveedores — 20/09/2026

Fecha: 2026-09-20

Ver `backend/README.md` §7 y `FASE_2_logica_de_negocio_MARINAFISK.md` (punto 100) — al migrar el backup real, los 51 proveedores quedaron marcados como `NACIONAL` porque el campo `tipo_iva` no existía en el programa actual. Quedó pendiente de revisión desde Fase 2. El campo ya era editable en la pantalla real de Proveedores (`crearPantallaCrud`, select con los dos valores del `CHECK` de `schema.sql`) — lo que faltaba era la propia revisión de los datos.

## Método

La tabla `proveedores` no guarda país ni CIF (solo `codigo`/`nombre`/`es_subasta_op`/`tipo_iva`/`notas`), así que el único dato disponible para juzgar es el nombre comercial. Se listaron los 51 proveedores reales (`GET /api/proveedores`) y se identificaron los nombres con forma jurídica o topónimo no español (`LDA` portugués, `B.V.` neerlandés, sufijo francés "Marée"). Cada candidato se buscó por internet uno a uno para confirmarlo con una fuente real — nunca se marcó nada solo por el patrón del nombre.

## Resultado

**4 proveedores reales confirmados como intracomunitarios**, con fuente:

| Código | Nombre | País confirmado | Fuente |
|---|---|---|---|
| 50158 | FORO-MAREE | Francia (La Rochelle) | data.inpi.fr (SIREN 327489647), Ocealliance |
| 50509 | AZORFISK UNIPERSONAL LDA | Portugal (Rabo de Peixe, Azores) | Racius.com, Iberinform.pt |
| 50523 | URK-EXPORT B.V | Países Bajos (Urk) | urk-export.nl (web oficial) |
| 50525 | FURIC MAREE | Francia (Le Guilvinec, Bretaña) | Ocealliance |

**Descartados tras comprobarlo**, no solo por parecer razonable:
- `CENOR QUEIJO CORUÑA` — el nombre suena portugués ("queijo"), pero es una empresa real de A Coruña, España (teléfono +34, dirección en Coruña y Carballo).
- `MAR IMPORT VENTA S.L.` — forma jurídica española (S.L.); que el negocio consista en importar mercancía no hace intracomunitario al proveedor, lo que importa es dónde está establecido él mismo.

Los 47 proveedores restantes (autónomos gallegos, S.L. españolas, lonja de A Coruña) se dejaron en `NACIONAL` — no se encontró ningún indicio de que fueran otra cosa.

## Cambio aplicado

Se marcaron los 4 proveedores confirmados como `INTRACOMUNITARIO` mediante `PUT /api/proveedores/:id` (el mismo endpoint que usa la pantalla real de Proveedores) — se confirmó con Víctor antes de tocar la base de datos real, dado que afecta al IVA calculado en compras futuras de un negocio de verdad. Se verificó después, con Playwright contra la pantalla real, que los 4 aparecen correctamente marcados en `#/proveedores`.

**No afecta a compras ya grabadas**: las compras son inmutables (FASE_0, trigger `bloquear_modificacion_compra`) — este cambio solo afecta a cómo se calculará el IVA en compras **nuevas** de estos 4 proveedores a partir de ahora. La lógica de IVA intracomunitario en sí ya estaba construida y probada desde Fase 2 (con un proveedor de prueba, porque hasta hoy ningún proveedor real la ejercitaba) — este cambio no toca código, solo datos.

## Conclusión

Queda cerrado el único punto de "revisión de datos reales" que seguía pendiente desde Fase 2. Con datos reales de verdad marcados como intracomunitarios, la próxima compra real a cualquiera de estos 4 proveedores ejercitará esa rama de código por primera vez con un caso real, no solo con el de prueba.
