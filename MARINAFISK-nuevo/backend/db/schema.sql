-- MARINAFISK — Esquema de base de datos (Fase 1)
--
-- Construido a partir de la estructura REAL de datos extraída del programa
-- HTML actual (CARGA_DE_ALBARANES_MARINAFISK_20260821I.html), no de suposiciones.
-- Ver MARINAFISK-nuevo/02_ESQUEMA_BASE_DATOS_PROPUESTO.md para el borrador de
-- discusión inicial; este archivo es la versión definitiva y corrige varias
-- cosas que en el borrador se habían dado por supuestas y no son ciertas hoy:
--
--   - "partidas" NO es una colección propia hoy: es solo un número (compra.partida)
--     dentro de cada compra. Aquí SÍ se crea una tabla `partidas` real, porque
--     varias compras del mismo proveedor el mismo día comparten número de partida.
--   - "listas_precios" NO tiene histórico real hoy: el modo AUTO se calcula al
--     vuelo desde las compras del día y nunca se guarda, y el modo MANUAL solo
--     guarda un borrador del día actual (se pierde el anterior). La tabla que
--     se crea aquí es, por tanto, funcionalidad nueva (guardar histórico), no
--     una migración de filas existentes.
--   - "proveedores" NO tiene hoy ningún campo de tipo de IVA — se añade aquí
--     `tipo_iva` como columna nueva (ver FASE_0, punto 4) con valor por defecto
--     NACIONAL; Víctor deberá revisar y marcar manualmente los proveedores
--     intracomunitarios tras la migración, porque el dato no existe en el origen.
--   - El campo libre `_uid` (con el prefijo "CORU"/"PANC" tomado de un texto
--     libre que el operario escribe en cada ordenador) se sustituye por una
--     tabla `puestos` controlada, referenciada por clave ajena.
--
-- Esta fase NO implementa lógica de negocio (2% OP, IVA, margen, asignación
-- de partidas): esos cálculos siguen en Fase 2. Aquí solo se guarda lo mismo
-- que ya se guarda hoy, más los campos de control que ya pedía Fase 0/1.
--
-- Nota sobre decimales: el programa actual calcula en JavaScript sin
-- redondear nunca los resultados intermedios (kilos * precio, ese resultado
-- * 1.02, etc.), así que el backup real contiene importes con hasta 6
-- decimales significativos (comprobado con datos reales: p.ej. 33.911175).
-- Un NUMERIC(x,2) los redondearía al migrar — inaceptable para "compras",
-- que es dato sagrado (Fase 0, punto 3) y no se debe alterar ni un céntimo.
-- Por eso los campos de importe/cantidad usan NUMERIC sin precisión/escala
-- fija: Postgres entonces guarda el valor exacto que se le da, sin redondear.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Puestos (sustituye al _uid de texto libre "CORU"/"PANC")
-- ---------------------------------------------------------------------------
CREATE TABLE puestos (
    id          SERIAL PRIMARY KEY,
    codigo      VARCHAR(4) NOT NULL UNIQUE,   -- p.ej. 'CORU', 'PANC'
    nombre      TEXT NOT NULL,                 -- p.ej. 'A Coruña (Víctor)', 'Pancho'
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO puestos (codigo, nombre) VALUES
    ('CORU', 'A Coruña (Víctor)'),
    ('PANC', 'Pancho');

-- ---------------------------------------------------------------------------
-- 1. Clientes
-- ---------------------------------------------------------------------------
CREATE TABLE clientes (
    id                SERIAL PRIMARY KEY,
    codigo            VARCHAR(30) NOT NULL UNIQUE,
    nombre            TEXT NOT NULL,
    cif               VARCHAR(40),  -- en datos reales a veces lleva un IBAN completo, no solo el CIF
    direccion         TEXT,
    cp                VARCHAR(10),
    poblacion         TEXT,
    provincia         TEXT,
    telefono          VARCHAR(30),
    email             VARCHAR(200),
    forma_pago        TEXT,
    agencia           TEXT,                    -- transportista/agencia habitual (p.ej. "MOZO")
    tipo_iva          VARCHAR(25) NOT NULL DEFAULT 'NORMAL'
                        CHECK (tipo_iva IN ('NORMAL', 'INTRACOMUNITARIO', 'RECARGO_EQUIVALENCIA')),
    formato_etiqueta  TEXT,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    modificado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Artículos (catálogo)
-- ---------------------------------------------------------------------------
CREATE TABLE articulos (
    id                  SERIAL PRIMARY KEY,
    codigo              VARCHAR(30) NOT NULL UNIQUE,
    descripcion         TEXT NOT NULL,
    tipo                VARCHAR(30),
    pvp1                NUMERIC,
    pvp2                NUMERIC,
    iva_pct             NUMERIC,
    cientifico          TEXT,
    zona_fao            TEXT,
    subzona             TEXT,
    arte_pesca          TEXT,
    barco               TEXT DEFAULT 'VARIOS BARCOS',
    peso_etiqueta       TEXT,
    calibre             TEXT,
    modo_presentacion   TEXT,
    forma_obtencion     TEXT,
    nombre_frances      TEXT,
    nombre_italiano     TEXT,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    modificado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nota: el emparejamiento de "misma familia de producto" (p.ej. C1300 con
-- C13004/C13006/C13008) NO se guarda como campo — hoy se calcula en el momento
-- comparando prefijo de código (4+ caracteres) y primera palabra de la
-- descripción (ver sonMismaFamiliaProducto en el HTML actual). Es lógica de
-- negocio de Fase 2, no de almacenamiento; aquí solo se guardan codigo y
-- descripcion tal cual, sin inventar una columna "familia" que no existe hoy.

-- ---------------------------------------------------------------------------
-- 3. Proveedores
-- ---------------------------------------------------------------------------
CREATE TABLE proveedores (
    id              SERIAL PRIMARY KEY,
    codigo          VARCHAR(30) NOT NULL UNIQUE,
    nombre          TEXT NOT NULL,
    es_subasta_op   BOOLEAN NOT NULL DEFAULT false,  -- sustituye a op2 'S'/'N'
    tipo_iva        VARCHAR(20) NOT NULL DEFAULT 'NACIONAL'
                      CHECK (tipo_iva IN ('NACIONAL', 'INTRACOMUNITARIO')),
    notas           TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    modificado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN proveedores.tipo_iva IS
    'Campo NUEVO (Fase 0, punto 4): no existe en los datos de origen. '
    'Todos los proveedores migrados entran como NACIONAL por defecto — '
    'Víctor debe revisar y corregir manualmente los que sean intracomunitarios.';

-- ---------------------------------------------------------------------------
-- 4. Secuencias de numeración (sustituyen a nextPedido/nextPartida/nextReparto/nextTrp)
-- ---------------------------------------------------------------------------
-- Los valores de arranque son los mismos que usa hoy el HTML por defecto.
-- Al migrar el backup real, estas secuencias se reiniciarán (ALTER SEQUENCE
-- ... RESTART WITH ...) al máximo número real encontrado + 1, para no chocar
-- con números ya usados.
CREATE SEQUENCE seq_numero_pedido   START WITH 12000;
CREATE SEQUENCE seq_numero_reparto  START WITH 1;
CREATE SEQUENCE seq_numero_traspaso START WITH 1;
CREATE SEQUENCE seq_numero_partida  START WITH 5900;

-- ---------------------------------------------------------------------------
-- 5. Partidas (lotes de coste) — tabla real, ya no implícita
-- ---------------------------------------------------------------------------
-- Varias compras del mismo proveedor el mismo día comparten numero_partida
-- (así funciona hoy: partidaParaCompra() reutiliza la partida si coincide
-- fecha+proveedor). Los kilos disponibles NO se guardan aquí: se calculan
-- con la vista partidas_disponibles más abajo, para no duplicar la fuente
-- de verdad (kilos comprados vs. kilos ya vendidos/traspasados).
CREATE TABLE partidas (
    numero_partida  INTEGER PRIMARY KEY,
    cerrada_manual  BOOLEAN NOT NULL DEFAULT false,
    cerrada_en      TIMESTAMPTZ,
    cerrada_por     TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nota de migración (comprobado contra el backup real de 2026-09-14): esta
-- tabla debe recibir una fila por cada número de partida que aparezca en
-- CUALQUIER sitio (compras, pedido_lineas, traspaso_lineas), no solo los que
-- tienen una compra asociada en este backup — en los datos reales hay ~76
-- números de partida citados en traspasos que no corresponden a ninguna
-- compra de este backup (probablemente por algún reinicio manual pasado del
-- contador nextPartida, ver Fase 0 punto 6). No es un error del script de
-- migración: es un hueco ya existente en los datos de origen, y no se debe
-- inventar una compra falsa para taparlo — se dejan como partidas "huérfanas"
-- (0 kilos comprados en la vista partidas_disponibles) para que Víctor las
-- revise si hace falta.

-- ---------------------------------------------------------------------------
-- 6. Compras — DATO SAGRADO, inmutable tras su creación (Fase 0, punto 3)
-- ---------------------------------------------------------------------------
CREATE TABLE compras (
    id                        SERIAL PRIMARY KEY,
    numero_partida            INTEGER NOT NULL REFERENCES partidas(numero_partida),
    fecha                     DATE NOT NULL,
    alb_proveedor             VARCHAR(60),
    proveedor_id              INTEGER NOT NULL REFERENCES proveedores(id),
    proveedor_nombre_snapshot TEXT,             -- copia del nombre en el momento de comprar
    total_kilos               NUMERIC,
    total_base_zgz            NUMERIC,
    total_base_real           NUMERIC,
    total_iva                 NUMERIC,
    total_factura             NUMERIC,
    puesto_id                 INTEGER REFERENCES puestos(id),
    uid                       VARCHAR(60) NOT NULL UNIQUE,  -- antiguo _uid (formato YYYYMMDDTHHMMSS_PUESTO_rand)
    creado_en                 TIMESTAMPTZ NOT NULL DEFAULT now()
    -- SIN modificado_en: esta tabla no se actualiza nunca (ver trigger más abajo).
);

CREATE TABLE compra_lineas (
    id                          SERIAL PRIMARY KEY,
    compra_id                   INTEGER NOT NULL REFERENCES compras(id),
    articulo_id                 INTEGER REFERENCES articulos(id),
    articulo_codigo_snapshot    VARCHAR(30),
    descripcion_snapshot        TEXT,
    cajas                       NUMERIC,
    kilos                       NUMERIC,
    precio_kg                   NUMERIC,
    base_zgz                    NUMERIC,   -- kilos * precio_kg
    base_zgz_iva                NUMERIC,   -- base_zgz * 1.10 (campo ya existente en el HTML actual)
    op2_importe                 NUMERIC,   -- 2% OP si el proveedor es de subasta/lonja, si no 0
    base_real                   NUMERIC,   -- base_zgz + op2_importe
    iva_importe                 NUMERIC,   -- base_real * 10%
    total_factura               NUMERIC,   -- base_real + iva_importe
    control                     BOOLEAN,          -- solo relevante en líneas importadas de Excel
    creado_en                   TIMESTAMPTZ NOT NULL DEFAULT now()
    -- SIN modificado_en: ver trigger de inmutabilidad más abajo.
);

CREATE INDEX idx_compra_lineas_compra_id ON compra_lineas(compra_id);
CREATE INDEX idx_compras_numero_partida ON compras(numero_partida);
CREATE INDEX idx_compras_fecha ON compras(fecha);

-- Inmutabilidad estructural: ni UPDATE ni DELETE, para cualquier rol de la
-- aplicación (más robusto que confiar en que el backend "no lo permita").
CREATE OR REPLACE FUNCTION bloquear_modificacion_compra()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'Las compras son un dato sagrado: no se pueden modificar ni borrar una vez creadas (tabla %, operación %). Si hay un error, crea un registro de ajuste aparte, nunca sobrescribas.',
        TG_TABLE_NAME, TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compras_inmutable
    BEFORE UPDATE OR DELETE ON compras
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_compra();

CREATE TRIGGER trg_compra_lineas_inmutable
    BEFORE UPDATE OR DELETE ON compra_lineas
    FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_compra();

-- ---------------------------------------------------------------------------
-- 7. Pedidos (albaranes de venta) — localStorage "historial" en el HTML actual
-- ---------------------------------------------------------------------------
CREATE TABLE pedidos (
    id                        SERIAL PRIMARY KEY,
    numero                    INTEGER NOT NULL UNIQUE DEFAULT nextval('seq_numero_pedido'),
    fecha                     DATE NOT NULL,
    cliente_id                INTEGER REFERENCES clientes(id),
    cliente_codigo_snapshot   VARCHAR(30),
    cliente_nombre_snapshot   TEXT,
    cliente_cif_snapshot      VARCHAR(40),
    cliente_dir_snapshot      TEXT,
    cliente_pob_snapshot      TEXT,
    cliente_tel_snapshot      VARCHAR(30),
    agencia                   TEXT,
    forma_pago                TEXT,
    tipo_iva_aplicado         VARCHAR(25),
    base                      NUMERIC,
    iva                       NUMERIC,
    recargo_importe           NUMERIC,  -- NUEVO en Fase 2 (recargo de equivalencia): NULL/0 en pedidos migrados, el HTML actual nunca lo aplicaba
    total                     NUMERIC,
    puesto_id                 INTEGER REFERENCES puestos(id),
    uid                       VARCHAR(60) NOT NULL UNIQUE,
    creado_en                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    modificado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pedido_lineas (
    id                        SERIAL PRIMARY KEY,
    pedido_id                 INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    articulo_id               INTEGER REFERENCES articulos(id),
    articulo_codigo_snapshot  VARCHAR(30),
    descripcion_snapshot      TEXT,
    descripcion_editada       TEXT,
    cantidad                  NUMERIC,   -- bultos/cajas (antiguo "cant")
    peso                      NUMERIC,   -- kg
    precio                    NUMERIC,   -- €/kg
    descuento                 NUMERIC DEFAULT 0,
    iva_pct                   NUMERIC DEFAULT 10,
    total                     NUMERIC,
    numero_partida            INTEGER REFERENCES partidas(numero_partida),
    asignacion_manual         BOOLEAN DEFAULT false,   -- antiguo _partidaManual
    estado_asignacion         VARCHAR(20),             -- lo rellena la Fase 2: OK|AVISO_MARGEN|PENDIENTE_MANUAL
    creado_en                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedido_lineas_pedido_id ON pedido_lineas(pedido_id);
CREATE INDEX idx_pedidos_fecha ON pedidos(fecha);
CREATE INDEX idx_pedidos_cliente_id ON pedidos(cliente_id);

-- ---------------------------------------------------------------------------
-- 8. Repartos (Reparto Super)
-- ---------------------------------------------------------------------------
CREATE TABLE repartos (
    id                      SERIAL PRIMARY KEY,
    numero                  INTEGER NOT NULL UNIQUE DEFAULT nextval('seq_numero_reparto'),
    fecha                   DATE NOT NULL,
    destinatario_nombre     TEXT,
    destinatario_ciudad     TEXT,
    conductor               TEXT,
    total_cajas             NUMERIC,
    total_kg                NUMERIC,
    puesto_id               INTEGER REFERENCES puestos(id),
    uid                     VARCHAR(60) NOT NULL UNIQUE,
    creado_en               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reparto_lineas (
    id                        SERIAL PRIMARY KEY,
    reparto_id                INTEGER NOT NULL REFERENCES repartos(id) ON DELETE CASCADE,
    articulo_id               INTEGER REFERENCES articulos(id),
    articulo_codigo_snapshot  VARCHAR(30),
    descripcion_snapshot      TEXT,
    lote                      TEXT,      -- número de trazabilidad, independiente de numero_partida
    barco                     TEXT,
    subzona                   TEXT,
    arte_pesca                TEXT,
    cajas                     NUMERIC,
    cajas_impresas            NUMERIC,   -- cuántas cajas de esta línea ya se han impreso/etiquetado (ver reimpresión parcial en el HTML actual)
    kg                        NUMERIC,
    peso_etiqueta             TEXT,      -- vacío = "VER CAJA" en la etiqueta
    creado_en                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reparto_lineas_reparto_id ON reparto_lineas(reparto_id);
CREATE INDEX idx_repartos_fecha ON repartos(fecha);

-- ---------------------------------------------------------------------------
-- 9. Traspasos (internos, a Zaragoza)
-- ---------------------------------------------------------------------------
CREATE TABLE traspasos (
    id            SERIAL PRIMARY KEY,
    numero        INTEGER NOT NULL UNIQUE DEFAULT nextval('seq_numero_traspaso'),
    fecha         DATE NOT NULL,
    total_kg      NUMERIC,
    base          NUMERIC,
    total         NUMERIC,   -- hoy es una copia de "base": los traspasos no llevan IVA
    puesto_id     INTEGER REFERENCES puestos(id),
    uid           VARCHAR(60) NOT NULL UNIQUE,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE traspaso_lineas (
    id                        SERIAL PRIMARY KEY,
    traspaso_id               INTEGER NOT NULL REFERENCES traspasos(id) ON DELETE CASCADE,
    articulo_id               INTEGER REFERENCES articulos(id),
    articulo_codigo_snapshot  VARCHAR(30),
    descripcion_snapshot      TEXT,
    descripcion_editada       TEXT,
    cajas                     NUMERIC,
    peso                      NUMERIC,
    precio                    NUMERIC,
    partida_texto             TEXT,                             -- valor tal cual del origen: no siempre es un número limpio
    numero_partida            INTEGER REFERENCES partidas(numero_partida),  -- NULL si partida_texto no es un único número (ver nota)
    total                     NUMERIC,
    creado_en                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_traspaso_lineas_traspaso_id ON traspaso_lineas(traspaso_id);
CREATE INDEX idx_traspasos_fecha ON traspasos(fecha);

-- ---------------------------------------------------------------------------
-- 10. Listas de precio (Pescaderías / Mayoristas) — histórico NUEVO
-- ---------------------------------------------------------------------------
-- Hoy esto no existe como histórico real (ver cabecera del archivo). Esta
-- tabla permite, de cara al futuro, guardar cada día generado en vez de
-- perder el anterior, sin cambiar cómo funcionan los modos AUTO/MANUAL.
CREATE TABLE listas_precio (
    id          SERIAL PRIMARY KEY,
    tipo        VARCHAR(15) NOT NULL CHECK (tipo IN ('PESCADERIAS', 'MAYORISTAS')),
    fecha       DATE NOT NULL,
    modo        VARCHAR(10) NOT NULL CHECK (modo IN ('AUTO', 'MANUAL')),
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo, fecha)
);

CREATE TABLE lista_precio_lineas (
    id                SERIAL PRIMARY KEY,
    lista_precio_id   INTEGER NOT NULL REFERENCES listas_precio(id) ON DELETE CASCADE,
    articulo_id       INTEGER REFERENCES articulos(id),   -- puede ser NULL si no casa con el catálogo
    descripcion       TEXT NOT NULL,
    precio            NUMERIC,
    coste             NUMERIC,
    existencias       TEXT,   -- texto libre: admite un número de cajas o texto como "AGOTADO"/"POCAS"
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lista_precio_lineas_lista_id ON lista_precio_lineas(lista_precio_id);

-- ---------------------------------------------------------------------------
-- 11. Idempotencia — protección de guardado duplicado a nivel de servidor
-- ---------------------------------------------------------------------------
-- Ver CORRECCIONES_2026-09-02_HTML_actual_MARINAFISK.md, punto 1, y FASE_2,
-- punto 5quater. El backend, antes de insertar un pedido/reparto/traspaso/
-- compra, comprueba esta tabla por la clave (el "uid" que genera la propia
-- pantalla al pulsar grabar). Si ya existe, no vuelve a insertar: devuelve
-- la respuesta que se guardó la primera vez.
CREATE TABLE idempotencia (
    clave        VARCHAR(60) PRIMARY KEY,
    tabla        TEXT NOT NULL,
    respuesta    JSONB NOT NULL,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 12. Log de escrituras (auditoría básica, para depurar sincronización en Fase 3)
-- ---------------------------------------------------------------------------
CREATE TABLE log_escrituras (
    id            BIGSERIAL PRIMARY KEY,
    tabla         TEXT NOT NULL,
    operacion     TEXT NOT NULL,      -- INSERT | UPDATE | DELETE
    registro_id   TEXT,
    puesto_id     INTEGER REFERENCES puestos(id),
    detalle       JSONB,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_log_escrituras_creado_en ON log_escrituras(creado_en);
CREATE INDEX idx_log_escrituras_tabla ON log_escrituras(tabla);

-- ---------------------------------------------------------------------------
-- 12bis. Calibración de impresión (Fase 4, Nivel 2)
-- ---------------------------------------------------------------------------
-- Corrección 02/09/2026 punto 7/8: los documentos que se imprimen ENCIMA de
-- un papel pre-impreso (Transfrío, CMR...) necesitan que cada campo se
-- pueda ajustar en milímetros, calibrado con impresiones de prueba reales
-- — nunca se acierta a la primera. El registro central de qué campos tiene
-- cada modelo vive en el código (backend/src/modelosImpresion.js), no aquí;
-- esta tabla solo guarda el AJUSTE manual (offset en mm) que Víctor haga
-- sobre la posición de partida de cada campo, para que no se pierda al
-- reiniciar el servidor.
CREATE TABLE calibraciones_impresion (
    modelo_id       TEXT NOT NULL,
    campo_clave     TEXT NOT NULL,
    x_mm            NUMERIC NOT NULL,
    y_mm            NUMERIC NOT NULL,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (modelo_id, campo_clave)
);

-- ---------------------------------------------------------------------------
-- 13. Vista: kilos disponibles por partida (calculado, no almacenado)
-- ---------------------------------------------------------------------------
-- Reproduce obtenerPartidasDisponibles()/kilosVendidosDePartida() del HTML
-- actual: kilos comprados de esa partida, menos lo ya vendido en pedidos y
-- traspasos que apuntan a esa misma partida.
CREATE VIEW partidas_disponibles AS
SELECT
    p.numero_partida,
    p.cerrada_manual,
    COALESCE(compras_kg.kilos, 0) AS kilos_comprados,
    COALESCE(vendidos_kg.kilos, 0) AS kilos_vendidos,
    COALESCE(compras_kg.kilos, 0) - COALESCE(vendidos_kg.kilos, 0) AS kilos_disponibles
FROM partidas p
LEFT JOIN (
    SELECT c.numero_partida, SUM(cl.kilos) AS kilos
    FROM compras c
    JOIN compra_lineas cl ON cl.compra_id = c.id
    GROUP BY c.numero_partida
) compras_kg ON compras_kg.numero_partida = p.numero_partida
LEFT JOIN (
    SELECT numero_partida, SUM(kilos) AS kilos FROM (
        SELECT numero_partida, peso AS kilos FROM pedido_lineas WHERE numero_partida IS NOT NULL
        UNION ALL
        SELECT numero_partida, peso AS kilos FROM traspaso_lineas WHERE numero_partida IS NOT NULL
    ) todo_lo_vendido
    GROUP BY numero_partida
) vendidos_kg ON vendidos_kg.numero_partida = p.numero_partida;

-- ---------------------------------------------------------------------------
-- 14. Configuración compartida (clave/valor)
-- ---------------------------------------------------------------------------
-- Fase 5 (Etiquetas): el HTML actual guarda "días de caducidad" en
-- localStorage, por ordenador — un defecto real (CORU y PANC podrían tener
-- valores distintos sin que nadie se diera cuenta). Aquí es una única fila
-- compartida, igual para los dos puestos, consistente con Fase 3.
CREATE TABLE configuracion (
    clave           TEXT PRIMARY KEY,
    valor           TEXT NOT NULL,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
