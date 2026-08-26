-- MARINAFISK — permisos del rol de aplicación
--
-- Objetivo (Fase 1, punto 5): "compras no tiene forma de modificarse por
-- error desde el backend". Esto se refuerza a nivel de base de datos, no solo
-- quitando las rutas PUT/DELETE en la API — así, aunque haya un fallo en el
-- código del backend, Postgres seguirá rechazando el intento.
--
-- Sustituye marinafisk_app / el nombre de base de datos si Víctor usa otros.

-- Ejecutar como superusuario (postgres) después de crear el esquema.

REVOKE UPDATE, DELETE ON compras, compra_lineas FROM marinafisk_app;
GRANT SELECT, INSERT ON compras, compra_lineas TO marinafisk_app;

-- El resto de tablas sí permiten el ciclo completo (crear, leer, actualizar,
-- borrar) desde la API, tal como pide la Fase 1.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  clientes, articulos, proveedores, partidas,
  historial, historial_lineas,
  historial_trp, historial_trp_lineas,
  repartos, repartos_lineas,
  listas_precios, listas_precios_lineas,
  contadores, log_escrituras
TO marinafisk_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marinafisk_app;
