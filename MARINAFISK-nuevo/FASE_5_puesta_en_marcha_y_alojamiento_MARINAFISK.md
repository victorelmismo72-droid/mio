# MARINAFISK — Fase 5: Puesta en marcha definitiva y alojamiento

Este documento se entrega junto con los de las fases anteriores (`FASE_0` a `FASE_4`), `02_ESQUEMA_BASE_DATOS_PROPUESTO.md`, `ESPECIFICACION_COMPRAS_EXCEL.md` y `CORRECCIONES_2026-09-02_programa_actual.md`.

**Instrucción para Claude Code:** antes de escribir nada, revisa que las Fases 1 a 4 estén **cerradas de verdad**, con todas sus casillas de verificación marcadas y las preguntas a Víctor respondidas. Esta fase no añade funciones nuevas: lleva el sistema nuevo del modo prueba al uso real, deja de usar el HTML y el Excel para el trabajo diario y decide dónde vive el servidor a largo plazo. Es la fase con más riesgo para los datos reales, así que cada paso lleva vuelta atrás.

---

## Objetivo de esta fase

Al final de la Fase 5:

1. Víctor y Pancho trabajan **solo** con el sistema nuevo, desde los dos puestos y la tablet.
2. Todos los datos históricos (HTML y Excel) están dentro, verificados y sin perder nada.
3. Los números de pedido, reparto, traspaso y partida siguen la numeración real, sin saltos raros ni repeticiones respecto a lo ya emitido.
4. El servidor está donde se haya decidido (oficina o nube), con copias de seguridad fuera de él y probadas.
5. El HTML y el Excel quedan guardados, en solo lectura, como archivo histórico.
6. Víctor tiene una guía sencilla para el día a día y para los problemas más probables.

---

## 1. Requisitos antes de empezar

No se arranca esta fase hasta que:

- [ ] Fases 1, 2, 3 y 4 cerradas con todas sus verificaciones.
- [ ] **Decisiones pendientes de Víctor tomadas y escritas.** Sin ellas no se puede migrar bien:
  - IVA de proveedores intracomunitarios: 10 % como el Excel o 0 % (`ESPECIFICACION_COMPRAS_EXCEL.md`, punto 9a).
  - 2 % OP en compras ya grabadas: congelado al grabar o recalculado como en el Excel (punto 9b).
  - Las 3 partidas con decimales (55906,7 · 55907,6 · 55908,5): qué número les corresponde (punto 3).
  - Compras a 0 €/kg: si cuentan en el coste del producto (punto 4).
  - Significado de la columna CONTROL ("S") de COMPRAS (punto 1).
  - Modelo de las Toshiba y tamaño real de las etiquetas (Fase 4, punto 8).
- [ ] **Datos revisados en el Excel**: compras sin proveedor, sin producto o sin partida, códigos que no coinciden con el buscador, productos inexistentes (C2106, C1200) y demás anomalías que liste el script de verificación (`compras_referencia/verificar_contra_excel.py`). Lo que no se corrija se migra tal cual y queda marcado para revisión, nunca se "arregla" a escondidas.
- [ ] Al menos **una semana real de uso en paralelo** (Fase 4, punto 7) sin fallos que bloqueen el trabajo.

---

## 2. Dónde vive el servidor: oficina o nube

Hasta ahora el servidor está en la oficina (Fase 3) y la tablet entra desde fuera por VPN (Fase 3, punto 1bis). Ahora se decide si se queda así o pasa a la nube. **Lo decide Víctor**, con esta comparación:

| | Servidor en la oficina + VPN | Servidor en la nube |
|---|---|---|
| Coste | Equipo ya comprado (o mini-PC), luz y un SAI | Cuota mensual (servidor + base de datos gestionada + copias) |
| Si se va la luz o internet en la oficina | **Nadie puede trabajar**, tampoco la tablet | Tablet y móviles siguen; los puestos de la oficina no, por falta de internet |
| Desde fuera (tablet) | Por VPN, depende del internet de la oficina | Directo, con usuario y contraseña (y VPN o doble factor, ver abajo) |
| Copias de seguridad | Hay que llevarlas fuera (disco externo, nube) | El proveedor las hace; hay que guardar además una copia propia fuera |
| Mantenimiento | Actualizaciones y vigilancia del equipo a cargo de Marinafisk | Lo principal lo hace el proveedor |
| Dónde están los datos | En la oficina | En el centro de datos del proveedor (debe estar en la UE) |

**Recomendación:**
- **Al arrancar, quedarse en la oficina con VPN**, que es lo que ya se habrá probado en las Fases 3 y 4. Cambiar de alojamiento a la vez que se deja el HTML suma riesgos.
- **Pasar a la nube después**, cuando el sistema lleve un tiempo estable, si la tablet fuera de la oficina se vuelve importante o si los cortes de luz o internet de la oficina dan problemas.
- El sistema se prepara para poder moverse de un sitio a otro **sin cambiar el código**: configuración en archivos aparte, nada que dependa de la ruta o del nombre del ordenador.

