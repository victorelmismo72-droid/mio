require('dotenv').config();
const os = require('os');
const app = require('./app');

// Red de seguridad de última instancia: si algo se escapa sin capturar
// (fuera del manejador de errores de Express, p.ej. en un callback suelto),
// que quede escrito con claridad en el log ANTES de cerrar, en vez de un
// cuelgue silencioso o un mensaje críptico de Node. Cerrar aquí es
// intencionado: un proceso en un estado desconocido no debe seguir
// atendiendo peticiones — para que se recupere solo hace falta un
// supervisor de verdad por delante (ver README §9.6, Programador de
// tareas/systemd/pm2), no basta con capturar el error y seguir como si
// nada.
process.on('uncaughtException', (err) => {
  console.error('✘ Error no capturado — el proceso se va a cerrar:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('✘ Promesa rechazada sin capturar — el proceso se va a cerrar:', err);
  process.exit(1);
});

const puerto = Number(process.env.PORT) || 3001;

// Fase 3, punto 1: el backend tiene que poder atenderse desde OTRO
// ordenador de la misma red local (p.ej. el de Pancho), no solo desde este
// mismo ordenador. Escuchar en "0.0.0.0" (en vez de dejar el valor por
// defecto, que en algunos sistemas puede quedar limitado a localhost) deja
// esto explícito, y además al arrancar se imprime la IP real de este
// ordenador en la red local, para que sea fácil copiarla en el otro puesto.
function direccionesDeRed() {
  const interfaces = os.networkInterfaces();
  const direcciones = [];
  for (const nombre of Object.keys(interfaces)) {
    for (const info of interfaces[nombre]) {
      if (info.family === 'IPv4' && !info.internal) direcciones.push(info.address);
    }
  }
  return direcciones;
}

app.listen(puerto, '0.0.0.0', () => {
  console.log(`MARINAFISK backend escuchando en el puerto ${puerto}.`);
  console.log(`  - En este mismo ordenador: http://localhost:${puerto}`);
  const ips = direccionesDeRed();
  if (ips.length) {
    console.log('  - Desde OTRO ordenador de la misma red local, usar una de estas direcciones:');
    ips.forEach((ip) => console.log(`      http://${ip}:${puerto}`));
  } else {
    console.log('  - No se ha detectado ninguna dirección de red local (¿sin cable/wifi conectado?) — solo se podrá usar desde este mismo ordenador por ahora.');
  }
});
