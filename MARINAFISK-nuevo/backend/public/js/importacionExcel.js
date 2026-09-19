// Lectura y validación de los ficheros .xlsx de catálogo (FASE_6) — mismas
// reglas que el HTML actual (detección de la fila de cabecera, tolerante a
// acentos/mayúsculas/espacios; columnas opcionales que si no vienen no se
// tocan). El resultado de cada parsearXxxExcel() son filas ya limpias,
// listas para mandar a la ruta /importar correspondiente — el servidor es
// quien de verdad da de alta/actualiza (nunca se escribe nada aquí).
// Usa la librería global "XLSX" (js/vendor/xlsx.js).

export function normalizarCabecera(h) {
  let s = String(h == null ? '' : h);
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s.toUpperCase();
}

export function leerArchivoComoWorkbook(file, opciones = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (typeof XLSX === 'undefined') { reject(new Error('No se ha podido cargar el componente de lectura de Excel.')); return; }
        resolve(XLSX.read(new Uint8Array(e.target.result), { type: 'array', ...opciones }));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('No se ha podido leer el archivo.'));
    reader.readAsArrayBuffer(file);
  });
}

// Busca, en las primeras 25 filas, la que contenga TODAS las columnas
// obligatorias (comparando nombres normalizados) — no siempre es la fila 1,
// puede haber títulos o filas en blanco antes.
function buscarFilaCabecera(todasLasFilas, columnasObligatorias) {
  const obligatoriasNorm = columnasObligatorias.map(normalizarCabecera);
  const maxFilas = Math.min(25, todasLasFilas.length);
  let mejor = { idx: -1, encontradas: 0 };
  for (let i = 0; i < maxFilas; i++) {
    const filaNorm = (todasLasFilas[i] || []).map(normalizarCabecera);
    const encontradas = obligatoriasNorm.filter((c) => filaNorm.includes(c)).length;
    if (encontradas > mejor.encontradas) mejor = { idx: i, encontradas };
    if (encontradas === obligatoriasNorm.length) return { headerRowIdx: i };
  }
  const filaRevisada = (todasLasFilas[mejor.idx] || []).map(normalizarCabecera);
  const faltantes = columnasObligatorias.filter((c, k) => !filaRevisada.includes(obligatoriasNorm[k]));
  return { headerRowIdx: -1, filaMasParecida: mejor.idx, faltantes, maxFilas };
}

function mapaColumnas(headerActual, columnas) {
  const mapa = {};
  for (const nombreCol of columnas) {
    const norm = normalizarCabecera(nombreCol);
    const real = headerActual.find((h) => normalizarCabecera(h) === norm);
    if (real) mapa[nombreCol] = real;
  }
  return mapa;
}

// Localiza la hoja y la fila de cabecera; hace el trabajo común a todos los
// importadores "de tabla con cabecera obligatoria" (clientes, proveedores,
// catálogo, compras). Devuelve {error} o {filasRaw, mapa}.
function prepararHoja(wb, { nombreHoja, columnasObligatorias, columnasOpcionales = [] }) {
  const hoja = wb.SheetNames.find((n) => n.trim().toUpperCase() === nombreHoja);
  if (!hoja) return { error: `No se ha encontrado ninguna hoja llamada "${nombreHoja}" en el archivo.` };
  const ws = wb.Sheets[hoja];
  const todasLasFilas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const busqueda = buscarFilaCabecera(todasLasFilas, columnasObligatorias);
  if (busqueda.headerRowIdx === -1) {
    return { error: [
      `No se ha encontrado una fila con todas las columnas obligatorias en las primeras ${busqueda.maxFilas} filas de la hoja "${nombreHoja}".`,
      `La fila que más se parece es la ${busqueda.filaMasParecida + 1}. Ahí faltan o no coinciden: ${busqueda.faltantes.join(', ')}.`,
      `Comprueba que los nombres de columna son exactamente: ${columnasObligatorias.join(', ')}.`,
    ] };
  }
  const headerActual = (todasLasFilas[busqueda.headerRowIdx] || []).map((h) => String(h == null ? '' : h).trim());
  const mapa = mapaColumnas(headerActual, [...columnasObligatorias, ...columnasOpcionales]);
  const filasRaw = XLSX.utils.sheet_to_json(ws, { defval: '', range: busqueda.headerRowIdx }).map((fOrig) => {
    const f = {};
    Object.keys(fOrig).forEach((k) => { f[String(k).trim()] = fOrig[k]; });
    return f;
  });
  return { filasRaw, mapa, headerRowIdx: busqueda.headerRowIdx };
}

function valor(f, mapa, nombreCol) {
  return mapa[nombreCol] ? f[mapa[nombreCol]] : undefined;
}
function texto(f, mapa, nombreCol) {
  const v = valor(f, mapa, nombreCol);
  return v == null ? '' : String(v).trim();
}

