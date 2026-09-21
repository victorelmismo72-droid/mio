// Punto de entrada del backend minimo de MARINAFISK (Fase 1).
// Solo almacenamiento y acceso a datos - sin logica de negocio todavia
// (eso es la Fase 2: partidas/margen/2% OP/IVA). Ver
// MARINAFISK-nuevo/FASE_1_base_de_datos_backend_MARINAFISK.md para el
// alcance completo de esta fase.
require('dotenv').config();
const express = require('express');
// DEBE ir justo despues de requerir "express" y ANTES de definir cualquier
// ruta: parchea Express para que un error dentro de una ruta async (una
// promesa rechazada que nadie captura) llegue al manejador de errores de
// mas abajo en vez de crashear todo el proceso. Sin esto, una peticion mal
// formada (ej. un id que no es un numero) podia tirar el backend entero
// para todos los usuarios - fallo real encontrado el 12/09/2026 al añadir
// una ruta nueva por error DESPUES de "/:id" (ver compras.js).
require('express-async-errors');
const path = require('path');
const cors = require('cors');

const { crearRouterCatalogo } = require('./routes/crudCatalogo');
const comprasRouter = require('./routes/compras');
const partidasRouter = require('./routes/partidas');
const pedidosRouter = require('./routes/pedidos');
const traspasosRouter = require('./routes/traspasos');
const repartosRouter = require('./routes/repartos');
const listasPrecioRouter = require('./routes/listasPrecio');
const exportRouter = require('./routes/export');
const importarComprasRouter = require('./routes/importarCompras');
const listadosRouter = require('./routes/listados');

const app = express();
app.use(cors());
app.use(express.json());

// Frontend nuevo (Fase 4, empezado el 21/09/2026 por la pantalla de
// Compras): ficheros estáticos servidos directamente por este mismo
// backend, sin build ni framework - un HTML/CSS/JS por pantalla, igual de
// simple que el HTML actual, para que Víctor pueda seguir entendiéndolo.
app.use(express.static(path.join(__dirname, '..', 'public')));

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
app.use('/importar', importarComprasRouter);
app.use('/listados', listadosRouter);

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
