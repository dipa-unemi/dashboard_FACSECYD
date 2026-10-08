"""
Paso 1 · Lee los extractos del SGA, aplica los filtros de la Dirección y guarda
cada base depurada en DATOS/_procesado/<base>.parquet.

Filtros (en este orden, y se registra cuántas filas quita cada uno):
  1. Combinaciones carrera + PRESENCIAL no vigentes (comun.EXCLUIR_PRESENCIAL).
     Las bases sin columna de modalidad (evaluación y satisfacción docente,
     vinculación) excluyen por nombre solo las carreras que no tienen ninguna
     versión vigente; ECONOMIA, PSICOLOGIA, TURISMO y TRABAJO SOCIAL 2019 se
     conservan porque su versión vigente (en línea o semipresencial) usa el mismo nombre.
  2. Carreras fuera del catálogo (nombres antiguos que no corresponden a
     ninguna carrera vigente, p. ej. COMERCIO 2019 en vinculación).
  3. Periodo ABRIL- MAYO 2021 (codificado 1S-2021 en el SGA).
     En estudiantes, además, las asignaturas de comun.ASIGNATURAS_EXCLUIDAS
     (Inglés VI y VII de General English), y en cada asignatura registrada dos veces en
     el mismo periodo se conserva la fila elegida por la Dirección (comun.DECISION_REPETIDAS).
  4. Limpieza propia de cada base (duplicados exactos, \\N, números como texto).

Estudiantes: el extracto supera el límite de filas de Excel y se exporta en partes.
Se usan, en este orden: Result_estudiante_2_parte<n>.xlsx; o Result_estudiante_2_<n>.parquet
(scripts/00_estudiantes_a_parquet.R); o, si no hay partes, el .xlsx único, que se marca
como PROVISIONAL si llegó al límite de filas.

Uso:  python scripts/pipeline/01_preparar_bases.py
"""
import json
import sys
import time
from datetime import datetime

import pandas as pd

from pathlib import Path

from comun import (ASIGNATURAS_EXCLUIDAS, CARRERAS, CLAVE_DE, DATOS, DECISION_REPETIDAS, EXCLUIR_PRESENCIAL,
                   PERIODO_EXCLUIDO, PROC)

LIMITE_EXCEL = 1_048_575

# base: (archivo, columna de carrera, columna de modalidad o None)
BASES = {
    "becas":       ("Result_beca_sga_2.xlsx", "carrera_estudiante", "modalidad"),
    "tutorias":    ("Result_tutorias_2.xlsx", "carrera_estudiante", "modalidad"),
    "docentes":    ("Result_docente_2.xlsx", "carrera_asignatura", "modalidad"),
    "desempeno":   ("Result_desepeno_docente_2.xlsx", "carrera", None),
    "produccion":  ("Result_produccion_cientifica_2.xlsx", "carrera", "modalidad"),
    "vinculacion": ("Result_vinculacion_2.xlsx", "carrera", None),
    "sat_est":     ("Result_satisfaccion_est_2.xlsx", "carrera", "modalidad"),
    "sat_doc":     ("Result_satisfacion_doc_2.xlsx", "carrera", None),
    "graduados":   ("Result_seguimiento_graduado_2.xlsx", "carrera_estudiante", "modalidad"),
    "estudiantes": ("Result_estudiante_2.xlsx", "carrera_estudiante", "modalidad"),
}
TILDES = str.maketrans("ÁÉÍÓÚáéíóú", "AEIOUaeiou")


def norm(s):
    return s.astype("string").str.strip().str.upper().str.translate(TILDES)


CATALOGO = {k.translate(TILDES): v for k, v in CLAVE_DE.items()}
EXCLUIR = {x.translate(TILDES) for x in EXCLUIR_PRESENCIAL}
SIN_VERSION_VIGENTE = EXCLUIR - set(CATALOGO)
MODALIDAD_DE = {k: mod.translate(TILDES) for k, _, _, mod in CARRERAS}


