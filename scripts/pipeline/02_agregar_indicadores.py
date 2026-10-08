"""
Paso 2 · Indicadores de grupos de interés, investigación, vinculación y
servicios de apoyo -> docs/data/facsecyd-data.js (window.FACS_DATA).

Es la adaptación a FACSECYD de scripts/agregar_facs.py del dashboard FACS:
misma estructura de salida y mismas reglas, con estas diferencias:
  * 16 carreras (comun.CARRERAS) en vez de 2; la facultad es la clave FACSECYD.
  * Servicios de apoyo: las carreras en línea responden aspectos virtuales
    (tutorías virtuales, canales virtuales, trámites en línea, apoyo
    psicológico virtual), que se suman a los siete servicios presenciales.
  * Docentes con producción: un autor que no dictó en la carrera ese año no
    detiene el proceso; se informa y no cuenta en el porcentaje.
  * Vinculación y producción se miden de 2021 al año en curso.
  * Sin excepción para el nivel socioeconómico ALTO (era un pedido de FACS):
    todo grupo de menos de MIN_BASE personas se suprime.

Reglas que se mantienen (ver el encabezado de agregar_facs.py):
  * Satisfacción = % de valoraciones sobre el punto neutro (4-5 de 5; 5-7 de 7).
  * Toda cobertura usa la matrícula del mismo periodo regular como denominador.
  * Producción = artículos únicos aprobados y con categoría institucional.
  * Vinculación: beneficiarios PREVISTOS, no alcanzados.
"""
import re

import pandas as pd

from comun import (CLAVES, FACULTAD, MIN_BASE, catalogo_carreras, catalogo_modalidades, es_agregado, escribir_js, estado, filtro,
                   etiqueta_periodo, leer, orden_periodo, pct, por_carrera)

beca = leer("becas")
est = leer("estudiantes", ["clave", "inscripcion_id", "periodo", "periodo_codigo", "nivel", "grupo_socioeconomico"])
tut = leer("tutorias")
doc = leer("docentes", ["clave", "periodo", "periodo_codigo", "docente_id"])
prod = leer("produccion")
grad = leer("graduados")
sest = leer("sat_est")
sdoc = leer("sat_doc")
vinc = leer("vinculacion")

# Periodos regulares: los once que comparten becas, tutorías y evaluación docente.
PERIODOS = (beca[["periodo_codigo", "periodo"]].drop_duplicates()
            .assign(o=lambda d: d.periodo_codigo.map(orden_periodo)).sort_values("o"))
assert PERIODOS.periodo_codigo.is_unique, "un código de periodo con dos nombres en becas"
NOMBRE_DE = dict(zip(PERIODOS.periodo_codigo, PERIODOS.periodo))
COD_DE = dict(zip(PERIODOS.periodo, PERIODOS.periodo_codigo))
REGULARES = set(PERIODOS.periodo)


def punto(cod, v, n=None, **extra):
    d = {"p": cod, "a": orden_periodo(cod)[0], "l": etiqueta_periodo(NOMBRE_DE[cod]), "v": v}
    if n is not None:
        d["n"] = int(n)
    d.update(extra)
    return d


def punto_anio(anio, v, n=None, parcial=False, **extra):
    d = {"p": str(anio), "a": int(anio), "l": str(anio) + (" (parcial)" if parcial else ""), "v": v}
    if n is not None:
        d["n"] = int(n)
    if parcial:
        d["parcial"] = True
    d.update(extra)
    return d


# Matrícula de cada periodo regular: denominador de todas las coberturas.
# matr tiene una fila por asignatura; mu, una por estudiante y periodo.
matr = est[est.periodo.isin(REGULARES)].copy()
matr["cod"] = matr.periodo.map(COD_DE)
mu = matr.drop_duplicates(["cod", "inscripcion_id"])[["clave", "cod", "inscripcion_id", "grupo_socioeconomico"]]


def matricula_de(m):
    return {(k, c): set(g.inscripcion_id) for k, sub in por_carrera(m) for c, g in sub.groupby("cod")}


MATRICULA = matricula_de(mu)

ind, detalle = {}, {}

