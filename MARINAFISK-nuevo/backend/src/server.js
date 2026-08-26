// MARINAFISK — Fase 1: backend mínimo.
//
// Solo lectura/escritura de tablas, sin cálculos ni validaciones de negocio
// (eso es la Fase 2). Ver FASE_1_base_de_datos_backend_MARINAFISK.md.
require('dotenv').config();
const express = require('express');
const { pool } = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'conectada' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use('/clientes', require('./routes/clientes'));
app.use('/articulos', require('./routes/articulos'));
app.use('/proveedores', require('./routes/proveedores'));
app.use('/partidas', require('./routes/partidas'));
app.use('/contadores', require('./routes/contadores'));
app.use('/compras', require('./routes/compras'));
app.use('/historial', require('./routes/historial'));
app.use('/historial-trp', require('./routes/historialTrp'));
app.use('/repartos', require('./routes/repartos'));
app.use('/listas-precios', require('./routes/listasPrecios'));
app.use('/export', require('./routes/export'));

// Manejador de errores centralizado — cualquier error de Postgres (por
// ejemplo, intentar violar una restricción) llega aquí en vez de tumbar
// el servidor.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MARINAFISK backend escuchando en el puerto ${PORT}`);
});