**Si se va a la nube**, como mínimo:
- Proveedor con centro de datos **en la Unión Europea** y contrato de encargado del tratamiento (RGPD), porque hay datos de clientes y proveedores.
- Conexión siempre cifrada (HTTPS).
- **Doble factor** (código en el móvil) para entrar, o seguir con VPN. Al estar en internet, una contraseña sola no basta.
- La base de datos no accesible desde internet, solo desde el propio servidor.
- Avisos automáticos si el servidor se cae o se llena el disco.
- La migración de la oficina a la nube se hace como un corte (punto 4) en pequeño: copia, verificación de recuentos y vuelta atrás preparada.

---

## 3. Migración final de los datos

La migración se ensayó en la Fase 1 con un backup de prueba. Ahora se hace con los datos reales del día del corte:

1. **Fuentes:**
   - Último backup JSON completo del HTML, de los dos puestos y leyendo el estado real, sin cachés (Fase 0, punto 6).
   - Excel `GESTION_CORRECTA`, guardado en Excel para que lleve los resultados de las fórmulas (`ESPECIFICACION_COMPRAS_EXCEL.md`, punto 10bis).
2. **Compras: la fuente buena es el Excel `GESTION_CORRECTA`** (decidido por Víctor el 05/10/2026). Las compras se cargan desde el Excel. Las del HTML solo se usan para comparar, compra por compra (partida, fecha, proveedor, producto, kilos, precio):
   - Si coinciden: bien.
   - Si hay diferencias, o compras que están en el HTML y no en el Excel: se listan para que Víctor las revise **antes** de cargar. No se cargan por su cuenta.
   - Una compra no puede entrar dos veces ni perderse.
3. **Verificación** (como en la Fase 1, punto 4, y la Fase 2, punto 6):
   - Mismos recuentos por tabla y **por puesto** (CORU y PANC).
   - Importes de compras iguales a los del Excel con `verificar_contra_excel.py` y la comparación del punto 11 de la especificación de compras.
   - Muestra de pedidos, traspasos y repartos comparados campo a campo, incluidos palets (0 en los antiguos) y destinatarios de Reparto Super (sin duplicar).
   - Ninguna compra alterada.
4. **Contadores de arranque.** El siguiente número de pedido, reparto, traspaso y partida será **el mayor ya emitido + 1**, mirando todas las fuentes (los dos puestos del HTML y el Excel). Así no se repite ningún número que ya haya salido en un albarán. Víctor revisa y aprueba los cuatro números antes de empezar.
5. **Informe de migración por escrito:** qué se cargó, qué se comprobó, qué diferencias hubo y cómo se resolvieron. Firmado (aprobado) por Víctor.

---

## 4. El día del corte

**Cuándo:** un día de poco trabajo, a primera hora o al final, nunca en mitad de una jornada fuerte. Víctor elige la fecha.

**Pasos, en este orden:**
1. Víctor y Pancho dejan de grabar en el HTML y en la hoja COMPRAS del Excel a una hora acordada.
2. Copia completa de seguridad del HTML (los dos puestos y la carpeta compartida) y del Excel. **Se guarda aparte y no se toca.**
3. Migración final y verificación (punto 3).
4. Víctor aprueba el informe de migración y los contadores de arranque.
5. Se sacan de la base de datos los datos de prueba de las Fases 3 y 4 (base de prueba separada o marcada, Fase 3, punto 9). Ningún número de prueba puede llegar a un documento real.
6. Primer pedido, primera compra y primer reparto reales en el sistema nuevo, revisados en papel con Víctor.
7. El HTML y el Excel quedan **en solo lectura**: se siguen pudiendo abrir para consultar, pero no se graba nada en ellos.

**Plan de vuelta atrás:** si en los primeros días aparece un fallo que impide trabajar y no se arregla en el día:
- Se vuelve al HTML y al Excel, que siguen intactos con la copia del paso 2.
- Lo grabado mientras tanto en el sistema nuevo se lista (pedidos, compras, repartos…) para pasarlo a mano al HTML, o para recuperarlo al volver al sistema nuevo. **Nada se pierde y nada se graba dos veces.**
- Quién decide volver atrás: Víctor. El criterio queda escrito antes del corte (por ejemplo, "no se puede grabar un pedido o imprimir la Transfrío durante más de 2 horas").

**Primeras dos semanas:** revisión diaria, al final del día, de la pantalla de coherencia de datos (Fase 4, punto 3.10), de la copia de seguridad del día y de los avisos.

---

## 5. Lo que hoy sale del Excel hacia fuera

Zaragoza usa las cifras de compras para la contabilidad de beneficio por partida (Fase 0, punto 3). Hoy probablemente las saca del Excel.

- [x] Formato: a Zaragoza se le manda **PDF o Excel** (respondido por Víctor el 05/10/2026). El sistema nuevo genera los dos, con el mismo contenido y las mismas columnas que hoy, para que en Zaragoza no cambie nada.
- [ ] **Pendiente:** un ejemplo real de cada uno (el último PDF y el último Excel enviados) y cada cuánto se mandan, para reproducirlos exactamente.
- Antes del corte se compara un envío real del Excel con el que genera el sistema nuevo: tienen que coincidir cifra a cifra.

