-- NOTA: Prisma propone aqui (falso positivo ya documentado en otras
-- migraciones de este proyecto) hacer DROP/CREATE de
-- "partidas_numero_partida_seq" y "pedidos_numero_seq" porque no reconoce
-- una secuencia creada a mano fuera de su propio DEFAULT - se ha quitado de
-- aqui a proposito, no tocar esas dos secuencias en esta migracion.

-- Secuencia real para Traspaso.numero (mismo patron que
-- pedidos_numero_seq/partidas_numero_partida_seq) - arranca despues del
-- numero mas alto ya existente, nunca antes de 1.
CREATE SEQUENCE "traspasos_numero_seq";
SELECT setval('traspasos_numero_seq', GREATEST(1, (SELECT COALESCE(MAX("numero"), 0) FROM "traspasos")), (SELECT COUNT(*) FROM "traspasos") > 0);
ALTER TABLE "traspasos" ALTER COLUMN "numero" SET DEFAULT nextval('traspasos_numero_seq');

-- AlterTable
ALTER TABLE "traspaso_lineas" ADD COLUMN "piezas" INTEGER;
