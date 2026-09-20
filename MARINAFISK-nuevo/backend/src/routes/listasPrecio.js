// Listas de precio (Pescaderías/Mayoristas). Hoy esto no tiene histórico real
// (ver nota en schema.sql) — aquí sí se guarda un registro por tipo+fecha, y
// grabar dos veces el mismo día para el mismo tipo actualiza esa fila (mismo
// comportamiento de "autoguardado diario" que ya existe hoy, pero con
// histórico real en vez de perder el día anterior).
const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');
const { calcularListaAuto } = require('../logica/listaPrecioAuto');
const { costeReferenciaPorArticulo } = require('../logica/partidas');

const router = express.Router();

// Vista previa del modo AUTO (Fase 2, punto 4): calculado al vuelo desde las
// compras de la fecha indicada, sin guardar nada — igual que hoy, el modo
// AUTO no se guarda hasta que alguien decide grabarlo con POST /.
router.get('/auto-preview', async (req, res, next) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta "fecha" (YYYY-MM-DD).' });
    const filas = await conTransaccion((cliente) => calcularListaAuto(cliente, fecha));
    res.json({ fecha, filas });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const { tipo } = req.query;
    const condiciones = [];
    const valores = [];
    if (tipo) { valores.push(tipo); condiciones.push(`tipo = $${valores.length}`); }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const r = await conTransaccion((cliente) => cliente.query(`SELECT * FROM listas_precio ${where} ORDER BY fecha DESC`, valores));
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const cabecera = await cliente.query('SELECT * FROM listas_precio WHERE id = $1', [req.params.id]);
      if (!cabecera.rows.length) return null;
      const lineas = await cliente.query('SELECT * FROM lista_precio_lineas WHERE lista_precio_id = $1 ORDER BY id', [req.params.id]);
      return { ...cabecera.rows[0], lineas: lineas.rows };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ninguna lista de precios con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { tipo, fecha, modo, lineas } = req.body;
    if (!tipo || !['PESCADERIAS', 'MAYORISTAS'].includes(tipo)) return res.status(400).json({ error: 'Falta "tipo" (PESCADERIAS o MAYORISTAS).' });
    if (!fecha) return res.status(400).json({ error: 'Falta "fecha".' });
    if (!modo || !['AUTO', 'MANUAL'].includes(modo)) return res.status(400).json({ error: 'Falta "modo" (AUTO o MANUAL).' });
    if (!Array.isArray(lineas)) return res.status(400).json({ error: '"lineas" debe ser un array (puede estar vacío).' });

    // Nota (corrección 02/09/2026, punto 5): "existencias" es texto libre,
    // admite tanto números de cajas como texto ("AGOTADO", "POCAS", etc.).

    const resultado = await conTransaccion(async (cliente) => {
      const cab = await cliente.query(
        `INSERT INTO listas_precio (tipo, fecha, modo) VALUES ($1,$2,$3)
         ON CONFLICT (tipo, fecha) DO UPDATE SET modo = EXCLUDED.modo
         RETURNING *`,
        [tipo, fecha, modo]
      );
      const lista = cab.rows[0];
      await cliente.query('DELETE FROM lista_precio_lineas WHERE lista_precio_id = $1', [lista.id]);
      const lineasGuardadas = [];
      for (const l of lineas) {
        // En modo MANUAL, el coste que manda la pantalla viene de una
        // comprobación en vivo mientras se teclea (debounced) — si se
        // pulsa "Guardar" justo después de elegir el artículo o cambiar el
        // precio, esa comprobación puede no haber terminado todavía y
        // llegar aquí a null (ver VERIFICACION_LISTAS_PRECIO_2026-09-20.md).
        // Igual que ya se hace en Compras/Pedidos/Traspasos/Repartos, el
        // servidor recalcula siempre el coste de referencia él mismo en
        // vez de aceptar el de la pantalla — nunca se guarda un coste
        // desactualizado o en blanco pudiendo calcularlo de verdad.
        let coste = l.coste || null;
        if (modo === 'MANUAL' && l.articulo_id) {
          const art = await cliente.query('SELECT codigo, descripcion FROM articulos WHERE id = $1', [l.articulo_id]);
          if (art.rows.length) {
            coste = await costeReferenciaPorArticulo(cliente, { articuloCodigo: art.rows[0].codigo, articuloDescripcion: art.rows[0].descripcion });
          }
        }
        const r = await cliente.query(
          `INSERT INTO lista_precio_lineas (lista_precio_id, articulo_id, descripcion, precio, coste, existencias)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [lista.id, l.articulo_id || null, l.descripcion || null, l.precio || null, coste,
            l.existencias === undefined ? null : String(l.existencias)]
        );
        lineasGuardadas.push(r.rows[0]);
      }
      await registrarEscritura(cliente, { tabla: 'listas_precio', operacion: 'INSERT', registroId: lista.id, detalle: { tipo, fecha, modo } });
      return { ...lista, lineas: lineasGuardadas };
    });
    res.status(201).json(resultado);
  } catch (err) { next(err); }
});

module.exports = router;
