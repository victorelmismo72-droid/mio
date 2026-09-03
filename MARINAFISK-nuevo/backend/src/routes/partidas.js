const express = require('express');
const { pool } = require('../db');
const {
  partidasDisponibles, asignarPartidaAutomatica, cerrarPartida, reabrirPartida,
  cerrarPartidasMasivoPorFecha, rentabilidadPartida,
} = require('../negocio/partidas');
const { obtenerNumero } = require('../negocio/configuracion');

const router = express.Router();

router.get('/disponibles', async (req, res, next) => {
  try {
    const { articulo } = req.query;
    if (!articulo) return res.status(400).json({ error: 'Falta el parametro articulo' });
    const [disponibles, margenMinimo] = await Promise.all([
      partidasDisponibles(pool, articulo),
      obtenerNumero(pool, 'margen_minimo_partida'),
    ]);
    res.json({ margen_minimo: margenMinimo, disponibles });
  } catch (err) { next(err); }
});

// Asignacion automatica inline (una linea de pedido concreta): igual que el
// HTML actual, se asigna sola si alguna partida llega al margen minimo; si
// no, se devuelve PENDIENTE_MANUAL con las candidatas para elegir a mano.
router.post('/asignar', async (req, res, next) => {
  try {
    const { articulo_codigo, precio_venta } = req.body;
    if (!articulo_codigo) return res.status(400).json({ error: 'Falta articulo_codigo' });
    const resultado = await asignarPartidaAutomatica(pool, articulo_codigo, precio_venta);
    res.json(resultado);
  } catch (err) { next(err); }
});

// Asignacion en bloque de todos los pedidos de un dia (equivalente al boton
// "ASIGNAR PARTIDAS DE HOY" del HTML actual): asigna sola cada linea que
// llegue al margen minimo, y devuelve como excepciones las que no.
router.post('/asignar-dia', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const fecha = req.body.fecha;
    if (!fecha) return res.status(400).json({ error: 'Falta fecha' });

    const { rows: pedidos } = await client.query('SELECT id, numero FROM pedidos WHERE fecha = $1', [fecha]);
    let asignadasAuto = 0;
    let yaTenian = 0;
    let sinCompras = 0;
    const pendientes = [];

    await client.query('BEGIN');
    for (const pedido of pedidos) {
      // eslint-disable-next-line no-await-in-loop
      const { rows: lineas } = await client.query(
        'SELECT id, articulo_codigo, descripcion, precio, partida_numero FROM pedido_lineas WHERE pedido_id = $1',
        [pedido.id]
      );
      for (const linea of lineas) {
        if (!linea.articulo_codigo) continue;
        if (linea.partida_numero) { yaTenian++; continue; }
        // eslint-disable-next-line no-await-in-loop
        const resultado = await asignarPartidaAutomatica(pool, linea.articulo_codigo, linea.precio);
        if (!resultado.candidatos.length) { sinCompras++; continue; }
        if (resultado.estado === 'OK') {
          // eslint-disable-next-line no-await-in-loop
          await client.query(
            'UPDATE pedido_lineas SET partida_numero = $1, partida_manual = false WHERE id = $2',
            [resultado.partida_numero, linea.id]
          );
          asignadasAuto++;
        } else {
          pendientes.push({
            pedido_numero: pedido.numero, pedido_linea_id: linea.id,
            articulo_codigo: linea.articulo_codigo, descripcion: linea.descripcion,
            precio_venta: linea.precio, candidatos: resultado.candidatos,
          });
        }
      }
    }
    await client.query('COMMIT');

    res.json({ asignadas_auto: asignadasAuto, ya_tenian: yaTenian, sin_compras: sinCompras, pendientes });
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

router.post('/:numero/cerrar', async (req, res, next) => {
  try {
    await cerrarPartida(pool, Number(req.params.numero), req.body.puesto_origen);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:numero/reabrir', async (req, res, next) => {
  try {
    await reabrirPartida(pool, Number(req.params.numero));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/cerrar-masivo', async (req, res, next) => {
  try {
    const { fecha, puesto_origen } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Falta fecha' });
    const cerradas = await cerrarPartidasMasivoPorFecha(pool, fecha, puesto_origen);
    res.json({ cerradas });
  } catch (err) { next(err); }
});

router.get('/:numero/rentabilidad', async (req, res, next) => {
  try {
    const resultado = await rentabilidadPartida(pool, Number(req.params.numero));
    res.json(resultado);
  } catch (err) { next(err); }
});

module.exports = router;
