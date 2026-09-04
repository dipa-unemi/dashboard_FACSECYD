# -*- coding: utf-8 -*-
"""
Reglas de depuracion del modulo de Seguimiento a Graduados (FACSECYD).

Todo criterio que afecte una cifra publicada vive aqui, no disperso en el codigo.
Cada bloque cita el hallazgo de la auditoria que lo justifica (H-01 .. H-13).
"""

from pathlib import Path

# --------------------------------------------------------------------------
# Rutas
# --------------------------------------------------------------------------
RAIZ = Path(__file__).resolve().parent.parent
DIR_DATA = RAIZ / "data"
DIR_BUILD = RAIZ / "build"
DIR_DOCS = RAIZ / "docs"

XLSX_GRADUADOS = DIR_DATA / "data_seguimientograduado.xlsx"
XLSX_ESTUDIANTES = [
    DIR_DATA / "data_estudiantes_1.xlsx",
    DIR_DATA / "data_estudiantes_2.xlsx",
]

PKL_LIMPIO = DIR_BUILD / "graduados_limpio.pkl"
PKL_PERSONAS = DIR_BUILD / "graduados_personas.pkl"
PKL_POBLACION = DIR_BUILD / "poblacion_titulados.pkl"
JSON_QC = DIR_BUILD / "qc_graduados.json"
JS_SALIDA = DIR_DOCS / "data_graduados.js"

# --------------------------------------------------------------------------
# H-06 · Carreras: 32 grafias -> 10 carreras canonicas
# El sufijo "2019" corresponde al rediseno curricular, no a otra carrera.
# --------------------------------------------------------------------------
CARRERAS = {
    "PSICOLOGIA": "Psicología",
    "PSICOLOGÍA": "Psicología",
    "LICENCIATURA EN PSICOLOGIA 2019": "Psicología",

    "TRABAJO SOCIAL": "Trabajo Social",
    "TRABAJO SOCIAL 2019": "Trabajo Social",

    "DERECHO": "Derecho",

    "COMUNICACION": "Comunicación",
    "COMUNICACIÓN": "Comunicación",
    "COMUNICACION 2019": "Comunicación",
    "COMUNICACIÓN 2019": "Comunicación",
    "COMUNICACION SOCIAL": "Comunicación",
    "COMUNICACIÓN SOCIAL": "Comunicación",

    "ADMINISTRACION DE EMPRESAS 2019": "Administración de Empresas",
    "INGENIERÍA COMERCIAL": "Administración de Empresas",
    "INGENIERIA COMERCIAL": "Administración de Empresas",
    "LICENCIATURA EN GESTIÓN EMPRESARIAL": "Administración de Empresas",
    "LICENCIATURA EN GESTION EMPRESARIAL": "Administración de Empresas",
    "COMERCIO": "Administración de Empresas",

    "CONTABILIDAD Y AUDITORIA 2019": "Contabilidad y Auditoría",
    "CONTADURÍA PÚBLICA Y AUDITORÍA CPA": "Contabilidad y Auditoría",
    "CONTADURIA PUBLICA Y AUDITORIA CPA": "Contabilidad y Auditoría",
    "INGENIERÍA EN CONTADURÍA PÚBLICA Y AUDITORÍA CPA": "Contabilidad y Auditoría",

    "ECONOMIA": "Economía",
    "ECONOMÍA": "Economía",
    "ECONOMIA 2019": "Economía",

    "TURISMO": "Turismo",
    "TURISMO 2019": "Turismo",

    "DISEÑO GRÁFICO Y PUBLICIDAD": "Diseño Gráfico y Publicidad",
    "DISEÑO GRAFICO Y PUBLICIDAD": "Diseño Gráfico y Publicidad",
    "MULTIMEDIA Y PRODUCCION AUDIOVISUAL": "Diseño Gráfico y Publicidad",

    "MARKETING": "Marketing",
    "INGENIERIA EN MARKETING": "Marketing",
}

