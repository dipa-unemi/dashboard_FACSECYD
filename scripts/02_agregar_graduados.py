# -*- coding: utf-8 -*-
"""
Agregacion publicable del modulo de Seguimiento a Graduados (FACSECYD).

Sigue el mismo modelo que scripts/agregar_datos.R usa para Poblacion: agrega a
nivel de COMBINACION de variables, no de persona. Asi el navegador puede filtrar
por cualquier cruce y TODOS los graficos se filtran entre si, igual que en la
pestana de Perfil Estudiantil.

Diferencia con Poblacion, y por que importa: alli las variables son
administrativas (carrera, sede, provincia), que la universidad ya publica. Aqui
cada fila lleva ademas una RESPUESTA DE ENCUESTA -- situacion laboral, tramo
salarial -- que es informacion sensible sobre una persona concreta. Con nueve
variables de cruce, el 56 % de las combinaciones correspondia a una sola persona:
publicarlas tal cual habria expuesto la respuesta individual de cada graduado.

Por eso, antes de agregar se aplica GENERALIZACION K-ANONIMA: mientras exista una
combinacion con menos de K personas, se difumina (pone en "—") la variable mas
identificadora de esas filas, en orden de menor a mayor valor analitico. El
resultado conserva intactas las variables que sostienen la lectura -- ano, momento
de la trayectoria y carrera -- y difumina sobre todo etnia y edad, que son las que
mas identifican y menos aportan al analisis de empleabilidad.

Entrada : build/*.pkl  (salida de 01_depurar_graduados.py)
Salida  : docs/data_graduados.js

Uso:  python scripts/02_agregar_graduados.py
"""

import io
import itertools
import json
import re
import sys
import unicodedata
from datetime import datetime

import pandas as pd

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
import config_graduados as cfg

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

VACIO = "—"


def normalizar(t):
    t = unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", t).strip().lower()


