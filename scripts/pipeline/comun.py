"""
Piezas comunes del pipeline de datos del dashboard FACSECYD.

Todo criterio que cambie una cifra publicada vive aquí: el catálogo de
carreras, las combinaciones carrera + modalidad que se excluyen, el periodo
que se descarta y los umbrales de protección de datos.

Rutas:
  DATOS   carpeta con los extractos del SGA (fuera del repositorio).
          Por defecto ../Base de datos nuevas, al lado de la carpeta del repo;
          se cambia con la variable de entorno FACSECYD_DATA_DIR.
  PROC    DATOS/_procesado: bases ya filtradas, en .parquet (con microdatos:
          nunca entran al repositorio).
  SALIDA  docs/data: lo único que se publica, solo agregados.
"""
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = Path(__file__).resolve().parents[2]
DATOS = Path(os.environ.get("FACSECYD_DATA_DIR", RAIZ.parent / "Base de datos nuevas"))
PROC = DATOS / "_procesado"
SALIDA = RAIZ / "docs" / "data"

# --------------------------------------------------------------- carreras
# Las carreras NO se unifican: la versión de malla y la modalidad distinguen
# programas distintos (decisión de la Dirección, 2026-10-06). Tras excluir las
# combinaciones no vigentes, cada nombre del SGA corresponde a una sola
# modalidad, así que el nombre basta como clave.
FACULTAD = "FACSECYD"
CARRERAS = [
    # clave,   nombre en el SGA,                          nombre visible,                              modalidad
    ("ADM_L",  "ADMINISTRACION DE EMPRESAS (EN LÍNEA)",   "Administración de Empresas (en línea)",     "EN LÍNEA"),
    ("COM_L",  "COMUNICACION",                            "Comunicación (en línea)",                   "EN LÍNEA"),
    ("DER_L",  "DERECHO",                                 "Derecho (en línea)",                        "EN LÍNEA"),
    ("ECO_L",  "ECONOMIA",                                "Economía (en línea)",                       "EN LÍNEA"),
    ("PSI_L",  "PSICOLOGIA",                              "Psicología (en línea)",                     "EN LÍNEA"),
    ("TS_L",   "TRABAJO SOCIAL",                          "Trabajo Social (en línea)",                 "EN LÍNEA"),
    ("TUR_L",  "TURISMO",                                 "Turismo (en línea)",                        "EN LÍNEA"),
    # Extensión Daule: abrió en 1S-2026 (por eso tiene pocos estudiantes); se mantiene (Dirección, 2026-10-06).
    ("ADM",    "ADMINISTRACION DE EMPRESAS",              "Administración de Empresas (Daule)",        "PRESENCIAL"),
    ("ADM19",  "ADMINISTRACION DE EMPRESAS 2019",         "Administración de Empresas 2019",           "PRESENCIAL"),
    ("COM19",  "COMUNICACION 2019",                       "Comunicación 2019",                         "PRESENCIAL"),
    ("CAU19",  "CONTABILIDAD Y AUDITORIA 2019",           "Contabilidad y Auditoría 2019",             "PRESENCIAL"),
    ("ECO19",  "ECONOMIA 2019",                           "Economía 2019",                             "PRESENCIAL"),
    ("PSI19",  "LICENCIATURA EN PSICOLOGIA 2019",         "Psicología 2019",                           "PRESENCIAL"),
    ("MUL",    "MULTIMEDIA Y PRODUCCION AUDIOVISUAL",     "Multimedia y Producción Audiovisual",       "PRESENCIAL"),
    ("TUR19",  "TURISMO 2019",                            "Turismo 2019",                              "PRESENCIAL"),
    ("TS19",   "TRABAJO SOCIAL 2019",                     "Trabajo Social 2019 (semipresencial)",      "SEMIPRESENCIAL"),
]
# Duración de cada carrera en niveles (semestres), según su malla. Se usa para
# la graduación oportuna y la deserción a mitad de carrera. Una carrera que no
# esté aquí toma el nivel más alto observado en la base, con un mínimo de
# DURACION_MINIMA (las carreras nuevas aún no tienen estudiantes en los últimos
# niveles). Confirmadas por la Dirección el 2026-10-06; las demás coinciden con lo
# observado (en línea 9: Derecho, Economía, Psicología; mallas 2019 y Multimedia 8).
DURACION_NIVELES = {
    "ADM_L": 8, "ADM": 8, "COM_L": 9, "TS_L": 9, "TS19": 8, "TUR_L": 9, "TUR19": 8,
}
DURACION_MINIMA = 8
CLAVE_DE = {sga: k for k, sga, _, _ in CARRERAS}
SGA_DE = {k: sga for k, sga, _, _ in CARRERAS}
CARRERAS_K = [k for k, *_ in CARRERAS]