def leer_excel(archivo):
    return pd.read_excel(DATOS / archivo, engine="calamine")


def leer_estudiantes(bit):
    # 1.º las partes en Excel (Result_estudiante_2_parte1.xlsx, ...), 2.º las partes en parquet
    # (scripts/00_estudiantes_a_parquet.R), 3.º el archivo único (cortado si llegó al límite).
    partes = sorted(p for p in DATOS.glob("Result_estudiante_2_parte*.xlsx") if not p.name.startswith("~$"))
    if partes:
        bit["fuente"] = [p.name for p in partes]
        dfs = [leer_excel(p.name) for p in partes]
        for p, d in zip(partes, dfs):
            if len(d) >= LIMITE_EXCEL:
                sys.exit(f"{p.name} tiene {len(d):,} filas: llegó al límite de Excel y está cortado.")
        df = pd.concat(dfs, ignore_index=True)
        repetidas = df.duplicated(["inscripcion_id", "periodo_codigo", "asignatura_id"], keep=False) & ~df.duplicated(keep=False)
        bit["asignatura_dos_veces_en_el_periodo"] = int(repetidas.sum())
        return df
    partes = sorted(DATOS.glob("Result_estudiante_2_*.parquet"))
    if partes:
        bit["fuente"] = [p.name for p in partes]
        return pd.concat([pd.read_parquet(p) for p in partes], ignore_index=True)
    df = leer_excel(BASES["estudiantes"][0])
    bit["fuente"] = [BASES["estudiantes"][0]]
    if len(df) >= LIMITE_EXCEL:
        bit["provisional"] = True
        bit["aviso"] = ("El extracto llegó al límite de filas de Excel y está cortado: faltan carreras "
                        "o periodos. Las cifras que dependen de estudiantes son PROVISIONALES hasta "
                        "convertir el extracto completo con scripts/00_estudiantes_a_parquet.R.")
    return df


def sanear_tipos(df):
    """Deja cada columna con un solo tipo para poder escribirla en parquet."""
    for c in df.columns:
        if df[c].dtype == object:
            no_nulos = df[c].dropna()
            tipos = {type(v) for v in no_nulos.head(50000)}
            if tipos <= {str}:
                df[c] = df[c].astype("string")
            elif tipos <= {int, float}:
                df[c] = pd.to_numeric(df[c], errors="coerce")
            else:
                df[c] = df[c].map(lambda v: None if pd.isna(v) else str(v)).astype("string")
    for c in [c for c in df.columns if c.endswith("_id") or c in ("id_persona",)]:
        if pd.api.types.is_float_dtype(df[c]) and (df[c].dropna() % 1 == 0).all():
            df[c] = df[c].astype("Int64")
    return df


def a_numero(df, columnas):
    for c in columnas:
        if c in df:
            df[c] = pd.to_numeric(df[c].replace({"\\N": None}), errors="coerce")
    return df


CLAVE_REP = ["inscripcion_id", "periodo_codigo", "asignatura_id"]
FIRMA_REP = ["numero_matricula", "nota_final", "estado_materia"]


