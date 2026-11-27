/*
  Warnings:

  - Added the required column `modificado_en` to the `compras` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "compras" ADD COLUMN     "anulada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anulada_en" TIMESTAMP(3),
ADD COLUMN     "anulada_por" TEXT,
ADD COLUMN     "modificado_en" TIMESTAMP(3);

-- Las compras ya existentes no tenian fecha de modificacion - se rellenan
-- con su propia fecha de creacion (lo mas fiel que podemos saber: nunca se
-- habian modificado hasta ahora).
UPDATE "compras" SET "modificado_en" = "creado_en" WHERE "modificado_en" IS NULL;
ALTER TABLE "compras" ALTER COLUMN "modificado_en" SET NOT NULL;

-- NOTA: prisma migrate diff propuso aqui tambien borrar y recrear la
-- secuencia "partidas_numero_partida_seq" (falso positivo de siempre, ver
-- las notas equivalentes en migraciones anteriores) - quitado a proposito.
