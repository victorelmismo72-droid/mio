// Pedidos (albaranes de venta). A diferencia de compras, sí se pueden
// corregir o anular — pero toda creación pasa por la misma protección de
// guardado duplicado (ver lib/idempotencia.js) que exige la corrección del
// 02/09/2026 (punto 1) y FASE_2 (punto 5quater).
//
// Fase 2: aquí se conectan dos piezas de lógica de negocio nuevas —
//   1. Asignación automática de partida por línea (familiaProducto.js +
//      partidas.js), con el margen mínimo de 1,30 €/kg.
//   2. IVA / Recargo de Equivalencia de venta (calculosVenta.js), calculado
//      a partir del tipo fiscal del cliente en vivo, no confiado del cliente
//      HTTP que llama a la API.
const express = require('express');
const { conTransaccion } = require('../db');
const { registrarEscritura } = require('../lib/log');
const { ejecutarIdempotente } = require('../lib/idempotencia');
const { asignarPartidaAutomatica } = require('../logica/partidas');
const { calcularIvaVenta } = require('../logica/calculosVenta');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { desde, hasta, cliente_id } = req.query;
    const condiciones = [];
    const valores = [];
    if (desde) { valores.push(desde); condiciones.push(`fecha >= $${valores.length}`); }
    if (hasta) { valores.push(hasta); condiciones.push(`fecha <= $${valores.length}`); }
    if (cliente_id) { valores.push(cliente_id); condiciones.push(`cliente_id = $${valores.length}`); }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const r = await conTransaccion((cliente) => cliente.query(`SELECT * FROM pedidos ${where} ORDER BY fecha DESC, numero DESC`, valores));
    res.json(r.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const cabecera = await cliente.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
      if (!cabecera.rows.length) return null;
      const lineas = await cliente.query('SELECT * FROM pedido_lineas WHERE pedido_id = $1 ORDER BY id', [req.params.id]);
      return { ...cabecera.rows[0], lineas: lineas.rows };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún pedido con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) { next(err); }
});

// Vista previa de la asignación automática de partida (Fase 0, punto 3:
// "asignación automática inline, al introducir producto y precio"). Una
// futura pantalla (Fase 4) puede llamar a esto mientras el usuario teclea,
// antes de grabar nada.
router.post('/asignar-partida', async (req, res, next) => {
  try {
    const { articulo_codigo, articulo_descripcion, precio } = req.body;
    if (!articulo_codigo) return res.status(400).json({ error: 'Falta "articulo_codigo".' });
    const resultado = await conTransaccion((cliente) => asignarPartidaAutomatica(cliente, {
      articuloCodigo: articulo_codigo, articuloDescripcion: articulo_descripcion, precioVenta: precio,
    }));
    res.json({
      numero_partida: resultado.numeroPartida,
      estado_asignacion: resultado.estadoAsignacion,
      margen: resultado.margen,
    });
  } catch (err) { next(err); }
});

// Líneas de pedidos/pedido_lineas cuya partida quedó pendiente de revisión
// manual (sin asignar, o asignada pero sin llegar al margen mínimo) — la
// "pantalla de excepciones" del programa actual (Fase 0, punto 3).
router.get('/excepciones/lista', async (req, res, next) => {
  try {
    const r = await conTransaccion((cliente) => cliente.query(
      `SELECT pl.*, p.numero AS pedido_numero, p.fecha AS pedido_fecha
       FROM pedido_lineas pl JOIN pedidos p ON p.id = pl.pedido_id
       WHERE pl.estado_asignacion IN ('AVISO_MARGEN', 'PENDIENTE_MANUAL')
       ORDER BY p.fecha DESC, p.numero DESC`
    ));
    res.json(r.rows);
  } catch (err) { next(err); }
});

async function resolverArticuloParaFamilia(cliente, l) {
  if (l.descripcion_snapshot) return { codigo: l.articulo_codigo_snapshot, descripcion: l.descripcion_snapshot };
  if (l.articulo_id) {
    const r = await cliente.query('SELECT codigo, descripcion FROM articulos WHERE id = $1', [l.articulo_id]);
    if (r.rows.length) return { codigo: r.rows[0].codigo, descripcion: r.rows[0].descripcion };
  }
  if (l.articulo_codigo_snapshot) {
    const r = await cliente.query('SELECT codigo, descripcion FROM articulos WHERE codigo = $1', [l.articulo_codigo_snapshot]);
    if (r.rows.length) return { codigo: r.rows[0].codigo, descripcion: r.rows[0].descripcion };
  }
  return { codigo: l.articulo_codigo_snapshot || null, descripcion: null };
}