# Agregados: la facultad y cada modalidad (suma de sus carreras). Se calculan
# igual que la facultad: una persona que está en dos carreras cuenta una vez.
MODALIDADES = {"MOD_LIN": ("EN LÍNEA", "En línea"), "MOD_PRE": ("PRESENCIAL", "Presencial"),
               "MOD_SEM": ("SEMIPRESENCIAL", "Semipresencial")}
AGREGADOS = [FACULTAD] + list(MODALIDADES)
CLAVES = AGREGADOS + CARRERAS_K


def miembros(k):
    """Carreras que forman una clave (la facultad, una modalidad o una carrera)."""
    if k == FACULTAD:
        return CARRERAS_K
    if k in MODALIDADES:
        return [c for c, _, _, mod in CARRERAS if mod == MODALIDADES[k][0]]
    return [k]


def es_agregado(k):
    return k in AGREGADOS


def filtro(df, k, col="clave"):
    return df if k == FACULTAD else df[df[col].isin(miembros(k))]


# Nombre corto para las etiquetas de los gráficos
CORTO = {"ADM_L": "Administración (L)", "COM_L": "Comunicación (L)", "DER_L": "Derecho (L)",
         "ECO_L": "Economía (L)", "PSI_L": "Psicología (L)", "TS_L": "Trabajo Social (L)", "TUR_L": "Turismo (L)",
         "ADM": "Administración Daule", "ADM19": "Administración 2019", "COM19": "Comunicación 2019",
         "CAU19": "Contabilidad 2019", "ECO19": "Economía 2019", "PSI19": "Psicología 2019", "MUL": "Multimedia",
         "TUR19": "Turismo 2019", "TS19": "Trabajo Social 2019"}


def catalogo_carreras():
    """Lo que el tablero necesita saber de cada carrera (sin colores: los pone el tablero)."""
    return [{"k": k, "sga": sga, "nom": nom, "corto": CORTO.get(k, nom), "mod": mod,
             "sede": "Extensión Daule" if k == "ADM" else "Milagro"}
            for k, sga, nom, mod in CARRERAS]


def catalogo_modalidades():
    return [{"k": k, "mod": mod, "nom": nom, "carreras": miembros(k)} for k, (mod, nom) in MODALIDADES.items()]


# ------------------------------------------------- exclusiones (Dirección)
# Combinaciones carrera + PRESENCIAL no vigentes: misma regla que
# dashboard/Script_poblacion_general.R. La exclusión es por COMBINACIÓN:
# la misma carrera sigue vigente en otra modalidad (Turismo presencial sale,
# Turismo en línea se queda).
EXCLUIR_PRESENCIAL = {
    "COMERCIO", "COMUNICACION SOCIAL", "CONTADURIA PUBLICA Y AUDITORIA CPA",
    "DISEÑO GRAFICO Y PUBLICIDAD", "ECONOMIA", "INGENIERIA COMERCIAL",
    "INGENIERIA EN CONTADURIA PUBLICA Y AUDITORIA CPA",
    "INGENIERIA EN CONTADURIA PUBLICA Y AUDITORIA CPA9",
    "INGENIERIA EN MARKETING", "LICENCIATURA EN GESTION EMPRESARIAL",
    "MARKETING", "PSICOLOGIA", "TRABAJO SOCIAL 2019", "TURISMO",
}
# Periodo que se descarta: el remedial de abril - mayo 2021, que el SGA
# codifica como 1S-2021 y se mezclaría con el semestre regular.
PERIODO_EXCLUIDO = ("1S-2021", "ABRIL- MAYO 2021")

# Asignaturas que se excluyen de toda la base de estudiantes (Dirección, 2026-10-07):
# Inglés VI y VII de General English (carreras en línea, 2024). Son las que traen 161 registros
# de la misma asignatura dos veces en el periodo. El inglés de la malla de Turismo 2019
# (English for Tourism) se conserva. Se identifican por asignatura_id; el nombre es la referencia.
ASIGNATURAS_EXCLUIDAS = {1691: "INGLES VI (GENERAL ENGLISH)", 2070: "INGLES VII (GENERAL ENGLISH)"}

