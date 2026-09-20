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
const { obtenerModelo } = require('../modelosImpresion');
const { valoresTransfrioPedido, valoresCmr } = require('../logica/datosImpresion');
const { formatoParaCliente } = require('../etiquetasFormatos');
const { datosEtiquetaLinea, copiasPorLinea } = require('../logica/datosEtiquetas');
const { obtenerDiasCaducidad } = require('../lib/configuracion');

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

// Datos ya resueltos para imprimir uno o varios pedidos de golpe — corrección
// 02/09/2026 punto 9: "cualquier documento... debe poder imprimirse tanto de
// uno en uno como en lote". Un solo pedido es, sencillamente, un lote de 1.
// IMPORTANTE: esta ruta va ANTES de "/:id" — si no, Express la confundiría
// con un pedido cuyo id fuese literalmente "imprimir".
router.get('/imprimir', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
    const modeloId = req.query.modelo || null;
    if (!ids.length) return res.status(400).json({ error: 'Falta "ids" (uno o varios id de pedido separados por coma).' });
    const modelo = modeloId ? obtenerModelo(modeloId) : null;
    if (modeloId && !modelo) return res.status(400).json({ error: `No existe el modelo de impresión "${modeloId}".` });

    const resultado = await conTransaccion(async (cliente) => {
      const salida = [];
      for (const id of ids) {
        const cab = await cliente.query('SELECT * FROM pedidos WHERE id = $1', [id]);
        if (!cab.rows.length) continue;
        const lineasR = await cliente.query('SELECT * FROM pedido_lineas WHERE pedido_id = $1 ORDER BY id', [id]);
        const pedido = cab.rows[0], lineas = lineasR.rows;
        let valores = null;
        let clienteInfo = null;
        if (pedido.cliente_id) {
          const c = await cliente.query('SELECT agencia FROM clientes WHERE id = $1', [pedido.cliente_id]);
          clienteInfo = c.rows[0] || null;
        }
        if (modelo && modelo.id === 'transfrio') valores = valoresTransfrioPedido(pedido, lineas);
        if (modelo && modelo.id === 'cmr') {
          if (!modelo.condicionCliente(clienteInfo || { agencia: pedido.agencia })) {
            // Se omite del lote, pero no aborta el resto — al imprimir en lote
            // desde Historial, la mayoría no llevará agencia MOZO y no tiene
            // sentido que uno solo sin CMR bloquee imprimir los demás (el
            // llamador compara cuántos pedía contra cuántos ha recibido para
            // avisar de los omitidos; ver historial.js).
            continue;
          }
          valores = valoresCmr(pedido, lineas);
        }
        salida.push({ pedido, lineas, valores });
      }
      return salida;
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

// Etiquetas de un pedido (FASE_5) — cuatro modos, igual que el diálogo del
// HTML actual: todas las líneas, una selección de líneas, una etiqueta de
// prueba, o repetir N etiquetas de una línea concreta a mano.
router.get('/:id/etiquetas', async (req, res, next) => {
  try {
    const modo = req.query.modo || 'todas';
    const resultado = await conTransaccion(async (cliente) => {
      const cabR = await cliente.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
      if (!cabR.rows.length) return null;
      const pedido = cabR.rows[0];
      const lineasR = await cliente.query('SELECT * FROM pedido_lineas WHERE pedido_id = $1 ORDER BY id', [req.params.id]);
      const lineas = lineasR.rows;
      if (!lineas.length) return { error: 'Este pedido no tiene líneas.' };

      let clienteInfo = null;
      if (pedido.cliente_id) {
        const c = await cliente.query('SELECT * FROM clientes WHERE id = $1', [pedido.cliente_id]);
        clienteInfo = c.rows[0] || null;
      }
      const formatoId = formatoParaCliente(clienteInfo);
      const diasCaducidad = await obtenerDiasCaducidad(cliente);

      async function articuloDeLinea(linea) {
        if (!linea.articulo_id) return null;
        const a = await cliente.query('SELECT * FROM articulos WHERE id = $1', [linea.articulo_id]);
        return a.rows[0] || null;
      }
      async function etiquetasDeLinea(linea, copias) {
        const articulo = await articuloDeLinea(linea);
        const dato = datosEtiquetaLinea({ fecha: pedido.fecha, articulo, cliente: clienteInfo, formatoId, diasCaducidad });
        return Array.from({ length: copias }, () => dato);
      }

      let datos = [];
      if (modo === 'todas') {
        for (const l of lineas) datos = datos.concat(await etiquetasDeLinea(l, copiasPorLinea(l)));
      } else if (modo === 'seleccion') {
        const ids = String(req.query.lineas || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!ids.length) return { error: 'No se ha marcado ninguna línea.' };
        for (const l of lineas.filter((l) => ids.includes(String(l.id)))) datos = datos.concat(await etiquetasDeLinea(l, copiasPorLinea(l)));
      } else if (modo === 'prueba' || modo === 'repetir') {
        const linea = lineas.find((l) => String(l.id) === String(req.query.linea));
        if (!linea) return { error: 'No se encuentra esa línea del pedido.' };
        const copias = modo === 'prueba' ? 1 : Math.max(1, parseInt(req.query.cantidad, 10) || 1);
        datos = await etiquetasDeLinea(linea, copias);
      } else {
        return { error: `Modo de impresión de etiquetas desconocido: "${modo}".` };
      }
      if (!datos.length) return { error: 'No hay ninguna etiqueta que imprimir con esta selección.' };
      return { formato_id: formatoId, pedido: { numero: pedido.numero, cliente_nombre: pedido.cliente_nombre_snapshot }, datos };
    });
    if (!resultado) return res.status(404).json({ error: `No existe ningún pedido con id ${req.params.id}` });
    if (resultado.error) return res.status(400).json({ error: resultado.error });
    res.json(resultado);
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
      // Para cuando no llega ninguna al margen mínimo: la pantalla puede
      // ofrecer elegir a mano entre estas, con su margen ya calculado.
      candidatas: resultado.candidatas.map((c) => ({
        numero_partida: c.numeroPartida, fecha: c.fecha, kilos_disponibles: c.kilosDisponibles,
        coste_medio_kg: c.costeMedioKg, margen: c.margen,
      })),
    });
  } catch (err) { next(err); }
});

// Líneas de pedidos/pedido_lineas cuya partida quedó pendiente de revisión
// manual (sin asignar, o asignada pero sin llegar al margen mínimo) — la
// "pantalla de excepciones" del programa actual (Fase 0, punto 3).
router.get('/excepciones/lista', async (req, res, next) => {
  try {
    const filas = await conTransaccion(async (cliente) => {
      const r = await cliente.query(
        `SELECT pl.*, p.numero AS pedido_numero, p.fecha AS pedido_fecha
         FROM pedido_lineas pl JOIN pedidos p ON p.id = pl.pedido_id
         WHERE pl.estado_asignacion IN ('AVISO_MARGEN', 'PENDIENTE_MANUAL')
         ORDER BY p.fecha DESC, p.numero DESC`
      );
      // Se calculan ya aquí las candidatas de cada línea (sin guardar nada)
      // para que la pantalla pueda ofrecer "asignar a mano" sin que el
      // usuario tenga que pulsar antes "Reasignar pendientes".
      for (const l of r.rows) {
        const { codigo, descripcion } = await resolverArticuloParaFamilia(cliente, l);
        l.candidatas = codigo
          ? (await asignarPartidaAutomatica(cliente, { articuloCodigo: codigo, articuloDescripcion: descripcion, precioVenta: l.precio }))
            .candidatas.map((c) => ({ numero_partida: c.numeroPartida, fecha: c.fecha, coste_medio_kg: c.costeMedioKg, margen: c.margen }))
          : [];
      }
      return r.rows;
    });
    res.json(filas);
  } catch (err) { next(err); }
});

// "Asignar partidas pendientes en bloque" (FASE_2, adaptación de
// asignarPartidasDelDia() del HTML actual — ver FASE_2_logica_de_negocio
// punto de "asignación automática"). A diferencia del HTML actual, aquí no
// se limita a los pedidos de un día: reintenta TODAS las líneas que hoy
// están pendientes de revisión (pueden llevar semanas ahí si nadie las
// mira), porque puede haber llegado compra nueva desde entonces que ya
// cumpla el margen. Nunca fuerza una partida sin margen — eso es
// precisamente lo que hace este bloque, a diferencia de la función
// autoAsignarPartidas() (esa otra sí caía a la más antigua sin margen; no
// se ha reproducido a propósito, porque contradice la regla ya construida
// y probada en Fase 2 de "si nadie llega al margen, no se asigna sola").
router.post('/excepciones/reasignar', async (req, res, next) => {
  try {
    const resultado = await conTransaccion(async (cliente) => {
      const pendientesR = await cliente.query(
        `SELECT pl.*, p.numero AS pedido_numero, p.fecha AS pedido_fecha
         FROM pedido_lineas pl JOIN pedidos p ON p.id = pl.pedido_id
         WHERE pl.estado_asignacion IN ('AVISO_MARGEN', 'PENDIENTE_MANUAL')
         ORDER BY p.fecha, p.numero`
      );
      let asignadas = 0;
      let sinCambios = 0;
      const pendientes = [];
      for (const l of pendientesR.rows) {
        const { codigo, descripcion } = await resolverArticuloParaFamilia(cliente, l);
        if (!codigo) { sinCambios++; continue; }
        const auto = await asignarPartidaAutomatica(cliente, { articuloCodigo: codigo, articuloDescripcion: descripcion, precioVenta: l.precio });
        if (auto.estadoAsignacion === 'OK') {
          await cliente.query(
            'UPDATE pedido_lineas SET numero_partida = $1, estado_asignacion = $2, asignacion_manual = false WHERE id = $3',
            [auto.numeroPartida, auto.estadoAsignacion, l.id]
          );
          asignadas++;
        } else {
          if (auto.estadoAsignacion !== l.estado_asignacion) {
            await cliente.query('UPDATE pedido_lineas SET estado_asignacion = $1 WHERE id = $2', [auto.estadoAsignacion, l.id]);
          }
          sinCambios++;
          pendientes.push({
            id: l.id, pedido_numero: l.pedido_numero, pedido_fecha: l.pedido_fecha,
            articulo_codigo_snapshot: l.articulo_codigo_snapshot, descripcion_snapshot: l.descripcion_snapshot,
            peso: l.peso, precio: l.precio, estado_asignacion: auto.estadoAsignacion,
            candidatas: auto.candidatas.map((c) => ({ numero_partida: c.numeroPartida, fecha: c.fecha, coste_medio_kg: c.costeMedioKg, margen: c.margen })),
          });
        }
      }
      return { asignadas, sin_cambios: sinCambios, pendientes };
    });
    res.json(resultado);
  } catch (err) { next(err); }
});

// Resolver a mano una línea concreta de las excepciones (elegir una de sus
// partidas candidatas, aunque no llegue al margen mínimo) — igual que
// aplicarExcepcionesPartidas() del HTML actual, línea a línea en vez de en
// bloque, porque aquí cada una puede necesitar un juicio distinto.
router.post('/excepciones/:lineaId/asignar', async (req, res, next) => {
  try {
    const { numero_partida: numeroPartida } = req.body;
    if (!numeroPartida) return res.status(400).json({ error: 'Falta "numero_partida".' });
    const resultado = await conTransaccion(async (cliente) => {
      await cliente.query('INSERT INTO partidas (numero_partida) VALUES ($1) ON CONFLICT DO NOTHING', [numeroPartida]);
      const r = await cliente.query(
        `UPDATE pedido_lineas SET numero_partida = $1, estado_asignacion = 'OK', asignacion_manual = true WHERE id = $2 RETURNING *`,
        [numeroPartida, req.params.lineaId]
      );
      return r.rows[0] || null;
    });
    if (!resultado) return res.status(404).json({ error: `No existe ninguna línea de pedido con id ${req.params.lineaId}` });
    res.json(resultado);
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
