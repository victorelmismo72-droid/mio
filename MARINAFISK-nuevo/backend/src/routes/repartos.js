const { pool } = require('../db');
const crudDocumento = require('./crudDocumento');
const { generarPaginaEtiquetasReparto } = require('../negocio/etiquetas');

const router = crudDocumento({
  tabla: 'repartos',
  tablaLineas: 'reparto_lineas',
  fkLinea: 'reparto_id',
  secuenciaNumero: 'seq_reparto_numero',
  columnasCabecera: [
    'numero', 'anio', 'fecha', 'destinatario_nombre', 'destinatario_ciudad',
    'conductor', 'total_cajas', 'total_kg', 'puesto_origen',
  ],
  columnasLinea: [
    'producto', 'descripcion', 'cajas', 'kg', 'lote', 'arte_pesca', 'barco',
    'subzona', 'peso_etiqueta', 'cajas_impresas',
  ],
});

// Etiquetas de un reparto ya grabado: una etiqueta por caja (Scanfisk, formato
// termico 50x145mm), lista para imprimir con Ctrl+P - ver src/negocio/etiquetas.js.
// Se calcula siempre en el servidor (nunca se confia en un lote/caducidad ya
// calculado en el navegador para algo que va impreso en una etiqueta sanitaria).
router.get('/:id/etiquetas', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM repartos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const reparto = rows[0];
    const { rows: lineas } = await pool.query(
      `SELECT * FROM reparto_lineas WHERE reparto_id = $1 AND cajas > 0 ORDER BY id`,
      [req.params.id]
    );
    if (!lineas.length) return res.status(400).json({ error: 'Este reparto no tiene líneas con cajas.' });

    const codigos = [...new Set(lineas.map((l) => l.producto).filter(Boolean))];
    const { rows: articulos } = codigos.length
      ? await pool.query('SELECT * FROM articulos WHERE codigo = ANY($1)', [codigos])
      : { rows: [] };
    const articulosPorCodigo = Object.fromEntries(articulos.map((a) => [a.codigo, a]));

    const lineasConFecha = lineas.map((l) => ({ ...l, _fecha: reparto.fecha }));
    const html = await generarPaginaEtiquetasReparto({
      lineas: lineasConFecha,
      destinatarioNombre: reparto.destinatario_nombre,
      destinatarioCiudad: reparto.destinatario_ciudad,
      articulosPorCodigo,
    });
    if (!html) return res.status(400).json({ error: 'Este reparto no tiene líneas con cajas.' });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

module.exports = router;
