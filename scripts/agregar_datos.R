# Agrega data/poblacion_periodo.csv (la salida ya limpia del pipeline de R)
# a nivel de COMBINACION de variables categoricas -- nunca a nivel de persona
# o de inscripcion individual -- y genera docs/data.js para el dashboard.
#
# Por que se agrega asi: el dashboard es un sitio publico (GitHub Pages) y antes
# mandaba una fila por inscripcion al navegador, con id_persona e inscripcion_id
# incluidos -- cualquiera podia descargar esos microdatos con las herramientas
# de desarrollador del navegador. Ahora cada fila de docs/data.js ya es un
# conteo (n_insc, n_personas) para una combinacion exacta de periodo, carrera,
# modalidad, sede, sexo, etnia, discapacidad, grupo socioeconomico, rango de
# edad, pais y provincia -- ninguna fila corresponde a una sola persona.
#
# Nota sobre "personas unicas": al no viajar id_persona al navegador, alguien
# matriculado a la vez en mas de una carrera/modalidad/sede puede contarse mas
# de una vez en los desgloses por Grupo socioeconomico/Etnia/Discapacidad si
# se filtra por varias de esas variables a la vez -- riesgo pequeno y ya
# asumido, revisar con el equipo si esto cambia.
#
# Los KPI institucionales (arriba del todo) usan una SEGUNDA tabla (ROWS_INST)
# agregada solo por periodo + variables de la persona (sin carrera, modalidad
# ni sede) -- ahi "personas unicas" es exacto siempre, porque nadie tiene 2
# valores distintos de sexo/etnia/discapacidad en el mismo periodo. El costo:
# esos KPI solo reaccionan al filtro de Periodo, no a Carrera/Modalidad/Sede.
#
# Uso: Rscript scripts/agregar_datos.R
# (tambien se puede correr desde RStudio con el boton "Source", o pegando las
# lineas en la consola -- encuentra la raiz del repositorio solo, sin importar
# cual sea el directorio de trabajo actual)

library(dplyr)
library(readr)

# Encuentra la raiz del repo a partir de la ubicacion de ESTE script, para que
# funcione sin importar desde donde se ejecute (terminal, RStudio "Source",
# consola interactiva). scripts/ vive un nivel debajo de la raiz.
find_repo_root <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- sub("^--file=", "", args[grep("^--file=", args)])
  if (length(file_arg) > 0) {
    return(dirname(dirname(normalizePath(file_arg))))
  }
  if (requireNamespace("rstudioapi", quietly = TRUE) && rstudioapi::isAvailable()) {
    ctx_path <- tryCatch(rstudioapi::getSourceEditorContext()$path, error = function(e) "")
    if (nzchar(ctx_path)) return(dirname(dirname(normalizePath(ctx_path))))
  }
  # Si se pego el codigo directo en la consola (sin archivo ni RStudio), busca
  # la raiz subiendo desde el directorio de trabajo actual hasta encontrar .git
  dir <- normalizePath(getwd())
  repeat {
    if (dir.exists(file.path(dir, ".git"))) return(dir)
    parent <- dirname(dir)
    if (parent == dir) break  # llego a la raiz del disco sin encontrar .git
    dir <- parent
  }
  getwd()  # ultimo recurso: asume que ya se corre desde la raiz del repositorio
}
repo_root <- find_repo_root()
cat("Raiz del repositorio detectada:", repo_root, "\n")

csv_path <- file.path(repo_root, "data/poblacion_periodo.csv")
out_path <- file.path(repo_root, "docs/data.js")

data <- read_csv(csv_path, col_types = cols(.default = "c"))
cat("Filas leidas:", nrow(data), "\n")