// ---- CLIENTES (hoja "CLIENTES") ----
const COLS_OBLIGATORIAS_CLIENTES = ['CODIGO', 'NOMBRE / RAZON SOCIAL'];
const COLS_OPCIONALES_CLIENTES = ['CIF/NIF', 'DIRECCION', 'C.P.', 'POBLACION', 'PROVINCIA', 'TELEFONO', 'EMAIL', 'FORMA PAGO', 'AGENCIA HABITUAL'];
const MAPA_CAMPO_CLIENTE = {
  'CIF/NIF': 'cif', DIRECCION: 'direccion', 'C.P.': 'cp', POBLACION: 'poblacion',
  PROVINCIA: 'provincia', TELEFONO: 'telefono', EMAIL: 'email', 'FORMA PAGO': 'forma_pago', 'AGENCIA HABITUAL': 'agencia',
};

export function parsearClientesExcel(wb) {
  const r = prepararHoja(wb, { nombreHoja: 'CLIENTES', columnasObligatorias: COLS_OBLIGATORIAS_CLIENTES, columnasOpcionales: COLS_OPCIONALES_CLIENTES });
  if (r.error) return { ok: false, errores: [].concat(r.error) };
  const candidatos = [], vistos = new Set(), errores = [];
  r.filasRaw.forEach((f, idx) => {
    const cod = texto(f, r.mapa, 'CODIGO').toUpperCase();
    const nombre = texto(f, r.mapa, 'NOMBRE / RAZON SOCIAL');
    if (!cod && !nombre) return;
    const fila = r.headerRowIdx + 2 + idx;
    if (!cod) { errores.push(`Fila ${fila}: falta el código.`); return; }
    if (!nombre) { errores.push(`Fila ${fila} (código ${cod}): falta el nombre.`); return; }
    if (vistos.has(cod)) { errores.push(`Código repetido "${cod}" en la fila ${fila} (ya aparecía antes en el Excel).`); return; }
    vistos.add(cod);
    const c = { codigo: cod, nombre };
    COLS_OPCIONALES_CLIENTES.forEach((col) => { if (r.mapa[col]) c[MAPA_CAMPO_CLIENTE[col]] = texto(f, r.mapa, col); });
    candidatos.push(c);
  });
  if (errores.length) return { ok: false, errores };
  if (!candidatos.length) return { ok: false, errores: ['No se ha encontrado ningún cliente válido (con código y nombre) en la hoja CLIENTES.'] };
  return { ok: true, filas: candidatos };
}

// ---- PROVEEDORES (hoja "PROVEEDORES") ----
const COLS_OBLIGATORIAS_PROVEEDORES = ['CODIGO', 'NOMBRE PROVEEDOR'];
const COLS_OPCIONALES_PROVEEDORES = ['OP 2% (S/N)', 'NOTAS'];

export function parsearProveedoresExcel(wb) {
  const r = prepararHoja(wb, { nombreHoja: 'PROVEEDORES', columnasObligatorias: COLS_OBLIGATORIAS_PROVEEDORES, columnasOpcionales: COLS_OPCIONALES_PROVEEDORES });
  if (r.error) return { ok: false, errores: [].concat(r.error) };
  const candidatos = [], vistos = new Set(), errores = [];
  r.filasRaw.forEach((f, idx) => {
    const cod = texto(f, r.mapa, 'CODIGO').toUpperCase();
    const nombre = texto(f, r.mapa, 'NOMBRE PROVEEDOR');
    if (!cod && !nombre) return;
    const fila = r.headerRowIdx + 2 + idx;
    if (!cod) { errores.push(`Fila ${fila}: falta el código.`); return; }
    if (!nombre) { errores.push(`Fila ${fila} (código ${cod}): falta el nombre.`); return; }
    if (vistos.has(cod)) { errores.push(`Código repetido "${cod}" en la fila ${fila}.`); return; }
    vistos.add(cod);
    candidatos.push({
      codigo: cod, nombre,
      es_subasta_op: texto(f, r.mapa, 'OP 2% (S/N)').toUpperCase() === 'S',
      notas: texto(f, r.mapa, 'NOTAS'),
    });
  });
  if (errores.length) return { ok: false, errores };
  if (!candidatos.length) return { ok: false, errores: ['No se ha encontrado ningún proveedor válido en la hoja PROVEEDORES.'] };
  return { ok: true, filas: candidatos };
}

