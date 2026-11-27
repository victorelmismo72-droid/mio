// Calculo de una linea/compra (Fase 2, punto 1: 2% de OP; y "Regla de IVA en
// compras" en 02_ESQUEMA_BASE_DATOS_PROPUESTO.md). Centralizado aqui para que
// SOLO haya un sitio con esta formula - se usa tanto al grabar una compra a
// mano (routes/compras.js) como al importar el Excel (routes/importarCompras.js).
// Antes cada ruta calculaba por su cuenta (duplicado); ahora ambas llaman a lo
// mismo, evitando que un dia se corrija la formula en un sitio y se olvide el
// otro (exactamente el tipo de fallo que la Fase 0 punto 2 ya describe con el
// 2% de OP congelado).
//
// Regla critica (Fase 0 punto 2 / Fase 2 punto 1): esto SIEMPRE se calcula en
// vivo a partir del proveedor tal como esta AHORA MISMO en la base de datos -
// nunca se recibe ya calculado desde el cliente, y nunca se reutiliza un
// valor guardado de una compra anterior.

// Admite sumar varias cifras en Kilos, igual que se hacia a mano en el Excel
// GESTION_CORRECTA al pesar cajas por separado (ej. "12+13.5"). Solo
// suma/resta numeros - no es una calculadora general, a proposito.
function evaluarExpresionKilos(valorTexto) {
  const texto = String(valorTexto == null ? '' : valorTexto).trim();
  if (texto === '') return 0;
  if (!/^[0-9.,+\-\s]+$/.test(texto)) return NaN;
  const tokens = texto.replace(/,/g, '.').replace(/\s+/g, '').match(/[+-]?[0-9]*\.?[0-9]+/g);
  if (!tokens || !tokens.length) return NaN;
  return tokens.reduce((s, t) => s + parseFloat(t), 0);
}

// proveedor: objeto con esSubastaOp (bool) y tipoIva ('NACIONAL'|'INTRACOMUNITARIO'),
// leido en el momento del calculo - nunca cacheado de antes.
function calcularLineaCompra({ kilos, precioKg, proveedor }) {
  const kilosNum = evaluarExpresionKilos(kilos);
  if (Number.isNaN(kilosNum)) {
    throw new Error(`El valor de Kilos no es válido: "${kilos}" (puede ser un número o una suma, ej. "12+13.5").`);
  }
  const precio = Number(precioKg);
  if (!Number.isFinite(precio) || precio < 0) {
    throw new Error(`El valor de €/Kg no es válido: "${precioKg}".`);
  }
  const baseZgz = kilosNum * precio;
  const baseZgzConIva = baseZgz * 1.1; // columna de referencia informativa, no es el IVA real de la compra
  const op2Importe = proveedor.esSubastaOp ? baseZgz * 0.02 : 0;
  const baseReal = baseZgz + op2Importe;
  const ivaPct = proveedor.tipoIva === 'INTRACOMUNITARIO' ? 0 : 10;
  const ivaImporte = baseReal * (ivaPct / 100);
  const totalFactura = baseReal + ivaImporte;
  return { kilos: kilosNum, baseZgz, baseZgzConIva, op2Importe, baseReal, ivaImporte, totalFactura };
}

function sumarTotalesCompra(lineas) {
  return lineas.reduce(
    (acc, l) => ({
      totalKilos: acc.totalKilos + l.kilos,
      totalBaseZgz: acc.totalBaseZgz + l.baseZgz,
      totalBaseReal: acc.totalBaseReal + l.baseReal,
      totalIva: acc.totalIva + l.ivaImporte,
      totalFactura: acc.totalFactura + l.totalFactura,
    }),
    { totalKilos: 0, totalBaseZgz: 0, totalBaseReal: 0, totalIva: 0, totalFactura: 0 },
  );
}

module.exports = { evaluarExpresionKilos, calcularLineaCompra, sumarTotalesCompra };
