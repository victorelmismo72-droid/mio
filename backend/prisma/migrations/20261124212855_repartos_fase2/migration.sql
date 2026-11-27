-- Secuencia real para el numero de reparto (ver Reparto.numero en
-- schema.prisma) - mismo patron ya usado para pedidos_numero_seq y
-- traspasos_numero_seq. Arranca DESPUES del numero mas alto ya existente
-- (nunca antes de 1), para no chocar con repartos que ya hubiera.
CREATE SEQUENCE "repartos_numero_seq";
SELECT setval('repartos_numero_seq', GREATEST(1, (SELECT COALESCE(MAX("numero"), 0) FROM "repartos")), (SELECT COUNT(*) FROM "repartos") > 0);

-- DropForeignKey
ALTER TABLE "reparto_lineas" DROP CONSTRAINT "reparto_lineas_reparto_id_fkey";

-- AlterTable: columnas de trazabilidad por linea (lote/barco/subzona/
-- arte de pesca/peso de etiqueta) - ver el comentario de RepartoLinea.
ALTER TABLE "reparto_lineas" ADD COLUMN     "arte_pesca" TEXT,
ADD COLUMN     "barco" TEXT,
ADD COLUMN     "lote" TEXT,
ADD COLUMN     "peso_etiqueta" DECIMAL(10,2),
ADD COLUMN     "subzona" TEXT;

-- AlterTable: PALETS (documento electronico de control, ver Pedido/
-- Traspaso), secuencia real de numero, y total_cajas admite decimales
-- (la suma de "cajas" en esta pantalla admite la misma expresion que el
-- resto del programa, igual que Kilos en Compras).
ALTER TABLE "repartos" ADD COLUMN     "palets" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "numero" SET DEFAULT nextval('repartos_numero_seq'),
ALTER COLUMN "total_cajas" SET DATA TYPE DECIMAL(10,2);

-- AddForeignKey: se vuelve a crear con ON DELETE CASCADE (antes no lo
-- tenia - las rutas borraban las lineas a mano antes de borrar la
-- cabecera; ahora la base de datos lo garantiza tambien).
ALTER TABLE "reparto_lineas" ADD CONSTRAINT "reparto_lineas_reparto_id_fkey" FOREIGN KEY ("reparto_id") REFERENCES "repartos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
