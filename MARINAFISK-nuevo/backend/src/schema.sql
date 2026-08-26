-- MARINAFISK — Fase 1: esquema de base de datos
--
-- Este esquema replica, sin añadir lógica de negocio, la estructura de datos
-- que hoy vive en localStorage dentro de CARGA_DE_ALBARANES_MARINAFISK_20260821I.html
-- (ver MARINAFISK-nuevo/FASE_1_base_de_datos_backend_MARINAFISK.md).
--
-- Los nombres de columna siguen los nombres de campo reales usados en el HTML
-- (codigo, cif, op2, tipoIva, etc.) para que la migración del backup JSON sea
-- directa y para que Víctor pueda reconocer los datos.
--
-- Notas de diseño importantes (ver README.md del backend para más detalle):
--   1. `compras` y `compra_lineas` son DATO SAGRADO: no se conceden permisos
--      de UPDATE/DELETE al rol de la aplicación (ver marinafisk_grants.sql).
--   2. `proveedores.tipo_iva` es un campo NUEVO que no existe en los datos
--      actuales — lo pide la Fase 0 (punto 4) para la Fase 2. Se migra vacío
--      (NULL) y debe rellenarse antes de activar el cálculo de IVA de compras.
--   3. `partidas` no existe como entidad separada en el programa actual — es
--      un número que varias filas de `compras` comparten. Aquí se modela como
--      tabla propia porque la Fase 1 la pide explícitamente y porque ya existe
--      un dato real de negocio (partidas cerradas manualmente) que necesita
--      un sitio donde vivir.
--   4. `listas_precios` tampoco se guarda de forma permanente hoy (el modo
--      automático se calcula al vuelo y el modo manual es un borrador de un
--      solo día). Se crea la tabla porque la Fase 1 la exige; de momento solo
--      guardará lo que hoy es el borrador manual de cada día.

BEGIN;

