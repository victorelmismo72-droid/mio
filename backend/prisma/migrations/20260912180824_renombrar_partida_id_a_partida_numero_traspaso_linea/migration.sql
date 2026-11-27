/*
  Warnings:

  - You are about to drop the column `partida_id` on the `traspaso_lineas` table. All the data in the column will be lost.

*/
-- AlterTable
-- NOTA: prisma migrate diff propuso aqui tambien borrar y recrear la
-- secuencia "partidas_numero_partida_seq" (falso positivo: Prisma no sabe
-- que esa secuencia se creo a mano en la migracion inicial, ver
-- 20260912174616_init_fase1/migration.sql) - se ha quitado esa parte a
-- proposito, borrarla habria roto la generacion automatica del numero de
-- partida para las compras nuevas.
ALTER TABLE "traspaso_lineas" DROP COLUMN "partida_id",
ADD COLUMN     "partida_numero" INTEGER;
