# Genera un CSV agregado y "decodificado" (con los nombres de categoria en
# texto plano, no indices numericos) para subir a Google Sheets como fuente
# de datos de Looker Studio. Misma logica de privacidad que docs/data.js:
# agrupado por TODAS las combinaciones de periodo/carrera/modalidad/sede +
# variables de la persona, sin id_persona ni inscripcion_id ni edad exacta -
# ninguna fila corresponde a una sola persona.
#
# Uso: Rscript scripts/exportar_para_looker.R

library(dplyr)
library(readr)

find_repo_root <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- sub("^--file=", "", args[grep("^--file=", args)])
  if (length(file_arg) > 0) return(dirname(dirname(normalizePath(file_arg))))
  if (requireNamespace("rstudioapi", quietly = TRUE) && rstudioapi::isAvailable()) {
    ctx_path <- tryCatch(rstudioapi::getSourceEditorContext()$path, error = function(e) "")
    if (nzchar(ctx_path)) return(dirname(dirname(normalizePath(ctx_path))))
  }
  dir <- normalizePath(getwd())
  repeat {
    if (dir.exists(file.path(dir, ".git"))) return(dir)
    parent <- dirname(dir)
    if (parent == dir) break
    dir <- parent
  }
  getwd()
}
repo_root <- find_repo_root()
cat("Raiz del repositorio detectada:", repo_root, "\n")

csv_path <- file.path(repo_root, "data/poblacion_periodo.csv")
out_path <- file.path(repo_root, "data/poblacion_agregada_looker.csv")

data <- read_csv(csv_path, col_types = cols(.default = "c"))
cat("Filas leidas:", nrow(data), "\n")

agg <- data %>%
  group_by(periodo, periodo_orden, carrera_estudiante, modalidad, sede, sexo,
           etnia, discapacidad, ppl, grupo_socioeconomico, rango_edad_ingreso,
           es_ecuador, provincia, pais) %>%
  summarise(
    inscripciones = n(),
    personas      = n_distinct(id_persona),
    .groups = "drop"
  ) %>%
  rename(
    carrera = carrera_estudiante,
    rango_edad = rango_edad_ingreso
  ) %>%
  mutate(
    # Nombre de provincia con tildes/mayusculas como los reconoce el
    # geocodificador de Google (Looker Studio) -- provincia viene en
    # MAYUSCULAS y sin tildes desde el sistema origen, lo cual no
    # coincide con los nombres oficiales que usa el mapa. NA para
    # cualquier valor que no sea una provincia ecuatoriana real (paises
    # extranjeros, "No registra", etc.) para que esas filas simplemente
    # no se dibujen en el mapa en vez de emparejar mal.
    provincia_geo = case_when(
      provincia == "AZUAY"                            ~ "Azuay",
      provincia == "BOLIVAR"                           ~ "Bolívar",
      provincia == "CAÑAR"                             ~ "Cañar",
      provincia == "CARCHI"                            ~ "Carchi",
      provincia == "CHIMBORAZO"                        ~ "Chimborazo",
      provincia == "COTOPAXI"                          ~ "Cotopaxi",
      provincia == "EL ORO"                            ~ "El Oro",
      provincia == "ESMERALDAS"                        ~ "Esmeraldas",
      provincia == "GALAPAGOS"                         ~ "Galápagos",
      provincia == "GUAYAS"                            ~ "Guayas",
      provincia == "IMBABURA"                          ~ "Imbabura",
      provincia == "LOJA"                              ~ "Loja",
      provincia == "LOS RIOS"                          ~ "Los Ríos",
      provincia == "MANABI"                            ~ "Manabí",
      provincia == "MORONA SANTIAGO"                   ~ "Morona Santiago",
      provincia == "NAPO"                              ~ "Napo",
      provincia == "ORELLANA"                          ~ "Orellana",
      provincia == "PASTAZA"                           ~ "Pastaza",
      provincia == "PICHINCHA"                         ~ "Pichincha",
      provincia == "SANTA ELENA"                       ~ "Santa Elena",
      provincia == "SANTO DOMINGO DE LOS TSACHILAS"    ~ "Santo Domingo de los Tsáchilas",
      provincia == "SUCUMBIOS"                         ~ "Sucumbíos",
      provincia == "TUNGURAHUA"                        ~ "Tungurahua",
      provincia == "ZAMORA CHINCHIPE"                  ~ "Zamora Chinchipe",
      TRUE ~ NA_character_
    )
  ) %>%
  arrange(periodo_orden)

cat("Combinaciones distintas (filas del CSV agregado):", nrow(agg), "\n")

write_csv(agg, out_path, na = "")
cat("Escrito:", out_path, "\n")
cat("Tamano (bytes):", file.info(out_path)$size, "\n")
