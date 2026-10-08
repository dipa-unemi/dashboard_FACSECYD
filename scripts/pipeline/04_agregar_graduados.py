"""
Paso 4 · Seguimiento a graduados -> docs/data/graduados-data.js (window.FACS_GRAD).

Fuente: Result_seguimiento_graduado (una fila por respuesta), cruzada con la
base de estudiantes para el sexo, el nivel socioeconómico, el año de titulación
y el universo de titulados (cobertura).

Reglas (heredadas de scripts/config_graduados.py, auditoría H-01..H-13):
  * Momento de la encuesta: PRIMERA = al titularse (1), SEGUNDA = al año (2),
    TERCERA = a los dos años (3). «T» suma los tres.
  * La pregunta se identifica por su TEXTO normalizado (el id cambia entre olas).
  * Duplicados: se quitan las repeticiones idénticas y se excluyen las
    respuestas contradictorias del mismo graduado a la misma pregunta.
  * Las versiones del cuestionario renombran alternativas: se armonizan
    (p. ej. «Empleado» = «Bajo relación de dependencia»).
  * Alto grado = 6 o 7 en la escala de 1 a 7; satisfecho = 5 a 7.

Protección de datos:
  * Categorías con menos de K_ANON respuestas se agrupan en «Otras categorías».
  * Un indicador con base menor que K_ANON publica la base pero no el numerador.
  * Los grupos (sexo, año de titulación, nivel socioeconómico) solo se publican
    con MIN_BASE respuestas o más en el año y momento.
"""
import re
import unicodedata

import pandas as pd

from comun import (FACULTAD, K_ANON, MIN_BASE, OTRAS, escribir_js, estado, filtro, leer, por_carrera, r)

g = leer("graduados")
est = leer("estudiantes", ["clave", "inscripcion_id", "sexo", "grupo_socioeconomico", "graduado", "fechagraduado"])
PROVISIONAL = bool(estado().get("bases", {}).get("estudiantes", {}).get("provisional"))


