-- NOTA: Prisma propone aqui (falso positivo ya documentado en otras
-- migraciones de este proyecto) hacer DROP/CREATE de
-- "partidas_numero_partida_seq", "pedidos_numero_seq" y
-- "traspasos_numero_seq" porque no reconoce una secuencia creada a mano
-- fuera de su propio DEFAULT - se ha quitado de aqui a proposito, no tocar
-- esas tres secuencias en esta migracion.

-- AlterTable
ALTER TABLE "pedido_lineas" ADD COLUMN "piezas" INTEGER;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN "palets" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "traspaso_lineas" ADD COLUMN "precio" DECIMAL(10,4) NOT NULL DEFAULT 0,
ADD COLUMN "total" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "traspasos" ADD COLUMN "palets" INTEGER NOT NULL DEFAULT 0;
