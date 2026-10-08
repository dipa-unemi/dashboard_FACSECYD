# Convierte el extracto de estudiantes del SGA (Result_estudiante_2) a .parquet.
#
# Por qué: una hoja de Excel admite como máximo 1.048.576 filas (1.048.575 de
# datos más el encabezado). El extracto de FACSECYD es más grande, así que debe
# exportarse en VARIAS partes .xlsx; este script las une, revisa que ninguna
# haya quedado cortada y escribe un .parquet por parte.
#
# Entrada (en la carpeta "Base de datos nuevas", fuera del repositorio):
#     Result_estudiante_2_parte1.xlsx, Result_estudiante_2_parte2.xlsx, ...
#   Cualquier nombre que empiece por "Result_estudiante_2" y termine en .xlsx sirve.
#   Conviene partir el extracto por carrera, para que una carrera no quede repartida.
#
# Salida (misma carpeta):
#     Result_estudiante_2_1.parquet, Result_estudiante_2_2.parquet, ...
#
# Los .parquet tienen microdatos de personas: NO van al repositorio
# (.gitignore ya bloquea data/ y los Excel; no los copies dentro de dashboard_FACSECYD).
#
# Uso en RStudio: abrir este archivo y pulsar "Source".

paquetes <- c("readxl", "arrow", "data.table")
faltan <- paquetes[!vapply(paquetes, requireNamespace, logical(1), quietly = TRUE)]
if (length(faltan)) install.packages(faltan)

library(readxl)
library(arrow)
library(data.table)

# ------------------------------------------------------------------ carpetas
# Carpeta de datos: "Base de datos nuevas", al lado de la carpeta del repositorio.
# Si está en otro lugar, cambia esta línea por la ruta completa.
if (requireNamespace("rstudioapi", quietly = TRUE) && rstudioapi::isAvailable()) {
  repo <- dirname(dirname(rstudioapi::getSourceEditorContext()$path))
} else {
  repo <- getwd()
}
data_dir <- file.path(dirname(repo), "Base de datos nuevas")
if (!dir.exists(data_dir)) stop("No encuentro la carpeta de datos: ", data_dir)

partes <- sort(list.files(data_dir, pattern = "^Result_estudiante_2.*\\.xlsx$", full.names = TRUE))
partes <- partes[!startsWith(basename(partes), "~$")]   # archivos temporales de Excel abiertos
if (!length(partes)) stop("No hay archivos Result_estudiante_2*.xlsx en ", data_dir)
cat("Partes encontradas:\n", paste(" -", basename(partes), collapse = "\n"), "\n\n")

# ------------------------------------------------------------------ lectura
LIMITE_EXCEL <- 1048575L   # filas de datos que caben en una hoja

leer_parte <- function(ruta) {
  cat("Leyendo", basename(ruta), "...\n")
  d <- as.data.table(read_excel(ruta, sheet = 1, guess_max = 200000))
  if (nrow(d) >= LIMITE_EXCEL) {
    stop(basename(ruta), " tiene ", format(nrow(d), big.mark = "."),
         " filas: llegó al límite de Excel y está CORTADO. ",
         "Vuelve a exportarlo en más partes (por ejemplo, por carrera).")
  }
  d
}
datos <- lapply(partes, leer_parte)

# Las partes deben tener las mismas columnas.
cols <- names(datos[[1]])
for (i in seq_along(datos)) {
  if (!identical(sort(names(datos[[i]])), sort(cols))) {
    stop(basename(partes[i]), " no tiene las mismas columnas que ", basename(partes[1]))
  }
  setcolorder(datos[[i]], cols)
}
# Si una columna salió con tipos distintos entre partes (p. ej. número en una
# y texto en otra), se deja como texto en todas para poder unirlas después.
for (cl in cols) {
  tipos <- unique(vapply(datos, function(d) class(d[[cl]])[1], character(1)))
  if (length(tipos) > 1) {
    cat("  Columna", cl, "con tipos distintos (", paste(tipos, collapse = ", "), ") -> texto\n")
    for (i in seq_along(datos)) set(datos[[i]], j = cl, value = as.character(datos[[i]][[cl]]))
  }
}

# ------------------------------------------------------------------ revisión
todo <- rbindlist(datos)
dup <- sum(duplicated(todo))
cat("\nFilas totales:", format(nrow(todo), big.mark = "."),
    " | filas repetidas exactas:", format(dup, big.mark = "."), "\n")
if (dup > 0) cat("  (Las partes se solapan o el extracto trae duplicados; se quitan en cada parquet.)\n")

cat("\nInscripciones por carrera (revisa que estén todas, p. ej. TURISMO y TRABAJO SOCIAL 2019):\n")
print(todo[, .(inscripciones = uniqueN(inscripcion_id), filas = .N), by = carrera_estudiante][order(carrera_estudiante)])

cat("\nInscripciones por periodo:\n")
print(todo[, .(inscripciones = uniqueN(inscripcion_id)), by = .(periodo_codigo, periodo)][order(periodo_codigo)])
rm(todo)

# ------------------------------------------------------------------ escritura
for (i in seq_along(datos)) {
  d <- unique(datos[[i]])
  salida <- file.path(data_dir, sprintf("Result_estudiante_2_%d.parquet", i))
  write_parquet(d, salida)
  cat("Escrito", basename(salida), "-", format(nrow(d), big.mark = "."), "filas\n")
}

# Comprobación: los parquet se leen y suman lo mismo.
n_parquet <- sum(vapply(seq_along(datos), function(i)
  nrow(read_parquet(file.path(data_dir, sprintf("Result_estudiante_2_%d.parquet", i)))), numeric(1)))
cat("\nListo. Filas en los parquet:", format(n_parquet, big.mark = "."), "\n")
