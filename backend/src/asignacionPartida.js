// Asignacion del numero de partida a una compra.
//
// Regla de negocio (corregida el 20/11/2026 - ver
// RESUMEN_COMPLETO_para_Code_18-11-2026_1..4.md: el HTML actual en
// produccion ha cambiado esto desde la version confirmada el 12/09/2026).
// LA REGLA ANTERIOR ERA AL REVES (automatica por defecto, manual solo como
// excepcion via "partidaNueva") - la regla real ahora es:
//   - El numero de partida lo escribe Victor, tecleado tal cual viene de su
//     Excel de compras (columna N PARTIDA) - la app NO lo inventa.
//   - Si deja la casilla en blanco, la app asigna el siguiente automatico
//     (misma logica de siempre: reutiliza la partida "principal" de ese
//     dia+proveedor si ya existe, o crea una nueva).
//   - Si el numero que teclea ya existe (de otra compra, incluso de OTRO
//     proveedor u otro dia - en los datos reales de Victor hay partidas
//     compartidas por mas de un proveedor), se reutiliza tal cual esa fila
//     de registro - no se valida que coincida proveedor/fecha, porque en la
//     practica no siempre coincide y no es motivo de error.
//   - El caso raro de "necesidad de produccion, otra partida distinta el
//     mismo dia+proveedor" ya NO necesita ninguna casilla/flag especial:
//     basta con teclear un numero distinto al de la partida principal de
//     ese dia+proveedor - el indice unico parcial (ver mas abajo) hace que
//     se registre sola como excepcion (esPrincipal=false) si ya hubiera una
//     principal para ese dia+proveedor, exactamente igual que antes.
//
// Proteccion de concurrencia: dos peticiones casi simultaneas intentando
// crear la partida principal de un dia+proveedor que TODAVIA no existe (ej.
// los dos puestos comprando al mismo proveedor a la misma hora) no deben
// generar dos partidas principales distintas - el indice unico parcial
// "partidas_principal_por_dia_proveedor_key" (ver migration.sql) lo impide a
// nivel de base de datos; aqui se captura ese fallo y se reutiliza la que
// haya ganado la carrera, en vez de romper la peticion perdedora. Esto
// sigue aplicando igual al caso automatico (casilla en blanco).
const { prisma } = require('./db');

async function resolverPartidaParaCompra({ fecha, proveedorId, numeroPartida }) {
  if (numeroPartida != null && numeroPartida !== '') {
    const partida = await asegurarRegistroPartida(Number(numeroPartida), fecha, proveedorId);
    await asegurarSecuenciaPorDelante(partida.numeroPartida);
    return partida.numeroPartida;
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

// Usado tanto por la entrada manual (POST /compras con numeroPartida) como
// por la importacion de Excel (routes/importarCompras.js): registra ese
// numero en la tabla `partidas` si todavia no existe. Si ya existe (de
// cualquier proveedor/fecha - ver nota de mas arriba sobre partidas
// compartidas por mas de un proveedor en los datos reales de Victor), se
// reutiliza tal cual, sin exigir que coincidan proveedor/fecha. Si al
// crearla choca con la partida principal ya existente de ese mismo
// dia+proveedor (indice unico parcial), se registra como excepcion
// (esPrincipal=false) en vez de fallar.
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

// Cuando Victor teclea un numero de partida a mano (en vez de dejarlo en
// blanco para que lo invente la app), hay que asegurarse de que el
// contador automatico ("siguiente partida") nunca vuelva a repetirlo mas
// adelante - equivale a "sube nextPartida si procede" del HTML actual
// (PARTIDAEDIT, 19/11/2026). Nunca retrocede (GREATEST), solo avanza.
async function asegurarSecuenciaPorDelante(numeroPartida) {
  await prisma.$executeRawUnsafe(
    `SELECT setval('partidas_numero_partida_seq', GREATEST($1::int, (SELECT last_value FROM partidas_numero_partida_seq)))`,
    numeroPartida,
  );
}

module.exports = { resolverPartidaParaCompra, listarPartidasDelDia, asegurarRegistroPartida, asegurarSecuenciaPorDelante };
