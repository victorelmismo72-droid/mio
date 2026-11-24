-- NOTA: Prisma propone aqui (falso positivo ya documentado en otras
-- migraciones de este proyecto) hacer DROP/CREATE de
-- "partidas_numero_partida_seq" y "pedidos_numero_seq" porque no reconoce
-- una secuencia creada a mano fuera de su propio DEFAULT - se ha quitado de
-- aqui a proposito, no tocar esas dos secuencias en esta migracion.

-- CreateTable
CREATE TABLE "pedido_linea_partidas" (
    "id" SERIAL NOT NULL,
    "pedido_linea_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "numero_partida" INTEGER NOT NULL,
    "kilos" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "pedido_linea_partidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traspaso_linea_partidas" (
    "id" SERIAL NOT NULL,
    "traspaso_linea_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "numero_partida" INTEGER NOT NULL,
    "kilos" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "traspaso_linea_partidas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pedido_linea_partidas" ADD CONSTRAINT "pedido_linea_partidas_pedido_linea_id_fkey" FOREIGN KEY ("pedido_linea_id") REFERENCES "pedido_lineas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traspaso_linea_partidas" ADD CONSTRAINT "traspaso_linea_partidas_traspaso_linea_id_fkey" FOREIGN KEY ("traspaso_linea_id") REFERENCES "traspaso_lineas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
