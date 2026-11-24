// Compras: editable (corregido el 22/11/2026, decision de Victor - ver
// Fase 0 punto 15 y RESUMEN_COMPLETO_para_Code_18-11-2026_1..5.md). El
// HTML real en produccion permite corregir una compra ya grabada
// (numero de partida, alb. proveedor, proveedor, y por linea:
// articulo/cajas/kilos/precio/control) y anularla - el sistema nuevo
// hace lo mismo. Ya NO hay DELETE real: "anular" es un estado
// (compra.anulada=true), nunca se borra la fila - para no perder nunca el
// historial de que una compra existio y que paso con ella.
const express = require('express');
const ExcelJS = require('exceljs');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');
const { resolverPartidaParaCompra, listarPartidasDelDia, asegurarRegistroPartida, asegurarSecuenciaPorDelante } = require('../asignacionPartida');
const { calcularLineaCompra, sumarTotalesCompra } = require('../calculoCompra');

// Filtro compartido por el histórico (pantalla) y la exportación a Excel -
// puerto directo de obtenerComprasFiltradas()/lineaPasaFiltroCompras() del
// HTML real (filtro a nivel de compra: partida/alb.proveedor/proveedor/
// fecha; a nivel de línea: producto/control).
function filasCompraFiltradas(compras, filtros) {
  const partida = String(filtros.partida || '').trim();
  const albProveedor = String(filtros.albProveedor || '').trim().toLowerCase();
  const proveedor = String(filtros.proveedor || '').trim().toLowerCase();
  const producto = String(filtros.producto || '').trim().toLowerCase();
  const desde = filtros.desde ? new Date(filtros.desde) : null;
  const hasta = filtros.hasta ? new Date(filtros.hasta) : null;
  const control = filtros.control || '';

  const filas = [];
  for (const c of compras) {
    if (partida && !String(c.numeroPartida).includes(partida)) continue;
    if (albProveedor && !String(c.albaranProveedor || '').toLowerCase().includes(albProveedor)) continue;
    if (proveedor && !(String(c.proveedor?.codigo || '').toLowerCase().includes(proveedor) || String(c.proveedorNombreSnapshot || '').toLowerCase().includes(proveedor))) continue;
    if (desde && new Date(c.fecha) < desde) continue;
    if (hasta && new Date(c.fecha) > hasta) continue;
    for (const l of c.lineas) {
      if (producto && !(String(l.articulo?.codigo || '').toLowerCase().includes(producto) || String(l.articulo?.descripcion || '').toLowerCase().includes(producto))) continue;
      if (control === 'si' && !l.control) continue;
      if (control === 'no' && l.control) continue;
      filas.push({ compra: c, linea: l });
    }
  }
  return filas;
}

const router = express.Router();

// Recalcula las lineas crudas de una compra contra el proveedor actual
// (siempre en vivo, ver Fase 0 punto 2) y los totales que salen de ahi -
// compartido entre crear (POST /) y editar (PUT /:id, PUT /:id/lineas/:id).
function calcularLineasYTotales(lineasCrudas, proveedor) {
  const lineasCalculadas = lineasCrudas.map((l) => {
    const calc = calcularLineaCompra({ kilos: l.kilos, precioKg: l.precioKg, proveedor });
    return {
      articuloId: l.articuloId,
      cajas: l.cajas != null && l.cajas !== '' ? Number(l.cajas) : null,
      precioKg: Number(l.precioKg),
      control: !!l.control,
      ...calc,
    };
  });
  return { lineasCalculadas, totales: sumarTotalesCompra(lineasCalculadas) };
}

router.get('/', async (req, res) => {
  const compras = await prisma.compra.findMany({
    include: { lineas: { include: { articulo: true } }, proveedor: true },
    orderBy: { id: 'asc' },
  });
  res.json(compras);
});

