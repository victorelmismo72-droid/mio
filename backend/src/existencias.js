// EXISTENCIAS EN CAMARA - logica compartida entre la pantalla y la
// exportacion a Excel (ver Fase 0 punto 15 y schema.prisma, modelo
// Existencia/ExistenciaLinea). Puerto directo de las funciones "ex..." del
// HTML real (abrirExistencias y las siguientes), adaptado a filas reales de
// base de datos en vez de un array JSON indexado por posicion.
const { evaluarExpresionKilos } = require('./calculoCompra');

// Nombres de dia en galego, igual que el HTML real (EX_DIAS) - Victor
// trabaja en A Coruna y la cabecera de cada banda de dia sale asi en la
// pantalla/Excel/impresion de esta pantalla en concreto.
const DIAS_GALEGO = ['DOMINGO', 'LUNS', 'MARTES', 'MERCORES', 'XOVES', 'VENRES', 'SABADO'];

function cabeceraDia(fechaIso) {
  const d = new Date(`${fechaIso}T12:00:00`);
  const p = fechaIso.split('-');
  return `${DIAS_GALEGO[d.getDay()]}, ${p[2]}-${p[1]}-${p[0].slice(2)}`;
}

// Una linea es valida para grabarse si es un separador, o si tiene peso>0 y
// algun texto (articulo del catalogo o descripcion libre) - igual que el
// filtro "validas" de exGrabarDia(). Quita tambien separadores sobrantes al
// principio/al final/repetidos (exLimpiaSeps).
function limpiarLineasExistencia(lineas) {
  const validas = (lineas || []).filter((l) => {
    if (l.separador) return true;
    const peso = evaluarExpresionKilos(l.peso);
    const tieneTexto = l.articuloId != null || String(l.descripcionLibre || '').trim() !== '';
    return tieneTexto && !Number.isNaN(peso) && peso > 0;
  });
  const sinSeparadoresSobrantes = [];
  for (const l of validas) {
    if (l.separador && (!sinSeparadoresSobrantes.length || sinSeparadoresSobrantes[sinSeparadoresSobrantes.length - 1].separador)) continue;
    sinSeparadoresSobrantes.push(l);
  }
  while (sinSeparadoresSobrantes.length && sinSeparadoresSobrantes[sinSeparadoresSobrantes.length - 1].separador) {
    sinSeparadoresSobrantes.pop();
  }
  return sinSeparadoresSobrantes;
}

// Totales de una linea (bultos, kg, importe) - exTotalesLinea().
function totalesLinea(l) {
  const bultos = Number(l.cantidad) || 0;
  const kilos = Number(l.peso) || 0;
  const precio = Number(l.precio) || 0;
  return { bultos, kilos, importe: kilos * precio };
}

// Semana ISO (lunes a domingo) - exSemanaISO(), igual formula.
function semanaIso(fechaIso) {
  const d = new Date(`${fechaIso}T12:00:00`);
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia + 3); // jueves de esa semana
  const anio = d.getFullYear();
  const ene4 = new Date(anio, 0, 4, 12);
  const sem = 1 + Math.round((((d - ene4) / 86400000) - 3 + ((ene4.getDay() + 6) % 7)) / 7);
  return `${anio}-S${String(sem).padStart(2, '0')}`;
}

function claveGrupo(fechaIso, modo) {
  if (modo === 'semana') return semanaIso(fechaIso);
  if (modo === 'mes') return fechaIso.slice(0, 7);
  if (modo === 'total') return 'TOTAL';
  return fechaIso; // 'dia'
}

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function etiquetaGrupo(clave, modo) {
  if (modo === 'mes') { const [y, m] = clave.split('-'); return `${MESES[parseInt(m, 10)]} ${y}`; }
  if (modo === 'semana') { const [y, s] = clave.split('-S'); return `Semana ${s} (${y})`; }
  if (modo === 'total') return 'Todo el período';
  const [y, m, d] = clave.split('-'); // 'dia' -> fecha ISO "YYYY-MM-DD"
  return `${d}/${m}/${y}`;
}

// Agrupa dias (cada uno {fecha, lineas}) por dia/semana/mes/total - exResumen().
function resumenPorModo(dias, modo) {
  const grupos = new Map();
  const orden = [];
  for (const d of dias) {
    const clave = claveGrupo(d.fecha, modo);
    if (!grupos.has(clave)) { grupos.set(clave, { clave, bultos: 0, kilos: 0, importe: 0, dias: 0 }); orden.push(clave); }
    const g = grupos.get(clave);
    g.dias += 1;
    for (const l of d.lineas || []) {
      if (l.separador) continue;
      const t = totalesLinea(l);
      g.bultos += t.bultos; g.kilos += t.kilos; g.importe += t.importe;
    }
  }
  return orden.map((c) => grupos.get(c));
}

// Aplana una linea cruda de Prisma (con la relacion "articulo" anidada) a
// la forma que ve el cliente/Excel - mismo shape tanto si viene de GET /
// (sin filtrar) como de diasFiltrados() mas abajo.
function lineaPlana(l) {
  return {
    id: l.id,
    orden: l.orden,
    separador: l.separador,
    articuloId: l.articuloId,
    articuloCodigo: l.articulo?.codigo || null,
    articuloDescripcion: l.articulo?.descripcion || null,
    descripcionLibre: l.descripcionLibre,
    cantidad: l.cantidad,
    peso: l.peso,
    precio: l.precio,
    nota: l.nota,
    vendido: l.vendido,
  };
}

// Filtra las lineas de cada dia por texto libre y por si se muestran/solo
// se muestran los vendidos - exDatosListado(). "dias" son filas crudas de
// Prisma (Existencia con lineas incluidas, cada linea con su "articulo"
// anidado) - devuelve ya aplanado, con fecha como texto "YYYY-MM-DD".
function diasFiltrados(dias, { filtro, verVendidos, soloVendidos } = {}) {
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filtroNorm = norm(filtro || '');
  return dias
    .map((d) => {
      const fecha = d.fecha.toISOString().slice(0, 10);
      const lineasFiltradas = (d.lineas || []).filter((l) => {
        if (l.separador) return !filtroNorm; // una fila en blanco no "contiene" texto
        if (filtroNorm) {
          const texto = norm(`${l.articulo?.codigo || ''} ${l.articulo?.descripcion || l.descripcionLibre || ''} ${l.nota || ''}`);
          if (!texto.includes(filtroNorm)) return false;
        }
        return soloVendidos ? !!l.vendido : (verVendidos || !l.vendido);
      });
      return { fecha, lineas: limpiarLineasExistencia(lineasFiltradas.map(lineaPlana)) };
    })
    .filter((d) => d.lineas.some((l) => !l.separador));
}

module.exports = {
  DIAS_GALEGO,
  cabeceraDia,
  lineaPlana,
  limpiarLineasExistencia,
  totalesLinea,
  semanaIso,
  etiquetaGrupo,
  resumenPorModo,
  diasFiltrados,
};