async function insertarLineasPedido(cliente, pedidoId, lineas) {
  const guardadas = [];
  for (const l of lineas) {
    let numeroPartida = l.numero_partida || null;
    let estadoAsignacion = l.estado_asignacion || null;
    let asignacionManual = !!l.asignacion_manual;

    // Si la pantalla no trae ya una partida resuelta, se asigna aquí mismo
    // en el servidor (mismo criterio que la vista previa de arriba).
    if (!numeroPartida) {
      const { codigo, descripcion } = await resolverArticuloParaFamilia(cliente, l);
      if (codigo) {
        const auto = await asignarPartidaAutomatica(cliente, {
          articuloCodigo: codigo, articuloDescripcion: descripcion, precioVenta: l.precio,
        });
        numeroPartida = auto.numeroPartida;
        estadoAsignacion = auto.estadoAsignacion;
        asignacionManual = false;
      } else {
        estadoAsignacion = 'PENDIENTE_MANUAL';
      }
    } else if (!estadoAsignacion) {
      // El cliente mandó una partida concreta sin pasar por la asignación
      // automática (p.ej. el usuario la eligió a mano): se trata como
      // asignación manual, igual que el _partidaManual del HTML actual.
      estadoAsignacion = 'OK';
      asignacionManual = true;
    }

    if (numeroPartida) {
      await cliente.query('INSERT INTO partidas (numero_partida) VALUES ($1) ON CONFLICT DO NOTHING', [numeroPartida]);
    }

    const r = await cliente.query(
      `INSERT INTO pedido_lineas
        (pedido_id, articulo_id, articulo_codigo_snapshot, descripcion_snapshot, descripcion_editada,
         cantidad, peso, precio, descuento, iva_pct, total, numero_partida, asignacion_manual, estado_asignacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [pedidoId, l.articulo_id || null, l.articulo_codigo_snapshot || null, l.descripcion_snapshot || null,
        l.descripcion_editada || null, l.cantidad || null, l.peso || null, l.precio || null,
        l.descuento || 0, l.iva_pct == null ? 10 : l.iva_pct, l.total || null,
        numeroPartida, asignacionManual, estadoAsignacion]
    );
    guardadas.push(r.rows[0]);
  }
  return guardadas;
}

// IVA/Recargo de venta (Fase 2, punto 2): se calcula aquí, leyendo el tipo
// fiscal del cliente EN VIVO — nunca se acepta un iva/total ya calculado
// desde fuera para estos campos.
async function calcularCabeceraVenta(cliente, { clienteId, lineas }) {
  if (!clienteId) {
    throw Object.assign(new Error('Falta "cliente_id": hace falta para calcular el IVA/Recargo de venta correctamente.'), { status: 400 });
  }
  const r = await cliente.query('SELECT * FROM clientes WHERE id = $1', [clienteId]);
  if (!r.rows.length) throw Object.assign(new Error(`No existe ningún cliente con id ${clienteId}.`), { status: 400 });
  const clienteFila = r.rows[0];
  const base = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const { ivaPct, recargoPct, ivaImporte, recargoImporte, total } = calcularIvaVenta({ tipoIvaCliente: clienteFila.tipo_iva, baseImponible: base });
  return {
    cliente: clienteFila,
    tipoIvaAplicado: clienteFila.tipo_iva,
    base, ivaPct, recargoPct, ivaImporte, recargoImporte, total,
  };
}

router.post('/', async (req, res, next) => {
  try {
    const { uid, fecha, cliente_id, agencia, forma_pago, lineas } = req.body;
    const puesto_id = req.body.puesto_id || req.puestoId || null;

    if (!uid) return res.status(400).json({ error: 'Falta "uid": todo pedido necesita una clave única generada por la pantalla que graba.' });
    if (!fecha) return res.status(400).json({ error: 'Falta "fecha".' });
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Un pedido necesita al menos una línea.' });

    const resultado = await conTransaccion(async (cliente) => {
      const { enCurso, duplicado, respuesta } = await ejecutarIdempotente(cliente, {
        clave: uid,
        tabla: 'pedidos',
        fn: async () => {
          const venta = await calcularCabeceraVenta(cliente, { clienteId: cliente_id, lineas });
          const c = venta.cliente;
          const cab = await cliente.query(
            `INSERT INTO pedidos
              (fecha, cliente_id, cliente_codigo_snapshot, cliente_nombre_snapshot, cliente_cif_snapshot,
               cliente_dir_snapshot, cliente_pob_snapshot, cliente_tel_snapshot, agencia, forma_pago,
               tipo_iva_aplicado, base, iva, recargo_importe, total, puesto_id, uid)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING *`,
            [fecha, c.id, c.codigo, c.nombre, c.cif, c.direccion, c.poblacion, c.telefono,
              agencia || c.agencia || null, forma_pago || c.forma_pago || null, venta.tipoIvaAplicado,
              venta.base, venta.ivaImporte, venta.recargoImporte, venta.total, puesto_id || null, uid]
          );
          const pedido = cab.rows[0];
          const lineasGuardadas = await insertarLineasPedido(cliente, pedido.id, lineas);
          await registrarEscritura(cliente, { tabla: 'pedidos', operacion: 'INSERT', registroId: pedido.id, puestoId: puesto_id, detalle: { uid, numero: pedido.numero } });
          return { ...pedido, lineas: lineasGuardadas };
        },
      });
      if (enCurso) return { estado: 'en_curso' };
      if (duplicado) return { estado: 'ya_grabado', pedido: respuesta };
      return { estado: 'grabado', pedido: respuesta };
    });

    if (resultado.estado === 'en_curso') {
      return res.status(409).json({ aviso: 'Este pedido ya se está grabando (otra petición con la misma clave está en curso). No se ha creado un duplicado.' });
    }
    res.status(resultado.estado === 'grabado' ? 201 : 200).json(resultado.pedido);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// Corrección de un pedido ya grabado: sustituye cabecera y líneas por las
// nuevas. No es lo mismo que "compras" (que nunca se toca) — aquí sí se
// permite, porque el programa actual también permite corregir un pedido.
router.put('/:id', async (req, res, next) => {
  try {
    const { fecha, cliente_id, agencia, forma_pago, lineas } = req.body;
    if (!Array.isArray(lineas) || !lineas.length) return res.status(400).json({ error: 'Un pedido necesita al menos una línea.' });

    const resultado = await conTransaccion(async (cliente) => {
      const venta = await calcularCabeceraVenta(cliente, { clienteId: cliente_id, lineas });
      const c = venta.cliente;
      const cab = await cliente.query(
        `UPDATE pedidos SET fecha=$1, cliente_id=$2, cliente_codigo_snapshot=$3, cliente_nombre_snapshot=$4,
           cliente_cif_snapshot=$5, cliente_dir_snapshot=$6, cliente_pob_snapshot=$7, cliente_tel_snapshot=$8,
           agencia=$9, forma_pago=$10, tipo_iva_aplicado=$11, base=$12, iva=$13, recargo_importe=$14, total=$15,
           modificado_en=now()
         WHERE id=$16 RETURNING *`,
        [fecha, c.id, c.codigo, c.nombre, c.cif, c.direccion, c.poblacion, c.telefono,
          agencia || c.agencia || null, forma_pago || c.forma_pago || null, venta.tipoIvaAplicado,
          venta.base, venta.ivaImporte, venta.recargoImporte, venta.total, req.params.id]
      );
      if (!cab.rows.length) return null;
      await cliente.query('DELETE FROM pedido_lineas WHERE pedido_id = $1', [req.params.id]);
      const lineasGuardadas = await insertarLineasPedido(cliente, req.params.id, lineas);
      await registrarEscritura(cliente, { tabla: 'pedidos', operacion: 'UPDATE', registroId: req.params.id, detalle: { numero: cab.rows[0].numero } });
      return { ...cab.rows[0], lineas: lineasGuardadas };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún pedido con id ${req.params.id}` });
    res.json(resultado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const borrado = await conTransaccion(async (cliente) => {
      const r = await cliente.query('DELETE FROM pedidos WHERE id = $1 RETURNING id, numero', [req.params.id]);
      if (!r.rows.length) return null;
      await registrarEscritura(cliente, { tabla: 'pedidos', operacion: 'DELETE', registroId: req.params.id, detalle: { numero: r.rows[0].numero } });
      return r.rows[0];
    });
    if (!borrado) return res.status(404).json({ error: `No existe ningún pedido con id ${req.params.id}` });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
