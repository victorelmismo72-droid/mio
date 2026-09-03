const express = require('express');
const { pool, registrarAuditoria, vacioComoNull } = require('../db');
const { bloquearGrabacionDuplicada } = require('../negocio/bloqueoGrabado');

// `fecha` siempre es texto local 'AAAA-MM-DD' - nunca convertir con
// Date/UTC para sacar el ano (Fase 0 punto 7).
function anioDeFecha(fecha) {
  return fecha ? parseInt(String(fecha).slice(0, 4), 10) : null;
}

// Fabrica de CRUD para documentos con cabecera + lineas (pedidos, traspasos,
// repartos). A diferencia de compras, estos SI se pueden actualizar/borrar
// (no son "dato sagrado").
//
// `secuenciaNumero` (opcional): si se indica, el numero de documento se
// genera con esa secuencia de PostgreSQL cuando no viene ya en el body -
// nunca se confia en un contador llevado por el cliente. Esto es lo que
// garantiza que dos usuarios trabajando a la vez nunca obtengan el mismo
// numero de albaran/traspaso/reparto (Fase 0 punto 6 / Fase 3 punto 2).
// `calcularCabecera` (opcional): async (req, client, valoresPorColumna) =>
// { columna: valorNuevo, ... } - overrides que se calculan en el servidor
// (nunca confiando en lo que mande el cliente), igual que el 2% de OP y el
// IVA en compras. Pensado para que pedidos.js calcule aqui el IVA/Recargo
// de Equivalencia real del cliente en vez de dejarlo en blanco.
function crudDocumento({ tabla, tablaLineas, columnasCabecera, columnasLinea, fkLinea, secuenciaNumero, calcularCabecera }) {
  const router = express.Router();
  const colsCab = columnasCabecera.join(', ');

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tabla} ORDER BY id`);
      res.json(rows);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${tabla} WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      const { rows: lineas } = await pool.query(
        `SELECT * FROM ${tablaLineas} WHERE ${fkLinea} = $1 ORDER BY id`, [req.params.id]
      );
      res.json({ ...rows[0], lineas });
    } catch (err) { next(err); }
  });

  router.post('/', bloquearGrabacionDuplicada(tabla), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { lineas = [] } = req.body;

      await client.query('BEGIN');

      let numero = req.body.numero;
      if (secuenciaNumero && (numero === undefined || numero === null)) {
        const { rows: seqRows } = await client.query(`SELECT nextval('${secuenciaNumero}') AS n`);
        numero = seqRows[0].n;
      }
      // puesto_origen siempre es el usuario autenticado, nunca lo que
      // mande el cliente (Fase 3 punto 1: "cada registro debe guardar de
      // forma fiable que usuario lo creo").
      const porColumna = {};
      columnasCabecera.forEach((c) => {
        if (c === 'numero') porColumna[c] = numero;
        else if (c === 'anio') porColumna[c] = anioDeFecha(req.body.fecha);
        else if (c === 'puesto_origen') porColumna[c] = req.usuario.usuario;
        else porColumna[c] = vacioComoNull(req.body[c]);
      });
      if (calcularCabecera) Object.assign(porColumna, await calcularCabecera(req, client, porColumna));
      const valoresCab = columnasCabecera.map((c) => porColumna[c]);
      const placeholders = columnasCabecera.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await client.query(
        `INSERT INTO ${tabla} (${colsCab}) VALUES (${placeholders}) RETURNING *`,
        valoresCab
      );
      const cabecera = rows[0];

      const lineasInsertadas = [];
      for (const linea of lineas) {
        const valoresLinea = columnasLinea.map((c) => vacioComoNull(linea[c]));
        const ph = columnasLinea.map((_, i) => `$${i + 2}`).join(', ');
        const { rows: lr } = await client.query(
          `INSERT INTO ${tablaLineas} (${fkLinea}, ${columnasLinea.join(', ')}) VALUES ($1, ${ph}) RETURNING *`,
          [cabecera.id, ...valoresLinea]
        );
        lineasInsertadas.push(lr[0]);
      }

      await registrarAuditoria(client, { tabla, accion: 'INSERT', registroId: cabecera.id, puestoOrigen: req.usuario.usuario, detalle: { num_lineas: lineasInsertadas.length } });
      await client.query('COMMIT');
      res.status(201).json({ ...cabecera, lineas: lineasInsertadas });
    } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
  });

  // Editar un documento reemplaza cabecera Y lineas (igual que el HTML
  // actual: "modificar" borra el registro entero y lo vuelve a grabar con
  // el mismo numero, ver funcion grabarPedido). Antes esto solo tocaba la
  // cabecera - las lineas nuevas nunca llegaban a guardarse, aunque no
  // hubiera pantalla todavia que lo intentara.
  router.put('/:id', bloquearGrabacionDuplicada(tabla), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { lineas = [] } = req.body;
      const porColumna = {};
      columnasCabecera.forEach((c) => {
        if (c === 'anio') porColumna[c] = anioDeFecha(req.body.fecha);
        else if (c === 'puesto_origen') porColumna[c] = req.usuario.usuario;
        else porColumna[c] = vacioComoNull(req.body[c]);
      });
      if (calcularCabecera) Object.assign(porColumna, await calcularCabecera(req, client, porColumna));
      const sets = columnasCabecera.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const valores = columnasCabecera.map((c) => porColumna[c]);
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE ${tabla} SET ${sets}, modificado_en = now() WHERE id = $${columnasCabecera.length + 1} RETURNING *`,
        [...valores, req.params.id]
      );
      if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No encontrado' }); }
      const cabecera = rows[0];

      await client.query(`DELETE FROM ${tablaLineas} WHERE ${fkLinea} = $1`, [req.params.id]);
      const lineasInsertadas = [];
      for (const linea of lineas) {
        const valoresLinea = columnasLinea.map((c) => vacioComoNull(linea[c]));
        const ph = columnasLinea.map((_, i) => `$${i + 2}`).join(', ');
        const { rows: lr } = await client.query(
          `INSERT INTO ${tablaLineas} (${fkLinea}, ${columnasLinea.join(', ')}) VALUES ($1, ${ph}) RETURNING *`,
          [cabecera.id, ...valoresLinea]
        );
        lineasInsertadas.push(lr[0]);
      }

      await registrarAuditoria(client, { tabla, accion: 'UPDATE', registroId: req.params.id, puestoOrigen: req.usuario.usuario, detalle: { num_lineas: lineasInsertadas.length } });
      await client.query('COMMIT');
      res.json({ ...cabecera, lineas: lineasInsertadas });
    } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
  });

  // Cambiar solo el numero de un documento ya grabado - igual que
  // renumerarPedido()/renumerarTraspaso() del HTML actual: no toca nada mas
  // (cabecera ni lineas), asi que no hace falta reenviar todo el documento
  // solo para corregir un numero. La unicidad real (dentro del mismo ano) la
  // garantiza la propia base de datos (UNIQUE(anio, numero)) - aqui solo se
  // traduce ese rechazo a un mensaje que tenga sentido para quien lo usa.
  router.put('/:id/numero', async (req, res, next) => {
    try {
      const nuevoNumero = parseInt(req.body.numero, 10);
      if (!nuevoNumero || nuevoNumero < 1) return res.status(400).json({ error: 'Número no válido.' });
      const { rows } = await pool.query(
        `UPDATE ${tabla} SET numero = $1, modificado_en = now() WHERE id = $2 RETURNING *`,
        [nuevoNumero, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      await registrarAuditoria(pool, { tabla, accion: 'UPDATE', registroId: req.params.id, puestoOrigen: req.usuario.usuario, detalle: { renumerado_a: nuevoNumero } });
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Ese número ya lo usa otro documento de ese año. Elige uno distinto.' });
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${tablaLineas} WHERE ${fkLinea} = $1`, [req.params.id]);
      const { rowCount } = await client.query(`DELETE FROM ${tabla} WHERE id = $1`, [req.params.id]);
      if (!rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No encontrado' }); }
      await registrarAuditoria(client, { tabla, accion: 'DELETE', registroId: req.params.id, puestoOrigen: req.usuario.usuario });
      await client.query('COMMIT');
      res.status(204).end();
    } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
  });

  return router;
}

module.exports = crudDocumento;
