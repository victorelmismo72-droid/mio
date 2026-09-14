const express = require('express');
const path = require('path');
const cors = require('cors');
const { resolverPuesto } = require('./middleware/puesto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(resolverPuesto);

app.get('/salud', (req, res) => res.json({ ok: true }));

app.use('/api/puestos', require('./routes/puestos'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/articulos', require('./routes/articulos'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/partidas', require('./routes/partidas'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/repartos', require('./routes/repartos'));
app.use('/api/traspasos', require('./routes/traspasos'));
app.use('/api/listas-precio', require('./routes/listasPrecio'));
app.use('/api/exportar', require('./routes/export'));

// Fase 4: la pantalla (HTML/JS normal, sin paso de compilación) vive en
// backend/public y la sirve este mismo backend — no hace falta instalar
// nada más en el ordenador que solo vaya a usar la pantalla.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `No existe la ruta ${req.method} ${req.path}` });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Manejador de errores centralizado: cualquier error de base de datos (por
// ejemplo, intentar modificar una compra) llega aquí con un mensaje claro.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  const mensaje = err && err.message ? err.message : 'Error interno del servidor.';
  res.status(500).json({ error: mensaje });
});

module.exports = app;
