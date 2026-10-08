"""
Paso 7 (opcional) · Empaqueta docs/tablero.html en UN solo archivo .html autocontenido
(estilos, código, datos y logos incrustados) para abrirlo con doble clic, sin servidor.

Solo contiene lo mismo que se publica en docs/: datos agregados, sin microdatos.

Uso:  python scripts/pipeline/07_html_local.py [ruta_de_salida.html]
      Por defecto: ../Dashboard_FACSECYD_local.html (al lado de la carpeta del repositorio).
"""
import base64
import re
import sys
from pathlib import Path

from comun import RAIZ

DOCS = RAIZ / "docs"
SALIDA = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ.parent / "Dashboard_FACSECYD_local.html"

html = (DOCS / "tablero.html").read_text(encoding="utf-8")


def css(m):
    return "<style>\n" + (DOCS / m.group(1)).read_text(encoding="utf-8") + "\n</style>"


def js(m):
    codigo = (DOCS / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + codigo + "\n</script>"


def img(m):
    ruta = DOCS / m.group(2)
    return f'{m.group(1)}"data:image/png;base64,{base64.b64encode(ruta.read_bytes()).decode()}"'


html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
html = re.sub(r'<script src="([^"]+)"></script>', js, html)
html = re.sub(r'(src=)"(img/[^"]+\.png)"', img, html)
# Las imágenes que referencia el CSS (si las hubiera) también se incrustan
html = re.sub(r'url\((?:\.\./)?(img/[^)]+\.png)\)',
              lambda m: f"url(data:image/png;base64,{base64.b64encode((DOCS / m.group(1)).read_bytes()).decode()})", html)
faltan = re.findall(r'(?:src|href)="(?!data:|https?:|#)([^"]+)"', html)
if faltan:
    sys.exit(f"Quedaron referencias a archivos sin incrustar: {faltan}")

SALIDA.write_text(html, encoding="utf-8")
print(f"Escrito {SALIDA} ({SALIDA.stat().st_size / 1024 / 1024:.1f} MB)")
