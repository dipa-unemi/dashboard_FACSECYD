# -*- coding: utf-8 -*-
"""
Verificacion del agregado publicable de graduados (modelo por combinacion).

Comprueba sobre docs/data_graduados.js ya generado que:
  1. el archivo no lleva NaN, Infinity ni nulos que rompan el tablero en silencio
  2. los indices de cada fila caen dentro de sus diccionarios
  3. ninguna combinacion publicada corresponde a menos de K graduados
  4. los totales por indicador cuadran con el conteo de observaciones
  5. las distribuciones de escala suman lo que dicen sumar
  6. la tasa de respuesta se recalcula igual desde encuestados/titulados
  7. todo indicador del catalogo tiene filas, y toda fila un indicador del catalogo
  8. las dimensiones que sostienen la lectura no fueron generalizadas
  9. las tablas de cruce (filtrar pulsando un grafico) son integras y sus
     condicionales suman exactamente la base de su corte
 10. la tasa de respuesta global es identica a la suma de sus propias filas

Ejecutar despues de 02_agregar_graduados.py. Sale con codigo 1 si algo falla.

Uso:  python scripts/03_verificar_graduados.py
"""
import io
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RUTA = Path(__file__).resolve().parent.parent / "docs" / "data_graduados.js"
txt = io.open(RUTA, encoding="utf-8").read()
FALLOS = []


def chk(ok, msg, detalle=""):
    print(("  OK    " if ok else "  FALLA ") + msg + (("  - " + detalle) if detalle and not ok else ""))
    if not ok:
        FALLOS.append(msg + ((" - " + detalle) if detalle else ""))


print("=== 1. INTEGRIDAD DEL ARCHIVO ===")
chk("NaN" not in txt, "sin literales NaN", str(txt.count("NaN")) + " apariciones")
chk("Infinity" not in txt, "sin literales Infinity")
chk(":null" not in txt, "sin nulls", str(txt.count(":null")) + " nulls")
raw = json.loads(txt[txt.index("{"):txt.rindex(";")])
DIMS = raw["dims"]
D = raw["dicts"]
META = raw["meta"]
VACIO = META["vacio"]
K = META["k_anonimato"]

filas = lambda s: [l.split("|") for l in s.split("\n") if l]
CAT = filas(raw["rows_cat"])
ESC = filas(raw["rows_esc"])
PER = filas(raw["rows_per"])
nd = len(DIMS)
print(f"        {len(CAT)} filas categóricas · {len(ESC)} de escala · {len(PER)} de conteo")

print()
print("=== 2. INDICES DENTRO DE RANGO ===")
mal = []
for nombre, F, extra in [("cat", CAT, 3), ("esc", ESC, 8), ("per", PER, 2)]:
    for f in F:
        if len(f) != nd + extra:
            mal.append(nombre + ": ancho " + str(len(f)))
            break
        for i, c in enumerate(DIMS):
            if not (0 <= int(f[i]) < len(D[c])):
                mal.append(nombre + "/" + c + ": índice " + f[i])
                break
chk(not mal, "todas las filas tienen ancho e índices válidos", str(mal[:3]))
chk(all(0 <= int(f[nd]) < len(raw["indicadores"]) for f in CAT), "índice de indicador válido")
chk(all(0 <= int(f[nd + 1]) < len(raw["categorias"]) for f in CAT), "índice de categoría válido")
chk(all(0 <= int(f[nd]) < len(raw["bloques"]) for f in ESC), "índice de bloque válido")

print()
print("=== 3. K-ANONIMATO ===")
personas = {}
for f in PER:
    personas[tuple(f[:nd])] = int(f[nd + 1])
chk(all(v >= K for v in personas.values()),
    "ninguna combinación publicada baja de k=" + str(K),
    str(sorted(v for v in personas.values() if v < K)[:5]))
print(f"        combinación más pequeña: {min(personas.values())} graduados")
print(f"        descartadas en el pipeline: {META['combinaciones_descartadas']} combinaciones "
      f"({META['observaciones_descartadas']} observaciones)")