# =========================================================== GRUPOS DE INTERÉS
# --- Satisfacción estudiantil ------------------------------------------------
sest["cod"] = sest.periodo.map(COD_DE)
assert sest.cod.notna().all(), "satisfacción estudiantil con periodo fuera del catálogo"
glob_ = sest[sest.tipo_medicion == "GLOBAL"]
asp_ = (sest[sest.tipo_medicion != "GLOBAL"].sort_values("fecha_respuesta")
        .drop_duplicates(["persona_id", "cod", "pregunta_id"], keep="last"))
sest_d = pd.concat([glob_, asp_])

SERVICIOS = [
    # presenciales (los mismos siete de FACS)
    "CALIDAD DE TUTORÍAS ACADÉMICAS",
    "SERVICIOS DE ATENCIÓN MÉDICA, PSICOLÓGICA, ODONTOLÓGICA Y NUTRICIONAL",
    "ACOMPAÑAMIENTO Y SEGUIMIENTO INSTITUCIONAL DURANTE LAS PRÁCTICAS PRE-PROFESIONALES",
    "AGILIDAD DE LOS PROCESOS DE MATRÍCULA, HOMOLOGACIÓN Y TRÁMITES ADMINISTRATIVOS",
    "RAPIDEZ CON LA QUE LA UNIVERSIDAD RESPONDE A SUS CONSULTAS O REQUERIMIENTOS",
    "SEGURIDAD Y BIENESTAR QUE PERCIBE DENTRO DEL CAMPUS UNIVERSITARIO",
    "INSTALACIONES DEPORTIVAS DISPONIBLES PARA LOS ESTUDIANTES",
    # en línea
    "CALIDAD DE LAS TUTORÍAS ACADÉMICAS VIRTUALES",
    "ACCESO A LOS SERVICIOS DE APOYO PSICOLÓGICO, ORIENTACIÓN Y BIENESTAR ESTUDIANTIL EN MODALIDAD VIRTUAL",
    "AGILIDAD DE LOS PROCESOS INSTITUCIONALES EN LÍNEA, COMO MATRÍCULA, HOMOLOGACIÓN Y OTROS TRÁMITES",
    "EFECTIVIDAD DE LOS CANALES VIRTUALES DE ATENCIÓN INSTITUCIONAL",
]
faltan = set(SERVICIOS) - set(sest.aspecto)
assert not faltan, f"cambió el texto de algún aspecto de servicios: {faltan}"


def nombre_aspecto(a: str) -> str:
    a = a.strip().capitalize()
    return (a.replace("pre-profesionales", "preprofesionales")
             .replace("Servicios de atención médica, psicológica, odontológica y nutricional",
                      "Atención médica, psicológica, odontológica y nutricional"))


def serie_satisf(df, corte):
    out = {}
    for k, sub in por_carrera(df):
        s = []
        for c, g in sorted(sub.groupby("cod"), key=lambda x: orden_periodo(x[0])):
            univ = MATRICULA.get((k, c), set())
            s.append(punto(c, pct((g.respuesta >= corte).sum(), len(g)), g.persona_id.nunique(),
                           media=round(g.respuesta.mean(), 2), resp=int(len(g)),
                           cob=pct(len(set(g.inscripcion_id) & univ), len(univ)),
                           glob=bool((g.tipo_medicion == "GLOBAL").all())))
        out[k] = s
    return out


def detalle_aspectos(df, corte):
    out = {}
    d = df[df.tipo_medicion != "GLOBAL"]
    for k, sub in por_carrera(d):
        out[k] = {}
        for c, g in sub.groupby("cod"):
            filas = [{"a": nombre_aspecto(a), "v": pct((h.respuesta >= corte).sum(), len(h)),
                      "media": round(h.respuesta.mean(), 2), "n": int(len(h))}
                     for a, h in g.groupby("aspecto")]
            out[k][c] = sorted(filas, key=lambda r: -r["v"])
    return out


ind["sat_est"] = serie_satisf(sest_d, 4)
detalle["sat_est"] = detalle_aspectos(sest_d, 4)
serv = sest_d[sest_d.aspecto.isin(SERVICIOS)]
ind["sat_serv"] = serie_satisf(serv, 4)
detalle["sat_serv"] = detalle_aspectos(serv, 4)

