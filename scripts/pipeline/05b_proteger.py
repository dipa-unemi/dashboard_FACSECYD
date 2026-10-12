"""
Supresión complementaria: que ninguna cifra suprimida pueda deducirse restando.

Los pasos 02, 04 y 05 ya vacían los grupos de menos de MIN_BASE personas, pero eso
solo no basta. Si se publica el total de una carrera y todas sus categorías menos una,
la que falta se obtiene restando. Este paso lee los archivos de docs/data/, encuentra
esos casos y suprime además la categoría publicada más pequeña del mismo grupo, para
que la resta ya no aísle a nadie. Es el mismo criterio del tablero de la FACS.

Se revisan tres vías de deducción, en cada periodo:
  * por categorías: total de la carrera − las demás categorías de la misma variable
    (sexo, nivel socioeconómico, etnia, tipo de ingreso, cohorte, nivel de la carrera);
  * por carreras: total de la modalidad (o de la facultad) − las demás carreras, en la
    misma categoría;
  * en graduados, por momento de la encuesta: total del año − los demás momentos.
Además, un total que se suprimió no debe poder rehacerse sumando sus partes.
Una celda suprimida es deducible si la resta da entre 1 y MIN_BASE − 1 personas. Si da
0, no hay nadie que proteger; si da MIN_BASE o más, hay personas sin la categoría
(p. ej. sin nivel socioeconómico registrado) y la resta no aísla a la celda.

Solo quita cifras: no recalcula ni cambia ninguna de las que quedan publicadas.

Uso:  python scripts/pipeline/05b_proteger.py            aplica y reescribe docs/data
      python scripts/pipeline/05b_proteger.py --medir    solo informa (no escribe)
"""
import json
import re
import sys
from pathlib import Path

MIN_BASE = 10   # el mismo de comun.py (aquí sin importarlo, para no requerir pandas)
GSE = {"BAJO", "MEDIO BAJO", "MEDIO TÍPICO", "MEDIO ALTO", "ALTO"}
DETALLE_DE = {"sat_est": ["sat_est"], "sat_serv": ["sat_serv"], "beca_cob": ["beca_tipo"]}
SALIDA = Path(__file__).resolve().parents[2] / "docs" / "data"


# --------------------------------------------------------------- lectura y escritura
def leer(archivo):
    txt = (SALIDA / archivo).read_text(encoding="utf-8")
    m = re.match(r"(/\*.*?\*/\n)window\.(\w+)=", txt, re.S)
    obj, fin = json.JSONDecoder().raw_decode(txt, m.end())
    assert txt[fin:] == ";\n", archivo
    return m.group(1), m.group(2), obj


def escribir(archivo, cabecera, var, obj):
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    (SALIDA / archivo).write_text(f"{cabecera}window.{var}={txt};\n", encoding="utf-8")


# --------------------------------------------------------------- claves
def partir(clave):
    """'ADM_L|sexo:MUJER' -> ('ADM_L', 'sexo', 'sexo:MUJER'); 'ADM_L' -> ('ADM_L', None, None)."""
    if "|" not in clave:
        return clave, None, None
    base, suf = clave.split("|", 1)
    if suf in GSE:
        return base, "gse", suf
    if re.fullmatch(r"N\d+", suf):
        return base, "nivel", suf
    return base, suf.split(":", 1)[0], suf


class Tabla:
    """Una tabla del tablero vista como celdas (clave, periodo) -> número de personas.

    celdas: dict clave -> dict periodo -> n (None = suprimida)
    quitar(clave, periodo): suprime la celda en el objeto original (y en sus tablas hermanas).
    extra(tabla): otros grupos (total, partes) propios de la tabla, como celdas (clave, periodo).
    """

    def __init__(self, nombre, celdas, quitar, dims, extra=None):
        self.nombre, self.celdas, self._quitar, self.dims = nombre, celdas, quitar, dims
        self.orig = {k: dict(v) for k, v in celdas.items()}
        self.extra = extra or (lambda t: [])
        self.quitadas = []

    def n(self, celda):
        k, p = celda
        return self.celdas.get(k, {}).get(p)

    def quitar(self, celda):
        k, p = celda
        self.celdas[k][p] = None
        self.quitadas.append(celda)
        for k2, p2 in self._quitar(k, p) or []:   # celdas que caen junto con esta
            if self.celdas.get(k2, {}).get(p2) is not None:
                self.celdas[k2][p2] = None