def resolver_repetidas(df, bit):
    """Asignatura dos veces en el mismo periodo: conserva la fila que eligió la Dirección
    (comun.DECISION_REPETIDAS) y descarta la otra. Los casos sin decisión se dejan y se informan."""
    ruta, hoja = DECISION_REPETIDAS
    num = lambda s: pd.to_numeric(s, errors="coerce")
    clave = df[CLAVE_REP].assign(inscripcion_id=num(df.inscripcion_id), asignatura_id=num(df.asignatura_id))
    rep = clave.duplicated(keep=False)
    bit["asignatura_repetida_casos"] = int(clave[rep].drop_duplicates().shape[0])
    if not rep.any():
        return df
    if not ruta.exists():
        bit["asignatura_repetida_sin_decision"] = bit["asignatura_repetida_casos"]
        print(f"      Aviso: no está {ruta.name}; {bit['asignatura_repetida_casos']} casos de asignatura repetida se dejan con sus dos filas.")
        return df
    try:
        dec = pd.read_excel(ruta, sheet_name=hoja, engine="calamine")
    except PermissionError:
        # El Excel está abierto y Excel lo bloquea para Python; el copiado de Windows sí puede leerlo.
        import subprocess, tempfile
        tmp = Path(tempfile.gettempdir()) / ("copia_" + ruta.name)
        r = subprocess.run(["powershell", "-NoProfile", "-Command",
                            f"Copy-Item -LiteralPath '{ruta}' -Destination '{tmp}' -Force"], capture_output=True)
        if r.returncode or not tmp.exists():
            sys.exit(f"No se puede leer {ruta.name} (está abierto en Excel). Ciérralo y vuelve a correr el pipeline.")
        dec = pd.read_excel(tmp, sheet_name=hoja, engine="calamine")
    dec = dec.assign(inscripcion_id=num(dec.inscripcion_id), asignatura_id=num(dec.asignatura_id),
                     numero_matricula=num(dec.numero_matricula), nota_final=num(dec.nota_final))
    assert not dec.duplicated(CLAVE_REP).any(), f"{ruta.name}: hay casos con más de una fila elegida"
    elegida = {tuple(r[CLAVE_REP]): tuple(r[FIRMA_REP]) for _, r in dec.iterrows()}
    descartar = []
    resueltos, sin_decision = 0, 0
    for k, idx in clave[rep].groupby(CLAVE_REP).groups.items():
        if k not in elegida:
            sin_decision += 1
            continue
        filas = df.loc[idx]
        firma = filas[FIRMA_REP].assign(numero_matricula=num(filas.numero_matricula), nota_final=num(filas.nota_final))
        quedan = [i for i, f in zip(idx, map(tuple, firma.values)) if f == elegida[k]]
        assert len(quedan) == 1, f"caso {k}: la fila elegida {elegida[k]} no aparece una sola vez en la base"
        descartar += [i for i in idx if i != quedan[0]]
        resueltos += 1
    bit["asignatura_repetida_resueltos"] = resueltos
    bit["asignatura_repetida_filas_descartadas"] = len(descartar)
    bit["asignatura_repetida_sin_decision"] = sin_decision
    if sin_decision:
        print(f"      Aviso: {sin_decision} casos de asignatura repetida sin decisión en {ruta.name}: se dejan con sus dos filas.")
    return df.drop(index=descartar)


def limpiar(nombre, df, bit):
    if nombre in ("tutorias", "estudiantes"):
        dup = df.duplicated()
        bit["duplicados_exactos"] = int(dup.sum())
        df = df[~dup]
    if nombre == "vinculacion":
        df = df.replace({"\\N": None})
        df = a_numero(df, ["anio_inicio", "horas", "presupuestototal", "cupos", "informes_total",
                           "informes_validos", "avance_sumado", "avance_pct", "benef_entidades",
                           "benef_directos_personas", "benef_indirectos_personas", "benef_directos_inst",
                           "benef_indirectos_inst", "estudiantes", "est_en_proceso", "est_culminados",
                           "est_retirados", "est_reprobados", "horas_est_culminados", "docentes"])
    if nombre == "desempeno":
        df = a_numero(df, [c for c in df.columns if c.startswith(("promedio_", "resultado_", "cap_", "hv_", "exp_anios", "titulos_"))]
                      + ["materias", "horas_semanales_asignadas", "exp_registros"])
    if nombre == "graduados":
        df = a_numero(df, ["respuesta_numerica"])
    if nombre == "estudiantes":
        df = a_numero(df, ["nota_final", "asistenciafinal", "numero_matricula", "edad_ingreso_carrera"])
        # Asignaturas excluidas (comun.ASIGNATURAS_EXCLUIDAS): se comprueba que el id siga
        # correspondiendo al mismo nombre, para no quitar otra asignatura si el SGA reutiliza un código.
        aid = pd.to_numeric(df.asignatura_id, errors="coerce")
        excl = aid.isin(list(ASIGNATURAS_EXCLUIDAS))
        nombres = set(df.loc[excl, "asignatura"].astype(str).str.strip().str.upper())
        assert nombres <= set(ASIGNATURAS_EXCLUIDAS.values()), f"el asignatura_id excluido tiene otro nombre: {nombres}"
        antes = set(zip(df.inscripcion_id, df.periodo_codigo))
        df = df[~excl]
        perdidos = antes - set(zip(df.inscripcion_id, df.periodo_codigo))
        bit["excluidas_asignaturas"] = {nom: int((aid[excl] == k).sum()) for k, nom in ASIGNATURAS_EXCLUIDAS.items()}
        bit["matriculas_sin_otras_asignaturas"] = len(perdidos)
        df = resolver_repetidas(df, bit)
    return df