# Asignaturas registradas dos veces en el mismo periodo (misma inscripción, periodo y asignatura,
# con distinto número de matrícula o nota): la Dirección eligió qué fila conservar en cada caso
# (2026-10-07). La decisión vive en la hoja «Detalle» de este Excel, fuera del repositorio porque
# lleva identificadores de estudiantes: una fila por caso = la fila que se conserva.
DECISION_REPETIDAS = (DATOS / "Revision_asignaturas_registradas_dos_veces.xlsx", "Detalle (2 filas por caso)")

# ----------------------------------------------- protección de datos
MIN_BASE = 10   # grupos con menos personas no se publican
K_ANON = 5      # categorías con menos casos se agrupan en «Otras categorías (pocos casos)»
OTRAS = "Otras categorías (pocos casos)"

# ----------------------------------------------------------- periodos
MESES = {"ENERO": "Ene", "FEBRERO": "Feb", "MARZO": "Mar", "ABRIL": "Abr", "MAYO": "May",
         "JUNIO": "Jun", "JULIO": "Jul", "AGOSTO": "Ago", "SEPTIEMBRE": "Sep",
         "OCTUBRE": "Oct", "NOVIEMBRE": "Nov", "DICIEMBRE": "Dic"}


def etiqueta_periodo(nombre: str) -> str:
    """'NOVIEMBRE 2021 MARZO 2022' -> 'Nov 2021 – Mar 2022'; 'ABRIL - JULIO 2026' -> 'Abr – Jul 2026'."""
    toks = re.findall(r"[A-ZÁÉÍÓÚ]+|\d{4}", nombre.upper())
    partes, mes = [], None
    for t in toks:
        if t in MESES:
            if mes:
                partes.append([mes, None])
            mes = MESES[t]
        elif t.isdigit() and mes:
            partes.append([mes, t]); mes = None
    if mes:
        partes.append([mes, None])
    if len(partes) >= 2:
        (m1, a1), (m2, a2) = partes[0], partes[-1]
        a1 = a1 or a2
        return f"{m1} – {m2} {a2}" if a1 == a2 else f"{m1} {a1} – {m2} {a2}"
    return nombre.title()


def orden_periodo(cod: str) -> tuple:
    s, a = cod.split("-")
    return int(a), int(s[0])


def siguiente(cod: str, n: int = 1) -> str:
    """Código del semestre n posiciones después: 1S-2021 + 1 = 2S-2021."""
    a, s = orden_periodo(cod)
    i = a * 2 + (s - 1) + n
    return f"{i % 2 + 1}S-{i // 2}"


# ----------------------------------------------------------- utilidades
def pct(num, den, dec=1):
    return None if not den else round(100.0 * num / den, dec)


def r(x, dec=2):
    return None if x is None or pd.isna(x) else round(float(x), dec)


def por_carrera(df, col="clave"):
    """Itera (clave, subconjunto) para la facultad, cada modalidad y cada carrera."""
    for k in CLAVES:
        yield k, filtro(df, k, col)


def leer(nombre, columnas=None):
    ruta = PROC / f"{nombre}.parquet"
    if not ruta.exists():
        sys.exit(f"No existe {ruta}. Corre primero: python scripts/pipeline/01_preparar_bases.py")
    return pd.read_parquet(ruta, columns=columnas)


def estado():
    """Bitácora del paso 01 (qué bases se usaron y si alguna es provisional)."""
    ruta = PROC / "bitacora.json"
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}


def agrupar_pocos(conteos, k=K_ANON):
    """[(categoría, n), ...] -> las de menos de k casos se suman en OTRAS."""
    filas, otras = [], 0
    for cat, n in conteos:
        if n < k:
            otras += n
        else:
            filas.append([cat, int(n)])
    if otras:
        filas.append([OTRAS, int(otras)])
    return filas


PROVINCIAS = ["Azuay", "Bolívar", "Cañar", "Carchi", "Chimborazo", "Cotopaxi", "El Oro", "Esmeraldas",
              "Galápagos", "Guayas", "Imbabura", "Loja", "Los Ríos", "Manabí", "Morona Santiago", "Napo",
              "Orellana", "Pastaza", "Pichincha", "Santa Elena", "Santo Domingo de los Tsáchilas",
              "Sucumbíos", "Tungurahua", "Zamora Chinchipe"]
_SIN_TILDE = str.maketrans("ÁÉÍÓÚáéíóú", "AEIOUaeiou")
_PROV = {p.upper().translate(_SIN_TILDE): p for p in PROVINCIAS}