def hermanos(tabla, jerarquia):
    """Grupos (total, [partes]) de claves en que total = suma de las partes, por categorías y por carreras."""
    claves = list(tabla.celdas)
    # Las categorías de cada variable se toman de todas las carreras: una categoría
    # suprimida en todos los periodos ni siquiera tiene clave, y aun así cuenta como oculta.
    cats = {}
    for k in claves:
        base, dim, suf = partir(k)
        if dim in tabla.dims:
            cats.setdefault(dim, set()).add(suf)
    bases = {partir(k)[0] for k in claves}
    for base in sorted(bases):
        if base in tabla.celdas:
            for dim, sufs in cats.items():
                yield base, [f"{base}|{s}" for s in sorted(sufs)]
    sufijos = {partir(k)[2] for k in claves}
    for padre, hijos in jerarquia.items():
        for suf in sufijos:
            t = padre if suf is None else f"{padre}|{suf}"
            ps = [h if suf is None else f"{h}|{suf}" for h in hijos]
            if len(hijos) > 1 and t in tabla.celdas:
                yield t, ps


def grupos(tabla, jerarquia):
    """Todos los grupos (celda total, [celdas parte]) de la tabla."""
    for total, partes in hermanos(tabla, jerarquia):
        periodos = set(tabla.orig.get(total, {}))
        for k in partes:
            periodos |= set(tabla.orig.get(k, {}))
        for p in sorted(periodos):
            yield (total, p), [(k, p) for k in partes]
    yield from tabla.extra(tabla)


def deducibles(tabla, jerarquia):
    """Celdas suprimidas que se obtienen con sumas y restas: lista de
    (total, periodo, celda oculta, cifra deducida, celdas parte).

    a) total publicado y una sola parte oculta: la resta da entre 1 y MIN_BASE − 1;
    b) total oculto y todas las partes publicadas, que suman exactamente el total."""
    out = []
    for tc, partes in grupos(tabla, jerarquia):
        nt = tabla.n(tc)
        ocultas = [c for c in partes if tabla.n(c) is None]
        if nt is not None and len(ocultas) == 1:
            resta = nt - sum(tabla.n(c) for c in partes if c not in ocultas)
            if 0 < resta < MIN_BASE:
                out.append((tc[0], tc[1], ocultas[0][0], resta, partes))
        elif nt is None and not ocultas and tabla.orig.get(tc[0], {}).get(tc[1]) is not None:
            if sum(tabla.n(c) for c in partes) == tabla.orig[tc[0]][tc[1]]:
                out.append((tc[0], tc[1], tc[0], tabla.orig[tc[0]][tc[1]], partes))
    return out


def proteger(tabla, jerarquia):
    """Suprime la parte publicada más pequeña de cada grupo deducible, hasta que no quede ninguno."""
    while True:
        casos = deducibles(tabla, jerarquia)
        if not casos:
            return
        partes = casos[0][4]
        visibles = [(tabla.n(c), c) for c in partes if tabla.n(c) is not None]
        tabla.quitar(min(visibles)[1])


def sacar(obj, *ruta):
    """Borra obj[r0][r1]...[rn] y, si quedan vacíos, los diccionarios que lo contenían
    (como si el grupo nunca se hubiera publicado)."""
    if len(ruta) == 1:
        obj.pop(ruta[0], None)
        return
    hijo = obj.get(ruta[0])
    if isinstance(hijo, dict):
        sacar(hijo, *ruta[1:])
        if not hijo:
            del obj[ruta[0]]


