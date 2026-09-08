# Dashboard FACSECYD

Dashboard académico de perfil estudiantil para la FACSECYD.

**🔗 Ver el dashboard en vivo:** https://dipa-unemi.github.io/dashboard_FACSECYD/docs/index.html

## Estructura

```
data/     Fuentes de datos en formato Excel (privadas, fuera del repositorio)
dashboard/ Pipelines en R de Población y Docentes
scripts/  Agregación para el tablero: R (Población) y Python (Graduados)
docs/     Dashboard web (HTML/CSS/JS), publicado con GitHub Pages
```

El dashboard tiene cuatro pestañas:

| Pestaña | Qué responde | Archivo |
|---|---|---|
| Perfil Estudiantil | Quién entra a la facultad | `index.html` + `app.js` + `data.js` |
| Rendimiento Académico | Cómo le va durante la carrera | `rendimiento_academico.html` |
| Docentes | Quién enseña en la facultad | `docentes.html` + `docentes.js` + `docentes-data.js` |
| Seguimiento a Graduados | Dónde termina después de titularse | `seguimiento_graduados.html` + `data_graduados.js` |

## Manejo de los datos fuente

**Los archivos de origen nunca entran al repositorio.** Contienen microdatos
de personas identificables. Viven solo en la carpeta local `data/`, que está
excluida por `.gitignore`, y se comparten por los canales internos de la
facultad, no por GitHub.

Esto vale también para el historial: un archivo borrado en un commit
posterior sigue siendo descargable desde los commits anteriores. Si alguna
vez se sube uno por error, no basta con borrarlo en un commit nuevo — avisa
antes de seguir trabajando.

Como salvaguarda, `.gitignore` bloquea `data/` y cualquier `.xlsx` o `.xls`
en todo el repositorio.

## Cómo se alimenta cada pestaña

Cada tablero lee un archivo ya agregado, sin datos personales:

| Pestaña | Lo genera |
|---|---|
| Perfil Estudiantil | `scripts/agregar_datos.R` |
| Rendimiento Académico | datos embebidos en el propio `rendimiento_academico.html` |
| Docentes | `dashboard/Script_docentes.R` |
| Seguimiento a Graduados | pipeline en Python de `scripts/` — ver `scripts/README_graduados.md` |

## Clonar

```bash
git clone https://github.com/dipa-unemi/dashboard_FACSECYD.git
```
