// Listados de gestión (Fase 2, punto 6). Ver src/listadoGestion.js para la
// regla de negocio (separar siempre venta real de traspaso interno).
const express = require('express');
const ExcelJS = require('exceljs');
const { construirListadoGestion } = require('../listadoGestion');
const { calcularKilosPorPartida } = require('../margenPartida');

const router = express.Router();

// GET /listados/kilos-por-partida?producto=&partida=&desde=&hasta=&soloPendiente=true&soloExceso=true
// Ver Fase 2 punto 4 (24/11/2026) - comprados/vendidos/traspasos/pendiente/
// vendido de más por partida+producto, equivalente a "📊 KILOS POR
// PARTIDA" del HTML real.
function filtrosKilosPartida(query) {
  return {
    producto: query.producto,
    partida: query.partida,
    desde: query.desde,
    hasta: query.hasta,
    soloPendiente: query.soloPendiente === 'true',
    soloExceso: query.soloExceso === 'true',
  };
}

router.get('/kilos-por-partida', async (req, res) => {
  try {
    const filas = await calcularKilosPorPartida(filtrosKilosPartida(req.query));
    res.json({ filas });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/kilos-por-partida/excel', async (req, res) => {
  try {
    const filas = await calcularKilosPorPartida(filtrosKilosPartida(req.query));
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Kilos por partida');
    hoja.addRow(['PARTIDA', 'FECHA COMPRA', 'PROVEEDOR', 'COD PROD', 'PRODUCTO', 'KG COMPRADOS', 'MERMA KG', 'MERMA %', 'KG VENDIDOS', 'KG TRASPASOS', 'PENDIENTE DE VENDER', 'VENDIDO DE MÁS', 'CERRADA']).font = { bold: true };
    for (const g of filas) {
      hoja.addRow([
        g.numeroPartida, g.fecha ? g.fecha.toISOString().slice(0, 10) : '', g.proveedorNombre, g.articuloCodigo, g.articuloDescripcion,
        g.comprados, g.mermaKg || 0, g.mermaPct || '', g.vendidos, g.traspasos, g.pendiente || 0, g.vendidoDeMas || 0, g.cerrada ? 'SI' : '',
      ]);
    }
    hoja.columns.forEach((col) => { col.width = 16; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Kilos_por_partida_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await libro.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /listados/gestion?desde=&hasta=&incluirTraspasos=true&clienteId=&articuloId=
// Por defecto (sin incluirTraspasos=true) solo devuelve ventas reales. Los
// filtros desde/hasta/clienteId/articuloId son opcionales, para poder
// generalizar este mismo listado a "por cliente", "por artículo", "por
// fecha" sin duplicar la lógica (ver Fase 2 punto 6: la regla aplica a
// cualquier listado de gestión, no solo a uno).
router.get('/gestion', async (req, res) => {
  try {
    const { desde, hasta, clienteId, articuloId } = req.query;
    const incluirTraspasos = req.query.incluirTraspasos === 'true';
    const resultado = await construirListadoGestion({ desde, hasta, incluirTraspasos, clienteId, articuloId });
    res.json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
