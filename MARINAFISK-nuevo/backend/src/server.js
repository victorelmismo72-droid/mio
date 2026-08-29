require('dotenv').config();
const path = require('path');
const express = require('express');
const { pool } = require('./db');
const { requireAuth } = require('./auth');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Pantalla sencilla para que Victor marque a mano la clasificacion fiscal
// de proveedores/clientes (Nacional/Intracomunitario, Recargo de Equivalencia)
// sin tener que usar la API directamente. Ver public/fiscal.html.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Login no requiere estar ya logueado (obviamente). Todo lo demas bajo
// /api si requiere sesion (Fase 3): un token valido de Authorization:
// Bearer <token>, obtenido en POST /api/auth/login.
app.use('/api/auth', require('./routes/auth'));
app.use('/api', requireAuth(pool));

app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/articulos', require('./routes/articulos'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/traspasos', require('./routes/traspasos'));
app.use('/api/repartos', require('./routes/repartos'));
app.use('/api/listas-precio', require('./routes/listasPrecio'));
app.use('/api/partidas', require('./routes/partidas'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/listados', require('./routes/listados'));
app.use('/api/export', require('./routes/export'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/clientes-a-contactar', require('./routes/clientesContactar'));
app.use('/api/cierre-anual', require('./routes/cierreAnual'));

// Manejador de errores generico: devuelve el mensaje de error de forma legible.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`MARINAFISK backend escuchando en el puerto ${port}`));