# --- Satisfacción docente -------------------------------------------------------
PERIODO_SDOC = {475: "1S-2026"}
sdoc["cod"] = sdoc.periodo_id.map(PERIODO_SDOC)
assert sdoc.cod.notna().all(), f"satisfacción docente con periodo_id nuevo: {set(sdoc.periodo_id) - set(PERIODO_SDOC)}"
docp = doc[doc.periodo.isin(REGULARES)].assign(cod=lambda d: d.periodo.map(COD_DE))
DOC_PERIODO = {(k, c): set(g.docente_id.dropna()) for k, sub in por_carrera(docp) for c, g in sub.groupby("cod")}

ind["sat_doc"], detalle["sat_doc"] = {}, {}
for k, sub in por_carrera(sdoc):
    # En la facultad, quien dicta en varias carreras responde una sola vez.
    g = sub.drop_duplicates(["docente_id", "pregunta_id"]) if es_agregado(k) else sub
    s = []
    for c, h in g.groupby("cod"):
        univ = DOC_PERIODO.get((k, c), set())
        s.append(punto(c, pct((h.respuesta >= 4).sum(), len(h)), h.docente_id.nunique(),
                       media=round(h.respuesta.mean(), 2), resp=int(len(h)),
                       cob=pct(len(set(h.docente_id) & univ), len(univ))))
    ind["sat_doc"][k] = s
    detalle["sat_doc"][k] = {c: sorted([{"a": nombre_aspecto(a), "v": pct((x.respuesta >= 4).sum(), len(x)),
                                         "media": round(x.respuesta.mean(), 2), "n": int(len(x))}
                                        for a, x in h.groupby("aspecto")], key=lambda r: -r["v"])
                             for c, h in g.groupby("cod")}

# --- Satisfacción de graduados --------------------------------------------------
grad["anio"] = pd.to_numeric(grad.periodo_encuesta.str.extract(r"(\d{4})")[0], errors="coerce")
grad = grad[grad.anio.notna()].copy()
grad["anio"] = grad.anio.astype(int)
P_SAT = "¿Cuál es el grado de satisfacción con los estudios realizados?"
A1_ESCALA = {
    P_SAT: "Satisfacción con los estudios realizados",
    "¿En términos generales cuál fue el desempeño profesional de los docentes?": "Desempeño profesional de los docentes",
    "¿La malla curricular de su carrera durante su formación académica estuvo acorde a sus expectativas?": "Malla curricular acorde a sus expectativas",
    "¿Se siente orgulloso ser profesional de UNEMI?": "Orgullo de ser profesional UNEMI",
}
# La encuesta 2026 reescribió algunas preguntas (dobles espacios, «orgulloso/a»): se llevan al texto anterior.
grad["pregunta"] = (grad.pregunta.str.replace(r"\s+", " ", regex=True).str.strip()
                    .str.replace("orgulloso/a de ser", "orgulloso ser", regex=False))
assert set(A1_ESCALA) <= set(grad.pregunta), "cambió el texto de una pregunta de satisfacción de graduados"
recursos = grad.grupo_competencia.fillna("").str.contains("satisfacci[oó]n con el personal", case=False, regex=True)
g_esc = grad[(grad.pregunta.isin(A1_ESCALA) | recursos) & grad.respuesta_numerica.between(1, 7)]
# Si un graduado respondió dos olas el mismo año, cuenta su última respuesta.
g_esc = g_esc.sort_values("sagperiodo_id").drop_duplicates(["persona_id", "anio", "pregunta"], keep="last")

ind["sat_grad"], detalle["sat_grad"] = {}, {}
for k, sub in por_carrera(g_esc):
    s, det = [], {}
    for a, h in sub.groupby("anio"):
        p = h[h.pregunta == P_SAT]
        if len(p):
            s.append(punto_anio(a, pct((p.respuesta_numerica >= 5).sum(), len(p)), p.persona_id.nunique(),
                                media=round(p.respuesta_numerica.mean(), 2)))
        filas = []
        for q, x in h.groupby("pregunta"):
            nom = A1_ESCALA.get(q, q.strip().rstrip(".").replace("En lo administrativo, el", "El")
                                .replace("En general, los", "Los"))
            filas.append({"a": nom[0].upper() + nom[1:], "v": pct((x.respuesta_numerica >= 5).sum(), len(x)),
                          "media": round(x.respuesta_numerica.mean(), 2), "n": int(len(x)),
                          "g": "formacion" if q in A1_ESCALA else "recursos"})
        det[str(a)] = sorted(filas, key=lambda r: -r["v"])
    ind["sat_grad"][k], detalle["sat_grad"][k] = s, det

