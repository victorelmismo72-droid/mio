// Compras = dato sagrado (ver FASE_0, punto 3): esta ruta solo permite crear
// y leer, nunca modificar ni borrar. La base de datos ya lo bloquea por sí
// misma (trigger en schema.sql), pero además esta API ni siquiera ofrece los
// verbos PUT/DELETE, para que quede claro también en el diseño de la API.
//
// Fase 2: el 2% de OP y el IVA de cada línea se calculan aquí, en el
// servidor, leyendo el proveedor EN VIVO en el momento de grabar — nunca se
// confía en un op2/iva que venga ya calculado desde la pantalla (ver
// FASE_0 punto 2 y FASE_2 punto 1: ese fue exactamente el fallo histórico
// de la fórmula congelada).
const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');
const { ejecutarIdempotente } = require('../lib/idempotencia');
const { calcularLineaCompra, calcularCabeceraCompra } = require('../logica/calculosCompra');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const r = await conTransaccion((cliente) => cliente.query('SELECT * FROM compras ORDER BY fecha DESC, id DESC'));
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const cabecera = await cliente.query('SELECT * FROM compras WHERE id = $1', [req.params.id]);
      if (!cabecera.rows.length) return null;
      const lineas = await cliente.query('SELECT * FROM compra_lineas WHERE compra_id = $1 ORDER BY id', [req.params.id]);
      return { ...cabecera.rows[0], lineas: lineas.rows };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ninguna compra con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

// Vista previa (sin guardar nada) de cómo quedaría el cálculo de una línea,
// para que una futura pantalla (Fase 4) pueda mostrarlo mientras se teclea.
router.post('/calcular-linea', async (req, res, next) => {
  try {
    const { proveedor_id, kilos, precio_kg } = req.body;
    if (!proveedor_id) return res.status(400).json({ error: 'Falta "proveedor_id".' });
    const resultado = await conTransaccion(async (cliente) => {
      const prov = await cliente.query('SELECT * FROM proveedores WHERE id = $1', [proveedor_id]);
      if (!prov.rows.length) return null;
      return calcularLineaCompra({ kilos, precioKg: precio_kg, proveedor: prov.rows[0] });
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún proveedor con id ${proveedor_id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { uid, numero_partida, fecha, alb_proveedor, proveedor_id, puesto_id, lineas } = req.body;

    if (!uid) return res.status(400).json({ error: 'Falta "uid": toda compra necesita una clave única generada por la pantalla que graba.' });
    if (!numero_partida) return res.status(400).json({ error: 'Falta "numero_partida".' });
    if (!fecha) return res.status(400).json({ error: 'Falta "fecha".' });
    if (!proveedor_id) return res.status(400).json({ error: 'Falta "proveedor_id".' });
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Una compra necesita al menos una línea.' });
    for (const l of lineas) {
      if (l.kilos == null || l.precio_kg == null) {
        return res.status(400).json({ error: 'Cada línea necesita "kilos" y "precio_kg" — el resto de importes los calcula el servidor.' });
      }
    }

    const resultado = await conTransaccion(async (cliente) => {
      const { duplicado, enCurso, respuesta } = await ejecutarIdempotente(cliente, {
        clave: uid,
        tabla: 'compras',
        fn: async () => {
          const provFila = await cliente.query('SELECT * FROM proveedores WHERE id = $1', [proveedor_id]);
          if (!provFila.rows.length) throw new Error(`No existe ningún proveedor con id ${proveedor_id}.`);
          const proveedor = provFila.rows[0];

          await cliente.query(
            'INSERT INTO partidas (numero_partida) VALUES ($1) ON CONFLICT DO NOTHING',
            [numero_partida]
          );

          // Cálculo EN VIVO (Fase 2, punto 1 y 2): op2/iva/totales nunca se
          // aceptan tal cual del cliente, se recalculan aquí con el
          // proveedor recién leído.
          const lineasCalculadas = lineas.map((l) => ({
            original: l,
            kilosOriginal: l.kilos,
            ...calcularLineaCompra({ kilos: l.kilos, precioKg: l.precio_kg, proveedor }),
          }));
          const totales = calcularCabeceraCompra(lineasCalculadas);

          const cab = await cliente.query(
            `INSERT INTO compras
              (numero_partida, fecha, alb_proveedor, proveedor_id, proveedor_nombre_snapshot,
               total_kilos, total_base_zgz, total_base_real, total_iva, total_factura, puesto_id, uid)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [numero_partida, fecha, alb_proveedor || null, proveedor_id, proveedor.nombre,
              totales.totalKilos, totales.totalBaseZgz, totales.totalBaseReal, totales.totalIva,
              totales.totalFactura, puesto_id || null, uid]
          );
          const compra = cab.rows[0];

          const lineasGuardadas = [];
          for (const lc of lineasCalculadas) {
            const l = lc.original;
            const r = await cliente.query(
              `INSERT INTO compra_lineas
                (compra_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot, cajas, kilos,
                 precio_kg, base_zgz, base_zgz_iva, op2_importe, base_real, iva_importe, total_factura, control)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
               RETURNING *`,
              [compra.id, l.articulo_id || null, l.articulo_codigo_snapshot || null, l.descripcion_snapshot || null,
                l.cajas || null, l.kilos, l.precio_kg, lc.baseZgz, lc.baseZgzIva, lc.op2Importe, lc.baseReal,
                lc.ivaImporte, lc.totalFactura, l.control === undefined ? null : l.control]
            );
            lineasGuardadas.push(r.rows[0]);
          }

          await registrarEscritura(cliente, { tabla: 'compras', operacion: 'INSERT', registroId: compra.id, puestoId: puesto_id, detalle: { uid } });
          return { ...compra, lineas: lineasGuardadas };
        },
      });

      if (enCurso) return { estado: 'en_curso' };
      if (duplicado) return { estado: 'ya_grabada', compra: respuesta };
      return { estado: 'grabada', compra: respuesta };
    });

    if (resultado.estado === 'en_curso') {
      return res.status(409).json({ aviso: 'Esta compra ya se está grabando (otra petición con la misma clave está en curso). No se ha creado un duplicado.' });
    }
    res.status(resultado.estado === 'grabada' ? 201 : 200).json(resultado.compra);
  } catch (err) { next(err); }
});

module.exports = router;
