"""
Paso 3 · Cuerpo docente -> docs/data/docentes-data.js (window.FACS_DOC).

Fuentes: distributivo (Result_docente: quién dicta en cada carrera y periodo,
dedicación, categoría y datos demográficos) y evaluación del desempeño
(Result_desepeno_docente: títulos, evaluación integral, capacitación y experiencia).

Unidad: docente único por carrera y AÑO (los dos semestres del año). En la
facultad, quien dicta en varias carreras cuenta una vez. El año en curso
(solo 1S) se marca como parcial.

Criterios:
  * Nivel académico = título más alto registrado en el SGA hasta ese año:
    PhD > Maestría > Especialidad > Diplomado u otro posgrado sin grado (cuarto
    nivel sin título de maestría, PhD ni especialidad) > Tercer nivel > Sin registro.
  * Dedicación, categoría y demografía: las del último periodo del año.
  * Evaluación satisfactoria: promedio de los resultados totales del docente en
    el año >= 4,0 (escala 1 a 5). Desde 2025 la escala cambia (corte en el catálogo).
  * Capacitación: al menos un curso en los 12 meses previos a algún periodo del año.
  * Criterio ACBSP provisional: PhD = académicamente cualificado; maestría o
    especialidad con >= 3 años de experiencia profesional externa = profesionalmente
    cualificado; el resto, aún no cumple.
  * Categorías con menos de K_ANON docentes se agrupan; la evaluación por
    componente solo se publica con MIN_BASE docentes evaluados o más.
"""
import pandas as pd

from comun import (FACULTAD, K_ANON, MIN_BASE, agrupar_pocos, escribir_js, filtro, leer,
                   orden_periodo, pct, por_carrera, provincia, r, tipo_oracion)

UMBRAL_EVAL = 4.0
EXP_MIN = 3

doc = leer("docentes")
des = leer("desempeno")

doc["anio"] = doc.periodo_codigo.str[-4:].astype(int)
doc["ord"] = doc.periodo_codigo.map(lambda c: orden_periodo(c))
COD_DE = dict(zip(doc.periodo, doc.periodo_codigo))
des["cod"] = des.periodo.map(COD_DE)
assert des.cod.notna().all(), f"periodos de desempeño sin código: {set(des.periodo[des.cod.isna()])}"
des["anio"] = des.cod.str[-4:].astype(int)
ANIO_PARCIAL = int(doc.anio.max()) if doc[doc.anio == doc.anio.max()].periodo_codigo.nunique() == 1 else None
ANIOS = sorted(doc.anio.unique())

# ------------------------------------------------ título más alto por docente y año
ORDEN_NIV = ["PhD", "Maestría", "Especialidad", "Diplomado u otro posgrado sin grado", "Tercer nivel", "Sin registro"]


def nivel_fila(x):
    if x.titulos_phd > 0:
        return 0
    if x.titulos_maestria > 0:
        return 1
    if x.titulos_especialista > 0:
        return 2
    t = str(x.titulo_nivel or "").upper()
    if "CUARTO" in t or "MAESTR" in t:
        return 3
    if "TERCER" in t or "TECNICO" in t:
        return 4
    return 5


des["niv"] = [nivel_fila(x) for x in des.itertuples()]
# El título no se pierde: en cada año vale el mejor registrado hasta ese año; si el
# docente aún no tiene registro ese año, el primero que tenga.
niv_anio = des.groupby(["docente_id", "anio"]).niv.min().reset_index()
mejor = {}
for d, g in niv_anio.sort_values("anio").groupby("docente_id"):
    acc, primero = 5, g.niv.iloc[0]
    for a in ANIOS:
        hasta = g[g.anio <= a]
        mejor[(d, a)] = hasta.niv.min() if len(hasta) else primero
exp_ext = des.groupby("docente_id").exp_anios_externa_sumada.max()

# ------------------------------------------------ atributos del último periodo del año
ult = (doc.sort_values("ord").drop_duplicates(["docente_id", "anio"], keep="last")
       .set_index(["docente_id", "anio"]))

# Evaluación y capacitación por docente y año (en la facultad se promedian todas sus carreras)
COMP = {"total": "resultado_total", "hetero": "promedio_docencia_hetero", "auto": "promedio_docencia_auto",
        "par": "promedio_docencia_par", "directivo": "promedio_docencia_directivo"}


def eval_cap(sub):
    ev = sub[sub.resultado_total.notna()].groupby(["docente_id", "anio"])[list(COMP.values())].mean()
    cap = sub.groupby(["docente_id", "anio"]).agg(cursos=("hv_cursos_12m", "max"), ped=("hv_pedagogicas_12m", "max"),
                                                  cien=("hv_cientificas_12m", "max"), horas=("hv_horas_12m", "max"))
    return ev, cap


EDAD = [(0, 29, "Menos de 30"), (30, 39, "30 a 39"), (40, 49, "40 a 49"), (50, 59, "50 a 59"), (60, 120, "60 o más")]


def edad_banda(e):
    if pd.isna(e) or e < 20:
        return "Sin dato válido"
    return next(lbl for lo, hi, lbl in EDAD if lo <= e <= hi)


def conteo(serie, orden=None):
    vc = serie.value_counts()
    filas = [(k, int(vc[k])) for k in (orden or vc.index) if k in vc]
    return filas


ind = {c: {} for c in ["doc_n", "doc_phd", "doc_maest", "doc_cuarto", "doc_tc", "doc_eval", "doc_evalcob",
                       "doc_cap", "doc_acbsp", "doc_carga"]}
