# Genera data/poblacion_docentes.csv: un registro por docente x periodo,
# listo para subir directo a Looker Studio (misma logica de privacidad que
# poblacion_periodo.csv -- se sube el microdato y se confia en la
# configuracion de "Compartir" del reporte, no en agregacion previa).
#
# Por que un registro por docente x periodo y no por docente x asignatura:
# este dashboard nunca desglosa por asignatura, asi que cualquier campo que
# describa la asignatura (no a la persona) se descarta por completo en vez
# de intentar "resolverlo" -- especialmente modalidad y tipo_docente, que
# verificamos que varian dentro del mismo docente en el mismo periodo
# (369 y 1144 casos de 2954 combinaciones docente x periodo respectivamente,
# porque un mismo profesor puede dictar una materia presencial y otra en
# linea, o ser autor de una materia y teoria de otra).
#
# Uso: correr desde RStudio con el boton "Source", o:
#   Rscript dashboard/Script_docentes.R
# (asume que el working directory es dashboard/, igual que
# Script_poblacion_general.R)

library(readxl)
library(data.table)

data_dir <- file.path("..", "data")

docentes <- as.data.table(read_excel(file.path(data_dir, "data_docentes.xlsx"), sheet = "Hoja1"))
cat("Filas leidas:", nrow(docentes), "\n")

quitar_tildes <- function(x) chartr("ÁÉÍÓÚáéíóú", "AEIOUaeiou", x)

# Normaliza tildes inconsistentes antes de deduplicar -- ej. "ECONOMIA" vs
# "ECONOMÍA" para el mismo docente en el mismo periodo (14 casos detectados,
# todos de este tipo, ninguno era una carrera distinta de verdad).
docentes[, docente_carrera_pertenencia := quitar_tildes(docente_carrera_pertenencia)]
docentes[, docente_facultad_pertenencia := quitar_tildes(docente_facultad_pertenencia)]

# Mismo periodo incompleto que se excluye en Script_poblacion_general.R
docentes <- docentes[periodo != "ABRIL- MAYO 2021"]

docentes[, periodo_orden := sub("^(\\d)S-(\\d{4})$", "\\2-\\1", periodo_codigo)]

# Rango de edad -- breaks desde 20 a proposito: 4 docentes tienen edad
# registrada como 2, 3 o 5 anios (error de captura obvio), y con breaks
# empezando en 20 esos casos caen fuera de todos los rangos -> NA -> se
# convierten en "Dato inconsistente" abajo, en vez de crear un rango
# "menor de 20" que implicaria profesores nino.
docentes[, rango_edad := as.character(cut(
  docente_edad,
  breaks = c(20, 24, 29, 34, 39, 44, 49, 54, 59, 64, 69, 100),
  labels = c("20-24", "25-29", "30-34", "35-39", "40-44", "45-49",
             "50-54", "55-59", "60-64", "65-69", "70+"),
  right = TRUE, include.lowest = TRUE
))]
docentes[is.na(rango_edad), rango_edad := "Dato inconsistente"]

# Columnas a nivel de PERSONA -- se excluyen a proposito facultad,
# carrera_asignatura, nivel, paralelo, modalidad, asignatura, tipo_docente y
# total_estudiantes: todas describen la asignatura que dicta, no al docente.
cols_persona <- c(
  "docente_facultad_pertenencia", "docente_carrera_pertenencia",
  "docente_sexo", "docente_edad", "rango_edad",
  "docente_dedicacion", "docente_categoria", "docente_nivel_academico",
  "docente_pais", "docente_provincia", "docente_canton",
  "docente_etnia", "docente_discapacidad", "docente_ppl",
  "periodo_codigo", "periodo_orden"
)

# Un registro por docente x periodo. docente_nivel_academico tiene 2 casos
# reales (de 2954, no de tildes) donde varia dentro del mismo periodo -- se
# resuelve quedandose con el primer valor que aparece; es un caso demasiado
# marginal para justificar una categoria "Multiple" aparte.
poblacion_docentes <- docentes[
  , .SD[1],
  by = .(docente_id, periodo),
  .SDcols = cols_persona
]

cat("Docentes x periodo (deduplicado):", nrow(poblacion_docentes), "\n")

out_path <- file.path(data_dir, "poblacion_docentes.csv")
fwrite(poblacion_docentes, out_path)
cat("Escrito:", out_path, "\n")
cat("Tamano (bytes):", file.info(out_path)$size, "\n")
