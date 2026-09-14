import { registrarPantalla, iniciarRouter } from './router.js';
import { obtenerPuesto, fijarPuesto } from './api.js';

import pantallaPedidos from './pantallas/pedidos.js';
import pantallaCompras from './pantallas/compras.js';
import pantallaPartidas from './pantallas/partidas.js';
import pantallaExcepciones from './pantallas/excepciones.js';
import pantallaListasPrecio from './pantallas/listasPrecio.js';
import pantallaClientes from './pantallas/clientes.js';
import pantallaArticulos from './pantallas/articulos.js';
import pantallaProveedores from './pantallas/proveedores.js';

registrarPantalla('pedidos', pantallaPedidos);
registrarPantalla('compras', pantallaCompras);
registrarPantalla('partidas', pantallaPartidas);
registrarPantalla('excepciones', pantallaExcepciones);
registrarPantalla('listas-precio', pantallaListasPrecio);
registrarPantalla('clientes', pantallaClientes);
registrarPantalla('articulos', pantallaArticulos);
registrarPantalla('proveedores', pantallaProveedores);

const selectorPuesto = document.getElementById('selector-puesto');
selectorPuesto.value = obtenerPuesto();
selectorPuesto.addEventListener('change', () => fijarPuesto(selectorPuesto.value));

iniciarRouter(document.getElementById('contenedor-principal'), 'pedidos');
