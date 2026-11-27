// IVA y Recargo de Equivalencia en VENTAS (Fase 2, punto 3). Puerto directo
// de calcularIvaPedido() y calcLineaPed(), que ya funcionan correctamente en
// el HTML actual - se reproducen tal cual, no se rediseñan (ver FASE_2, que
// aclara que el fallo de IVA congelado de Fase 0 punto 4 es solo del lado
// de compras, no de ventas).
//
// Regla (idéntica al HTML): el tipo de IVA que se aplica es el del CLIENTE
// del pedido, consultado en vivo en el momento de grabar - nunca el que
// venga ya calculado desde el cliente HTTP, por la misma razón que en
// compras (ver calculoCompra.js): un frontend con la fórmula desactualizada
// no debe poder grabar un pedido con el IVA equivocado.
function calcularIvaPedido(base, tipoIva) {
  let ivaPct = 10;
  let rePct = 0;
  if (tipoIva === 'INTRACOMUNITARIO') {
    ivaPct = 0;
    rePct = 0;
  } else if (tipoIva === 'RECARGO_EQUIVALENCIA') {
    ivaPct = 10;
    rePct = 1.4;
  }
  const iva = (base * (ivaPct + rePct)) / 100;
  return { ivaPct, rePct, iva, total: base + iva };
}

// Admite sumar varias cifras en Peso, igual que Kilos en Compras (ej.
// "12+13.5" al pesar varios bultos por separado) - requisito confirmado
// para Pedidos en 03_FRONTEND_MARINAFISK.md ("debe repetirse en el campo
// de peso de Pedidos"), puerto directo de evaluarExpresionKilos()
// (calculoCompra.js). Solo suma/resta números, no es una calculadora
// general, a propósito.
function evaluarExpresionPeso(valorTexto) {
  const texto = String(valorTexto == null ? '' : valorTexto).trim();
  if (texto === '') return 0;
  if (!/^[0-9.,+\-\s]+$/.test(texto)) return NaN;
  const tokens = texto.replace(/,/g, '.').replace(/\s+/g, '').match(/[+-]?[0-9]*\.?[0-9]+/g);
  if (!tokens || !tokens.length) return NaN;
  return tokens.reduce((s, t) => s + parseFloat(t), 0);
}

// Total de una línea de pedido: peso * precio, con el descuento (%) ya
// descontado. Idéntico a calcLineaPed() del HTML. "peso" aquí ya tiene que
// ser un número evaluado (ver evaluarExpresionPeso más arriba) - lo evalúa
// quien prepara el pedido (routes/pedidos.js), antes de que el peso se use
// también para la asignación de partida/reservas (Fase 2 punto 4), no solo
// para este total.
function calcularTotalLineaPedido({ peso, precio, descuento }) {
  const p = Number(peso) || 0;
  const pr = Number(precio) || 0;
  const d = Number(descuento) || 0;
  return p * pr * (1 - d / 100);
}

module.exports = { calcularIvaPedido, calcularTotalLineaPedido, evaluarExpresionPeso };