// Exportación a Excel del histórico filtrado (equivalente a
// exportarExcelCompras() del HTML real) - mismas columnas exactas. Se usa
// exceljs, no SheetJS/"xlsx" (ver backend/README.md, nota de seguridad).
// IMPORTANTE: va ANTES de "/:id" (ver la nota de más arriba sobre el fallo
// real de orden de rutas del 12/09/2026).
router.get('/exportar-excel', async (req, res) => {
  try {
    const compras = await prisma.compra.findMany({
      where: { anulada: false },
      include: { lineas: { include: { articulo: true } }, proveedor: true },
    });
    const filas = filasCompraFiltradas(compras, req.query);
    filas.sort((a, b) => {
      const porFecha = (new Date(b.compra.fecha) - new Date(a.compra.fecha)) || (b.compra.numeroPartida - a.compra.numeroPartida);
      if (req.query.orden === 'partida-desc') return (b.compra.numeroPartida - a.compra.numeroPartida) || porFecha;
      if (req.query.orden === 'partida-asc') return (a.compra.numeroPartida - b.compra.numeroPartida) || porFecha;
      if (req.query.orden === 'importe-desc') return (Number(b.linea.totalFactura) - Number(a.linea.totalFactura)) || porFecha;
      if (req.query.orden === 'importe-asc') return (Number(a.linea.totalFactura) - Number(b.linea.totalFactura)) || porFecha;
      return porFecha;
    });

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('COMPRAS');
    hoja.addRow(['PARTIDA', 'FECHA', 'ALB PROV', 'COD PROV', 'PROVEEDOR', 'COD PROD', 'DESCRIPCION', 'CAJAS', 'KILOS', 'EUR/KG', 'BASE IMP ZARAGOZA', 'BASE IMP ZGZ + IVA', '2% OP', 'BASE IMP REAL', 'IVA 10%', 'TOTAL FACT', 'CONTROL']).font = { bold: true };
    for (const { compra: c, linea: l } of filas) {
      hoja.addRow([
        c.numeroPartida, c.fecha.toISOString().slice(0, 10), c.albaranProveedor || '', c.proveedor?.codigo || '', c.proveedorNombreSnapshot || '',
        l.articulo?.codigo || '', l.articulo?.descripcion || '', Number(l.cajas) || 0, Number(l.kilos) || 0, Number(l.precioKg) || 0,
        Number(l.baseZgz) || 0, Number(l.baseZgzConIva) || 0, Number(l.op2Importe) || 0, Number(l.baseReal) || 0, Number(l.ivaImporte) || 0, Number(l.totalFactura) || 0,
        l.control ? 'S' : '',
      ]);
    }
    hoja.columns.forEach((col) => { col.width = 14; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Compras_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await libro.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// IMPORTANTE: esta ruta especifica ("partidas-del-dia") tiene que declararse
// ANTES que "/:id" mas abajo - si no, Express interpretaria "partidas-del-dia"
// como si fuera un id (fallo real encontrado el 12/09/2026: al probar esto
// en el orden contrario, un id no numerico llegaba sin querer hasta Prisma y
// tiraba todo el servidor - ver tambien express-async-errors en index.js,
// que evita que esa clase de fallo vuelva a tirar el proceso aunque se
// cuele una ruta mal ordenada como esta).
//
// Que partidas existen ya para un dia+proveedor - informativo, para que
// Victor sepa que numero ya se usó hoy con ese proveedor antes de teclear
// uno (o dejar la casilla en blanco) - ver asignacionPartida.js.
router.get('/partidas-del-dia', async (req, res) => {
  const { fecha, proveedorId } = req.query;
  if (!fecha || !proveedorId) {
    return res.status(400).json({ error: 'Faltan los parámetros "fecha" y "proveedorId".' });
  }
  const partidas = await listarPartidasDelDia(new Date(fecha), Number(proveedorId));
  res.json(partidas);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id de la compra debe ser un número entero.' });
  const compra = await prisma.compra.findUnique({
    where: { id },
    include: { lineas: true, proveedor: true },
  });
  if (!compra) return res.status(404).json({ error: 'No existe esa compra' });
  res.json(compra);
});

// Crea la compra y sus lineas en una unica transaccion: o se guardan las dos
// cosas, o no se guarda nada (nunca una compra a medias).
//
// El cliente SOLO manda datos crudos por linea (articuloId, cajas, kilos,
// precioKg, control) - el servidor calcula baseZgz/2%OP/IVA/total EN VIVO
// (ver calculoCompra.js), consultando el proveedor tal como esta AHORA MISMO
// en la base de datos. No se acepta ningun importe ya calculado desde fuera:
// esa es justo la regla critica de Fase 0 punto 2 / Fase 2 punto 1 ("nunca
// como formula congelada, siempre en vivo") - si se aceptara un baseReal/iva
// ya calculado del cliente, un frontend con la formula desactualizada podria
// grabar una compra con el 2% de OP o el IVA equivocados sin que el servidor
// lo notara.
//
// El numero de partida lo escribe Victor (viene de su Excel de compras) -
// ver asignacionPartida.js para la regla completa, corregida el 20/11/2026
// (antes era al reves: automatica por defecto, manual solo como
// excepcion). Si se manda vacio/null, el servidor lo asigna automaticamente
// (reutilizando la partida "de siempre" de ese dia+proveedor, o creando una
// nueva).
router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /compras', async () => {
      const { lineas, fecha, proveedorId, albaranProveedor, puestoOrigen, numeroPartida } = req.body;

      const proveedor = await prisma.proveedor.findUnique({ where: { id: Number(proveedorId) } });
      if (!proveedor) throw new Error(`No existe ningún proveedor con id ${proveedorId}.`);
      if (!Array.isArray(lineas) || !lineas.length) throw new Error('La compra necesita al menos una línea.');

      const fechaCompra = new Date(fecha);
      const numeroPartidaFinal = await resolverPartidaParaCompra({
        fecha: fechaCompra,
        proveedorId: proveedor.id,
        numeroPartida,
      });

      const { lineasCalculadas, totales } = calcularLineasYTotales(lineas, proveedor);

      const creada = await prisma.compra.create({
        data: {
          numeroPartida: numeroPartidaFinal,
          fecha: fechaCompra,
          albaranProveedor: albaranProveedor || null,
          proveedorId: proveedor.id,
          proveedorNombreSnapshot: proveedor.nombre,
          puestoOrigen,
          totalKilos: totales.totalKilos,
          totalBaseZgz: totales.totalBaseZgz,
          totalBaseReal: totales.totalBaseReal,
          totalIva: totales.totalIva,
          totalFactura: totales.totalFactura,
          lineas: { create: lineasCalculadas },
        },
        include: { lineas: true },
      });
      await registrarEscritura('compras', 'INSERT', creada.id, puestoOrigen);
      return { statusHttp: 201, cuerpo: creada };
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Corrige la cabecera de una compra ya grabada: numero de partida, alb.
// proveedor, o el proveedor mismo (equivalen a guardarPartidaCompra,
// guardarAlbProvCompra y cambiarProveedorLineaCompra del HTML real). No
// hace falta mandar los tres - solo los que cambian. Si cambia el
// proveedor (o aunque no cambie, para no arriesgarse), TODAS las lineas se
// recalculan en vivo contra el proveedor actual - mismo motivo que en
// POST /, el 2%OP/IVA de una compra deben reflejar siempre al proveedor
// real, nunca quedarse congelados con el de cuando se creo si luego se
// corrige el proveedor.
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id de la compra debe ser un número entero.' });
  try {
    const existente = await prisma.compra.findUnique({ where: { id }, include: { lineas: true } });
    if (!existente) return res.status(404).json({ error: 'No existe esa compra' });
    if (existente.anulada) throw new Error('Esta compra está anulada - no se puede editar. Graba una compra nueva si hace falta corregirlo.');

    const { albaranProveedor, numeroPartida, proveedorId, puestoOrigen } = req.body;

    const proveedor = await prisma.proveedor.findUnique({
      where: { id: proveedorId != null ? Number(proveedorId) : existente.proveedorId },
    });
    if (!proveedor) throw new Error(`No existe ningún proveedor con id ${proveedorId != null ? proveedorId : existente.proveedorId}.`);

    let numeroPartidaFinal = existente.numeroPartida;
    if (numeroPartida != null && numeroPartida !== '' && Number(numeroPartida) !== existente.numeroPartida) {
      const partida = await asegurarRegistroPartida(Number(numeroPartida), existente.fecha, proveedor.id);
      await asegurarSecuenciaPorDelante(partida.numeroPartida);
      numeroPartidaFinal = partida.numeroPartida;
    }

    const lineasCrudas = existente.lineas.map((l) => ({
      articuloId: l.articuloId, cajas: l.cajas, kilos: l.kilos, precioKg: l.precioKg, control: l.control,
    }));
    const { lineasCalculadas, totales } = calcularLineasYTotales(lineasCrudas, proveedor);

    const actualizada = await prisma.$transaction(async (tx) => {
      for (let i = 0; i < existente.lineas.length; i++) {
        await tx.compraLinea.update({ where: { id: existente.lineas[i].id }, data: lineasCalculadas[i] });
      }
      return tx.compra.update({
        where: { id },
        data: {
          numeroPartida: numeroPartidaFinal,
          albaranProveedor: albaranProveedor !== undefined ? (albaranProveedor || null) : existente.albaranProveedor,
          proveedorId: proveedor.id,
          proveedorNombreSnapshot: proveedor.nombre,
          totalKilos: totales.totalKilos,
          totalBaseZgz: totales.totalBaseZgz,
          totalBaseReal: totales.totalBaseReal,
          totalIva: totales.totalIva,
          totalFactura: totales.totalFactura,
        },
        include: { lineas: true },
      });
    });
    await registrarEscritura('compras', 'UPDATE', id, puestoOrigen);
    res.json(actualizada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Corrige una linea concreta de una compra ya grabada (articulo, cajas,
// kilos, precio, control - equivale a guardarLineaCompra/
// toggleControlLineaCompra/cambiarArticuloLineaCompra del HTML real).
// Admite kilos como expresion ("12+13.5"), igual que al crear. Solo hace
// falta mandar los campos que cambian; el resto se mantiene.
router.put('/:id/lineas/:lineaId', async (req, res) => {
  const id = Number(req.params.id);
  const lineaId = Number(req.params.lineaId);
  if (!Number.isInteger(id) || !Number.isInteger(lineaId)) {
    return res.status(400).json({ error: 'El id de la compra y de la línea deben ser números enteros.' });
  }
  try {
    const compra = await prisma.compra.findUnique({ where: { id }, include: { lineas: true, proveedor: true } });
    if (!compra) return res.status(404).json({ error: 'No existe esa compra' });
    if (compra.anulada) throw new Error('Esta compra está anulada - no se puede editar. Graba una compra nueva si hace falta corregirlo.');
    const lineaExistente = compra.lineas.find((l) => l.id === lineaId);
    if (!lineaExistente) return res.status(404).json({ error: 'Esa línea no pertenece a esta compra.' });

    const { articuloId, cajas, kilos, precioKg, control } = req.body;
    const lineaCruda = {
      articuloId: articuloId != null ? Number(articuloId) : lineaExistente.articuloId,
      cajas: cajas !== undefined ? cajas : lineaExistente.cajas,
      kilos: kilos !== undefined ? kilos : lineaExistente.kilos,
      precioKg: precioKg !== undefined ? precioKg : lineaExistente.precioKg,
      control: control !== undefined ? control : lineaExistente.control,
    };
    const { lineasCalculadas: [lineaCalculada] } = calcularLineasYTotales([lineaCruda], compra.proveedor);

    const actualizada = await prisma.$transaction(async (tx) => {
      await tx.compraLinea.update({ where: { id: lineaId }, data: lineaCalculada });
      const todasLasLineas = await tx.compraLinea.findMany({ where: { compraId: id } });
      const totales = sumarTotalesCompra(todasLasLineas.map((l) => ({
        kilos: Number(l.kilos), baseZgz: Number(l.baseZgz), baseReal: Number(l.baseReal),
        ivaImporte: Number(l.ivaImporte), totalFactura: Number(l.totalFactura),
      })));
      return tx.compra.update({
        where: { id },
        data: {
          totalKilos: totales.totalKilos,
          totalBaseZgz: totales.totalBaseZgz,
          totalBaseReal: totales.totalBaseReal,
          totalIva: totales.totalIva,
          totalFactura: totales.totalFactura,
        },
        include: { lineas: true },
      });
    });
    await registrarEscritura('compras', 'UPDATE', id, req.body.puestoOrigen);
    res.json(actualizada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Anula una compra (equivale a anularCompra() del HTML real) - no la
// borra, solo la marca. No lleva proteccion de idempotencia: anular dos
// veces la MISMA compra no duplica nada, el segundo intento solo repite
// el mismo estado (como el cierre manual de partidas).
router.post('/:id/anular', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id de la compra debe ser un número entero.' });
  try {
    const anulada = await prisma.compra.update({
      where: { id },
      data: { anulada: true, anuladaEn: new Date(), anuladaPor: req.body.anuladaPor || null },
    });
    await registrarEscritura('compras', 'UPDATE', id, req.body.puestoOrigen);
    res.json(anulada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