# --------------------------------------------------------------- tablas del tablero
def tablas(datos):
    REND, TRAY, GRAD, DATA = (datos[f][2] for f in
                              ("rendimiento-data.js", "trayectoria-data.js", "graduados-data.js", "facsecyd-data.js"))
    out = []

    # Rendimiento: nivel, número de matrícula y bandas no son particiones (un estudiante cae en varias).
    def q_rend(k, p):
        sacar(REND["res"], k, p)
        sacar(REND["dist"], k, p)
    out.append(Tabla("rendimiento", {k: {p: f[0] for p, f in s.items()} for k, s in REND["res"].items()},
                     q_rend, {"sexo", "gse", "etnia", "cohorte", "tipo_ingreso"}))

    # Trayectoria: matrícula anual, cohortes, deserción y titulados.
    for t, dims in [("anual", {"sexo", "gse", "tipo_ingreso", "cohorte"}), ("coh", {"sexo", "gse"}),
                    ("des", {"sexo", "gse"}), ("tit", {"sexo", "gse", "cohorte"})]:
        n = (lambda f: f) if t == "tit" else (lambda f: f[0])
        out.append(Tabla(f"trayectoria.{t}", {k: {p: n(f) for p, f in s.items()} for k, s in TRAY[t].items()},
                         lambda k, p, t=t: sacar(TRAY[t], k, p), dims))

    # Graduados: año de encuesta × momento; kpi, distribuciones y competencias van juntos.
    def q_grad(k, am):
        # Sin el total del año (T), un solo momento visible podría coincidir con él: cae el año entero.
        a, m = am.split("/")
        for t in ("kpi", "dist", "comp"):
            if m == "T":
                sacar(GRAD[t], k, a)
            else:
                sacar(GRAD[t], k, a, m)
        return [(k, f"{a}/{x}") for x in "123"] if m == "T" else []
    def momentos(t):   # los momentos 1, 2 y 3 suman el total del año (T)
        for k, ps in t.orig.items():
            for a in sorted({p.split("/")[0] for p in ps}):
                yield (k, f"{a}/T"), [(k, f"{a}/{m}") for m in "123"]
    out.append(Tabla("graduados", {k: {f"{a}/{m}": f[0] for a, ms in s.items() for m, f in ms.items()}
                                   for k, s in GRAD["kpi"].items()},
                     q_grad, {"sexo", "gse", "cohorte_titulacion"}, momentos))
    out.append(Tabla("graduados.cobertura", {k: {"": f[0]} for k, f in GRAD["cob"].items()},
                     lambda k, p: sacar(GRAD["cob"], k), {"sexo", "gse", "cohorte_titulacion"}))

    # Indicadores de estudiantes desglosados por nivel socioeconómico y por nivel de la carrera.
    for ind, porclave in DATA["ind"].items():
        if not any("|" in k for k in porclave):
            continue

        def q_ind(k, p, ind=ind):
            for punto in DATA["ind"][ind][k]:
                if punto.get("p") == p:
                    for campo in ("v", "n", "num", "cob", "media", "resp"):
                        punto.pop(campo, None)
                    punto["v"] = None
            # el detalle del mismo grupo y periodo permitiría reconstruir la cifra quitada
            for clave in DETALLE_DE.get(ind, []):
                DATA["det"].get(clave, {}).get(k, {}).pop(p, None)
        out.append(Tabla(f"indicador {ind}",
                         {k: {pt["p"]: (pt.get("n") if pt.get("v") is not None else None) for pt in fil}
                          for k, fil in porclave.items()},
                         q_ind, {"gse", "nivel"}))
    return out


def jerarquia_de(datos):
    D = datos["facsecyd-data.js"][2]
    j = {m["k"]: m["carreras"] for m in D["modalidades"]}
    j[D["facultad"]] = [m["k"] for m in D["modalidades"]]
    return j


def main():
    medir = "--medir" in sys.argv
    archivos = ["rendimiento-data.js", "trayectoria-data.js", "graduados-data.js", "facsecyd-data.js"]
    datos = {a: leer(a) for a in archivos}
    jer = jerarquia_de(datos)
    total = 0
    for t in tablas(datos):
        casos = deducibles(t, jer)
        if medir:
            if casos:
                print(f"  {t.nombre}: {len(casos)} celdas deducibles, p. ej. {casos[0][2]} {casos[0][1]} = {casos[0][3]}")
            total += len(casos)
            continue
        proteger(t, jer)
        if t.quitadas:
            print(f"  {t.nombre}: {len(casos)} deducibles -> {len(t.quitadas)} celdas suprimidas además")
        total += len(t.quitadas)
    if medir:
        print(f"Celdas deducibles por resta: {total}")
        sys.exit(1 if total else 0)
    for a in archivos:
        escribir(a, datos[a][0], datos[a][1], datos[a][2])
    print(f"Supresión complementaria aplicada: {total} celdas suprimidas además.")


if __name__ == "__main__":
    main()