det = {}


def pt(a, v, n, **extra):
    return {"p": str(a), "a": int(a), "l": str(a), "v": v, "n": int(n), "parcial": a == ANIO_PARCIAL, **extra}


for k, sub in por_carrera(doc):
    dsub = filtro(des, k)
    ev, cap = eval_cap(dsub)
    det[k] = {}
    for c in ind:
        ind[c][k] = []
    for a in ANIOS:
        ids = sorted(set(sub[sub.anio == a].docente_id.dropna()))
        n = len(ids)
        if not n:
            continue
        niv = pd.Series([ORDEN_NIV[mejor.get((d, a), 5)] for d in ids])
        at = ult.loc[[(d, a) for d in ids]]
        # carga: estudiantes en las asignaturas del docente, promedio de los periodos del año
        carga = (sub[sub.anio == a].groupby(["periodo_codigo", "docente_id"]).total_estudiantes.sum()
                 .groupby("periodo_codigo").mean().mean())
        evy = ev.loc[[i for i in ((d, a) for d in ids) if i in ev.index]]
        capy = cap.reindex([(d, a) for d in ids])
        con_curso = capy.cursos.fillna(0) > 0
        phd, mae, esp = (niv == "PhD").sum(), (niv == "Maestría").sum(), (niv == "Especialidad").sum()
        exp = exp_ext.reindex(ids).fillna(0).values
        acbsp = pd.Series(["Académicamente cualificado (PhD)" if nv == "PhD"
                           else "Profesionalmente cualificado" if nv in ("Maestría", "Especialidad") and x >= EXP_MIN
                           else "Aún no cumple el criterio provisional" for nv, x in zip(niv, exp)])
        ind["doc_n"][k].append(pt(a, n, n))
        ind["doc_phd"][k].append(pt(a, pct(phd, n), n, num=int(phd)))
        ind["doc_maest"][k].append(pt(a, pct(mae, n), n, num=int(mae)))
        ind["doc_cuarto"][k].append(pt(a, pct(phd + mae + esp, n), n, num=int(phd + mae + esp)))
        tc = int((at.docente_dedicacion == "TIEMPO COMPLETO").sum())
        ind["doc_tc"][k].append(pt(a, pct(tc, n), n, num=tc))
        if len(evy):
            ok = int((evy.resultado_total >= UMBRAL_EVAL).sum())
            ind["doc_eval"][k].append(pt(a, pct(ok, len(evy)), len(evy), num=ok))
        ind["doc_evalcob"][k].append(pt(a, pct(len(evy), n), n, num=len(evy)))
        ind["doc_cap"][k].append(pt(a, pct(int(con_curso.sum()), n), n, num=int(con_curso.sum())))
        q = int((acbsp != "Aún no cumple el criterio provisional").sum())
        ind["doc_acbsp"][k].append(pt(a, pct(q, n), n, num=q))
        ind["doc_carga"][k].append(pt(a, r(carga, 1), n))

        disc = at.docente_discapacidad.fillna("SIN DISCAPACIDAD")
        det[k][str(a)] = {
            "nivel": conteo(niv, ORDEN_NIV),
            "dedicacion": conteo(at.docente_dedicacion.fillna("SIN REGISTRO").map(tipo_oracion)),
            "categoria": agrupar_pocos(conteo(at.docente_categoria.fillna("SIN REGISTRO").map(tipo_oracion))),
            "acbsp": conteo(acbsp, ["Académicamente cualificado (PhD)", "Profesionalmente cualificado",
                                    "Aún no cumple el criterio provisional"]),
            "sexo": conteo(at.docente_sexo.map({"MUJER": "Mujer", "HOMBRE": "Hombre"}).fillna("Sin registro")),
            "edad": conteo(at.docente_edad.map(edad_banda), [e[2] for e in EDAD] + ["Sin dato válido"]),
            "etnia": agrupar_pocos(conteo(at.docente_etnia.fillna("NO REGISTRA").map(tipo_oracion))),
            "disc": conteo(disc.map(lambda x: "Sin discapacidad" if x == "SIN DISCAPACIDAD" else "Con discapacidad"),
                           ["Con discapacidad", "Sin discapacidad"]),
            "disc_tipo": agrupar_pocos(conteo(disc[disc != "SIN DISCAPACIDAD"].map(tipo_oracion))),
            "provincia": conteo(pd.Series([provincia(p, pa) for p, pa in zip(at.docente_provincia, at.docente_pais)])),
            "eval": ({"n": len(evy), **{c: r(evy[col].mean()) for c, col in COMP.items()}}
                     if len(evy) >= MIN_BASE else None),
            "cap": {"n": n, "ped": int((capy.ped.fillna(0) > 0).sum()), "cien": int((capy.cien.fillna(0) > 0).sum()),
                    "horas": r(capy.horas[con_curso.values].mean(), 1) if con_curso.any() else None},
        }

escribir_js("docentes-data.js", "FACS_DOC", {
    "umbralEval": UMBRAL_EVAL, "expMin": EXP_MIN, "minBase": MIN_BASE, "kAnon": K_ANON,
    "anioParcial": ANIO_PARCIAL, "ind": ind, "det": det,
}, "03_agregar_docentes.py", "Solo datos agregados de docentes.")
print("Docentes por año (facultad):", {p["a"]: p["v"] for p in ind["doc_n"][FACULTAD]})
