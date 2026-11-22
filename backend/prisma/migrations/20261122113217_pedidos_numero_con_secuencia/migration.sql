-- Secuencia real para el numero de pedido (ver Pedido.numero en
-- schema.prisma) - mismo patron ya usado para partidas_numero_partida_seq.
-- Se arranca DESPUES del numero mas alto ya existente (nunca antes de 1),
-- para no chocar con pedidos que ya hubiera en la base de datos.
CREATE SEQUENCE "pedidos_numero_seq";
SELECT setval('pedidos_numero_seq', GREATEST(1, (SELECT COALESCE(MAX("numero"), 0) FROM "pedidos")), (SELECT COUNT(*) FROM "pedidos") > 0);

-- AlterTable
ALTER TABLE "pedidos" ALTER COLUMN "numero" SET DEFAULT nextval('pedidos_numero_seq');

-- NOTA: Prisma tambien propone (falso positivo, ya documentado en otras
-- migraciones de este proyecto) hacer DROP/CREATE de
-- "partidas_numero_partida_seq" porque no reconoce una secuencia creada a
-- mano fuera de su propio DEFAULT - se ha quitado de aqui a proposito, no
-- tocar esa secuencia en esta migracion.
