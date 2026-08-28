-- MARINAFISK — Fase 1: esquema de base de datos
--
-- Refleja los datos reales encontrados en el backup JSON y en el HTML actual
-- (claves usadas por DB.get/DB.set: clientes, articulos, proveedores, compras,
-- historial, historialTrp, repartos), más los campos nuevos de clasificación
-- fiscal pedidos en la Fase 0/1 (tipo_iva, recargo_equivalencia).
--
-- Esta fase NO implementa lógica de negocio (2% OP, IVA, margen, partidas) —
-- solo almacenamiento. Los cálculos siguen viviendo en el HTML actual mientras
-- se construye la Fase 2.

-- ---------------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------------

CREATE TABLE clientes (
  id                    SERIAL PRIMARY KEY,
  codigo                TEXT UNIQUE NOT NULL,
  nombre                TEXT,
  cif                    TEXT,
  direccion             TEXT,
  cp                    TEXT,
  poblacion             TEXT,
  provincia             TEXT,
  telefono              TEXT,
  email                 TEXT,
  forma_pago            TEXT,
  agencia               TEXT,
  formato_etiqueta      TEXT,
  -- Clasificación fiscal (Fase 0 punto 4 / Fase 1 punto 2.1): dos campos
  -- independientes y combinables, no un único enum.
  tipo_iva              TEXT NOT NULL DEFAULT 'NACIONAL'
                          CHECK (tipo_iva IN ('NACIONAL','INTRACOMUNITARIO')),
  recargo_equivalencia  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Valor original del campo `tipoIva` tal y como venía en el backup
  -- (NORMAL / RECARGO_EQUIVALENCIA / INTRACOMUNITARIO / vacío), conservado
  -- para trazabilidad porque el dato antiguo mezclaba origen y recargo en
  -- un único valor — ver notas de migración.
  tipo_iva_legacy_raw   TEXT,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE articulos (
  id                SERIAL PRIMARY KEY,
  codigo            TEXT UNIQUE NOT NULL,
  descripcion       TEXT,
  tipo              TEXT,
  pvp1              NUMERIC,
  pvp2              NUMERIC,
  iva_pct           NUMERIC NOT NULL DEFAULT 10,
  cientifico        TEXT,
  zona_fao          TEXT,
  subzona           TEXT,
  arte_pesca        TEXT,
  barco             TEXT,
  peso_etiqueta     TEXT,
  modo_presentacion TEXT,
  forma_obtencion   TEXT,
  nombre_frances    TEXT,
  nombre_italiano   TEXT,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE proveedores (
  id             SERIAL PRIMARY KEY,
  codigo         TEXT UNIQUE NOT NULL,
  nombre         TEXT,
  -- sustituye a op2:'S'/'N'. Determina si se aplica el 2% de OP (Fase 0 punto 2).
  es_subasta_op  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Nuevo (Fase 1 punto 2.1). El backup no distinguía esto todavía: se migra
  -- todo como NACIONAL por defecto y debe revisarse con Víctor qué proveedores
  -- son en realidad intracomunitarios (ver documento de verificación).
  tipo_iva       TEXT NOT NULL DEFAULT 'NACIONAL'
                   CHECK (tipo_iva IN ('NACIONAL','INTRACOMUNITARIO')),
  notas          TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Compras — dato sagrado (Fase 0 punto 3 / Fase 1 punto 2): solo INSERT.
-- ---------------------------------------------------------------------------

CREATE TABLE compras (
  id                SERIAL PRIMARY KEY,
  -- Número de partida de negocio (campo `partida` del JSON). No se declara
  -- UNIQUE: en los datos reales varias compras históricas comparten el mismo
  -- número de partida (reparto de un mismo lote en varias entregas/líneas).
  numero_partida    INTEGER,
  fecha             DATE NOT NULL,
  alb_proveedor     TEXT,
  proveedor_codigo  TEXT REFERENCES proveedores(codigo),
  -- Nombre del proveedor tal y como estaba en el momento de la compra
  -- (instantánea histórica; el maestro de proveedores puede cambiar después).
  proveedor_nombre  TEXT,
  total_kilos       NUMERIC,
  total_base_zgz    NUMERIC,
  total_base_real   NUMERIC,
  total_iva         NUMERIC,
  total_fact        NUMERIC,
  puesto_origen     TEXT,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Sin modificado_en a propósito: esta tabla no se actualiza nunca.
);

CREATE TABLE compra_lineas (
  id            SERIAL PRIMARY KEY,
  compra_id     INTEGER NOT NULL REFERENCES compras(id),
  producto      TEXT,
  descripcion   TEXT,
  cajas         NUMERIC,
  kilos         NUMERIC,
  precio_kg     NUMERIC,
  control       BOOLEAN,
  base_zgz      NUMERIC,
  base_zgz_iva  NUMERIC,
  op2           NUMERIC,
  base_real     NUMERIC,
  iva           NUMERIC,
  total_fact    NUMERIC
);

-- Bloqueo estructural de "compras = dato sagrado": ni UPDATE ni DELETE,
-- desde ningún rol, en ningún caso. Cualquier corrección futura debe hacerse
-- con un registro de ajuste nuevo, nunca sobrescribiendo (ver Fase 0 punto 3).
CREATE OR REPLACE FUNCTION bloquear_modificacion_compras()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Las compras son inmutables: no se permite % en % (id=%)',
    TG_OP, TG_TABLE_NAME, COALESCE(OLD.id, NULL);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compras_inmutable
  BEFORE UPDATE OR DELETE ON compras
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_compras();

CREATE TRIGGER trg_compra_lineas_inmutable
  BEFORE UPDATE OR DELETE ON compra_lineas
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_compras();

-- ---------------------------------------------------------------------------
-- Pedidos (albaranes de venta) — `historial` en el programa actual
-- ---------------------------------------------------------------------------

CREATE TABLE pedidos (
  id                      SERIAL PRIMARY KEY,
  -- `numero` es unico dentro de cada ano (anio, numero), no globalmente:
  -- el cierre de ano (Fase 3 punto 1bis) reinicia la numeracion cada ano
  -- natural, y dos pedidos de anos distintos pueden compartir numero sin
  -- chocar. `anio` se calcula siempre a partir de `fecha` en texto local
  -- (nunca con conversion UTC, ver Fase 0 punto 7).
  numero                  INTEGER NOT NULL,
  anio                    INTEGER NOT NULL,
  fecha                   DATE NOT NULL,
  cliente_codigo          TEXT REFERENCES clientes(codigo),
  -- Instantánea de los datos del cliente en el momento del pedido (el HTML
  -- actual ya guarda esta copia junto al pedido, independiente del maestro).
  cliente_nombre_snapshot TEXT,
  cliente_cif_snapshot    TEXT,
  cliente_dir_snapshot    TEXT,
  cliente_pob_snapshot    TEXT,
  cliente_tel_snapshot    TEXT,
  agencia                 TEXT,
  forma_pago              TEXT,
  base                    NUMERIC,
  iva                     NUMERIC,
  total                   NUMERIC,
  puesto_origen           TEXT,
  creado_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, numero)
);

CREATE TABLE pedido_lineas (
  id                  SERIAL PRIMARY KEY,
  pedido_id           INTEGER NOT NULL REFERENCES pedidos(id),
  articulo_codigo     TEXT,
  descripcion         TEXT,
  descripcion_editada TEXT,
  cantidad            NUMERIC,
  peso                NUMERIC,
  precio              NUMERIC,
  descuento           NUMERIC,
  iva_pct             NUMERIC,
  total               NUMERIC,
  -- Partida asignada (Fase 0 punto 3). NULL = pendiente de asignación manual
  -- (sustituye a la "pantalla de excepciones" del programa actual).
  partida_numero      INTEGER,
  partida_manual      BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------------
-- Traspasos internos — `historialTrp`
-- ---------------------------------------------------------------------------

CREATE TABLE traspasos (
  id             SERIAL PRIMARY KEY,
  numero         INTEGER NOT NULL,
  anio           INTEGER NOT NULL,
  fecha          DATE NOT NULL,
  base           NUMERIC,
  total          NUMERIC,
  total_kg       NUMERIC,
  puesto_origen  TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, numero)
);

CREATE TABLE traspaso_lineas (
  id                  SERIAL PRIMARY KEY,
  traspaso_id         INTEGER NOT NULL REFERENCES traspasos(id),
  articulo_codigo     TEXT,
  descripcion         TEXT,
  descripcion_editada TEXT,
  cajas               NUMERIC,
  peso                NUMERIC,
  precio              NUMERIC,
  total               NUMERIC,
  partida_numero      INTEGER
);

-- ---------------------------------------------------------------------------
-- Repartos (Reparto Super)
-- ---------------------------------------------------------------------------

CREATE TABLE repartos (
  id                     SERIAL PRIMARY KEY,
  numero                 INTEGER NOT NULL,
  anio                   INTEGER NOT NULL,
  fecha                  DATE NOT NULL,
  destinatario_nombre    TEXT,
  destinatario_ciudad    TEXT,
  conductor              TEXT,
  total_cajas            NUMERIC,
  total_kg               NUMERIC,
  puesto_origen          TEXT,
  creado_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, numero)
);

CREATE TABLE reparto_lineas (
  id             SERIAL PRIMARY KEY,
  reparto_id     INTEGER NOT NULL REFERENCES repartos(id),
  producto       TEXT,
  descripcion    TEXT,
  cajas          NUMERIC,
  kg             NUMERIC,
  lote           TEXT,
  arte_pesca     TEXT,
  barco          TEXT,
  subzona        TEXT,
  peso_etiqueta  TEXT,
  cajas_impresas NUMERIC
);

-- ---------------------------------------------------------------------------
-- Cierre manual de partidas (Fase 0 punto 3 / Fase 2 punto 3)
-- Completamente aparte de `compras`: no la toca ni la sincroniza para nada.
-- Una partida rara vez llega a 0 kilos exactos (mermas, pérdida de peso en
-- procesado), así que el cierre es una decisión manual de Víctor, no un
-- cálculo automático.
-- ---------------------------------------------------------------------------

CREATE TABLE partidas_cerradas (
  numero_partida INTEGER PRIMARY KEY,
  cerrada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_por    TEXT
);

-- ---------------------------------------------------------------------------
-- Parametros de negocio configurables (ej. margen minimo, % de Recargo de
-- Equivalencia) - ver src/negocio/configuracion.js. Si una clave no esta
-- aqui, se usa el valor por defecto del propio codigo.
-- ---------------------------------------------------------------------------

CREATE TABLE configuracion (
  clave         TEXT PRIMARY KEY,
  valor         TEXT NOT NULL,
  modificado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Listas de precios (Pescaderías / Mayoristas) — Fase 0 punto 5
-- ---------------------------------------------------------------------------

CREATE TABLE listas_precio (
  id     SERIAL PRIMARY KEY,
  tipo   TEXT NOT NULL CHECK (tipo IN ('MAYORISTA','PESCADERIA')),
  fecha  DATE NOT NULL,
  modo   TEXT NOT NULL CHECK (modo IN ('AUTO','MANUAL')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, fecha)
);

CREATE TABLE lista_precio_lineas (
  id               SERIAL PRIMARY KEY,
  lista_precio_id  INTEGER NOT NULL REFERENCES listas_precio(id),
  articulo_codigo  TEXT,
  precio           NUMERIC
);

-- ---------------------------------------------------------------------------
-- Contadores correlativos (sustituyen a nextPedido/nextPartida/nextReparto/nextTrp)
-- Usar secuencias reales de Postgres elimina de raíz el fallo de colisión de
-- números descrito en Fase 0 punto 6 / Fase 3 punto 2.
-- ---------------------------------------------------------------------------

CREATE SEQUENCE seq_pedido_numero;
CREATE SEQUENCE seq_partida_numero;
CREATE SEQUENCE seq_reparto_numero;
CREATE SEQUENCE seq_traspaso_numero;

-- ---------------------------------------------------------------------------
-- Log de escritura (Fase 1 punto 3) — útil para depurar sincronización en Fase 3
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  tabla         TEXT NOT NULL,
  accion        TEXT NOT NULL CHECK (accion IN ('INSERT','UPDATE','DELETE')),
  registro_id   TEXT,
  puesto_origen TEXT,
  detalle       JSONB,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_fecha ON pedidos(fecha);
CREATE INDEX idx_compras_fecha ON compras(fecha);
CREATE INDEX idx_compras_numero_partida ON compras(numero_partida);
CREATE INDEX idx_pedido_lineas_partida ON pedido_lineas(partida_numero);
CREATE INDEX idx_traspasos_fecha ON traspasos(fecha);
CREATE INDEX idx_repartos_fecha ON repartos(fecha);

-- ---------------------------------------------------------------------------
-- Fase 3: usuarios reales, sesiones y cierre de año
--
-- Modelo de permisos (Fase 3 punto 1): todos los usuarios pueden hacer lo
-- mismo en el dia a dia operativo (ESTANDAR). Solo dos cosas quedan
-- reservadas al rol ADMINISTRADOR: modificar parametros/usuarios del
-- programa, y el cierre de ano. No hay jerarquia operativa entre usuarios.
-- ---------------------------------------------------------------------------

CREATE TABLE usuarios (
  id             SERIAL PRIMARY KEY,
  usuario        TEXT UNIQUE NOT NULL,
  nombre         TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'ESTANDAR' CHECK (rol IN ('ESTANDAR','ADMINISTRADOR')),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modificado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sesiones de login: token opaco, no JWT - mas simple de razonar y de
-- revocar (basta con borrar la fila) para un equipo pequeno.
CREATE TABLE sesiones (
  token       TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en   TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);

-- Cierre de ano (Fase 3 punto 1bis): reinicia la numeracion hacia adelante
-- sin tocar el historico. Cada ejecucion queda registrada aqui - quien,
-- cuando, y que contadores tenia cada secuencia antes y despues.
CREATE TABLE cierres_anuales (
  id                  SERIAL PRIMARY KEY,
  ejecutado_por        INTEGER NOT NULL REFERENCES usuarios(id),
  ejecutado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  contadores_antes     JSONB NOT NULL,
  contadores_despues   JSONB NOT NULL
);
