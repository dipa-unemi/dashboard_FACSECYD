# Dashboard FACSECYD

Dashboard académico de perfil estudiantil para la FACSECYD.

**🔗 Ver el dashboard en vivo:** https://evelyngarcia02.github.io/dashboard_FACSECYD/docs/index.html

**🔗 Demo de inserción en Looker Studio (para evaluación interna):** https://evelyngarcia02.github.io/dashboard_FACSECYD/docs/demo-embed.html

## Estructura

```
data/     Fuentes de datos en formato Excel (privadas, fuera del repositorio)
dashboard/ Pipelines en R de Población y Docentes
scripts/  Agregación para el tablero: R (Población) y Python (Graduados)
docs/     Dashboard web (HTML/CSS/JS), publicado con GitHub Pages
```

El dashboard tiene tres pestañas:

| Pestaña | Qué responde | Archivo |
|---|---|---|
| Perfil Estudiantil | Quién entra a la facultad | `index.html` + `app.js` + `data.js` |
| Rendimiento Académico | Cómo le va durante la carrera | `rendimiento_academico.html` |
| Seguimiento a Graduados | Dónde termina después de titularse | `seguimiento_graduados.html` + `data_graduados.js` |

Los datos fuente no se publican: cada pestaña se alimenta de un archivo ya agregado.
Para Seguimiento a Graduados ese archivo lo genera el pipeline en Python de `scripts/`
— ver `scripts/README_graduados.md`. Para Población, los scripts en R de la misma carpeta.

## Requisitos

Este repositorio usa [Git LFS](https://git-lfs.com/) para los archivos `.xlsx`.
Antes de clonar:

```bash
git lfs install
git clone https://github.com/EvelynGarcia02/dashboard_FACSECYD.git
```

Si ya clonaste el repositorio sin LFS:

```bash
git lfs pull
```
