const express = require('express');
const { pool, registrarAuditoria } = require('../db');
const { calcularLineaCompra } = require('../negocio/calculoCompras');
const { bloquearGrabacionDuplicada } = require('../negocio/bloqueoGrabado');

// Compras = dato sagrado (Fase 0 punto 3). Este router SOLO expone lectura
// y creacion. No hay PUT ni DELETE - ni siquiera a nivel de API - y ademas
// la base de datos bloquea UPDATE/DELETE con un trigger (ver schema.sql).
const router = express.Router();

const CAMPOS_LINEA = [
  'producto', 'descripcion', 'cajas', 'kilos', 'precio_kg', 'control',
  'base_zgz', 'base_zgz_iva', 'op2', 'base_real', 'iva', 'total_fact',
];

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM compras ORDER BY id`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM compras WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    const { rows: lineas } = await pool.query(
      `SELECT * FROM compra_lineas WHERE compra_id = $1 ORDER BY id`,
      [req.params.id]
    );
    res.json({ ...rows[0], lineas });
  } catch (err) { next(err); }
});

// El 2% de OP y el IVA se calculan aqui, en el servidor, leyendo el
// proveedor en el mismo instante de crear la compra (formula viva, ver
// Fase 0 punto 2 y Fase 2 punto 1/2) - nunca se confia en un op2/iva/
// baseReal que venga ya calculado desde el cliente, precisamente para no
// repetir el fallo historico de formula congelada.
router.post('/', bloquearGrabacionDuplicada('compras'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      numero_partida, fecha, alb_proveedor, proveedor_codigo, lineas = [],
    } = req.body;
    // puesto_origen es siempre el usuario autenticado (Fase 3 punto 1),
    // nunca lo que mande el cliente.
    const puesto_origen = req.usuario.usuario;

    await client.query('BEGIN');

    const { rows: provRows } = await client.query('SELECT * FROM proveedores WHERE codigo = $1', [proveedor_codigo]);
    if (!provRows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Proveedor ${proveedor_codigo} no encontrado` }); }
    const proveedor = provRows[0];

    // La partida se comparte entre TODAS las compras del MISMO proveedor en
    // la MISMA fecha, sin importar cuantos otros proveedores se hayan
    // cargado por en medio, ni el numero de albaran del proveedor (eso se
    // guarda igual, pero no forma parte de lo que decide la partida) - asi
    // es como ya lo hace el HTML actual (funcion partidaParaCompra). Si no
    // hay ninguna todavia para esa combinacion, se genera una nueva con la
    // secuencia (sin colisiones, ver Fase 1/Fase 3 punto 2).
    let numeroPartidaFinal = numero_partida;
    if (numeroPartidaFinal == null) {
      const { rows: existente } = await client.query(
        `SELECT numero_partida FROM compras
         WHERE fecha = $1 AND proveedor_codigo = $2 AND numero_partida IS NOT NULL
         ORDER BY id LIMIT 1`,
        [fecha, proveedor_codigo]
      );
      if (existente.length) {
        numeroPartidaFinal = existente[0].numero_partida;
      } else {
        const { rows: seqRows } = await client.query(`SELECT nextval('seq_partida_numero') AS n`);
        numeroPartidaFinal = seqRows[0].n;
      }
    }

    const lineasCalculadas = lineas.map((l) => ({ ...l, ...calcularLineaCompra(l, proveedor) }));
    const totalKilos = lineasCalculadas.reduce((s, l) => s + (Number(l.kilos) || 0), 0);
    const totalBaseZgz = lineasCalculadas.reduce((s, l) => s + l.base_zgz, 0);
    const totalBaseReal = lineasCalculadas.reduce((s, l) => s + l.base_real, 0);
    const totalIva = lineasCalculadas.reduce((s, l) => s + l.iva, 0);
    const totalFact = lineasCalculadas.reduce((s, l) => s + l.total_fact, 0);

    const { rows } = await client.query(
      `INSERT INTO compras (numero_partida, fecha, alb_proveedor, proveedor_codigo, proveedor_nombre,
                             total_kilos, total_base_zgz, total_base_real, total_iva, total_fact, puesto_origen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [numeroPartidaFinal, fecha, alb_proveedor, proveedor_codigo, proveedor.nombre,
        totalKilos, totalBaseZgz, totalBaseReal, totalIva, totalFact, puesto_origen]
    );
    const compra = rows[0];

    const lineasInsertadas = [];
    for (const linea of lineasCalculadas) {
      // '' (campo numerico dejado vacio en el formulario) no es un numero
      // valido para Postgres - se trata igual que "no informado".
      const valores = CAMPOS_LINEA.map((c) => (linea[c] === '' || linea[c] == null ? null : linea[c]));
      const placeholders = CAMPOS_LINEA.map((_, i) => `$${i + 2}`).join(', ');
      // eslint-disable-next-line no-await-in-loop
      const { rows: lr } = await client.query(
        `INSERT INTO compra_lineas (compra_id, ${CAMPOS_LINEA.join(', ')}) VALUES ($1, ${placeholders}) RETURNING *`,
        [compra.id, ...valores]
      );
      lineasInsertadas.push(lr[0]);
    }

    await registrarAuditoria(client, {
      tabla: 'compras', accion: 'INSERT', registroId: compra.id, puestoOrigen: puesto_origen,
      detalle: { numero_partida: numeroPartidaFinal, proveedor_codigo, num_lineas: lineasInsertadas.length },
    });

    await client.query('COMMIT');
    res.status(201).json({ ...compra, lineas: lineasInsertadas });
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

module.exports = router;
