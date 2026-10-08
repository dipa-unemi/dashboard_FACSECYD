"""
Extrae el mapa mundial (un <path> por país, id="c-ISO3") del dashboard anterior
(docs/index.html) a docs/data/mapa-mundo.js, para el perfil de estudiantes del tablero nuevo.
Se quita la Antártida y el encuadre se ajusta a los demás países.

Se corre una sola vez (el mapa no cambia con los datos):
    python scripts/pipeline/extraer_mapa_mundo.py
"""
import json
import re

from comun import RAIZ

html = (RAIZ / "docs" / "index.html").read_text(encoding="utf-8")
svg = re.search(r'<svg id="worldMapSvg".*?</svg>', html, flags=re.S).group(0)
paises = {iso: d for iso, d in re.findall(r'<path id="c-([A-Z]{3})" d="([^"]+)"', svg) if iso != "ATA"}
ys = [float(y) for d in paises.values() for y in re.findall(r"[ML,]\s*-?[\d.]+,(-?[\d.]+)", d)]
y0, y1 = max(0, min(ys) - 4), max(ys) + 4
salida = {"viewBox": f"0 {y0:.0f} 960 {y1 - y0:.0f}", "pais": paises}
destino = RAIZ / "docs" / "data" / "mapa-mundo.js"
destino.write_text("/* Contorno de los países del mundo (códigos ISO 3166-1 alfa-3), tomado del dashboard "
                   "FACSECYD anterior (docs/index.html). Sin la Antártida. */\n"
                   "window.FACS_MAPA_MUNDO=" + json.dumps(salida, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Escrito {destino.relative_to(RAIZ)}: {len(paises)} países, viewBox {salida['viewBox']}")

# --- Galápagos en el mapa de Ecuador -------------------------------------------
# El mapa de provincias (docs/data/mapa-ecuador.js, tomado de FACS) dibuja solo el Ecuador
# continental. El dashboard anterior traía Galápagos (EC-W) en su posición real, ~1.000 km al
# oeste: se agrega como recuadro en la esquina inferior izquierda, con la misma escala.
svg_ec = re.search(r'<svg id="ecuadorMapSvg".*?</svg>', html, flags=re.S).group(0)
galapagos = re.search(r'<path id="p-EC-W" d="([^"]+)"', svg_ec).group(1)
ruta_ec = RAIZ / "docs" / "data" / "mapa-ecuador.js"
t = ruta_ec.read_text(encoding="utf-8")
ec = json.loads(t[t.index("=") + 1:].strip().rstrip(";"))
# El encuadre continental original se guarda para poder correr el script más de una vez.
ec.setdefault("viewBoxContinental", ec["viewBox"])
vx, vy, vw, vh = map(float, ec["viewBoxContinental"].split())
pts = [tuple(map(float, p)) for p in re.findall(r"(-?[\d.]+),(-?[\d.]+)", galapagos)]
gx0, gx1 = min(p[0] for p in pts), max(p[0] for p in pts)
gy0, gy1 = min(p[1] for p in pts), max(p[1] for p in pts)
# Con la escala del continente ocuparía media pantalla: se dibuja a la mitad (la nota del mapa lo dice).
ESCALA, margen = 0.5, 5
ancho, alto = (gx1 - gx0) * ESCALA, (gy1 - gy0) * ESCALA
# El recuadro va a la izquierda del continente (en el Pacífico): el encuadre se amplía hacia ese lado
# para que no tape la costa.
caja = [vx - ancho - 2 * margen - 6, vy + vh - alto - 2 * margen - 3, ancho + 2 * margen, alto + 2 * margen]
ec["viewBox"] = f"{caja[0] - 3:.1f} {vy:.1f} {vw + (vx - caja[0]) + 3:.1f} {vh:.1f}"
ec["insular"] = {"iso": "EC-W", "d": galapagos, "escala": ESCALA,
                 "transform": f"translate({caja[0] + margen - gx0 * ESCALA:.1f},{caja[1] + margen - gy0 * ESCALA:.1f}) scale({ESCALA})",
                 "caja": [round(c, 1) for c in caja]}
encabezado = ("/* Contorno de las 23 provincias continentales del Ecuador (codigos ISO 3166-2:EC), tomado del dashboard "
              "FACSECYD (DIPA), y Galápagos (EC-W) en recuadro, a la mitad de escala "
              "(scripts/pipeline/extraer_mapa_mundo.py). */\n")
ruta_ec.write_text(encabezado + "window.FACS_MAPA_EC=" + json.dumps(ec, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Galápagos agregado a {ruta_ec.relative_to(RAIZ)} como recuadro {ec['insular']['caja']}")