# Malla conservada como atributo aparte (decision §6.1 de la auditoria)
def malla_de(carrera_original: str) -> str:
    return "2019" if str(carrera_original).strip().endswith("2019") else "Anterior a 2019"


# --------------------------------------------------------------------------
# CARRERAS NO VIGENTES
#
# Misma regla que aplica el equipo en dashboard/Script_poblacion_general.R para
# la pestana de Poblacion. Se replica aqui para que las tres pestanas hablen del
# mismo universo: si Poblacion excluye una combinacion carrera+modalidad y
# Graduados no, los totales de la facultad no cuadran entre pestanas.
#
# La lista equivale al campo carrera_vigente == "NO" de la base de estudiantes,
# con una unica excepcion: TRABAJO SOCIAL 2019 / PRESENCIAL figura como vigente
# pero solo tiene 10 inscripciones frente a las 2.852 de su version
# SEMIPRESENCIAL, asi que el equipo la trata como residuo. Se respeta su
# criterio; si cambian de opinion, se quita de este set y de su script en R.
# --------------------------------------------------------------------------
NO_VIGENTES = {
    "COMERCIO", "COMUNICACION SOCIAL", "CONTADURIA PUBLICA Y AUDITORIA CPA",
    "DISEÑO GRAFICO Y PUBLICIDAD", "ECONOMIA", "INGENIERIA COMERCIAL",
    "INGENIERIA EN CONTADURIA PUBLICA Y AUDITORIA CPA",
    "INGENIERIA EN CONTADURIA PUBLICA Y AUDITORIA CPA9",
    "INGENIERIA EN MARKETING", "LICENCIATURA EN GESTION EMPRESARIAL",
    "MARKETING", "PSICOLOGIA", "TRABAJO SOCIAL 2019", "TURISMO",
}
MODALIDAD_NO_VIGENTE = "PRESENCIAL"

_TILDES = str.maketrans("ÁÉÍÓÚáéíóú", "AEIOUaeiou")

def es_no_vigente(carrera: str, modalidad: str) -> bool:
    """La exclusion es por COMBINACION: la misma carrera sigue vigente en otra
    modalidad (Turismo presencial sale, Turismo en linea se queda)."""
    return (str(carrera).strip().translate(_TILDES).upper() in NO_VIGENTES
            and str(modalidad).strip().upper() == MODALIDAD_NO_VIGENTE)

# --------------------------------------------------------------------------
# H-04 · Escala institucional 1-7. El mapeo texto<->numero es 1:1 y consistente
# en las 299.106 respuestas del archivo; se declara aqui para no depender de el.
# Nota: la escala rotula 1 como "Minimo" y 2 como "Muy bajo" (contraintuitivo,
# pero es el orden institucional y se respeta).
# --------------------------------------------------------------------------
ESCALA = {
    "Mínimo grado": 1,
    "Muy bajo grado": 2,
    "Bajo grado": 3,
    "Medio grado": 4,
    "Alto grado": 5,
    "Muy Alto grado": 6,
    "Máximo grado": 7,
}
ESCALA_ETIQUETAS = ["Mínimo", "Muy bajo", "Bajo", "Medio", "Alto", "Muy alto", "Máximo"]
ALTA_VALORACION = (6, 7)   # H-04: metrica de cabecera en vez de la media
BAJA_VALORACION = (1, 2)   # H-10: extremo bajo, para lecturas bimodales

TIPOS_ESCALA = ("Escala 1 a 7", "Escala 1 a 7 (matriz 1)")
TIPO_SELECCION = "Seleccione una respuesta"
TIPO_NUMERO = "Responder en numero"
TIPO_TEXTO = "Responder en texto"

# --------------------------------------------------------------------------
# H-02, H-11 · Marcadores de no-dato
# --------------------------------------------------------------------------
NULO_SQL = "\\N"
MARCADORES_NO_DATO = {
    "DATO INEXACTO", "NINGUNO", "NINGUNA", "N/A", "NA", "SIN DATO",
    "NO APLICA", "NO REGISTRA", "-", ".", "",
}