def provincia(prov, pais=None):
    """Nombre oficial de la provincia (el que usa el mapa); 'Exterior' si el país no es Ecuador."""
    if pais is not None and isinstance(pais, str) and pais.strip() and pais.strip().upper() != "ECUADOR":
        return "Exterior"
    if not isinstance(prov, str) or not prov.strip():
        return "No registra"
    # Con país Ecuador, una provincia que no existe en el país se trata como dato no registrado.
    return _PROV.get(prov.strip().upper().translate(_SIN_TILDE), "No registra" if pais is not None else "Exterior")


# País de procedencia: nombre del SGA (sin tildes ni espacios) -> (nombre visible, código ISO3 del mapa mundial).
_PAISES = {
    "ECUADOR": ("Ecuador", "ECU"), "ESTADOS UNIDOS": ("Estados Unidos", "USA"),
    "ESTADOS UNIDOS DE AMERICA": ("Estados Unidos", "USA"), "ESPANA": ("España", "ESP"), "CHILE": ("Chile", "CHL"),
    "COLOMBIA": ("Colombia", "COL"), "ITALIA": ("Italia", "ITA"), "PERU": ("Perú", "PER"),
    "ARGENTINA": ("Argentina", "ARG"), "MEXICO": ("México", "MEX"), "ALEMANIA": ("Alemania", "DEU"),
    "REINO UNIDO DE GRANBRETANA E IRLANDA DEL NORTE": ("Reino Unido", "GBR"), "BRASIL": ("Brasil", "BRA"),
    "VENEZUELA": ("Venezuela", "VEN"), "FRANCIA": ("Francia", "FRA"), "RUSIA": ("Rusia", "RUS"),
    "AUSTRALIA": ("Australia", "AUS"), "CANADA": ("Canadá", "CAN"), "CUBA": ("Cuba", "CUB"),
    "ARUBA": ("Aruba", "ABW"), "SUIZA": ("Suiza", "CHE"), "QATAR": ("Catar", "QAT"), "PANAMA": ("Panamá", "PAN"),
    "PAISES BAJOS": ("Países Bajos", "NLD"), "ISRAEL": ("Israel", "ISR"), "BOLIVIA": ("Bolivia", "BOL"),
    "BAHAMAS": ("Bahamas", "BHS"), "CHINA": ("China", "CHN"), "COSTA RICA": ("Costa Rica", "CRI"),
    "HONDURAS": ("Honduras", "HND"), "EL SALVADOR": ("El Salvador", "SLV"), "EGIPTO": ("Egipto", "EGY"),
    "POLONIA": ("Polonia", "POL"), "PUERTO RICO": ("Puerto Rico", "PRI"),
    "REPUBLICA DOMINICANA": ("República Dominicana", "DOM"), "TURQUIA": ("Turquía", "TUR"),
    "URUGUAY": ("Uruguay", "URY"), "PARAGUAY": ("Paraguay", "PRY"), "GUATEMALA": ("Guatemala", "GTM"),
    "NICARAGUA": ("Nicaragua", "NIC"), "PORTUGAL": ("Portugal", "PRT"), "JAPON": ("Japón", "JPN"),
}
_PAISES_SIN_ESPACIO = {k.replace(" ", ""): v for k, v in _PAISES.items()}


def pais(p):
    """Nombre visible del país ('No registra' si falta). Un país nuevo sin equivalencia queda en tipo oración."""
    if not isinstance(p, str) or not p.strip() or p.strip().upper() in ("NO REGISTRA", "\\N"):
        return "No registra"
    k = p.strip().upper().translate(_SIN_TILDE).replace("Ñ", "N")
    v = _PAISES.get(k) or _PAISES_SIN_ESPACIO.get(k.replace(" ", ""))
    return v[0] if v else p.strip().capitalize()


ISO_PAIS = {nom: iso for nom, iso in _PAISES.values()}


def tipo_oracion(s):
    """'MESTIZO/A' -> 'Mestizo/a'; 'TIEMPO COMPLETO' -> 'Tiempo completo'."""
    return s if not isinstance(s, str) else s.strip().capitalize()


def escribir_js(archivo, variable, obj, origen, descripcion):
    SALIDA.mkdir(parents=True, exist_ok=True)
    obj = {"generado": date.today().isoformat(), **obj}
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False,
                     default=lambda o: o.item() if hasattr(o, "item") else str(o))
    (SALIDA / archivo).write_text(
        f"/* Generado por scripts/pipeline/{origen} — no editar a mano. {descripcion} */\n"
        f"window.{variable}={txt};\n", encoding="utf-8")
    print(f"Escrito docs/data/{archivo} ({len(txt) / 1024:.0f} KB)")
