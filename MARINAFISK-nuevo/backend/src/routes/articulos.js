const { crudSimple } = require('../lib/crudSimple');
const { conTransaccion } = require('../db');
const { partidasCandidatas } = require('../logica/partidas');

const router = crudSimple({
  tabla: 'articulos',
  columnas: [
    'codigo', 'descripcion', 'tipo', 'pvp1', 'pvp2', 'iva_pct', 'cientifico',
    'zona_fao', 'subzona', 'arte_pesca', 'barco', 'peso_etiqueta', 'calibre',
    'modo_presentacion', 'forma_obtencion', 'nombre_frances', 'nombre_italiano',
  ],
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