# ================================================================ INVESTIGACIÓN
prod_ok = prod[(prod.aprobado == "SI") & (prod.nivel_nombre != "SIN CATEGORÍA")].copy()
ANIO_ACTUAL = int(prod.fechapublicacion.astype(str).str[:4].max())
ANIOS = list(range(2021, ANIO_ACTUAL + 1))
NIVEL_GRUPO = {"CIENTÍFICO NIVEL I": "Científico (Scopus / WoS)", "CIENTÍFICO NIVEL II": "Científico (Scopus / WoS)",
               "REGIONAL": "Regional (Latindex)", "DIVULGATIVO": "Divulgativo y memorias",
               "PROCEEDING": "Divulgativo y memorias"}
assert set(prod_ok.nivel_nombre) <= set(NIVEL_GRUPO), set(prod_ok.nivel_nombre) - set(NIVEL_GRUPO)
prod_ok["grupo"] = prod_ok.nivel_nombre.map(NIVEL_GRUPO)
prod_ok["anio"] = pd.to_numeric(prod_ok.anio, errors="coerce")


def anios_de(nombre):
    a = [int(x) for x in re.findall(r"\d{4}", nombre)]
    return range(min(a), max(a) + 1)


# Docentes que dictaron en la carrera cada año (un periodo cuenta para los años que abarca).
NO_LECTIVOS = r"REMEDIAL|PLANIFICACI|PRUEBA|ESPECIAL|M[ÓO]DULOS"
doc_lect = doc[~doc.periodo.str.upper().str.contains(NO_LECTIVOS)].dropna(subset=["docente_id"])
doc_anio = pd.DataFrame([(r.clave, a, int(r.docente_id))
                         for r in doc_lect.drop_duplicates(["clave", "periodo", "docente_id"]).itertuples()
                         for a in anios_de(r.periodo)], columns=["clave", "anio", "docente_id"]).drop_duplicates()

CL_PROD = ["pub_total", "pub_alto", "pub_q12", "pub_est", "pub_proy", "doc_prod"]
for c in CL_PROD:
    ind[c] = {}
detalle["pub_nivel"], detalle["pub_cuartil"] = {}, {}
fuera_planta = {}
for k, sub in por_carrera(prod_ok):
    u = sub.drop_duplicates("articulo_id")
    dpa = filtro(doc_anio, k)
    s = {c: [] for c in CL_PROD}
    niv, cua = {}, {}
    for a in ANIOS:
        x, parc = u[u.anio == a], a == ANIO_ACTUAL
        n = len(x)
        s["pub_total"].append(punto_anio(a, n, parcial=parc))
        alto = int((x.grupo == "Científico (Scopus / WoS)").sum())
        s["pub_alto"].append(punto_anio(a, pct(alto, n), n, parcial=parc, num=alto))
        s["pub_q12"].append(punto_anio(a, int(x.cuartil.isin(["Q1", "Q2"]).sum()), parcial=parc))
        ce = int((pd.to_numeric(x.autores_estudiantes, errors="coerce") > 0).sum())
        s["pub_est"].append(punto_anio(a, pct(ce, n), n, parcial=parc, num=ce))
        s["pub_proy"].append(punto_anio(a, int((x.proviene_proyecto == "SI").sum()), parcial=parc))
        univ = set(dpa[dpa.anio == a].docente_id)
        autores = set(sub[sub.anio == a].docente_id.dropna().astype(int))
        if autores - univ:
            fuera_planta[f"{k} {a}"] = len(autores - univ)
        s["doc_prod"].append(punto_anio(a, pct(len(autores & univ), len(univ)), len(univ), parcial=parc,
                                        num=len(autores & univ)))
        niv[str(a)] = {g: int((x.grupo == g).sum()) for g in dict.fromkeys(NIVEL_GRUPO.values())}
        cua[str(a)] = {q: int((x.cuartil == q).sum()) for q in ["Q1", "Q2", "Q3", "Q4"]}
    for c in s:
        ind[c][k] = s[c]
    detalle["pub_nivel"][k], detalle["pub_cuartil"][k] = niv, cua