Lo mismo para cualquier otro informe que hoy salga del Excel o del HTML hacia otra persona (asesoría, transportistas…): se lista con Víctor y se reproduce.

---

## 6. Copias de seguridad y recuperación, ya en real

Lo de la Fase 3, punto 7, sigue en pie, ahora con datos reales:

- Copia diaria automática completa, **guardada fuera del servidor**. Si el servidor está en la oficina: en otro equipo o disco **y además** fuera del edificio (nube cifrada o un disco que se lleva alguien), para que un robo, incendio o inundación no se lleve también las copias.
- Las copias van **cifradas** cuando salen de la oficina.
- **Ensayo de recuperación cada 3 meses**: restaurar la copia de un día cualquiera en una base aparte y comprobar recuentos. Se apunta la fecha y el resultado.
- Las copias del HTML y del Excel del día del corte se guardan al menos lo que exija la ley para documentación contable (como referencia, 6 años; confirmar con la asesoría).

---

## 7. Mantenimiento

- **Actualizaciones de seguridad** del sistema operativo, la base de datos y las librerías: con una frecuencia fija (por ejemplo, una vez al mes) y siempre después de una copia de seguridad.
- **Cambios en el programa:** primero se prueban en una copia (no en el sistema real). Cada cambio que añada un documento impreso lo añade también al catálogo de modelos (Fase 4, punto 3.9; la prueba automática lo exige).
- **Registro de cambios** en el repositorio: qué se cambió, cuándo y por qué, en palabras que Víctor entienda.
- **Avisos automáticos por correo a pgallego@marinafisk.com** (decidido por Víctor el 05/10/2026). La dirección va en la configuración del servidor, no escrita en el código, para poder cambiarla sin tocar el programa. Se avisa si falla la copia diaria, se llena el disco, el servidor no responde o la comprobación de coherencia encuentra algo.

---

## 8. Guía para Víctor y Pancho

Una guía corta en español (pocas páginas, con capturas), guardada en el repositorio y en papel en la oficina:

- Día a día: entrar, hacer un pedido, una compra, un reparto, imprimir las Transfrío de un camión, la lista de precios.
- Desde la tablet: conectar la VPN y entrar.
- Problemas probables y qué hacer:
  - "No me deja grabar": el servidor no responde.
  - "Se me ha cerrado la sesión": el borrador sigue guardado.
  - "Otro ha cambiado este pedido".
  - "La Transfrío sale descolocada": calibración.
  - "He perdido la tablet": anular su clave.
- A quién llamar y qué datos dar (pantalla, hora, qué se estaba haciendo).
- Dónde están las copias de seguridad y cómo comprobar que la de hoy se ha hecho.

---

## 9. Verificación de esta fase

- [ ] Decisiones del punto 1 tomadas y escritas.
- [ ] Decisión de alojamiento (oficina + VPN, o nube) tomada por Víctor y escrita, con su coste.
- [ ] Migración final hecha y verificada, con el informe aprobado por Víctor.
- [ ] Contadores de arranque aprobados por Víctor; el primer número de cada tipo es el siguiente al último emitido.
- [ ] Compras: las cifras del sistema nuevo coinciden con las del Excel del día del corte.
- [ ] El envío a Zaragoza generado por el sistema nuevo coincide con el que se hacía desde el Excel.
- [ ] Datos de prueba eliminados o separados; ningún documento real con números de prueba.
- [ ] Plan de vuelta atrás escrito, con su criterio, y copia del HTML y del Excel del día del corte guardada aparte.
- [ ] Primera copia de seguridad real hecha, guardada fuera del servidor y **restaurada con éxito** en una base aparte.
- [ ] Avisos automáticos probados: se ha provocado cada uno (copia fallida, servidor caído) y Víctor lo ha recibido.
- [ ] Si nube: centro de datos en la UE, contrato RGPD firmado, HTTPS, doble factor o VPN, y base de datos no accesible desde internet.
- [ ] Guía entregada y revisada con Víctor y Pancho.
- [ ] Dos semanas de uso real sin tener que volver al HTML.
- [ ] HTML y Excel en solo lectura y archivados.

---

## 10. Preguntas para Víctor

- [ ] ¿Qué fecha os viene bien para el corte, y en qué momento del día?
- [x] A Zaragoza: PDF o Excel. Pendiente: un ejemplo de cada uno y la frecuencia (punto 5). ¿Se manda algo más a la asesoría o a otros?
- [x] Compras: el Excel es el correcto (punto 3).
- [ ] Oficina con VPN o nube: ¿hay algún presupuesto mensual pensado para la nube?
- [x] Avisos automáticos: pgallego@marinafisk.com (punto 7).
- [ ] ¿Quién se lleva una copia de seguridad fuera de la oficina, si el servidor se queda allí?

---

*Preparado como continuación de FASE_0 a FASE_4, para el desarrollo del sistema nuevo de MARINAFISK con Claude Code.*
