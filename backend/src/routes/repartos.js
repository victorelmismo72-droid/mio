// Reparto a supermercados (Alcampo, Ecomora, Ahorramas...) - reescrito el
// 24/11/2026 (ver Fase 0 punto 15, 03_FRONTEND_MARINAFISK.md): hasta
// entonces esta ruta solo guardaba tal cual lo que mandaba el cliente HTTP,
// sin numero real ni validacion (hueco de la Fase 1, nunca actualizado a
// los criterios de Fase 2 - mismo hueco que tuvo Traspasos hasta hoy).
//
// A diferencia de Pedidos/Traspasos, un reparto NO lleva precio ni importe
// (no se factura desde esta pantalla, ver el HTML real: `grabarReparto`
// nunca calcula un total economico) - es puramente logistico/trazabilidad:
// cada linea lleva lote/barco/subzona/arte de pesca (para la etiqueta
// Scanfisk, cuya generacion en si queda pendiente, ver
// 03_FRONTEND_MARINAFISK.md) ademas de cajas/kg/peso de etiqueta. Cajas,
// Kg y Peso de etiqueta admiten la misma suma que Kilos en Compras
// (evaluarExpresionKilos).
const express = require('express');
const { prisma } = require('../db');
const { registrarEscritura } = require('../logEscritura');
const { conIdempotencia } = require('../idempotencia');
const { conFechaNormalizada } = require('../fechas');
const { evaluarExpresionKilos } = require('../calculoCompra');

const router = express.Router();

function datosLineaParaCrear(l) {
  const cajas = evaluarExpresionKilos(l.cajas);
  if (Number.isNaN(cajas)) throw new Error(`El valor de Cajas no es válido: "${l.cajas}" (puede ser un número o una suma, ej. "12+13.5").`);
  const peso = evaluarExpresionKilos(l.peso);
  if (Number.isNaN(peso)) throw new Error(`El valor de Kg no es válido: "${l.peso}" (puede ser un número o una suma, ej. "12+13.5").`);
  const pesoEtiquetaTexto = l.pesoEtiqueta;
  let pesoEtiqueta = null;
  if (pesoEtiquetaTexto != null && pesoEtiquetaTexto !== '') {
    pesoEtiqueta = evaluarExpresionKilos(pesoEtiquetaTexto);
    if (Number.isNaN(pesoEtiqueta)) throw new Error(`El valor de Peso etiqueta no es válido: "${pesoEtiquetaTexto}".`);
  }
  return {
    articuloId: l.articuloId != null && l.articuloId !== '' ? Number(l.articuloId) : null,
    cantidad: cajas,
    peso,
    lote: String(l.lote || '').trim() || null,
    barco: String(l.barco || '').trim() || null,
    subzona: String(l.subzona || '').trim() || null,
    artePesca: String(l.artePesca || '').trim() || null,
    pesoEtiqueta,
  };
}

// Igual que grabarReparto() del HTML real: solo cuentan las líneas con
// artículo elegido Y cajas>0 — a diferencia de Pedidos/Traspasos/Compras,
// el peso (kg) NO es obligatorio para que una línea sea válida.
function prepararReparto({ lineas, destinatarioNombre }) {
  if (!String(destinatarioNombre || '').trim()) throw new Error('Indica el destinatario.');
  const lineasValidas = (lineas || [])
    .map(datosLineaParaCrear)
    .filter((l) => l.articuloId && (Number(l.cantidad) || 0) > 0);
  if (!lineasValidas.length) throw new Error('Añade al menos un producto con cajas.');
  const totalCajas = lineasValidas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const totalKg = lineasValidas.reduce((s, l) => s + (Number(l.peso) || 0), 0);
  return { totalCajas, totalKg, lineas: lineasValidas };
}

const INCLUDE_LINEAS = { lineas: { include: { articulo: true } } };

router.get('/', async (req, res) => {
  const repartos = await prisma.reparto.findMany({
    include: INCLUDE_LINEAS,
    orderBy: { id: 'asc' },
  });
  res.json(repartos);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  const reparto = await prisma.reparto.findUnique({ where: { id }, include: INCLUDE_LINEAS });
  if (!reparto) return res.status(404).json({ error: 'No existe ese reparto' });
  res.json(reparto);
});

router.post('/', async (req, res) => {
  try {
    await conIdempotencia(req, res, 'POST /repartos', async () => {
      const { lineas, idempotencyKey, totalCajas, totalKg, ...cabecera } = req.body;
      if (cabecera.numero == null || cabecera.numero === '') delete cabecera.numero;
      else cabecera.numero = Number(cabecera.numero);
      cabecera.palets = Math.max(0, Math.round(Number(cabecera.palets) || 0));
      const preparado = prepararReparto({ lineas, destinatarioNombre: cabecera.destinatarioNombre });
      let creado;
      try {
        creado = await prisma.reparto.create({
          data: {
            ...conFechaNormalizada(cabecera),
            totalCajas: preparado.totalCajas,
            totalKg: preparado.totalKg,
            lineas: { create: preparado.lineas },
          },
          include: INCLUDE_LINEAS,
        });
      } catch (err) {
        if (err.code === 'P2002') throw new Error(`Ya existe un reparto con el número ${cabecera.numero}. Déjalo en blanco para que se asigne uno automáticamente.`);
        throw err;
      }
      await registrarEscritura('repartos', 'INSERT', creado.id, cabecera.puestoOrigen);
      return { statusHttp: 201, cuerpo: creado };
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  try {
    const { lineas, totalCajas, totalKg, ...cabecera } = req.body;
    if (cabecera.numero === '') delete cabecera.numero;
    else if (cabecera.numero != null) cabecera.numero = Number(cabecera.numero);
    cabecera.palets = Math.max(0, Math.round(Number(cabecera.palets) || 0));
    const preparado = prepararReparto({ lineas, destinatarioNombre: cabecera.destinatarioNombre });
    const actualizado = await prisma.$transaction(async (tx) => {
      await tx.repartoLinea.deleteMany({ where: { repartoId: id } });
      return tx.reparto.update({
        where: { id },
        data: {
          ...conFechaNormalizada(cabecera),
          totalCajas: preparado.totalCajas,
          totalKg: preparado.totalKg,
          lineas: { create: preparado.lineas },
        },
        include: INCLUDE_LINEAS,
      });
    });
    await registrarEscritura('repartos', 'UPDATE', id, req.body.puestoOrigen);
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El id debe ser un número entero.' });
  try {
    await prisma.reparto.delete({ where: { id } }); // ON DELETE CASCADE borra sus líneas
    await registrarEscritura('repartos', 'DELETE', id, req.query.puestoOrigen);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
