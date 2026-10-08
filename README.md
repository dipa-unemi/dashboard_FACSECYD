# Dashboard FACSECYD

Dashboard de Desempeño de la Carrera de la FACSECYD, con el mismo diseño, vistas e
indicadores que el tablero de la FACS.

**🔗 Ver el dashboard en vivo:** https://dipa-unemi.github.io/dashboard_FACSECYD/docs/index.html

## Estructura

```
docs/              Dashboard web publicado con GitHub Pages
  index.html         página del tablero
  js/app.js          código del tablero
  css/tablero.css    estilos
  data/              datos agregados (sin información de personas) que lee el tablero
  img/               logos institucionales
scripts/pipeline/  Proceso que genera docs/data/ a partir de los extractos del SGA
```

- Los datos se regeneran con `python scripts/pipeline/procesar_todo.py` (ver
  `scripts/pipeline/README.md`). El paso 06 verifica que no se publiquen identificadores
  ni carreras excluidas y que se apliquen los umbrales de protección de datos.
- `docs/tablero.html` solo redirige a la página principal (dirección usada durante la revisión).
- Identificación interna: versión 2 (estructura FACS, octubre 2026). La marca está en
  `docs/index.html` (`<meta name="dashboard-version">`) y no se muestra en la página
  publicada; la copia local que genera `scripts/pipeline/07_html_local.py` sí la muestra.
- Las carpetas `dashboard/` y los demás scripts de `scripts/` son los procesos de la
  versión 1, que ya no se publica.

## Manejo de los datos fuente

**Los archivos de origen nunca entran al repositorio.** Contienen microdatos
de personas identificables. Viven fuera del repositorio (la carpeta
`Base de datos nuevas`, al lado de esta, o la que indique `FACSECYD_DATA_DIR`)
y se comparten por los canales internos de la facultad, no por GitHub.

Esto vale también para el historial: un archivo borrado en un commit
posterior sigue siendo descargable desde los commits anteriores. Si alguna
vez se sube uno por error, no basta con borrarlo en un commit nuevo — avisa
antes de seguir trabajando.

Como salvaguarda, `.gitignore` bloquea `/data/`, cualquier `.xlsx`, `.xls`,
`.parquet` o `.pkl`, y la carpeta `_procesado/`, en todo el repositorio.

## Clonar

```bash
git clone https://github.com/dipa-unemi/dashboard_FACSECYD.git
```