if fuera_planta:
    print("Aviso: autores que no dictaron en la carrera ese año (no cuentan en doc_prod):", fuera_planta)

# ================================================================== VINCULACIÓN
PROPIOS = ["Milagro", "Ecuador", "Guayas", "Naranjito", "Yaguachi", "Marcelino Maridueña", "Simón Bolívar",
           "El Triunfo", "Bucay", "Durán", "Guayaquil", "UNEMI", "GAD", "Cdla.", "CDI", "MIES", "ONG"]


def nombre_proyecto(t):
    t = re.sub(r"\s+", " ", str(t).strip()).capitalize()
    for p in PROPIOS:
        t = re.sub(r"\b" + re.escape(p.lower()) + r"(?=\W|$)", p, t)
    return t


EJECUTADOS = {"APROBADO / EN EJECUCION", "FINALIZADO", "CERRADO"}
vx = vinc[vinc.estado_proyecto.isin(EJECUTADOS)].copy()
fin = pd.to_datetime(vx.fechareal, errors="coerce").dt.year
vx["anio_fin"] = fin.fillna(vx.anio_inicio.where(vx.estado_proyecto != "APROBADO / EN EJECUCION", ANIO_ACTUAL)).astype(int)
vx["electoral"] = vx.proyecto.str.contains("JUNTAS RECEPTORAS DEL VOTO", case=False)
CL_VIN = ["vin_proy", "vin_benef", "vin_avance", "vin_est", "vin_culm", "vin_doc"]
for c in CL_VIN:
    ind[c] = {}
detalle["vin_estado"], detalle["vin_proyectos"] = {}, {}
for k, sub in por_carrera(vx):
    up = sub.drop_duplicates("proyecto_id")
    s = {c: [] for c in CL_VIN}
    for a in ANIOS:
        x, xp, parc = sub[sub.anio_inicio == a], up[up.anio_inicio == a], a == ANIO_ACTUAL
        activos = up[(up.anio_inicio <= a) & (up.anio_fin >= a) & ~up.electoral]
        s["vin_proy"].append(punto_anio(a, int(len(activos)), parcial=parc))
        s["vin_benef"].append(punto_anio(a, int(xp.benef_directos_personas.sum()), parcial=parc))
        con = xp[xp.avance_pct.notna() & xp.estado_proyecto.isin(["FINALIZADO", "CERRADO"])]
        s["vin_avance"].append(punto_anio(a, round(con.avance_pct.mean(), 1) if len(con) else None, len(con), parcial=parc))
        s["vin_est"].append(punto_anio(a, int(x.estudiantes.sum()), parcial=parc))
        cerr = x.est_culminados.sum() + x.est_retirados.sum() + x.est_reprobados.sum()
        s["vin_culm"].append(punto_anio(a, pct(x.est_culminados.sum(), cerr), cerr, parcial=parc))
        s["vin_doc"].append(punto_anio(a, int(x.docentes.sum()), parcial=parc))
    for c in s:
        ind[c][k] = s[c]
    todos = filtro(vinc, k)
    detalle["vin_estado"][k] = todos.drop_duplicates("proyecto_id").estado_proyecto.value_counts().to_dict()
    filas = []
    for r in sub[~sub.electoral & (sub.anio_fin >= ANIOS[0])].sort_values(["anio_inicio", "proyecto"], ascending=[False, True]).itertuples():
        filas.append({"nom": nombre_proyecto(r.proyecto), "a": int(r.anio_inicio), "f": int(r.anio_fin),
                      "car": r.clave, "estado": r.estado_proyecto.title().replace(" / En Ejecucion", " / en ejecución"),
                      "av": None if pd.isna(r.avance_pct) else round(float(r.avance_pct), 1),
                      "ben": int(r.benef_directos_personas), "est": int(r.estudiantes),
                      "doc": int(r.docentes), "id": int(r.proyecto_id)})
    if es_agregado(k):  # un proyecto compartido aparece una sola vez, con todas sus carreras
        vistos = {}
        for f in filas:
            if f["id"] in vistos:
                v = vistos[f["id"]]
                v["car"] += "+" + f["car"]; v["est"] += f["est"]; v["doc"] += f["doc"]
            else:
                vistos[f["id"]] = f
        filas = list(vistos.values())
    for f in filas:
        f.pop("id")
    detalle["vin_proyectos"][k] = filas