periodo_label_map <- c(
  "MAYO A SEPTIEMBRE 2021"        = "May-Sep 2021",
  "NOVIEMBRE 2021 MARZO 2022"     = "Nov 2021-Mar 2022",
  "MAYO A SEPTIEMBRE 2022"        = "May-Sep 2022",
  "NOVIEMBRE 2022 MARZO 2023"     = "Nov 2022-Mar 2023",
  "ABRIL - AGOSTO 2023"           = "Abr-Ago 2023",
  "SEPTIEMBRE 2023 - ENERO 2024"  = "Sep 2023-Ene 2024",
  "ABRIL - AGOSTO 2024 V2"        = "Abr-Ago 2024",
  "AGOSTO - DICIEMBRE 2024"       = "Ago-Dic 2024",
  "ABRIL - JULIO 2025"            = "Abr-Jul 2025",
  "AGOSTO - DICIEMBRE 2025"       = "Ago-Dic 2025",
  "ABRIL - JULIO 2026"            = "Abr-Jul 2026"
)
# Si llega un periodo nuevo que no este en este mapa, agregar su etiqueta
# corta aqui antes de correr el script.
periodos_sin_etiqueta <- setdiff(unique(data$periodo), names(periodo_label_map))
if (length(periodos_sin_etiqueta) > 0) {
  stop("Falta etiqueta corta para: ", paste(periodos_sin_etiqueta, collapse = ", "),
       " -- agregala en periodo_label_map antes de continuar.")
}

periodo_pairs <- data %>%
  distinct(periodo, periodo_orden) %>%
  arrange(periodo_orden)  # formato "AAAA-N" (ej. "2021-1"): el orden alfabetico ya es cronologico
periodo_order   <- periodo_pairs$periodo
periodo_orden_v <- periodo_pairs$periodo_orden
periodo_labels  <- unname(periodo_label_map[periodo_order])

# Bandas de edad fijas (mismo orden que ya usa el dashboard).
rangos <- c("15-19", "20-24", "25-29", "30-34", "35-39", "40+", "Dato inconsistente")

carreras    <- sort(unique(data$carrera_estudiante))
modalidades <- sort(unique(data$modalidad))
sedes       <- sort(unique(data$sede))
sexos       <- sort(unique(data$sexo))
etnias      <- sort(unique(data$etnia))
discs       <- sort(unique(data$discapacidad))
grupos      <- sort(unique(data$grupo_socioeconomico))
ecuadores   <- sort(unique(data$es_ecuador))
provincias  <- sort(unique(data$provincia))
paises      <- sort(unique(data$pais))

idx_of <- function(vals, dict) match(vals, dict) - 1L  # indices 0-based para JS

agg <- data %>%
  mutate(
    periodoIdx   = idx_of(periodo, periodo_order),
    carreraIdx   = idx_of(carrera_estudiante, carreras),
    modalidadIdx = idx_of(modalidad, modalidades),
    sedeIdx      = idx_of(sede, sedes),
    sexoIdx      = idx_of(sexo, sexos),
    etniaIdx     = idx_of(etnia, etnias),
    discIdx      = idx_of(discapacidad, discs),
    pplFlag      = if_else(ppl == "SI", 1L, 0L),
    grupoIdx     = idx_of(grupo_socioeconomico, grupos),
    rangoIdx     = idx_of(rango_edad_ingreso, rangos),
    ecuadorIdx   = idx_of(es_ecuador, ecuadores),
    provinciaIdx = idx_of(provincia, provincias),
    paisIdx      = idx_of(pais, paises)
  ) %>%
  group_by(periodoIdx, carreraIdx, modalidadIdx, sedeIdx, sexoIdx, etniaIdx,
           discIdx, pplFlag, grupoIdx, rangoIdx, ecuadorIdx, provinciaIdx, paisIdx) %>%
  summarise(
    n_insc     = n(),
    n_personas = n_distinct(id_persona),
    .groups = "drop"
  )

cat("Combinaciones distintas (filas en la tabla agregada):", nrow(agg), "\n")

rows <- with(agg, paste(periodoIdx, carreraIdx, modalidadIdx, sedeIdx, sexoIdx,
                         etniaIdx, discIdx, pplFlag, grupoIdx, rangoIdx,
                         ecuadorIdx, provinciaIdx, paisIdx, n_insc, n_personas,
                         sep = "|"))
rows_raw <- paste(rows, collapse = "\n")

