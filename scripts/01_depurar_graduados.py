# -*- coding: utf-8 -*-
"""
Depuracion y cruce del modulo de Seguimiento a Graduados (FACSECYD).

Ejecuta, en orden, los pasos 1..8 del plan de depuracion de la auditoria.
El orden importa: normalizar carreras antes de deduplicar cambia que filas se
consideran repetidas, y tipificar antes de filtrar evita descartar valores
validos por comparar texto con numero.

Entrada : data/data_seguimientograduado.xlsx
          data/data_estudiantes_1.xlsx, data/data_estudiantes_2.xlsx
Salida  : build/graduados_limpio.pkl     (nivel respuesta, depurado y enriquecido)
          build/graduados_personas.pkl   (nivel persona-ola)
          build/poblacion_titulados.pkl  (universo para la tasa de respuesta)
          build/qc_graduados.json        (bitacora de exclusiones por regla)

Los tres .pkl contienen datos personales: viven en build/, que esta ignorado por
git. Solo el agregado que produce 02_agregar_graduados.py llega a docs/.

Uso:  python scripts/01_depurar_graduados.py
"""

import io
import json
import re
import sys
import unicodedata
from datetime import datetime

import openpyxl
import pandas as pd

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
import config_graduados as cfg

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

QC = {"generado": datetime.now().strftime("%Y-%m-%d %H:%M"), "exclusiones": {}, "notas": {}}


def paso(n, titulo):
    print(f"\n[{n}] {titulo}")


def registrar(clave, n, detalle=""):
    QC["exclusiones"][clave] = {"registros": int(n), "detalle": detalle}
    print("      -> " + f"{n:,}".replace(",", ".") + f" registros · {detalle}")


def normalizar(texto):
    """Minusculas, sin tildes, sin espacios repetidos. Para comparar, no para mostrar."""
    if texto is None:
        return ""
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", t).strip().lower()


