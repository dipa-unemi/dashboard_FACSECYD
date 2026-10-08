"""
Paso 5 · Estudiantes -> docs/data/trayectoria-data.js (FACS_TRAY),
                        docs/data/perfil-data.js (FACS_PERFIL),
                        docs/data/rendimiento-data.js (FACS_REND).

Fuente: Result_estudiante (una fila por estudiante, periodo y asignatura).
Unidad «estudiante» = inscripción en la carrera (inscripcion_id).

Trayectoria (definiciones del catálogo de indicadores de FACS):
  * Tipo de ingreso en cada periodo: nuevo ingreso (es su periodo de primer
    nivel), continuidad (estuvo matriculado el periodo anterior) o reingreso.
  * Retención: de los matriculados en t (sin quienes se titulan en t ni cursan
    el último nivel), % que se matricula en t+1 o se titula. Se suma por año.
  * Cohortes: solo las que ingresaron desde el primer periodo de la base
    (1S-2021); de las anteriores no se conoce cuántos ingresaron.
  * Retención de primer año: sigue matriculada (o titulada) dos semestres después.
  * Deserción a mitad de carrera (Modelo genérico de evaluación): % de la
    cohorte que no estaba matriculada ni titulada en Ai+δ, δ = la mitad de los
    niveles de la carrera (redondeada hacia abajo).
  * Graduación oportuna: titulados hasta duración + un año (2 semestres); la
    ventana se considera cerrada solo si ese plazo ya pasó.
  La duración de cada carrera es el nivel más alto observado en la base.

Rendimiento: evaluaciones válidas = asignaturas con estado final APROBADO o
REPROBADO (no EN CURSO). Escala institucional (Art. 75): Reprobado < 70,
Aprobado 70-79, Bueno 80-89, Muy Bueno 90-94, Excelente 95-100.
Asistencia mínima (presencial y semipresencial): 70 % hasta 2S-2024 y 60 % desde 1S-2025
(Art. 77); el «% bajo el umbral» de cada periodo usa el umbral vigente en ese periodo.

Protección de datos: los grupos con menos de MIN_BASE estudiantes no se
publican en trayectoria ni en rendimiento. El perfil publica conteos por
combinación de características sin umbral (mismo criterio que FACS: decisión
de la Dirección); el tablero lo advierte.
"""
import numpy as np
import pandas as pd

from comun import (CARRERAS, CARRERAS_K, DURACION_MINIMA, DURACION_NIVELES, FACULTAD, K_ANON, MIN_BASE,
                   ISO_PAIS, MODALIDADES, escribir_js, pais as pais_nombre, por_carrera,
                   estado, leer, orden_periodo, pct, provincia)

est = leer("estudiantes")
PROVISIONAL = bool(estado().get("bases", {}).get("estudiantes", {}).get("provisional"))
est = est.rename(columns={"inscripcion_id": "ins", "periodo_codigo": "cod"})
est["niv"] = est.nivel.str.extract(r"(\d+)")[0].astype(int)
PERIODOS = sorted(est.cod.unique(), key=orden_periodo)
ULTIMO = PERIODOS[-1]
IDX = {c: i for i, c in enumerate(PERIODOS)}
ANIO_ACTUAL = orden_periodo(ULTIMO)[0]
GSE = ["BAJO", "MEDIO BAJO", "MEDIO TÍPICO", "MEDIO ALTO", "ALTO"]
DURACION = {k: DURACION_NIVELES.get(k, max(int(n), DURACION_MINIMA))
            for k, n in est.groupby("clave").niv.max().items()}


def idx(c):
    """Posición absoluta de un semestre (permite cohortes anteriores a la base)."""
    a, s = orden_periodo(c)
    return a * 2 + s - 1


# ===================================================== estudiante por periodo
# Nivel del estudiante en el periodo: donde cursa más asignaturas (empate: el más alto).
sp = (est.groupby(["clave", "ins", "cod", "niv"]).size().reset_index(name="m")
      .sort_values(["ins", "cod", "m", "niv"]).drop_duplicates(["clave", "ins", "cod"], keep="last")
      .drop(columns="m").reset_index(drop=True))
attrs = est.drop_duplicates("ins").set_index("ins")
for c in ["sexo", "grupo_socioeconomico", "etnia", "periodo_primer_nivel_codigo", "graduado", "periodo_graduacion_codigo"]:
    sp[c] = sp.ins.map(attrs[c])