// ---- CATÁLOGO DE ARTÍCULOS (hoja "PRODUCTOS", solo MOSTRAR EN LISTA = "S") ----
const COLS_OBLIGATORIAS_CATALOGO = ['codigo', 'descripcion', 'tipo', 'pvp1', 'pvp2', 'MOSTRAR EN LISTA'];
const COLS_OPCIONALES_ETIQUETA = ['NOMBRE CIENTIFICO', 'ZONA FAO', 'SUBZONA', 'ARTE DE PESCA', 'BARCO', 'PESO ETIQUETA', 'CALIBRE', 'MODO DE PRESENTACION', 'FORMA DE OBTENCION'];
const MAPA_CAMPO_ETIQUETA = {
  'NOMBRE CIENTIFICO': 'cientifico', 'ZONA FAO': 'zona_fao', SUBZONA: 'subzona', 'ARTE DE PESCA': 'arte_pesca',
  BARCO: 'barco', 'PESO ETIQUETA': 'peso_etiqueta', CALIBRE: 'calibre', 'MODO DE PRESENTACION': 'modo_presentacion', 'FORMA DE OBTENCION': 'forma_obtencion',
};
// Estos tres, si la columna está presente pero la celda viene vacía, caen a
// un valor por defecto en vez de quedarse en blanco — igual que el HTML actual.
const DEFECTO_SI_COLUMNA_PERO_VACIO = { barco: 'VARIOS BARCOS', peso_etiqueta: 'VER CAJA', forma_obtencion: 'CAPTURADO' };

function esMostrarS(v) { return String(v == null ? '' : v).trim().toUpperCase() === 'S'; }

export function parsearCatalogoExcel(wb) {
  const r = prepararHoja(wb, { nombreHoja: 'PRODUCTOS', columnasObligatorias: COLS_OBLIGATORIAS_CATALOGO, columnasOpcionales: COLS_OPCIONALES_ETIQUETA });
  if (r.error) return { ok: false, errores: [].concat(r.error) };
  const candidatos = [], vistos = new Map(), errores = [];
  r.filasRaw.forEach((fOrig, idx) => {
    if (!esMostrarS(valor(fOrig, r.mapa, 'MOSTRAR EN LISTA'))) return;
    const fila = r.headerRowIdx + 2 + idx;
    const cod = texto(fOrig, r.mapa, 'codigo').toUpperCase();
    if (!cod) return; // fila vacía/separadora
    if (vistos.has(cod)) { errores.push(`Fila ${fila}: código "${cod}" duplicado (ya aparece en la fila ${vistos.get(cod)}).`); return; }
    vistos.set(cod, fila);
    const desc = texto(fOrig, r.mapa, 'descripcion');
    if (!desc) { errores.push(`Fila ${fila} (${cod}): la descripción está vacía.`); return; }
    const pvp1raw = valor(fOrig, r.mapa, 'pvp1');
    const pvp2raw = valor(fOrig, r.mapa, 'pvp2');
    const pvp1vacio = pvp1raw == null || String(pvp1raw).trim() === '';
    const pvp2vacio = pvp2raw == null || String(pvp2raw).trim() === '';
    const pvp1 = pvp1vacio ? 0 : parseFloat(String(pvp1raw).replace(',', '.'));
    const pvp2 = pvp2vacio ? 0 : parseFloat(String(pvp2raw).replace(',', '.'));
    if (!pvp1vacio && (Number.isNaN(pvp1) || pvp1 < 0)) { errores.push(`Fila ${fila} (${cod}): PVP1 no es un número válido ("${pvp1raw}").`); return; }
    if (!pvp2vacio && (Number.isNaN(pvp2) || pvp2 < 0)) { errores.push(`Fila ${fila} (${cod}): PVP2 no es un número válido ("${pvp2raw}").`); return; }

    const c = { codigo: cod, descripcion: desc, tipo: texto(fOrig, r.mapa, 'tipo') || 'FRESCO', pvp1, pvp2 };
    COLS_OPCIONALES_ETIQUETA.forEach((col) => {
      if (!r.mapa[col]) return;
      const campo = MAPA_CAMPO_ETIQUETA[col];
      const v = texto(fOrig, r.mapa, col);
      c[campo] = (!v && DEFECTO_SI_COLUMNA_PERO_VACIO[campo]) ? DEFECTO_SI_COLUMNA_PERO_VACIO[campo] : v;
    });
    candidatos.push(c);
  });
  if (errores.length) return { ok: false, errores };
  if (!candidatos.length) return { ok: false, errores: ['No se ha encontrado ningún artículo con MOSTRAR EN LISTA = "S". No hay nada que importar.'] };
  return { ok: true, filas: candidatos };
}

