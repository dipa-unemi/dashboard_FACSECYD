#Cargar paquetes

library(readxl)
library(arrow)
library(data.table)

#Definir el directorio
data_dir <- file.path("..", "data")

#Cargar datos
estudiantes_1 <- read_excel(file.path(data_dir, "data_estudiantes_1.xlsx"), sheet = "Hoja1")
estudiantes_2 <- read_excel(file.path(data_dir, "data_estudiantes_2.xlsx"), sheet = "Hoja1")

#Convertir en formato .parquet
setDT(estudiantes_1)
write_parquet(estudiantes_1, file.path(data_dir, "estudiantes_1.parquet"))
setDT(estudiantes_2)
write_parquet(estudiantes_2, file.path(data_dir, "estudiantes_2.parquet"))

#Cargar los datos en formato .parquet
estudiantes_1 <- as.data.table(read_parquet(file.path(data_dir, "estudiantes_1.parquet")))
estudiantes_2 <- as.data.table(read_parquet(file.path(data_dir, "estudiantes_2.parquet")))

# Deduplicar cada archivo por separado
nrow(estudiantes_1)
estudiantes_1 <- unique(estudiantes_1)
nrow(estudiantes_1)

nrow(estudiantes_2)
estudiantes_2 <- unique(estudiantes_2)
nrow(estudiantes_2)

#Confirmar que las columnas coinciden exactamente
identical(names(estudiantes_1), names(estudiantes_2))

#Unir en un solo dataset
estudiantes <- rbindlist(list(estudiantes_1, estudiantes_2))

#Quitar duplicados entre los archivos
estudiantes <- unique(estudiantes)
nrow(estudiantes)


#Manipulación de datos
cols_excluir <- c("periodo_primer_nivel", "periodo_primer_nivel_codigo", "periodo",
                  "fecha_periodo", "fecha_matricula", "nivel",
                  "asignatura_id", "asignatura", "numero_matricula", "asistenciafinal",
                  "nota_final", "estado_materia", "graduado", "fechagraduado",
                  "periodo_graduacion_codigo")

poblacion_periodo <- estudiantes[
  , .SD[1],
  by = .(inscripcion_id, periodo),
  .SDcols = !cols_excluir
]



# Frecuencia de cada valor en las columnas categóricas
cols_categoricas <- names(poblacion_periodo)[sapply(poblacion_periodo, is.character)]

for (col in cols_categoricas) {
  cat("\n---", col, "---\n")
  print(poblacion_periodo[, .N, by = col][order(-N)])
}


#Quitar el periodo: ABRIL- MAYO 2021
#Quitar las carreras no vigentes


quitar_tildes <- function(x) chartr("ÁÉÍÓÚáéíóú", "AEIOUaeiou", x)

poblacion_periodo[, carrera_estudiante := quitar_tildes(carrera_estudiante)]

combos_excluir <- data.table(
  carrera_estudiante = c(
    "COMERCIO", "COMUNICACION SOCIAL", "CONTADURIA PUBLICA Y AUDITORIA CPA",
    "DISEÑO GRAFICO Y PUBLICIDAD", "ECONOMIA", "INGENIERIA COMERCIAL",
    "INGENIERIA EN CONTADURIA PUBLICA Y AUDITORIA CPA",
    "INGENIERIA EN CONTADURIA PUBLICA Y AUDITORIA CPA9",
    "INGENIERIA EN MARKETING", "LICENCIATURA EN GESTION EMPRESARIAL",
    "MARKETING", "PSICOLOGIA", "TRABAJO SOCIAL 2019", "TURISMO"
  ),
  modalidad = "PRESENCIAL"
)

poblacion_periodo <- poblacion_periodo[!combos_excluir, on = .(carrera_estudiante, modalidad)]
poblacion_periodo <- poblacion_periodo[periodo != "ABRIL- MAYO 2021"]
poblacion_periodo[pais == "\\N", pais := "No registra"]
poblacion_periodo[pais == "ESTADOS UNIDOS DE AMÉRICA", pais := "ESTADOS UNIDOS"]
poblacion_periodo[pais == "ELSALVADOR", pais := "EL SALVADOR"]
poblacion_periodo[provincia %in% c("\\N", "SIN INFORMACION", "NO APLICA"), provincia := "No registra"]
poblacion_periodo[canton %in% c("\\N", "SIN INFORMACION", "NO APLICA"), canton := "No registra"]

# Nombre de provincia con tildes/mayusculas como lo reconoce el
# geocodificador de Google (Looker Studio) -- provincia viene en
# MAYUSCULAS y sin tildes desde el sistema origen, lo cual no coincide
# con los nombres oficiales que usa el mapa. NA para cualquier valor que
# no sea una provincia ecuatoriana real (paises extranjeros, "No
# registra", etc.) para que esas filas simplemente no se dibujen en el
# mapa en vez de emparejar mal.
poblacion_periodo[, provincia_geo := fcase(
  provincia == "AZUAY", "Azuay",
  provincia == "BOLIVAR", "Bolívar",
  provincia == "CAÑAR", "Cañar",
  provincia == "CARCHI", "Carchi",
  provincia == "CHIMBORAZO", "Chimborazo",
  provincia == "COTOPAXI", "Cotopaxi",
  provincia == "EL ORO", "El Oro",
  provincia == "ESMERALDAS", "Esmeraldas",
  provincia == "GALAPAGOS", "Galápagos",
  provincia == "GUAYAS", "Guayas",
  provincia == "IMBABURA", "Imbabura",
  provincia == "LOJA", "Loja",
  provincia == "LOS RIOS", "Los Ríos",
  provincia == "MANABI", "Manabí",
  provincia == "MORONA SANTIAGO", "Morona Santiago",
  provincia == "NAPO", "Napo",
  provincia == "ORELLANA", "Orellana",
  provincia == "PASTAZA", "Pastaza",
  provincia == "PICHINCHA", "Pichincha",
  provincia == "SANTA ELENA", "Santa Elena",
  provincia == "SANTO DOMINGO DE LOS TSACHILAS", "Santo Domingo de los Tsáchilas",
  provincia == "SUCUMBIOS", "Sucumbíos",
  provincia == "TUNGURAHUA", "Tungurahua",
  provincia == "ZAMORA CHINCHIPE", "Zamora Chinchipe",
  default = NA_character_
)]
poblacion_periodo[, es_ecuador := fifelse(pais == "ECUADOR", "Ecuador", "Extranjero")]
poblacion_periodo[etnia %in% c("\\N", "NO REGISTRA"), etnia := "No registra"]
poblacion_periodo[, canton := quitar_tildes(canton)]
poblacion_periodo[, periodo_orden := sub("^(\\d)S-(\\d{4})$", "\\2-\\1", periodo_codigo)]


poblacion_periodo[, rango_edad_ingreso := as.character(cut(
  edad_ingreso_carrera,
  breaks = c(15, 19, 24, 29, 34, 39, 80),
  labels = c("15-19", "20-24", "25-29", "30-34", "35-39", "40+"),
  right = TRUE, include.lowest = TRUE
))]

poblacion_periodo[is.na(rango_edad_ingreso), rango_edad_ingreso := "Dato inconsistente"]




#Exportar datos para pestaña del dashbord poblacion general

fwrite(poblacion_periodo, file.path(data_dir, "poblacion_periodo.csv"))


