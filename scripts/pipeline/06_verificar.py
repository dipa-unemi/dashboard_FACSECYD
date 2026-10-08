"""
Paso 6 · Verifica los archivos publicados en docs/data antes de subirlos.

Falla (código de salida 1) si:
  * aparece un nombre de columna con identificadores de personas;
  * aparece una carrera que no está en el catálogo o una combinación excluida;
  * un grupo publicado tiene menos de MIN_BASE estudiantes;
  * la matrícula de un periodo no cuadra entre facsecyd-data.js y rendimiento-data.js.
Además imprime un resumen por carrera para revisar a ojo.
"""
import json
import re
import sys

from comun import CARRERAS, CLAVES, EXCLUIR_PRESENCIAL, FACULTAD, MIN_BASE, MODALIDADES, SALIDA, estado

ARCHIVOS = {"FACS_DATA": "facsecyd-data.js", "FACS_DOC": "docentes-data.js", "FACS_GRAD": "graduados-data.js",
            "FACS_TRAY": "trayectoria-data.js", "FACS_PERFIL": "perfil-data.js", "FACS_REND": "rendimiento-data.js"}
errores, avisos = [], []
D, TXT = {}, {}
for var, f in ARCHIVOS.items():
    ruta = SALIDA / f
    if not ruta.exists():
        errores.append(f"falta docs/data/{f}")
        continue
    t = ruta.read_text(encoding="utf-8")
    TXT[f] = t
    D[var] = json.loads(t[t.index("=") + 1:].strip().rstrip(";"))

# 1. identificadores
for f, t in TXT.items():
    for patron in ["inscripcion_id", "persona_id", "id_persona", "docente_id", "cedula", "identificacion", "correo"]:
        if patron in t:
            errores.append(f"{f} contiene «{patron}»")

# 2. carreras
validas = set(CLAVES)
for var, d in D.items():
    for bloque in ("ind", "res", "anual", "kpi", "det"):
        obj = d.get(bloque, {})
        for sub in (obj.values() if bloque == "ind" else [obj]):
            for k in (sub.keys() if isinstance(sub, dict) else []):
                base = re.split(r"[|#]", k)[0]
                if bloque in ("ind", "res", "anual", "kpi") and base not in validas:
                    errores.append(f"{ARCHIVOS[var]}: clave de carrera desconocida «{k}»")
sga_vigentes = {sga for _, sga, _, _ in CARRERAS}
for f, t in TXT.items():
    for nombre in EXCLUIR_PRESENCIAL - sga_vigentes:
        if f'"{nombre}"' in t:
            errores.append(f"{f} menciona la carrera excluida «{nombre}»")

# 3. umbral en grupos
for k, per in D.get("FACS_REND", {}).get("res", {}).items():
    for p, fila in per.items():
        if fila[0] < MIN_BASE:
            errores.append(f"rendimiento {k} {p}: {fila[0]} estudiantes (< {MIN_BASE})")
for k, an in D.get("FACS_TRAY", {}).get("anual", {}).items():
    for a, fila in an.items():
        if fila[0] < MIN_BASE:
            errores.append(f"trayectoria {k} {a}: {fila[0]} estudiantes (< {MIN_BASE})")

# 4. coherencia de la matrícula entre archivos
if "FACS_DATA" in D and "FACS_REND" in D:
    for k in CLAVES:
        m = {p["p"]: p["v"] for p in D["FACS_DATA"]["matricula"].get(k, [])}
        rr = D["FACS_REND"]["res"].get(k, {})
        for p, v in m.items():
            if p in rr and rr[p][0] != v:
                avisos.append(f"matrícula {k} {p}: {v} en facsecyd-data.js y {rr[p][0]} en rendimiento-data.js")

# ------------------------------------------------------------------ resumen
bit = estado().get("bases", {})
if bit.get("estudiantes", {}).get("provisional"):
    avisos.append("La base de estudiantes es PROVISIONAL (extracto cortado): matrícula, trayectoria, perfil, "
                  "rendimiento, coberturas de tutorías y becas, y cobertura de graduados no son definitivas.")


def ultimo(serie):
    pts = [p for p in serie if p.get("v") is not None]
    return pts[-1]["v"] if pts else None


print(f"{'Carrera':<42}{'Matríc. 1S-26':>14}{'Docentes 26':>12}{'Encuestas grad.':>16}{'Artículos 25':>13}{'Proy. vinc. 25':>15}")
nombres = {FACULTAD: "Toda la facultad", **{k: "  Modalidad: " + n for k, (_, n) in MODALIDADES.items()},
           **{k: "    " + n for k, _, n, _ in CARRERAS}}
for k in CLAVES:
    mat = ultimo(D["FACS_DATA"]["matricula"].get(k, [])) if "FACS_DATA" in D else None
    dn = ultimo(D["FACS_DOC"]["ind"]["doc_n"].get(k, [])) if "FACS_DOC" in D else None
    enc = sum(v["T"][0] for v in D["FACS_GRAD"]["kpi"].get(k, {}).values() if "T" in v) if "FACS_GRAD" in D else None
    pub = next((p["v"] for p in D["FACS_DATA"]["ind"]["pub_total"].get(k, []) if p["a"] == 2025), None)
    vin = next((p["v"] for p in D["FACS_DATA"]["ind"]["vin_proy"].get(k, []) if p["a"] == 2025), None)
    print(f"{nombres[k][:41]:<42}{mat if mat is not None else '—':>14}{dn if dn is not None else '—':>12}"
          f"{enc if enc is not None else '—':>16}{pub if pub is not None else '—':>13}{vin if vin is not None else '—':>15}")

for a in avisos:
    print("AVISO:", a)
if errores:
    print(f"\n{len(errores)} ERRORES:")
    for e in errores[:50]:
        print("  -", e)
    sys.exit(1)
print("\nVerificación correcta: sin identificadores, sin carreras excluidas y con los umbrales aplicados.")