// ---- Traducciones de nombre (francés/italiano) — hoja que empieza por "TRADUC" ----
export function parsearTraduccionesExcel(wb) {
  const nombreHoja = wb.SheetNames.find((n) => n.trim().toUpperCase().startsWith('TRADUC')) || wb.SheetNames[0];
  const ws = wb.Sheets[nombreHoja];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let headerRowIdx = -1, colCodigo = -1, colTraduccion = -1;
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    const filaNorm = (filas[i] || []).map(normalizarCabecera);
    let c1 = filaNorm.indexOf('CÓDIGO'); if (c1 === -1) c1 = filaNorm.indexOf('CODIGO');
    const c2 = filaNorm.findIndex((x) => x.startsWith('TRADUCCION COMPLETA'));
    if (c1 !== -1 && c2 !== -1) { headerRowIdx = i; colCodigo = c1; colTraduccion = c2; break; }
  }
  if (headerRowIdx === -1) {
    return { ok: false, errores: [`No se han encontrado las columnas "Código" y "TRADUCCIÓN COMPLETA" en la hoja "${nombreHoja}". Comprueba que es el Excel correcto.`] };
  }
  const candidatos = [];
  for (let rIdx = headerRowIdx + 1; rIdx < filas.length; rIdx++) {
    const codigo = String(filas[rIdx][colCodigo] || '').trim();
    const traduccion = String(filas[rIdx][colTraduccion] || '').trim();
    if (!codigo || !traduccion) continue;
    candidatos.push({ codigo, traduccion });
  }
  if (!candidatos.length) return { ok: false, errores: ['No se ha encontrado ninguna fila con código y traducción en la hoja.'] };
  return { ok: true, filas: candidatos };
}

// ---- COMPRAS (hoja "COMPRAS") ----
const COLS_OBLIGATORIAS_COMPRAS = ['N PARTIDA', 'FECHA', 'COD PROV', 'COD PROD', 'KILOS', 'EUR/KG'];
const COLS_OPCIONALES_COMPRAS = ['ALB PROV', 'CAJAS', 'CONTROL'];

function fechaISOLocal(d) {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function parsearComprasExcel(wb) {
  const r = prepararHoja(wb, { nombreHoja: 'COMPRAS', columnasObligatorias: COLS_OBLIGATORIAS_COMPRAS, columnasOpcionales: COLS_OPCIONALES_COMPRAS });
  if (r.error) return { ok: false, errores: [].concat(r.error) };
  const grupos = new Map();
  const ignoradas = [];
  r.filasRaw.forEach((f, idx) => {
    const partidaRaw = valor(f, r.mapa, 'N PARTIDA');
    const codProdRaw = valor(f, r.mapa, 'COD PROD');
    if ((partidaRaw === '' || partidaRaw == null) && (codProdRaw === '' || codProdRaw == null)) return;
    const fila = r.headerRowIdx + 2 + idx;
    const partida = parseInt(partidaRaw, 10);
    if (!partida) { ignoradas.push(`Fila ${fila}: sin Nº de partida válido (probablemente una fila de totales, no una compra).`); return; }
    const fechaRaw = valor(f, r.mapa, 'FECHA');
    let fecha = '';
    if (fechaRaw instanceof Date) fecha = fechaISOLocal(fechaRaw);
    else if (fechaRaw) { const d = new Date(fechaRaw); if (!Number.isNaN(d.getTime())) fecha = fechaISOLocal(d); }
    if (!fecha) { ignoradas.push(`Fila ${fila} (partida ${partida}): fecha no válida, se ignora esta fila.`); return; }
    const proveedorCod = texto(f, r.mapa, 'COD PROV');
    if (!proveedorCod) { ignoradas.push(`Fila ${fila} (partida ${partida}): falta el código de proveedor, se ignora esta fila.`); return; }
    const codProd = String(codProdRaw || '').trim();
    if (!codProd) { ignoradas.push(`Fila ${fila} (partida ${partida}): falta el código de producto, se ignora esta fila.`); return; }
    const albProveedor = texto(f, r.mapa, 'ALB PROV');
    const kilos = parseFloat(valor(f, r.mapa, 'KILOS')) || 0;
    const precioKg = parseFloat(valor(f, r.mapa, 'EUR/KG')) || 0;
    const cajas = r.mapa['CAJAS'] ? (parseFloat(valor(f, r.mapa, 'CAJAS')) || 0) : 0;
    const controlRaw = texto(f, r.mapa, 'CONTROL').toUpperCase();
    const control = ['S', 'SI', 'SÍ', 'X', '1', 'TRUE'].includes(controlRaw);

    // Agrupado por partida+albarán+proveedor — si dentro del mismo albarán
    // hay una fila con proveedor distinto, se trata como una compra aparte.
    const clave = `${partida}|${albProveedor}|${proveedorCod}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, { partida, fecha, alb_proveedor: albProveedor || null, proveedor_codigo: proveedorCod, lineas: [] });
    }
    grupos.get(clave).lineas.push({ articulo_codigo: codProd, cajas, kilos, precio_kg: precioKg, control });
  });
  const gruposFinales = [...grupos.values()];
  if (!gruposFinales.length) return { ok: false, errores: ['No se ha encontrado ninguna compra válida en la hoja COMPRAS.'] };
  return { ok: true, grupos: gruposFinales, ignoradas };
}