# --------------------------------------------------------------------------
# H-09 · Topes de plausibilidad. Fuera de rango se EXCLUYE, no se recorta:
# recortar al limite inventa un dato que el graduado nunca declaro.
# --------------------------------------------------------------------------
TOPES = {
    "meses": (0, 120),          # 10 anios de actividad como maximo plausible
    "salario_usd": (100, 5000),
    "conteo": (0, 50),          # trabajos, entrevistas, empleados a cargo
}

def tope_para(pregunta_norm: str):
    if "salario" in pregunta_norm:
        return "salario_usd"
    if "mes" in pregunta_norm or "tiempo" in pregunta_norm:
        return "meses"
    return "conteo"

# --------------------------------------------------------------------------
# H-03, H-08 · Olas. El diseno longitudinal quedo verificado contra la fecha de
# graduacion: PRIMERA = ano de titulacion, SEGUNDA = +1 ano, TERCERA = +2 anos.
# --------------------------------------------------------------------------
OLAS = {"PRIMERA": 0, "SEGUNDA": 1, "TERCERA": 2}
OLA_ETIQUETA = {0: "Al graduarse", 1: "Al año", 2: "A los dos años"}

# Periodos abiertos: no son un resultado, son un corte en curso (H-08)
OLAS_EXCLUIDAS = {"PRIMERA ENCUESTA-PRE-GRADO 2026"}
OLAS_EN_CURSO = {"SEGUNDA ENCUESTA-PREGRADO 2026"}

# --------------------------------------------------------------------------
# H-12 · Bloques del cuestionario. Los nombres cambian de un ano a otro y
# arrastran escapes de Excel; se mapean a un catalogo estable.
# --------------------------------------------------------------------------
BLOQUES = [
    (r"satisfacci[oó]n con los estudios",        "Satisfacción con los estudios"),
    (r"satisfacci[oó]n con el personal",         "Satisfacción con recursos y personal"),
    (r"competencias generales",                  "Competencias generales"),
    (r"competencias espec[ií]ficas",             "Competencias específicas"),
    (r"pertinencia de la formaci[oó]n",          "Pertinencia de la formación"),
    (r"informaci[oó]n de empleabilidad|empleabilidad", "Empleabilidad"),
    (r"relaci[oó]n de dependencia",              "Empleabilidad · relación de dependencia"),
    (r"negocio propio",                          "Empleabilidad · negocio propio"),
    (r"honorarios profesionales",                "Empleabilidad · honorarios"),
    (r"sin actividad laboral",                   "Empleabilidad · sin actividad"),
    (r"prospectiva",                             "Prospectiva"),
]

# --------------------------------------------------------------------------
# H-03, H-11 · Armonizacion de vocabularios entre versiones del cuestionario.
# El rediseno del instrumento renombro alternativas que significan lo mismo
# ("Empleado" en una version, "Bajo relacion de dependencia" en otra). Sin este
# mapeo la misma categoria aparece partida en dos barras del grafico.
# --------------------------------------------------------------------------
EQUIVALENCIAS = {
    "situacion_laboral": {
        "Bajo relación de dependencia": "Relación de dependencia",
        "Empleado": "Relación de dependencia",
        "Ninguna Actividad": "Sin actividad laboral",
        "Sin actividad laboral": "Sin actividad laboral",
    },
    "tipo_empresa": {
        "PUBLICO": "Pública",
        "PÚBLICA": "Pública",
        "PRIVADA": "Privada",
    },
    "rango_jerarquico": {
        "Directivo/Gerencial": "Directivo / gerencial",
        "Gerencial": "Directivo / gerencial",
        "Supervisor/Mandos Medios": "Supervisión y mandos medios",
        "Supervisor/Mandos Medios/Docentes": "Supervisión y mandos medios",
        "Obrero/Operativo": "Operativo / técnico",
        "Operativo/Técnico": "Operativo / técnico",
    },
}

