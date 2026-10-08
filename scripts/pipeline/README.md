# Pipeline de datos del dashboard FACSECYD

Convierte los extractos del SGA en los archivos agregados que lee el tablero
(`docs/data/*.js`), con la misma estructura que el dashboard de referencia FACS.

```
python scripts/pipeline/procesar_todo.py            # todo, de 01 a 06
python scripts/pipeline/procesar_todo.py --desde 2  # reutiliza las bases ya preparadas
```

Requiere Python 3 con `pandas`, `pyarrow` y `python-calamine`:
`python -m pip install pandas pyarrow python-calamine`.

| Paso | Qué hace | Salida |
|---|---|---|
| `01_preparar_bases.py` | Lee los Excel, aplica los filtros de la Dirección y limpia | `Base de datos nuevas/_procesado/*.parquet` + `bitacora.json` |
| `02_agregar_indicadores.py` | Satisfacción (estudiantes, docentes, graduados), investigación, vinculación, tutorías y becas | `docs/data/facsecyd-data.js` |
| `03_agregar_docentes.py` | Planta, nivel académico, dedicación, evaluación, capacitación, perfil | `docs/data/docentes-data.js` |
| `04_agregar_graduados.py` | Empleabilidad, condiciones del empleo, competencias, cobertura | `docs/data/graduados-data.js` |
| `05_agregar_estudiantes.py` | Trayectoria, perfil sociodemográfico y rendimiento | `trayectoria-`, `perfil-`, `rendimiento-data.js` |
| `06_verificar.py` | Sin identificadores, sin carreras excluidas, umbrales aplicados, cifras que cuadran | resumen por carrera |

## Dónde están los datos

Los extractos viven en `../Base de datos nuevas` (al lado del repositorio) o en
la carpeta que indique la variable `FACSECYD_DATA_DIR`. **Nunca entran al
repositorio**: `.gitignore` bloquea `/data/`, `*.xlsx`, `*.parquet` y `_procesado/`.

La base de estudiantes supera el límite de filas de Excel: se exporta en partes
y se convierte con `scripts/00_estudiantes_a_parquet.R` (en RStudio). Si el
paso 01 solo encuentra el `.xlsx` cortado, marca las cifras de estudiantes como
**provisionales**.

## Criterios que cambian cifras (todos en `comun.py`)

- **Carreras:** 16, sin unificar versiones de malla ni modalidades (`CARRERAS`).
- **Excluidas:** combinaciones carrera + PRESENCIAL no vigentes (`EXCLUIR_PRESENCIAL`),
  y el periodo ABRIL- MAYO 2021 (`PERIODO_EXCLUIDO`).
- **Bases sin modalidad** (evaluación y satisfacción docente, vinculación): se excluyen
  por nombre solo las carreras sin versión vigente; ECONOMIA, PSICOLOGIA, TURISMO y
  TRABAJO SOCIAL 2019 se atribuyen a su versión vigente.
- **Duración de las carreras** (`DURACION_NIVELES`): por confirmar; mientras tanto,
  el nivel más alto observado, con un mínimo de 8.
- **Protección de datos:** grupos de menos de 10 personas no se publican; categorías
  de menos de 5 casos se agrupan.
