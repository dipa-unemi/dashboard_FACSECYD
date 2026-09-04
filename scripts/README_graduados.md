# Pipeline · Seguimiento a Graduados

> Los scripts en R de esta carpeta (`agregar_datos.R`, `exportar_para_looker.R`)
> pertenecen al módulo de Población. Este README cubre sólo los `.py` de Graduados.

Genera los datos agregados que consume la pestaña de Seguimiento a Graduados.
Va de los `.xlsx` privados a un único archivo publicable sin datos personales.

```
data/*.xlsx  ──▶  01_depurar_graduados.py  ──▶  build/*.pkl  ──▶  02_agregar_graduados.py  ──▶  docs/data_graduados.js
  (privado)         depura y cruza           (privado)            agrega y suprime            (publicable)
                                                                                                    │
                                                                          03_verificar_graduados.py ─┘
                                                                             (comprueba antes de publicar)
```

## Ejecutar

```bash
python scripts/01_depurar_graduados.py    # ~4 min: lee las tres bases
python scripts/02_agregar_graduados.py    # ~15 s
python scripts/03_verificar_graduados.py  # ~1 s · sale con código 1 si algo falla
```

**Ejecutar siempre el paso 3 antes de publicar.** Comprueba ocho cosas que, si fallan,
no se ven a simple vista en el tablero: un `NaN` que rompe el JavaScript en silencio,
una distribución que suma 82 % porque la supresión se llevó una categoría, un resumen
de escala que no concuerda con su propia distribución, o un corte al que le falta la
base que lo sostiene.

El paso 1 tarda porque recorre `data_estudiantes_1/2.xlsx` (1,5 M de filas) para
el cruce. Si solo cambian reglas de agregación, basta con volver a correr el paso 2.

## Qué hace cada paso

**`config_graduados.py`** — todas las reglas que afectan una cifra publicada:
equivalencias de carrera, escala institucional, topes de plausibilidad, umbral de
supresión y catálogo de indicadores. Si hay que discutir un criterio, se discute
aquí; el resto del código no decide nada.

**`01_depurar_graduados.py`** — ejecuta en orden los ocho pasos de la auditoría.
El orden importa: normalizar carreras antes de deduplicar cambia qué filas se
consideran repetidas, y tipificar antes de filtrar evita descartar valores válidos
por comparar texto con número.

1. Tipificar — `\N` a nulo, castear números, rescatar los valores que venían en la columna de texto
2. Limpiar texto — espacios, tabuladores, escapes `_x000D_`, marcadores de no-dato
3. Normalizar categorías — grafías de carrera a canónicas, bloques, valores de opción
   · y **excluir las carreras no vigentes** en modalidad presencial
4. Resolver duplicados — quitar repeticiones idénticas, excluir contradicciones
5. Topes de plausibilidad — meses 0–120, salario 100–5.000 USD, conteos 0–50
6. Marcar comparabilidad — núcleo común de preguntas, periodos abiertos
7. Enriquecer — cruce con las bases de estudiantes por `inscripcion_id`
8. Construir la tabla persona–ola, que es la unidad de conteo del tablero

**`02_agregar_graduados.py`** — agrega por **combinación** de variables, igual que
`agregar_datos.R` en Población, y escribe `docs/data_graduados.js`. Ese modelo es lo
que permite que **todos** los gráficos se filtren entre sí en el navegador.

Antes de agregar aplica **generalización k-anónima**. Es la diferencia con Población:
allí las variables de cruce son administrativas (carrera, sede, provincia), que la
universidad ya publica; aquí cada fila lleva además una respuesta de encuesta —
situación laboral, tramo salarial — que es información sensible. Con las nueve
variables sin tratar, el 56 % de las combinaciones era una sola persona: publicarlas
habría expuesto su respuesta individual.

La generalización difumina, en orden de menor a mayor valor analítico, las variables
de las combinaciones que no llegan a k=5. Resultado: **año, momento y carrera se
conservan intactos** (son los ejes del módulo, y el verificador lo comprueba), y lo
que se difumina es sobre todo etnia (49 %) y edad de ingreso (55 %), que son las que
más identifican y menos aportan a una lectura de empleabilidad. Las combinaciones que
aun así no alcanzan k se descartan.

## Reglas que no son negociables sin discutirlo

- **Nunca se promedia `respuesta_numerica` en preguntas de selección.** Ahí el número
  es el ID de la alternativa elegida, no una medición. El paso 1 la anula a propósito
  para que no se pueda promediar por accidente.
- **Doble barrera de privacidad.** En el archivo, ninguna fila corresponde a menos de
  **k=5** graduados (generalización k-anónima). En pantalla, ninguna cifra se dibuja
  con menos de **10** respuestas: el tablero vuelve a suprimir al vuelo según los
  filtros que aplique quien lo mire, porque un cruce de tres filtros puede dejar una
  celda mínima que en el archivo era grande.
- **Las escalas 1–7 se reportan como % en 6–7, no como media.** El 76 % de las
  respuestas se apila en 6 y 7: la media no distingue nada entre carreras. Por esa
  misma razón se retiraron del tablero los bloques de satisfacción: no separaban
  ninguna carrera de otra y ocupaban espacio que sí usa un indicador que decide algo.
