// Listas de precio (Pescaderías/Mayoristas). Hoy esto no tiene histórico real
// (ver nota en schema.sql) — aquí sí se guarda un registro por tipo+fecha, y
// grabar dos veces el mismo día para el mismo tipo actualiza esa fila (mismo
// comportamiento de "autoguardado diario" que ya existe hoy, pero con
// histórico real en vez de perder el día anterior).
const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');

const router = express.Router();

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
        const r = await cliente.query(
          `INSERT INTO lista_precio_lineas (lista_precio_id, articulo_id, descripcion, precio, coste, existencias)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [lista.id, l.articulo_id || null, l.descripcion || null, l.precio || null, l.coste || null,
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
