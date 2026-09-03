const { pool, registrarAuditoria } = require('../db');
const crudDocumento = require('./crudDocumento');
const { calcularIvaVenta } = require('../negocio/calculoVentas');
const { generarPaginaEtiquetasPedido } = require('../negocio/etiquetas');

// El IVA/Recargo de Equivalencia de un pedido se calcula siempre aqui, en
// el servidor, leyendo el cliente en el mismo instante de grabar (formula
// viva, igual que el 2% de OP en compras) - nunca se confia en un iva/total
// que venga ya calculado desde el cliente. Guarda un unico importe combinado
// en `iva` (IVA + Recargo), igual que ya hacia el HTML actual
// (calcularIvaPedido: "iva = base*(ivaPct+rePct)/100").
async function calcularCabeceraPedido(req, client, porColumna) {
  const { rows } = await client.query('SELECT * FROM clientes WHERE codigo = $1', [porColumna.cliente_codigo]);
  const cliente = rows[0] || null;
  const r = await calcularIvaVenta(client, porColumna.base, cliente);
  return { iva: r.iva_importe + r.recargo_importe, total: r.total };
}

const router = crudDocumento({
  tabla: 'pedidos',
  tablaLineas: 'pedido_lineas',
  fkLinea: 'pedido_id',
  secuenciaNumero: 'seq_pedido_numero',
  calcularCabecera: calcularCabeceraPedido,
  columnasCabecera: [
    'numero', 'anio', 'fecha', 'cliente_codigo', 'cliente_nombre_snapshot',
    'cliente_cif_snapshot', 'cliente_dir_snapshot', 'cliente_pob_snapshot',
    'cliente_tel_snapshot', 'agencia', 'forma_pago', 'base', 'iva', 'total',
    'puesto_origen',
  ],
  columnasLinea: [
    'articulo_codigo', 'descripcion', 'descripcion_editada', 'cantidad',
    'peso', 'precio', 'descuento', 'iva_pct', 'total', 'partida_numero',
    'partida_manual',
  ],
});

// Aplicar a mano la partida elegida para resolver una excepcion (Fase 2
// punto 3 / Fase 4 punto 1: pantalla de excepciones de "asignar partidas
// del dia"). No hace falta reescribir el pedido entero para esto.
router.put('/lineas/:id/partida', async (req, res, next) => {
  try {
    const { partida_numero } = req.body;
    const { rows } = await pool.query(
      `UPDATE pedido_lineas SET partida_numero = $1, partida_manual = true WHERE id = $2 RETURNING *`,
      [partida_numero || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Línea no encontrada' });
    await registrarAuditoria(pool, {
      tabla: 'pedido_lineas', accion: 'UPDATE', registroId: req.params.id,
      puestoOrigen: req.usuario.usuario, detalle: { partida_numero },
    });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Etiquetas de un pedido/albaran ya grabado: una etiqueta por caja, en el
// formato del cliente (marina_fisk por defecto, o el que tenga asignado -
// frances/italiano/masymas/david_sala/scanfisk), ver src/negocio/etiquetas.js.
// Igual que en compras/traspasos/repartos, se calcula siempre en el servidor.
router.get('/:id/etiquetas', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const pedido = rows[0];
    const { rows: lineas } = await pool.query(
      `SELECT * FROM pedido_lineas WHERE pedido_id = $1 ORDER BY id`,
      [req.params.id]
    );
    if (!lineas.length) return res.status(400).json({ error: 'Este pedido no tiene líneas.' });

    const { rows: clienteRows } = await pool.query('SELECT * FROM clientes WHERE codigo = $1', [pedido.cliente_codigo]);
    const cliente = clienteRows[0] || null;

    const codigos = [...new Set(lineas.map((l) => l.articulo_codigo).filter(Boolean))];
    const { rows: articulos } = codigos.length
      ? await pool.query('SELECT * FROM articulos WHERE codigo = ANY($1)', [codigos])
      : { rows: [] };
    const articulosPorCodigo = Object.fromEntries(articulos.map((a) => [a.codigo, a]));

    const html = await generarPaginaEtiquetasPedido({ pedido, lineas, cliente, articulosPorCodigo });
    if (!html) return res.status(400).json({ error: 'Este pedido no tiene líneas con cantidad de etiquetas.' });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

module.exports = router;