- **Sólo entran indicadores que sostienen una decisión.** Se dejaron fuera tipo de
  empresa, primer empleo sí/no, emprendimiento sí/no, razón para recomendar y
  proyecto de vida: describen, pero no cambian ninguna acción de la facultad.
- **Los totales de facultad se leen junto a la tasa de respuesta.** Varía entre
  carreras, así que un total crudo sobrerrepresenta a quienes más respondieron.
- **Las carreras no vigentes quedan fuera, con el mismo criterio que Población.**
  `dashboard/Script_poblacion_general.R` excluye 14 combinaciones carrera+PRESENCIAL;
  `config_graduados.NO_VIGENTES` replica esa lista exactamente. Si el equipo la cambia
  allí, hay que cambiarla aquí: si las dos pestañas no comparten universo, los totales
  de la facultad no cuadran entre ellas. La regla se aplica también al denominador de
  la tasa de respuesta, no sólo al numerador.
- **La unidad de conteo es la observación, no la persona.** Un graduado puede estar
  sin empleo al graduarse y con contrato fijo dos años después: ambas cosas son
  ciertas y ambas se cuentan. Por eso `pct` se calcula sobre pares persona–ola y
  suma 100 % dentro de cada corte. `personas` va aparte, y es la columna sobre la
  que se aplica la supresión.

## Salida

`docs/data_graduados.js` define `RAW_GRADUADOS` con:

| Tabla | Contenido |
|---|---|
| `dims` / `dicts` | las 9 variables de cruce y sus valores |
| `rows_cat` | una fila por combinación × indicador × categoría, con su conteo |
| `rows_esc` | una fila por combinación × bloque de escala, con los 7 conteos |
| `rows_per` | una fila por combinación, con observaciones y graduados |
| `cobertura` | tasa de respuesta contra el universo de titulados |
| `catalogo` | indicadores disponibles, con su nota metodológica |
| `comparabilidad` | preguntas y respondentes por ola, y cuánto comparte del núcleo |
| `escala_valoracion` | la escala institucional 1–7 |
| `meta` | fecha, fuente, alcance, umbral y advertencia de interpretación |

Las tres tablas `rows_*` son texto plano con índices separados por `|`, el mismo
formato compacto que usa `data.js` en Población. El navegador las parsea una vez a
`Int32Array` y filtra sobre ellas.

## Datos personales

`build/` contiene las tablas intermedias con datos identificables y está ignorado
por git. El único archivo que llega a `docs/` son conteos agregados: no lleva
`persona_id`, ni `inscripcion_id`, ni respuestas individuales.

El cruce con las bases de estudiantes incorpora sexo, etnia, discapacidad y grupo
socioeconómico al análisis. Se ejecuta en local y solo sale publicado el agregado
con la supresión aplicada. **Confirmar con la facultad antes de publicar los cortes
por etnia y discapacidad**, que son los más sensibles.

## Lo que NO se publica

El detalle de la depuración (cuántos registros se corrigieron por cada regla) **no
viaja al tablero**: es material de auditoría, no de presentación. Vive en
`build/qc_graduados.json` y se resume en la pestaña «Cómo leer» sólo como el
porcentaje de registros conservados.

## Alcance

- **Cohortes de titulación 2022–2025**, y años de encuesta 2022–2026. Las olas de
  2021 desaparecen por completo: el 100 % de sus encuestados pertenecía a carreras
  no vigentes, así que la exclusión se los lleva enteros. La serie temporal empieza
  en 2022, no en 2021.
- **Marketing y Diseño Gráfico y Publicidad no aparecen** en el módulo: el 100 % y el
  98 % de sus graduados encuestados estaban en la modalidad presencial no vigente.
  Quedan 8 carreras de las 10 canónicas.
- **El cruce con estudiantes cubre el 99,5 %** de los graduados que sí entran (antes
  de excluir las no vigentes era el 85,2 %: las carreras viejas eran justamente las
  que no cruzaban).
- **Primera encuesta 2026 excluida**: 1 respondente, periodo en curso.
- **Segunda encuesta 2026 marcada como periodo abierto**: además usa un cuestionario
  rediseñado que comparte poco con el anterior.

## La pestaña

`docs/seguimiento_graduados.html` consume `RAW_GRADUADOS` y se carga en un iframe
desde `index.html`, igual que Rendimiento Académico. Es autocontenida: su propio CSS
y JS, sin librerías externas.

Tres decisiones de diseño que conviene no deshacer sin discutirlo:

- **Todo se filtra con todo.** Los nueve filtros del panel lateral se combinan
  libremente, y pulsar cualquier barra de dimensión, un año de la serie o un momento
  de la trayectoria filtra el tablero entero. Un gráfico nunca se reduce a la barra
  que acabas de pulsar: al dibujar una dimensión se ignora su propio filtro.
- **Cada panel lleva su nota metodológica** en el icono «i», igual que Perfil
  Estudiantil. El verificador falla si un indicador del catálogo se queda sin nota.
- **Los paneles sin dato dicen que el dato existe pero no puede mostrarse.** No es
  lo mismo que un dato faltante, y la diferencia importa para quien lee el tablero.
- **La tasa de respuesta acompaña siempre al segmento.** Es lo que impide leer un
  total de facultad como si fuera representativo de la facultad.
