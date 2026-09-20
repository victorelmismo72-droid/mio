const { crudSimple } = require('../lib/crudSimple');
const { conTransaccion } = require('../db');
const { partidasCandidatas } = require('../logica/partidas');
const { upsertCatalogoPorCodigo } = require('../lib/importacion');

const router = crudSimple({
  tabla: 'articulos',
  columnas: [
    'codigo', 'descripcion', 'tipo', 'pvp1', 'pvp2', 'iva_pct', 'cientifico',
    'zona_fao', 'subzona', 'arte_pesca', 'barco', 'peso_etiqueta', 'calibre',
    'modo_presentacion', 'forma_obtencion', 'nombre_frances', 'nombre_italiano', 'activo',
  ],
});

const CAMPOS_ARTICULO = [
  'descripcion', 'tipo', 'pvp1', 'pvp2', 'cientifico', 'zona_fao', 'subzona',
  'arte_pesca', 'barco', 'peso_etiqueta', 'calibre', 'modo_presentacion', 'forma_obtencion', 'activo',
];

// Importación masiva desde Excel (Fase 6, hoja "PRODUCTOS", solo filas con
// MOSTRAR EN LISTA="S" — ya filtradas por la pantalla antes de llegar aquí).
// A diferencia del HTML actual, un artículo que deja de venir en el Excel
// NO se borra (rompería el histórico real de compras/pedidos que lo
// referencian) — se marca activo=false. Ver FASE_6 punto 3.
router.post('/importar', async (req, res, next) => {
  try {
    const filas = req.body.filas;
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'No se han recibido filas para importar.' });
    const filasConActivo = filas.map((f) => ({ ...f, activo: true }));
    const codigosSet = new Set(filas.map((f) => String(f.codigo).trim().toUpperCase()));

    const resultado = await conTransaccion(async (cliente) => {
      const parcial = await upsertCatalogoPorCodigo(cliente, {
        tabla: 'articulos',
        filas: filasConActivo,
        campos: CAMPOS_ARTICULO,
        camposObligatorios: ['descripcion'],
        defaultsAlta: { tipo: 'FRESCO', pvp1: 0, pvp2: 0, iva_pct: 10, barco: 'VARIOS BARCOS', peso_etiqueta: 'VER CAJA', forma_obtencion: 'CAPTURADO' },
      });
      const codigosArray = [...codigosSet];
      const desactivados = await cliente.query(
        `UPDATE articulos SET activo = false, modificado_en = now()
         WHERE activo = true AND codigo <> ALL($1::text[]) RETURNING codigo`,
        [codigosArray]
      );
      return { ...parcial, desactivados: desactivados.rows.map((r) => r.codigo) };
    });
    res.json(resultado);
  } catch (err) {
    if (err.message.includes('Falta') || err.message.includes('repetido')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// Importa solo el nombre traducido (francés o italiano) de artículos ya
// existentes, por código — igual que importarNombresFrancesExcel/
// importarNombresItalianoExcel del HTML actual (misma función, un solo
// idioma distinto cada vez, unificadas aquí en una sola ruta).
router.post('/importar-traducciones', async (req, res, next) => {
  try {
    const { idioma, filas } = req.body;
    if (idioma !== 'fr' && idioma !== 'it') return res.status(400).json({ error: 'El idioma debe ser "fr" o "it".' });
    if (!Array.isArray(filas) || !filas.length) return res.status(400).json({ error: 'No se han recibido filas para importar.' });
    const columna = idioma === 'fr' ? 'nombre_frances' : 'nombre_italiano';

    const resultado = await conTransaccion(async (cliente) => {
      let actualizados = 0;
      const noEncontrados = [];
      for (const f of filas) {
        const codigo = String(f.codigo || '').trim();
        const traduccion = String(f.traduccion || '').trim();
        if (!codigo || !traduccion) continue;
        const r = await cliente.query(
          `UPDATE articulos SET ${columna} = $1, modificado_en = now() WHERE codigo = $2 RETURNING id`,
          [traduccion, codigo]
        );
        if (r.rows.length) actualizados++;
        else noEncontrados.push(codigo);
      }
      return { actualizados, no_encontrados: noEncontrados };
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

// Fase 2 / corrección 02/09/2026 punto 4: coste real de referencia de este
// artículo (el de la partida que se asignaría ahora mismo), para que una
// pantalla de precios pueda avisar en vivo si un precio de venta queda por
// debajo del coste — sin depender de que alguien lo escriba bien a mano.
router.get('/:id/coste-referencia', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const art = await cliente.query('SELECT codigo, descripcion FROM articulos WHERE id = $1', [req.params.id]);
      if (!art.rows.length) return null;
      const candidatas = await partidasCandidatas(cliente, {
        articuloCodigo: art.rows[0].codigo, articuloDescripcion: art.rows[0].descripcion,
      });
      return { articulo: art.rows[0], candidatas };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún artículo con id ${req.params.id}` });
    if (!resultado.candidatas.length) {
      return res.json({ coste_referencia: null, aviso: 'No hay ninguna partida disponible de este artículo ahora mismo.' });
    }
    res.json({ coste_referencia: resultado.candidatas[0].costeMedioKg, numero_partida: resultado.candidatas[0].numeroPartida });
  } catch (err) { next(err); }
});

module.exports = router;
