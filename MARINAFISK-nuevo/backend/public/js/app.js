import { registrarPantalla, iniciarRouter } from './router.js';
import { obtenerPuesto, fijarPuesto } from './api.js';

import pantallaPedidos from './pantallas/pedidos.js';
import pantallaHistorial from './pantallas/historial.js';
import pantallaCompras from './pantallas/compras.js';
import pantallaRepartos from './pantallas/repartos.js';
import pantallaTraspasos from './pantallas/traspasos.js';
import pantallaPartidas from './pantallas/partidas.js';
import pantallaExcepciones from './pantallas/excepciones.js';
import pantallaListasPrecio from './pantallas/listasPrecio.js';
import pantallaListados from './pantallas/listados.js';
import pantallaClientes from './pantallas/clientes.js';
import pantallaArticulos from './pantallas/articulos.js';
import pantallaProveedores from './pantallas/proveedores.js';
import pantallaModelosImpresion from './pantallas/modelosImpresion.js';

registrarPantalla('pedidos', pantallaPedidos);
registrarPantalla('historial', pantallaHistorial);
registrarPantalla('compras', pantallaCompras);
registrarPantalla('repartos', pantallaRepartos);
registrarPantalla('traspasos', pantallaTraspasos);
registrarPantalla('partidas', pantallaPartidas);
registrarPantalla('excepciones', pantallaExcepciones);
registrarPantalla('listas-precio', pantallaListasPrecio);
registrarPantalla('listados', pantallaListados);
registrarPantalla('clientes', pantallaClientes);
registrarPantalla('articulos', pantallaArticulos);
registrarPantalla('proveedores', pantallaProveedores);
registrarPantalla('modelos-impresion', pantallaModelosImpresion);

const selectorPuesto = document.getElementById('selector-puesto');
selectorPuesto.value = obtenerPuesto();
selectorPuesto.addEventListener('change', () => fijarPuesto(selectorPuesto.value));

iniciarRouter(document.getElementById('contenedor-principal'), 'pedidos');
