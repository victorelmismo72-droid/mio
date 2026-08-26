require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Pantalla sencilla para que Victor marque a mano la clasificacion fiscal
// de proveedores/clientes (Nacional/Intracomunitario, Recargo de Equivalencia)
// sin tener que usar la API directamente. Ver public/fiscal.html.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/articulos', require('./routes/articulos'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/traspasos', require('./routes/traspasos'));
app.use('/api/repartos', require('./routes/repartos'));
app.use('/api/listas-precio', require('./routes/listasPrecio'));
app.use('/api/export', require('./routes/export'));

// Manejador de errores generico. Fase 1 no valida reglas de negocio -
// solo devuelve el error de la base de datos de forma legible.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`MARINAFISK backend escuchando en el puerto ${port}`));
