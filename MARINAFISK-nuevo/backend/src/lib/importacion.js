// Importación masiva desde Excel (Fase 6) — alta/actualización de un
// catálogo por código, sin borrar nunca lo que no venga en el archivo (ver
// FASE_6_importacion_excel_MARINAFISK.md punto 2). El parseo del propio
// fichero .xlsx (detectar la fila de cabecera, mapear columnas) ocurre en el
// navegador; aquí solo se reciben filas ya limpias {codigo, ...campos} y se
// hace el alta/actualización real, validando lo mínimo indispensable
// (código y campos obligatorios) también en el servidor.
const { registrarEscritura } = require('./log');

// campos: lista de columnas (además de "codigo") que puede traer el Excel.
// Un valor undefined/null en una fila para un campo NO lo borra si ya
// existía — solo lo toca si el Excel trae explícitamente un valor.
async function upsertCatalogoPorCodigo(cliente, { tabla, filas, campos, camposObligatorios = [], defaultsAlta = {} }) {
  const vistos = new Set();
  for (const f of filas) {
    if (!f.codigo) throw new Error('Falta el código en alguna fila.');
    const codigo = String(f.codigo).trim().toUpperCase();
    for (const c of camposObligatorios) {
      if (f[c] === undefined || f[c] === null || String(f[c]).trim() === '') {
        throw new Error(`Falta "${c}" para el código "${codigo}".`);
      }
    }
    if (vistos.has(codigo)) throw new Error(`Código repetido "${codigo}" en el archivo.`);
    vistos.add(codigo);
  }

  const nuevos = [];
  const modificados = [];
  let sinCambios = 0;

  for (const f of filas) {
    const codigo = String(f.codigo).trim().toUpperCase();
    const existente = await cliente.query(`SELECT * FROM ${tabla} WHERE codigo = $1`, [codigo]);
    const prev = existente.rows[0] || null;
    const valores = campos.map((c) => {
      if (f[c] !== undefined) return f[c];
      if (prev) return prev[c];
      return defaultsAlta[c] !== undefined ? defaultsAlta[c] : null;
    });

    if (!prev) {
      const r = await cliente.query(
        `INSERT INTO ${tabla} (codigo, ${campos.join(', ')}) VALUES ($1, ${campos.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING id`,
        [codigo, ...valores]
      );
      await registrarEscritura(cliente, { tabla, operacion: 'IMPORTAR_ALTA', registroId: r.rows[0].id, detalle: { codigo } });
      nuevos.push(codigo);
    } else {
      const cambios = [];
      campos.forEach((c, i) => {
        const antes = String(prev[c] == null ? '' : prev[c]).trim();
        const ahora = String(valores[i] == null ? '' : valores[i]).trim();
        if (antes !== ahora) cambios.push(`${c} "${antes}" → "${ahora}"`);
      });
      if (cambios.length) {
        await cliente.query(
          `UPDATE ${tabla} SET ${campos.map((c, i) => `${c} = $${i + 1}`).join(', ')}, modificado_en = now() WHERE codigo = $${campos.length + 1}`,
          [...valores, codigo]
        );
        await registrarEscritura(cliente, { tabla, operacion: 'IMPORTAR_ACTUALIZA', registroId: prev.id, detalle: { codigo, cambios } });
        modificados.push({ codigo, detalle: cambios.join('; ') });
      } else {
        sinCambios++;
      }
    }
  }

  return { nuevos, modificados, sin_cambios: sinCambios };
}

module.exports = { upsertCatalogoPorCodigo };
