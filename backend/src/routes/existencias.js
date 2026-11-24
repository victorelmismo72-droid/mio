// EXISTENCIAS EN CAMARA - modulo nuevo (ver Fase 0 punto 15,
// 03_FRONTEND_MARINAFISK.md): lo que queda en la camara, dia a dia, no es
// ni una compra ni una venta - es un apunte manual de stock fisico. Puerto
// directo de abrirExistencias()/exGrabarDia()/exBorrarDia()/exEditarLinea()/
// exMarcarVendido()/exExportarExcel() del HTML real
// (CARGA_DE_ALBARANES_MARINAFISK_2026-11-24_UNAFILA.html), con filas reales
// de base de datos (Existencia/ExistenciaLinea) en vez de un array JSON
// indexado por posicion - ver src/existencias.js para la logica compartida.
const express = require('express');
const ExcelJS = require('exceljs');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');
const { evaluarExpresionKilos } = require('../calculoCompra');
const {
  cabeceraDia, lineaPlana, limpiarLineasExistencia, totalesLinea, semanaIso, etiquetaGrupo, resumenPorModo, diasFiltrados,
} = require('../existencias');

const router = express.Router();

const INCLUDE_LINEAS = { lineas: { include: { articulo: true }, orderBy: { orden: 'asc' } } };

function diaParaCliente(d) {
  return { fecha: d.fecha.toISOString().slice(0, 10), lineas: (d.lineas || []).map(lineaPlana) };
}

// Convierte las lineas crudas que manda la pantalla (articuloId O
// descripcionLibre, cantidad/peso/precio como texto - peso admite suma,
// ej. "12,4+8,1", igual que el resto del programa) a los datos que se
// graban - mismo filtro de validez y de separadores sobrantes que
// exGrabarDia() (ver limpiarLineasExistencia en ../existencias.js).
function datosLineasParaGuardar(lineasCrudas) {
  const normalizadas = (lineasCrudas || []).map((l) => {
    if (l.separador) return { separador: true };
    const peso = evaluarExpresionKilos(l.peso);
    return {
      separador: false,
      articuloId: l.articuloId != null && l.articuloId !== '' ? Number(l.articuloId) : null,
      descripcionLibre: l.articuloId ? null : (String(l.descripcionLibre || '').trim() || null),
      cantidad: l.cantidad != null && l.cantidad !== '' ? Number(l.cantidad) : null,
      peso: Number.isNaN(peso) ? null : peso,
      precio: l.precio != null && l.precio !== '' ? Number(l.precio) : null,
      nota: String(l.nota || '').trim() || null,
      vendido: !!l.vendido,
    };
  });
  return limpiarLineasExistencia(normalizadas).map((l, i) => ({ ...l, orden: i }));
}

router.get('/', async (req, res) => {
  const { desde, hasta } = req.query;
  const where = {};
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta);
  }
  const dias = await prisma.existencia.findMany({ where, include: INCLUDE_LINEAS, orderBy: { fecha: 'asc' } });
  res.json(dias.map(diaParaCliente));
});

