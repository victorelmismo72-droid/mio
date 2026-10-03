"""
Reglas de COMPRAS del Excel GESTION_CORRECTA, escritas en Python.

Es la "traducción" exacta de las fórmulas de las hojas COMPRAS, PRODUCTOS,
PRECIO MEDIO y PANEL COMPRAS (versión precio_medio_arreglado_40), para que el
sistema nuevo calcule las compras exactamente igual que el Excel.

Cada función indica la celda/fórmula del Excel que reproduce. No hay aquí ninguna
regla inventada: si el Excel hace algo raro, la función lo reproduce igual y se
señala con "OJO" en el comentario (ver ESPECIFICACION_COMPRAS_EXCEL.md).

Uso: lo importa verificar_contra_excel.py, que comprueba fila a fila que estas
funciones dan el mismo resultado que los valores guardados en el propio Excel.
"""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

VACIO = ""  # Lo que el Excel muestra como celda vacía ("")

IVA_COMPRA = 0.10      # COMPRAS!P  =O*0.1   (OJO: siempre 10 %, el Excel no distingue proveedores)
IVA_ZGZ = 1.10         # COMPRAS!M  =L*1.1
OP_PORCENTAJE = 0.02   # COMPRAS!N  =L*0.02
SUMA_PVP1 = 1.70       # PRODUCTOS!I  =ROUND(H+1.7,2)
SUMA_PVP2 = 1.90       # PRODUCTOS!J  =ROUND(H+1.9,2)


def _hay(x):
    """Equivale a la comprobación del Excel  X<>""  (el 0 SÍ cuenta como dato)."""
    return x is not None and x != VACIO


def _texto_igual(a, b):
    """Las comparaciones de texto del Excel ("=", SUMIFS, COUNTIFS) no distinguen mayúsculas."""
    if isinstance(a, str) and isinstance(b, str):
        return a.casefold() == b.casefold()
    return a == b


def _dia(x):
    if isinstance(x, datetime):
        return x.date()
    return x


def redondear_excel(x, decimales=2):
    """ROUND del Excel: redondeo "de toda la vida" (0,5 hacia arriba), no el redondeo bancario."""
    if x is None or x == VACIO:
        return VACIO
    q = Decimal(1).scaleb(-decimales)
    return float(Decimal(repr(x)).quantize(q, rounding=ROUND_HALF_UP))


# ---------------------------------------------------------------------------
# 1. Una línea de compra (hoja COMPRAS, columnas E..Q)
# ---------------------------------------------------------------------------

@dataclass
class LineaCalculada:
    proveedor: object          # E
    op2_flag: object           # F  ('S', 'N' o "")
    descripcion: object        # H
    base_zgz: object           # L
    base_zgz_iva: object       # M
    op2: object                # N
    base_real: object          # O
    iva: object                # P
    total_fact: object         # Q


def nombre_proveedor(cod_prov, proveedores):
    """E: =IF(D<>"",IFERROR(VLOOKUP(D,PROVEEDORES!$A:$B,2,0),"!COD NO ENCONTRADO"),"")

    OJO: VLOOKUP exacto distingue número de texto: 50232 (número) no encuentra "50232" (texto).
    """
    if not _hay(cod_prov):
        return VACIO
    p = proveedores.get(cod_prov)
    return p["nombre"] if p else "!COD NO ENCONTRADO"


def marca_op2(cod_prov, proveedores):
    """F: =IF(D<>"",IFERROR(VLOOKUP(D,PROVEEDORES!$A:$C,3,0),""),"")  -> 'S' / 'N' / ""

    Se consulta EN VIVO en la ficha del proveedor: si se cambia la ficha, cambian todas
    las compras de ese proveedor (también las antiguas).
    """
    if not _hay(cod_prov):
        return VACIO
    p = proveedores.get(cod_prov)
    if not p or p.get("op2") is None:
        return VACIO
    return p["op2"]


def descripcion_producto(cod_prod, productos):
    """H: =IF(G<>"",IFERROR(VLOOKUP(G,PRODUCTOS!$A:$B,2,0),"!COD NO ENCONTRADO"),"")"""
    if not _hay(cod_prod):
        return VACIO
    p = _buscar_producto(cod_prod, productos)
    return p["descripcion"] if p else "!COD NO ENCONTRADO"


