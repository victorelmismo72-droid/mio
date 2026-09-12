// Importar el Excel de COMPRAS (equivalente al boton "IMPORTAR COMPRAS EXCEL"
// que ya existe en CARGA_DE_ALBARANES_MARINAFISK_20260902CORREGIDO_4.html,
// funcion importarComprasExcel()). Se ha reproducido con el MISMO
// comportamiento que el HTML actual, decision de Victor (05/09/2026):
//
//   - Si una compra ya existe (misma combinacion Nº PARTIDA + ALB PROV +
//     COD PROV) y el contenido del Excel es distinto, SE SOBRESCRIBE en su
//     sitio - igual que hoy. No se crea un registro de ajuste aparte.
//     Esto es una excepcion deliberada y acotada a ESTA ruta de importacion
//     por lotes: la regla general de "compras = dato sagrado, sin PUT/DELETE
//     en la API" (ver compras.js) sigue aplicando a todo lo demas - no hay
//     ninguna otra forma de editar una compra ya grabada.
//   - Antes de sobrescribir nada, se guarda una copia de las compras
//     afectadas en `importaciones_backup` (igual que el HTML guarda
//     "compras_backup_previo" antes de reimportar).
//   - La partida se usa TAL CUAL viene en el Excel, no se recalcula.
//
// Correccion aplicada aqui respecto al HTML actual (deliberada, no es un
// error): el IVA de cada linea se calcula con la regla ya decidida en
// FASE_0 punto 4 / FASE_2 punto 2 (proveedor intracomunitario -> 0%,
// nacional -> 10%), en vez del 10% fijo que usa hoy calcLineaCompra() en
// el HTML - construir esto de nuevo copiando el fallo conocido no tendria
// sentido. La columna `baseZgzConIva` (columna de referencia informativa,
// no es el IVA real de la compra) se mantiene igual que hoy: baseZgz*1.1.
// Nota de seguridad: el paquete "xlsx" (SheetJS) publicado en npm tiene una
// vulnerabilidad de severidad ALTA sin parche disponible en ese registro
// (prototype pollution + ReDoS). Se usa "exceljs" en su lugar, que no tiene
// ese aviso abierto - ver backend/README.md para el detalle.
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { asegurarRegistroPartida } = require('../asignacionPartida');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

const COLS_OBLIGATORIAS = ['N PARTIDA', 'FECHA', 'COD PROV', 'COD PROD', 'KILOS', 'EUR/KG'];
const COLS_OPCIONALES = ['ALB PROV', 'CAJAS', 'CONTROL'];
const MAX_FILAS_CABECERA = 25;

function normalizaCabecera(h) {
  let s = String(h == null ? '' : h);
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s.toUpperCase();
}