# ============================================================ SERVICIOS DE APOYO
tut["cod"] = tut.periodo.map(COD_DE)
assert tut.cod.notna().all(), "tutorías con periodo fuera del catálogo"
beca["cod"] = beca.periodo.map(COD_DE)


VACIO_T, VACIO_B = tut.iloc[:0], beca.iloc[:0]
GSE_DE_INS = mu.set_index(["cod", "inscripcion_id"]).grupo_socioeconomico


def bloque_apoyo(tut, beca):
    res = {c: {} for c in ["tut_cob", "tut_int", "tut_ejec", "beca_cob"]}
    det = {"beca_tipo": {}, "beca_gse": {}}
    for k in CLAVES:
        # Se parte una sola vez por periodo dentro de cada clave (facultad, modalidad o carrera).
        tc, bc = dict(tuple(filtro(tut, k).groupby("cod"))), dict(tuple(filtro(beca, k).groupby("cod")))
        sc, si, se, sb, tipo, gse = [], [], [], [], {}, {}
        for c in PERIODOS.periodo_codigo:
            univ = MATRICULA.get((k, c), set())
            x, b = tc.get(c, VACIO_T), bc.get(c, VACIO_B)
            hechas = x[(x.estado == "EJECUTADO") & (x.asistio_tutoria == "SI") & x.inscripcion_id.isin(univ)]
            aten = hechas.inscripcion_id.nunique()
            sc.append(punto(c, pct(aten, len(univ)), len(univ), num=int(aten)))
            si.append(punto(c, round(len(hechas) / aten, 1) if aten else None, aten))
            cerradas = x.estado.isin(["EJECUTADO", "CANCELADO"]).sum()
            se.append(punto(c, pct((x.estado == "EJECUTADO").sum(), cerradas), cerradas))
            y = b[b.inscripcion_id.isin(univ)]
            becarios = set(y.inscripcion_id)
            sb.append(punto(c, pct(len(becarios), len(univ)), len(univ), num=len(becarios)))
            tipo[c] = y.drop_duplicates(["inscripcion_id", "tipo_beca_corto"]).tipo_beca_corto.value_counts().to_dict()
            m = pd.DataFrame({"inscripcion_id": list(univ)})
            m["grupo_socioeconomico"] = GSE_DE_INS.reindex(pd.MultiIndex.from_product([[c], m.inscripcion_id])).values
            m["beca"] = m.inscripcion_id.isin(becarios)
            gse[c] = {g: {"v": pct(h.beca.sum(), len(h)), "n": int(len(h))}
                      for g, h in m.groupby("grupo_socioeconomico") if len(h) >= MIN_BASE}
        res["tut_cob"][k], res["tut_int"][k], res["tut_ejec"][k], res["beca_cob"][k] = sc, si, se, sb
        det["beca_tipo"][k], det["beca_gse"][k] = tipo, gse
    return res, det


_r, _d = bloque_apoyo(tut, beca)
ind.update(_r)
detalle.update(_d)

# ============================== FILTRO CRUZADO · NIVEL SOCIOECONÓMICO Y NIVEL
GSE = ["BAJO", "MEDIO BAJO", "MEDIO TÍPICO", "MEDIO ALTO", "ALTO"]
gse_de = GSE_DE_INS.to_dict()