def _py(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    return x.item() if hasattr(x, "item") else x


# ===========================================================================
# Generalizacion k-anonima
# ===========================================================================
def anonimizar(per):
    """Difumina variables hasta que ninguna combinacion tenga menos de K personas.

    El orden de cfg.ORDEN_GENERALIZACION va de la variable menos central para el
    analisis a la mas central, de modo que lo primero que se pierde es lo que
    menos cuesta perder. Ano, momento y carrera nunca se tocan.
    """
    d = per[cfg.DIMS_COMBO].copy()
    for c in cfg.DIMS_COMBO:
        d[c] = d[c].fillna(VACIO).astype(str)

    orden = cfg.ORDEN_GENERALIZACION
    for vuelta in range(3):
        for dim in orden:
            t = d.groupby(cfg.DIMS_COMBO, dropna=False).size()
            riesgo = t[t < cfg.K_ANONIMATO].index
            if not len(riesgo):
                break
            mask = pd.MultiIndex.from_frame(d[cfg.DIMS_COMBO]).isin(riesgo)
            d.loc[mask, dim] = VACIO
        t = d.groupby(cfg.DIMS_COMBO, dropna=False).size()
        if (t < cfg.K_ANONIMATO).sum() == 0:
            break

    # Lo que sigue por debajo de K son combinaciones unicas ya en ano+momento+
    # carrera, que no se difuminan por ser los ejes del modulo. Se descartan:
    # publicar una celda de tres personas con su tramo salarial es exactamente
    # lo que la regla trata de evitar.
    t = d.groupby(cfg.DIMS_COMBO, dropna=False).size()
    bajo_k = t[t < cfg.K_ANONIMATO]
    quedan = int(len(bajo_k))
    descartadas = int(bajo_k.sum())
    fuera = pd.MultiIndex.from_frame(d[cfg.DIMS_COMBO]).isin(bajo_k.index)
    d = d[~fuera]
    print(f"      combinaciones: {len(t):,}".replace(",", "."))
    print(f"      descartadas por no alcanzar k={cfg.K_ANONIMATO}: {quedan} "
          f"({descartadas} observaciones, {100*descartadas/len(per):.1f}%)")
    for c in cfg.DIMS_COMBO:
        print(f"        {c:22s} conserva su valor real en el {100*(d[c]!=VACIO).mean():5.1f}% de las filas")
    return d, quedan, descartadas, fuera


def dicts_de(d):
    """Diccionario de valores por dimension. VACIO siempre en la posicion 0."""
    D = {}
    for c in cfg.DIMS_COMBO:
        vals = sorted(v for v in d[c].unique() if v != VACIO)
        D[c] = [VACIO] + vals
    return D


def main():
    print("=" * 74)
    print("AGREGACION PUBLICABLE · SEGUIMIENTO A GRADUADOS FACSECYD")
    print("=" * 74)
    if not cfg.PKL_LIMPIO.exists():
        raise SystemExit("Falta build/graduados_limpio.pkl. Ejecuta antes 01_depurar_graduados.py")

    resp = pd.read_pickle(cfg.PKL_LIMPIO)
    per = pd.read_pickle(cfg.PKL_PERSONAS)
    pob = pd.read_pickle(cfg.PKL_POBLACION)
    qc = json.loads(cfg.JSON_QC.read_text(encoding="utf-8"))
    print(f"\nEntrada: {len(resp):,} respuestas · {per.persona_id.nunique():,} graduados"
          .replace(",", "."))

    # --- Etiquetas legibles -------------------------------------------------
    per = per.copy()
    per["anio"] = per.anio_encuesta.astype(str)
    per["ola"] = per.ola.map(cfg.OLA_ETIQUETA)
    per["cohorte"] = per.cohorte.map(lambda c: str(int(c)) if pd.notna(c) else None)
    per["modalidad"] = per.modalidad.str.capitalize()
    pob["cohorte"] = pob.cohorte.map(lambda c: str(int(c)) if pd.notna(c) else None)

    # --- Anonimizacion ------------------------------------------------------
    print("\n[1] Generalizacion k-anonima")
    d, quedan, descartadas, fuera = anonimizar(per)
    llave = per.loc[~fuera, ["persona_id", "periodo_encuesta"]].copy()
    for c in cfg.DIMS_COMBO:
        llave[c] = d[c].values

    DICTS = dicts_de(d)
    idx = {c: {v: i for i, v in enumerate(DICTS[c])} for c in cfg.DIMS_COMBO}

    # resp trae las variables SIN generalizar; se descartan para que el cruce use
    # sólo las versiones anonimizadas y no queden columnas duplicadas.
    cols_resp = [c for c in resp.columns if c not in cfg.DIMS_COMBO]
    r = resp[cols_resp].merge(llave, on=["persona_id", "periodo_encuesta"], how="inner")

    # --- Filas categoricas --------------------------------------------------
    print("\n[2] Filas por combinacion · indicadores categoricos")
    indicadores, catalogo = [], []
    trozos = []
    for ind in cfg.INDICADORES:
        if ind["clase"] != "categorica":
            continue
        sel = r[r.pregunta_norm.str.contains(ind["patron"], regex=True, na=False)].copy()
        sel = sel[sel.respuesta_texto.notna()]
        if sel.empty:
            print(f"      · {ind['id']}: sin datos")
            continue
        equiv = cfg.EQUIVALENCIAS.get(ind["id"])
        if equiv:
            sel["respuesta_texto"] = sel.respuesta_texto.map(lambda v: equiv.get(v, v))
        sel = sel.drop_duplicates(["persona_id", "periodo_encuesta", "respuesta_texto"])
        g = (sel.groupby(cfg.DIMS_COMBO + ["respuesta_texto"], dropna=False)
                .size().rename("n").reset_index())
        g["indicador"] = ind["id"]
        trozos.append(g)
        catalogo.append({"id": ind["id"], "titulo": ind["titulo"], "bloque": ind["bloque"],
                         "clase": "categorica", "orden": ind.get("orden", []),
                         "destacar": ind.get("destacar", []), "nota": ind.get("nota", "")})
        print(f"      · {ind['id']:22s} {len(g):6,} filas".replace(",", "."))
    cat = pd.concat(trozos, ignore_index=True)

    # diccionario global de categorias
    cats = sorted(cat.respuesta_texto.unique())
    icat = {v: i for i, v in enumerate(cats)}
    inds = sorted(cat.indicador.unique())
    iind = {v: i for i, v in enumerate(inds)}

    filas_cat = []
    for _, row in cat.iterrows():
        filas_cat.append("|".join(str(x) for x in
            [idx[c][row[c]] for c in cfg.DIMS_COMBO] +
            [iind[row.indicador], icat[row.respuesta_texto], int(row.n)]))

    # --- Filas de escala ----------------------------------------------------
    print("\n[3] Filas por combinacion · bloques de escala")
    esc = r[r.tipo_pregunta.isin(cfg.TIPOS_ESCALA) & r.respuesta_numerica.notna()].copy()
    bloques_esc = []
    for b in cfg.BLOQUES_ESCALA:
        sub = esc[esc.bloque.isin(b["bloques"])]
        if sub.empty:
            continue
        g = (sub.assign(v=sub.respuesta_numerica.astype(int))
               .groupby(cfg.DIMS_COMBO + ["v"], dropna=False).size().rename("n").reset_index()
               .pivot(index=cfg.DIMS_COMBO, columns="v", values="n")
               .reindex(columns=range(1, 8)).fillna(0).astype(int).reset_index())
        g["bloque"] = b["id"]
        bloques_esc.append(g)
        print(f"      · {b['id']:24s} {len(g):6,} filas".replace(",", "."))
        catalogo.append({"id": b["id"], "titulo": b["titulo"], "bloque": "Formación",
                         "clase": "escala", "orden": [], "destacar": [], "nota": b.get("nota", "")})
    # las preguntas de escala sueltas (pertinencia, proyecto de vida) van igual
    for ind in cfg.INDICADORES:
        if ind["clase"] != "escala":
            continue
        sub = esc[esc.pregunta_norm.str.contains(ind["patron"], regex=True, na=False)]
        if sub.empty:
            continue
        g = (sub.assign(v=sub.respuesta_numerica.astype(int))
               .groupby(cfg.DIMS_COMBO + ["v"], dropna=False).size().rename("n").reset_index()
               .pivot(index=cfg.DIMS_COMBO, columns="v", values="n")
               .reindex(columns=range(1, 8)).fillna(0).astype(int).reset_index())
        g["bloque"] = ind["id"]
        bloques_esc.append(g)
        print(f"      · {ind['id']:24s} {len(g):6,} filas".replace(",", "."))
        catalogo.append({"id": ind["id"], "titulo": ind["titulo"], "bloque": ind["bloque"],
                         "clase": "escala", "orden": [], "destacar": [],
                         "nota": ind.get("nota", ""), "bimodal": bool(ind.get("bimodal"))})
    escd = pd.concat(bloques_esc, ignore_index=True)
    blqs = sorted(escd.bloque.unique())
    iblq = {v: i for i, v in enumerate(blqs)}
    filas_esc = []
    for _, row in escd.iterrows():
        filas_esc.append("|".join(str(x) for x in
            [idx[c][row[c]] for c in cfg.DIMS_COMBO] + [iblq[row.bloque]] +
            [int(row[v]) for v in range(1, 8)]))

    # --- Cruce indicador x indicador ----------------------------------------
    # Lo que permite pulsar "0 a 6 meses" y filtrar el resto del tablero.
    #
    # POR QUE NO LLEVA DIMENSIONES. Se probo cruzar tambien por ano+ola+carrera.
    # A esa granularidad las celdas quedan diminutas, la supresion k=5 se lleva
    # justo las categorias minoritarias y las condicionales salen sesgadas hasta
    # 89 puntos porcentuales (el sector terciario pasaba de 78,7% real a 96,5%).
    # Publicar el residuo agrupado corrige el denominador pero no el numerador:
    # el sesgo seguia en 15 pp. Ninguna contabilidad arregla eso, es la
    # granularidad.
    #
    # Sin dimensiones demograficas las celdas son grandes y, sobre todo, la
    # supresion deja de hacer falta: una celda "0 a 6 meses x sector primario"
    # no tiene clave demografica con la que estrechar el grupo, asi que no abre
    # ninguna via de reidentificacion -- que es lo que K_ANONIMATO protege (ver
    # su nota: habla de combinaciones de DIMS_COMBO). Se publican todas las
    # celdas y el porcentaje condicional es EXACTO, sin sesgo.
    #
    # El precio, que el tablero declara: un filtro de respuesta da el corte de
    # toda la facultad y no se combina con carrera, ano ni momento.
    print("\n[5] Cruce indicador x indicador (sin dimensiones: condicionales exactas)")
    llaves = ["persona_id", "periodo_encuesta"]

    piezas = []
    for ind in cfg.INDICADORES:
        if ind["clase"] != "categorica":
            continue
        sel = r[r.pregunta_norm.str.contains(ind["patron"], regex=True, na=False)
                & r.respuesta_texto.notna()].copy()
        if sel.empty:
            continue
        equiv = cfg.EQUIVALENCIAS.get(ind["id"])
        if equiv:
            sel["respuesta_texto"] = sel.respuesta_texto.map(lambda v: equiv.get(v, v))
        sel = sel.drop_duplicates(llaves + ["respuesta_texto"])
        sel["ind"] = ind["id"]
        piezas.append(sel[llaves + ["ind", "respuesta_texto"] + cfg.DIMS_COMBO])
    LF = pd.concat(piezas, ignore_index=True)
    inds_f = sorted(LF.ind.unique())

    # a) categorico x categorico, sin suprimir
    filas_cross = []
    for a, b in itertools.permutations(inds_f, 2):
        A = LF[LF.ind == a][llaves + ["respuesta_texto"]]
        B = LF[LF.ind == b][llaves + ["respuesta_texto"]]
        m = A.merge(B, on=llaves, suffixes=("_f", "_m"))
        if m.empty:
            continue
        g = m.groupby(["respuesta_texto_f", "respuesta_texto_m"]).size()
        for (cf, cm), cuenta in g.items():
            filas_cross.append("|".join(str(x) for x in
                [iind[a], icat[cf], iind[b], icat[cm], int(cuenta)]))
    print(f"      categórico x categórico: {len(filas_cross):,} filas".replace(",", "."))

    # b) categorico x bloque de escala, sin suprimir
    filas_cross_esc = []
    escv = esc.assign(v=esc.respuesta_numerica.astype(int))
    bloques_todos = ([dict(b, _modo="bloques") for b in cfg.BLOQUES_ESCALA] +
                     [dict(i, _modo="patron") for i in cfg.INDICADORES if i["clase"] == "escala"])
    for b in bloques_todos:
        sub = (escv[escv.bloque.isin(b["bloques"])] if b["_modo"] == "bloques"
               else escv[escv.pregunta_norm.str.contains(b["patron"], regex=True, na=False)])
        if sub.empty or b["id"] not in iblq:
            continue
        for a in inds_f:
            A = LF[LF.ind == a][llaves + ["respuesta_texto"]]
            m = sub[llaves + ["v"]].merge(A, on=llaves)
            if m.empty:
                continue
            g = (m.groupby(["respuesta_texto", "v"]).size().rename("n").reset_index()
                   .pivot(index="respuesta_texto", columns="v", values="n")
                   .reindex(columns=range(1, 8)).fillna(0).astype(int))
            for cf, fila in g.iterrows():
                filas_cross_esc.append("|".join(str(x) for x in
                    [iind[a], icat[cf], iblq[b["id"]]] + [int(fila[v]) for v in range(1, 8)]))
    print(f"      categórico x escala:     {len(filas_cross_esc):,} filas".replace(",", "."))

    # c) marginales de una via: cuantas observaciones del corte hay en cada valor
    # de cada dimension. Son conteos de contexto, no condicionales, asi que aqui
    # si se aplica k (una celda pequena aqui SI tiene clave demografica).
    filas_cross_dim = []
    for a in inds_f:
        A = LF[LF.ind == a]
        for dim in cfg.DIMS_COMBO:
            g = A.groupby(["respuesta_texto", dim], dropna=False).size()
            g = g[g >= cfg.K_ANONIMATO]
            for (cf, val), cuenta in g.items():
                filas_cross_dim.append("|".join(str(x) for x in
                    [iind[a], icat[cf], cfg.DIMS_COMBO.index(dim), idx[dim][val], int(cuenta)]))
    print(f"      marginales por dimensión: {len(filas_cross_dim):,} filas".replace(",", "."))

    # d) total exacto de observaciones bajo cada corte, para la cabecera y los
    # KPIs de conteo. Sin suprimir, por lo mismo que (a) y (b).
    filas_cross_tot = []
    for a in inds_f:
        for cf, cuenta in LF[LF.ind == a].groupby("respuesta_texto").size().items():
            filas_cross_tot.append("|".join(str(x) for x in [iind[a], icat[cf], int(cuenta)]))
    print(f"      total por corte:          {len(filas_cross_tot):,} filas".replace(",", "."))

    # --- Competencia por competencia -----------------------------------------
    # Solo el resumen (respuestas de alta valoracion sobre el total), no los 7
    # conteos: al panel le basta el porcentaje y el archivo pesa un tercio.
    print("\n[4] Filas por combinacion · competencia individual")
    comp_r = esc[esc.bloque.isin(["Competencias generales", "Competencias específicas"])].copy()
    grandes = comp_r.pregunta.value_counts()
    grandes = set(grandes[grandes >= cfg.MIN_RESPUESTAS_COMPETENCIA].index)
    comp_r = comp_r[comp_r.pregunta.isin(grandes)]
    comp_r["alta"] = (comp_r.respuesta_numerica >= cfg.ALTA_VALORACION[0]).astype(int)
    gc = (comp_r.groupby(cfg.DIMS_COMBO + ["pregunta", "bloque"], dropna=False)
                .agg(alta=("alta", "sum"), tot=("alta", "size")).reset_index())
    comps = sorted(gc.pregunta.unique())
    icomp = {v: i for i, v in enumerate(comps)}
    comp_bloque = (gc.drop_duplicates("pregunta").set_index("pregunta").bloque
                     .reindex(comps).tolist())
    filas_comp = ["|".join(str(x) for x in
        [idx[c][row[c]] for c in cfg.DIMS_COMBO] +
        [icomp[row.pregunta], int(row.alta), int(row.tot)])
        for _, row in gc.iterrows()]
    print(f"      {len(comps)} competencias · {len(filas_comp):,} filas".replace(",", "."))

    # --- Personas unicas por combinacion (para el conteo de graduados) ------
    print("\n[4] Graduados por combinacion")
    gper = (llave.groupby(cfg.DIMS_COMBO, dropna=False)
                 .agg(obs=("persona_id", "size"), personas=("persona_id", "nunique"))
                 .reset_index())
    filas_per = ["|".join(str(x) for x in
        [idx[c][row[c]] for c in cfg.DIMS_COMBO] + [int(row.obs), int(row.personas)])
        for _, row in gper.iterrows()]
    print(f"      {len(filas_per):,} filas".replace(",", "."))

    # --- Cobertura ----------------------------------------------------------
    # El denominador sólo incluye cohortes que YA fueron encuestadas. La de 2026
    # tiene 2.096 titulados y cero encuestados porque su primera encuesta se
    # excluyó por ser un periodo abierto (cfg.OLAS_EXCLUIDAS, regla H-08):
    # dejarla en el denominador castigaba la tasa 11,5 puntos (54,2% en vez de
    # 65,8%) por gente que nunca tuvo ocasión de responder. Numerador y
    # denominador tienen que cubrir el mismo universo.
    cohortes_encuestadas = set(per.cohorte.dropna().unique())
    cob = pob[pob.cohorte.notna() & pob.carrera.notna()]
    pendientes = cob[~cob.cohorte.astype(str).isin(cohortes_encuestadas)]
    cob = cob[cob.cohorte.astype(str).isin(cohortes_encuestadas)]
    print(f"      cohortes aún sin encuestar, fuera del denominador: "
          f"{len(pendientes):,} titulados".replace(",", "."))
    cobertura = []
    for dim, cols in [("cohorte", ["cohorte"]), ("carrera", ["carrera"])]:
        g = cob.groupby(cols).agg(titulados=("encuestado", "size"),
                                  encuestados=("encuestado", "sum")).reset_index()
        for _, x in g.iterrows():
            if x.titulados < cfg.UMBRAL_SUPRESION:
                continue
            cobertura.append({"dimension": dim, "corte": str(x[cols[0]]),
                              "titulados": int(x.titulados), "encuestados": int(x.encuestados),
                              "tasa": round(100 * x.encuestados / x.titulados, 1)})

    # --- Comparabilidad -----------------------------------------------------
    comp = (resp.assign(ola=resp.ola.map(cfg.OLA_ETIQUETA))
                .groupby(["periodo_encuesta", "ola"])
                .agg(preguntas=("pregunta_norm", "nunique"),
                     respondentes=("persona_id", "nunique"),
                     abierto=("periodo_abierto", "max")).reset_index())

    # --- Ensamblar ----------------------------------------------------------
    RAW = {
        "dims": cfg.DIMS_COMBO,
        "dicts": DICTS,
        "indicadores": inds,
        "categorias": cats,
        "bloques": blqs,
        "catalogo": catalogo,
        "rows_cat": "\n".join(filas_cat),
        "rows_esc": "\n".join(filas_esc),
        "rows_per": "\n".join(filas_per),
        "competencias": comps,
        "competencias_bloque": comp_bloque,
        "rows_comp": "\n".join(filas_comp),
        "rows_cross": "\n".join(filas_cross),
        "rows_cross_esc": "\n".join(filas_cross_esc),
        "rows_cross_dim": "\n".join(filas_cross_dim),
        "rows_cross_tot": "\n".join(filas_cross_tot),
        "cobertura": cobertura,
        "comparabilidad": comp.to_dict("list"),
        "escala": {"valor": list(range(1, 8)), "etiqueta": cfg.ESCALA_ETIQUETAS},
        "meta": {
            "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "fuente": "data_seguimientograduado.xlsx + data_estudiantes_1/2.xlsx",
            "graduados": int(per.persona_id.nunique()),
            "observaciones": int(len(per)),
            "titulados_universo": int(len(cob)),
            # NUMERADOR DE LA TASA DE RESPUESTA.
            # No es "graduados": 31 encuestados no tienen inscripcion en la base
            # de estudiantes (son parte del 0,5% que no cruza, ver
            # tasa_enriquecimiento), asi que no existe registro de titulacion
            # suyo y no pueden pertenecer al universo del denominador. Usar
            # 6.507/11.943 mezclaba dos universos y daba una tasa mas alta que
            # la suma de sus propias filas por carrera. El numerador tiene que
            # ser un subconjunto del denominador: ambos se cuentan sobre pob.
            "encuestados_en_universo": int(cob.encuestado.sum()),
            "titulados_pendientes": int(len(pendientes)),
            "cohortes_pendientes": sorted(str(c) for c in pendientes.cohorte.unique()),
            "encuestados_sin_registro": int(per.persona_id.nunique() - pob.encuestado.sum()),
            "cohortes": sorted(c for c in per.cohorte.dropna().unique()),
            "anios": sorted(per.anio.unique()),
            "carreras": int(per.carrera.nunique()),
            "filas_origen": qc["filas_origen"],
            "filas_depuradas": qc["filas_depuradas"],
            "tasa_enriquecimiento": qc["notas"]["cruce"]["tasa"],
            "umbral_supresion": cfg.UMBRAL_SUPRESION,
            "k_anonimato": cfg.K_ANONIMATO,
            "combinaciones_descartadas": quedan,
            "observaciones_descartadas": descartadas,
            "nucleo_comun": qc["notas"]["nucleo_global"],
            "vacio": VACIO,
            "advertencia": ("Cifras basadas en quienes respondieron la encuesta. La tasa de "
                            "respuesta varía entre carreras, por lo que los totales de facultad "
                            "sobrerrepresentan a las carreras con mayor participación."),
        },
    }

    cfg.JS_SALIDA.write_text(
        "/* Generado por scripts/02_agregar_graduados.py · no editar a mano.\n"
        "   Agregado por combinación de variables, con generalización k-anónima:\n"
        "   ninguna fila corresponde a menos de " + str(cfg.K_ANONIMATO) + " graduados. */\n"
        "const RAW_GRADUADOS = " + json.dumps(RAW, ensure_ascii=False, separators=(",", ":"),
                                              default=_py) + ";\n",
        encoding="utf-8")
    kb = cfg.JS_SALIDA.stat().st_size / 1024
    print("\n" + "=" * 74)
    print(f"Filas publicadas: {len(filas_cat):,} categóricas · {len(filas_esc):,} de escala · "
          f"{len(filas_per):,} de conteo".replace(",", "."))
    print(f"Escrito: docs/{cfg.JS_SALIDA.name}  ({kb:.0f} KB)")
    print("\nEl archivo no contiene persona_id ni respuestas individuales.")
    print("Siguiente paso:  python scripts/03_verificar_graduados.py")


if __name__ == "__main__":
    main()