# --------------------------------------------------------------------------
# Catalogo de indicadores del tablero (§5 de la auditoria).
# Se identifican por el TEXTO normalizado de la pregunta, no por pregunta_id:
# el id no es estable entre olas (H-12).
# --------------------------------------------------------------------------
INDICADORES = [
    # --- Trayectoria e insercion ---
    dict(id="situacion_laboral", bloque="Empleo", clase="categorica",
         titulo="Situación laboral",
         patron=r"sus fuentes principales de ingreso|actualmente se encuentra realizando alguna actividad",
         orden=["Relación de dependencia", "Negocio propio", "Honorarios profesionales",
                "Sin actividad laboral"],
         destacar=["Sin actividad laboral"],
         nota="De dónde provienen los ingresos del graduado. Se pregunta al año y a los dos "
              "años de titularse, no en el momento de graduarse. Quien respondió en los dos "
              "momentos aparece en ambos, porque su situación pudo cambiar."),
    dict(id="tiempo_primer_empleo", bloque="Empleo", clase="categorica",
         titulo="Tiempo hasta el primer empleo",
         patron=r"cuanto tiempo ha tardado en encontrar su primer empleo",
         orden=["0 a 6 meses", "7 a 12 meses", "13 a 24 meses", "mayor de 24 meses"],
         nota="Cuánto tardó el graduado en encontrar su primer empleo relacionado con lo que "
              "estudió, no un trabajo cualquiera. Lo declara la propia persona en la encuesta."),
    dict(id="tramo_salarial", bloque="Empleo", clase="categorica",
         titulo="Tramo salarial",
         patron=r"en que tramo se encuentra su salario mensual",
         orden=["<=SBU", "SBU a 500", "501 a 1000", "1001 a 2000", ">2000"],
         nota="Rango de ingresos mensuales de los graduados que trabajan para un empleador. "
              "SBU es el salario básico unificado del país."),
    dict(id="tipo_contrato", bloque="Empleo", clase="categorica",
         titulo="Tipo de contrato", patron=r"cual es su tipo de contrato",
         nota="Tipo de contrato de los graduados que trabajan para un empleador. Un contrato "
              "eventual indica una inserción menos estable, aunque la persona tenga trabajo."),
    dict(id="rango_jerarquico", bloque="Empleo", clase="categorica",
         titulo="Rango jerárquico alcanzado",
         patron=r"en que rango jerarquico se encuentra|indique el cargo que desempena",
         orden=["Operativo / técnico", "Supervisión y mandos medios", "Directivo / gerencial"],
         nota="Nivel del cargo que ocupa el graduado en su trabajo. Suele subir con los años "
              "transcurridos desde la titulación."),
    dict(id="sector_economico", bloque="Empleo", clase="categorica",
         titulo="Sector económico del empleador",
         patron=r"sector economico al que pertenece la empresa",
         nota="Sector económico de la empresa donde trabaja el graduado. Describe al "
              "empleador, no la ocupación concreta de la persona."),

    # --- Pertinencia ---
    dict(id="pertinencia_empleo", bloque="Pertinencia", clase="escala",
         titulo="Relación entre el empleo y la profesión",
         patron=r"se relaciona su trabajo actual con los estudios|que tan relacionadas estan las actividades",
         bimodal=True,
         nota="Cuánto se relaciona el trabajo actual del graduado con lo que estudió. Se "
              "muestran los dos extremos porque la mayoría o ejerce su profesión o no la "
              "ejerce, y hay poca gente en un punto intermedio."),

    # --- Vinculacion y prospectiva ---
    dict(id="vinculo_unemi", bloque="Vinculación", clase="categorica",
         titulo="Vínculo del empleador con la UNEMI",
         patron=r"existen vinculos entre la empresa donde trabaja|existen vinculos entre su negocio",
         destacar=["Ningún tipo de convenio"],
         nota="Si existe algún convenio entre la UNEMI y la empresa donde trabaja el "
              "graduado, o su propio negocio. Es la vía por la que la universidad puede "
              "acompañar la inserción de quienes ya se titularon."),
    dict(id="canal_busqueda", bloque="Vinculación", clase="categorica",
         titulo="Canal de búsqueda de empleo utilizado",
         patron=r"canales de busqueda de empleo que ha utilizado",
         nota="Medios que el graduado utilizó para buscar empleo. Conviene compararlo con "
              "el panel de al lado, que muestra por dónde lo encontró de verdad."),
    dict(id="medio_contratacion", bloque="Vinculación", clase="categorica",
         titulo="Medio por el que consiguió el empleo",
         patron=r"a traves de que medio lo encontro",
         nota="Medio por el que el graduado consiguió efectivamente su empleo. La distancia "
              "con el panel de al lado muestra qué vías funcionan mejor que otras."),
    dict(id="demanda_posgrado", bloque="Vinculación", clase="categorica",
         titulo="Estudios que desearía cursar en la UNEMI",
         patron=r"le gustaria cursar otros estudios en esta institucion",
         nota="Estudios que el graduado dice que le gustaría cursar en la UNEMI. Es una "
              "intención declarada en la encuesta, no una matrícula confirmada."),
]