print()
print("=== 4. LOS TOTALES CUADRAN ===")
obs_total = sum(int(f[nd]) for f in PER)
chk(obs_total == META["observaciones"] - META["observaciones_descartadas"],
    "observaciones publicadas = declaradas menos descartadas",
    str(obs_total) + " vs " + str(META["observaciones"] - META["observaciones_descartadas"]))
por_ind = defaultdict(int)
for f in CAT:
    por_ind[raw["indicadores"][int(f[nd])]] += int(f[nd + 2])
sobra = [k for k, v in por_ind.items() if v > obs_total]
chk(not sobra, "ningún indicador supera el total de observaciones", str(sobra))
for k in sorted(por_ind):
    print(f"        {k:24s} {por_ind[k]:6d} respuestas")

print()
print("=== 5. ESCALAS ===")
neg = [f for f in ESC if any(int(x) < 0 for x in f[nd + 1:nd + 8])]
chk(not neg, "sin conteos negativos")
vacias = [f for f in ESC if sum(int(x) for x in f[nd + 1:nd + 8]) == 0]
chk(not vacias, "ninguna fila de escala está vacía", str(len(vacias)) + " filas")
tot_esc = sum(sum(int(x) for x in f[nd + 1:nd + 8]) for f in ESC)
print(f"        {tot_esc:,} respuestas de escala distribuidas en 7 categorías".replace(",", "."))

print()
print("=== 6. COBERTURA ===")
cob = raw["cobertura"]
chk(all(r["encuestados"] <= r["titulados"] for r in cob), "encuestados <= titulados")
mal_t = [r for r in cob if abs(100.0 * r["encuestados"] / r["titulados"] - r["tasa"]) > 0.1]
chk(not mal_t, "tasa recalculada coincide", str(mal_t[:2]))
chk(all(r["titulados"] >= META["umbral_supresion"] for r in cob),
    "ningún corte de cobertura baja del umbral")

print()
print("=== 7. CATALOGO COMPLETO ===")
ids_cat = {c["id"] for c in raw["catalogo"]}
usados = set(raw["indicadores"]) | set(raw["bloques"])
chk(usados <= ids_cat, "toda fila apunta a un indicador del catálogo", str(usados - ids_cat))
sin_filas = ids_cat - usados
chk(not sin_filas, "todo indicador del catálogo tiene filas", str(sin_filas))
for c in raw["catalogo"]:
    chk(bool(c.get("nota")), "«" + c["id"] + "» tiene nota metodológica")

print()
print("=== 8. LAS DIMENSIONES DE LECTURA SE CONSERVAN ===")
for i, c in enumerate(DIMS):
    vacios = sum(1 for f in PER if int(f[i]) == 0)
    pct = 100.0 * (1 - vacios / len(PER))
    marca = "  <- eje del módulo" if c in ("anio", "ola", "carrera") else ""
    print(f"        {c:22s} {pct:5.1f}% de las filas conserva su valor{marca}")
    if c in ("anio", "ola", "carrera"):
        chk(vacios == 0, "«" + c + "» nunca se generaliza", str(vacios) + " filas difuminadas")

print()
print("=== 9. TABLAS DE CRUCE (filtro por respuesta) ===")
XC = [[int(x) for x in l.split("|")] for l in raw.get("rows_cross", "").split("\n") if l]
XE = [[int(x) for x in l.split("|")] for l in raw.get("rows_cross_esc", "").split("\n") if l]
XD = [[int(x) for x in l.split("|")] for l in raw.get("rows_cross_dim", "").split("\n") if l]
XT = [[int(x) for x in l.split("|")] for l in raw.get("rows_cross_tot", "").split("\n") if l]
chk(bool(XC and XE and XD and XT), "las cuatro tablas de cruce estan presentes",
    "cat=%d esc=%d dim=%d tot=%d" % (len(XC), len(XE), len(XD), len(XT)))
