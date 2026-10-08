/*
 * Catálogo de indicadores del tablero FACSECYD: los mismos indicadores, definiciones y fórmulas
 * que el tablero de la FACS (estructura del requerimiento 13), para que las facultades se lean igual.
 *
 * Este es el único archivo que se edita a mano. Aquí se fijan las METAS:
 * mientras una meta valga null, el tablero muestra «Por definir» y no pinta
 * semáforo, para no inventar un estado que nadie aprobó.
 *
 *   meta        valor objetivo, en la misma unidad del indicador (null = sin meta)
 *   lineaBase   valor de referencia aprobado por la carrera (null = sin definir)
 *   tolerancia  cuánto puede quedar por debajo (o por encima, si «menor es mejor»)
 *               de la meta y aún verse «En seguimiento» en lugar de «No cumple»
 *   umbral      variación mínima que cuenta como cambio en la tendencia
 *               (puntos porcentuales en %, o proporción 0.05 = 5 % en conteos)
 *   sentido     "mayor" | "menor" | "rango" | "info"
 *   acumula     true si el valor crece a lo largo del año (no se compara un año en curso)
 *   metas       metas distintas por carrera: { ENF: 80, NUT: 75 } (opcional)
 */
window.FACS_INDICADORES = {
  /* ---------------- Vista 1 - Estudiantes: trayectoria (matriz ACBSP) ---------------- */
  tray_mat: {
    vista: "estudiantes", sub: "tray", dimension: "Estudiantes", nombre: "Matrícula total",
    definicion: "Estudiantes únicos matriculados en la carrera durante el año, en periodos ordinarios.",
    formula: "Número de estudiantes únicos con matrícula en el año",
    unidad: "N.º", sentido: "info", frecuencia: "Anual", fuente: "SGA - Matrícula",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  tray_var: {
    vista: "estudiantes", sub: "tray", dimension: "Estudiantes", nombre: "Variación de matrícula",
    definicion: "Cambio porcentual de la matrícula total frente al año anterior.",
    formula: "((Matrícula del año − matrícula del año anterior) / matrícula del año anterior) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "SGA - Matrícula",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1, acumula: true
  },
  tray_ret: {
    vista: "estudiantes", sub: "tray", dimension: "Estudiantes", nombre: "Tasa de retención / permanencia",
    definicion: "De los estudiantes matriculados en un periodo (sin contar a quienes se titulan o cursan el último nivel), porcentaje que se matricula en el periodo siguiente o se titula. Se resume por año.",
    formula: "(Estudiantes que continúan o se titulan en t+1 / estudiantes de la población definida en t) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Matrícula y titulación",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1, acumula: true
  },
  tray_des: {
    vista: "estudiantes", sub: "tray", dimension: "Estudiantes", nombre: "Tasa de deserción (a mitad de la carrera)",
    definicion: "De los estudiantes que iniciaron el primer nivel en una cohorte, porcentaje que ya no continuaba sus estudios a mitad de la carrera (5.º semestre de la cohorte, para 9 niveles). Forma de cálculo del Modelo genérico de evaluación de carreras: TD = 100 × NE(Ai+δ) / NE(Ai).",
    formula: "TD = 100 × NE(Ai+δ) / NE(Ai): estudiantes de la cohorte Ai que no continuaban en Ai+δ / estudiantes que iniciaron en la cohorte Ai; δ = mitad de la duración",
    unidad: "%", sentido: "menor", frecuencia: "Por cohorte", fuente: "SGA - Matrícula",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 2, umbral: 1
  },
  tray_grad: {
    vista: "estudiantes", sub: "tray", dimension: "Estudiantes", nombre: "Tasa de graduación oportuna",
    definicion: "Porcentaje de una cohorte que se titula en el plazo de duración de la carrera (9 niveles) más un año adicional. Es la tasa de titulación del Modelo genérico de evaluación de carreras: TT = 100 × NET / TE. Solo se mide en cohortes cuya ventana ya cerró.",
    formula: "TT = 100 × NET / TE: titulados de la cohorte en el plazo de duración + un año / estudiantes matriculados en primer nivel en la cohorte",
    unidad: "%", sentido: "mayor", frecuencia: "Por cohorte", fuente: "SGA - Matrícula y titulación",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  tray_gradt: {
    vista: "estudiantes", sub: "tray", dimension: "Estudiantes", nombre: "Tasa de graduación total",
    definicion: "Porcentaje de una cohorte de ingreso que se ha titulado hasta hoy, sin límite de tiempo. Solo cohortes cuya ventana de graduación oportuna ya cerró.",
    formula: "(Titulados de la cohorte / estudiantes que ingresaron en la cohorte) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Por cohorte", fuente: "SGA - Matrícula y titulación",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  tray_ret1: {
    vista: "estudiantes", sub: "tray", dimension: "Estudiantes", nombre: "Retención de primer año",
    definicion: "Porcentaje de una cohorte de nuevo ingreso que sigue matriculada (o se tituló) un año después de ingresar.",
    formula: "(Estudiantes de la cohorte matriculados al año siguiente / estudiantes de la cohorte) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Por cohorte", fuente: "SGA - Matrícula",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  tray_tit: {
    vista: "estudiantes", sub: "tray", dimension: "Estudiantes", nombre: "Titulados",
    definicion: "Estudiantes de la carrera que se titularon en el año.",
    formula: "Número de titulados según el periodo de graduación",
    unidad: "N.º", sentido: "info", frecuencia: "Anual", fuente: "SGA - Titulación",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },

  /* ---------------- Vista 1 - Estudiantes: perfil sociodemográfico ----------------
     Informativos (sin meta): describen quién estudia en la carrera. Base: estudiantes matriculados en el año. */
  perf_n: {
    vista: "estudiantes", sub: "perfil", dimension: "Estudiantes", nombre: "Estudiantes matriculados",
    definicion: "Estudiantes matriculados en la carrera en algún periodo ordinario del año. Es la base de todos los porcentajes del perfil.",
    formula: "Número de estudiantes únicos matriculados en el año",
    unidad: "N.º", sentido: "info", frecuencia: "Anual", fuente: "SGA - Ficha del estudiante y matrícula",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  perf_muj: {
    vista: "estudiantes", sub: "perfil", dimension: "Estudiantes", nombre: "Género",
    definicion: "Distribución de los estudiantes matriculados en el año entre mujeres y hombres, según el sexo registrado en el SGA.",
    formula: "(Estudiantes mujeres u hombres / estudiantes matriculados) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "SGA - Ficha del estudiante",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  perf_gse: {
    vista: "estudiantes", sub: "perfil", dimension: "Estudiantes", nombre: "Nivel socioeconómico bajo o medio bajo",
    definicion: "Porcentaje de estudiantes clasificados en los grupos socioeconómicos bajo o medio bajo, según la ficha socioeconómica registrada al ingresar.",
    formula: "(Estudiantes de nivel bajo o medio bajo / estudiantes matriculados) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "SGA - Ficha socioeconómica",
    responsable: "Dirección de Bienestar Universitario", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  perf_etn: {
    vista: "estudiantes", sub: "perfil", dimension: "Estudiantes", nombre: "Diversidad étnica",
    definicion: "Porcentaje de estudiantes que se autoidentifican con un pueblo o nacionalidad distinto de mestizo (montubio, indígena, afroecuatoriano, blanco, mulato, negro u otro). No incluye a quienes no registran el dato.",
    formula: "(Estudiantes no mestizos con dato registrado / estudiantes matriculados) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "SGA - Ficha del estudiante (autoidentificación)",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  perf_disc: {
    vista: "estudiantes", sub: "perfil", dimension: "Estudiantes", nombre: "Estudiantes con discapacidad",
    definicion: "Porcentaje de estudiantes que registran algún tipo de discapacidad. Por protección de datos no se publica el tipo de discapacidad.",
    formula: "(Estudiantes con discapacidad / estudiantes matriculados) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "SGA - Ficha del estudiante",
    responsable: "Dirección de Bienestar Universitario", meta: null, lineaBase: null, tolerancia: 1, umbral: 0.5
  },
  perf_fuera: {
    vista: "estudiantes", sub: "perfil", dimension: "Estudiantes", nombre: "Procedencia fuera de Guayas",
    definicion: "Porcentaje de estudiantes cuya provincia de procedencia registrada no es Guayas, incluidos quienes vienen del exterior. No incluye a quienes no registran la provincia.",
    formula: "(Estudiantes de otras provincias o del exterior / estudiantes matriculados) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "SGA - Ficha del estudiante",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  perf_edad: {
    vista: "estudiantes", sub: "perfil", dimension: "Estudiantes", nombre: "Ingresó con 25 años o más",
    definicion: "Porcentaje de estudiantes que tenían 25 años o más al ingresar a la carrera.",
    formula: "(Estudiantes con edad de ingreso ≥ 25 / estudiantes matriculados) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "SGA - Ficha del estudiante",
    responsable: "Dirección de Innovación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },

  /* ---------------- Vista 1 - Estudiantes: rendimiento académico ---------------- */
  rend_est: {
    vista: "estudiantes", sub: "rend", dimension: "Estudiantes", nombre: "Estudiantes con asignaturas",
    definicion: "Estudiantes únicos con al menos una asignatura registrada en el periodo.",
    formula: "Número de estudiantes únicos con registros asignatura-estudiante",
    unidad: "N.º", sentido: "info", frecuencia: "Semestral", fuente: "SGA - Registro académico",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  rend_aprob: {
    vista: "estudiantes", sub: "rend", dimension: "Estudiantes", nombre: "Aprobación",
    definicion: "Porcentaje de las evaluaciones válidas del periodo (estado final aprobado o reprobado) que terminan aprobadas. No incluye asignaturas en curso ni en recuperación.",
    formula: "(Evaluaciones aprobadas / evaluaciones válidas) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Semestral", fuente: "SGA - Registro académico",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  rend_reprob: {
    vista: "estudiantes", sub: "rend", dimension: "Estudiantes", nombre: "Reprobación",
    definicion: "Porcentaje de las evaluaciones válidas del periodo que terminan reprobadas.",
    formula: "(Evaluaciones reprobadas / evaluaciones válidas) × 100",
    unidad: "%", sentido: "menor", frecuencia: "Semestral", fuente: "SGA - Registro académico",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 2, umbral: 1
  },
  rend_nota: {
    vista: "estudiantes", sub: "rend", dimension: "Estudiantes", nombre: "Nota promedio",
    definicion: "Promedio de las notas finales válidas (de 1 a 100) de las asignaturas del periodo. La nota mínima de aprobación es 70.",
    formula: "Suma de notas finales válidas / número de notas válidas",
    unidad: "", sentido: "mayor", frecuencia: "Semestral", fuente: "SGA - Registro académico",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 2, umbral: 0.01
  },
  rend_asist: {
    vista: "estudiantes", sub: "rend", dimension: "Estudiantes", nombre: "Asistencia promedio",
    definicion: "Promedio del porcentaje de asistencia final registrado en las asignaturas del periodo. La asistencia mínima para aprobar en las modalidades presencial y semipresencial es 70 % hasta 2S-2024 y 60 % desde 1S-2025 (Art. 77 del reglamento). En la modalidad en línea la asistencia no es requisito de aprobación: no se reprueba por asistencia inferior al mínimo.",
    formula: "Suma de porcentajes de asistencia válidos / número de registros con asistencia",
    unidad: "%", sentido: "mayor", frecuencia: "Semestral", fuente: "SGA - Registro académico",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  rend_exc: {
    vista: "estudiantes", sub: "rend", dimension: "Estudiantes", nombre: "Excelente + Muy Bueno",
    definicion: "Porcentaje de evaluaciones con nota de 90 o más: las categorías Muy Bueno y Excelente de la escala institucional (Art. 75).",
    formula: "(Evaluaciones Muy Bueno y Excelente / evaluaciones válidas) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Semestral", fuente: "SGA - Registro académico",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  rend_rep: {
    vista: "estudiantes", sub: "rend", dimension: "Estudiantes", nombre: "Estudiantes repetidores",
    definicion: "Porcentaje de estudiantes que cursan al menos una asignatura en segunda matrícula o posterior, sobre los estudiantes con número de matrícula conocido.",
    formula: "(Estudiantes con alguna matrícula ≥ 2 / estudiantes con matrícula conocida) × 100",
    unidad: "%", sentido: "menor", frecuencia: "Semestral", fuente: "SGA - Registro académico",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 2, umbral: 1
  },
  rend_aband: {
    vista: "estudiantes", sub: "rend", dimension: "Estudiantes", nombre: "Abandono de asignatura",
    definicion: "Porcentaje de registros con nota final 0, que se interpretan como asignatura no cursada o abandonada.",
    formula: "(Registros con nota final 0 / registros evaluados) × 100",
    unidad: "%", sentido: "menor", frecuencia: "Semestral", fuente: "SGA - Registro académico",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 1, umbral: 0.5
  },

  /* ---------------- Vista 1 - Estudiantes: seguimiento a graduados ----------------
     Encuestas en tres momentos: al titularse, al año y a los dos años. «Alto grado» = 6 o 7 en escala de 1 a 7. */
  grad_empleab: {
    vista: "estudiantes", sub: "grad", gv: "tray", dimension: "Estudiantes", nombre: "Empleabilidad",
    definicion: "Proporción de graduados con alguna fuente de ingreso: empleo en relación de dependencia, honorarios profesionales o negocio propio. Se pregunta al año y a los dos años de titularse.",
    formula: "(Graduados con alguna actividad laboral / graduados que responden) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_ins6: {
    vista: "estudiantes", sub: "grad", gv: "tray", dimension: "Estudiantes", nombre: "Inserción en 6 meses o menos",
    definicion: "Porcentaje de graduados que encontraron su primer empleo relacionado con lo estudiado en 6 meses o menos.",
    formula: "(Graduados con primer empleo en ≤ 6 meses / graduados que responden) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_afin: {
    vista: "estudiantes", sub: "grad", gv: "tray", dimension: "Estudiantes", nombre: "Empleo afín a la profesión",
    definicion: "Porcentaje de graduados cuyo trabajo actual se relaciona en alto grado con lo que estudiaron.",
    formula: "(Graduados con empleo de alta pertinencia / graduados que responden) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_cob: {
    vista: "estudiantes", sub: "grad", gv: "tray", dimension: "Estudiantes", nombre: "Cobertura del seguimiento",
    definicion: "Proporción de los titulados de cada año que llegó a responder al menos una encuesta. Indica cuánta confianza merecen las demás cifras.",
    formula: "(Titulados encuestados / titulados del año) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual (por año de titulación)", fuente: "SGA - Titulación y encuestas a graduados",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_resp: {
    vista: "estudiantes", sub: "grad", gv: "tray", dimension: "Estudiantes", nombre: "Respuestas a encuestas",
    definicion: "Número de encuestas contestadas en el año. Quien respondió en dos momentos distintos cuenta dos veces.",
    formula: "Número de encuestas contestadas",
    unidad: "N.º", sentido: "info", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  grad_fijo: {
    vista: "estudiantes", sub: "grad", gv: "empleo", dimension: "Estudiantes", nombre: "Contrato fijo",
    definicion: "Porcentaje de los graduados empleados con un empleador que tienen contrato fijo.",
    formula: "(Graduados con contrato fijo / graduados empleados que responden) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_sbu: {
    vista: "estudiantes", sub: "grad", gv: "empleo", dimension: "Estudiantes", nombre: "Salario por encima del básico",
    definicion: "Proporción de graduados empleados que declara un ingreso mensual superior al salario básico unificado (SBU) del año de la encuesta.",
    formula: "(Graduados con salario > SBU / graduados empleados que responden) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_sup: {
    vista: "estudiantes", sub: "grad", gv: "empleo", dimension: "Estudiantes", nombre: "En supervisión o dirección",
    definicion: "Porcentaje de graduados empleados en mandos medios o cargos directivos: indicador de progresión en la carrera laboral.",
    formula: "(Graduados en supervisión o dirección / graduados empleados que responden) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_terc: {
    vista: "estudiantes", sub: "grad", gv: "empleo", dimension: "Estudiantes", nombre: "Trabaja en el sector terciario",
    definicion: "Porcentaje de graduados empleados en comercio y servicios. Una concentración muy alta indica poca diversificación del destino laboral.",
    formula: "(Graduados en el sector terciario / graduados empleados que responden) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_sinact: {
    vista: "estudiantes", sub: "grad", gv: "empleo", dimension: "Estudiantes", nombre: "Sin actividad laboral",
    definicion: "Porcentaje de graduados que declara no tener ninguna fuente de ingreso. Complemento de la empleabilidad.",
    formula: "(Graduados sin actividad laboral / graduados que responden) × 100",
    unidad: "%", sentido: "menor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_compe: {
    vista: "estudiantes", sub: "grad", gv: "form", dimension: "Estudiantes", nombre: "Competencias específicas",
    definicion: "Porcentaje de valoraciones en alto grado (6 o 7, escala de 1 a 7) de las competencias propias de la carrera.",
    formula: "(Valoraciones de 6 y 7 / valoraciones de competencias específicas) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_compg: {
    vista: "estudiantes", sub: "grad", gv: "form", dimension: "Estudiantes", nombre: "Competencias generales",
    definicion: "Porcentaje de valoraciones en alto grado (6 o 7) de las competencias transversales: comunicación, trabajo en equipo, aprendizaje continuo y otras.",
    formula: "(Valoraciones de 6 y 7 / valoraciones de competencias generales) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_conv: {
    vista: "estudiantes", sub: "grad", gv: "form", dimension: "Estudiantes", nombre: "Empleador con convenio UNEMI",
    definicion: "Porcentaje de graduados cuyo empleador tiene algún tipo de convenio con la universidad.",
    formula: "(Graduados con empleador en convenio / graduados empleados que responden) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_bolsa: {
    vista: "estudiantes", sub: "grad", gv: "form", dimension: "Estudiantes", nombre: "Empleo por la bolsa UNEMI",
    definicion: "Porcentaje de graduados empleados que consiguieron su empleo por la bolsa de trabajo institucional.",
    formula: "(Graduados empleados vía bolsa UNEMI / graduados empleados que responden) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_maest: {
    vista: "estudiantes", sub: "grad", gv: "form", dimension: "Estudiantes", nombre: "Quiere cursar una maestría",
    definicion: "Porcentaje de graduados que declara interés en cursar una maestría en la UNEMI. Es intención declarada, no matrícula.",
    formula: "(Graduados interesados en maestría / graduados que responden) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  grad_malla: {
    vista: "estudiantes", sub: "grad", gv: "form", dimension: "Estudiantes", nombre: "Malla curricular acorde a las expectativas",
    definicion: "Porcentaje de graduados que califica con 6 o 7 (escala de 1 a 7) si la malla curricular de su carrera estuvo acorde a sus expectativas.",
    formula: "(Graduados que responden 6 o 7 / graduados que responden) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuestas de seguimiento a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },

  /* ---------------- Vista 3 - Cuerpo docente (matriz ACBSP) ----------------
     Fuente: Result_docente (planta) + desempeno_doc (SGA). Por año: docentes que dictaron en la carrera. */
  doc_n: {
    vista: "docentes", dimension: "Docentes", nombre: "Docentes de la carrera",
    definicion: "Docentes únicos que dictaron al menos una asignatura de la carrera en el año. En la facultad y en cada modalidad, quien dicta en varias carreras cuenta una vez.",
    formula: "Número de docentes únicos con asignaturas en el año",
    unidad: "N.º", sentido: "info", frecuencia: "Anual", fuente: "SGA - Distributivo (Result_docente)",
    responsable: "Dirección de Evaluación y Perfeccionamiento Académico", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  doc_phd: {
    vista: "docentes", dimension: "Docentes", nombre: "Docentes con grado doctoral",
    definicion: "Porcentaje de docentes con título de doctorado (PhD) registrado y verificado en el SGA.",
    formula: "(Docentes con PhD / total de docentes) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Títulos (desempeno_doc)",
    responsable: "Dirección de Evaluación y Perfeccionamiento Académico", meta: null, lineaBase: null, tolerancia: 2, umbral: 1
  },
  doc_maest: {
    vista: "docentes", dimension: "Docentes", nombre: "Docentes con maestría",
    definicion: "Porcentaje de docentes cuyo título más alto es una maestría (los doctores se cuentan aparte).",
    formula: "(Docentes con maestría como título más alto / total de docentes) × 100",
    unidad: "%", sentido: "info", frecuencia: "Anual", fuente: "SGA - Títulos (desempeno_doc)",
    responsable: "Dirección de Evaluación y Perfeccionamiento Académico", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  doc_cuarto: {
    vista: "docentes", dimension: "Docentes", nombre: "Docentes con posgrado (cuarto nivel)",
    definicion: "Porcentaje de docentes con PhD, maestría o especialidad. Diplomados y posgrados sin grado no cuentan.",
    formula: "(Docentes con PhD, maestría o especialidad / total de docentes) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Títulos (desempeno_doc)",
    responsable: "Dirección de Evaluación y Perfeccionamiento Académico", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  doc_eval: {
    vista: "docentes", dimension: "Docentes", nombre: "Evaluación docente satisfactoria",
    definicion: "Porcentaje de docentes evaluados con resultado total de 4,0 o más (escala de 1 a 5). Desde 2025 la escala del resultado cambia y los valores se concentran cerca de 4,0: la caída de ese año refleja el cambio de metodología; el umbral está pendiente de validación.",
    formula: "(Docentes con resultado total ≥ 4,0 / docentes evaluados) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual (promedio de sus periodos)", fuente: "SGA - Evaluación integral docente",
    responsable: "Dirección de Evaluación y Perfeccionamiento Académico", meta: null, lineaBase: null, tolerancia: 5, umbral: 1,
    corte: 2025   // la escala del resultado cambia: no se compara 2025 con 2024
  },
  doc_evalcob: {
    vista: "docentes", dimension: "Docentes", nombre: "Docentes evaluados",
    definicion: "Porcentaje de docentes de la carrera que tienen resultado en la evaluación integral docente del año.",
    formula: "(Docentes evaluados / docentes de la carrera) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Evaluación integral docente",
    responsable: "Dirección de Evaluación y Perfeccionamiento Académico", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  doc_cap: {
    vista: "docentes", dimension: "Docentes", nombre: "Participación en capacitación",
    definicion: "Porcentaje de docentes con al menos un curso de capacitación registrado en los 12 meses previos a algún periodo del año.",
    formula: "(Docentes con al menos un curso / total de docentes) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Capacitación y hoja de vida docente",
    responsable: "Dirección de Evaluación y Perfeccionamiento Académico", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  doc_tc: {
    vista: "docentes", dimension: "Docentes", nombre: "Docentes a tiempo completo",
    definicion: "Porcentaje de docentes con dedicación a tiempo completo.",
    formula: "(Docentes a tiempo completo / total de docentes) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Distributivo",
    responsable: "Dirección de Evaluación y Perfeccionamiento Académico", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  doc_carga: {
    vista: "docentes", dimension: "Docentes", nombre: "Estudiantes por docente",
    definicion: "Promedio, por periodo, de la suma de estudiantes en todas las asignaturas de cada docente (no es el tamaño de una clase).",
    formula: "Estudiantes inscritos en las asignaturas del docente / docentes",
    unidad: "", sentido: "info", frecuencia: "Anual", fuente: "SGA - Distributivo",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },

  /* ---------------- Vista 2 - Grupos de interés ---------------- */
  sat_est: {
    vista: "grupos", dimension: "Grupos de interés", nombre: "Satisfacción estudiantil",
    definicion: "Porcentaje de respuestas de los estudiantes que califican con 4 o 5, en una escala de 1 a 5, su experiencia académica y los servicios de la universidad.",
    formula: "(Valoraciones de 4 y 5 / total de valoraciones) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Semestral", fuente: "Encuesta integral de satisfacción estudiantil (SGA)",
    responsable: "DAC", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  sat_grad: {
    vista: "grupos", dimension: "Grupos de interés", nombre: "Satisfacción de graduados",
    definicion: "Porcentaje de graduados que califican con 5, 6 o 7, en una escala de 1 a 7, su satisfacción con los estudios realizados.",
    formula: "(Graduados que responden 5 a 7 / graduados consultados) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuesta a graduados (SGA)",
    responsable: "Seguimiento a graduados", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  sat_doc: {
    vista: "grupos", dimension: "Grupos de interés", nombre: "Satisfacción docente",
    definicion: "Porcentaje de respuestas de los docentes que califican con 4 o 5, en una escala de 1 a 5, las condiciones y el apoyo institucional para su labor académica.",
    formula: "(Valoraciones de 4 y 5 / total de valoraciones) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "Encuesta integral de satisfacción docente (SGA)",
    responsable: "Dirección de Evaluación y Perfeccionamiento Académico", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },

  /* ---------------- Vista 4 - Investigación ---------------- */
  pub_total: {
    vista: "investigacion", dimension: "Investigación", nombre: "Producción científica",
    definicion: "Artículos publicados por los docentes de la carrera, aprobados por la universidad y con categoría institucional asignada. Cada artículo se cuenta una sola vez aunque lo firmen varios docentes.",
    formula: "Número de artículos únicos publicados en el año",
    unidad: "N.º", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Producción científica",
    responsable: "Facultad de Investigación", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  doc_prod: {
    vista: "investigacion", dimension: "Investigación", nombre: "Docentes con producción científica",
    definicion: "Porcentaje de los docentes que dictaron clases en la carrera durante el año y que publicaron al menos un artículo ese mismo año.",
    formula: "(Docentes con al menos un artículo / docentes de la carrera en el año) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Producción científica y distributivo",
    responsable: "Facultad de Investigación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1,
    acumula: true  // en el año en curso todavía puede crecer: no se compara con un año completo
  },
  pub_alto: {
    vista: "investigacion", dimension: "Investigación", nombre: "Artículos en revistas de impacto mundial",
    definicion: "Porcentaje de los artículos del año publicados en revistas indexadas en Scopus o Web of Science (categoría científica I o II).",
    formula: "(Artículos científicos nivel I y II / artículos del año) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Producción científica",
    responsable: "Facultad de Investigación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  pub_q12: {
    vista: "investigacion", dimension: "Investigación", nombre: "Artículos en cuartiles Q1 y Q2",
    definicion: "Artículos del año publicados en revistas ubicadas en el primer o segundo cuartil de su área: el 50 % de revistas de mayor impacto.",
    formula: "Número de artículos en revistas Q1 o Q2",
    unidad: "N.º", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Producción científica",
    responsable: "Facultad de Investigación", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  pub_est: {
    vista: "investigacion", dimension: "Investigación", nombre: "Artículos con coautoría estudiantil",
    definicion: "Porcentaje de los artículos del año en los que participa al menos un estudiante como coautor: mide cuánto se integra la investigación en la formación.",
    formula: "(Artículos con al menos un estudiante coautor / artículos del año) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Producción científica",
    responsable: "Facultad de Investigación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  pub_proy: {
    vista: "investigacion", dimension: "Investigación", nombre: "Artículos derivados de proyectos",
    definicion: "Artículos del año que provienen de un proyecto de investigación registrado en la universidad.",
    formula: "Número de artículos marcados como resultado de un proyecto",
    unidad: "N.º", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Producción científica",
    responsable: "Facultad de Investigación", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },

  /* ---------------- Vista 5 - Vinculación ---------------- */
  vin_proy: {
    vista: "vinculacion", dimension: "Vinculación", nombre: "Proyectos ejecutados", tipo: "Actividad",
    definicion: "Proyectos de vinculación con la sociedad que estuvieron en ejecución en algún momento del año, aunque hayan iniciado antes; hoy pueden seguir en ejecución, estar finalizados o cerrados. No se cuenta la participación en juntas receptoras del voto.",
    formula: "Número de proyectos cuyo periodo de ejecución (inicio a fin real) incluye el año",
    unidad: "N.º", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Vinculación",
    responsable: "Facultad de Vinculación", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  vin_benef: {
    vista: "vinculacion", dimension: "Vinculación", nombre: "Beneficiarios directos previstos", tipo: "Cobertura",
    definicion: "Personas que los proyectos iniciados en el año se propusieron atender directamente. Es la cobertura planificada: no equivale a impacto.",
    formula: "Suma de beneficiarios directos registrados en los proyectos",
    unidad: "N.º", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Vinculación",
    responsable: "Facultad de Vinculación", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  vin_avance: {
    vista: "vinculacion", dimension: "Vinculación", nombre: "Avance reportado por los proyectos", tipo: "Seguimiento",
    definicion: "Avance promedio que reportan, en sus informes aprobados, los proyectos ya finalizados o cerrados respecto de lo que cada proyecto planificó. No mide el cumplimiento de objetivos de la carrera, que todavía no están definidos.",
    formula: "Promedio del avance acumulado reportado por proyecto (tope 100 %)",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Informes de vinculación",
    responsable: "Facultad de Vinculación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  vin_est: {
    vista: "vinculacion", dimension: "Vinculación", nombre: "Participaciones estudiantiles", tipo: "Actividad",
    definicion: "Estudiantes de la carrera inscritos en los proyectos iniciados en el año. Un estudiante que participa en dos proyectos cuenta dos veces.",
    formula: "Suma de estudiantes participantes por proyecto",
    unidad: "N.º", sentido: "info", frecuencia: "Anual", fuente: "SGA - Vinculación",
    responsable: "Facultad de Vinculación", meta: null, lineaBase: null, tolerancia: 10, umbral: 0.05
  },
  vin_culm: {
    vista: "vinculacion", dimension: "Vinculación", nombre: "Culminación estudiantil en proyectos", tipo: "Resultado",
    definicion: "De los estudiantes que ya cerraron su participación, porcentaje que la culminó (frente a quienes se retiraron o reprobaron).",
    formula: "(Culminados / culminados + retirados + reprobados) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Anual", fuente: "SGA - Vinculación",
    responsable: "Facultad de Vinculación", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },

  /* ---------------- Vista 6 - Servicios de apoyo ---------------- */
  sat_serv: {
    vista: "apoyo", dimension: "Servicios de apoyo", nombre: "Satisfacción con servicios de apoyo",
    definicion: "Porcentaje de respuestas de los estudiantes que califican con 4 o 5 los servicios que acompañan su trayectoria: tutorías, salud y bienestar, prácticas, trámites, atención de requerimientos, seguridad e instalaciones deportivas.",
    formula: "(Valoraciones de 4 y 5 en los siete servicios / total de valoraciones) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Semestral", fuente: "Encuesta integral de satisfacción estudiantil (SGA)",
    responsable: "DAC", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  tut_cob: {
    vista: "apoyo", dimension: "Servicios de apoyo", nombre: "Cobertura de tutorías académicas",
    definicion: "Porcentaje de los estudiantes matriculados en el periodo que asistieron al menos a una tutoría académica realizada.",
    formula: "(Estudiantes atendidos en tutoría / estudiantes matriculados) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Semestral", fuente: "SGA - Tutorías",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  tut_ejec: {
    vista: "apoyo", dimension: "Servicios de apoyo", nombre: "Tutorías realizadas",
    definicion: "De las tutorías que se agendaron y ya tuvieron resolución, porcentaje que efectivamente se llevó a cabo (el resto se canceló).",
    formula: "(Tutorías ejecutadas / ejecutadas + canceladas) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Semestral", fuente: "SGA - Tutorías",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 5, umbral: 1
  },
  tut_int: {
    vista: "apoyo", dimension: "Servicios de apoyo", nombre: "Tutorías por estudiante atendido",
    definicion: "Número promedio de tutorías a las que asistió cada estudiante que recibió al menos una.",
    formula: "Tutorías asistidas / estudiantes atendidos",
    unidad: "", sentido: "info", frecuencia: "Semestral", fuente: "SGA - Tutorías",
    responsable: "Dirección de carrera", meta: null, lineaBase: null, tolerancia: 0.5, umbral: 0.05
  },
  beca_cob: {
    vista: "apoyo", dimension: "Servicios de apoyo", nombre: "Estudiantes con beca o ayuda",
    definicion: "Porcentaje de los estudiantes matriculados en el periodo que recibieron una beca o ayuda económica aceptada.",
    formula: "(Estudiantes beneficiarios / estudiantes matriculados) × 100",
    unidad: "%", sentido: "mayor", frecuencia: "Semestral", fuente: "SGA - Bienestar universitario",
    responsable: "Dirección de Bienestar Universitario", meta: null, lineaBase: null, tolerancia: 2, umbral: 1
  }
};