# Bloques de escala agregados por grupo de competencia. Se conservan sólo los dos
# que permiten una lectura curricular accionable: la brecha entre lo general y lo
# especifico. Los bloques de satisfaccion se retiraron del tablero porque el
# efecto techo (76 % de las respuestas en 6 y 7) los vuelve indistinguibles
# entre carreras: no separaban nada y ocupaban espacio.
BLOQUES_ESCALA = [
    dict(id="competencias_generales", titulo="Competencias generales",
         bloques=["Competencias generales"],
         nota="Competencias transversales, comunes a todas las carreras: comunicación, "
              "trabajo en equipo, aprendizaje continuo. Se muestra qué proporción de "
              "graduados considera que las adquirió en un grado alto."),
    dict(id="competencias_especificas", titulo="Competencias específicas",
         bloques=["Competencias específicas"],
         nota="Competencias propias de cada carrera, valoradas por los propios graduados. "
              "Compararlas con las generales muestra dónde la formación se percibe más "
              "sólida y dónde hay margen de mejora."),
]

# --------------------------------------------------------------------------
# H-05, H-13 · Publicacion
# --------------------------------------------------------------------------
UMBRAL_SUPRESION = 10

# Competencia por competencia: el promedio de un bloque esconde lo importante.
# "Competencias generales 75,9 %" no dice nada accionable; el detalle sí: dominar
# un segundo idioma esta 50 puntos por debajo del resto del bloque. Se publican
# solo las competencias con suficientes respuestas en total, para que el ranking
# no lo encabece una pregunta contestada por veinte personas.
MIN_RESPUESTAS_COMPETENCIA = 200   # decision §6.2: minimo de respondentes por celda publicable

# Dimensiones por las que se agrega. El tablero filtra por una a la vez, mas el
# cruce carrera x ola, que es el unico de dos vias que se precalcula.
# --------------------------------------------------------------------------
# MODELO DE PUBLICACION: agregacion por COMBINACION
#
# Igual que scripts/agregar_datos.R en Poblacion: cada fila publicada es un
# conteo para una combinacion exacta de variables. Asi el navegador puede
# filtrar por cualquier cruce y todos los graficos se filtran entre si.
#
# Ano, momento y carrera encabezan la lista y nunca se difuminan: son los ejes
# sobre los que se lee el modulo. La generalizacion empieza por el final.
# --------------------------------------------------------------------------
DIMS_COMBO = ["anio", "ola", "carrera", "modalidad", "cohorte", "sexo",
              "grupo_socioeconomico", "rango_edad", "etnia"]

