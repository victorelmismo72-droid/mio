-- CreateTable
CREATE TABLE "existencias" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "existencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "existencia_lineas" (
    "id" SERIAL NOT NULL,
    "existencia_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "separador" BOOLEAN NOT NULL DEFAULT false,
    "articulo_id" INTEGER,
    "descripcion_libre" TEXT,
    "cantidad" DECIMAL(10,2),
    "peso" DECIMAL(10,2),
    "precio" DECIMAL(10,2),
    "nota" TEXT,
    "vendido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "existencia_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "existencias_fecha_key" ON "existencias"("fecha");

-- AddForeignKey
ALTER TABLE "existencia_lineas" ADD CONSTRAINT "existencia_lineas_existencia_id_fkey" FOREIGN KEY ("existencia_id") REFERENCES "existencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencia_lineas" ADD CONSTRAINT "existencia_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
