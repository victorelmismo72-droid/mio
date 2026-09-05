-- CreateEnum
CREATE TYPE "TipoIvaCliente" AS ENUM ('NORMAL', 'INTRACOMUNITARIO', 'RECARGO_EQUIVALENCIA');

-- CreateEnum
CREATE TYPE "TipoIvaProveedor" AS ENUM ('NACIONAL', 'INTRACOMUNITARIO');

-- CreateEnum
CREATE TYPE "TipoListaPrecio" AS ENUM ('MAYORISTA', 'PESCADERIA');

-- CreateEnum
CREATE TYPE "ModoListaPrecio" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cif" TEXT,
    "direccion" TEXT,
    "cp" TEXT,
    "poblacion" TEXT,
    "provincia" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "forma_pago" TEXT,
    "agencia" TEXT,
    "tipo_iva" "TipoIvaCliente" NOT NULL,
    "formato_etiqueta" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "es_subasta_op" BOOLEAN NOT NULL DEFAULT false,
    "tipo_iva" "TipoIvaProveedor" NOT NULL,
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articulos" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo" TEXT,
    "pvp1" DECIMAL(10,2),
    "pvp2" DECIMAL(10,2),
    "iva_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "familia_prefijo" TEXT,
    "primera_palabra_desc" TEXT,
    "cientifico" TEXT,
    "zona_fao" TEXT,
    "subzona" TEXT,
    "arte_pesca" TEXT,
    "barco" TEXT,
    "peso_etiqueta" TEXT,
    "calibre" TEXT,
    "modo_presentacion" TEXT,
    "forma_obtencion" TEXT,
    "nombre_frances" TEXT,
    "nombre_italiano" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras" (
    "id" SERIAL NOT NULL,
    "numero_partida" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "albaran_proveedor" TEXT,
    "proveedor_id" INTEGER NOT NULL,
    "proveedor_nombre_snapshot" TEXT NOT NULL,
    "total_kilos" DECIMAL(10,2) NOT NULL,
    "total_base_zgz" DECIMAL(10,2) NOT NULL,
    "total_base_real" DECIMAL(10,2) NOT NULL,
    "total_iva" DECIMAL(10,2) NOT NULL,
    "total_factura" DECIMAL(10,2) NOT NULL,
    "puesto_origen" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra_lineas" (
    "id" SERIAL NOT NULL,
    "compra_id" INTEGER NOT NULL,
    "articulo_id" INTEGER NOT NULL,
    "cajas" INTEGER,
    "kilos" DECIMAL(10,2) NOT NULL,
    "precio_kg" DECIMAL(10,4) NOT NULL,
    "base_zgz" DECIMAL(10,2) NOT NULL,
    "base_zgz_con_iva" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "op2_importe" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "base_real" DECIMAL(10,2) NOT NULL,
    "iva_importe" DECIMAL(10,2) NOT NULL,
    "total_factura" DECIMAL(10,2) NOT NULL,
    "control" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compra_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partidas" (
    "id" SERIAL NOT NULL,
    "numero_partida" INTEGER NOT NULL,
    "cerrada_manual" BOOLEAN NOT NULL DEFAULT false,
    "cerrada_en" TIMESTAMP(3),
    "cerrada_por" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "cliente_nombre_snapshot" TEXT NOT NULL,
    "cliente_cif_snapshot" TEXT,
    "cliente_dir_snapshot" TEXT,
    "cliente_pob_snapshot" TEXT,
    "cliente_tel_snapshot" TEXT,
    "agencia" TEXT,
    "forma_pago" TEXT,
    "tipo_iva_aplicado" TEXT NOT NULL,
    "base_imponible" DECIMAL(10,2) NOT NULL,
    "iva" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "puesto_origen" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modificado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_lineas" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "articulo_id" INTEGER NOT NULL,
    "descripcion_editada" TEXT,
    "cantidad" DECIMAL(10,2),
    "peso" DECIMAL(10,2) NOT NULL,
    "precio" DECIMAL(10,4) NOT NULL,
    "descuento" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "iva_pct" DECIMAL(5,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "partida_numero" INTEGER,

    CONSTRAINT "pedido_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traspasos" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "total_kg" DECIMAL(10,2) NOT NULL,
    "base" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "puesto_origen" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traspasos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traspaso_lineas" (
    "id" SERIAL NOT NULL,
    "traspaso_id" INTEGER NOT NULL,
    "articulo_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2),
    "peso" DECIMAL(10,2) NOT NULL,
    "partida_id" INTEGER,

    CONSTRAINT "traspaso_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repartos" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "destinatario_nombre" TEXT,
    "destinatario_ciudad" TEXT,
    "conductor" TEXT,
    "total_cajas" INTEGER,
    "total_kg" DECIMAL(10,2) NOT NULL,
    "puesto_origen" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repartos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reparto_lineas" (
    "id" SERIAL NOT NULL,
    "reparto_id" INTEGER NOT NULL,
    "articulo_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2),
    "peso" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "reparto_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listas_precio" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoListaPrecio" NOT NULL,
    "fecha" DATE NOT NULL,
    "modo" "ModoListaPrecio" NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listas_precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lista_precio_lineas" (
    "id" SERIAL NOT NULL,
    "lista_precio_id" INTEGER NOT NULL,
    "articulo_id" INTEGER NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "lista_precio_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_escrituras" (
    "id" SERIAL NOT NULL,
    "tabla" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "registro_id" INTEGER,
    "puesto_origen" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_escrituras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_codigo_key" ON "clientes"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_codigo_key" ON "proveedores"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "articulos_codigo_key" ON "articulos"("codigo");

-- CreateIndex
CREATE INDEX "compras_numero_partida_idx" ON "compras"("numero_partida");

-- CreateIndex
CREATE UNIQUE INDEX "partidas_numero_partida_key" ON "partidas"("numero_partida");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numero_key" ON "pedidos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "traspasos_numero_key" ON "traspasos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "repartos_numero_key" ON "repartos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "listas_precio_tipo_fecha_key" ON "listas_precio"("tipo", "fecha");

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_lineas" ADD CONSTRAINT "compra_lineas_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_lineas" ADD CONSTRAINT "compra_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_lineas" ADD CONSTRAINT "pedido_lineas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_lineas" ADD CONSTRAINT "pedido_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_traspaso_id_fkey" FOREIGN KEY ("traspaso_id") REFERENCES "traspasos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traspaso_lineas" ADD CONSTRAINT "traspaso_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reparto_lineas" ADD CONSTRAINT "reparto_lineas_reparto_id_fkey" FOREIGN KEY ("reparto_id") REFERENCES "repartos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reparto_lineas" ADD CONSTRAINT "reparto_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_precio_lineas" ADD CONSTRAINT "lista_precio_lineas_lista_precio_id_fkey" FOREIGN KEY ("lista_precio_id") REFERENCES "listas_precio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_precio_lineas" ADD CONSTRAINT "lista_precio_lineas_articulo_id_fkey" FOREIGN KEY ("articulo_id") REFERENCES "articulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