# Orden en que se difuminan las variables para alcanzar el k-anonimato: de la
# que menos aporta al analisis de empleabilidad a la que mas.
# --------------------------------------------------------------------------
# CRUCE INDICADOR x INDICADOR (filtrar pulsando cualquier grafico)
#
# Para que pulsar "0 a 6 meses" filtre el resto del tablero se publica la tabla
# cruzada de cada indicador contra los demas (ver el paso [5] de
# 02_agregar_graduados.py).
#
# Ese cruce NO lleva dimensiones demograficas, y la decision esta medida:
#
#   cruzando por            sesgo maximo   sesgo medio
#   anio + ola + carrera        89,3 pp       12,33 pp
#   ola + carrera               69,4 pp        6,87 pp
#   solo carrera                69,4 pp        5,18 pp
#   ninguna, con supresion      12,1 pp        0,52 pp
#   ninguna, sin supresion       0,8 pp        0,08 pp   <- la elegida
#
# A cualquier granularidad demografica las celdas quedan diminutas y la regla
# k=5 se lleva justo las categorias minoritarias, de modo que la categoria
# dominante se infla. Publicar el residuo agrupado corrige el denominador pero
# no el numerador: el sesgo seguia en 15 pp.
#
# Sin dimensiones la supresion deja de hacer falta: una celda "0 a 6 meses x
# sector primario" no tiene clave demografica con la que estrechar el grupo, y
# K_ANONIMATO protege combinaciones de DIMS_COMBO, no pares de respuestas. Se
# publican completas y la condicional es exacta; el 0,8 pp residual es la misma
# perdida k-anonima del 1,4% que ya afecta a todas las cifras del modulo.
#
# El precio, que el tablero declara al usuario: un filtro de respuesta da el
# corte de toda la facultad y no se combina con carrera, anio ni momento. Los
# conteos de contexto por dimension SI se publican aparte (marginales de una
# via, esos si con k), para que los paneles de reparto sigan vivos.

ORDEN_GENERALIZACION = ["etnia", "rango_edad", "grupo_socioeconomico",
                        "cohorte", "modalidad", "sexo"]

# Ninguna combinacion publicada puede corresponder a menos de K graduados.
# Sin esto, el 56 % de las combinaciones seria una sola persona y el archivo
# revelaria su respuesta individual sobre empleo y salario.
K_ANONIMATO = 5

# Etiquetas legibles de las dimensiones en la interfaz
ETIQUETA_DIM = {
    "anio": "Año de encuesta", "ola": "Momento", "carrera": "Carrera",
    "modalidad": "Modalidad", "cohorte": "Cohorte", "sexo": "Sexo",
    "grupo_socioeconomico": "Grupo socioeconómico", "rango_edad": "Edad de ingreso",
    "etnia": "Autoidentificación étnica",
}
# tres tableros hablen el mismo idioma.
RANGOS_EDAD = [(15, 19, "15-19"), (20, 24, "20-24"), (25, 29, "25-29"),
               (30, 34, "30-34"), (35, 39, "35-39"), (40, 200, "40+")]

def rango_edad(edad):
    try:
        e = int(edad)
    except (TypeError, ValueError):
        return "Dato inconsistente"
    for lo, hi, etq in RANGOS_EDAD:
        if lo <= e <= hi:
            return etq
    return "Dato inconsistente"

# Columnas de data_estudiantes_1/2.xlsx usadas en el cruce (§3 de la auditoria)
COLS_ESTUDIANTES = {
    "carrera_estudiante": 1, "modalidad": 2, "carrera_vigente": 3, "inscripcion_id": 5, "id_persona": 6,
    "sexo": 7, "edad_ingreso_carrera": 8, "provincia": 10, "etnia": 12,
    "discapacidad": 13, "grupo_socioeconomico": 15, "periodo_primer_nivel": 16,
    "nota_final": 27, "graduado": 29, "fechagraduado": 30, "periodo_graduacion_codigo": 31,
}
