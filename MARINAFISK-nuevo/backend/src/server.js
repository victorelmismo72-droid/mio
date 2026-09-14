require('dotenv').config();
const os = require('os');
const app = require('./app');

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
