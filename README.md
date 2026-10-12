# Dashboard de Desempeño de la Carrera - FACSECYD - UNEMI

Tablero de seguimiento de la Facultad de Ciencias Sociales, Educación Comercial y
Derecho: 16 carreras en modalidad en línea, presencial y semipresencial.

**Ver el dashboard:** https://dipa-unemi.github.io/dashboard_FACSECYD/

## Qué muestra

| Vista | Qué responde |
|---|---|
| Vista general | Los indicadores principales de un vistazo |
| 1. Estudiantes | Cuatro pestañas: **Trayectoria** (matrícula, retención, deserción y graduación por cohorte), **Perfil sociodemográfico** (sexo, edad de ingreso, etnia, discapacidad, nivel socioeconómico y procedencia), **Rendimiento académico** (aprobación, reprobación, notas, asistencia y repetición por periodo, nivel y grupo de estudiantes) y **Seguimiento a graduados** (trayectoria, condiciones del empleo y formación y vinculación, por año de encuesta y momento) |
| 2. Grupos de interés | Cómo perciben la carrera los estudiantes, los graduados y los docentes |
| 3. Cuerpo docente | Planta docente, nivel académico, doctorado, evaluación del desempeño, capacitación, dedicación, perfil demográfico y provincia |
| 4. Investigación y actividad académica | Cuánto publica el cuerpo docente, en qué revistas y con quién |
| 5. Vinculación e impacto | Proyectos con la comunidad, personas que se propusieron atender y resultados |
| 6. Servicios de apoyo | Cobertura de tutorías y becas, y satisfacción con los servicios |

Cada vista presenta los indicadores con su resultado y su tendencia frente a la
medición anterior, los gráficos históricos y una tabla de resultados del periodo.

## Cómo se usa

- **Filtros superiores:** modalidad, carrera, nivel (1.er nivel en adelante) y periodo. La
  modalidad acota la lista de carreras; sin elegir carrera se ve toda la facultad o toda la
  modalidad. El periodo es por año en todo el tablero, salvo en Rendimiento académico, que
  se filtra por semestre (1S 2021, 2S 2021...). El nivel aplica a los indicadores de
  estudiantes: satisfacción, tutorías y becas.
- **Filtro cruzado:** al pulsar un punto o una barra, todo el tablero pasa a ese
  periodo; al pulsar una carrera en la leyenda, pasa a esa carrera; al pulsar un
  nivel socioeconómico, los indicadores de estudiantes se recalculan para ese grupo.
- **Rendimiento académico** tiene además un selector de grupo de estudiantes (sexo,
  etnia, tipo de ingreso, cohorte, número de matrícula); también se filtra pulsando
  un nivel, una matrícula o una banda de los histogramas de nota y asistencia. Un
  grupo a la vez.
- **Seguimiento a graduados** se filtra por momento de la encuesta (al titularse, al año,
  a los dos años) y por grupo (sexo, año de titulación o nivel socioeconómico).
- El ícono **i** de cada indicador explica qué mide y de dónde sale.

Los datos son agregados por carrera y periodo: el tablero no contiene
información de personas. Los grupos con menos de 10 personas no se publican y las
categorías con menos de 5 casos se agrupan; la excepción es el Perfil
sociodemográfico, que muestra los conteos completos por decisión de la Dirección y lo
advierte en pantalla. Estos umbrales se aplican al generar los archivos de
`docs/data/`, no solo en la pantalla.
