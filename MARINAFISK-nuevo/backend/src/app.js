const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

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

app.use((req, res) => {
  res.status(404).json({ error: `No existe la ruta ${req.method} ${req.path}` });
});

// Manejador de errores centralizado: cualquier error de base de datos (por
// ejemplo, intentar modificar una compra) llega aquí con un mensaje claro.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  const mensaje = err && err.message ? err.message : 'Error interno del servidor.';
  res.status(500).json({ error: mensaje });
});

module.exports = app;