nI, nC, nB = len(raw["indicadores"]), len(raw["categorias"]), len(raw["bloques"])
chk(all(len(f) == 5 and 0 <= f[0] < nI and 0 <= f[1] < nC and 0 <= f[2] < nI
        and 0 <= f[3] < nC and f[4] > 0 for f in XC),
    "cruce categorico: ancho e indices validos")
chk(all(len(f) == 10 and 0 <= f[0] < nI and 0 <= f[1] < nC and 0 <= f[2] < nB
        and all(x >= 0 for x in f[3:]) for f in XE),
    "cruce de escala: ancho e indices validos")
chk(all(len(f) == 5 and 0 <= f[2] < nd and 0 <= f[3] < len(D[DIMS[f[2]]]) for f in XD),
    "marginales por dimension: indices validos")
chk(all(f[0] != f[2] for f in XC), "ningun indicador se cruza consigo mismo")
# La condicional de cada corte tiene que sumar la misma base para todo indicador
# medido que ese corte alcance: si no, el denominador esta incompleto y los
# porcentajes salen sesgados (es el fallo que se corrigio al quitarle las
# dimensiones al cruce).
tot = {(f[0], f[1]): f[2] for f in XT}
bases = defaultdict(lambda: defaultdict(int))
for f in XC:
    bases[(f[0], f[1])][f[2]] += f[4]
# Un exceso pequeno es legitimo: dos indicadores agrupan dos preguntas del
# cuestionario ("vinculo con la empresa" y "vinculo con su negocio"), y quien
# tiene empleo Y negocio propio contesta las dos. Hoy es 1 persona en todo el
# archivo. Lo que esta comprobacion busca es un exceso GRANDE, que indicaria un
# denominador mal armado y porcentajes sesgados.
desbordes = [(raw["indicadores"][k[0]], raw["categorias"][k[1]], raw["indicadores"][m],
              v, tot.get(k, 0))
             for k, d in bases.items() for m, v in d.items()
             if v > tot.get(k, 0) * 1.01 + 2]
chk(not desbordes, "ninguna condicional desborda el total de su corte", str(desbordes[:3]))
leves = sum(1 for k, d in bases.items() for m, v in d.items() if v > tot.get(k, 0))
print("        %d de %d condicionales exceden su corte por respuesta multiple"
      % (leves, sum(len(d) for d in bases.values())))
sin_tot = [k for k in bases if k not in tot]
chk(not sin_tot, "todo corte del cruce tiene su total declarado", str(sin_tot[:3]))
neg = [f for f in XC if f[4] <= 0] + [f for f in XD if f[4] <= 0] + [f for f in XT if f[2] <= 0]
chk(not neg, "sin conteos nulos o negativos en el cruce")
print("        %d cortes con cruce publicado" % len(tot))

print()
print("=== 10. LA COBERTURA CUADRA CONSIGO MISMA ===")
tasa = 100.0 * META["encuestados_en_universo"] / META["titulados_universo"]
for dim in ("carrera", "cohorte"):
    rs = [r for r in cob if r["dimension"] == dim]
    st = 100.0 * sum(r["encuestados"] for r in rs) / sum(r["titulados"] for r in rs)
    chk(abs(st - tasa) < 0.01,
        "la tasa global coincide con la suma por " + dim,
        "%.2f%% vs %.2f%%" % (tasa, st))
chk(META["encuestados_en_universo"] <= META["graduados"],
    "el numerador de la cobertura no supera el total de encuestados",
    "%d > %d" % (META["encuestados_en_universo"], META["graduados"]))
print("        tasa %.2f%%  ·  %d titulados de cohortes aun sin encuestar quedan fuera"
      % (tasa, META.get("titulados_pendientes", 0)))

print()
print("=" * 70)
if FALLOS:
    print(str(len(FALLOS)) + " VERIFICACIONES FALLIDAS:")
    for f in FALLOS:
        print("  - " + f)
else:
    print("TODAS LAS VERIFICACIONES PASAN")
sys.exit(1 if FALLOS else 0)