sp["i"] = sp.cod.map(idx)
sp["coh"] = sp.periodo_primer_nivel_codigo
sp["gi"] = sp.periodo_graduacion_codigo.where(sp.graduado == "SI").map(lambda c: idx(c) if isinstance(c, str) and "-" in c else np.nan)
sp["dur"] = sp.clave.map(DURACION)
presentes = set(zip(sp.ins, sp.i))
anterior = set((s, i + 1) for s, i in presentes)
sp["tipo_ingreso"] = np.where(sp.cod == sp.coh, "Nuevo ingreso",
                              np.where(np.array([(s, i) in anterior for s, i in zip(sp.ins, sp.i)]) | (sp.cod == PERIODOS[0]).values,
                                       "Continuidad", "Reingreso"))
sp["sig"] = [(s, i + 1) in presentes for s, i in zip(sp.ins, sp.i)]
sp["anio"] = sp.cod.str[-4:].astype(int)
ULT_I = idx(ULTIMO)


def dims_tray(df):
    """(sufijo de clave, subconjunto) para la facultad / carrera y cada grupo."""
    yield "", df
    for g in GSE:
        yield f"|{g}", df[df.grupo_socioeconomico == g]
    for s in ["HOMBRE", "MUJER"]:
        yield f"|sexo:{s}", df[df.sexo == s]


def bloques(df):
    """Facultad, cada modalidad y cada carrera (ver comun.por_carrera)."""
    yield from por_carrera(df)


# ================================================================ TRAYECTORIA
anual, coh, des, tit = {}, {}, {}, {}


def serie_anual(x):
    out, prev = {}, None
    for a, h in x.groupby("anio"):
        mat = h.ins.nunique()
        if mat < MIN_BASE:
            prev = None
            continue
        tipos = h.tipo_ingreso.value_counts()
        pob = h[(h.gi != h.i) & (h.niv < h.dur) & (h.i < ULT_I)]
        ret = int((pob.sig | (pob.gi <= pob.i + 1)).sum())
        var = round(100 * (mat - prev) / prev, 2) if prev else None
        out[str(a)] = [int(mat), int(tipos.get("Nuevo ingreso", 0)), int(tipos.get("Continuidad", 0)),
                       int(tipos.get("Reingreso", 0)), int(len(pob)), ret, int(len(pob)), int(len(pob) - ret), var]
        prev = mat
    return out


for k, b in bloques(sp):
    for suf, x in dims_tray(b):
        s = serie_anual(x)
        if s:
            anual[k + suf] = s
    for t in ["Nuevo ingreso", "Continuidad", "Reingreso"]:
        s = serie_anual(b[b.tipo_ingreso == t])
        if s:
            anual[f"{k}|tipo_ingreso:{t}"] = s
    for c in sorted(b.coh.dropna().unique(), key=orden_periodo):
        s = serie_anual(b[b.coh == c])
        if s:
            anual[f"{k}|cohorte:{c}"] = s

# Cohortes observadas desde su ingreso
ing = sp[sp.cod == sp.coh].drop_duplicates("ins")[["clave", "ins", "coh", "i", "gi", "dur", "grupo_socioeconomico", "sexo"]]