def limpiar_visible(texto):
    """Limpieza que SI se muestra en pantalla: quita control chars y espacios sobrantes."""
    if texto is None:
        return None
    t = str(texto).replace("_x000D_", " ")
    t = re.sub(r"[\t\r\n\x00-\x1f]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t or None


# ===========================================================================
# PASO 1 · Tipificar  (H-01, H-02)
# ===========================================================================
def cargar_y_tipificar():
    paso(1, "Tipificar: \\N -> nulo, castear numeros, rescatar valores mal ubicados")
    df = pd.read_excel(cfg.XLSX_GRADUADOS, sheet_name="Hoja1")
    n0 = len(df)
    print(f"      archivo origen: {n0:,} filas".replace(",", "."))

    # \N es el nulo de MySQL exportado como texto; deja toda la columna como object
    es_nulo_sql = df.respuesta_numerica.astype(str).str.strip() == cfg.NULO_SQL
    df.loc[es_nulo_sql, "respuesta_numerica"] = None
    registrar("nulo_sql_convertido", es_nulo_sql.sum(),
              "literal \\N en respuesta_numerica convertido a nulo")

    df["respuesta_numerica"] = pd.to_numeric(df.respuesta_numerica, errors="coerce")

    # H-01: en preguntas de seleccion el numero es el ID de la alternativa, no un
    # puntaje. Se descarta para que nadie pueda promediarlo por accidente.
    es_seleccion = df.tipo_pregunta == cfg.TIPO_SELECCION
    df.loc[es_seleccion, "respuesta_numerica"] = pd.NA
    registrar("codigos_opcion_descartados", es_seleccion.sum(),
              "respuesta_numerica anulada en preguntas de seleccion (era un ID de opcion)")

    # H-02: en las preguntas abiertas numericas el valor esta en respuesta_texto
    es_numero = df.tipo_pregunta == cfg.TIPO_NUMERO
    df["valor_numerico"] = pd.NA
    df.loc[es_numero, "valor_numerico"] = pd.to_numeric(
        df.loc[es_numero, "respuesta_texto"], errors="coerce")
    registrar("valores_rescatados", es_numero.sum(),
              "valores numericos leidos desde respuesta_texto")

    # La escala 1-7 se valida contra el diccionario declarado en config
    es_escala = df.tipo_pregunta.isin(cfg.TIPOS_ESCALA)
    esperado = df.respuesta_texto.map(cfg.ESCALA)
    discrepan = es_escala & esperado.notna() & (esperado != df.respuesta_numerica)
    if discrepan.any():
        registrar("escala_incoherente", discrepan.sum(),
                  "texto y numero no coinciden con la escala institucional; se excluyen")
        df = df[~discrepan].copy()
    else:
        QC["notas"]["escala"] = "Mapeo texto<->numero coherente en el 100% de las filas."
        print("      -> mapeo texto<->numero coherente en todas las filas")
    return df, n0


# ===========================================================================
# PASO 2 · Limpiar texto  (H-11, H-12)
# ===========================================================================
def limpiar_texto(df):
    paso(2, "Limpiar texto: espacios, tabuladores, escapes de Excel, marcadores de no-dato")
    antes_sucias = (
        df.respuesta_texto.astype(str).str.contains(r"[\t\r\n]|_x000D_", regex=True, na=False)
        | (df.respuesta_texto.astype(str) != df.respuesta_texto.astype(str).str.strip())
    ).sum()

    for col in ["respuesta_texto", "pregunta", "grupo_competencia", "carrera_estudiante"]:
        df[col] = df[col].map(limpiar_visible)
    registrar("texto_saneado", antes_sucias, "valores con espacios, tabuladores o escapes")

    # Marcadores de no-dato escritos a mano -> nulo explicito
    marca = df.respuesta_texto.astype(str).str.upper().isin(cfg.MARCADORES_NO_DATO)
    df.loc[marca, "respuesta_texto"] = None
    registrar("no_dato_a_nulo", marca.sum(), "'DATO INEXACTO', 'NINGUNO', 'N/A' y similares")

    df = df[df.respuesta_texto.notna() | df.respuesta_numerica.notna() | df.valor_numerico.notna()]
    return df


# ===========================================================================
# PASO 3 · Normalizar categorias  (H-06, H-11, H-12)
# ===========================================================================
def normalizar_categorias(df):
    paso(3, "Normalizar categorias: carreras, bloques y valores de opcion")

    # --- Carreras no vigentes: fuera del analisis, igual que en Poblacion
    no_vig = df.apply(lambda r: cfg.es_no_vigente(r.carrera_estudiante, r.modalidad), axis=1)
    personas_fuera = df.loc[no_vig, "persona_id"].nunique()
    df = df[~no_vig].copy()
    registrar("carreras_no_vigentes", no_vig.sum(),
              f"combinaciones carrera+PRESENCIAL no vigentes, excluidas ({personas_fuera} graduados) "
              "· misma regla que dashboard/Script_poblacion_general.R")

    # --- Carreras: grafias -> canonicas
    df["malla"] = df.carrera_estudiante.map(cfg.malla_de)
    df["carrera"] = df.carrera_estudiante.str.strip().map(cfg.CARRERAS)
    sin_mapear = df.carrera.isna()
    if sin_mapear.any():
        faltantes = sorted(df.loc[sin_mapear, "carrera_estudiante"].unique())
        raise SystemExit(
            "Hay carreras sin equivalencia en config_graduados.CARRERAS:\n  "
            + "\n  ".join(map(str, faltantes))
            + "\nAgregalas al diccionario antes de continuar: dejarlas fuera falsearia los totales."
        )
    print(f"      -> {df.carrera_estudiante.nunique()} grafias consolidadas en "
          f"{df.carrera.nunique()} carreras")

    # --- Bloques del cuestionario
    def bloque_de(g):
        gn = normalizar(g)
        for patron, nombre in cfg.BLOQUES:
            if re.search(patron, gn):
                return nombre
        return "Otros"
    df["bloque"] = df.grupo_competencia.map(bloque_de)

    # --- Identidad estable de pregunta: el texto normalizado, no pregunta_id (H-12)
    df["pregunta_norm"] = df.pregunta.map(normalizar)

    # --- Valores de opcion: canonizacion automatica SOLO en preguntas cerradas.
    # En las abiertas ('Responder en texto') fusionar por grafia mezclaria
    # respuestas legitimamente distintas, asi que se dejan como estan.
    cerradas = df.tipo_pregunta == cfg.TIPO_SELECCION
    sub = df.loc[cerradas, ["pregunta_norm", "respuesta_texto"]].dropna()
    sub = sub.assign(clave=sub.respuesta_texto.map(normalizar))
    # canonica = la grafia mas frecuente dentro de cada (pregunta, clave normalizada)
    canon = (sub.groupby(["pregunta_norm", "clave", "respuesta_texto"]).size()
             .rename("n").reset_index()
             .sort_values("n", ascending=False)
             .drop_duplicates(["pregunta_norm", "clave"])
             .set_index(["pregunta_norm", "clave"]).respuesta_texto)
    idx = pd.MultiIndex.from_arrays([sub.pregunta_norm, sub.clave])
    fusionadas = (canon.reindex(idx).values != sub.respuesta_texto.values).sum()
    df.loc[sub.index, "respuesta_texto"] = canon.reindex(idx).values
    registrar("categorias_unificadas", fusionadas,
              "valores fusionados por diferencia de mayusculas, tildes o espacios")
    return df


# ===========================================================================
# PASO 4 · Resolver duplicados  (H-07)
# ===========================================================================
def resolver_duplicados(df):
    paso(4, "Resolver duplicados: repeticiones identicas y respuestas contradictorias")
    clave = ["persona_id", "periodo_encuesta", "pregunta_norm"]

    identicas = df.duplicated(subset=clave + ["respuesta_texto", "respuesta_numerica"], keep="first")
    df = df[~identicas].copy()
    registrar("duplicados_identicos", identicas.sum(), "repeticiones de carga, eliminadas")

    # Lo que quede repetido tras quitar las identicas es una contradiccion real:
    # el mismo graduado, misma encuesta, misma pregunta, dos respuestas distintas.
    contradictorias = df.duplicated(subset=clave, keep=False)
    personas = df.loc[contradictorias, "persona_id"].nunique()
    df = df[~contradictorias].copy()
    registrar("duplicados_contradictorios", contradictorias.sum(),
              f"respuestas incompatibles del mismo graduado, excluidas ({personas} personas)")
    return df


# ===========================================================================
# PASO 5 · Topes de plausibilidad  (H-09)
# ===========================================================================
def aplicar_topes(df):
    paso(5, "Aplicar topes de plausibilidad a las preguntas abiertas numericas")
    es_numero = df.tipo_pregunta == cfg.TIPO_NUMERO
    fuera_total = 0
    for pn, g in df[es_numero].groupby("pregunta_norm"):
        lo, hi = cfg.TOPES[cfg.tope_para(pn)]
        fuera = g.index[(g.valor_numerico < lo) | (g.valor_numerico > hi)]
        df.loc[fuera, "valor_numerico"] = pd.NA
        fuera_total += len(fuera)
    registrar("fuera_de_rango", fuera_total,
              "meses fuera de 0-120, salarios fuera de 100-5000 USD, conteos fuera de 0-50")
    return df


# ===========================================================================
# PASO 6 · Marcar comparabilidad  (H-03, H-08)
# ===========================================================================
def marcar_comparabilidad(df):
    paso(6, "Marcar comparabilidad: nucleo comun de preguntas y periodos abiertos")

    df["ola"] = df.periodo_encuesta.str.split().str[0].map(cfg.OLAS)
    df["anio_encuesta"] = df.periodo_encuesta.str.extract(r"(\d{4})").astype(int)

    excluidas = df.periodo_encuesta.isin(cfg.OLAS_EXCLUIDAS)
    df = df[~excluidas].copy()
    registrar("olas_incompletas", excluidas.sum(),
              "Primera encuesta 2026: 1 respondente, periodo en curso")
    df["periodo_abierto"] = df.periodo_encuesta.isin(cfg.OLAS_EN_CURSO)

    # Nucleo comun: preguntas presentes en TODAS las olas cerradas de cada familia
    cerradas = df[~df.periodo_abierto]
    conjuntos = cerradas.groupby("periodo_encuesta").pregunta_norm.apply(set)
    df["nucleo_ola"] = False
    for fam, num in cfg.OLAS.items():
        ss = [v for k, v in conjuntos.items() if k.startswith(fam)]
        if not ss:
            continue
        nucleo = set.intersection(*ss)
        df.loc[(df.ola == num) & df.pregunta_norm.isin(nucleo), "nucleo_ola"] = True
        print(f"      -> {fam}: nucleo comparable de {len(nucleo)} preguntas")
    nucleo_total = set.intersection(*conjuntos.values) if len(conjuntos) else set()
    df["nucleo_global"] = df.pregunta_norm.isin(nucleo_total)
    print(f"      -> nucleo comun a todas las olas: {len(nucleo_total)} preguntas")
    QC["notas"]["nucleo_global"] = len(nucleo_total)
    return df


# ===========================================================================
# PASO 7 · Enriquecer por cruce  (§3 de la auditoria)
# ===========================================================================
def leer_estudiantes():
    """Recorre las bases de estudiantes una sola vez y devuelve perfil + poblacion."""
    C = cfg.COLS_ESTUDIANTES
    perfil, notas, poblacion = {}, {}, {}
    for ruta in cfg.XLSX_ESTUDIANTES:
        print(f"      leyendo {ruta.name} ...")
        wb = openpyxl.load_workbook(ruta, read_only=True)
        for fila in wb.worksheets[0].iter_rows(min_row=2, values_only=True):
            ins = fila[C["inscripcion_id"]]
            if ins is None:
                continue
            if ins not in perfil:
                perfil[ins] = {k: fila[i] for k, i in C.items() if k != "nota_final"}
                poblacion[ins] = [fila[C["graduado"]], fila[C["fechagraduado"]],
                                  fila[C["carrera_estudiante"]], fila[C["modalidad"]]]
            else:
                # Cada inscripcion trae una fila por periodo cursado: 'graduado'
                # vale NO mientras la persona estudia y SI cuando se titula.
                # Quedarse con la primera fila perdia 39 titulados cuya primera
                # fila todavia decia NO. Basta un SI en cualquier fila, y la
                # fecha se toma de la fila que efectivamente la traiga.
                if fila[C["graduado"]] == "SI":
                    poblacion[ins][0] = "SI"
                    fg = fila[C["fechagraduado"]]
                    if fg is not None and str(fg).strip() != cfg.NULO_SQL:
                        poblacion[ins][1] = fg
            nota = fila[C["nota_final"]]
            if nota is not None:
                notas.setdefault(ins, []).append(nota)
        wb.close()
    return perfil, notas, poblacion


def enriquecer(df):
    paso(7, "Enriquecer por cruce con las bases de estudiantes")
    perfil, notas, poblacion = leer_estudiantes()

    p = pd.DataFrame.from_dict(perfil, orient="index")
    p.index.name = "inscripcion_id"
    p["nota_promedio"] = pd.Series({k: sum(v) / len(v) for k, v in notas.items()})
    p["fechagraduado"] = pd.to_datetime(p.fechagraduado, errors="coerce")
    p["cohorte"] = p.fechagraduado.dt.year
    p["rango_edad"] = p.edad_ingreso_carrera.map(cfg.rango_edad)

    cols = ["sexo", "edad_ingreso_carrera", "rango_edad", "provincia", "etnia",
            "discapacidad", "grupo_socioeconomico", "nota_promedio",
            "fechagraduado", "cohorte", "periodo_graduacion_codigo", "carrera_vigente"]
    df = df.merge(p[cols], left_on="inscripcion_id", right_index=True, how="left")

    df["enriquecido"] = df.cohorte.notna()
    cruzan = df.loc[df.enriquecido, "persona_id"].nunique()
    total = df.persona_id.nunique()
    print(f"      -> {cruzan:,} de {total:,} graduados enriquecidos "
          f"({100*cruzan/total:.1f}%)".replace(",", "."))
    QC["notas"]["cruce"] = {
        "graduados_enriquecidos": int(cruzan), "graduados_totales": int(total),
        "tasa": round(100 * cruzan / total, 1),
        "limite": "La base de estudiantes arranca en las titulaciones de 2022; "
                  "las olas de 2021 no cruzan por corte temporal, no por error.",
    }

    # Verificacion del diseno longitudinal: PRIMERA=0, SEGUNDA=+1, TERCERA=+2
    v = df[df.enriquecido].drop_duplicates(["persona_id", "periodo_encuesta"])
    desfase = (v.anio_encuesta - v.cohorte)
    coherente = (desfase == v.ola).mean()
    print(f"      -> diseno longitudinal verificado en el {100*coherente:.1f}% de los pares persona-ola")
    QC["notas"]["diseno_longitudinal"] = round(100 * float(coherente), 1)

    # Poblacion de titulados: el denominador para la tasa de respuesta (H-13).
    # Se le aplica la MISMA exclusion de carreras no vigentes: si el numerador
    # deja fuera una combinacion y el denominador la conserva, la tasa de
    # respuesta sale artificialmente baja.
    pob = pd.DataFrame(poblacion,
                       index=["graduado", "fechagraduado", "carrera_origen", "modalidad"]).T
    pob = pob[pob.graduado == "SI"].copy()
    antes = len(pob)
    pob = pob[~pob.apply(lambda r: cfg.es_no_vigente(r.carrera_origen, r.modalidad), axis=1)]
    print(f"      -> titulados excluidos por carrera no vigente: {antes - len(pob):,}"
          .replace(",", "."))
    pob["cohorte"] = pd.to_datetime(pob.fechagraduado, errors="coerce").dt.year
    pob["carrera"] = pob.carrera_origen.str.strip().map(cfg.CARRERAS)
    pob["encuestado"] = pob.index.isin(set(df.inscripcion_id.unique()))
    print(f"      -> universo de titulados: {len(pob):,} personas".replace(",", "."))
    return df, pob


# ===========================================================================
# PASO 8 · Nivel persona-ola
# ===========================================================================
def construir_personas(df):
    paso(8, "Construir la tabla de persona-ola (unidad de conteo del tablero)")
    cols = ["persona_id", "inscripcion_id", "periodo_encuesta", "ola", "anio_encuesta",
            "periodo_abierto", "carrera", "malla", "modalidad", "sexo", "rango_edad",
            "edad_ingreso_carrera", "provincia", "etnia", "discapacidad",
            "grupo_socioeconomico", "nota_promedio", "cohorte", "enriquecido"]
    per = df[cols].drop_duplicates(["persona_id", "periodo_encuesta"]).reset_index(drop=True)
    print(f"      -> {len(per):,} pares persona-ola · "
          f"{per.persona_id.nunique():,} personas".replace(",", "."))
    return per


def main():
    cfg.DIR_BUILD.mkdir(exist_ok=True)
    print("=" * 74)
    print("DEPURACION · SEGUIMIENTO A GRADUADOS FACSECYD")
    print("=" * 74)

    df, n0 = cargar_y_tipificar()
    df = limpiar_texto(df)
    df = normalizar_categorias(df)
    df = resolver_duplicados(df)
    df = aplicar_topes(df)
    df = marcar_comparabilidad(df)
    df, pob = enriquecer(df)
    per = construir_personas(df)

    QC["filas_origen"] = int(n0)
    QC["filas_depuradas"] = int(len(df))
    QC["graduados"] = int(df.persona_id.nunique())

    df.to_pickle(cfg.PKL_LIMPIO)
    per.to_pickle(cfg.PKL_PERSONAS)
    pob.to_pickle(cfg.PKL_POBLACION)
    cfg.JSON_QC.write_text(json.dumps(QC, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n" + "=" * 74)
    print(f"Filas: {n0:,} -> {len(df):,}  ({100*len(df)/n0:.1f}% conservado)".replace(",", "."))
    print(f"Graduados: {df.persona_id.nunique():,}".replace(",", "."))
    print(f"\nEscrito en build/:\n  {cfg.PKL_LIMPIO.name}\n  {cfg.PKL_PERSONAS.name}"
          f"\n  {cfg.PKL_POBLACION.name}\n  {cfg.JSON_QC.name}")
    print("\nSiguiente paso:  python scripts/02_agregar_graduados.py")


if __name__ == "__main__":
    main()