// Fecha LOCAL (nunca UTC de paso), igual que fechaLocalISO() en el HTML -
// ver FASE_0 punto 7.
function fechaLocalISO(valor) {
  let d = valor instanceof Date ? valor : (valor ? new Date(valor) : null);
  if (!d || isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function calcularLinea(kilos, precioKg, proveedor) {
  const baseZgz = kilos * precioKg;
  const baseZgzConIva = baseZgz * 1.1; // columna de referencia, igual que hoy - no es el IVA real
  const op2Importe = proveedor.esSubastaOp ? baseZgz * 0.02 : 0;
  const baseReal = baseZgz + op2Importe;
  const ivaPct = proveedor.tipoIva === 'INTRACOMUNITARIO' ? 0 : 10; // corregido, ver Fase 0 punto 4 / Fase 2 punto 2
  const ivaImporte = baseReal * (ivaPct / 100);
  const totalFactura = baseReal + ivaImporte;
  return { baseZgz, baseZgzConIva, op2Importe, baseReal, ivaImporte, totalFactura };
}

// exceljs guarda el valor de una celda en formas distintas segun el tipo
// (texto/numero planos, Date, formula con resultado, texto enriquecido...) -
// esto lo reduce siempre a un valor simple (string, number o Date).
function valorCelda(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.result !== undefined) return valorCelda(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return v.text;
    return '';
  }
  return v;
}

router.post('/compras-excel', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el fichero Excel (campo "archivo").' });
  const puestoOrigen = req.body.puestoOrigen || 'IMPORT';

  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: 'No se ha podido leer el archivo como Excel: ' + err.message });
  }

  const hoja = libro.worksheets.find((ws) => ws.name.trim().toUpperCase() === 'COMPRAS');
  if (!hoja) {
    return res.status(400).json({ error: 'No se ha encontrado ninguna hoja llamada "COMPRAS" en el archivo.' });
  }

  const colsObligatoriasNorm = COLS_OBLIGATORIAS.map(normalizaCabecera);
  let headerRowIdx = -1; // 1-based, como las filas de exceljs
  let mejorCoincidencia = { idx: -1, encontradas: 0 };
  const maxFilas = Math.min(MAX_FILAS_CABECERA, hoja.rowCount);
  for (let i = 1; i <= maxFilas; i++) {
    const filaNorm = hoja.getRow(i).values.map((v) => normalizaCabecera(valorCelda(v)));
    const encontradas = colsObligatoriasNorm.filter((c) => filaNorm.includes(c)).length;
    if (encontradas > mejorCoincidencia.encontradas) mejorCoincidencia = { idx: i, encontradas };
    if (encontradas === colsObligatoriasNorm.length) { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) {
    const filaNorm = mejorCoincidencia.idx === -1 ? [] : hoja.getRow(mejorCoincidencia.idx).values.map((v) => normalizaCabecera(valorCelda(v)));
    const faltantes = COLS_OBLIGATORIAS.filter((c, k) => !filaNorm.includes(colsObligatoriasNorm[k]));
    return res.status(400).json({
      error: `No se ha encontrado una fila con todas las columnas obligatorias en las primeras ${maxFilas} filas.`,
      faltantes,
    });
  }

  // mapaColumnas: nombre de columna (ej. "N PARTIDA") -> indice de columna (1-based)
  const headerRow = hoja.getRow(headerRowIdx).values;
  const mapaColumnas = {};
  COLS_OBLIGATORIAS.concat(COLS_OPCIONALES).forEach((nombreCol) => {
    const norm = normalizaCabecera(nombreCol);
    const colIdx = headerRow.findIndex((v) => normalizaCabecera(valorCelda(v)) === norm);
    if (colIdx > 0) mapaColumnas[nombreCol] = colIdx;
  });

  const filasRaw = [];
  for (let r = headerRowIdx + 1; r <= hoja.rowCount; r++) {
    const rowValues = hoja.getRow(r).values;
    const f = {};
    COLS_OBLIGATORIAS.concat(COLS_OPCIONALES).forEach((nombreCol) => {
      if (mapaColumnas[nombreCol] != null) f[nombreCol] = valorCelda(rowValues[mapaColumnas[nombreCol]]);
    });
    filasRaw.push(f);
  }

  const [proveedores, articulos] = await Promise.all([
    prisma.proveedor.findMany(),
    prisma.articulo.findMany(),
  ]);
  const provPorCodigo = new Map(proveedores.map((p) => [String(p.codigo), p]));
  const artPorCodigo = new Map(articulos.map((a) => [String(a.codigo), a]));
  const articulosCreadosEnEstaImportacion = new Map(); // codigo -> registro creado

  const grupos = new Map(); // clave -> { numeroPartida, fecha, albaranProveedor, proveedorId, proveedorNombreSnapshot, lineas: [] }
  const ignoradas = [];

  for (let idx = 0; idx < filasRaw.length; idx++) {
    const f = filasRaw[idx];
    const filaNum = headerRowIdx + 1 + idx;

    const partidaRaw = f['N PARTIDA'];
    const codProdRaw = f['COD PROD'];
    if ((partidaRaw === '' || partidaRaw == null) && (codProdRaw === '' || codProdRaw == null)) continue; // fila vacia

    const numeroPartida = parseInt(partidaRaw, 10);
    if (!numeroPartida) {
      ignoradas.push(`Fila ${filaNum}: sin Nº de partida válido (probablemente una fila de totales, no una compra).`);
      continue;
    }
    const fecha = fechaLocalISO(f['FECHA']);
    if (!fecha) {
      ignoradas.push(`Fila ${filaNum} (partida ${numeroPartida}): fecha no válida, se ignora esta fila.`);
      continue;
    }
    const proveedorCod = String(f['COD PROV'] || '').trim();
    if (!proveedorCod) {
      ignoradas.push(`Fila ${filaNum} (partida ${numeroPartida}): falta el código de proveedor, se ignora esta fila.`);
      continue;
    }
    const proveedor = provPorCodigo.get(proveedorCod);
    if (!proveedor) {
      ignoradas.push(`Fila ${filaNum} (partida ${numeroPartida}): el proveedor "${proveedorCod}" no existe en el maestro de Proveedores — dalo de alta primero y reimporta.`);
      continue;
    }
    const codProd = String(codProdRaw || '').trim();
    if (!codProd) {
      ignoradas.push(`Fila ${filaNum} (partida ${numeroPartida}): falta el código de producto, se ignora esta fila.`);
      continue;
    }

    // Si el articulo no existe en el catalogo, se crea uno minimo (igual
    // descripcion que el codigo) en vez de descartar en silencio la compra
    // real: perder un kilo/precio real de una compra seria peor que un
    // articulo con descripcion provisional pendiente de completar.
    let articulo = artPorCodigo.get(codProd) || articulosCreadosEnEstaImportacion.get(codProd);
    if (!articulo) {
      articulo = await prisma.articulo.create({ data: { codigo: codProd, descripcion: codProd } });
      articulosCreadosEnEstaImportacion.set(codProd, articulo);
    }

    const albaranProveedor = mapaColumnas['ALB PROV'] ? String(f['ALB PROV'] || '').trim() : '';
    const kilos = parseFloat(f['KILOS']) || 0;
    const precioKg = parseFloat(f['EUR/KG']) || 0;
    const cajas = mapaColumnas['CAJAS'] ? (parseInt(f['CAJAS'], 10) || 0) : null;
    const controlRaw = mapaColumnas['CONTROL'] ? String(f['CONTROL'] || '').trim().toUpperCase() : '';
    const control = ['S', 'SI', 'SÍ', 'X', '1', 'TRUE'].includes(controlRaw);

    // Agrupamos por partida + albaran + proveedor (no solo partida+albaran):
    // si dentro del mismo albaran hay una fila con proveedor distinto, se
    // trata como una compra aparte.
    const clave = `${numeroPartida}|${albaranProveedor}|${proveedorCod}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        numeroPartida,
        fecha,
        albaranProveedor: albaranProveedor || null,
        proveedorId: proveedor.id,
        proveedorNombreSnapshot: proveedor.nombre,
        lineas: [],
      });
    }
    const calc = calcularLinea(kilos, precioKg, proveedor);
    grupos.get(clave).lineas.push({
      articuloId: articulo.id,
      cajas,
      kilos,
      precioKg,
      baseZgz: calc.baseZgz,
      baseZgzConIva: calc.baseZgzConIva,
      op2Importe: calc.op2Importe,
      baseReal: calc.baseReal,
      ivaImporte: calc.ivaImporte,
      totalFactura: calc.totalFactura,
      control,
    });
  }

  if (grupos.size === 0) {
    return res.status(400).json({ error: 'No se ha encontrado ninguna compra válida en la hoja COMPRAS.', ignoradas });
  }

  let nuevas = 0;
  let actualizadas = 0;
  let sinCambios = 0;
  const backupAfectadas = [];

  for (const grupo of grupos.values()) {
    const totales = grupo.lineas.reduce((acc, l) => ({
      totalKilos: acc.totalKilos + l.kilos,
      totalBaseZgz: acc.totalBaseZgz + l.baseZgz,
      totalBaseReal: acc.totalBaseReal + l.baseReal,
      totalIva: acc.totalIva + l.ivaImporte,
      totalFactura: acc.totalFactura + l.totalFactura,
    }), { totalKilos: 0, totalBaseZgz: 0, totalBaseReal: 0, totalIva: 0, totalFactura: 0 });

    const existente = await prisma.compra.findFirst({
      where: {
        numeroPartida: grupo.numeroPartida,
        albaranProveedor: grupo.albaranProveedor,
        proveedorId: grupo.proveedorId,
      },
      include: { lineas: true },
    });

    const fechaCompra = new Date(grupo.fecha + 'T00:00:00.000Z');
    await asegurarRegistroPartida(grupo.numeroPartida, fechaCompra, grupo.proveedorId);

    if (!existente) {
      await prisma.compra.create({
        data: {
          numeroPartida: grupo.numeroPartida,
          fecha: fechaCompra,
          albaranProveedor: grupo.albaranProveedor,
          proveedorId: grupo.proveedorId,
          proveedorNombreSnapshot: grupo.proveedorNombreSnapshot,
          puestoOrigen,
          totalKilos: totales.totalKilos,
          totalBaseZgz: totales.totalBaseZgz,
          totalBaseReal: totales.totalBaseReal,
          totalIva: totales.totalIva,
          totalFactura: totales.totalFactura,
          lineas: { create: grupo.lineas },
        },
      });
      nuevas++;
      continue;
    }

    // Comparacion simple para decidir si hay cambio real (mismo numero de
    // lineas y mismos valores clave) antes de tocar nada.
    const igual = existente.lineas.length === grupo.lineas.length && existente.lineas.every((lPrev, i) => {
      const lNueva = grupo.lineas[i];
      return lPrev.articuloId === lNueva.articuloId
        && Number(lPrev.kilos) === lNueva.kilos
        && Number(lPrev.precioKg) === lNueva.precioKg;
    });
    if (igual) { sinCambios++; continue; }

    // Decision de Victor (05/09/2026): reproducir el comportamiento actual -
    // se sobrescribe en su sitio, no se crea un registro de ajuste aparte.
    backupAfectadas.push(existente);
    await prisma.$transaction(async (tx) => {
      await tx.compraLinea.deleteMany({ where: { compraId: existente.id } });
      await tx.compra.update({
        where: { id: existente.id },
        data: {
          fecha: fechaCompra,
          proveedorNombreSnapshot: grupo.proveedorNombreSnapshot,
          totalKilos: totales.totalKilos,
          totalBaseZgz: totales.totalBaseZgz,
          totalBaseReal: totales.totalBaseReal,
          totalIva: totales.totalIva,
          totalFactura: totales.totalFactura,
          lineas: { create: grupo.lineas },
        },
      });
    });
    actualizadas++;
  }

  if (backupAfectadas.length > 0) {
    await prisma.importacionBackup.create({
      data: { tipo: 'compras_excel', contenido: JSON.parse(JSON.stringify(backupAfectadas)) },
    });
  }
  await registrarEscritura('compras', 'IMPORT_EXCEL', null, puestoOrigen);

  res.json({
    filasProcesadas: filasRaw.length,
    nuevas,
    actualizadas,
    sinCambios,
    ignoradas,
    articulosCreados: Array.from(articulosCreadosEnEstaImportacion.keys()),
  });
});

module.exports = router;