def _buscar_producto(cod, productos):
    if cod in productos:
        return productos[cod]
    if isinstance(cod, str):  # VLOOKUP no distingue mayúsculas en texto
        for k, p in productos.items():
            if isinstance(k, str) and k.casefold() == cod.casefold():
                return p
    return None


def calcular_linea(cod_prov, cod_prod, kilos, eur_kg, proveedores, productos):
    """Columnas L..Q de COMPRAS, en el mismo orden y con las mismas condiciones que el Excel."""
    proveedor = nombre_proveedor(cod_prov, proveedores)
    f = marca_op2(cod_prov, proveedores)
    descripcion = descripcion_producto(cod_prod, productos)

    # L: =IF(AND(J<>"",K<>""),J*K,"")
    l = kilos * eur_kg if (_hay(kilos) and _hay(eur_kg)) else VACIO
    # M: =IF(L<>"",L*1.1,"")
    m = l * IVA_ZGZ if _hay(l) else VACIO
    # N: =IF(F="S",L*0.02,0)
    #    OJO: si el proveedor es 'S' pero aún no hay kilos/precio, el Excel da #¡VALOR!
    #    (""*0,02). Aquí se devuelve el mismo error para no ocultarlo.
    if _texto_igual(f, "S"):
        n = l * OP_PORCENTAJE if _hay(l) else "#VALUE!"
    else:
        n = 0
    # O: =IF(L<>"",L+N,"")
    o = (l + n) if _hay(l) else VACIO
    # P: =IF(O<>"",O*0.1,"")
    p = o * IVA_COMPRA if _hay(o) else VACIO
    # Q: =IF(O<>"",O+P,"")
    q = (o + p) if _hay(o) else VACIO
    return LineaCalculada(proveedor, f, descripcion, l, m, n, o, p, q)


# ---------------------------------------------------------------------------
# 2. Número de partida (hoja COMPRAS, columna W "Partida sugerida")
# ---------------------------------------------------------------------------

def partida_sugerida_excel(filas, fila_actual, cod_prov, fecha, partida_nueva, hoy):
    """W: fórmula de "Partida sugerida" CORREGIDA (archivo ..._arreglado-2.xlsx, 03/10/2026).

    =IF(D="","",IF(X="Sí",MAX(A)+1,
       IF(COUNTIFS(D,D_fila,B,fecha,A,"<>")>0,
          INDEX(A, primera fila con D=D_fila, B=fecha y partida ya escrita),
          MAX(A)+1)))
    con fecha = B de la fila, o HOY() si está vacía.

    Diferencias con la fórmula anterior (que sugería 0):
    - Solo cuenta filas que YA tienen número de partida, así que nunca se encuentra a sí misma.
    - Usa el código de proveedor real de la fila (columna D), no el del buscador (T).

    `filas` es una lista de dicts con claves 'fila', 'partida', 'cod_prov', 'fecha'
    en el orden en que están en la hoja.
    """
    if not _hay(cod_prov):
        return VACIO
    maximo = max((f["partida"] for f in filas if isinstance(f["partida"], (int, float))), default=0)
    if partida_nueva == "Sí":
        return maximo + 1
    dia = _dia(fecha) if _hay(fecha) else hoy
    for f in filas:
        if (f["cod_prov"] == cod_prov and _dia(f["fecha"]) == dia
                and isinstance(f["partida"], (int, float))):
            return f["partida"]
    return maximo + 1


def partida_correcta(partidas_grabadas, cod_prov, fecha, partida_nueva):
    """Regla de negocio que la columna W pretende aplicar (punto 22 de las correcciones):

    - Mismo proveedor y mismo día que una partida ya GRABADA -> se reutiliza ese número.
    - Si no, o si se marca "partida nueva" (p. ej. otro puerto el mismo día) -> máximo + 1.
    - Solo cuentan las partidas ya grabadas (nunca la propia línea que se está creando),
      y no importa el orden de las filas.

    `partidas_grabadas`: lista de (numero_partida, cod_prov, fecha).
    Si hay varias partidas para el mismo proveedor y día (caso "otro puerto"), se devuelve
    la más baja, que es la que el Excel encontraría primero con los datos en orden.
    """
    maximo = max((p for p, _, _ in partidas_grabadas), default=0)
    if partida_nueva:
        return maximo + 1
    mismas = [p for p, c, f in partidas_grabadas if c == cod_prov and _dia(f) == _dia(fecha)]
    return min(mismas) if mismas else maximo + 1