// Exportacion a Excel (LISTADO/DETALLE/RESUMEN, igual que exExportarExcel()
// del HTML real) - en el servidor con exceljs, nunca en el navegador (ver
// backend/README.md, nota de seguridad). IMPORTANTE: va antes de "/:fecha".
router.get('/excel', async (req, res) => {
  try {
    const { desde, hasta, filtro, agrupa } = req.query;
    const verVendidos = req.query.verVendidos === 'true' || req.query.soloVendidos === 'true';
    const soloVendidos = req.query.soloVendidos === 'true';
    const where = {};
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    const crudos = await prisma.existencia.findMany({ where, include: INCLUDE_LINEAS, orderBy: { fecha: 'asc' } });
    const dias = diasFiltrados(crudos, { filtro, verVendidos, soloVendidos });
    if (!dias.length) return res.status(400).json({ error: 'No hay existencias en esas fechas con ese filtro.' });

    const libro = new ExcelJS.Workbook();
    const AZUL = 'FF1F4E79', ROJO_TXT = 'FFC00000', ROJO_FONDO = 'FFFDE9E9', BANDA = 'FF969696', TOTAL_FONDO = 'FFDDEBF7', PENDIENTE_FONDO = 'FFE2EFDA';
    const estiloCabecera = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }, alignment: { horizontal: 'center' } };

    // ---------- Hoja LISTADO (como la hoja de la camara: banda por dia) ----------
    const hojaL = libro.addWorksheet('LISTADO');
    hojaL.columns = [{ width: 10 }, { width: 12 }, { width: 46 }, { width: 14 }, { width: 15 }];
    hojaL.addRow(['EXISTENCIAS']).font = { bold: true, size: 16 };
    hojaL.mergeCells('A1:E1');
    hojaL.addRow([`Del ${desde || '...'} al ${hasta || '...'}${filtro ? ` — solo: ${filtro}` : ''}${soloVendidos ? ' — solo los vendidos' : (verVendidos ? ' — incluye los vendidos (en rojo)' : '')}`]);
    hojaL.mergeCells('A2:E2');
    const filaCab = hojaL.addRow(['BULTOS', 'KILOS', 'PESCADO', 'PRECIO €/kg', 'IMPORTE']);
    filaCab.eachCell((c) => Object.assign(c, estiloCabecera));
    const totalGeneral = { bultos: 0, kilos: 0, importe: 0 };
    const pendiente = { bultos: 0, kilos: 0, importe: 0 };
    for (const d of dias) {
      const filaBanda = hojaL.addRow([cabeceraDia(d.fecha), '', '', '', '']);
      hojaL.mergeCells(`A${filaBanda.number}:E${filaBanda.number}`);
      filaBanda.eachCell((c) => { c.font = { bold: true, size: 13 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANDA } }; c.alignment = { horizontal: 'center' }; });
      const subtotal = { bultos: 0, kilos: 0, importe: 0 };
      for (const l of d.lineas) {
        if (l.separador) { hojaL.addRow(['', '', '', '', '']); continue; }
        const t = totalesLinea(l);
        const vendido = !!l.vendido;
        subtotal.bultos += t.bultos; subtotal.kilos += t.kilos; subtotal.importe += t.importe;
        if (!vendido) { pendiente.bultos += t.bultos; pendiente.kilos += t.kilos; pendiente.importe += t.importe; }
        const descripcion = (l.articuloDescripcion || l.descripcionLibre || '') + (l.nota ? ` — ${l.nota}` : '') + (vendido ? ' (VENDIDO)' : '');
        const fila = hojaL.addRow([t.bultos || null, t.kilos, descripcion, Number(l.precio) || null, Math.round(t.importe * 100) / 100]);
        if (vendido) fila.eachCell((c) => { c.font = { bold: true, color: { argb: ROJO_TXT } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO_FONDO } }; });
      }
      const filaTotalDia = hojaL.addRow([subtotal.bultos, Math.round(subtotal.kilos * 100) / 100, 'Total del día', '', Math.round(subtotal.importe * 100) / 100]);
      filaTotalDia.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FONDO } }; });
      totalGeneral.bultos += subtotal.bultos; totalGeneral.kilos += subtotal.kilos; totalGeneral.importe += subtotal.importe;
    }
    hojaL.addRow([]);
    const filaTotalGen = hojaL.addRow([totalGeneral.bultos, Math.round(totalGeneral.kilos * 100) / 100, soloVendidos ? 'TOTAL VENDIDO' : `TOTAL EXISTENCIAS${verVendidos ? ' (con vendidos)' : ''}`, '', Math.round(totalGeneral.importe * 100) / 100]);
    filaTotalGen.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }; });
    if (verVendidos && !soloVendidos) {
      const filaPendiente = hojaL.addRow([pendiente.bultos, Math.round(pendiente.kilos * 100) / 100, 'QUEDA EN CÁMARA (sin vendidos)', '', Math.round(pendiente.importe * 100) / 100]);
      filaPendiente.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PENDIENTE_FONDO } }; });
    }

    // ---------- Hoja DETALLE (una fila por linea, para filtrar) ----------
    const hojaD = libro.addWorksheet('DETALLE');
    hojaD.columns = [{ width: 11 }, { width: 10 }, { width: 9 }, { width: 8 }, { width: 10 }, { width: 9 }, { width: 36 }, { width: 20 }, { width: 8 }, { width: 12 }, { width: 10 }];
    const filaCabD = hojaD.addRow(['FECHA', 'SEMANA', 'MES', 'BULTOS', 'KILOS', 'CÓDIGO', 'PESCADO', 'NOTA', '€/KG', 'IMPORTE', 'ESTADO']);
    filaCabD.eachCell((c) => Object.assign(c, estiloCabecera));
    hojaD.views = [{ state: 'frozen', ySplit: 1 }];
    let sumBultos = 0, sumKilos = 0, sumImporte = 0;
    for (const d of dias) {
      for (const l of d.lineas) {
        if (l.separador) continue;
        const t = totalesLinea(l), vendido = !!l.vendido;
        sumBultos += t.bultos; sumKilos += t.kilos; sumImporte += t.importe;
        const fila = hojaD.addRow([
          new Date(`${d.fecha}T00:00:00Z`), semanaIso(d.fecha), d.fecha.slice(0, 7), t.bultos || null, t.kilos,
          l.articuloCodigo || '', l.articuloDescripcion || l.descripcionLibre || '', l.nota || '', Number(l.precio) || null, Math.round(t.importe * 100) / 100, vendido ? 'VENDIDO' : '',
        ]);
        fila.getCell(1).numFmt = 'dd/mm/yyyy';
        if (vendido) fila.eachCell((c) => { c.font = { color: { argb: ROJO_TXT } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO_FONDO } }; });
      }
    }
    const filaTotD = hojaD.addRow(['', '', '', sumBultos, Math.round(sumKilos * 100) / 100, '', 'TOTAL', '', '', Math.round(sumImporte * 100) / 100, '']);
    filaTotD.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FONDO } }; });

    // ---------- Hoja RESUMEN (por dia/semana/mes/total) ----------
    const hojaR = libro.addWorksheet('RESUMEN');
    hojaR.columns = [{ width: 26 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 14 }];
    const filaCabR = hojaR.addRow(['PERÍODO', 'DÍAS', 'BULTOS', 'KILOS', 'IMPORTE']);
    filaCabR.eachCell((c) => Object.assign(c, estiloCabecera));
    hojaR.views = [{ state: 'frozen', ySplit: 1 }];
    const modoResumen = agrupa && agrupa !== 'detalle' ? agrupa : 'dia';
    const grupos = resumenPorModo(dias, modoResumen);
    let totDias = 0, totBultos = 0, totKilos = 0, totImporte = 0;
    for (const g of grupos) {
      totDias += g.dias; totBultos += g.bultos; totKilos += g.kilos; totImporte += g.importe;
      hojaR.addRow([etiquetaGrupo(g.clave, modoResumen), g.dias, g.bultos, Math.round(g.kilos * 100) / 100, Math.round(g.importe * 100) / 100]);
    }
    if (grupos.length > 1) {
      const filaTotR = hojaR.addRow(['TOTAL', totDias, totBultos, Math.round(totKilos * 100) / 100, Math.round(totImporte * 100) / 100]);
      filaTotR.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FONDO } }; });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Existencias_${desde || ''}_a_${hasta || ''}.xlsx"`);
    await libro.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Un dia concreto, para el editor "Cargar existencias de un día" - si ese