def preparar(nombre):
    archivo, ccar, cmod = BASES[nombre]
    t0 = time.time()
    bit = {"archivo": archivo, "provisional": False}
    df = leer_estudiantes(bit) if nombre == "estudiantes" else leer_excel(archivo)
    bit["filas_origen"] = int(len(df))

    car = norm(df[ccar])
    # 1. combinaciones no vigentes
    if cmod:
        excl = car.isin(EXCLUIR) & (norm(df[cmod]) == "PRESENCIAL")
    else:
        excl = car.isin(SIN_VERSION_VIGENTE)
    bit["excluidas_no_vigentes"] = {k: int(v) for k, v in car[excl].value_counts().items()}
    df, car = df[~excl], car[~excl]
    # 2. fuera del catálogo
    fuera = ~car.isin(CATALOGO)
    bit["excluidas_fuera_catalogo"] = {k: int(v) for k, v in car[fuera].value_counts().items()}
    df, car = df[~fuera].copy(), car[~fuera]
    df["clave"] = car.map(CATALOGO).astype("string")
    # 3. periodo remedial
    if "periodo" in df:
        cod, nom = PERIODO_EXCLUIDO
        p = df.periodo.astype("string").str.strip() == nom
        if "periodo_codigo" in df:
            p &= df.periodo_codigo.astype("string").str.strip() == cod
        bit["excluidas_periodo"] = int(p.sum())
        df = df[~p]
    # modalidad distinta de la del catálogo (solo se informa)
    if cmod:
        otra = norm(df[cmod]) != df.clave.map(MODALIDAD_DE)
        if otra.any():
            bit["modalidad_distinta_del_catalogo"] = {
                f"{k} / {m}": int(n) for (k, m), n in df[otra].groupby(["clave", cmod]).size().items()}
    # 4. limpieza propia
    df = limpiar(nombre, df, bit)
    df = sanear_tipos(df.reset_index(drop=True))
    bit["filas_finales"] = int(len(df))
    bit["segundos"] = round(time.time() - t0, 1)
    df.to_parquet(PROC / f"{nombre}.parquet", index=False)
    return bit


def main():
    PROC.mkdir(parents=True, exist_ok=True)
    print("Datos:", DATOS)
    bitacora = {"generado": datetime.now().strftime("%Y-%m-%d %H:%M"), "bases": {}}
    for nombre in BASES:
        b = preparar(nombre)
        bitacora["bases"][nombre] = b
        quitadas = b["filas_origen"] - b["filas_finales"]
        print(f"  {nombre:<12} {b['filas_origen']:>9,} -> {b['filas_finales']:>9,} filas"
              f"  (-{quitadas:,})  {b['segundos']}s{'  ** PROVISIONAL **' if b['provisional'] else ''}"
              .replace(",", "."))
        if b.get("aviso"):
            print("     ", b["aviso"])
    (PROC / "bitacora.json").write_text(json.dumps(bitacora, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Bitácora:", PROC / "bitacora.json")


if __name__ == "__main__":
    main()