# --- Tabla institucional: solo periodo + las variables de persona que
# realmente usan los KPI (sexo, discapacidad, extranjero/Ecuador). Deja fuera
# a propósito etnia/grupo/edad/provincia/pais -- no las usa ningun KPI, y
# ademas "edad de ingreso a la carrera" NO es un atributo estable de la
# persona (alguien con 2 carreras pudo entrar a cada una en un año distinto,
# con una edad distinta), asi que incluirla rompia la deduplicacion exacta.
agg_inst <- data %>%
  mutate(
    periodoIdx = idx_of(periodo, periodo_order),
    sexoIdx    = idx_of(sexo, sexos),
    discIdx    = idx_of(discapacidad, discs),
    ecuadorIdx = idx_of(es_ecuador, ecuadores)
  ) %>%
  group_by(periodoIdx, sexoIdx, discIdx, ecuadorIdx) %>%
  summarise(
    n_insc     = n(),
    n_personas = n_distinct(id_persona),
    .groups = "drop"
  )

cat("Combinaciones distintas (tabla institucional):", nrow(agg_inst), "\n")

rows_inst <- with(agg_inst, paste(periodoIdx, sexoIdx, discIdx, ecuadorIdx,
                                   n_insc, n_personas, sep = "|"))
rows_inst_raw <- paste(rows_inst, collapse = "\n")

# --- Personas en doble carrera (o mas) por periodo: cuenta id_persona
# matriculados en 2+ carrera_estudiante distintas dentro del MISMO periodo.
# Se calcula aqui, con los microdatos reales, porque el navegador nunca
# recibe id_persona -- no se puede derivar esto de ROWS_RAW/ROWS_INST sin el
# vinculo persona-a-persona que se elimino a proposito por privacidad.
multi_carrera <- data %>%
  distinct(id_persona, periodo, carrera_estudiante) %>%
  count(id_persona, periodo, name = "n_carreras") %>%
  filter(n_carreras >= 2) %>%
  count(periodo, name = "n_multi")

multi_carrera_v <- setNames(rep(0L, length(periodo_order)), periodo_order)
multi_carrera_v[multi_carrera$periodo] <- multi_carrera$n_multi

cat("Personas en doble carrera (por periodo):",
    paste(periodo_order, multi_carrera_v, sep = "=", collapse = ", "), "\n")

if (grepl("`", rows_raw, fixed = TRUE) || grepl("`", rows_inst_raw, fixed = TRUE)) {
  stop("Un valor contiene un backtick (`) -- no se puede incrustar de forma segura en el template literal de JS.")
}

js_arr <- function(v) paste0("[", paste0('"', gsub('"', '\\\\"', v), '"', collapse = ","), "]")

js_dicts <- paste0(
  "const DICTS = {\n",
  "  periodo: ", js_arr(periodo_order), ",\n",
  "  periodoLabel: ", js_arr(periodo_labels), ",\n",
  "  periodoOrden: ", js_arr(periodo_orden_v), ",\n",
  "  carrera: ", js_arr(carreras), ",\n",
  "  modalidad: ", js_arr(modalidades), ",\n",
  "  sede: ", js_arr(sedes), ",\n",
  "  sexo: ", js_arr(sexos), ",\n",
  "  etnia: ", js_arr(etnias), ",\n",
  "  discapacidad: ", js_arr(discs), ",\n",
  "  grupo: ", js_arr(grupos), ",\n",
  "  rango: ", js_arr(rangos), ",\n",
  "  ecuador: ", js_arr(ecuadores), ",\n",
  "  provincia: ", js_arr(provincias), ",\n",
  "  pais: ", js_arr(paises), "\n",
  "};\n"
)
js_data <- paste0("const ROWS_RAW = `", rows_raw, "`;\n")
js_data_inst <- paste0("const ROWS_INST = `", rows_inst_raw, "`;\n")
js_multi <- paste0("const MULTI_CARRERA = [", paste(multi_carrera_v, collapse = ","), "];\n")

con <- file(out_path, open = "w", encoding = "UTF-8")
writeLines(paste0(js_dicts, js_data, js_data_inst, js_multi), con, useBytes = TRUE)
close(con)

cat("Escrito:", out_path, "\n")
cat("Tamano (bytes):", file.info(out_path)$size, "\n")