# Nivel de cada estudiante en cada periodo: donde cursa la mayoría de sus materias (empate: el más alto).
matr["niv"] = matr.nivel.str.extract(r"(\d+)")[0].astype(int)
_cnt = matr.groupby(["cod", "inscripcion_id", "niv"]).size().reset_index(name="m")
_cnt = _cnt.sort_values(["cod", "inscripcion_id", "m", "niv"]).drop_duplicates(["cod", "inscripcion_id"], keep="last")
niv_de = {(c, i): f"N{n}" for c, i, n in zip(_cnt.cod, _cnt.inscripcion_id, _cnt.niv)}
NIVELES = [f"N{n}" for n in sorted(_cnt.niv.unique())]


def con_dim(df, mapa):
    return df.assign(dim=[mapa.get(x) for x in zip(df.cod, df.inscripcion_id)])


def desglosar(mapa, valores):
    """Recalcula los indicadores de estudiantes dentro de cada valor de una dimensión y
    los publica como «CARRERA|VALOR»; las celdas de menos de MIN_BASE personas se vacían."""
    global MATRICULA
    se, sv, tu, be, md = (con_dim(x, mapa) for x in (sest_d, serv, tut, beca, mu))
    toda = MATRICULA
    for g in valores:
        MATRICULA = matricula_de(md[md.dim == g])
        partes = {"sat_est": serie_satisf(se[se.dim == g], 4), "sat_serv": serie_satisf(sv[sv.dim == g], 4)}
        _r, _d = bloque_apoyo(tu[tu.dim == g], be[be.dim == g])
        partes.update(_r)
        for k, porper in _d["beca_tipo"].items():
            detalle["beca_tipo"][f"{k}|{g}"] = porper
        dets = {"sat_est": detalle_aspectos(se[se.dim == g], 4), "sat_serv": detalle_aspectos(sv[sv.dim == g], 4)}
        for clave, porcar in partes.items():
            for k, s in porcar.items():
                for p in s:
                    base = p.get("n")
                    if base is None or base < MIN_BASE:
                        for campo in ("v", "n", "num", "cob", "media", "resp"):
                            p.pop(campo, None)
                        p["v"] = None
                ind[clave][f"{k}|{g}"] = s
        for clave, porcar in dets.items():
            for k, porper in porcar.items():
                detalle[clave][f"{k}|{g}"] = {c: [r for r in filas if r["n"] >= MIN_BASE] for c, filas in porper.items()}
    MATRICULA = toda


desglosar(gse_de, GSE)
desglosar(niv_de, NIVELES)

detalle["tut_niv"] = {k: {} for k in CLAVES}
for k in CLAVES:
    for g in NIVELES:
        for p in ind["tut_cob"][f"{k}|{g}"]:
            if p["v"] is not None:
                detalle["tut_niv"][k].setdefault(p["p"], {})[g] = {"v": p["v"], "n": p["n"]}

# Tipos de beca con menos de 5 beneficiarios no se publican con su número.
for porper in detalle["beca_tipo"].values():
    for tipos in porper.values():
        for t, v in tipos.items():
            if v < 5:
                tipos[t] = None

detalle["sat_gse"] = {k: {} for k in CLAVES}
for k in CLAVES:
    for g in GSE:
        for p in ind["sat_est"][f"{k}|{g}"]:
            if p["v"] is not None:
                detalle["sat_gse"][k].setdefault(p["p"], {})[g] = {"v": p["v"], "n": p["n"]}

# ===================================================================== salida
bit = estado().get("bases", {})
escribir_js("facsecyd-data.js", "FACS_DATA", {
    "actualizado": bit.get("becas", {}).get("generado") or estado().get("generado", "")[:10],
    "facultad": FACULTAD,
    "carreras": catalogo_carreras(),
    "modalidades": catalogo_modalidades(),
    "provisional": {"estudiantes": bool(bit.get("estudiantes", {}).get("provisional"))},
    "anioActual": ANIO_ACTUAL,
    "periodos": [{"p": c, "a": orden_periodo(c)[0], "l": etiqueta_periodo(n)}
                 for c, n in zip(PERIODOS.periodo_codigo, PERIODOS.periodo)],
    "matricula": {k: [punto(c, len(MATRICULA.get((k, c), set()))) for c in PERIODOS.periodo_codigo] for k in CLAVES},
    "ind": ind,
    "det": detalle,
}, "02_agregar_indicadores.py", "Solo datos agregados por carrera y periodo.")
