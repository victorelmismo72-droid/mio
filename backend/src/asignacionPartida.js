// Asignacion automatica del numero de partida a una compra (Fase 2, regla
// confirmada por Victor el 12/09/2026 - ver FASE_2_logica_de_negocio_MARINAFISK.md).
//
// Regla:
//   - Por defecto hay UNA partida "principal" por dia+proveedor, igual que en
//     el Excel: la primera compra de ese proveedor ese dia crea la partida,
//     y todas las compras siguientes de ese mismo proveedor ese mismo dia la
//     reutilizan automaticamente.
//   - Caso raro (necesidad de produccion): se puede forzar una partida NUEVA
//     distinta para ese mismo dia+proveedor. Nunca se sugiere sola - hay que
//     pedirla explicitamente en cada compra que deba ir ahi.
//   - Si ya hay mas de una partida para ese dia+proveedor (por una excepcion
//     anterior), se puede elegir explicitamente a cual de ellas va una compra
//     nueva (partidaElegida) - si no se indica, se usa siempre la principal.
//
// Proteccion de concurrencia: dos peticiones casi simultaneas intentando
// crear la partida principal de un dia+proveedor que TODAVIA no existe (ej.
// los dos puestos comprando al mismo proveedor a la misma hora) no deben
// generar dos partidas principales distintas - el indice unico parcial
// "partidas_principal_por_dia_proveedor_key" (ver migration.sql) lo impide a
// nivel de base de datos; aqui se captura ese fallo y se reutiliza la que
// haya ganado la carrera, en vez de romper la peticion perdedora.
const { prisma } = require('./db');

async function resolverPartidaParaCompra({ fecha, proveedorId, partidaNueva, partidaElegida }) {
  if (partidaElegida != null) {
    const partida = await prisma.partida.findFirst({
      where: { numeroPartida: Number(partidaElegida), fecha, proveedorId },
    });
    if (!partida) {
      throw new Error(`No existe ninguna partida ${partidaElegida} para este proveedor en esta fecha.`);
    }
    return partida.numeroPartida;
  }

  if (partidaNueva) {
    const creada = await prisma.partida.create({
      data: { fecha, proveedorId, esPrincipal: false },
    });
    return creada.numeroPartida;
  }

  const existente = await prisma.partida.findFirst({
    where: { fecha, proveedorId, esPrincipal: true },
  });
  if (existente) return existente.numeroPartida;

  try {
    const creada = await prisma.partida.create({
      data: { fecha, proveedorId, esPrincipal: true },
    });
    return creada.numeroPartida;
  } catch (err) {
    if (err.code === 'P2002') {
      const ganadora = await prisma.partida.findFirst({ where: { fecha, proveedorId, esPrincipal: true } });
      if (ganadora) return ganadora.numeroPartida;
    }
    throw err;
  }
}

// Para el desplegable "elegir partida" cuando ya hay mas de una ese dia+proveedor.
async function listarPartidasDelDia(fecha, proveedorId) {
  return prisma.partida.findMany({
    where: { fecha, proveedorId },
    orderBy: [{ esPrincipal: 'desc' }, { numeroPartida: 'asc' }],
  });
}

// Usado por la importacion de Excel (ver routes/importarCompras.js): el
// numero de partida ahi viene YA DADO por el Excel (no se recalcula, es
// dato historico), pero igualmente hay que registrarlo en la tabla
// `partidas` para que el resto del sistema (listarPartidasDelDia, el
// desplegable de excepciones) sepa que existe. Si el Excel importado
// contiene una excepcion historica (dos numeros de partida distintos para
// el mismo dia+proveedor, ver Fase 2), la segunda se registra como
// esPrincipal=false automaticamente en vez de fallar.
async function asegurarRegistroPartida(numeroPartida, fecha, proveedorId) {
  const existente = await prisma.partida.findUnique({ where: { numeroPartida } });
  if (existente) return existente;
  try {
    return await prisma.partida.create({ data: { numeroPartida, fecha, proveedorId, esPrincipal: true } });
  } catch (err) {
    if (err.code === 'P2002') {
      return prisma.partida.create({ data: { numeroPartida, fecha, proveedorId, esPrincipal: false } });
    }
    throw err;
  }
}

module.exports = { resolverPartidaParaCompra, listarPartidasDelDia, asegurarRegistroPartida };