def nz(t):
    t = unicodedata.normalize("NFKD", str(t)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", t).strip().lower()


def limpio(t):
    return None if t is None or pd.isna(t) else re.sub(r"\s+", " ", str(t).replace("_x000D_", " ")).strip() or None


# ------------------------------------------------------------------ depuración
g["respuesta_texto"] = g.respuesta_texto.map(limpio)
g.loc[g.respuesta_texto.fillna("").str.upper().isin(
    {"DATO INEXACTO", "NINGUNO", "NINGUNA", "N/A", "NA", "SIN DATO", "NO APLICA", "NO REGISTRA", "-", ".", "\\N"}),
    "respuesta_texto"] = None
g["pn"] = g.pregunta.map(nz)
g["gc"] = g.grupo_competencia.map(nz)
g["anio"] = g.periodo_encuesta.str.extract(r"(\d{4})")[0].astype(int)
g["mom"] = g.periodo_encuesta.str.split().str[0].map({"PRIMERA": "1", "SEGUNDA": "2", "TERCERA": "3"})
assert g.mom.notna().all(), f"periodo de encuesta sin momento: {set(g.periodo_encuesta[g.mom.isna()])}"
clave_dup = ["persona_id", "periodo_encuesta", "pn"]
g = g[~g.duplicated(clave_dup + ["respuesta_texto", "respuesta_numerica"])]
contra = g.duplicated(clave_dup, keep=False)
print(f"Respuestas contradictorias excluidas: {int(contra.sum())} ({g.loc[contra, 'persona_id'].nunique()} graduados)")
g = g[~contra]

# ------------------------------------------------- variables del cuestionario
EQUIV = {
    "situacion_laboral": {"Bajo relación de dependencia": "Relación de dependencia", "Empleado": "Relación de dependencia",
                          "Ninguna Actividad": "Sin actividad laboral"},
    "tramo_salarial": {"1001 A 2000": "1001 a 2000", ">2000": "mayor de 2000"},
    "tipo_empresa": {"PUBLICO": "Pública", "PÚBLICA": "Pública", "PRIVADA": "Privada"},
    "rango_jerarquico": {"Directivo/Gerencial": "Directivo / gerencial", "Gerencial": "Directivo / gerencial",
                         "Supervisor/Mandos Medios": "Supervisión y mandos medios",
                         "Supervisor/Mandos Medios/Docentes": "Supervisión y mandos medios",
                         "Obrero/Operativo": "Operativo / técnico", "Operativo/Técnico": "Operativo / técnico"},
    "estudios_deseados": {"Otra licenciatura / ingeniería": "Otra licenciatura/Ingeniería",
                          "Cursos de investigación": "Cursos de Investigación"},
    "trabajo_mientras_estudiaba": {"SI": "Sí", "NO": "No"},
}
SECTOR = {  # versiones antiguas del cuestionario usaban ramas de actividad: se llevan a los tres sectores
    "Primario: agricultura, pesca, minería": "Primario: agricultura, pesca, minería",
    "Agricultura, ganadería, caza y silvicultura": "Primario: agricultura, pesca, minería",
    "Pesca": "Primario: agricultura, pesca, minería", "Explotación de minas y canteras": "Primario: agricultura, pesca, minería",
    "Secundario: sector industrial": "Secundario: sector industrial", "Industria manufacturera": "Secundario: sector industrial",
    "Construcción": "Secundario: sector industrial", "Otro": "Otro",
}
CATEGORICAS = {
    "situacion_laboral": r"sus fuentes principales de ingreso|actualmente se encuentra realizando alguna actividad",
    "tiempo_primer_empleo": r"cuanto tiempo ha tardado en encontrar su primer empleo",
    "tramo_salarial": r"en que tramo se encuentra su salario",
    "tipo_contrato": r"cual es su tipo de contrato",
    "rango_jerarquico": r"en que rango jerarquico se encuentra|indique el cargo que desempena en la empresa:",
    "sector_economico": r"sector economico",
    "tipo_empresa": r"que tipo de empresa es",
    "vinculo_empleador": r"existen vinculos entre",
    "canal_busqueda": r"canales de busqueda de empleo",
    "medio_empleo": r"a traves de que medio lo encontro",
    "estudios_deseados": r"cursar otros estudios en esta institucion|tipo de estudios le interesaria",
    "trabajo_mientras_estudiaba": r"^¿?trabajo mientras estudiaba",
}
ESCALAS = {
    "relacion_empleo": r"se relaciona su trabajo actual con los estudios|que tan relacionadas estan las actividades"
                       r"|en que grado su actividad laboral o productiva se relaciona|en que grado las actividades desarrolladas en su negocio",
    "malla": r"malla curricular de su carrera",
    "satisfaccion": r"cual es el grado de satisfaccion con los estudios realizados",
}


def tomar(patron, numerica=False):
    x = g[g.pn.str.contains(patron, regex=True)]
    col = "respuesta_numerica" if numerica else "respuesta_texto"
    x = x[x[col].notna()]
    if numerica:
        x = x[x[col].between(1, 7)]
    return x.drop_duplicates(["persona_id", "periodo_encuesta"])[["persona_id", "periodo_encuesta", col]].rename(columns={col: "v"})


po = (g.drop_duplicates(["persona_id", "periodo_encuesta"])
      [["persona_id", "inscripcion_id", "periodo_encuesta", "clave", "anio", "mom"]].set_index(["persona_id", "periodo_encuesta"]))
for var, pat in CATEGORICAS.items():
    v = tomar(pat).set_index(["persona_id", "periodo_encuesta"]).v
    v = v.replace(EQUIV.get(var, {}))
    if var == "sector_economico":
        v = v.map(lambda s: SECTOR.get(s, "Terciario: comercio y servicios"))
    po[var] = v
for var, pat in ESCALAS.items():
    po[var] = tomar(pat, numerica=True).set_index(["persona_id", "periodo_encuesta"]).v
po = po.reset_index()
po["relacion_empleo_cat"] = pd.cut(po.relacion_empleo, [0, 3, 5, 7],
                                   labels=["Baja relación (1 a 3)", "Relación media (4 y 5)", "Alta relación (6 y 7)"]).astype("string")

# Competencias: una valoración por graduado, encuesta y competencia
comp = g[g.gc.str.contains(r"competencias (?:generales|especificas)") & g.respuesta_numerica.between(1, 7)
         & ~g.pn.str.contains("identificado con unemi")].copy()
comp["tipo"] = comp.gc.str.contains("especificas").map({True: "E", False: "G"})
comp["texto"] = comp.pregunta.map(limpio)
COMPETENCIAS = sorted(comp.texto.unique())
comp["idx"] = comp.texto.map({t: i for i, t in enumerate(COMPETENCIAS)})

# ------------------------------------------------------ cruce con estudiantes
e1 = est.drop_duplicates("inscripcion_id").set_index("inscripcion_id")
po["sexo"] = po.inscripcion_id.map(e1.sexo)
po["gse"] = po.inscripcion_id.map(e1.grupo_socioeconomico)
tit = est[est.graduado == "SI"].copy()
tit["ct"] = pd.to_datetime(tit.fechagraduado, errors="coerce").dt.year
tit = tit.dropna(subset=["ct"]).drop_duplicates("inscripcion_id")
tit["ct"] = tit.ct.astype(int)
po["ct"] = po.inscripcion_id.map(tit.set_index("inscripcion_id").ct)
cruzan = po.ct.notna().mean() * 100
print(f"Encuestas cruzadas con un titulado de la base de estudiantes: {cruzan:.1f} %"
      + ("  (base de estudiantes PROVISIONAL)" if PROVISIONAL else ""))
comp = comp.merge(po[["persona_id", "periodo_encuesta", "sexo", "gse", "ct"]], on=["persona_id", "periodo_encuesta"], how="left")

# --------------------------------------------------------------- indicadores
INDICADORES = ["empleabilidad", "sin_actividad", "insercion_6m", "empleo_afin", "contrato_fijo", "salario_sobre_sbu",
               "supervision_direccion", "sector_terciario", "competencias_especificas", "competencias_generales",
               "empleador_convenio", "empleo_bolsa_unemi", "quiere_maestria", "malla_acorde", "satisfaccion_graduados"]


def par(serie, condicion):
    s = serie.dropna()
    b = len(s)
    return [b, int(condicion(s).sum()) if b >= K_ANON else None]


def fila_kpi(x, cx):
    f = [int(len(x)), int(x.persona_id.nunique())]
    f += par(x.situacion_laboral, lambda s: s != "Sin actividad laboral")
    f += par(x.situacion_laboral, lambda s: s == "Sin actividad laboral")
    f += par(x.tiempo_primer_empleo, lambda s: s == "0 a 6 meses")
    f += par(x.relacion_empleo, lambda s: s >= 6)
    f += par(x.tipo_contrato, lambda s: s == "Fijo")
    f += par(x.tramo_salarial, lambda s: s != "<=SBU")
    f += par(x.rango_jerarquico, lambda s: s.isin(["Supervisión y mandos medios", "Directivo / gerencial"]))
    f += par(x.sector_economico, lambda s: s.str.startswith("Terciario"))
    f += par(cx[cx.tipo == "E"].respuesta_numerica, lambda s: s >= 6)
    f += par(cx[cx.tipo == "G"].respuesta_numerica, lambda s: s >= 6)
    f += par(x.vinculo_empleador, lambda s: s != "Ningún tipo de convenio")
    f += par(x.medio_empleo, lambda s: s == "Bolsa trabajo UNEMI")
    f += par(x.estudios_deseados, lambda s: s == "Programa de maestría")
    f += par(x.malla, lambda s: s >= 6)
    f += par(x.satisfaccion, lambda s: s >= 5)
    return f


DIST = ["situacion_laboral", "tiempo_primer_empleo", "tramo_salarial", "tipo_contrato", "rango_jerarquico",
        "sector_economico", "tipo_empresa", "vinculo_empleador", "canal_busqueda", "medio_empleo",
        "estudios_deseados", "trabajo_mientras_estudiaba"]


def dist(x):
    out = {}
    for var in DIST + ["relacion_empleo"]:
        s = x["relacion_empleo_cat" if var == "relacion_empleo" else var].dropna()
        b = len(s)
        if b < K_ANON:
            continue
        filas, otras = [], 0
        for cat, n in s.value_counts().items():
            if n < K_ANON:
                otras += n
            else:
                filas.append([cat, int(n), b, round(100 * n / b, 2)])
        if otras:
            filas.append([OTRAS, int(otras) if otras >= K_ANON else None, b, round(100 * otras / b, 2)])
        out[var] = filas
    return out


def fila_comp(cx):
    out = []
    for (t, i), h in cx.groupby(["tipo", "idx"]):
        if len(h) >= MIN_BASE:
            alto = int((h.respuesta_numerica >= 6).sum())
            out.append([t, int(i), int(len(h)), alto, r(h.respuesta_numerica.mean()), round(100 * alto / len(h), 2)])
    return sorted(out, key=lambda z: -z[5])


GSE = ["BAJO", "MEDIO BAJO", "MEDIO TÍPICO", "MEDIO ALTO", "ALTO"]
kpi, dists, comps = {}, {}, {}


def publicar(clave, x, cx, minimo):
    for a, xa in x.groupby("anio"):
        ca = cx[cx.anio == a]
        for m in ["1", "2", "3", "T"]:
            xm = xa if m == "T" else xa[xa.mom == m]
            cm = ca if m == "T" else ca[ca.mom == m]
            if len(xm) < minimo or not len(xm):
                continue
            kpi.setdefault(clave, {}).setdefault(str(a), {})[m] = fila_kpi(xm, cm)
            dists.setdefault(clave, {}).setdefault(str(a), {})[m] = dist(xm)
            fc = fila_comp(cm)
            if fc:
                comps.setdefault(clave, {}).setdefault(str(a), {})[m] = fc


for k, x in por_carrera(po):
    cx = filtro(comp, k)
    publicar(k, x, cx, 1)
    for s in ["MUJER", "HOMBRE"]:
        publicar(f"{k}|sexo:{s}", x[x.sexo == s], cx[cx.sexo == s], MIN_BASE)
    for gs in GSE:
        publicar(f"{k}|{gs}", x[x.gse == gs], cx[cx.gse == gs], MIN_BASE)
    for ct in sorted(x.ct.dropna().unique()):
        publicar(f"{k}|cohorte_titulacion:{int(ct)}", x[x.ct == ct], cx[cx.ct == ct], MIN_BASE)

# ------------------------------------------------- cobertura del seguimiento
encuestados = set(po.inscripcion_id.dropna())
tit["enc"] = tit.inscripcion_id.isin(encuestados)
cob = {}
for k, t in por_carrera(tit):
    if len(t):
        cob[k] = [int(len(t)), int(t.enc.sum())]
    for ct, h in t.groupby("ct"):
        cob[f"{k}|cohorte_titulacion:{ct}"] = [int(len(h)), int(h.enc.sum())]
    for s, h in t.groupby("sexo"):
        if len(h) >= MIN_BASE:
            cob[f"{k}|sexo:{s}"] = [int(len(h)), int(h.enc.sum())]
    for gs, h in t.groupby("grupo_socioeconomico"):
        if len(h) >= MIN_BASE:
            cob[f"{k}|{gs}"] = [int(len(h)), int(h.enc.sum())]

escribir_js("graduados-data.js", "FACS_GRAD", {
    "minBase": MIN_BASE, "kAnon": K_ANON, "umbralAltoGrado": 6, "provisional": PROVISIONAL,
    "indicadores": INDICADORES, "competencias": COMPETENCIAS,
    "kpi": kpi, "dist": dists, "comp": comps, "cob": cob,
}, "04_agregar_graduados.py", "Solo datos agregados de las encuestas a graduados.")
print("Encuestas por año (facultad, todos los momentos):",
      {a: v["T"][0] for a, v in sorted(kpi[FACULTAD].items())})
