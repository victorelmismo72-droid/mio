// Listados de gestión (FASE_2 punto 5bis, corrección 02/09/2026 punto 3):
// "cualquier listado o informe de ventas/movimientos por artículo y fecha"
// debe separar SIEMPRE las ventas reales de los traspasos internos a
// Zaragoza — nunca mezclarlos en silencio, porque un traspaso no es una
// venta a efectos contables, pero Víctor sí necesita poder ver el total de
// pescado movido (venta + traspaso) para estadística de volumen.
//
// Por eso esta ruta, por defecto, solo devuelve líneas de pedidos (ventas
// reales). Con incluir_traspasos=1 añade también las líneas de traspasos,
// marcadas con tipo:"traspaso" (sin precio ni importe, porque no es una
// venta) para que la pantalla las pinte claramente diferenciadas — nunca
// como una fila de venta más — y calcula los tres totales que pide el
// punto 5bis: ventas reales (kg + importe), traspasado a Zaragoza (solo
// kg) y total de pescado movido (kg, la suma de ambos).
const express = require('express');
const { conTransaccion } = require('../db');

const router = express.Router();

router.get('/ventas-articulo', async (req, res, next) => {
  try {
    const { desde, hasta, articulo_id: articuloId } = req.query;
    const incluirTraspasos = req.query.incluir_traspasos === '1' || req.query.incluir_traspasos === 'true';

    const condicionesVentas = [];
    const valoresVentas = [];
    if (desde) { valoresVentas.push(desde); condicionesVentas.push(`p.fecha >= $${valoresVentas.length}`); }
    if (hasta) { valoresVentas.push(hasta); condicionesVentas.push(`p.fecha <= $${valoresVentas.length}`); }
    if (articuloId) { valoresVentas.push(articuloId); condicionesVentas.push(`pl.articulo_id = $${valoresVentas.length}`); }
    const whereVentas = condicionesVentas.length ? `WHERE ${condicionesVentas.join(' AND ')}` : '';

    const resultado = await conTransaccion(async (cliente) => {
      const ventasR = await cliente.query(`
        SELECT p.fecha, p.numero AS documento_numero, p.cliente_nombre_snapshot AS cliente_nombre,
               pl.articulo_codigo_snapshot AS articulo_codigo, pl.descripcion_snapshot AS descripcion,
               pl.cantidad AS cajas, pl.peso, pl.total AS importe
        FROM pedido_lineas pl
        JOIN pedidos p ON p.id = pl.pedido_id
        ${whereVentas}
        ORDER BY p.fecha DESC, p.numero DESC
      `, valoresVentas);
      const ventas = ventasR.rows.map((f) => ({ tipo: 'venta', ...f }));

      let traspasos = [];
      if (incluirTraspasos) {
        const condicionesTrp = [];
        const valoresTrp = [];
        if (desde) { valoresTrp.push(desde); condicionesTrp.push(`t.fecha >= $${valoresTrp.length}`); }
        if (hasta) { valoresTrp.push(hasta); condicionesTrp.push(`t.fecha <= $${valoresTrp.length}`); }
        if (articuloId) { valoresTrp.push(articuloId); condicionesTrp.push(`tl.articulo_id = $${valoresTrp.length}`); }
        const whereTrp = condicionesTrp.length ? `WHERE ${condicionesTrp.join(' AND ')}` : '';
        const traspasosR = await cliente.query(`
          SELECT t.fecha, t.numero AS documento_numero,
                 tl.articulo_codigo_snapshot AS articulo_codigo, tl.descripcion_snapshot AS descripcion,
                 tl.cajas, tl.peso
          FROM traspaso_lineas tl
          JOIN traspasos t ON t.id = tl.traspaso_id
          ${whereTrp}
          ORDER BY t.fecha DESC, t.numero DESC
        `, valoresTrp);
        // Sin precio/importe a propósito — un traspaso no es una venta, y
        // etiquetado tal cual pide la corrección, para que la pantalla no
        // pueda confundirlo con una fila de venta por error.
        traspasos = traspasosR.rows.map((f) => ({ tipo: 'traspaso', etiqueta: 'TRASPASO A ZARAGOZA (interno, no es venta)', ...f }));
      }

      const ventasKg = ventas.reduce((s, l) => s + (Number(l.peso) || 0), 0);
      const ventasImporte = ventas.reduce((s, l) => s + (Number(l.importe) || 0), 0);
      const traspasosKg = traspasos.reduce((s, l) => s + (Number(l.peso) || 0), 0);

      return {
        lineas: [...ventas, ...traspasos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha) || b.documento_numero - a.documento_numero),
        totales: {
          ventas_kg: ventasKg,
          ventas_importe: ventasImporte,
          traspasos_kg: traspasosKg,
          total_movido_kg: ventasKg + traspasosKg,
        },
      };
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

module.exports = router;