def tabla_coh(x):
    co, de = {}, {}
    for c, h in x.groupby("coh"):
        n = len(h)
        if n < MIN_BASE:
            continue
        i0 = idx(c)
        en = lambda j: np.array([(s, j) in presentes for s in h.ins])
        base1 = n if i0 + 2 <= ULT_I else 0
        ret1 = int((en(i0 + 2) | (h.gi <= i0 + 2).values).sum()) if base1 else 0
        tt = int(h.gi.notna().sum())
        fin = i0 + h.dur.values - 1 + 2     # último semestre de la ventana oportuna
        to = int((h.gi.values <= fin).sum())
        cerrada = int((fin <= ULT_I).all())
        co[c] = [n, base1, ret1, tt, to, cerrada]
        # δ = mitad de la carrera de cada estudiante; la cohorte se mide solo si todos llegaron a Ai+δ
        delta = (h.dur.values // 2).astype(int)
        if (i0 + delta <= ULT_I).all():
            sigue = (np.array([(s, i0 + d) in presentes for s, d in zip(h.ins, delta)])
                     | (h.gi.values <= i0 + delta))
            de[c] = [n, int((~sigue).sum())]
    return co, de


for k, b in bloques(ing):
    for suf, x in dims_tray(b):
        co, de = tabla_coh(x)
        if co:
            coh[k + suf] = co
        if de:
            des[k + suf] = de

# Titulados por año (fecha de graduación)
tt = est[est.graduado == "SI"].drop_duplicates("ins").copy()
tt["anio"] = pd.to_datetime(tt.fechagraduado, errors="coerce").dt.year
tt = tt.dropna(subset=["anio"])
for k, b in bloques(tt):
    for suf, x in dims_tray(b):
        v = {str(int(a)): int(n) for a, n in x.groupby("anio").ins.nunique().items()
             if 2021 <= a <= ANIO_ACTUAL and (not suf or n >= MIN_BASE)}
        if v:
            tit[k + suf] = v
    for c, x in b.groupby("periodo_primer_nivel_codigo"):
        v = {str(int(a)): int(n) for a, n in x.groupby("anio").ins.nunique().items()
             if 2021 <= a <= ANIO_ACTUAL and n >= MIN_BASE}
        if v:
            tit[f"{k}|cohorte:{c}"] = v

escribir_js("trayectoria-data.js", "FACS_TRAY", {
    "minBase": MIN_BASE, "kAnon": K_ANON, "provisional": PROVISIONAL,
    "duracion": [{"carrera": k, "duracion_niveles": int(v)} for k, v in DURACION.items()],
    "delta": int(min(DURACION.values())) // 2,
    "anual": anual, "coh": coh, "tit": tit, "des": des,
}, "05_agregar_estudiantes.py", "Solo datos agregados de trayectoria estudiantil.")

# ===================================================================== PERFIL
ETNIA = {"MESTIZO/A": "Mestizo/a", "MONTUBIO/A": "Montubio/a", "AFROECUATORIANO/A": "Afroecuatoriano/a",
         "BLANCO/A": "Blanco/a", "INDIGENA": "Indígena", "MULATO/A": "Mulato/a", "NEGRO/A": "Negro/a",
         "OTRO": "Otro", "NO REGISTRA": "No registra"}
DISC = {"FISICA MOTORA": "Física motora", "VISUAL": "Visual", "AUDITIVA": "Auditiva", "INTELECTUAL": "Intelectual",
        "MENTAL PSICOSOCIAL": "Mental psicosocial", "LENGUAJE": "Lenguaje", "SIN DISCAPACIDAD": "Sin discapacidad"}


def edad(e):
    if pd.isna(e) or e < 15 or e > 80:
        return "Sin dato válido"
    return "15-19" if e < 20 else "20-24" if e < 25 else "25-29" if e < 30 else "30 o más"


pf = est.assign(anio=est.cod.str[-4:].astype(int)).sort_values("cod", key=lambda s: s.map(idx))
pf = pf.drop_duplicates(["anio", "ins"], keep="last")
pf = pd.DataFrame({
    "anio": pf.anio, "car": pf.clave.map({k: i for i, k in enumerate(CARRERAS_K)}),
    "sexo": pf.sexo.map({"HOMBRE": "Hombre", "MUJER": "Mujer"}).fillna("Sin dato"),
    "edad": pf.edad_ingreso_carrera.map(edad),
    "etnia": pf.etnia.map(ETNIA).fillna("No registra"),
    "disc": np.where(pf.discapacidad.fillna("SIN DISCAPACIDAD") == "SIN DISCAPACIDAD", "Sin discapacidad", "Con discapacidad"),
    "gse": pf.grupo_socioeconomico.fillna("SIN DATO"),
    "origen": [provincia(p, pa) for p, pa in zip(pf.provincia, pf.pais)],
    "disct": pf.discapacidad.map(DISC).fillna("Sin discapacidad"),
    "pais": pf.pais.map(pais_nombre),
})
DIMS = ["sexo", "edad", "etnia", "disc", "gse", "origen", "disct", "pais"]
valores = {d: sorted(pf[d].unique()) for d in DIMS}
for d in DIMS:
    pf[d] = pf[d].map({v: i for i, v in enumerate(valores[d])})
filas = pf.groupby(["anio", "car"] + DIMS).size().reset_index(name="n").values.tolist()
escribir_js("perfil-data.js", "FACS_PERFIL", {
    "provisional": PROVISIONAL, "carreras": CARRERAS_K, "dims": DIMS, "valores": valores, "filas": filas,
    "paisIso": {p: ISO_PAIS[p] for p in valores["pais"] if p in ISO_PAIS},
}, "05_agregar_estudiantes.py",
    "Perfil sociodemográfico: conteos por combinación de características (sin identificadores). "
    "Filas: [año, carrera, sexo, edad, etnia, disc, gse, origen, disct, pais, n].")
sin_iso = [p for p in valores["pais"] if p not in ISO_PAIS and p != "No registra"]
if sin_iso:
    print("Aviso: países sin código para el mapa mundial (agregar en comun._PAISES):", sin_iso)

# ================================================================ RENDIMIENTO
NOTA_APROB = 70
# Asistencia mínima para aprobar (modalidades presencial y semipresencial). Desde 1S-2025 el
# Art. 77 del reglamento la fija en 60 %; antes era 70 %. En línea no condiciona la aprobación.
UMBRAL_ASIST_ANTES, UMBRAL_ASIST, DESDE_UMBRAL = 70, 60, "1S-2025"


def umbral_asist(cod):
    return UMBRAL_ASIST if orden_periodo(cod) >= orden_periodo(DESDE_UMBRAL) else UMBRAL_ASIST_ANTES
ESCALA = [("Reprobado", 0, 69.99, "Reprueba"), ("Aprobado", 70, 79.99, "Aprueba"), ("Bueno", 80, 89.99, "Aprueba"),
          ("Muy Bueno", 90, 94.99, "Aprueba"), ("Excelente", 95, 100, "Aprueba")]
CAMPOS = ["e", "ev", "pa", "pr", "rp", "np", "nm", "nd", "as", "pba", "rep", "prep", "pem", "pab", "ab",
          "c1", "c2", "c3", "c4", "c5"]
BANDAS = [f"{i * 5:02d}-{'100' if i == 19 else f'{i * 5 + 4:02d}'}" for i in range(20)]

ev_ = est.estado_materia.isin(["APROBADO", "REPROBADO"])
R = pd.DataFrame({
    "clave": est.clave, "cod": est.cod, "ins": est.ins, "valida": ev_, "aprob": est.estado_materia == "APROBADO",
    "nota": est.nota_final.where(ev_), "asis": est.asistenciafinal.where(ev_), "nmat": est.numero_matricula,
    "sexo": est.sexo, "etnia": est.etnia, "gse": est.grupo_socioeconomico, "coh": est.periodo_primer_nivel_codigo,
    "niv": "N" + est.niv.astype(str),
})
MOD_DE = {c: m for m, (mod, _) in MODALIDADES.items() for c, _, _, mm in CARRERAS if mm == mod}
R["mod"] = R.clave.map(MOD_DE)
R["tipo_ingreso"] = pd.Series(list(zip(R.ins, R.cod))).map(sp.set_index(["ins", "cod"]).tipo_ingreso).values
R["bn"] = np.minimum((R.nota // 5), 19)
R["ba"] = np.minimum((R.asis // 5), 19)
R["cat"] = pd.cut(R.nota, [-0.01, 69.99, 79.99, 89.99, 94.99, 100], labels=[1, 2, 3, 4, 5]).astype("float")
R["bajo_umbral"] = (R.asis < R.cod.map(umbral_asist)).astype(float)


def resumen(x, por):
    """Una fila de 20 campos por grupo (por = columnas de agrupación, terminando en 'cod')."""
    out = {}
    v = x[x.valida]
    gx, gv = x.groupby(por), v.groupby(por)
    e = gx.ins.nunique()
    ev = gv.size().reindex(e.index, fill_value=0)
    ap = gv.aprob.sum().reindex(e.index, fill_value=0)
    nt = v[v.nota.notna()].groupby(por).nota
    np_, nm, nd = nt.mean(), nt.median(), nt.std()
    asg = v[v.asis.notna()].groupby(por).asis
    # % bajo el umbral vigente en el periodo de cada registro (70 % hasta 2S-2024, 60 % desde 1S-2025)
    as_, pba = asg.mean(), v[v.asis.notna()].groupby(por).bajo_umbral.mean() * 100
    mx = x.groupby(por + ["ins"]).nmat.max()
    conocido = mx.notna().groupby(level=list(range(len(por)))).sum()
    rep = (mx >= 2).groupby(level=list(range(len(por)))).sum()
    pem = nt.apply(lambda s: 100 * (s >= 90).mean())
    ab = v[v.nota == 0].groupby(por).size()
    cats = v.groupby(por + ["cat"]).size().unstack(fill_value=0)
    for key in e.index:
        if e[key] < MIN_BASE:
            continue
        g = lambda s, d=None: (s[key] if key in s.index else d)
        n_ev = int(ev[key])
        c = [int(cats.loc[key, j]) if key in cats.index and j in cats.columns else 0 for j in [1, 2, 3, 4, 5]]
        out[key] = [int(e[key]), n_ev, pct(ap[key], n_ev, 2), pct(n_ev - ap[key], n_ev, 2), int(n_ev - ap[key]),
                    round(g(np_), 2) if g(np_) is not None else None, round(g(nm), 2) if g(nm) is not None else None,
                    round(g(nd), 2) if g(nd) is not None and not pd.isna(g(nd)) else None,
                    round(g(as_), 2) if g(as_) is not None else None, round(g(pba), 2) if g(pba) is not None else None,
                    int(g(rep, 0)), pct(g(rep, 0), g(conocido, 0), 2),
                    round(g(pem), 2) if g(pem) is not None else None, pct(g(ab, 0), n_ev, 2), int(g(ab, 0))] + c
    return out


res, dist = {}, {}


def guardar(prefijo_de, filas):
    for key, fila in filas.items():
        *grupo, cod = key if isinstance(key, tuple) else (key,)
        res.setdefault(prefijo_de(*grupo), {})[cod] = fila


DIMS_R = {"sexo": "sexo", "etnia": "etnia", "cohorte": "coh", "numero_matricula": "nmat", "tipo_ingreso": "tipo_ingreso"}
for alcance, x, base in [("fac", R, []), ("mod", R, ["mod"]), ("car", R, ["clave"])]:
    pref = (lambda *g: FACULTAD) if alcance == "fac" else (lambda c, *g: c)
    guardar(lambda *g: pref(*g), resumen(x, base + ["cod"]))
    # nivel socioeconómico y nivel de la carrera: sin prefijo de tipo
    for col in ["gse", "niv"]:
        guardar(lambda *g: f"{pref(*g[:len(base)])}|{g[-1]}", resumen(x[x[col].notna()], base + [col, "cod"]))
    for nom, col in DIMS_R.items():
        xx = x[x[col].notna()]
        guardar(lambda *g, nom=nom: f"{pref(*g[:len(base)])}|{nom}:{int(g[-1]) if nom == 'numero_matricula' else g[-1]}",
                resumen(xx, base + [col, "cod"]))
    for nom, col in [("banda_nota", "bn"), ("banda_asistencia", "ba")]:
        xx = x[x[col].notna()].assign(**{col: lambda d, col=col: d[col].astype(int).map(lambda i: BANDAS[i])})
        guardar(lambda *g, nom=nom: f"{pref(*g[:len(base)])}|{nom}:{g[-1]}", resumen(xx, base + [col, "cod"]))

    # Histogramas de nota y asistencia (20 bandas de 5 puntos)
    for col, letra in [("bn", "n"), ("ba", "a")]:
        for extra in [None, "gse", "sexo", "etnia", "coh"]:
            grp = base + ([extra] if extra else []) + ["cod"]
            h = R[R[col].notna()] if alcance == "fac" else x[x[col].notna()]
            cnt = h.groupby(grp + [col]).size().unstack(fill_value=0)
            e_ = h.groupby(grp).ins.nunique()
            for key, fila in cnt.iterrows():
                key = key if isinstance(key, tuple) else (key,)
                if e_[key if len(key) > 1 else key[0]] < MIN_BASE:
                    continue
                *grupo, cod = key
                k0 = pref(*grupo[:len(base)])
                if extra:
                    v = grupo[-1]
                    k0 += f"|{v}" if extra == "gse" else f"|{'cohorte' if extra == 'coh' else extra}:{v}"
                dist.setdefault(k0, {}).setdefault(cod, {})[letra] = [int(fila.get(i, 0)) for i in range(20)]

escribir_js("rendimiento-data.js", "FACS_REND", {
    "actualizado": estado().get("generado", "")[:10], "provisional": PROVISIONAL,
    "minBase": MIN_BASE, "kAnon": K_ANON, "notaAprobacion": NOTA_APROB, "umbralAsistencia": UMBRAL_ASIST,
    "umbralAsistenciaAnterior": UMBRAL_ASIST_ANTES, "umbralAsistenciaDesde": DESDE_UMBRAL,
    "umbralesAsistencia": {p: umbral_asist(p) for p in PERIODOS},
    "escala": [{"categoria": c, "nota_min": a, "nota_max": b, "condicion": d} for c, a, b, d in ESCALA],
    "campos": CAMPOS, "periodos": PERIODOS, "res": res, "dist": dist,
}, "05_agregar_estudiantes.py", f"Solo datos agregados; mínimo de estudiantes por cruce: {MIN_BASE}.")
print("Matrícula por año (facultad):", {a: v[0] for a, v in anual[FACULTAD].items()})
print("Aprobación por periodo (facultad):", {p: f[2] for p, f in sorted(res[FACULTAD].items(), key=lambda z: orden_periodo(z[0]))})