// dia no tiene nada grabado aun, devuelve lineas:[] (no es un 404: es
// normal abrir un dia nuevo sin cargar nada todavia).
router.get('/:fecha', async (req, res) => {
  const fecha = new Date(req.params.fecha);
  if (Number.isNaN(fecha.getTime())) return res.status(400).json({ error: 'Fecha no válida.' });
  const dia = await prisma.existencia.findUnique({ where: { fecha }, include: INCLUDE_LINEAS });
  res.json(dia ? diaParaCliente(dia) : { fecha: req.params.fecha, lineas: [] });
});

// Graba (o sustituye por completo) las existencias de un dia - exGrabarDia().
// Si no queda ninguna linea valida, se borra el dia entero (igual que el
// HTML real: "Día sin líneas con kilos: no se guarda nada para esa fecha").
router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /existencias', async () => {
      const { fecha, lineas, puestoOrigen } = req.body;
      if (!fecha) throw new Error('Pon la fecha.');
      const fechaDate = new Date(fecha);
      if (Number.isNaN(fechaDate.getTime())) throw new Error('Fecha no válida.');
      const lineasAGuardar = datosLineasParaGuardar(lineas);

      const resultado = await prisma.$transaction(async (tx) => {
        const existente = await tx.existencia.findUnique({ where: { fecha: fechaDate } });
        if (!lineasAGuardar.length) {
          if (existente) await tx.existencia.delete({ where: { id: existente.id } });
          return null;
        }
        if (existente) await tx.existenciaLinea.deleteMany({ where: { existenciaId: existente.id } });
        return tx.existencia.upsert({
          where: { fecha: fechaDate },
          update: { lineas: { create: lineasAGuardar } },
          create: { fecha: fechaDate, lineas: { create: lineasAGuardar } },
          include: INCLUDE_LINEAS,
        });
      });

      await registrarEscritura('existencias', resultado ? 'UPSERT' : 'DELETE', resultado?.id ?? null, puestoOrigen);
      return {
        statusHttp: 200,
        cuerpo: resultado ? diaParaCliente(resultado) : { fecha, lineas: [], borrado: true },
      };
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Edicion directa de una linea desde el listado (bultos/kilos/vendido) -
// exEditarLinea()/exMarcarVendido(). "peso" admite la misma suma que al
// grabar (ej. "12,4+8,1").
router.patch('/:fecha/lineas/:lineaId', async (req, res) => {
  try {
    const lineaId = Number(req.params.lineaId);
    if (!Number.isInteger(lineaId)) return res.status(400).json({ error: 'El id de la línea debe ser un número entero.' });
    const datos = {};
    if (req.body.vendido !== undefined) datos.vendido = !!req.body.vendido;
    if (req.body.cantidad !== undefined) {
      const n = Number(req.body.cantidad);
      if (Number.isNaN(n) || n < 0) return res.status(400).json({ error: 'Pon un número válido.' });
      datos.cantidad = n;
    }
    if (req.body.peso !== undefined) {
      const n = evaluarExpresionKilos(req.body.peso);
      if (Number.isNaN(n) || n <= 0) return res.status(400).json({ error: 'Los kilos tienen que ser mayores que 0. Si ya se vendió todo, marca la casilla "Vendido".' });
      datos.peso = n;
    }
    if (!Object.keys(datos).length) return res.status(400).json({ error: 'No hay nada que actualizar.' });
    const actualizada = await prisma.existenciaLinea.update({ where: { id: lineaId }, data: datos, include: { articulo: true } });
    await registrarEscritura('existencia_lineas', 'UPDATE', lineaId, req.body.puestoOrigen);
    res.json(lineaPlana(actualizada));
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'No existe esa línea.' });
    res.status(400).json({ error: err.message });
  }
});

// Borra por completo las existencias de un dia - exBorrarDia().
router.delete('/:fecha', async (req, res) => {
  const fecha = new Date(req.params.fecha);
  if (Number.isNaN(fecha.getTime())) return res.status(400).json({ error: 'Fecha no válida.' });
  const existente = await prisma.existencia.findUnique({ where: { fecha } });
  if (!existente) return res.status(404).json({ error: 'Ese día no tiene existencias cargadas.' });
  await prisma.existencia.delete({ where: { id: existente.id } });
  await registrarEscritura('existencias', 'DELETE', existente.id, req.query.puestoOrigen);
  res.json({ ok: true });
});

module.exports = router;
