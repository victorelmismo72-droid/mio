// Exportacion a CSV minima (Fase 2 punto 5bis: todos los listados deben
// poder exportarse, como minimo a Excel/CSV). Sin dependencias externas.
function aCsv(filas) {
  if (!filas.length) return '';
  const columnas = Object.keys(filas[0]);
  const escapar = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [columnas.join(';')];
  for (const fila of filas) lineas.push(columnas.map((c) => escapar(fila[c])).join(';'));
  return lineas.join('\n');
}

function responderListado(req, res, filas) {
  if (String(req.query.formato).toLowerCase() === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="listado.csv"');
    return res.send(aCsv(filas));
  }
  return res.json(filas);
}

module.exports = { aCsv, responderListado };
