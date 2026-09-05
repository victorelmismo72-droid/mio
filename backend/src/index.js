// Punto de entrada del backend minimo de MARINAFISK (Fase 1).
// Solo almacenamiento y acceso a datos - sin logica de negocio todavia
// (eso es la Fase 2: partidas/margen/2% OP/IVA). Ver
// MARINAFISK-nuevo/FASE_1_base_de_datos_backend_MARINAFISK.md para el
// alcance completo de esta fase.
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { crearRouterCatalogo } = require('./routes/crudCatalogo');
const comprasRouter = require('./routes/compras');
const partidasRouter = require('./routes/partidas');
const pedidosRouter = require('./routes/pedidos');
const traspasosRouter = require('./routes/traspasos');
const repartosRouter = require('./routes/repartos');
const listasPrecioRouter = require('./routes/listasPrecio');
const exportRouter = require('./routes/export');

const app = express();
app.use(cors());
app.use(express.json());

// Log sencillo en consola de cada peticion - ayuda a ver que esta pasando
// mientras Victor prueba el programa, sin necesidad de herramientas extra.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'marinafisk-backend', fase: 1 });
});

app.use('/clientes', crearRouterCatalogo('cliente', 'clientes'));
app.use('/proveedores', crearRouterCatalogo('proveedor', 'proveedores'));
app.use('/articulos', crearRouterCatalogo('articulo', 'articulos'));
app.use('/compras', comprasRouter);
app.use('/partidas', partidasRouter);
app.use('/pedidos', pedidosRouter);
app.use('/traspasos', traspasosRouter);
app.use('/repartos', repartosRouter);
app.use('/listas-precio', listasPrecioRouter);
app.use('/export', exportRouter);

// Manejador de errores generico - para que un fallo inesperado devuelva un
// JSON claro en vez de romper el servidor o dejar la peticion colgada.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend MARINAFISK escuchando en http://localhost:${PORT}`);
});