-- ---------------------------------------------------------------------------
-- Utilidad: función para mantener mod_timestamp en cada UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_mod_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.mod_timestamp = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- clientes
-- ---------------------------------------------------------------------------
CREATE TABLE clientes (
  codigo            text PRIMARY KEY,
  nombre            text NOT NULL,
  cif               text,
  dir               text,
  cp                text,
  pob               text,
  prov              text,
  tel               text,
  email             text,
  pago              text,
  agencia           text,
  tipo_iva          text CHECK (tipo_iva IN ('NORMAL', 'INTRACOMUNITARIO', 'RECARGO_EQUIVALENCIA')),
  formato_etiqueta  text,
  mod_timestamp     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_clientes_mod_timestamp
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_mod_timestamp();

-- ---------------------------------------------------------------------------
-- articulos
-- ---------------------------------------------------------------------------
CREATE TABLE articulos (
  codigo              text PRIMARY KEY,
  descripcion         text NOT NULL,
  tipo                text CHECK (tipo IN ('FRESCO', 'MARISCO', 'ELABORADO')),
  pvp1                numeric(10,3),
  pvp2                numeric(10,3),
  iva                 numeric(5,2),
  cientifico          text,
  zona_fao            text,
  subzona             text,
  arte_pesca          text,
  barco               text,
  peso_etiqueta       text,
  calibre             text,
  modo_presentacion   text,
  forma_obtencion     text,
  nombre_frances      text,
  nombre_italiano     text,
  mod_timestamp       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_articulos_mod_timestamp
  BEFORE UPDATE ON articulos
  FOR EACH ROW EXECUTE FUNCTION set_mod_timestamp();

-- ---------------------------------------------------------------------------
-- proveedores
-- ---------------------------------------------------------------------------
CREATE TABLE proveedores (
  codigo          text PRIMARY KEY,
  nombre          text NOT NULL,
  -- op2: flag real ya existente en el programa actual ('S'/'N'). Es el mismo
  -- dato que las Fases 0/1 llaman "proveedor de subasta/lonja": activa el 2%
  -- de Obras del Puerto. Se conserva el nombre original del campo.
  op2             text NOT NULL DEFAULT 'N' CHECK (op2 IN ('S', 'N')),
  -- tipo_iva: CAMPO NUEVO, no existe en los datos actuales. Pendiente de
  -- rellenar por Víctor antes de activar el IVA de compras en Fase 2
  -- (ver FASE_0, punto 4 y punto 9).
  tipo_iva        text CHECK (tipo_iva IN ('NACIONAL', 'INTRACOMUNITARIO')),
  notas           text,
  mod_timestamp   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_proveedores_mod_timestamp
  BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION set_mod_timestamp();

-- ---------------------------------------------------------------------------
-- partidas (lotes de coste; ver nota de diseño arriba)
-- ---------------------------------------------------------------------------
CREATE TABLE partidas (
  partida         integer PRIMARY KEY,
  cerrada         boolean NOT NULL DEFAULT false,
  fecha_cierre    date,
  mod_timestamp   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_partidas_mod_timestamp
  BEFORE UPDATE ON partidas
  FOR EACH ROW EXECUTE FUNCTION set_mod_timestamp();

-- ---------------------------------------------------------------------------
-- compras — DATO SAGRADO: solo INSERT y lectura (ver marinafisk_grants.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE compras (
  id                  bigserial PRIMARY KEY,
  uid                 text NOT NULL UNIQUE,
  partida             integer REFERENCES partidas(partida),
  fecha               date NOT NULL,
  alb_proveedor       text,
  proveedor_cod       text REFERENCES proveedores(codigo),
  proveedor_nombre    text,
  total_kilos         numeric(12,3),
  total_base_zgz      numeric(12,2),
  total_base_real     numeric(12,2),
  total_iva           numeric(12,2),
  total_fact          numeric(12,2),
  mod_timestamp       timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_compras_fecha ON compras(fecha);
CREATE INDEX idx_compras_proveedor ON compras(proveedor_cod);
CREATE INDEX idx_compras_partida ON compras(partida);

CREATE TABLE compra_lineas (
  id              bigserial PRIMARY KEY,
  compra_id       bigint NOT NULL REFERENCES compras(id),
  orden           integer NOT NULL DEFAULT 0,
  producto        text REFERENCES articulos(codigo),
  descripcion     text,
  cajas           numeric(10,2),
  kilos           numeric(12,3),
  precio_kg       numeric(10,3),
  base_zgz        numeric(12,2),
  base_zgz_iva    numeric(12,2),
  op2             numeric(12,2),
  base_real       numeric(12,2),
  iva             numeric(12,2),
  total_fact      numeric(12,2),
  control         boolean DEFAULT false
);

CREATE INDEX idx_compra_lineas_compra ON compra_lineas(compra_id);
CREATE INDEX idx_compra_lineas_producto ON compra_lineas(producto);

-- ---------------------------------------------------------------------------
-- historial (pedidos / albaranes de venta)
-- ---------------------------------------------------------------------------
CREATE TABLE historial (
  id                  bigserial PRIMARY KEY,
  num                 integer NOT NULL,
  uid                 text NOT NULL UNIQUE,
  fecha               date NOT NULL,
  cliente_cod         text REFERENCES clientes(codigo),
  cliente_nombre      text,
  cliente_cif         text,
  cliente_dir         text,
  cliente_pob         text,
  cliente_provincia   text,
  cliente_tel         text,
  agencia             text,
  forma_pago          text,
  tipo_iva            text,
  base                numeric(12,2),
  iva                 numeric(12,2),
  total               numeric(12,2),
  mod_timestamp       timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_fecha ON historial(fecha);
CREATE INDEX idx_historial_cliente ON historial(cliente_cod);
CREATE INDEX idx_historial_num ON historial(num);

CREATE TRIGGER trg_historial_mod_timestamp
  BEFORE UPDATE ON historial
  FOR EACH ROW EXECUTE FUNCTION set_mod_timestamp();

CREATE TABLE historial_lineas (
  id              bigserial PRIMARY KEY,
  historial_id    bigint NOT NULL REFERENCES historial(id) ON DELETE CASCADE,
  orden           integer NOT NULL DEFAULT 0,
  art             text REFERENCES articulos(codigo),
  descripcion     text,
  desc_edit       text,
  cant            numeric(10,2),
  peso            numeric(12,3),
  precio          numeric(10,3),
  dcto            numeric(5,2) DEFAULT 0,
  iva             numeric(5,2) DEFAULT 10,
  total           numeric(12,2),
  partida         integer REFERENCES partidas(partida)
);

CREATE INDEX idx_historial_lineas_historial ON historial_lineas(historial_id);
CREATE INDEX idx_historial_lineas_partida ON historial_lineas(partida);

-- ---------------------------------------------------------------------------
-- historial_trp (traspasos)
-- ---------------------------------------------------------------------------
CREATE TABLE historial_trp (
  id              bigserial PRIMARY KEY,
  num             integer NOT NULL,
  uid             text NOT NULL UNIQUE,
  fecha           date NOT NULL,
  total_kg        numeric(12,3),
  base            numeric(12,2),
  total           numeric(12,2),
  mod_timestamp   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_trp_fecha ON historial_trp(fecha);

CREATE TRIGGER trg_historial_trp_mod_timestamp
  BEFORE UPDATE ON historial_trp
  FOR EACH ROW EXECUTE FUNCTION set_mod_timestamp();

CREATE TABLE historial_trp_lineas (
  id              bigserial PRIMARY KEY,
  trp_id          bigint NOT NULL REFERENCES historial_trp(id) ON DELETE CASCADE,
  orden           integer NOT NULL DEFAULT 0,
  art             text REFERENCES articulos(codigo),
  descripcion     text,
  desc_edit       text,
  cajas           numeric(10,2),
  peso            numeric(12,3),
  precio          numeric(10,3),
  partida         integer REFERENCES partidas(partida),
  total           numeric(12,2)
);

CREATE INDEX idx_historial_trp_lineas_trp ON historial_trp_lineas(trp_id);

-- ---------------------------------------------------------------------------
-- repartos (Reparto Super)
-- ---------------------------------------------------------------------------
CREATE TABLE repartos (
  id                    bigserial PRIMARY KEY,
  num                   integer NOT NULL,
  uid                   text NOT NULL UNIQUE,
  fecha                 date NOT NULL,
  destinatario_nombre   text,
  destinatario_ciudad   text,
  conductor             text,
  total_cajas           numeric(10,2),
  total_kg              numeric(12,3),
  mod_timestamp         timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_repartos_fecha ON repartos(fecha);

CREATE TRIGGER trg_repartos_mod_timestamp
  BEFORE UPDATE ON repartos
  FOR EACH ROW EXECUTE FUNCTION set_mod_timestamp();

CREATE TABLE repartos_lineas (
  id                bigserial PRIMARY KEY,
  reparto_id        bigint NOT NULL REFERENCES repartos(id) ON DELETE CASCADE,
  orden             integer NOT NULL DEFAULT 0,
  producto          text REFERENCES articulos(codigo),
  descripcion       text,
  lote              text,
  barco             text,
  subzona           text,
  arte_pesca        text,
  cajas             numeric(10,2),
  kg                numeric(12,3),
  peso_etiqueta     text,
  cajas_impresas    numeric(10,2) DEFAULT 0
);

CREATE INDEX idx_repartos_lineas_reparto ON repartos_lineas(reparto_id);

-- ---------------------------------------------------------------------------
-- listas_precios (ver nota de diseño arriba: hoy solo existe como borrador
-- de un día en el programa actual; aquí se persiste igual, sin inventar
-- historial que no existe)
-- ---------------------------------------------------------------------------
CREATE TABLE listas_precios (
  id              bigserial PRIMARY KEY,
  tipo            text NOT NULL CHECK (tipo IN ('PESCADERIAS', 'MAYORISTAS')),
  fecha           date NOT NULL,
  modo            text NOT NULL DEFAULT 'MANUAL' CHECK (modo IN ('AUTOMATICO', 'MANUAL')),
  mod_timestamp   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, fecha)
);

CREATE TRIGGER trg_listas_precios_mod_timestamp
  BEFORE UPDATE ON listas_precios
  FOR EACH ROW EXECUTE FUNCTION set_mod_timestamp();

CREATE TABLE listas_precios_lineas (
  id              bigserial PRIMARY KEY,
  lista_id        bigint NOT NULL REFERENCES listas_precios(id) ON DELETE CASCADE,
  orden           integer NOT NULL DEFAULT 0,
  descripcion     text,
  precio          numeric(10,3),
  coste           numeric(10,3),
  existencias     numeric(10,2)
);

CREATE INDEX idx_listas_precios_lineas_lista ON listas_precios_lineas(lista_id);

-- ---------------------------------------------------------------------------
-- contadores (nextPedido, nextTrp, nextReparto, nextPartida)
-- ---------------------------------------------------------------------------
CREATE TABLE contadores (
  nombre  text PRIMARY KEY,
  valor   integer NOT NULL
);

INSERT INTO contadores (nombre, valor) VALUES
  ('nextPedido', 12000),
  ('nextTrp', 1),
  ('nextReparto', 1),
  ('nextPartida', 1);

-- ---------------------------------------------------------------------------
-- log_escrituras — log básico de qué se ha escrito y cuándo (Fase 1, punto 3)
-- ---------------------------------------------------------------------------
CREATE TABLE log_escrituras (
  id            bigserial PRIMARY KEY,
  tabla         text NOT NULL,
  operacion     text NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
  referencia    text,
  detalle       jsonb,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_log_escrituras_tabla ON log_escrituras(tabla);
CREATE INDEX idx_log_escrituras_creado_en ON log_escrituras(creado_en);

COMMIT;
