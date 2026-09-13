-- DropForeignKey
ALTER TABLE "lista_precio_lineas" DROP CONSTRAINT "lista_precio_lineas_articulo_id_fkey";

-- AlterTable
ALTER TABLE "lista_precio_lineas" ADD COLUMN     "coste" DECIMAL(10,2),
ADD COLUMN     "descripcion_libre" TEXT,
ADD COLUMN     "existencias" TEXT,
ALTER COLUMN "articulo_id" DROP NOT NULL;

-- NOTA: prisma migrate diff propuso aqui tambien borrar y recrear la
-- secuencia "partidas_numero_partida_seq" (falso positivo de siempre, ver
-- las notas equivalentes en migraciones anteriores) - quitado a proposito.

-- AddForeignKey
ALTER TABLE "lista_precio_lineas" ADD CONSTRAINT "lista_precio_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK a mano (Prisma no lo expresa en el schema): una fila de lista de
-- precio tiene que traer articulo_id (de catalogo) O descripcion_libre
-- (texto suelto, igual que el modo manual del HTML actual) - nunca ninguno
-- de los dos, o quedaria una fila sin producto identificable.
ALTER TABLE "lista_precio_lineas" ADD CONSTRAINT "lista_precio_lineas_producto_check"
  CHECK ("articulo_id" IS NOT NULL OR "descripcion_libre" IS NOT NULL);