# ---------------------------------------------------------------------------
# 3. Coste y PVP de cada producto (hoja PRODUCTOS, columnas H, I, J, M)
# ---------------------------------------------------------------------------

def ultima_fecha_compra(cod_prod, compras):
    """M: =IF(COUNTIF(G,A)=0,"",SUMPRODUCT(MAX((G=A)*B)))"""
    fechas = [c["fecha"] for c in compras if _texto_igual(c["cod_prod"], cod_prod)]
    if not fechas:
        return VACIO
    fechas = [_dia(f) for f in fechas if _hay(f)]
    return max(fechas) if fechas else VACIO


def coste_producto(cod_prod, compras):
    """H: precio medio (base real / kilos) de ESE producto en su ÚLTIMO día de compra,
    sumando todas las compras de ese día, de todos los proveedores.

    =IF(N="","",IFERROR(SUMIFS(O,G,A,B,N)/SUMIFS(J,G,A,B,N),""))   con N = M (última fecha)
    """
    dia = ultima_fecha_compra(cod_prod, compras)
    if not _hay(dia):
        return VACIO
    del_dia = [c for c in compras if _texto_igual(c["cod_prod"], cod_prod) and _dia(c["fecha"]) == dia]
    base = sum(c["base_real"] for c in del_dia if isinstance(c["base_real"], (int, float)))
    kilos = sum(c["kilos"] for c in del_dia if isinstance(c["kilos"], (int, float)))
    if kilos == 0:
        return VACIO  # IFERROR(.../0)
    return base / kilos


def pvp(coste, suma, manual=None):
    """I/J: =IF(X<>"",X,IF(H="","",ROUND(H+1.7,2)))   (PVP2 igual con +1,9 y la columna Y)

    OJO: es una SUMA fija (coste + 1,70 / + 1,90 €/kg), no un porcentaje.
    """
    if _hay(manual):
        return manual
    if not _hay(coste):
        return VACIO
    return redondear_excel(coste + suma, 2)


# ---------------------------------------------------------------------------
# 4. Precio medio por artículo y periodo (hoja PRECIO MEDIO)
# ---------------------------------------------------------------------------

def _en_periodo(fecha, desde, hasta):
    d = _dia(fecha)
    if _hay(desde) and (not _hay(d) or d < _dia(desde)):
        return False
    if _hay(hasta) and (not _hay(d) or d > _dia(hasta)):
        return False
    return True


def precio_medio(cod_prod, compras, desde=None, hasta=None, kg_real=None):
    """PRECIO MEDIO!C,D,E,F de cada artículo:
    C total kg, D total base imp. real, E precio medio = D / (kg real si se ha escrito, si no C),
    F nº de líneas de compra.
    """
    sel = [c for c in compras if _texto_igual(c["cod_prod"], cod_prod) and _en_periodo(c["fecha"], desde, hasta)]
    kg = sum(c["kilos"] for c in sel if isinstance(c["kilos"], (int, float)))
    base = sum(c["base_real"] for c in sel if isinstance(c["base_real"], (int, float)))
    n = len(sel)
    medio = (base / (kg_real if _hay(kg_real) else kg)) if kg > 0 else VACIO
    return {"kg": kg, "base_real": base, "precio_medio": medio, "lineas": n}


# ---------------------------------------------------------------------------
# 5. Totales del PANEL COMPRAS
# ---------------------------------------------------------------------------

def totales_proveedor(cod_prov, compras, desde=None, hasta=None):
    """PANEL COMPRAS!P/Q: kilos y base imp. real (sin IVA, con OP) comprados a un proveedor."""
    sel = [c for c in compras if c["cod_prov"] == cod_prov and _en_periodo(c["fecha"], desde, hasta)]
    kg = sum(c["kilos"] for c in sel if isinstance(c["kilos"], (int, float)))
    base = sum(c["base_real"] for c in sel if isinstance(c["base_real"], (int, float)))
    return kg, base
