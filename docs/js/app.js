/*
 * Dashboard de Desempeño de la Carrera - FACSECYD - UNEMI
 * Adaptación del tablero de la FACS (mismo diseño, vistas e indicadores) a las 16
 * carreras de la FACSECYD, agrupadas por modalidad (en línea, presencial, semipresencial).
 * Los datos los genera scripts/pipeline/ (ver su README); los nombres window.FACS_* se
 * conservan para que el código siga igual al de la FACS. No hay microdatos en el navegador.
 * Claves de carrera: la facultad (FACSECYD), cada modalidad (MOD_*) y cada carrera.
 *
 * Regla de periodo: cada indicador se muestra en su periodicidad real. La tarjeta
 * toma la última medición disponible hasta el año elegido y la compara con la
 * medición inmediatamente anterior; no se inventan valores para años sin medición.
 *
 * Filtro cruzado: pulsar un punto o una barra de un periodo filtra todo el
 * tablero a ese periodo; pulsar una carrera (leyenda o etiqueta) cambia la
 * carrera; pulsar un nivel socioeconómico recalcula los indicadores de
 * estudiantes para ese nivel. Lo que no tiene ese desglose lo dice en su tarjeta.
 *
 * Vista 1 - Estudiantes tiene dos pestañas, ambas exportadas desde R:
 *  - Rendimiento académico (window.FACS_REND), con su propio grupo de estudiantes
 *    (sexo, etnia, cohorte, tipo de ingreso, n.º de matrícula o banda de nota/asistencia).
 *  - Seguimiento a graduados (window.FACS_GRAD), por año de encuesta y momento
 *    (al titularse, al año, a los dos años), con grupo por sexo o cohorte de titulación.
 * Los cruces no se combinan: un grupo a la vez.
 *
 *  - Trayectoria (window.FACS_TRAY): matrícula, retención y deserción por año;
 *    retención de primer año y graduación por cohorte de ingreso.
 *  - Perfil sociodemográfico (window.FACS_PERFIL): sexo, edad de ingreso, etnia,
 *    discapacidad, nivel socioeconómico y procedencia, por año.
 * Protección de datos: los grupos con menos de MIN_BASE personas y las categorías con
 * menos de K_ANON casos ya vienen suprimidos o agrupados desde el pipeline; el navegador no los recibe.
 *
 * El filtro de periodo es por año en todo el tablero, salvo en Rendimiento académico,
 * que se filtra por semestre (1S 2021, 2S 2021...).
 */
(function () {
  'use strict';
  const D = window.FACS_DATA, CAT = window.FACS_INDICADORES, R = window.FACS_REND, G = window.FACS_GRAD, T = window.FACS_TRAY, P = window.FACS_PERFIL,
    DOC = window.FACS_DOC;   // vista 3 - Cuerpo docente (scripts/pipeline/03_agregar_docentes.py)
  /* Protección de datos: umbrales con que se exportaron los datos de la vista 1 (ver scripts/pipeline/comun.py). */
  /* El perfil no aplica umbral (decisión de la Dirección); las demás pestañas sí. */
  const MIN_BASE = (R || T || G || {}).minBase || 0, K_ANON = (R || G || T || {}).kAnon || 0;
  /* Carreras y modalidades: vienen del catálogo de los datos (scripts/pipeline/comun.py).
     Claves: la facultad (FAC), cada modalidad (MOD_LIN, MOD_PRE, MOD_SEM) y cada carrera. */
  const FAC = D.facultad, MODS = D.modalidades, CARS = D.carreras.map(c => c.k);
  const MOD_COL = { MOD_LIN: '#3c7aa0', MOD_PRE: '#f48521', MOD_SEM: '#7a5aa6' };
  const NOM = { [FAC]: 'Toda la facultad' }, CORTO = { [FAC]: 'Facultad' }, COL = { [FAC]: '#1c3247' };
  const MOD_DE = {};   // clave -> modalidad (las carreras y las propias modalidades)
  MODS.forEach(m => { NOM[m.k] = 'Modalidad ' + m.nom.toLowerCase(); CORTO[m.k] = m.nom; COL[m.k] = MOD_COL[m.k]; MOD_DE[m.k] = m.k; });
  D.carreras.forEach(c => { const m = MODS.find(x => x.mod === c.mod); MOD_DE[c.k] = m.k; NOM[c.k] = c.nom; CORTO[c.k] = c.corto; COL[c.k] = MOD_COL[m.k]; });
  const TODAS = [FAC].concat(MODS.map(m => m.k), CARS);
  const esAgregado = k => k === FAC || MODS.some(m => m.k === k);
  const miembros = k => k === FAC ? CARS : (MODS.find(m => m.k === k) || { carreras: [k] }).carreras;
  /* Claves que se comparan en las tablas de detalle: con la facultad, todas; con una modalidad o
     una de sus carreras, la facultad, esa modalidad y sus carreras. */
  const ambito = c => c === FAC ? TODAS : [FAC, MOD_DE[c]].concat(miembros(MOD_DE[c]));
  /* La selección incluye carreras en línea (donde la asistencia no condiciona la aprobación). */
  const tieneLinea = c => c === FAC || MOD_DE[c] === 'MOD_LIN';
  /* Asistencia mínima vigente en un periodo (Art. 77): 70 % hasta 2S-2024, 60 % desde 1S-2025. */
  const umbralA = p => (R && R.umbralesAsistencia && R.umbralesAsistencia[p]) || (R ? R.umbralAsistencia : 70);
  const umbralTxt = () => R && R.umbralAsistenciaAnterior
    ? `${R.umbralAsistenciaAnterior} % hasta ${tick(siguienteAtras(R.umbralAsistenciaDesde))} y ${R.umbralAsistencia} % desde ${tick(R.umbralAsistenciaDesde)}`
    : `${R ? R.umbralAsistencia : 70} %`;
  function siguienteAtras(cod) { const [s, a] = cod.split('-'); return s === '1S' ? `2S-${+a - 1}` : `1S-${a}`; }

  /* ------------------------------------------------------------ vistas */
  const IC = {
    inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
    estudiantes: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.6c2.6.2 4.5 2.2 4.5 5.4"/>',
    aprendizaje: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2"/>',
    grupos: '<path d="M4 5h11a1 1 0 011 1v7a1 1 0 01-1 1H9l-4 3v-3H4a1 1 0 01-1-1V6a1 1 0 011-1z"/><path d="M16 9h4a1 1 0 011 1v6a1 1 0 01-1 1h-1v3l-3.5-3H11"/>',
    docentes: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
    planificacion: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    investigacion: '<path d="M4 20h16"/><rect x="5" y="12" width="3" height="6"/><rect x="10.5" y="8" width="3" height="10"/><rect x="16" y="4" width="3" height="14"/>',
    vinculacion: '<circle cx="12" cy="5" r="2.3"/><circle cx="5" cy="18" r="2.3"/><circle cx="19" cy="18" r="2.3"/><path d="M11 7l-5 9M13 7l5 9M7.3 18h9.4"/>',
    apoyo: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
    rendimiento: '<path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5.1 8.5 1.5 2-1.4 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5z"/><path d="M12 6.5V19"/>',
    idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>'
  };
  /* Íconos de las tarjetas (vistas 1 y 3): trazos de 24 × 24, mismo estilo que el menú. */
  const ICO = {
    personas: IC.estudiantes,
    tendencia: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    escudo: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    salida: '<path d="M10 4H5a1 1 0 00-1 1v14a1 1 0 001 1h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
    birrete: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>',
    diploma: '<rect x="3" y="5" width="18" height="12" rx="1"/><path d="M7 9h10M7 13h6"/><circle cx="17" cy="17" r="2.5"/>',
    bandera: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 10"/>',
    cruz: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/>',
    repetir: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
    maletin: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M3 13h18"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    diana: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
    grafico: '<path d="M12 3a9 9 0 109 9h-9z"/><path d="M14 3.3A9 9 0 0120.7 10H14z"/>',
    mensaje: '<path d="M4 5h16v11H9l-5 4z"/>',
    documento: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/>',
    dolar: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.6-.6-3-1.6M12 6v2M12 16v2"/>',
    escalera: '<path d="M4 20h4v-4h4v-4h4V8h4"/>',
    tienda: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 01-6 0 3 3 0 01-4 0 3 3 0 01-6 0z"/><path d="M5 13v7h14v-7"/>',
    pausa: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    bombilla: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>',
    libro: '<path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5.1 8.5 1.5 2-1.4 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5z"/><path d="M12 6.5V19"/>',
    mano: '<path d="M3 12l4-4 5 3 5-3 4 4-9 7z"/>',
    lupa: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    cuadricula: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    mujer: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/>',
    casa: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-5h4v5"/>',
    globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    accesible: '<circle cx="12" cy="4.5" r="1.8"/><path d="M8 9h8M12 9v5l-3 6M12 14l3 6"/>',
    pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0112 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    pastel: '<path d="M4 21h16M5 21v-6h14v6M5 15c2 1 3 1 4.7 0s3 1 4.6 0 3 1 4.7 0"/><path d="M12 15v-4M12 7.5c-.8-.8-.8-2 0-3 .8 1 .8 2.2 0 3z"/>',
    sonrisa: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8M9 9.5h.01M15 9.5h.01"/>'
  };
  const KPI_IC = {
    _: ICO.grafico,
    tray_mat: ICO.personas, tray_var: ICO.tendencia, tray_ret: ICO.escudo, tray_ret1: ICO.bandera, tray_des: ICO.salida,
    tray_grad: ICO.birrete, tray_gradt: ICO.birrete, tray_tit: ICO.diploma,
    perf_n: ICO.personas, perf_muj: ICO.mujer, perf_edad: ICO.pastel, perf_gse: ICO.casa, perf_etn: ICO.globo, perf_disc: ICO.accesible, perf_fuera: ICO.pin,
    rend_est: ICO.personas, rend_aprob: ICO.check, rend_reprob: ICO.cruz, rend_nota: ICO.lapiz, rend_exc: ICO.estrella,
    rend_asist: ICO.calendario, rend_rep: ICO.repetir, rend_aband: ICO.salida,
    grad_empleab: ICO.maletin, grad_ins6: ICO.reloj, grad_afin: ICO.diana, grad_cob: ICO.grafico, grad_resp: ICO.mensaje,
    grad_fijo: ICO.documento, grad_sbu: ICO.dolar, grad_sup: ICO.escalera, grad_terc: ICO.tienda, grad_sinact: ICO.pausa,
    grad_compe: ICO.bombilla, grad_compg: ICO.libro, grad_conv: ICO.mano, grad_bolsa: ICO.lupa, grad_maest: ICO.birrete, grad_malla: ICO.cuadricula,
    doc_n: ICO.personas, doc_tc: ICO.reloj, doc_cuarto: ICO.libro, doc_phd: ICO.birrete, doc_maest: ICO.diploma,
    doc_eval: ICO.estrella, doc_cap: ICO.bombilla, sat_doc: ICO.sonrisa, sat_est: ICO.sonrisa, sat_grad: ICO.diploma,
    // vistas 2, 4, 5 y 6
    pub_total: ICO.documento, doc_prod: ICO.lapiz, pub_alto: ICO.globo, pub_q12: ICO.estrella, pub_est: ICO.birrete, pub_proy: ICO.bombilla,
    vin_proy: ICO.mano, vin_benef: ICO.personas, vin_avance: ICO.tendencia, vin_est: ICO.birrete, vin_culm: ICO.check,
    sat_serv: ICO.sonrisa, tut_cob: ICO.mensaje, tut_ejec: ICO.calendario, tut_int: ICO.repetir, beca_cob: ICO.dolar
  };
  const VISTAS = [
    { id: 'inicio', num: '', nom: 'Vista general', obj: 'Lectura ejecutiva de los indicadores estratégicos de la carrera.' },
    { sep: true },
    { id: 'estudiantes', num: '1', nom: 'Estudiantes', obj: 'Rendimiento académico de los estudiantes y trayectoria de los graduados.' },
    { id: 'grupos', num: '2', nom: 'Grupos de interés', obj: 'Percepción de estudiantes, graduados y docentes sobre la carrera.' },
    { id: 'docentes', num: '3', nom: 'Cuerpo docente', obj: 'Composición, nivel académico, desempeño y desarrollo del cuerpo docente de la carrera.' },
    { id: 'investigacion', num: '4', nom: 'Investigación y actividad académica', obj: 'Producción científica del cuerpo docente: cuánto se publica, dónde y con quién.' },
    { id: 'vinculacion', num: '5', nom: 'Vinculación e impacto', obj: 'Actividad, cobertura y resultados de los proyectos de vinculación con la sociedad.' },
    { id: 'apoyo', num: '6', nom: 'Servicios de apoyo', obj: 'Acceso, cobertura y percepción de los servicios que acompañan la trayectoria del estudiante.' }
  ];

  /* ------------------------------------------------------------ estado */
  const anios = [];
  for (let a = 2021; a <= D.anioActual; a++) anios.push(a);
  /* Periodo: por año en todo el tablero; solo Rendimiento académico se filtra por semestre (st.sem).
     sub = pestaña de Estudiantes; gv = vista de graduados; gmom = momento de la encuesta (T = todos);
     gf = grupo de graduados; tf = grupo de trayectoria; glin = indicador de la línea de graduados. */
  const ultimoSem = D.periodos[D.periodos.length - 1].p;
  const st = { car: FAC, anio: D.anioActual, vista: 'inicio', foco: null, sem: null, gse: null, niv: null, rf: null,
    sub: 'tray', gv: 'tray', gmom: 'T', gf: null, tf: null, pc: {}, glin: 'grad_empleab' };
  const semDeAnio = a => { const ps = D.periodos.filter(x => x.a === +a); return ps.length ? ps[ps.length - 1].p : null; };
  /* Indicadores de estudiantes: los únicos que se pueden desglosar por nivel socioeconómico. */
  const GSE_IND = new Set(['sat_est', 'sat_serv', 'tut_cob', 'tut_ejec', 'tut_int', 'beca_cob']);
  const GSE_DET = new Set(['sat_est', 'sat_serv', 'beca_tipo']);
  const GSE_NOM = { 'BAJO': 'Bajo', 'MEDIO BAJO': 'Medio bajo', 'MEDIO TÍPICO': 'Medio típico', 'MEDIO ALTO': 'Medio alto', 'ALTO': 'Alto' };
  const GSE_ORD = Object.keys(GSE_NOM);
  /* Nivel de la carrera: misma lógica que el nivel socioeconómico. Se usa uno a la vez. */
  const NIV_ORD = [...new Set(Object.keys(D.ind.tut_cob).filter(k => /\|N\d$/.test(k)).map(k => k.split('|')[1]))].sort();
  const ORDINAL = { 1: '1.er', 2: '2.º', 3: '3.er', 4: '4.º', 5: '5.º', 6: '6.º', 7: '7.º', 8: '8.º', 9: '9.º' };
  const nivNom = n => ORDINAL[n.slice(1)] + ' nivel';
  const dimAct = () => st.gse || st.niv;
  /* Rendimiento: nivel y nivel socioeconómico (globales) o el grupo propio de la vista. */
  const REND_CAMPO = { rend_est: 'e', rend_aprob: 'pa', rend_reprob: 'pr', rend_nota: 'np', rend_asist: 'as', rend_exc: 'pem', rend_rep: 'prep', rend_aband: 'pab' };
  const REND_IND = new Set(R ? Object.keys(REND_CAMPO) : []);
  const enRend = () => st.vista === 'estudiantes' && st.sub === 'rend';
  const enGrad = () => st.vista === 'estudiantes' && st.sub === 'grad';
  const dimRend = () => st.niv || st.gse || (enRend() ? st.rf : null);
  /* Graduados: indicador -> posición en FACS_GRAD.indicadores. Admiten nivel socioeconómico, no nivel de carrera. */
  const GRAD_CAMPO = { grad_empleab: 'empleabilidad', grad_ins6: 'insercion_6m', grad_afin: 'empleo_afin', grad_fijo: 'contrato_fijo',
    grad_sbu: 'salario_sobre_sbu', grad_sup: 'supervision_direccion', grad_terc: 'sector_terciario', grad_sinact: 'sin_actividad',
    grad_compe: 'competencias_especificas', grad_compg: 'competencias_generales', grad_conv: 'empleador_convenio',
    grad_bolsa: 'empleo_bolsa_unemi', grad_maest: 'quiere_maestria', grad_malla: 'malla_acorde' };
  const GRAD_IND = new Set(G ? Object.keys(GRAD_CAMPO).concat('grad_resp', 'grad_cob') : []);
  const dimGrad = () => st.gse || (enGrad() ? st.gf : null);
  const claveGrad = car => car + (dimGrad() ? '|' + dimGrad() : '');
  /* Trayectoria: los indicadores por cohorte no se cruzan con tipo de ingreso ni cohorte; titulados, no con tipo de ingreso. */
  const TRAY_IND = new Set(T ? ['tray_mat', 'tray_var', 'tray_ret', 'tray_des', 'tray_ret1', 'tray_grad', 'tray_gradt', 'tray_tit'] : []);
  const TRAY_COH = new Set(['tray_ret1', 'tray_grad', 'tray_gradt', 'tray_des']);   // indicadores por cohorte de ingreso
  const enTray = () => st.vista === 'estudiantes' && st.sub === 'tray';
  const dimTray = () => st.gse || (enTray() ? st.tf : null);
  const trayAdmite = (id, d) => !d || !((TRAY_COH.has(id) || id === 'tray_tit') && /^tipo_ingreso:/.test(d)) && !(TRAY_COH.has(id) && /^cohorte:/.test(d));
  /* Perfil: filtro cruzado. st.pc = { dimensión: valor } (varios a la vez) + nivel socioeconómico global. */
  const PERF_IND = new Set(P ? ['perf_n', 'perf_muj', 'perf_gse', 'perf_etn', 'perf_disc', 'perf_fuera', 'perf_edad'] : []);
  const enPerf = () => st.vista === 'estudiantes' && st.sub === 'perfil';
  const hayPc = () => Object.keys(st.pc).length > 0;
  const soporta = id => REND_IND.has(id) || GSE_IND.has(id) || (GRAD_IND.has(id) && id !== 'grad_cob' && !st.niv)
    || (TRAY_IND.has(id) && !st.niv && trayAdmite(id, dimTray())) || (PERF_IND.has(id) && !st.niv);

  /* ------------------------------------------------------------ formato */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function num(v, dec) {
    if (v == null || isNaN(v)) return '—';
    const p = Math.abs(v).toFixed(dec || 0).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '−' : '') + p.join(',');
  }
  const unidad = id => CAT[id].unidad;
  function fmt(id, v) {
    if (v == null) return '—';
    const u = unidad(id);
    return u === '%' ? num(v, 1) + ' %' : u === 'N.º' ? num(v, 0) : num(v, 1);
  }
  function valHTML(id, v) {
    if (v == null) return '—';
    const u = unidad(id);
    return u === '%' ? num(v, 1) + '<small>%</small>' : esc(fmt(id, v));
  }
  const tick = p => /^\d{4}$/.test(p) ? p : p.replace('-', ' ');
  function ordenP(p) { if (/^\d{4}$/.test(p)) return +p * 10; const [s, a] = p.split('-'); return +a * 10 + +s[0]; }

  /* ------------------------------------------------------------ datos */
  const conGse = (id, car) => REND_IND.has(id) ? (dimRend() ? car + '|' + dimRend() : car)
    : id === 'grad_cob' ? car
    : GRAD_IND.has(id) ? claveGrad(car) + '#' + st.gmom
    : TRAY_IND.has(id) ? (dimTray() && trayAdmite(id, dimTray()) ? car + '|' + dimTray() : car)
    : PERF_IND.has(id) ? car   // el perfil recalcula sus series con los filtros activos (perfSeries)
    : dimAct() && GSE_IND.has(id) ? car + '|' + dimAct() : car;
  const serie = (id, car) => (D.ind[id] && D.ind[id][conGse(id, car)]) || [];
  const detDe = (nombre, car) => (D.det[nombre] || {})[dimAct() && GSE_DET.has(nombre) ? car + '|' + dimAct() : car];
  const esAnual = p => /^\d{4}$/.test(p);
  const anioCorte = () => st.sem ? +st.sem.slice(-4) : st.anio;
  /* Corte temporal: hasta el semestre pulsado, o hasta el año elegido. */
  const dentroP = p => esAnual(p) ? +p <= anioCorte() : (st.sem ? ordenP(p) <= ordenP(st.sem) : +p.slice(-4) <= st.anio);
  const dentro = pt => dentroP(pt.p);
  const esSel = x => st.sem ? (x.p === st.sem || (esAnual(x.p) && x.a === anioCorte())) : x.a === st.anio;
  const hasta = (id, car) => serie(id, car).filter(dentro);
  const hayMeta = id => metaDe(id, st.car) != null && CAT[id].sentido !== 'info';
  const etiquetaCorte = () => st.sem ? `${tick(st.sem)} (${lblDe(st.sem)})` : 'hasta ' + st.anio;
  function medir(id, car) {
    const pts = hasta(id, car).filter(p => p.v != null);
    return { cur: pts[pts.length - 1] || null, prev: pts[pts.length - 2] || null, pts };
  }
  function metaDe(id, car) {
    const c = CAT[id];
    return c.metas && c.metas[car] != null ? c.metas[car] : c.meta;
  }
  function tendencia(id, cur, prev) {
    if (!cur || !prev) return { cls: 'neu', html: '<span class="trend neu">Primera medición</span>', txt: 'primera medición' };
    const c = CAT[id], d = cur.v - prev.v;
    // Cambio de metodología (p. ej. la escala de la evaluación docente desde 2025): no se comparan los dos lados del corte
    if (c.corte && prev.a < c.corte && cur.a >= c.corte)
      return { cls: 'neu', html: `<span class="trend neu" title="La metodología cambió en ${c.corte}: no se compara con años anteriores">Cambio de escala</span>`, txt: 'cambio de escala' };
    if (cur.parcial && (c.acumula || c.unidad === 'N.º'))
      return { cls: 'neu', html: '<span class="trend neu" title="El año todavía no termina: no se compara con un año completo">Año en curso</span>', txt: 'año en curso' };
    const rel = c.unidad === '%' ? Math.abs(d) : Math.abs(d) / Math.max(Math.abs(prev.v), 1);
    const sig = rel >= c.umbral;
    const dir = !sig ? 0 : d > 0 ? 1 : -1;
    let cls = 'neu';
    if (dir && c.sentido === 'mayor') cls = dir > 0 ? 'fav' : 'desf';
    if (dir && c.sentido === 'menor') cls = dir < 0 ? 'fav' : 'desf';
    const flecha = dir > 0 ? '↑' : dir < 0 ? '↓' : '→';
    const cant = c.unidad === '%' ? num(Math.abs(d), 1) + ' pp' : num(Math.abs(d), c.unidad === 'N.º' ? 0 : 1);
    const lect = !dir ? 'sin variación significativa' : (dir > 0 ? 'sube ' : 'baja ') + cant;
    const title = `${lect[0].toUpperCase() + lect.slice(1)} frente a ${prev.l} (${fmt(id, prev.v)})` +
      (cls === 'fav' ? ': mejora.' : cls === 'desf' ? ': empeora.' : '.');
    return { cls, dir, d, html: `<span class="trend ${cls}" title="${esc(title)}">${flecha} ${dir ? cant : 'Estable'}</span>`, txt: lect };
  }
  function estado(id, car, v) {
    const meta = metaDe(id, car), c = CAT[id];
    if (meta == null || v == null || c.sentido === 'info')
      return { cls: 'sin', html: '<span class="estado sin" title="La carrera aún no ha fijado una meta para este indicador">Sin meta</span>' };
    const t = c.tolerancia || 0;
    let k;
    if (c.sentido === 'menor') k = v <= meta ? 'ok' : v <= meta + t ? 'seg' : 'mal';
    else if (c.sentido === 'rango' && Array.isArray(meta)) k = v >= meta[0] && v <= meta[1] ? 'ok' : (v >= meta[0] - t && v <= meta[1] + t) ? 'seg' : 'mal';
    else k = v >= meta ? 'ok' : v >= meta - t ? 'seg' : 'mal';
    const lab = { ok: '✓ Cumple', seg: '! En seguimiento', mal: '✕ No cumple' }[k];
    return { cls: k, html: `<span class="estado ${k}">${lab}</span>` };
  }
  const metaTxt = (id, car) => { const m = metaDe(id, car); return m == null ? 'Por definir' : Array.isArray(m) ? fmt(id, m[0]) + ' – ' + fmt(id, m[1]) : (CAT[id].sentido === 'menor' ? '≤ ' : '≥ ') + fmt(id, m); };

  function baseTxt(id, p) {
    if (!p) return '';
    const n = p.n, k = p.num;
    switch (id) {
      case 'sat_est': case 'sat_serv': return `${num(n)} estudiantes encuestados` + (p.cob != null ? ` - ${num(p.cob, 0)} % de la matrícula` : '');
      case 'sat_doc': return `${num(n)} docentes encuestados` + (p.cob != null ? ` - ${num(p.cob, 0)} % de la planta` : '');
      case 'sat_grad': return `${num(n)} graduado${n === 1 ? '' : 's'} consultado${n === 1 ? '' : 's'}` + (n < 10 ? ' - base pequeña' : '');
      case 'doc_prod': return `${num(k)} de ${num(n)} docentes`;
      case 'pub_alto': case 'pub_est': return `${num(k)} de ${num(n)} artículos`;
      case 'tut_cob': case 'beca_cob': return `${num(k)} de ${num(n)} matriculados`;
      case 'tut_ejec': return `${num(n)} tutorías agendadas`;
      case 'tut_int': return `${num(n)} estudiantes atendidos`;
      case 'vin_avance': return `${num(n)} proyecto${n === 1 ? '' : 's'} terminado${n === 1 ? '' : 's'}`;
      case 'vin_culm': return `${num(n)} participaciones cerradas`;
      case 'rend_est': return `${num(n)} evaluaciones válidas`;
      case 'rend_rep': return `${num(p.e)} estudiantes`;
      case 'rend_aprob': case 'rend_reprob': case 'rend_nota': case 'rend_asist': case 'rend_exc': case 'rend_aband':
        return `${num(n)} evaluaciones - ${num(p.e)} estudiantes`;
      case 'tray_mat': return p.parcial ? 'Año en curso: aún puede crecer' : 'Estudiantes únicos matriculados en el año';
      case 'tray_var': return 'Frente a la matrícula del año anterior';
      case 'tray_ret': return `${num(k)} de ${num(n)} estudiantes` + (p.parcial ? ' - año en curso' : '');
      case 'tray_des': return `${num(k)} de ${num(n)} estudiantes`;
      case 'tray_ret1': return `${num(k)} de ${num(n)} estudiantes de la cohorte`;
      case 'tray_grad': case 'tray_gradt': return `${num(k)} titulados de ${num(n)} que ingresaron`;
      case 'tray_tit': return p.parcial ? 'Año en curso: aún puede crecer' : '';
      case 'perf_n': return p.parcial ? 'Año en curso: aún puede crecer' : 'Base de los porcentajes del perfil';
      case 'perf_muj': case 'perf_gse': case 'perf_etn': case 'perf_disc': case 'perf_fuera': case 'perf_edad':
        return `${num(k)} de ${num(n)} estudiantes`;
      case 'doc_n': return p.parcial ? 'Año en curso: solo 1S 2026' : '';
      case 'doc_eval': return `Sobre ${num(n)} docentes evaluados` + (p.a >= 2025 ? ' - nueva escala desde 2025' : '');
      case 'doc_carga': return 'Promedio por periodo';
      case 'doc_phd': case 'doc_maest': case 'doc_cuarto': case 'doc_evalcob': case 'doc_cap': case 'doc_tc':
        return `Sobre ${num(n)} docentes` + (p.parcial ? ' - año en curso' : '');
      case 'grad_resp': return `${num(p.u)} graduados únicos`;
      case 'grad_cob': return `${num(k)} de ${num(n)} titulados`;
      case 'grad_compe': case 'grad_compg': return `${num(k)} de ${num(n)} valoraciones`;
      default:
        if (GRAD_IND.has(id)) return k == null ? `${num(n)} respuestas` : `${num(k)} de ${num(n)} graduados` + (n < 10 ? ' - base pequeña' : '');
        return '';
    }
  }

  /* ------------------------------------------------------------ tooltip */
  const tip = document.getElementById('tip');
  function tipShow(html, x, y) {
    tip.innerHTML = html; tip.classList.add('on');
    const r = tip.getBoundingClientRect();
    let L = x + 14, T = y + 14;
    if (L + r.width > innerWidth - 8) L = x - r.width - 14;
    if (T + r.height > innerHeight - 8) T = y - r.height - 14;
    tip.style.left = Math.max(8, L) + 'px'; tip.style.top = Math.max(8, T) + 'px';
  }
  const tipHide = () => tip.classList.remove('on');
  function infoHTML(id) {
    const c = CAT[id];
    return `<div class="tt">${esc(c.nombre)}</div>${esc(c.definicion)}`;
  }
  function onTipTarget(e) {
    const t = e.target.closest('[data-info],[data-tip]');
    if (!t) return;
    const html = t.dataset.info ? infoHTML(t.dataset.info) : esc(t.dataset.tip).replace(/\n/g, '<br>');
    const r = t.getBoundingClientRect();
    tipShow(html, e.clientX || r.right, e.clientY || r.bottom);
  }
  document.addEventListener('mouseover', onTipTarget);
  document.addEventListener('focusin', onTipTarget);
  document.addEventListener('mouseout', e => { if (e.target.closest('[data-info],[data-tip]')) tipHide(); });
  document.addEventListener('focusout', tipHide);
  // span y no button: también vive dentro de las tarjetas de la vista general, que ya son botones.
  const info = id => `<span class="info" tabindex="0" role="note" data-info="${id}" aria-label="Qué mide: ${esc(CAT[id].nombre)}">i</span>`;

  /* ------------------------------------------------------------ montaje diferido de gráficos */
  let pend = [];
  function slot(fn) { const k = 'c' + pend.length; pend.push([k, fn]); return `<div data-slot="${k}"></div>`; }
  function montar(root) {
    pend.forEach(([k, fn]) => { const el = root.querySelector(`[data-slot="${k}"]`); if (el) fn(el); });
    pend = [];
  }
  const svgEl = (w, h, inner) => `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${inner}</svg>`;
  function niceMax(v) {
    if (v <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }

  /* Con 16 carreras no se dibuja una línea por carrera: el gráfico muestra la selección
     (facultad, modalidad o carrera) y, si no es la facultad, la facultad punteada como referencia.
     En los conteos (N.º) no hay referencia: la facultad siempre es mayor y aplastaría la línea. */
  function seriesPara(id) {
    const ss = [{ car: st.car, name: CORTO[st.car], color: COL[st.car], w: 2.4, dash: null, pts: hasta(id, st.car) }];
    if (st.car !== FAC && unidad(id) !== 'N.º') ss.push({ car: FAC, name: CORTO[FAC], color: '#8a9aa8', w: 1.5, dash: '5 4', pts: hasta(id, FAC) });
    return ss;
  }
  /* Matrícula por año: con la facultad, apilada por modalidad; con una modalidad o una carrera, una barra. */
  function segsMatricula(c, y) {
    if (c === FAC) return MODS.map(m => ({ k: m.nom, v: ((T.anual[m.k] || {})[y] || [0])[0], color: COL[m.k] }));
    return [{ k: NOM[c], v: ((T.anual[c] || {})[y] || [0])[0], color: COL[c] }];
  }
  const legMatricula = c => c !== FAC ? '' : '<div class="legend">' + MODS.map(m =>
    `<span data-car="${m.k}" data-tip="Clic para ver solo la modalidad ${esc(m.nom.toLowerCase())}"><i class="box" style="background:${COL[m.k]}"></i>${esc(m.nom)}</span>`).join('') + '</div>';
  function leyenda(ss) {
    return '<div class="legend">' + ss.map(s => `<span data-car="${s.car}" data-tip="Clic para ver solo ${esc(NOM[s.car].toLowerCase())}"><i class="${s.dash ? 'dash' : ''}" style="border-color:${s.color}"></i>${esc(s.name)}</span>`).join('') + '</div>';
  }

  /* ---------- gráfico de líneas con cruz de lectura ---------- */
  function lineChart(el, id, opt) {
    opt = opt || {};
    const ss = opt.series || seriesPara(id);
    const xsMap = new Map();
    ss.forEach(s => s.pts.forEach(p => { if (!xsMap.has(p.p)) xsMap.set(p.p, p); }));
    const xs = [...xsMap.values()].sort((a, b) => ordenP(a.p) - ordenP(b.p));
    if (!xs.length || ss.every(s => s.pts.every(p => p.v == null))) {
      el.innerHTML = `<div class="empty"><b>Sin medición ${esc(etiquetaCorte())}</b>Este indicador todavía no tiene resultados para el periodo elegido.</div>`; return;
    }
    const W = Math.max(300, el.clientWidth || 640), H = opt.h || 215, ml = 40, mr = W < 420 ? 84 : 98, mt = 14, mb = 26, iw = W - ml - mr, ih = H - mt - mb;
    const n = xs.length, step = n > 1 ? iw / (n - 1) : iw;
    const X = i => ml + (n === 1 ? iw / 2 : i * step);
    const pct = unidad(id) === '%';
    let vmax = 0; ss.forEach(s => s.pts.forEach(p => { if (p.v != null) vmax = Math.max(vmax, p.v); }));
    // Porcentajes bajos (becas ~15 %) se leerían aplastados en 0-100: la escala se ajusta, siempre desde 0.
    const ymax = pct && vmax > 60 ? 100 : niceMax(vmax * (pct ? 1.25 : 1.1));
    const Y = v => mt + ih - (v / ymax) * ih;
    let g = '';
    const tks = [0, ymax / 4, ymax / 2, ymax * 3 / 4, ymax];
    tks.forEach(t => {
      g += `<line x1="${ml}" x2="${W - mr + 10}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e6ecf0" stroke-width="1"/>` +
        `<text x="${ml - 7}" y="${Y(t) + 3.5}" text-anchor="end" font-size="10.5" fill="#6f8596">${num(t, t % 1 ? 1 : 0)}${pct ? '%' : ''}</text>`;
    });
    const meta = metaDe(id, st.car);
    if (meta != null && !Array.isArray(meta) && meta <= ymax)
      g += `<line x1="${ml}" x2="${W - mr + 10}" y1="${Y(meta)}" y2="${Y(meta)}" stroke="#fc7e00" stroke-width="1.3" stroke-dasharray="3 3"/>` +
        `<text x="${W - mr + 12}" y="${Y(meta) + 3.5}" font-size="10.5" fill="#b86200" font-weight="700">Meta ${esc(fmt(id, meta))}</text>`;
    const cada = n > 8 ? 2 : 1;
    xs.forEach((x, i) => {
      const sel = esSel(x);
      if (sel) g += `<rect x="${X(i) - Math.min(step, 60) / 2}" y="${mt - 6}" width="${Math.min(step, 60)}" height="${ih + 6}" fill="#fde7cc" opacity=".55" rx="4"/>`;
      const vecinoSel = cada > 1 && !sel && ((xs[i - 1] && esSel(xs[i - 1])) || (xs[i + 1] && esSel(xs[i + 1])));
      if (sel || ((i % cada === 0 || i === n - 1) && !vecinoSel)) g += `<text x="${X(i)}" y="${H - 7}" text-anchor="middle" font-size="10.5" fill="${sel ? '#1c3247' : '#6f8596'}" font-weight="${sel ? 700 : 400}">${esc(tick(x.p))}</text>`;
    });
    const labels = [];
    ss.slice().reverse().forEach(s => {
      const idx = s.pts.map(p => [xs.findIndex(x => x.p === p.p), p]).filter(([, p]) => p.v != null);
      let d = '', prevI = -2;
      idx.forEach(([i, p]) => { d += (i === prevI + 1 && d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1); prevI = i; });
      if (idx.length > 1) g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`;
      idx.forEach(([i, p]) => {
        const hueco = p.glob || p.parcial || (p.n != null && p.n < 10 && (id === 'sat_grad' || GRAD_IND.has(id)));
        const r = s.w > 2 ? 4.2 : 3.2;
        g += `<circle cx="${X(i)}" cy="${Y(p.v)}" r="${r}" fill="${hueco ? '#fff' : s.color}" stroke="${hueco ? s.color : '#fff'}" stroke-width="${hueco ? 1.8 : 1.5}"/>`;
      });
      if (idx.length) { const [i, p] = idx[idx.length - 1]; labels.push({ y: Y(p.v), x: X(i), s, p }); }
    });
    labels.sort((a, b) => a.y - b.y);
    for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 26) labels[k].y = labels[k - 1].y + 26;
    const exceso = labels.length ? labels[labels.length - 1].y - (mt + ih - 8) : 0;  // que la última etiqueta no pise el eje
    if (exceso > 0) labels.forEach(L => { L.y -= exceso; });
    for (let k = labels.length - 2; k >= 0; k--) if (labels[k + 1].y - labels[k].y < 26) labels[k].y = labels[k + 1].y - 26;
    labels.forEach(L => {
      g += `<g class="lbl-car" data-car="${L.s.car}"><rect x="${L.x + 5}" y="${L.y - 13}" width="80" height="28" fill="transparent"/>` +
        `<text x="${L.x + 9}" y="${L.y - 1}" font-size="12.5" font-weight="700" fill="#1c3247">${esc(fmt(id, L.p.v))}</text>` +
        `<text x="${L.x + 9}" y="${L.y + 11}" font-size="10.5" fill="#6f8596">${esc(L.s.name)}</text></g>`;
    });
    g += `<line class="xh" x1="0" x2="0" y1="${mt - 4}" y2="${mt + ih}" stroke="#1c3247" stroke-width="1" opacity="0"/>` +
      `<rect class="hit" x="${ml - 20}" y="0" width="${iw + 40}" height="${H}" fill="transparent" style="cursor:pointer"/>`;
    el.innerHTML = (ss.length > 1 ? leyenda(ss) : '') + svgEl(W, H, g);
    const svg = el.querySelector('svg'), xh = svg.querySelector('.xh');
    svg.querySelector('.hit').addEventListener('pointermove', e => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const i = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : (loc.x - ml) / step)));
      xh.setAttribute('x1', X(i)); xh.setAttribute('x2', X(i)); xh.setAttribute('opacity', .35);
      const x = xs[i]; let notas = [];
      let h = `<div class="tt">${esc(x.l)}</div>`;
      ss.forEach(s => {
        const p = s.pts.find(q => q.p === x.p); if (!p || p.v == null) return;
        h += `<div class="r"><i style="border-color:${s.color}"></i><b>${esc(fmt(id, p.v))}</b><span>${esc(s.name)}</span></div>`;
        if (s.car === st.car) {
          const b = baseTxt(id, p); if (b) notas.push(b);
          if (p.glob) notas.push('Medición general, sin detalle por aspecto');
          if (p.parcial) notas.push('Año en curso: aún puede crecer');
        }
      });
      notas.push('Clic: filtrar todo el tablero a ' + (esAnual(x.p) ? x.p : x.l));
      h += `<div class="nota">${notas.map(esc).join('<br>')}</div>`;
      tipShow(h, e.clientX, e.clientY);
    });
    svg.querySelector('.hit').addEventListener('click', e => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const i = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : (loc.x - ml) / step)));
      filtrarPeriodo(xs[i].p);
    });
    svg.querySelectorAll('.lbl-car').forEach(gc => gc.addEventListener('click', ev => { ev.stopPropagation(); filtrarCarrera(gc.dataset.car); }));
    svg.querySelector('.hit').addEventListener('pointerleave', () => { xh.setAttribute('opacity', 0); tipHide(); });
  }

  /* ---------- columnas (simples o apiladas) por año ---------- */
  function columnChart(el, opt) {
    const xs = opt.xs; // [{p, l, a, parcial, segs:[{k, v, color}]}]
    if (!xs.length) { el.innerHTML = '<div class="empty"><b>Sin datos hasta ' + st.anio + '</b></div>'; return; }
    const W = Math.max(300, el.clientWidth || 640), H = opt.h || 225, ml = 40, mr = 14, mt = 22, mb = 26, iw = W - ml - mr, ih = H - mt - mb;
    const tot = xs.map(x => x.segs.reduce((s, q) => s + (q.v || 0), 0));
    const ymax = opt.ymax || niceMax(Math.max(...tot, 1) * 1.08);
    const Y = v => mt + ih - (v / ymax) * ih;
    const bw = Math.min(54, iw / xs.length * 0.62), step = iw / xs.length;
    let g = '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#9aabb8" stroke-width="2.4"/></pattern></defs>';
    [0, ymax / 2, ymax].forEach(t => {
      g += `<line x1="${ml}" x2="${W - mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e6ecf0"/>` +
        `<text x="${ml - 7}" y="${Y(t) + 3.5}" text-anchor="end" font-size="10.5" fill="#6f8596">${num(t, 0)}${opt.pct ? '%' : ''}</text>`;
    });
    xs.forEach((x, i) => {
      const cx = ml + step * i + step / 2, sel = esSel(x);
      if (sel) g += `<rect x="${cx - Math.min(step, bw + 22) / 2}" y="${mt - 18}" width="${Math.min(step, bw + 22)}" height="${ih + 18}" fill="#fde7cc" opacity=".55" rx="4"/>`;
      let y0 = Y(0);
      const ultimo = x.segs.map(z => !!z.v).lastIndexOf(true);
      x.segs.forEach((q, j) => {
        if (!q.v) return;
        const h = (q.v / ymax) * ih, x0 = cx - bw / 2, top = j === ultimo;
        const hh = Math.max(h - (top ? 0 : 2), 0.5), y = y0 - h, r = top ? Math.min(4, hh) : 0;
        g += `<path class="seg" data-i="${i}" data-j="${j}" fill="${q.color}" d="M${x0} ${y + hh}V${y + r}Q${x0} ${y} ${x0 + r} ${y}H${x0 + bw - r}Q${x0 + bw} ${y} ${x0 + bw} ${y + r}V${y + hh}Z"/>`;
        y0 -= h;
      });
      if (x.parcial) g += `<rect x="${cx - bw / 2}" y="${Y(tot[i])}" width="${bw}" height="${Y(0) - Y(tot[i])}" fill="url(#hatch)" opacity=".28" pointer-events="none"/>`;
      if (!opt.sinTotal) g += `<text x="${cx}" y="${Y(tot[i]) - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="#1c3247">${esc(opt.fmt ? opt.fmt(tot[i]) : num(tot[i]))}</text>`;
      g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="${sel ? '#1c3247' : '#6f8596'}" font-weight="${sel ? 700 : 400}">${esc(tick(x.p))}${x.parcial ? '*' : ''}</text>`;
    });
    el.innerHTML = (opt.legend || '') + svgEl(W, H, g) + (xs.some(x => x.parcial) ? '<div class="ph-note" style="margin:4px 0 0">* Año en curso: la cifra todavía puede crecer.</div>' : '');
    el.querySelectorAll('path.seg').forEach(r => {
      r.addEventListener('pointermove', e => {
        const x = xs[+r.dataset.i], q = x.segs[+r.dataset.j];
        let h = `<div class="tt">${esc(x.l)}</div>`;
        x.segs.slice().reverse().forEach(z => { if (z.v != null) h += `<div class="r"><i style="border-color:${z.color}"></i><b>${esc(opt.fmt ? opt.fmt(z.v) : num(z.v))}</b><span>${esc(z.k)}</span></div>`; });
        if (x.segs.length > 1 && !opt.sinTotal) h += `<div class="nota">Total: ${num(tot[+r.dataset.i])}</div>`;
        if (x.nota) h += `<div class="nota">${esc(x.nota)}</div>`;
        h += `<div class="nota">Clic: filtrar todo el tablero a ${esc(x.p)}</div>`;
        tipShow(h, e.clientX, e.clientY);
        r.style.filter = 'brightness(1.08)'; void q;
      });
      r.addEventListener('pointerleave', () => { tipHide(); r.style.filter = ''; });
      r.addEventListener('click', () => filtrarPeriodo(xs[+r.dataset.i].p));
    });
  }

  /* ---------- barras horizontales ---------- */
  function hbars(rows, o) {
    o = o || {};
    if (!rows || !rows.length) return '<div class="empty"><b>Sin detalle para este periodo</b></div>';
    const max = o.max || Math.max(...rows.map(r => r.v || 0), 1);
    return '<div class="hb">' + rows.map(r => {
      let d = '';
      if (o.prev && o.prev[r.a] != null && r.v != null) {
        const dd = r.v - o.prev[r.a];
        const cls = Math.abs(dd) < 1 ? 'neu' : dd > 0 ? 'fav' : 'desf';
        d = `<span class="trend d ${cls}" style="margin-left:6px">${Math.abs(dd) < 1 ? '→' : dd > 0 ? '↑' : '↓'} ${num(Math.abs(dd), 1)} pp</span>`;
      }
      let t = (o.tip ? o.tip(r) : '') || `${r.a}: ${o.fmt ? o.fmt(r.v) : num(r.v, 1) + ' %'}`;
      const pulsable = r.gse ? ` data-gse="${esc(r.gse)}"` : r.niv ? ` data-niv="${esc(r.niv)}"` : r.rf ? ` data-rf="${esc(r.rf)}"`
        : r.gf ? ` data-gf="${esc(r.gf)}"` : r.gm ? ` data-gmom="${esc(r.gm)}"` : r.pf ? ` data-pf="${esc(r.pf)}"` : '';
      const pcDim = r.pf ? r.pf.slice(0, r.pf.indexOf(':')) : null;
      const actual = r.gse ? st.gse : r.niv ? st.niv : r.rf ? st.rf : r.gf ? st.gf : r.gm ? (st.gmom === 'T' ? null : st.gmom)
        : r.pf ? (st.pc[pcDim] != null ? pcDim + ':' + st.pc[pcDim] : null) : null;
      const propio = r.gse || r.niv || r.rf || r.gf || r.gm || r.pf;
      if (propio) t += actual === propio ? '\nClic: quitar este filtro' : '\nClic: filtrar el tablero a este grupo';
      const clase = 'hrow' + (propio && actual ? (actual === propio ? ' sel' : ' mut') : '');
      const valor = r.v == null ? (o.vacio || '—') : (o.fmt ? o.fmt(r.v) : num(r.v, 1) + ' %');
      return `<div class="${clase}"${pulsable} data-tip="${esc(t)}"><span class="hl">${esc(r.a)}</span>` +
        `<span class="hv">${esc(valor)}${d}</span>` +
        (r.v == null && o.vacio ? '<span class="ht"><span class="hf" style="width:4%;background:repeating-linear-gradient(45deg,#9aa7b3 0 3px,#d3dae0 3px 6px)"></span>'
          : `<span class="ht"><span class="hf" style="width:${Math.max(0, Math.min(100, (r.v || 0) / max * 100))}%;background:${r.color || o.color || COL[st.car]}"></span>`) +
        (o.ref != null ? `<span class="hg" style="left:${o.ref / max * 100}%"></span>` : '') + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- tarjeta KPI ---------- */
  function kpi(id, o) {
    o = o || {};
    const c = CAT[id], m = medir(id, st.car), cur = m.cur;
    const tag = o.link ? 'button type="button"' : 'div';
    const attrs = o.link ? ` data-go="${c.vista}" data-foco="${id}"${c.sub ? ` data-sub="${c.sub}"` : ''}${c.gv ? ` data-gv="${c.gv}"` : ''}` : '';
    // Todas las tarjetas llevan ícono y no muestran el minigráfico (la evolución está en los gráficos de cada vista)
    const ico = `<span class="kico" aria-hidden="true"><svg viewBox="0 0 24 24">${KPI_IC[id] || KPI_IC._}</svg></span>`;
    const lbl = `<div class="top">${ico}<span class="lbl">${c.tipo ? `<span style="color:var(--acento)">${esc(c.tipo)} - </span>` : ''}${esc(c.nombre)}</span>${info(id)}</div>`;
    const sinGse = (dimAct() || (enGrad() && st.gf) || (enTray() && st.tf)) && !soporta(id);
    const cls = 'kpi' + (sinGse ? ' nogse' : '');
    const grupo = (REND_IND.has(id) && dimRend()) || (GRAD_IND.has(id) && dimGrad()) || (TRAY_IND.has(id) && dimTray() && trayAdmite(id, dimTray()));
    const vacio = grupo && !serie(id, st.car).length ? (MIN_BASE > 0 ? `Grupo con menos de ${MIN_BASE} personas: no se publica (protección de datos)` : 'Sin datos para este grupo')
      : PERF_IND.has(id) && !medir(id, st.car).cur ? 'Ningún estudiante cumple los filtros elegidos'
      : GRAD_IND.has(id) && st.gmom !== 'T' && !serie(id, st.car).length ? 'No se pregunta en este momento de la encuesta'
      : 'No hay resultados ' + etiquetaCorte();
    if (!cur) return `<${tag} class="${cls} na" id="k-${id}"${attrs}>${lbl}<div class="val">Sin medición</div><div class="per">${esc(vacio)}</div></${tag.split(' ')[0]}>`;
    const t = tendencia(id, cur, m.prev), e = estado(id, st.car, cur.v);
    const base = sinGse ? `Sin desglose por ${st.gse ? 'nivel socioeconómico' : st.niv ? 'nivel de la carrera' : 'este grupo'}: muestra a toda la población` : baseTxt(id, cur);
    return `<${tag} class="${cls}" id="k-${id}"${attrs}>${lbl}` +
      `<div class="mid"><div><div class="val">${valHTML(id, cur.v)}</div><div class="per">${esc(cur.l)}${m.prev ? ' - antes ' + esc(fmt(id, m.prev.v)) : ''}</div></div></div>` +
      `<div class="base">${esc(base)}</div>` +
      `<div class="foot">${hayMeta(id) ? `<span class="meta">Meta: <b>${esc(metaTxt(id, st.car))}</b></span>` : `<span class="meta">vs. anterior</span>`}${t.html}${hayMeta(id) ? e.html : ''}</div></${tag.split(' ')[0]}>`;
  }

  /* ---------- tabla de resultados (Meta | Resultado | Anterior | Tendencia | Estado) ---------- */
  function tabla(ids) {
    const conBase = ids.some(id => CAT[id].lineaBase != null), conMeta = ids.some(hayMeta);
    const filas = ids.map(id => {
      const c = CAT[id], m = medir(id, st.car), cur = m.cur, prev = m.prev;
      const t = tendencia(id, cur, prev), e = estado(id, st.car, cur && cur.v);
      return `<tr class="${st.foco === id ? 'hl' : ''}"><td><div class="ind">${esc(c.nombre)}</div>${c.tipo ? `<div class="tipo">${esc(c.tipo)}</div>` : ''}</td>` +
        `<td class="per">${cur ? esc(cur.l) : '—'}</td>` +
        (conBase ? `<td class="n">${c.lineaBase == null ? '—' : esc(fmt(id, c.lineaBase))}</td>` : '') +
        (conMeta ? `<td class="n">${hayMeta(id) ? esc(metaTxt(id, st.car)) : '—'}</td>` : '') +
        `<td class="n"><b>${cur ? esc(fmt(id, cur.v)) : '—'}</b></td>` +
        `<td class="n">${prev ? esc(fmt(id, prev.v)) + ` <span class="per">(${esc(prev.l)})</span>` : '—'}</td>` +
        `<td>${cur ? t.html : '—'}</td>${conMeta ? `<td>${hayMeta(id) ? e.html : '—'}</td>` : ''}</tr>`;
    }).join('');
    return `<div class="panel"><div class="ph"><h3>Resultados del periodo</h3></div>` +
      `<p class="ph-note">Cada indicador en su última medición ${esc(etiquetaCorte())}, frente a la medición anterior.</p>` +
      `<div class="tbl-wrap"><table class="res"><thead><tr><th>Indicador</th><th>Periodo</th>${conBase ? '<th class="n">Línea base</th>' : ''}${conMeta ? '<th class="n">Meta</th>' : ''}<th class="n">Resultado</th><th class="n">Anterior</th><th>Tendencia</th>${conMeta ? '<th>Estado</th>' : ''}</tr></thead><tbody>${filas}</tbody></table></div></div>`;
  }

  function lectura(items, titulo) {
    items = items.filter(Boolean);
    // Grupo socioeconómico pequeño (el nivel alto): advertir antes de cualquier conclusión.
    const base = st.gse && medir('tut_cob', st.car).cur;
    if (items.length && base && base.n < 10) items.unshift(`Atención: en ${esc(base.l)} hay solo ${B(base.n === 1 ? '1 estudiante' : base.n + ' estudiantes')}${deGrupo()}` +
      `${base.n > 1 ? `; cada uno mueve los porcentajes en ${num(100 / base.n)} puntos` : ''}. Estas cifras describen casos individuales, no tendencias.`);
    if (!items.length) return '';
    return `<div class="lectura"><h3><svg viewBox="0 0 24 24">${IC.idea}</svg>${esc(titulo || 'Lo que dicen los datos')}</h3><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  }
  const B = s => `<b>${esc(s)}</b>`;
  /* Carreras con el valor más alto y más bajo de un indicador dentro de la facultad o la modalidad
     elegida, en el mismo periodo (el último de la selección) y con una base mínima. */
  function extremos(id, c, minN) {
    if (!esAgregado(c)) return null;
    const ref = medir(id, c).cur; if (!ref) return null;
    const xs = miembros(c).map(k => ({ k, p: hasta(id, k).find(p => p.p === ref.p) })).filter(x => x.p && x.p.v != null && (x.p.n == null || x.p.n >= minN));
    if (xs.length < 2) return null;
    xs.sort((a, b) => b.p.v - a.p.v);
    return { hi: { k: xs[0].k, v: xs[0].p.v }, lo: { k: xs[xs.length - 1].k, v: xs[xs.length - 1].p.v }, l: ref.l };
  }
  const deGrupo = () => st.gse ? ` de nivel socioeconómico ${GSE_NOM[st.gse].toLowerCase()}` : st.niv ? ` de ${nivNom(st.niv)}` :
    enRend() && st.rf ? ` del grupo «${esc(rfNom(st.rf))}»` : enGrad() && st.gf ? ` del grupo «${esc(gfNom(st.gf))}»` : enTray() && st.tf ? ` del grupo «${esc(rfNom(st.tf))}»` : enPerf() && hayPc() ? ` con los filtros elegidos (${esc(Object.entries(st.pc).map(([d, v]) => pcNom(d, v)).join(', '))})` : '';
  const q = s => `«${esc(s)}»`;
  function panel(titulo, id, cuerpo, nota) {
    return `<div class="panel"><div class="ph"><h3>${esc(titulo)}</h3>${id ? info(id) : ''}</div>${nota ? `<p class="ph-note">${nota}</p>` : '<div style="height:8px"></div>'}${cuerpo}</div>`;
  }
  const ultimoDet = (obj, filtro) => { // detalle de la última medición <= año
    if (!obj) return null;
    const ks = Object.keys(obj).filter(k => dentroP(k) && (!filtro || filtro(k))).sort((a, b) => ordenP(a) - ordenP(b));
    return ks.length ? { k: ks[ks.length - 1], prevK: ks[ks.length - 2], rows: obj[ks[ks.length - 1]], prev: ks.length > 1 ? obj[ks[ks.length - 2]] : null } : null;
  };
  const lblDe = p => { const x = D.periodos.find(z => z.p === p); return x ? x.l : p; };
  const mapa = rows => { const m = {}; (rows || []).forEach(r => { m[r.a] = r.v; }); return m; };

  /* Rendimiento: filas [e, ev, pa, ...] -> objetos, y series por indicador en D.ind
     con la misma clave de cruce que el resto del tablero ("ENF", "ENF|N3", "ENF|BAJO", "ENF|sexo:MUJER"). */
  const RF = {};
  if (R) {
    Object.entries(R.res).forEach(([k, per]) => {
      RF[k] = {};
      Object.entries(per).forEach(([p, fila]) => { const o = {}; R.campos.forEach((c, i) => { o[c] = fila[i]; }); RF[k][p] = o; });
    });
    REND_IND.forEach(id => {
      D.ind[id] = {};
      Object.entries(RF).forEach(([k, per]) => {
        D.ind[id][k] = Object.keys(per).sort((a, b) => ordenP(a) - ordenP(b))
          .map(p => ({ p, a: +p.slice(-4), l: lblDe(p), v: per[p][REND_CAMPO[id]], n: per[p].ev, e: per[p].e }));
      });
    });
  }
  const NIVELES = [...new Set(Object.keys(RF).filter(k => /\|N\d$/.test(k)).map(k => k.split('|')[1]))].sort();
  const RF_TIPOS = { sexo: 'Sexo', etnia: 'Autoidentificación étnica', tipo_ingreso: 'Tipo de ingreso', cohorte: 'Cohorte de ingreso', numero_matricula: 'Número de matrícula' };
  function rfNom(rf) {
    const i = rf.indexOf(':'), t = rf.slice(0, i), v = rf.slice(i + 1);
    if (t === 'sexo') return v === 'MUJER' ? 'Mujeres' : 'Hombres';
    if (t === 'etnia') return v[0] + v.slice(1).toLowerCase();
    if (t === 'cohorte') return 'Cohorte ' + v.replace('-', ' ');
    if (t === 'numero_matricula') return v + '.ª matrícula';
    if (t === 'banda_nota') return 'Nota ' + v.replace('-', '–');
    if (t === 'banda_asistencia') return 'Asistencia ' + v.replace('-', '–') + ' %';
    return v;
  }
  const rfValido = rf => !!rf && /^[a-z_]+:/.test(rf) && Object.keys(RF).some(k => k.endsWith('|' + rf));

  /* Filtros separados de las pestañas de Estudiantes (Trayectoria, Rendimiento, Graduados).
     Un filtro a la vez: los datos vienen agregados por una sola característica, no por combinaciones.
     Solo se muestran las características que tienen datos en la pestaña. */
  const FILTRO_NOM = { gse: 'Nivel socioeconómico', sexo: 'Sexo', etnia: 'Autoidentificación étnica', tipo_ingreso: 'Tipo de ingreso', numero_matricula: 'Número de matrícula' };
  const propioDe = tab => tab === 'rend' ? 'rf' : tab === 'tray' ? 'tf' : 'gf';
  function filtrosEst(tab, claves, dims, nota) {
    const c = st.car, actual = st[propioDe(tab)];
    const sel = dims.map(d => {
      const vals = d === 'gse'
        ? GSE_ORD.filter(g => claves.includes(c + '|' + g)).map(g => [g, GSE_NOM[g]])
        : claves.filter(x => x.startsWith(c + '|' + d + ':')).map(x => x.slice(c.length + d.length + 2))
          .sort((a, b) => d === 'numero_matricula' ? a - b : a.localeCompare(b)).map(v => [v, rfNom(d + ':' + v)]);
      if (!vals.length) return '';
      const cur = d === 'gse' ? st.gse : (actual && actual.startsWith(d + ':') ? actual.slice(d.length + 1) : '');
      return `<div class="fld"><label for="ff-${d}">${FILTRO_NOM[d]}</label><select id="ff-${d}" data-fdim="${d}" data-ftab="${tab}">` +
        '<option value="">Todos</option>' + vals.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('') + '</select></div>';
    }).join('');
    return `<div class="rfbar filtros-est">${sel}<span>${nota}</span></div>`;
  }

  /* Graduados: series por año de encuesta, una por carrera + grupo + momento ("ENF|sexo:MUJER#2").
     Cada fila de FACS_GRAD.kpi es [respuestas, graduados únicos, base1, n1, base2, n2, ...]. */
  const MOMENTOS = { T: 'Todos los momentos', 1: 'Al titularse', 2: 'Al año', 3: 'A los dos años' };
  if (G) {
    Object.keys(GRAD_IND_SERIE()).forEach(id => { D.ind[id] = {}; });
    Object.entries(G.kpi).forEach(([k, anios]) => {
      Object.keys(MOMENTOS).forEach(m => {
        const ys = Object.keys(anios).filter(y => anios[y][m]).sort();
        if (!ys.length) return;
        // El año en curso todavía recibe encuestas: los conteos no se comparan con un año completo
        D.ind.grad_resp[k + '#' + m] = ys.map(y => ({ p: y, a: +y, l: 'Encuesta ' + y, v: anios[y][m][0], n: anios[y][m][0], u: anios[y][m][1], parcial: +y === D.anioActual }));
        Object.entries(GRAD_CAMPO).forEach(([id, campo]) => {
          const j = 2 + 2 * G.indicadores.indexOf(campo);
          const pts = ys.map(y => { const f = anios[y][m], b = f[j], n = f[j + 1]; return b ? { p: y, a: +y, l: 'Encuesta ' + y, v: n == null ? null : Math.round(n / b * 1000) / 10, n: b, num: n } : null; }).filter(Boolean);
          if (pts.length) D.ind[id][k + '#' + m] = pts;
        });
      });
    });
    // Cobertura: por año de titulación (cohortes ya encuestadas)
    D.ind.grad_cob = {};
    TODAS.forEach(c => {
      D.ind.grad_cob[c] = Object.entries(G.cob).filter(([k, v]) => k.startsWith(c + '|cohorte_titulacion:') && v[1] > 0)
        .map(([k, v]) => { const y = k.split(':')[1]; return { p: y, a: +y, l: 'Titulados ' + y, v: Math.round(v[1] / v[0] * 1000) / 10, n: v[0], num: v[1] }; })
        .sort((a, b) => a.a - b.a);
    });
  }
  function GRAD_IND_SERIE() { const o = { grad_resp: 1 }; Object.keys(GRAD_CAMPO).forEach(k => { o[k] = 1; }); return o; }
  const GF_TIPOS = { sexo: 'Sexo', cohorte_titulacion: 'Año de titulación' };
  function gfNom(gf) {
    const i = gf.indexOf(':'), t = gf.slice(0, i), v = gf.slice(i + 1);
    return t === 'sexo' ? (v === 'MUJER' ? 'Mujeres' : 'Hombres') : t === 'cohorte_titulacion' ? 'Titulados en ' + v : v;
  }
  const gfValido = gf => !!G && !!gf && Object.keys(G.kpi).some(k => k.endsWith('|' + gf));

  /* Trayectoria: series anuales (matrícula, variación, retención, deserción, titulados) y por cohorte
     (retención de primer año y graduación, solo cohortes cuya ventana de graduación ya cerró). */
  const pct1 = (k, n) => n ? Math.round(k / n * 1000) / 10 : null;
  const lblCoh = c => 'Cohorte ' + c.replace('-', ' ');
  if (T) {
    TRAY_IND.forEach(id => { D.ind[id] = {}; });
    Object.entries(T.anual).forEach(([k, an]) => {
      const ys = Object.keys(an).sort();
      const pt = (y, extra) => Object.assign({ p: y, a: +y, l: y, parcial: +y === D.anioActual }, extra);
      D.ind.tray_mat[k] = ys.map(y => pt(y, { v: an[y][0], n: an[y][0] }));
      D.ind.tray_var[k] = ys.filter(y => an[y][8] != null).map(y => pt(y, { v: an[y][8] }));
      D.ind.tray_ret[k] = ys.filter(y => an[y][4]).map(y => pt(y, { v: pct1(an[y][5], an[y][4]), n: an[y][4], num: an[y][5] }));
    });
    // Deserción a mitad de la carrera, por cohorte (Modelo genérico de evaluación): TD_δ = 100 × NE_{Ai+δ} / NE_{Ai}
    Object.entries(T.des || {}).forEach(([k, co]) => {
      D.ind.tray_des[k] = Object.keys(co).sort((a, b) => ordenP(a) - ordenP(b))
        .map(c => ({ p: c, a: +c.slice(-4), l: lblCoh(c), v: pct1(co[c][1], co[c][0]), n: co[c][0], num: co[c][1] }));
    });
    Object.entries(T.coh).forEach(([k, co]) => {
      const cs = Object.keys(co).sort((a, b) => ordenP(a) - ordenP(b));
      const pt = (c, extra) => Object.assign({ p: c, a: +c.slice(-4), l: lblCoh(c) }, extra);
      D.ind.tray_ret1[k] = cs.filter(c => co[c][1]).map(c => pt(c, { v: pct1(co[c][2], co[c][1]), n: co[c][1], num: co[c][2] }));
      D.ind.tray_grad[k] = cs.filter(c => co[c][5]).map(c => pt(c, { v: pct1(co[c][4], co[c][0]), n: co[c][0], num: co[c][4] }));
      D.ind.tray_gradt[k] = cs.filter(c => co[c][5]).map(c => pt(c, { v: pct1(co[c][3], co[c][0]), n: co[c][0], num: co[c][3] }));
    });
    Object.entries(T.tit).forEach(([k, ti]) => {
      D.ind.tray_tit[k] = Object.keys(ti).sort().map(y => ({ p: y, a: +y, l: y, v: ti[y], parcial: +y === D.anioActual }));
    });
  }
  /* Perfil: filtro cruzado sobre la tabla de combinaciones (FACS_PERFIL.filas).
     Cada fila: [año, carrera (índice en FACS_PERFIL.carreras), índice de cada dimensión..., n estudiantes].
     El nivel socioeconómico usa el filtro global st.gse; las demás dimensiones, st.pc. */
  const PDIM = { sexo: 'Sexo', edad: 'Edad de ingreso', etnia: 'Autoidentificación étnica', disc: 'Discapacidad', gse: 'Nivel socioeconómico', origen: 'Procedencia', pais: 'País de procedencia' };
  const PCOL = P ? Object.fromEntries(P.dims.map((d, i) => [d, 2 + i])) : {};
  const P_ANIOS = P ? [...new Set(P.filas.map(r => r[0]))].sort() : [];
  const pcNom = (d, v) => d === 'gse' ? 'Nivel socioeconómico ' + (GSE_NOM[v] || v).toLowerCase() : d === 'edad' ? 'Ingreso a los ' + v + (/\d$/.test(v) ? ' años' : '')
    : d === 'origen' ? 'Procedencia: ' + v : d === 'pais' ? 'País: ' + v : v;
  const perfFiltros = () => Object.assign({}, st.pc, st.gse ? { gse: st.gse } : {});
  /* Suma las filas del año y la carrera que cumplen los filtros; «ignorar» deja fuera el filtro
     de una dimensión (cada gráfico muestra todas sus categorías y resalta la elegida). */
  function perfContar(anio, car, ignorar) {
    const cond = Object.entries(perfFiltros()).filter(([d]) => d !== ignorar && PCOL[d] != null)
      .map(([d, v]) => [PCOL[d], P.valores[d].indexOf(v)]);
    const out = { n: 0, d: {}, pir: {} };
    P.dims.forEach(d => { out.d[d] = new Array(P.valores[d].length).fill(0); });
    const idx = car === FAC ? null : new Set(miembros(car).map(k => P.carreras.indexOf(k)));
    for (const r of P.filas) {
      if (r[0] !== anio || (idx && !idx.has(r[1]))) continue;
      let ok = true;
      for (const [j, v] of cond) if (r[j] !== v) { ok = false; break; }
      if (!ok) continue;
      const n = r[r.length - 1];
      out.n += n;
      P.dims.forEach(d => { out.d[d][r[PCOL[d]]] += n; });
      const kp = P.valores.sexo[r[PCOL.sexo]] + '|' + P.valores.edad[r[PCOL.edad]];
      out.pir[kp] = (out.pir[kp] || 0) + n;
    }
    return out;
  }
  const perfCat = (c, d, v) => c.d[d][P.valores[d].indexOf(v)] || 0;
  const PERF_NUM = {
    perf_muj: c => perfCat(c, 'sexo', 'Mujer'),
    perf_gse: c => perfCat(c, 'gse', 'BAJO') + perfCat(c, 'gse', 'MEDIO BAJO'),
    perf_etn: c => c.n - perfCat(c, 'etnia', 'Mestizo/a') - perfCat(c, 'etnia', 'No registra'),
    perf_disc: c => perfCat(c, 'disc', 'Con discapacidad'),
    perf_fuera: c => c.n - perfCat(c, 'origen', 'Guayas') - perfCat(c, 'origen', 'No registra'),
    perf_edad: c => perfCat(c, 'edad', '25-29') + perfCat(c, 'edad', '30 o más')
  };
  /* Series anuales de las tarjetas con los filtros activos (se recalculan en cada vista del perfil). */
  function perfSeries() {
    if (!P) return;
    PERF_IND.forEach(id => { D.ind[id] = {}; });
    TODAS.forEach(car => {
      const cs = P_ANIOS.map(a => [a, perfContar(a, car, null)]).filter(([, c]) => c.n > 0);
      const pt = (a, extra) => Object.assign({ p: String(a), a, l: String(a), parcial: a === D.anioActual }, extra);
      D.ind.perf_n[car] = cs.map(([a, c]) => pt(a, { v: c.n, n: c.n }));
      Object.entries(PERF_NUM).forEach(([id, f]) => { D.ind[id][car] = cs.map(([a, c]) => { const k = f(c); return pt(a, { v: pct1(k, c.n), n: c.n, num: k }); }); });
    });
  }
  perfSeries();
  /* Docentes: las series vienen listas por año y por clave (facultad, modalidad o carrera). */
  if (DOC) Object.assign(D.ind, DOC.ind);
  const pcValido = (d, v) => !!P && d !== 'gse' && d !== 'disct' && P.valores[d] && P.valores[d].includes(v);
  const TF_TIPOS = { sexo: 'Sexo', tipo_ingreso: 'Tipo de ingreso', cohorte: 'Cohorte de ingreso' };
  const tfValido = tf => !!T && !!tf && /^(sexo|tipo_ingreso|cohorte):/.test(tf) && Object.keys(T.anual).some(k => k.endsWith('|' + tf));

  /* ================================================================ VISTAS */
  /* ---------- gráfico circular (dona) con leyenda a la derecha ---------- */
  function dona(segs, o) {
    o = o || {};
    const tot = segs.reduce((s, x) => s + (x.v || 0), 0);
    if (!tot) return '<div class="empty"><b>Sin datos para este periodo</b></div>';
    const r = 54, C = 2 * Math.PI * r;
    let acc = 0, arcos = '';
    segs.forEach(x => {
      if (!x.v) return;
      const len = x.v / tot * C;
      arcos += `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${x.color}" stroke-width="24" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"` +
        ` stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 80 80)" data-tip="${esc(`${x.k}: ${num(x.v)} ${o.unidad || ''} (${num(x.v / tot * 100, 1)} %)`)}"/>`;
      acc += len;
    });
    const centro = o.centro != null ? o.centro : num(tot);
    const ley = segs.filter(x => x.v).map(x => `<div class="dl"><i style="background:${x.color}"></i><span>${esc(x.k)}</span><b>${num(x.v / tot * 100, 1)} %</b></div>`).join('');
    return `<div class="dona"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(o.aria || 'Gráfico circular')}">${arcos}` +
      `<text x="80" y="78" text-anchor="middle" font-size="22" font-weight="700" fill="#1c3247">${esc(centro)}</text>` +
      `<text x="80" y="97" text-anchor="middle" font-size="10.5" fill="#6f8596">${esc(o.sub || '')}</text></svg><div class="dona-ley">${ley}</div></div>`;
  }
  /* Panel con enlace «Ver detalle» a su vista. */
  function panelVer(titulo, destino, cuerpo, nota) {
    const [vista, sub] = destino.split('|');
    return `<div class="panel"><div class="ph"><h3>${esc(titulo)}</h3><a class="ver" href="#${vista}" data-go="${vista}"${sub ? ` data-sub="${sub}"` : ''}>Ver detalle →</a></div>` +
      `${nota ? `<p class="ph-note">${nota}</p>` : '<div style="height:8px"></div>'}${cuerpo}</div>`;
  }
  /* Columnas por periodo de un indicador (carrera elegida). */
  const columnasDe = id => serie(id, st.car).filter(dentro).map(p => ({ p: p.p, l: p.l, a: p.a, parcial: p.parcial,
    segs: [{ k: CAT[id].nombre, v: p.v, color: COL[st.car] }] }));

  function vInicio() {
    const c = st.car;
    const estrategicos = ['tray_mat', 'tray_ret', 'tray_des', 'tray_grad', 'grad_empleab', 'sat_est', 'sat_grad', 'sat_doc', 'doc_phd', 'doc_eval'];
    const destacados = [insTray()[0], insRend()[0], insGrad()[0], insDoc()[0], insGrupos()[0], insInvest()[0], insVinc()[0], insApoyo()[0]];

    // Estudiantes por género (perfil, sin los filtros propios de esa pestaña)
    let gen = '<div class="empty"><b>Sin datos</b></div>';
    if (P) {
      const pcBk = st.pc; st.pc = {};
      const a = perfAnio(), t = a ? perfContar(a, c, null) : null;
      st.pc = pcBk;
      if (t && t.n) gen = dona([{ k: 'Mujeres', v: perfCat(t, 'sexo', 'Mujer'), color: '#f48521' }, { k: 'Hombres', v: perfCat(t, 'sexo', 'Hombre'), color: '#335f7f' }],
        { centro: num(t.n), sub: `estudiantes ${a}`, unidad: 'estudiantes', aria: 'Estudiantes por género' });
    }
    // Resultado de las evaluaciones del último semestre del año
    let evals = '<div class="empty"><b>Sin datos</b></div>', semEv = '';
    if (R) {
      const d = ultimoDet(RF[c]);
      if (d) { semEv = d.k; evals = dona([{ k: 'Aprobadas', v: d.rows.ev - d.rows.rp, color: '#335f7f' }, { k: 'Reprobadas', v: d.rows.rp, color: '#f48521' }],
        { centro: num(d.rows.pa, 1) + ' %', sub: 'aprobación', unidad: 'evaluaciones', aria: 'Evaluaciones aprobadas y reprobadas' }); }
    }
    // Situación laboral de los graduados
    let grad = '<div class="empty"><b>Sin datos</b></div>', gradY = '';
    const ge = G && medir('grad_empleab', c).cur;
    if (ge && ge.num != null) { gradY = ge.l; grad = dona([{ k: 'Con actividad laboral', v: ge.num, color: '#335f7f' }, { k: 'Sin actividad laboral', v: ge.n - ge.num, color: '#f48521' }],
      { centro: num(ge.v, 1) + ' %', sub: 'empleabilidad', unidad: 'graduados', aria: 'Situación laboral de los graduados' }); }
    // Nivel académico de los docentes
    let niv = '<div class="empty"><b>Sin datos</b></div>', nivY = '';
    const dd = DOC && docDet(c);
    if (dd) {
      nivY = dd.y;
      const NIVC = { 'PhD': '#1c3247', 'Maestría': '#335f7f', 'Especialidad': '#4597bf', 'Diplomado u otro posgrado sin grado': '#a9cde2', 'Tercer nivel': '#f48521', 'Sin registro': '#d5dde3' };
      niv = dona(dd.d.nivel.map(([k, v]) => ({ k, v, color: NIVC[k] || '#9aabb8' })), { centro: num(dd.d.nivel.reduce((s, [, n]) => s + n, 0)), sub: 'docentes', unidad: 'docentes', aria: 'Nivel académico de los docentes' });
    }
    // Satisfacción de los grupos de interés y servicios de apoyo (último valor)
    const actual = ids => ids.map(id => { const m = medir(id, c).cur; return m && { a: CAT[id].nombre, v: m.v, n: m.l }; }).filter(Boolean);
    const sat = actual(['sat_est', 'sat_grad', 'sat_doc']), apoyo = actual(['tut_cob', 'tut_ejec', 'beca_cob', 'sat_serv']);
    // Matrícula por año (por carrera)
    const xsMat = T ? Object.keys(T.anual[c] || {}).filter(y => +y <= anioCorte()).sort().map(y => ({ p: y, l: y, a: +y, parcial: +y === D.anioActual,
      segs: segsMatricula(c, y) })) : [];
    const legMat = legMatricula(c);

    return `<div class="sec"><h3>Indicadores estratégicos</h3></div>` +
      `<div class="kpis k5">${estrategicos.map(id => kpi(id, { link: true, icono: true })).join('')}</div>` +
      `<div class="sec"><h3>Estudiantes</h3></div><div class="grid3 arriba">` +
      panelVer('Matrícula por año', 'estudiantes|tray', slot(el => columnChart(el, { xs: xsMat, legend: legMat, h: 210 })), 'Estudiantes únicos matriculados') +
      panelVer('Estudiantes por género', 'estudiantes|perfil', gen, 'Último año con datos') +
      panelVer('Resultado de las evaluaciones', 'estudiantes|rend', evals, semEv ? `${esc(tick(semEv))} - asignaturas aprobadas y reprobadas` : '') +
      `</div><div class="sec"><h3>Graduados, docentes y grupos de interés</h3></div><div class="grid3 arriba">` +
      panelVer('Situación laboral de los graduados', 'estudiantes|grad', grad, gradY ? `${esc(gradY)} - todos los momentos de la encuesta` : '') +
      panelVer('Nivel académico de los docentes', 'docentes', niv, nivY ? `${nivY} - título más alto verificado` : '') +
      panelVer('Satisfacción de los grupos de interés', 'grupos', sat.length ? hbars(sat, { max: 100, color: '#335f7f', tip: r => `${r.a}: ${num(r.v, 1)} % (${r.n})` }) : '<div class="empty"><b>Sin datos</b></div>',
        'Porcentaje de valoraciones positivas, última medición') +
      `</div><div class="sec"><h3>Investigación, vinculación y servicios de apoyo</h3></div><div class="grid3 arriba">` +
      panelVer('Artículos publicados por año', 'investigacion', slot(el => columnChart(el, { xs: columnasDe('pub_total'), h: 210 })), 'Artículos únicos aprobados - * año en curso') +
      panelVer('Proyectos de vinculación por año', 'vinculacion', slot(el => columnChart(el, { xs: columnasDe('vin_proy'), h: 210 })), 'Proyectos en ejecución en algún momento del año') +
      panelVer('Servicios de apoyo', 'apoyo', apoyo.length ? hbars(apoyo, { max: 100, color: '#4597bf', tip: r => `${r.a}: ${num(r.v, 1)} % (${r.n})` }) : '<div class="empty"><b>Sin datos</b></div>',
        'Cobertura y satisfacción, última medición') +
      `</div>` + lectura(destacados, 'Lo más destacado');   // la síntesis va al final, después de los gráficos
  }

  /* ---------------- Vista 1 - Rendimiento académico ---------------- */
  const REND_CAT = ['Reprobado', 'Aprobado', 'Bueno', 'Muy Bueno', 'Excelente'];
  const REND_COL = ['#f48521', '#a9cde2', '#4597bf', '#335f7f', '#1c3247'];
  const BANDAS = Array.from({ length: 20 }, (_, i) => String(i * 5).padStart(2, '0') + '-' + (i === 19 ? '100' : String(i * 5 + 4).padStart(2, '0')));
  const claveRend = car => dimRend() ? car + '|' + dimRend() : car;
  const filaRend = (car, p) => (RF[claveRend(car)] || {})[p];
  /* Semestre de referencia de los paneles: el último con datos hasta el corte. */
  const pRend = () => { const d = ultimoDet(RF[st.car]); return d && d.k; };
  const sinCruce = txt => `<div class="empty"><b>Sin cruce con el grupo elegido</b>${esc(txt)}</div>`;

  function insRend() {
    const out = [], c = st.car;
    if (!R) return out;
    const a = medir('rend_aprob', c);
    if (a.cur) {
      let s = `La aprobación${deGrupo()} es ${B(fmt('rend_aprob', a.cur.v))} de las evaluaciones en ${esc(a.cur.l)}`;
      if (a.prev) {
        const t = tendencia('rend_aprob', a.cur, a.prev);
        s += t.dir ? `, ${t.dir > 0 ? 'sube' : 'baja'} ${B(num(Math.abs(t.d), 1) + ' pp')} frente a ${esc(a.prev.l)}` : `, estable frente a ${esc(a.prev.l)}`;
      }
      out.push(s + '.');
    }
    const ex = extremos('rend_reprob', c, 30);
    if (ex && ex.hi.v - ex.lo.v >= 3)
      out.push(`${esc(NOM[ex.hi.k])} reprueba ${B(fmt('rend_reprob', ex.hi.v))} de sus evaluaciones, frente a ${fmt('rend_reprob', ex.lo.v)} en ${esc(NOM[ex.lo.k])} (${esc(ex.l)}).`);
    const nt = medir('rend_nota', c).cur, rn = nt && filaRend(c, nt.p);
    if (rn) out.push(`La nota promedio es ${B(num(nt.v, 1))} sobre 100 (mediana ${num(rn.nm, 0)}); ${B(num(rn.pem, 1) + ' %')} de las evaluaciones llega a Muy Bueno o Excelente.`);
    const p = pRend();
    if (p && !dimRend()) {
      const nv = NIVELES.map(n => ({ n, r: (RF[c + '|' + n] || {})[p] })).filter(x => x.r && x.r.ev >= 30);
      if (nv.length > 2) {
        const w = nv.reduce((m, x) => x.r.pr > m.r.pr ? x : m);
        if (w.r.pr > 0) out.push(`El nivel con más reprobación en ${esc(lblDe(p))} es ${B(nivNom(w.n))}: ${B(num(w.r.pr, 1) + ' %')} de sus evaluaciones.`);
      }
      const m1 = (RF[c + '|numero_matricula:1'] || {})[p], m2 = (RF[c + '|numero_matricula:2'] || {})[p];
      if (m1 && m2) out.push(`Quienes cursan en segunda matrícula aprueban el ${B(num(m2.pa, 1) + ' %')} de las evaluaciones, frente al ${num(m1.pa, 1)} % en primera matrícula.`);
    }
    // En línea la asistencia no condiciona la aprobación: no se lee contra el umbral
    const as = medir('rend_asist', c).cur, ra = as && filaRend(c, as.p);
    if (ra && ra.pba != null && !tieneLinea(c)) out.push(`La asistencia promedio es ${B(fmt('rend_asist', as.v))}; ${B(num(ra.pba, 1) + ' %')} de los registros queda bajo el mínimo de ${umbralA(as.p)} % vigente en ${esc(lblDe(as.p))}.`);
    return out;
  }

  /* Histograma de 20 bandas de 5 puntos. Pulsar una banda filtra el tablero a esa banda. */
  function distDe(v) {
    const dim = dimRend();
    let k = st.car;
    if (dim) {
      if (/^N\d$/.test(dim)) return null;  // no hay histogramas por nivel
      if (dim.startsWith('banda_')) { if (!dim.startsWith(v === 'n' ? 'banda_nota:' : 'banda_asistencia:')) return null; }
      else k = st.car + '|' + dim;
    }
    const d = ultimoDet(R.dist[k]);
    return d && d.rows[v] ? { p: d.k, arr: d.rows[v] } : null;
  }
  function histChart(el, d, o) {
    const tot = d.arr.reduce((s, v) => s + v, 0);
    if (!tot) { el.innerHTML = '<div class="empty"><b>Sin registros en este periodo</b></div>'; return; }
    const W = Math.max(300, el.clientWidth || 560), H = 205, ml = 38, mr = 10, mt = 16, mb = 28, iw = W - ml - mr, ih = H - mt - mb;
    const pc = d.arr.map(v => v / tot * 100), ymax = niceMax(Math.max(...pc) * 1.1);
    const Y = v => mt + ih - v / ymax * ih, bw = iw / 20;
    let g = '';
    [0, ymax / 2, ymax].forEach(t => {
      g += `<line x1="${ml}" x2="${W - mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e6ecf0"/>` +
        `<text x="${ml - 7}" y="${Y(t) + 3.5}" text-anchor="end" font-size="10.5" fill="#6f8596">${num(t, t % 1 ? 1 : 0)}%</text>`;
    });
    pc.forEach((v, i) => {
      const rf = o.tipo + ':' + BANDAS[i], sel = st.rf === rf, otra = st.rf && st.rf.startsWith(o.tipo + ':') && !sel;
      const color = (i + 1) * 5 <= o.ref ? '#f7964d' : o.color;
      g += `<rect class="bar" data-i="${i}" x="${ml + i * bw + 1}" y="${Y(v)}" width="${Math.max(bw - 2, 1)}" height="${Math.max(Y(0) - Y(v), 0)}" fill="${color}" opacity="${otra ? .35 : 1}" rx="2"${sel ? ' stroke="#1c3247" stroke-width="1.5"' : ''}/>`;
      if (i % 2 === 0) g += `<text x="${ml + i * bw}" y="${H - 9}" text-anchor="middle" font-size="10.5" fill="#6f8596">${i * 5}</text>`;
    });
    g += `<text x="${ml + iw}" y="${H - 9}" text-anchor="middle" font-size="10.5" fill="#6f8596">100</text>`;
    const xr = ml + o.ref / 5 * bw;
    g += `<line x1="${xr}" x2="${xr}" y1="${mt - 8}" y2="${mt + ih}" stroke="#fc7e00" stroke-width="1.3" stroke-dasharray="3 3"/>` +
      `<text x="${xr + 4}" y="${mt - 1}" font-size="10.5" fill="#b86200" font-weight="700">${esc(o.refTxt)}</text>`;
    el.innerHTML = svgEl(W, H, g);
    el.querySelectorAll('rect.bar').forEach(r => {
      const i = +r.dataset.i, rf = o.tipo + ':' + BANDAS[i], hay = !!RF[st.car + '|' + rf];
      r.style.cursor = hay ? 'pointer' : 'default';
      r.addEventListener('pointermove', e => {
        tipShow(`<div class="tt">${esc(o.eje)} ${esc(BANDAS[i].replace('-', '–'))}</div><div class="r"><b>${num(pc[i], 1)} %</b><span>${num(d.arr[i])} registros</span></div>` +
          `<div class="nota">${hay ? (st.rf === rf ? 'Clic: quitar este filtro' : 'Clic: filtrar el tablero a esta banda') : 'Sin datos para filtrar esta banda'}</div>`, e.clientX, e.clientY);
      });
      r.addEventListener('pointerleave', tipHide);
      if (hay) r.addEventListener('click', () => filtrarRend(rf));
    });
  }

  function vRend() {
    if (!R) return '<div class="empty"><b>Faltan los datos de rendimiento</b>No se cargó data/rendimiento-data.js.</div>';
    const c = st.car, dim = dimRend(), p = pRend(), k = claveRend(c);
    const ids = ['rend_est', 'rend_aprob', 'rend_reprob', 'rend_nota', 'rend_exc', 'rend_asist', 'rend_rep', 'rend_aband'];

    const barra = filtrosEst('rend', Object.keys(RF), ['gse', 'sexo', 'etnia', 'tipo_ingreso', 'numero_matricula'],
      `Un filtro a la vez. También puedes pulsar un nivel o una barra de los histogramas. ${R.minBase > 0 ? `No se publican grupos con menos de ${R.minBase} estudiantes.` : ''}`);

    // Categorías de la escala por periodo (100 %)
    const xsCat = Object.keys(RF[k] || {}).filter(dentroP).sort((a, b) => ordenP(a) - ordenP(b)).map(pp => {
      const r = RF[k][pp], t = r.c1 + r.c2 + r.c3 + r.c4 + r.c5;
      return { p: pp, l: lblDe(pp), a: +pp.slice(-4), nota: `${num(t)} evaluaciones con nota`, segs: REND_CAT.map((nm, j) => ({ k: nm, v: t ? r['c' + (j + 1)] / t * 100 : 0, color: REND_COL[j] })) };
    });
    const legCat = '<div class="legend">' + REND_CAT.map((nm, j) => `<span><i class="box" style="background:${REND_COL[j]}"></i>${nm}</span>`).join('') + '</div>';

    // Escala institucional con el reparto del semestre de referencia
    const rc = p && (RF[k] || {})[p], tc = rc ? rc.c1 + rc.c2 + rc.c3 + rc.c4 + rc.c5 : 0;
    const escala = `<div class="tbl-wrap"><table class="res"><thead><tr><th>Categoría</th><th>Nota</th><th>Condición</th><th class="n">${p ? esc(lblDe(p)) : 'Periodo'}</th></tr></thead><tbody>` +
      R.escala.map((e, j) => `<tr><td><i class="sw" style="background:${REND_COL[j]}"></i>${esc(e.categoria)}</td><td class="per">${num(e.nota_min, 0)} – ${num(Math.floor(e.nota_max), 0)}</td>` +
        `<td>${esc(e.condicion)}</td><td class="n"><b>${tc ? num(rc['c' + (j + 1)] / tc * 100, 1) + ' %' : '—'}</b></td></tr>`).join('') + '</tbody></table></div>' +
      '<p class="ph-note" style="margin:10px 0 0">Escala del Art. 75. Rangos referenciales, pendientes de validación por la Dirección.</p>';

    // Aprobación por número de matrícula
    let matHTML;
    if (dim && !dim.startsWith('numero_matricula:')) matHTML = sinCruce('El número de matrícula no se cruza con otro grupo de estudiantes.');
    else {
      const rows = ['1', '2', '3', '4'].map(n => { const r = p && (RF[c + '|numero_matricula:' + n] || {})[p]; return r && { a: n + '.ª matrícula', rf: 'numero_matricula:' + n, v: r.pa, ev: r.ev, e: r.e }; }).filter(Boolean);
      matHTML = hbars(rows, { max: 100, color: COL[c], tip: r => `${r.a}: ${num(r.v, 1)} % de aprobación\n${num(r.ev)} evaluaciones - ${num(r.e)} estudiantes` });
    }

    // Rendimiento por nivel
    let nivHTML;
    if (dim && !/^N\d$/.test(dim)) nivHTML = sinCruce('El nivel no se cruza con otro grupo de estudiantes.');
    else {
      const rows = p ? NIVELES.map(n => ({ n, r: (RF[c + '|' + n] || {})[p] })).filter(x => x.r) : [];
      const maxPr = Math.max(1, ...rows.map(x => x.r.pr || 0));
      nivHTML = rows.length ? `<div class="tbl-wrap"><table class="res"><thead><tr><th>Nivel</th><th class="n">Estudiantes</th><th class="n">Aprobación</th><th>Reprobación</th><th class="n">Nota prom.</th><th class="n">Asistencia</th></tr></thead><tbody>` +
        rows.map(({ n, r }) => `<tr class="${st.niv === n ? 'hl' : ''}" data-niv="${n}" data-tip="${esc(st.niv === n ? 'Clic: quitar este filtro' : 'Clic: filtrar el tablero a ' + nivNom(n))}">` +
          `<td>${esc(nivNom(n))}</td><td class="n">${num(r.e)}</td><td class="n">${num(r.pa, 1)} %</td>` +
          `<td><span class="mini-bar"><i style="width:${(r.pr || 0) / maxPr * 100}%;background:#f48521"></i></span>${num(r.pr, 1)} %</td>` +
          `<td class="n">${num(r.np, 1)}</td><td class="n">${num(r.as, 1)} %</td></tr>`).join('') + '</tbody></table></div>'
        : '<div class="empty"><b>Sin detalle por nivel para este periodo</b></div>';
    }

    // Detalle por carrera
    const filasCar = ambito(c).map(cc => [cc, p && filaRend(cc, p)]);
    const carHTML = `<div class="tbl-wrap"><table class="res"><thead><tr><th>Carrera</th><th class="n">Estudiantes</th><th class="n">Evaluaciones</th><th class="n">Aprobación</th><th class="n">Reprobación</th><th class="n">Nota prom.</th><th class="n">Asistencia</th><th class="n">Repetidores</th><th class="n">Asistencia &lt; ${p ? umbralA(p) : R.umbralAsistencia} %</th></tr></thead><tbody>` +
      filasCar.map(([cc, r]) => `<tr class="${cc === c ? 'hl' : ''}" data-carsel="${cc}" data-tip="${esc('Clic: ver ' + NOM[cc].toLowerCase())}"><td><div class="ind">${esc(NOM[cc])}</div></td>` +
        (r ? `<td class="n">${num(r.e)}</td><td class="n">${num(r.ev)}</td><td class="n"><b>${num(r.pa, 1)} %</b></td><td class="n">${num(r.pr, 1)} %</td><td class="n">${num(r.np, 1)}</td><td class="n">${num(r.as, 1)} %</td><td class="n">${num(r.prep, 1)} %</td><td class="n">${num(r.pba, 1)} %</td>`
          : '<td class="n" colspan="8"><span class="per">Sin datos publicables para este grupo</span></td>') + '</tr>').join('') + '</tbody></table></div>';

    const dN = distDe('n'), dA = distDe('a');
    const histo = (d, o) => d ? slot(el => histChart(el, d, o)) : sinCruce(dim && /^N\d$/.test(dim) ? 'Los histogramas no tienen desglose por nivel.' : 'No hay histograma publicado para este grupo.');
    const notaP = p ? esc(lblDe(p)) + (dim ? ' - ' + esc(st.niv ? nivNom(st.niv) : st.gse ? 'Nivel socioeconómico ' + GSE_NOM[st.gse].toLowerCase() : rfNom(dim)) : '') : '';

    // Aclaración de asistencia cuando la selección incluye carreras en línea
    const soloLinea = MOD_DE[c] === 'MOD_LIN', mixto = c === FAC;
    const avisoLinea = soloLinea || mixto ? `<div class="aviso-info" role="note"><b>Asistencia en la modalidad en línea.</b><span>` +
      `En línea la asistencia no es requisito de aprobación: no se reprueba por asistencia inferior al mínimo ` +
      `(${umbralTxt()} en presencial y semipresencial, Art. 77).` +
      (mixto ? ' Con toda la facultad se mezclan las modalidades: para leer la asistencia frente al mínimo, elige la modalidad presencial o semipresencial.' : '') +
      `</span></div>` : '';
    const notaAsist = soloLinea ? ' - en línea el umbral no aplica: la asistencia no condiciona la aprobación'
      : mixto ? ' - el umbral aplica a presencial y semipresencial; en línea no condiciona la aprobación' : '';

    return barra + avisoLinea + `<div class="kpis ${ids.length === 5 ? 'k5' : 'k4'}">${ids.map(id => kpi(id, { icono: true })).join('')}</div>` + lectura(insRend()) +
      `<div class="grid3">` +
      panel('Aprobación por periodo', 'rend_aprob', slot(el => lineChart(el, 'rend_aprob', { h: 220 })), 'Porcentaje de evaluaciones válidas aprobadas, por semestre') +
      panel('Reprobación por periodo', 'rend_reprob', slot(el => lineChart(el, 'rend_reprob', { h: 220 })), 'Porcentaje de evaluaciones válidas reprobadas, por semestre') +
      panel('Nota promedio', 'rend_nota', slot(el => lineChart(el, 'rend_nota', { h: 220 })), 'Sobre 100 puntos; se aprueba con 70') +
      `</div><div class="grid2 wl arriba">` +
      panel('Distribución por categoría de la escala institucional', 'rend_exc', slot(el => columnChart(el, { xs: xsCat, legend: legCat, ymax: 100, pct: true, sinTotal: true, fmt: v => num(v, 1) + ' %', h: 235 })), 'Proporción de evaluaciones con nota en cada categoría, por semestre') +
      panel('Escala institucional', null, escala, 'Categorías de valoración y su peso en el semestre de referencia') +
      `</div><div class="grid2">` +
      panel('Distribución de notas', 'rend_nota', histo(dN, { tipo: 'banda_nota', ref: R.notaAprobacion, refTxt: 'Aprueba ' + R.notaAprobacion, eje: 'Nota', color: COL[c] }),
        dN ? `${esc(lblDe(dN.p))} - bandas de 5 puntos; en naranja, bajo la nota de aprobación` : '') +
      panel('Distribución de asistencia', 'rend_asist', histo(dA, { tipo: 'banda_asistencia', ref: dA ? umbralA(dA.p) : R.umbralAsistencia, refTxt: 'Mínimo ' + (dA ? umbralA(dA.p) : R.umbralAsistencia) + ' %' + (soloLinea ? ' (no aplica en línea)' : ''), eje: 'Asistencia', color: COL[c] }),
        dA ? `${esc(lblDe(dA.p))} - bandas de 5 puntos; en naranja, bajo la asistencia mínima vigente (${umbralTxt()})${notaAsist}` : '') +
      `</div><div class="grid2 wl arriba">` +
      panel('Rendimiento por nivel', 'rend_reprob', nivHTML, p ? `${esc(lblDe(p))} - pulsa un nivel para filtrar el tablero` : '') +
      panel('Aprobación por número de matrícula', 'rend_rep', matHTML, p ? `${esc(lblDe(p))} - pulsa una matrícula para filtrar` : '') +
      `</div>` +
      panel('Detalle de rendimiento por carrera', null, carHTML, notaP) +
      tabla(ids);
  }

  /* ---------------- Vista 1 - Seguimiento a graduados ---------------- */
  const GV = { tray: 'Trayectoria', empleo: 'Condiciones del empleo', form: 'Formación y vinculación' };
  const GV_IDS = {
    tray: ['grad_empleab', 'grad_ins6', 'grad_afin', 'grad_cob', 'grad_resp'],
    empleo: ['grad_fijo', 'grad_sbu', 'grad_sup', 'grad_terc', 'grad_sinact'],
    form: ['grad_compe', 'grad_compg', 'grad_conv', 'grad_bolsa', 'grad_maest']
  };
  const ORDEN_CAT = {
    tiempo_primer_empleo: ['0 a 6 meses', '7 a 12 meses', '13 a 24 meses', 'mayor de 24 meses'],
    tramo_salarial: ['<=SBU', 'SBU a 500', '501 a 1000', '1001 a 2000', 'mayor de 2000']
  };
  /* Año de encuesta de referencia: el último, hasta el año del semestre elegido, con respuestas en el momento elegido. */
  function gAnio() {
    const a = G.kpi[claveGrad(st.car)] || {};
    const ys = Object.keys(a).filter(y => +y <= anioCorte() && a[y][st.gmom]).sort();
    return ys[ys.length - 1] || null;
  }
  const gFila = (k, y) => ((G.kpi[k] || {})[y] || {})[st.gmom];
  /* Cada pregunta se toma del último año de encuesta, hasta el corte, en que se hizo en ese momento. */
  function gUltimo(obj, f) {
    const ys = Object.keys(obj || {}).filter(y => +y <= anioCorte() && f(obj[y][st.gmom])).sort();
    return ys.length ? ys[ys.length - 1] : null;
  }
  function gDist(variable) {
    const dk = G.dist[claveGrad(st.car)];
    const y = gUltimo(dk, x => x && x[variable] && x[variable].length); if (!y) return null;
    const rows = dk[y][st.gmom][variable];
    const ord = ORDEN_CAT[variable] || [], peso = a => /^Otras/.test(a) ? 99 : (ord.indexOf(a) + 1 || 50);
    const out = rows.map(([a, n, b, v]) => ({ a, n, b, v })).sort((x, z) => peso(x.a) - peso(z.a) || (z.v || 0) - (x.v || 0));
    return { y, rows: out, b: out[0].b };
  }
  const gTip = r => `${r.a}: ${num(r.v, 1)} %\n${r.n == null ? 'Menos de 5 casos' : num(r.n) + ' de ' + num(r.b) + ' respuestas'}`;
  function gPanel(titulo, variable, id, nota) {
    const d = gDist(variable);
    return panel(titulo, id || null,
      d ? hbars(d.rows, { max: 100, color: COL[st.car], tip: gTip }) : '<div class="empty"><b>Sin respuestas para esta pregunta</b>No se pregunta en este momento de la encuesta o no hay respuestas con los filtros elegidos.</div>',
      d ? `Encuesta ${esc(d.y)} - ${esc(MOMENTOS[st.gmom].toLowerCase())} - ${num(d.b)} respuestas${nota ? ' - ' + nota : ''}` : (nota || ''));
  }

  function insGrad() {
    const out = [], c = st.car;
    if (!G) return out;
    const e = medir('grad_empleab', c);
    if (e.cur) {
      let s = `${B(fmt('grad_empleab', e.cur.v))} de los graduados${deGrupo()} consultados en la ${esc(e.cur.l.toLowerCase())} tiene alguna actividad laboral`;
      if (e.prev) { const t = tendencia('grad_empleab', e.cur, e.prev); s += t.dir ? ` (${t.dir > 0 ? 'sube' : 'baja'} ${num(Math.abs(t.d), 1)} pp frente a ${esc(e.prev.l.toLowerCase())})` : ''; }
      out.push(s + (e.cur.n < 10 ? `; son solo ${num(e.cur.n)} respuestas, conviene leerlo con cautela.` : '.'));
    }
    const i6 = medir('grad_ins6', c).cur;
    if (i6) out.push(`${B(fmt('grad_ins6', i6.v))} consiguió su primer empleo relacionado con la carrera en 6 meses o menos.`);
    const af = medir('grad_afin', c).cur;
    if (af) out.push(`${B(fmt('grad_afin', af.v))} trabaja en algo muy relacionado con lo que estudió.`);
    const cb = medir('grad_cob', c).cur;
    if (cb) out.push(`El seguimiento llega al ${B(fmt('grad_cob', cb.v))} de los titulados de ${cb.a} (${num(cb.num)} de ${num(cb.n)})` +
      (cb.v < 50 ? ': las cifras representan solo a una parte de los graduados.' : '.'));
    return out;
  }

  function vGrad() {
    if (!G) return '<div class="empty"><b>Faltan los datos de graduados</b>No se cargó data/graduados-data.js.</div>';
    const c = st.car, y = gAnio(), ids = GV_IDS[st.gv];

    // Controles: vista, momento y grupo
    const segV = Object.entries(GV).map(([k, l]) => `<button type="button" class="segbtn ${st.gv === k ? 'on' : ''}" data-gv="${k}">${l}</button>`).join('');
    const segM = Object.entries(MOMENTOS).map(([k, l]) => `<button type="button" class="segbtn ${st.gmom === k ? 'on' : ''}" data-gmom="${k}">${k === 'T' ? 'Todos' : l}</button>`).join('');
    const barra = `<div class="rfbar"><label>Vista</label><div class="segbtns">${segV}</div><label>Momento</label><div class="segbtns">${segM}</div>` +
      `<span>${st.gmom === 'T' ? 'Con «Todos» se suman los tres momentos: para comparar, elige uno.' : 'Encuesta ' + (y || '—') + ' - ' + esc(MOMENTOS[st.gmom].toLowerCase()) + '.'}</span></div>` +
      filtrosEst('grad', Object.keys(G.kpi), ['gse', 'sexo'],
        `Un filtro a la vez.${st.niv ? ' El nivel de la carrera no aplica a graduados: se muestran todos.' : ''}`);

    let cuerpo = '';
    if (st.gv === 'tray') {
      const LIN = [['grad_empleab', 'Empleabilidad'], ['grad_ins6', 'Empleo en ≤ 6 meses'], ['grad_afin', 'Empleo afín'], ['grad_fijo', 'Contrato fijo']];
      const segL = LIN.map(([k, l]) => `<button type="button" class="segbtn ${st.glin === k ? 'on' : ''}" data-glin="${k}">${l}</button>`).join('');
      const linea = `<div class="panel"><div class="ph"><h3>Evolución por año de encuesta</h3>${info(st.glin)}<span style="flex:1"></span><div class="segbtns">${segL}</div></div>` +
        `<p class="ph-note">${esc(MOMENTOS[st.gmom])} - punto hueco: menos de 10 respuestas</p>${slot(el => lineChart(el, st.glin, { h: 230 }))}</div>`;
      // Respuestas por momento, sexo y nivel socioeconómico (pulsables)
      const kk = (G.kpi[claveGrad(c)] || {})[y] || {};
      const rMom = ['1', '2', '3'].filter(m => kk[m]).map(m => ({ a: MOMENTOS[m], gm: m, v: kk[m][0] }));
      const rSex = st.gse ? null : ['MUJER', 'HOMBRE'].map(s => { const f = gFila(c + '|sexo:' + s, y); return f && { a: gfNom('sexo:' + s), gf: 'sexo:' + s, v: f[0] }; }).filter(Boolean);
      const rGse = st.gf ? null : GSE_ORD.map(g => { const f = gFila(c + '|' + g, y); return f && { a: GSE_NOM[g], gse: g, v: f[0] }; }).filter(Boolean);
      const cnt = (rows, nota) => rows ? hbars(rows, { max: Math.max(1, ...rows.map(r => r.v)), color: '#4597bf', fmt: v => num(v) + ' resp.', tip: r => `${r.a}: ${num(r.v)} respuestas\n${nota}` }) : sinCruce('Este desglose no se cruza con el grupo elegido.');
      const notaY = y ? `Encuesta ${esc(y)}` : '';
      // Cobertura por carrera y año de titulación
      const anCob = [...new Set(Object.keys(G.cob).filter(k => k.includes('|cohorte_titulacion:')).map(k => k.split(':')[1]))].sort();
      const cobRows = ambito(c).map(cc => {
        const t = G.cob[cc] || [0, 0];
        return `<tr class="${cc === c ? 'hl' : ''}" data-carsel="${cc}" data-tip="${esc('Clic: ver ' + NOM[cc].toLowerCase())}"><td><div class="ind">${esc(NOM[cc])}</div></td><td class="n">${num(t[0])}</td><td class="n">${num(t[1])}</td><td class="n"><b>${t[0] ? num(t[1] / t[0] * 100, 1) + ' %' : '—'}</b></td>` +
          anCob.map(a => { const v = G.cob[cc + '|cohorte_titulacion:' + a]; return `<td class="n">${v && v[0] ? num(v[1] / v[0] * 100, 1) + ' %' : '—'}</td>`; }).join('') + '</tr>';
      }).join('');
      const cobHTML = `<div class="tbl-wrap"><table class="res"><thead><tr><th>Carrera</th><th class="n">Titulados</th><th class="n">Encuestados</th><th class="n">Cobertura</th>${anCob.map(a => `<th class="n">Titulados ${a}</th>`).join('')}</tr></thead><tbody>${cobRows}</tbody></table></div>`;
      cuerpo = linea +
        `<div class="grid2 arriba">` + gPanel('Situación laboral', 'situacion_laboral', 'grad_empleab') +
        panel('Respuestas por momento', 'grad_resp', rMom.length ? cnt(rMom, 'Clic: filtrar por este momento') : '<div class="empty"><b>Sin respuestas</b></div>', notaY + ' - pulsa un momento para filtrar') + `</div>` +
        `<div class="grid2 arriba">` + panel('Respuestas por sexo', 'grad_resp', cnt(rSex, 'Clic: filtrar por este grupo'), notaY + ' - ' + esc(MOMENTOS[st.gmom].toLowerCase())) +
        panel('Respuestas por nivel socioeconómico', 'grad_resp', cnt(rGse, 'Clic: filtrar por este grupo'), notaY + ' - nivel registrado al ingresar a la carrera') + `</div>` +
        panel('Cobertura del seguimiento por carrera', 'grad_cob', cobHTML, 'Titulados que respondieron al menos una encuesta, sobre el total de titulados');
    } else if (st.gv === 'empleo') {
      cuerpo = `<div class="grid3">` +
        gPanel('Tiempo hasta el primer empleo', 'tiempo_primer_empleo', 'grad_ins6') +
        gPanel('Tramo salarial', 'tramo_salarial', 'grad_sbu', 'quienes trabajan para un empleador') +
        gPanel('Tipo de contrato', 'tipo_contrato', 'grad_fijo') + `</div><div class="grid3">` +
        gPanel('Rango jerárquico alcanzado', 'rango_jerarquico', 'grad_sup') +
        gPanel('Sector económico del empleador', 'sector_economico', 'grad_terc') +
        gPanel('Tipo de empresa', 'tipo_empresa', null) + `</div>`;
    } else {
      const ck = G.comp[claveGrad(c)], yC = gUltimo(ck, x => x && x.length);
      const compRows = (tipo) => (yC ? ck[yC][st.gmom] : []).filter(r => r[0] === tipo)
        .map(r => ({ a: G.competencias[r[1]], v: r[5], n: r[2], k: r[3], media: r[4] }));
      const tipC = r => `${r.a}\n${num(r.v, 1)} % en alto grado (6 o 7) - promedio ${num(r.media, 2)} de 7\n${num(r.n)} respuestas`;
      const compG = compRows('G'), compE = compRows('E');
      const resumen = ['grad_compg', 'grad_compe', 'grad_malla'].map(id => { const m = medir(id, c).cur; return m && { a: CAT[id].nombre, v: m.v, n: m.n }; }).filter(Boolean);
      const vacioC = '<div class="empty"><b>Sin valoraciones de competencias</b>Se preguntan al titularse: elige ese momento o «Todos».</div>';
      cuerpo = `<div class="grid2 arriba">` +
        gPanel('Relación entre el empleo y la profesión', 'relacion_empleo', 'grad_afin') +
        panel('Competencias adquiridas y malla curricular', 'grad_compg', resumen.length ? hbars(resumen, { max: 100, color: COL[c], tip: r => `${r.a}: ${num(r.v, 1)} % en alto grado\n${num(r.n)} valoraciones o respuestas` }) : vacioC, 'Porcentaje que valora en alto grado (6 o 7 de 7)') + `</div>` +
        `<div class="grid2 arriba">` +
        panel('Competencias generales adquiridas', 'grad_compg', compG.length ? hbars(compG, { max: 100, color: '#335f7f', tip: tipC }) : vacioC, yC ? `Encuesta ${esc(yC)} - % que la valora en alto grado` : '') +
        panel('Competencias específicas adquiridas', 'grad_compe', compE.length ? hbars(compE, { max: 100, color: '#4597bf', tip: tipC }) : vacioC,
          (yC ? `Encuesta ${esc(yC)} - % que la valora en alto grado` : '') + (esAgregado(c) ? ' - con varias carreras se mezclan las competencias de cada una' : '')) + `</div>` +
        `<div class="grid3">` +
        gPanel('Canal de búsqueda de empleo', 'canal_busqueda', null) +
        gPanel('Medio por el que consiguió el empleo', 'medio_empleo', 'grad_bolsa') +
        gPanel('Vínculo del empleador con la UNEMI', 'vinculo_empleador', 'grad_conv') + `</div><div class="grid2">` +
        gPanel('Estudios que desearía cursar en la UNEMI', 'estudios_deseados', 'grad_maest') +
        gPanel('Trabajó mientras estudiaba', 'trabajo_mientras_estudiaba', null) + `</div>`;
    }
    return barra + `<div class="kpis ${ids.length === 5 ? 'k5' : 'k4'}">${ids.map(id => kpi(id, { icono: true })).join('')}</div>` + lectura(insGrad()) + cuerpo +
      tabla(st.gv === 'form' ? ids.concat('grad_malla') : ids);
  }

  /* ---------------- Vista 1 - Trayectoria estudiantil ---------------- */
  function insTray() {
    const out = [], c = st.car;
    if (!T) return out;
    const r = medir('tray_ret', c), d = medir('tray_des', c);
    const rc = r.pts.filter(p => !p.parcial), rr = rc[rc.length - 1], rp = rc[rc.length - 2];
    if (rr) {
      let s = `La retención${deGrupo()} es ${B(fmt('tray_ret', rr.v))} en ${rr.a}`;
      if (rp) { const t = tendencia('tray_ret', rr, rp); s += t.dir ? `, ${t.dir > 0 ? 'sube' : 'baja'} ${B(num(Math.abs(t.d), 1) + ' pp')} frente a ${rp.a}` : `, estable frente a ${rp.a}`; }
      out.push(s + '.');
    }
    if (d.cur) out.push(`De la cohorte ${esc(d.cur.p.replace('-', ' '))}, ${B(fmt('tray_des', d.cur.v))} ya no continuaba sus estudios a mitad de la carrera: ` +
      `${num(d.cur.num)} de ${num(d.cur.n)} estudiantes que iniciaron el primer nivel (deserción a mitad de carrera).`);
    const g = medir('tray_grad', c).cur, gt = medir('tray_gradt', c).cur;
    if (g) out.push(`De la cohorte ${esc(g.p.replace('-', ' '))}, ${B(fmt('tray_grad', g.v))} se tituló a tiempo` + (gt ? ` y ${B(fmt('tray_gradt', gt.v))} se ha titulado hasta hoy.` : '.'));
    const m = medir('tray_mat', c), mc = m.pts.filter(p => !p.parcial), m1 = mc[mc.length - 1], m0 = mc[mc.length - 2];
    if (m1 && m0) out.push(`La matrícula pasó de ${num(m0.v)} estudiantes en ${m0.a} a ${B(num(m1.v))} en ${m1.a} (${m1.v >= m0.v ? '+' : '−'}${num(Math.abs((m1.v - m0.v) / m0.v * 100), 1)} %).`);
    return out;
  }

  function vTray() {
    if (!T) return '<div class="empty"><b>Faltan los datos de trayectoria</b>No se cargó data/trayectoria-data.js.</div>';
    const c = st.car, ids = ['tray_mat', 'tray_var', 'tray_ret', 'tray_ret1', 'tray_des', 'tray_grad', 'tray_gradt', 'tray_tit'];
    const dim = dimTray(), k = dim ? c + '|' + dim : c;

    const barra = filtrosEst('tray', Object.keys(T.anual), ['gse', 'sexo', 'tipo_ingreso'],
      `Un filtro a la vez. La graduación y la retención de primer año se miden por cohorte: no se cruzan con tipo de ingreso.` +
      `${st.niv ? ' El nivel de la carrera no aplica a la trayectoria: se muestran todos.' : ''}`);

    // Matrícula por año (por carrera) y composición por tipo de ingreso
    const an = T.anual[k] || {};
    const ys = Object.keys(an).filter(y => +y <= anioCorte()).sort();
    const xsMat = ys.map(y => {
      const segs = !dim ? segsMatricula(c, y) : [{ k: NOM[c], v: an[y][0], color: COL[c] }];
      return { p: y, l: y, a: +y, parcial: +y === D.anioActual, segs };
    });
    const legMat = !dim ? legMatricula(c) : '';
    const COMP = [['Nuevo ingreso', '#f48521'], ['Continuidad', '#335f7f'], ['Reingreso', '#a9cde2']];
    const xsComp = ys.map(y => {
      const f = an[y], t = f[1] + f[2] + f[3];
      return { p: y, l: y, a: +y, nota: `${num(t)} matrículas en los periodos del año`, segs: COMP.map(([nm, col], j) => ({ k: nm, v: t ? f[1 + j] / t * 100 : 0, color: col })) };
    });
    const legComp = '<div class="legend">' + COMP.map(([nm, col]) => `<span><i class="box" style="background:${col}"></i>${nm}</span>`).join('') + '</div>';

    // Titulados por año
    const ti = (T.tit[trayAdmite('tray_tit', dim) && dim ? k : c]) || {};
    const xsTit = Object.keys(ti).filter(y => +y <= anioCorte()).sort().map(y => ({ p: y, l: y, a: +y, parcial: +y === D.anioActual, segs: [{ k: 'Titulados', v: ti[y], color: '#4597bf' }] }));

    // Tabla por cohorte
    const kc = dim && trayAdmite('tray_grad', dim) ? k : c, co = T.coh[kc] || {};
    const cs = Object.keys(co).filter(x => +x.slice(-4) <= anioCorte()).sort((a, b) => ordenP(a) - ordenP(b));
    const tCoh = cs.length ? `<div class="tbl-wrap" style="max-height:380px;overflow-y:auto"><table class="res"><thead><tr><th>Cohorte</th><th class="n">Ingresaron</th><th class="n">Retención 1.er año</th><th class="n">Deserción a mitad</th><th class="n">Titulados</th><th class="n">Graduación oportuna</th><th class="n">Graduación total</th><th>Ventana</th></tr></thead><tbody>` +
      cs.map(x => { const f = co[x], de = ((T.des || {})[kc] || {})[x];
        return `<tr><td>${esc(x.replace('-', ' '))}</td><td class="n">${num(f[0])}</td><td class="n">${f[1] ? num(pct1(f[2], f[1]), 1) + ' %' : '—'}</td>` +
        `<td class="n">${de ? num(pct1(de[1], de[0]), 1) + ' %' : '—'}</td><td class="n">${num(f[3])}</td>` +
        `<td class="n">${f[5] ? '<b>' + num(pct1(f[4], f[0]), 1) + ' %</b>' : '—'}</td><td class="n">${f[5] ? num(pct1(f[3], f[0]), 1) + ' %' : '—'}</td>` +
        `<td>${f[5] ? '<span class="pill fin">Cerrada</span>' : '<span class="pill ej">En curso</span>'}</td></tr>`; }).join('') + '</tbody></table></div>'
      : '<div class="empty"><b>Sin cohortes para este grupo</b></div>';

    return barra + `<div class="kpis ${ids.length === 5 ? 'k5' : 'k4'}">${ids.map(id => kpi(id, { icono: true })).join('')}</div>` + lectura(insTray()) +
      `<div class="grid2">` +
      panel('Evolución de la matrícula', 'tray_mat', slot(el => columnChart(el, { xs: xsMat, legend: legMat, h: 225 })), 'Estudiantes únicos matriculados por año') +
      panel('Composición de la matrícula', 'tray_mat', slot(el => columnChart(el, { xs: xsComp, legend: legComp, ymax: 100, pct: true, sinTotal: true, fmt: v => num(v, 1) + ' %', h: 225 })),
        'Nuevo ingreso, continuidad y reingreso, sobre las matrículas de los periodos del año') +
      `</div><div class="grid2">` +
      panel('Retención estudiantil', 'tray_ret', slot(el => lineChart(el, 'tray_ret', { h: 215 })), 'Por año. Punto hueco: año en curso') +
      panel('Deserción a mitad de la carrera', 'tray_des', slot(el => lineChart(el, 'tray_des', { h: 215 })), 'Por cohorte de ingreso: no continuaban sus estudios en el 5.º semestre de la cohorte') +
      `</div><div class="grid2">` +
      panel('Graduación oportuna por cohorte', 'tray_grad', slot(el => lineChart(el, 'tray_grad', { h: 215 })), 'Cohortes de ingreso con la ventana de graduación cerrada') +
      panel('Retención de primer año por cohorte', 'tray_ret1', slot(el => lineChart(el, 'tray_ret1', { h: 215 })), 'Porcentaje de la cohorte que sigue al año de ingresar') +
      `</div><div class="grid2 wl arriba">` +
      panel('Seguimiento por cohorte de ingreso', 'tray_grad', tCoh, 'Duración: 9 niveles - graduación oportuna = duración + 2 semestres') +
      panel('Titulados por año', 'tray_tit', slot(el => columnChart(el, { xs: xsTit, h: 225 })), trayAdmite('tray_tit', dim) ? '' : 'Sin desglose por tipo de ingreso: muestra a todos') +
      `</div>` + tabla(ids);
  }

  /* ---------------- Vista 1 - Perfil estudiantil sociodemográfico ----------------
     Filtro cruzado: cada clic en una barra, en la pirámide o en el mapa agrega (o quita) un filtro,
     y todo se recalcula con los filtros combinados. Cada gráfico muestra todas sus categorías
     (ignora su propio filtro) y resalta la elegida. */
  const EDADES = ['15-19', '20-24', '25-29', '30 o más'];
  /* Año de referencia: el último con datos hasta el año elegido. */
  const perfAnio = () => { const ys = P_ANIOS.filter(a => a <= anioCorte()); return ys.length ? ys[ys.length - 1] : null; };
  const PROV_ISO = {
    'Azuay': 'EC-A', 'Bolívar': 'EC-B', 'Cañar': 'EC-F', 'Carchi': 'EC-C', 'Chimborazo': 'EC-H', 'Cotopaxi': 'EC-X',
    'El Oro': 'EC-O', 'Esmeraldas': 'EC-E', 'Guayas': 'EC-G', 'Imbabura': 'EC-I', 'Loja': 'EC-L',   // Galápagos no se dibuja: sus casos se citan bajo el mapa
    'Los Ríos': 'EC-R', 'Manabí': 'EC-M', 'Morona Santiago': 'EC-S', 'Napo': 'EC-N', 'Orellana': 'EC-D', 'Pastaza': 'EC-Y',
    'Pichincha': 'EC-P', 'Santa Elena': 'EC-SE', 'Santo Domingo de los Tsáchilas': 'EC-SD', 'Sucumbíos': 'EC-U',
    'Tungurahua': 'EC-T', 'Zamora Chinchipe': 'EC-Z', 'Galápagos': 'EC-W'   // Galápagos: en recuadro (M.insular)
  };

  function insPerfil(a) {
    const out = [], c = st.car;
    if (!P || !a) return out;
    const t = perfContar(a, c, null);
    if (!t.n) return out;
    const p = k => num(pct1(k, t.n), 1) + ' %';
    out.push(`De los ${num(t.n)} estudiantes${deGrupo()} matriculados en ${a}, ${B(p(perfCat(t, 'sexo', 'Mujer')))} son mujeres y ${B(p(perfCat(t, 'sexo', 'Hombre')))} hombres.`);
    out.push(`${B(p(perfCat(t, 'gse', 'BAJO') + perfCat(t, 'gse', 'MEDIO BAJO')))} pertenece a los grupos socioeconómicos bajo o medio bajo.`);
    const prov = P.valores.origen.map((v, i) => [v, t.d.origen[i]]).filter(([v, n]) => n && !['Guayas', 'Exterior', 'No registra'].includes(v)).sort((x, y) => y[1] - x[1]);
    out.push(`${B(p(PERF_NUM.perf_fuera(t)))} procede de una provincia distinta de Guayas o del exterior` +
      (prov.length ? `; la más frecuente es ${esc(prov[0][0])} (${num(prov[0][1])} estudiantes).` : '.'));
    const etn = P.valores.etnia.map((v, i) => [v, t.d.etnia[i]]).filter(([v, n]) => n && !['Mestizo/a', 'No registra'].includes(v)).sort((x, y) => y[1] - x[1]);
    if (etn.length) out.push(`${B(p(PERF_NUM.perf_etn(t)))} se autoidentifica con un pueblo o nacionalidad distinto de mestizo; el grupo más numeroso es ${q(etn[0][0].toLowerCase())} (${num(etn[0][1])}).`);
    return out;
  }

  /* Pirámide: hombres a la izquierda, mujeres a la derecha, por edad de ingreso. Pulsar una barra filtra sexo y edad. */
  function piramide(el, cuenta, cuentaSexo) {
    if (!cuenta || !cuenta.n) { el.innerHTML = '<div class="empty"><b>Ningún estudiante cumple los filtros</b></div>'; return; }
    const W = Math.max(320, el.clientWidth || 560), rowH = 30, mt = 64, H = mt + EDADES.length * rowH + 8, mid = W / 2, lab = 70;
    const half = mid - lab / 2 - 46, vmax = Math.max(1, ...Object.values(cuenta.pir));
    // Porcentaje por género arriba de la pirámide, con una barra 100 % de referencia
    const cs = cuentaSexo || cuenta, selS = st.pc.sexo;
    const nH = perfCat(cs, 'sexo', 'Hombre'), nM = perfCat(cs, 'sexo', 'Mujer'), tS = nH + nM || 1;
    const x0b = 12, wb = W - 24, wH = nH / tS * wb;
    let g = `<text x="${x0b}" y="16" font-size="12.5" font-weight="700" fill="#335f7f">Hombres ${num(pct1(nH, tS), 1)} %<tspan font-weight="400" fill="#6f8596"> - ${num(nH)}</tspan></text>` +
      `<text x="${x0b + wb}" y="16" text-anchor="end" font-size="12.5" font-weight="700" fill="#b86200">Mujeres ${num(pct1(nM, tS), 1)} %<tspan font-weight="400" fill="#6f8596"> - ${num(nM)}</tspan></text>` +
      `<rect x="${x0b}" y="24" width="${Math.max(wH, 0)}" height="10" fill="#335f7f" rx="2" data-pf="sexo:Hombre" class="pir" opacity="${selS && selS !== 'Hombre' ? .4 : 1}" data-tip="${esc('Hombres: ' + num(nH) + ' estudiantes\nClic: ' + (selS === 'Hombre' ? 'quitar el filtro' : 'filtrar por hombres'))}"/>` +
      `<rect x="${x0b + wH}" y="24" width="${Math.max(wb - wH, 0)}" height="10" fill="#f48521" rx="2" data-pf="sexo:Mujer" class="pir" opacity="${selS && selS !== 'Mujer' ? .4 : 1}" data-tip="${esc('Mujeres: ' + num(nM) + ' estudiantes\nClic: ' + (selS === 'Mujer' ? 'quitar el filtro' : 'filtrar por mujeres'))}"/>` +
      `<text x="${mid - lab / 2 - 4}" y="${mt - 8}" text-anchor="end" font-size="11" font-weight="700" fill="#335f7f">Hombres</text>` +
      `<text x="${mid + lab / 2 + 4}" y="${mt - 8}" font-size="11" font-weight="700" fill="#b86200">Mujeres</text>`;
    EDADES.slice().reverse().forEach((e, i) => {
      const y = mt + i * rowH;
      g += `<text x="${mid}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-size="11" fill="#3d5568">${esc(e)}</text>`;
      [['Hombre', -1, '#335f7f'], ['Mujer', 1, '#f48521']].forEach(([s, dir, col]) => {
        const n = cuenta.pir[s + '|' + e] || 0, x0 = mid + dir * lab / 2, w = n / vmax * half;
        const sel = st.pc.sexo === s && st.pc.edad === e, mut = (st.pc.sexo || st.pc.edad) && !sel;
        g += `<rect class="pir" data-pir="${s}|${e}" x="${dir < 0 ? x0 - w : x0}" y="${y + 4}" width="${Math.max(w, 1)}" height="${rowH - 8}" fill="${col}" rx="2" opacity="${mut ? .4 : 1}"` +
          `${sel ? ' stroke="#1c3247" stroke-width="1.5"' : ''} data-tip="${esc(s + 's - ' + e + ' años: ' + num(n) + ' estudiantes\nClic: ' + (sel ? 'quitar el filtro' : 'filtrar por este grupo'))}"/>` +
          `<text x="${x0 + dir * (w + 5)}" y="${y + rowH / 2 + 4}" text-anchor="${dir < 0 ? 'end' : 'start'}" font-size="11" font-weight="700" fill="#1c3247">${num(n)}</text>`;
      });
    });
    const sinDato = (cuenta.pir['Hombre|Sin dato válido'] || 0) + (cuenta.pir['Mujer|Sin dato válido'] || 0);
    el.innerHTML = svgEl(W, H, g) + `<p class="ph-note" style="margin:6px 0 0">Edad al ingresar a la carrera.${sinDato ? ` ${num(sinDato)} sin edad de ingreso válida.` : ''}</p>`;
  }

  /* Mapa de procedencia: provincias coloreadas por número de estudiantes. Pulsar una provincia filtra. */
  /* Mapa de provincias del Ecuador continental, reutilizable (perfil de estudiantes y docentes).
     conteo: { 'Guayas': n, ... }; o.clic: provincias pulsables (filtro cruzado del perfil);
     o.sel: provincia elegida; o.unidad: 'estudiantes' | 'docentes'; o.cortes: tramos de color. */
  function mapaProv(el, conteo, total, o) {
    o = o || {};
    const M = window.FACS_MAPA_EC;
    if (!M) { el.innerHTML = '<div class="empty"><b>Falta el mapa</b>No se cargó data/mapa-ecuador.js.</div>'; return; }
    const porIso = {};
    Object.entries(conteo).forEach(([v, n]) => { if (PROV_ISO[v] && n) porIso[PROV_ISO[v]] = { nom: v, n }; });
    const CORTES = o.cortes || [[500, '#1c3247'], [100, '#335f7f'], [20, '#4597bf'], [5, '#8fbcd8'], [1, '#cfe2ee']];
    const color = n => (CORTES.find(([c]) => n >= c) || [0, '#cfe2ee'])[1];
    const sel = o.sel, uni = o.unidad || 'estudiantes';
    let g = '';
    const trazo = (iso, d, extra) => {
      const x = porIso[iso];
      if (!x) return `<path d="${d}" fill="#eef2f5" stroke="#fff" stroke-width=".6"${extra || ''}/>`;
      const es = sel === x.nom, mut = sel && !es;
      const tip = `${x.nom}: ${num(x.n)} ${x.n === 1 ? uni.replace(/s$/, '') : uni} (${num(pct1(x.n, total), 1)} %)` + (o.clic ? `\nClic: ${es ? 'quitar el filtro' : 'filtrar por esta provincia'}` : '');
      return `<path class="prov${o.clic ? '' : ' fija'}" d="${d}"${o.clic ? ` data-pf="origen:${esc(x.nom)}"` : ''} fill="${color(x.n)}" stroke="${es ? '#fc7e00' : '#fff'}" stroke-width="${es ? 2 : .6}" opacity="${mut ? .45 : 1}" data-tip="${esc(tip)}"${extra || ''}/>`;
    };
    Object.entries(M.prov).forEach(([iso, d]) => { g += trazo(iso, d); });
    // Galápagos: recuadro en la esquina inferior izquierda, a escala reducida (no es su posición real)
    const ins = M.insular;
    if (ins) {
      const [bx, by, bw, bh] = ins.caja;
      g += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#f7f9fb" stroke="#c3cfd8" stroke-width=".8" stroke-dasharray="3 2" rx="3"/>` +
        `<text x="${bx + 3}" y="${by - 3}" font-size="8" fill="#6f8596">Galápagos</text>` +
        trazo(ins.iso, ins.d, ` transform="${ins.transform}" vector-effect="non-scaling-stroke"`);
    }
    const fuera = [ins ? null : 'Galápagos', 'Exterior', 'No registra', 'Otra'].filter(Boolean).map(v => [v, conteo[v] || 0]).filter(([, n]) => n);
    const ley = '<div class="legend">' + CORTES.slice().reverse().map(([c, col], i, arr) =>
      `<span><i class="box" style="background:${col}"></i>${i < arr.length - 1 ? (arr[i + 1][0] - 1 > c ? num(c) + '–' + num(arr[i + 1][0] - 1) : num(c)) : num(c) + ' o más'}</span>`).join('') + '</div>';
    el.innerHTML = ley + `<svg class="chart mapa-ec" viewBox="${M.viewBox}" role="img" aria-label="${esc(uni)} por provincia">${g}</svg>` +
      `<p class="ph-note" style="margin:4px 0 0">${ins ? 'Galápagos en recuadro, a la mitad de escala y fuera de su posición real.' : 'Ecuador continental.'}` +
      `${fuera.length ? ' No se dibujan: ' + fuera.map(([v, n]) => `${v === 'Galápagos' ? v : v.toLowerCase()} ${num(n)}`).join(' - ') + '.' : ''}</p>`;
  }
  function mapaEcuador(el, cuenta) {   // perfil de estudiantes: desde el filtro cruzado
    const conteo = {};
    P.valores.origen.forEach((v, i) => { conteo[v] = (cuenta.d.origen && cuenta.d.origen[i]) || 0; });
    mapaProv(el, conteo, cuenta.n, { clic: true, sel: st.pc.origen, unidad: 'estudiantes' });
  }

  /* Zoom y desplazamiento de un mapa (portado del dashboard FACSECYD anterior): rueda del mouse para
     acercar (centrado en el cursor), arrastrar para mover, doble clic para volver, y botones + / − /
     restablecer para pantallas táctiles. El encuadre se guarda por mapa, así que se conserva cuando
     el mapa se vuelve a dibujar (por ejemplo, al pulsar un país para filtrar). Un arrastre no filtra. */
  const ZOOM = {};
  function activarZoom(svg, clave) {
    const b = svg.getAttribute('viewBox').split(/\s+/).map(Number), base = { x: b[0], y: b[1], w: b[2], h: b[3] };
    let v = ZOOM[clave] || Object.assign({}, base);
    const MIN_W = base.w * 0.08;
    const caja = svg.parentElement.querySelector('.zoom-ctrl');
    const aplicar = () => {
      v.w = Math.min(base.w, Math.max(MIN_W, v.w)); v.h = v.w * base.h / base.w;
      v.x = Math.min(base.x + base.w - v.w, Math.max(base.x, v.x)); v.y = Math.min(base.y + base.h - v.h, Math.max(base.y, v.y));
      svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
      ZOOM[clave] = v;
      if (caja) caja.querySelector('[data-z="0"]').hidden = v.w >= base.w - 0.01;
    };
    const zoomEn = (f, px, py) => {   // px, py: punto fijo en proporción del ancho y alto (0 a 1)
      const mx = v.x + px * v.w, my = v.y + py * v.h;
      v.w *= f; v.h = v.w * base.h / base.w;
      v.x = mx - px * v.w; v.y = my - py * v.h; aplicar();
    };
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomEn(e.deltaY < 0 ? 0.8 : 1.25, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    }, { passive: false });
    let arr = null, movido = false;
    svg.addEventListener('pointerdown', e => { if (e.button === 0) { arr = { x: e.clientX, y: e.clientY, id: e.pointerId }; movido = false; } });
    svg.addEventListener('pointermove', e => {
      if (!arr) return;
      const dx = e.clientX - arr.x, dy = e.clientY - arr.y;
      if (!movido && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!movido) { movido = true; try { svg.setPointerCapture(arr.id); } catch (err) { /* sin captura */ } svg.style.cursor = 'grabbing'; }
      const r = svg.getBoundingClientRect();
      v.x -= dx / r.width * v.w; v.y -= dy / r.height * v.h; arr.x = e.clientX; arr.y = e.clientY;
      aplicar(); tipHide();
    });
    const fin = () => { arr = null; svg.style.cursor = ''; };
    svg.addEventListener('pointerup', fin); svg.addEventListener('pointercancel', fin);
    // Después de arrastrar, el clic no debe filtrar por el país sobre el que se soltó
    svg.addEventListener('click', e => { if (movido) { e.stopPropagation(); e.preventDefault(); movido = false; } }, true);
    svg.addEventListener('dblclick', e => { e.stopPropagation(); v = Object.assign({}, base); aplicar(); });
    if (caja) caja.addEventListener('click', e => {
      const z = e.target.closest('[data-z]'); if (!z) return;
      e.stopPropagation();
      if (z.dataset.z === '0') { v = Object.assign({}, base); aplicar(); } else zoomEn(z.dataset.z === '+' ? 0.67 : 1.5, 0.5, 0.5);
    });
    aplicar();
  }

  /* Mapa mundial de procedencia (tomado del dashboard FACSECYD anterior): países coloreados por
     número de estudiantes, Ecuador aparte. Pulsar un país filtra el perfil; debajo, los países con más
     estudiantes, para los que en el mapa son demasiado pequeños para señalarlos. */
  function mapaMundo(el, cuenta) {
    const M = window.FACS_MAPA_MUNDO;
    if (!M) { el.innerHTML = '<div class="empty"><b>Falta el mapa</b>No se cargó data/mapa-mundo.js.</div>'; return; }
    const ISO = P.paisIso || {}, deIso = {};
    Object.entries(ISO).forEach(([v, iso]) => { deIso[iso] = v; });
    const conteo = {};
    P.valores.pais.forEach((v, i) => { const n = (cuenta.d.pais || [])[i] || 0; if (n) conteo[v] = n; });
    const ext = Object.entries(conteo).filter(([v]) => v !== 'Ecuador' && v !== 'No registra').sort((a, b) => b[1] - a[1]);
    const totExt = ext.reduce((s, [, n]) => s + n, 0);
    const CORTES = [[100, '#1c3247'], [20, '#335f7f'], [5, '#4597bf'], [2, '#8fbcd8'], [1, '#cfe2ee']];
    const color = n => (CORTES.find(([c]) => n >= c) || [0, '#cfe2ee'])[1];
    const sel = st.pc.pais;
    let g = '';
    Object.entries(M.pais).forEach(([iso, d]) => {
      const v = deIso[iso], n = v ? conteo[v] : 0;
      if (!n) { g += `<path d="${d}" fill="#eef2f5" stroke="#fff" stroke-width=".4"/>`; return; }
      const es = sel === v, mut = sel && !es, ecu = v === 'Ecuador';
      const tip = ecu ? `Ecuador: ${num(n)} estudiantes (${num(pct1(n, cuenta.n), 1)} %)`
        : `${v}: ${num(n)} estudiante${n === 1 ? '' : 's'} (${num(pct1(n, totExt), 1)} % de quienes vienen del exterior)`;
      g += `<path class="prov" d="${d}" data-pf="pais:${esc(v)}" fill="${ecu ? '#f48521' : color(n)}" stroke="${es ? '#fc7e00' : '#fff'}" stroke-width="${es ? 1.6 : .4}" opacity="${mut ? .45 : 1}"` +
        ` data-tip="${esc(tip + '\nClic: ' + (es ? 'quitar el filtro' : 'filtrar por este país'))}"/>`;
    });
    const ley = '<div class="legend"><span><i class="box" style="background:#f48521"></i>Ecuador</span>' + CORTES.slice().reverse().map(([c, col], i, arr) =>
      `<span><i class="box" style="background:${col}"></i>${i < arr.length - 1 ? (arr[i + 1][0] - 1 > c ? num(c) + '–' + num(arr[i + 1][0] - 1) : num(c)) : num(c) + ' o más'}</span>`).join('') + '</div>';
    const sinMapa = ext.filter(([v]) => !ISO[v] || !M.pais[ISO[v]]);
    const top = ext.slice(0, 8).map(([v, n]) => ({ a: v, v: pct1(n, totExt), n, pf: 'pais:' + v }));
    el.innerHTML = ley + `<div class="mapa-zoom"><svg class="chart mapa-mundo" viewBox="${M.viewBox}" role="img" aria-label="Estudiantes por país de procedencia">${g}</svg>` +
      `<div class="zoom-ctrl" role="group" aria-label="Zoom del mapa"><button type="button" data-z="+" aria-label="Acercar">+</button>` +
      `<button type="button" data-z="-" aria-label="Alejar">−</button><button type="button" data-z="0" class="zr" hidden>Restablecer</button></div></div>` +
      `<p class="ph-note" style="margin:2px 0 0">Rueda del mouse o botones para acercar; arrastra para mover; doble clic para volver.</p>` +
      `<p class="ph-note" style="margin:4px 0 10px">${totExt ? `${num(totExt)} estudiantes de ${num(ext.length)} países fuera de Ecuador (${num(pct1(totExt, cuenta.n), 1)} % de la matrícula).` : 'Ningún estudiante del exterior con los filtros elegidos.'}` +
      `${sinMapa.length ? ' No se dibujan por su tamaño: ' + sinMapa.map(([v, n]) => `${v} ${num(n)}`).join(', ') + '.' : ''}</p>` +
      (top.length ? '<div class="hsub">Países con más estudiantes (fuera de Ecuador)</div>' +
        hbars(top, { max: Math.max(...top.map(r => r.v)), color: '#335f7f', fmt: v => num(v, 1) + ' %', tip: r => `${r.a}: ${num(r.n)} estudiantes (${num(r.v, 1)} % de quienes vienen del exterior)` }) : '');
    activarZoom(el.querySelector('svg.mapa-mundo'), 'mundo');
  }

  function vPerfil() {
    if (!P) return '<div class="empty"><b>Faltan los datos del perfil</b>No se cargó data/perfil-data.js.</div>';
    perfSeries();
    const c = st.car, a = perfAnio(), ids = ['perf_n', 'perf_edad', 'perf_gse', 'perf_etn', 'perf_disc', 'perf_fuera'];   // género: en su propio gráfico
    const tot = a ? perfContar(a, c, null) : null;
    // Filtros separados (como en las demás pestañas); aquí se combinan entre sí y con los clics
    const selP = ['gse', 'sexo', 'etnia'].map(d => {
      const vals = d === 'gse' ? GSE_ORD.filter(g => P.valores.gse.includes(g)).map(g => [g, GSE_NOM[g]])
        : P.valores[d].map(v => [v, d === 'sexo' ? (v === 'Mujer' ? 'Mujeres' : v === 'Hombre' ? 'Hombres' : v) : v]);
      const cur = d === 'gse' ? st.gse : st.pc[d];
      return `<div class="fld"><label for="fp-${d}">${FILTRO_NOM[d]}</label><select id="fp-${d}" data-pdim="${d}"><option value="">Todos</option>` +
        vals.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('') + '</select></div>';
    }).join('');
    const barra = `<div class="rfbar filtros-est">${selP}<span>Los filtros se combinan entre sí y con los clics en las barras, la pirámide o el mapa ` +
      `(por ejemplo, mujeres + montubio/a + Los Ríos).${st.niv ? ' El nivel de la carrera no aplica al perfil: se muestran todos.' : ''}</span></div>`;

    // Distribución de una dimensión, sin su propio filtro, con la categoría elegida resaltada
    const dist = (dim, o) => {
      o = o || {};
      if (!a) return '<div class="empty"><b>Sin datos hasta este año</b></div>';
      const cu = perfContar(a, c, dim);
      if (!cu.n) return '<div class="empty"><b>Ningún estudiante cumple los filtros</b></div>';
      let rows = P.valores[dim].map((v, i) => ({ v0: v, n: cu.d[dim][i] })).filter(r => r.n > 0).map(r => {
        const x = { a: dim === 'gse' ? (GSE_NOM[r.v0] || r.v0) : dim === 'sexo' ? ({ Mujer: 'Mujeres', Hombre: 'Hombres' }[r.v0] || r.v0) : r.v0, v: pct1(r.n, cu.n), n: r.n };
        if (dim === 'sexo') x.color = r.v0 === 'Mujer' ? '#f48521' : '#335f7f';
        if (dim === 'gse') x.gse = r.v0; else x.pf = dim + ':' + r.v0;
        return x;
      });
      rows = o.orden ? rows.sort((x, y) => o.orden.indexOf(x.a) - o.orden.indexOf(y.a)) : rows.sort((x, y) => y.n - x.n);
      if (o.top && rows.length > o.top) rows = rows.slice(0, o.top);
      return hbars(rows, { max: o.max || 100, color: o.color || COL[c], fmt: v => num(v, 1) + ' %',
        tip: r => `${r.a}: ${num(r.n)} estudiantes (${num(r.v, 1)} %)` + (o.detalle ? o.detalle(r, cu) : '') });
    };
    const notaY = a ? `${a}${a === D.anioActual ? ' (año en curso)' : ''} - porcentaje de estudiantes - pulsa para filtrar` : '';

    // Matrícula por sexo y año, con los filtros activos
    const xsSex = P_ANIOS.filter(x => x <= anioCorte()).map(x => {
      const cu = perfContar(x, c, 'sexo');
      return { p: String(x), l: String(x), a: x, parcial: x === D.anioActual,
        segs: [{ k: 'Mujeres', v: perfCat(cu, 'sexo', 'Mujer'), color: '#f48521' }, { k: 'Hombres', v: perfCat(cu, 'sexo', 'Hombre'), color: '#335f7f' }] };
    }).filter(x => x.segs[0].v + x.segs[1].v > 0);
    const legSex = '<div class="legend"><span><i class="box" style="background:#f48521"></i>Mujeres</span><span><i class="box" style="background:#335f7f"></i>Hombres</span></div>';
    const etnMax = a ? (() => { const cu = perfContar(a, c, 'etnia'); return Math.max(20, ...P.valores.etnia.map((v, i) => v === 'Mestizo/a' ? 0 : pct1(cu.d.etnia[i], cu.n) || 0)); })() : 100;

    return barra + `<div class="kpis k3">${ids.map(id => kpi(id, { icono: true })).join('')}</div>` + lectura(insPerfil(a)) +
      `<div class="grid2 arriba">` +
      panel('Estructura por sexo y edad de ingreso', 'perf_muj', slot(el => piramide(el, a ? perfContar(a, c, null) : null, a ? perfContar(a, c, 'sexo') : null)),
        a ? `${a} - arriba, el porcentaje por género; abajo, estudiantes por edad de ingreso - pulsa para filtrar` : '') +
      panel('Matrícula por sexo', 'perf_muj', slot(el => columnChart(el, { xs: xsSex, legend: legSex, h: 235 })), 'Estudiantes matriculados por año, con los filtros activos') +
      `</div><div class="grid2 arriba">` +
      panel('Procedencia por provincia', 'perf_fuera', slot(el => mapaEcuador(el, a ? perfContar(a, c, 'origen') : { n: 0, d: { origen: [] } })), a ? `${a} - provincia de procedencia registrada - pasa el mouse para ver el número y pulsa para filtrar` : '') +
      panel('Procedencia por país', 'perf_fuera', slot(el => mapaMundo(el, a ? perfContar(a, c, 'pais') : { n: 0, d: { pais: [] } })), a ? `${a} - país de procedencia registrado - pasa el mouse para ver el número y pulsa para filtrar` : '') +
      `</div><div class="grid3 arriba">` +
      panel('Autoidentificación étnica', 'perf_etn', dist('etnia', { max: etnMax }), notaY + ' - escala ampliada para ver los grupos pequeños') +
      panel('Edad de ingreso a la carrera', 'perf_edad', dist('edad', { orden: EDADES.concat('Sin dato válido'), color: '#4597bf' }), notaY) +
      `<div>` +
      panel('Discapacidad', 'perf_disc', dist('disc', { color: '#335f7f', detalle: (r, cu) => {
        if (r.a !== 'Con discapacidad' || !cu.d.disct) return '';
        const tipos = P.valores.disct.map((v, i) => [v, cu.d.disct[i]]).filter(([v, n]) => n && v !== 'Sin discapacidad').sort((x, y) => y[1] - x[1]);
        return tipos.length ? '\nPor tipo:\n' + tipos.map(([v, n]) => `· ${v}: ${num(n)}`).join('\n') : '';
      } }), notaY + ' - pasa el mouse sobre «Con discapacidad» para ver los tipos') +
      panel('Nivel socioeconómico', 'perf_gse', dist('gse', { orden: ['Bajo', 'Medio bajo', 'Medio típico', 'Medio alto', 'Alto'] }), notaY) +
      `</div></div>` + tabla(ids);
  }

  /* ---------------- Vista 1 - Estudiantes: cuatro pestañas ---------------- */
  function vEst() {
    const tabs = [['tray', 'Trayectoria'], ['perfil', 'Perfil sociodemográfico'], ['rend', 'Rendimiento académico'], ['grad', 'Seguimiento a graduados']].map(([k, l]) =>
      `<button type="button" role="tab" class="tab ${st.sub === k ? 'on' : ''}" aria-selected="${st.sub === k}" data-sub="${k}">${l}</button>`).join('');
    const priv = st.sub === 'perfil'
      ? `<p class="priv"><b>Protección de datos:</b> el perfil publica conteos agregados por combinación de características, sin nombres ni identificadores. Por decisión de la Dirección no aplica un mínimo de casos: con varios filtros combinados los grupos pueden ser muy pequeños; esas cifras no deben difundirse fuera del uso institucional.</p>`
      : MIN_BASE || K_ANON ? `<p class="priv"><b>Protección de datos:</b> el tablero solo publica cifras agregadas. ` +
        `Los grupos con menos de ${MIN_BASE} personas no se muestran ` +
        `y las categorías con menos de ${K_ANON} casos se agrupan en «Otras categorías (pocos casos)».</p>` : '';
    return `<div class="tabs" role="tablist">${tabs}</div>` +
      (st.sub === 'grad' ? vGrad() : st.sub === 'rend' ? vRend() : st.sub === 'perfil' ? vPerfil() : vTray()) + priv;
  }

  /* ---------------- Vista 3 - Cuerpo docente ---------------- */
  /* Detalle del último año con datos hasta el año elegido. */
  function docDet(car) {
    const an = (DOC && DOC.det[car]) || {}, ys = Object.keys(an).filter(y => +y <= anioCorte()).sort();
    return ys.length ? { y: ys[ys.length - 1], d: an[ys[ys.length - 1]] } : null;
  }
  function insDoc() {
    const out = [], c = st.car;
    if (!DOC) return out;
    const n = medir('doc_n', c).cur, phd = medir('doc_phd', c).cur, pg = medir('doc_cuarto', c).cur;
    if (n && phd) out.push(`La carrera contó con ${B(num(n.v) + ' docentes')} en ${n.a}${n.parcial ? ' (solo 1S 2026)' : ''}; ${B(fmt('doc_phd', phd.v))} tiene doctorado` +
      (pg ? ` y ${B(fmt('doc_cuarto', pg.v))} tiene algún posgrado (PhD, maestría o especialidad).` : '.'));
    const e = medir('doc_eval', c);
    if (e.cur) out.push(`${B(fmt('doc_eval', e.cur.v))} de los docentes evaluados obtiene 4,0 o más de 5` +
      (e.cur.a >= 2025 ? '; desde 2025 la escala de la evaluación cambió y los resultados no son comparables con años anteriores.' : '.'));
    const k = medir('doc_cap', c).cur;
    if (k) out.push(`${B(fmt('doc_cap', k.v))} registra al menos un curso de capacitación en los últimos 12 meses.`);
    return out;
  }
  function vDocentes() {
    if (!DOC) return '<div class="empty"><b>Faltan los datos de docentes</b>No se cargó data/docentes-data.js.</div>';
    const c = st.car, dd = docDet(c), d = dd && dd.d, y = dd && dd.y;
    const ids = ['doc_n', 'doc_tc', 'doc_cuarto', 'doc_phd', 'doc_maest', 'doc_eval', 'doc_cap', 'sat_doc'];
    const notaY = y ? `${y}${+y === DOC.anioParcial ? ' (año en curso: 1S 2026)' : ''}` : '';
    const barras = (filas, o) => {
      o = o || {};
      if (!filas || !filas.length) return '<div class="empty"><b>Sin datos para este año</b></div>';
      const tot = filas.reduce((s, [, n]) => s + n, 0);
      return hbars(filas.map(([a, n]) => ({ a, v: pct1(n, tot), n })), { max: 100, color: o.color || COL[c], fmt: v => num(v, 1) + ' %',
        tip: r => `${r.a}: ${num(r.n)} docente${r.n === 1 ? '' : 's'} (${num(r.v, 1)} %)` + (o.detalle ? o.detalle(r) : '') });
    };
    // Nivel académico por año (100 %)
    const NIV = [['PhD', '#1c3247'], ['Maestría', '#335f7f'], ['Especialidad', '#4597bf'], ['Diplomado u otro posgrado sin grado', '#a9cde2'], ['Tercer nivel', '#f48521'], ['Sin registro', '#d5dde3']];
    const xsNiv = Object.keys(DOC.det[c] || {}).filter(a => +a <= anioCorte()).sort().map(a => {
      const f = new Map(DOC.det[c][a].nivel), t = DOC.det[c][a].nivel.reduce((s, [, n]) => s + n, 0);
      return { p: a, l: a, a: +a, parcial: +a === DOC.anioParcial, nota: `${num(t)} docentes`, segs: NIV.map(([k, col]) => ({ k, v: f.get(k) ? f.get(k) / t * 100 : 0, color: col })) };
    });
    const legNiv = '<div class="legend">' + NIV.map(([k, col]) => `<span><i class="box" style="background:${col}"></i>${esc(k)}</span>`).join('') + '</div>';
    // Evaluación por componente (escala 1 a 5)
    const ev = d && d.eval;
    const evRows = ev ? [['Resultado total', ev.total], ['Heteroevaluación (estudiantes)', ev.hetero], ['Autoevaluación', ev.auto], ['Evaluación de pares', ev.par], ['Evaluación del directivo', ev.directivo]]
      .filter(([, v]) => v != null).map(([a, v]) => ({ a, v })) : [];
    const evHTML = evRows.length ? hbars(evRows, { max: 5, color: '#335f7f', fmt: v => num(v, 2), ref: DOC.umbralEval, tip: r => `${r.a}: ${num(r.v, 2)} de 5` })
      : `<div class="empty"><b>Sin datos publicables</b>Se necesitan al menos ${DOC.minBase} docentes evaluados.</div>`;
    const cap = d && d.cap;
    const capRows = cap ? [['Al menos un curso pedagógico', cap.ped], ['Al menos un curso científico', cap.cien]].map(([a, n]) => ({ a, v: pct1(n, cap.n), n })) : [];

    return `<div class="kpis k4">${ids.map(id => kpi(id, { icono: true })).join('')}</div>` + lectura(insDoc()) +
      `<div class="grid2">` +
      panel('Evolución de la planta docente', 'doc_n', slot(el => lineChart(el, 'doc_n', { h: 225 })), 'Docentes únicos por año - punto hueco: año en curso') +
      panel('Nivel académico', 'doc_cuarto', slot(el => columnChart(el, { xs: xsNiv, legend: legNiv, ymax: 100, pct: true, sinTotal: true, fmt: v => num(v, 1) + ' %', h: 225 })), 'Título más alto verificado en el SGA, por año') +
      `</div><div class="grid3">` +
      panel('Docentes con grado doctoral', 'doc_phd', slot(el => lineChart(el, 'doc_phd', { h: 200 })), 'Porcentaje con PhD') +
      panel('Evaluación docente satisfactoria', 'doc_eval', slot(el => lineChart(el, 'doc_eval', { h: 200 })), 'Resultado ≥ 4,0 de 5 - <b>desde 2025 cambia la escala</b>') +
      panel('Participación en capacitación', 'doc_cap', slot(el => lineChart(el, 'doc_cap', { h: 200 })), 'Al menos un curso en los últimos 12 meses') +
      `</div><div class="grid2 arriba">` +
      panel('Evaluación de desempeño docente por componente', 'doc_eval', evHTML,
        `${notaY} - promedio de 1 a 5; la línea vertical marca el umbral ${num(DOC.umbralEval, 1)}`) +
      `<div>` +
      panel('Dedicación', 'doc_tc', barras(d && d.dedicacion), notaY) +
      panel('Tipo de capacitación', 'doc_cap', capRows.length ? hbars(capRows, { max: 100, color: '#4597bf', fmt: v => num(v, 1) + ' %', tip: r => `${r.a}: ${num(r.n)} docentes` }) +
        (cap.horas != null ? `<p class="ph-note" style="margin:8px 0 0">Los docentes capacitados suman en promedio ${num(cap.horas, 1)} horas en 12 meses.</p>` : '') : '<div class="empty"><b>Sin datos para este año</b></div>',
        `${notaY} - porcentaje de docentes con al menos un curso de cada tipo en los últimos 12 meses`) +
      `</div></div><div class="hsub" style="margin:4px 0 8px">Perfil demográfico del cuerpo docente</div><div class="grid2 arriba">` +
      panel('Procedencia por provincia', 'doc_n', slot(el => {
        const filas = (d && d.provincia) || [], conteo = {}, tot = filas.reduce((s, [, n]) => s + n, 0);
        filas.forEach(([p, n]) => { conteo[p] = n; });
        mapaProv(el, conteo, tot, { unidad: 'docentes', cortes: [[50, '#1c3247'], [10, '#335f7f'], [4, '#4597bf'], [2, '#8fbcd8'], [1, '#cfe2ee']] });
      }), `${notaY} - provincia registrada del docente en el SGA - pasa el mouse para ver el número`) +
      `<div>` +
      panel('Sexo', 'doc_n', barras(d && d.sexo, { color: '#f48521' }), notaY) +
      panel('Edad', 'doc_n', barras(d && d.edad, { color: '#4597bf' }), notaY) +
      `</div></div><div class="grid2 arriba">` +
      panel('Autoidentificación étnica', 'doc_n', barras(d && d.etnia, { color: '#335f7f' }), notaY + ` - categorías con menos de ${DOC.kAnon} docentes agrupadas`) +
      panel('Discapacidad', 'doc_n', barras(d && d.disc, { color: '#335f7f', detalle: r => r.a === 'Con discapacidad' && d.disc_tipo && d.disc_tipo.length
        ? '\nPor tipo:\n' + d.disc_tipo.map(([t, n]) => `· ${t}: ${num(n)}`).join('\n') : '' }), notaY + ' - pasa el mouse sobre «Con discapacidad» para ver los tipos') +
      `</div>` + tabla(['doc_n', 'doc_tc', 'doc_cuarto', 'doc_phd', 'doc_maest', 'doc_evalcob', 'doc_eval', 'doc_cap', 'doc_carga']);
  }

  /* ---------------- Vista 2 - Grupos de interés ---------------- */
  function insGrupos() {
    const out = [], c = st.car;
    const se = medir('sat_est', c);
    if (se.cur) {
      let s = `La satisfacción de los estudiantes${deGrupo()} es ${B(fmt('sat_est', se.cur.v))} en ${esc(se.cur.l)}`;
      if (se.prev) {
        const t = tendencia('sat_est', se.cur, se.prev);
        s += t.dir ? `, ${t.dir > 0 ? 'sube' : 'baja'} ${B(num(Math.abs(t.d), 1) + ' pp')} frente a ${esc(se.prev.l)}` : `, estable frente a ${esc(se.prev.l)}`;
      }
      if (se.prev && se.prev.glob) s += ' (esa medición fue general, con otro cuestionario, así que la comparación es solo referencial)';
      out.push(s + '.');
      const det = ultimoDet(detDe('sat_est', c));
      if (det && det.rows.length > 1) {
        const lo = det.rows[det.rows.length - 1], hi = det.rows[0];
        out.push(`Lo mejor valorado por los estudiantes: ${q(hi.a)} (${num(hi.v, 1)} %). Lo que más pide atención: ${q(lo.a)} (${num(lo.v, 1)} %).`);
      }
    }
    const sg = medir('sat_grad', c);
    if (sg.cur) out.push(`${B(fmt('sat_grad', sg.cur.v))} de los graduados consultados en ${esc(sg.cur.l)} se declara satisfecho con los estudios realizados` +
      (sg.cur.n < 10 ? ` (solo ${num(sg.cur.n)} ${sg.cur.n === 1 ? 'graduado ha respondido' : 'graduados han respondido'} en ${esc(sg.cur.l)}; con tan pocas respuestas, una sola persona cambia el resultado en ${num(100 / sg.cur.n)} puntos)` : '') + '.');
    const sd = medir('sat_doc', c), dd = ultimoDet(D.det.sat_doc[c]);
    if (sd.cur && dd && dd.rows.length > 1) {
      const lo = dd.rows[dd.rows.length - 1];
      out.push(`Los docentes muestran ${B(fmt('sat_doc', sd.cur.v))} de satisfacción; el punto más bajo es ${q(lo.a)} (${num(lo.v, 1)} %).`);
    }
    return out;
  }
  let grupoDet = 'est';
  function vGrupos() {
    const c = st.car, ids = ['sat_est', 'sat_grad', 'sat_doc'];
    let det = '';
    if (grupoDet === 'est') {
      const d = ultimoDet(detDe('sat_est', c)), cur = medir('sat_est', c).cur;
      det = d ? `<p class="ph-note">${esc(lblDe(d.k))}${d.prevK ? ' - la flecha compara con ' + esc(lblDe(d.prevK)) : ''}. La línea vertical marca el resultado global.</p>` +
        hbars(d.rows, { max: 100, prev: d.prev && mapa(d.prev), ref: cur && cur.v, tip: r => `${r.a}\n${num(r.v, 1)} % de valoraciones de 4 o 5 - promedio ${num(r.media, 2)} de 5\n${num(r.n)} respuestas` }) : '<div class="empty"><b>Sin detalle por aspecto hasta ' + st.anio + '</b>La primera medición por aspecto es de agosto – diciembre 2025.</div>';
    } else if (grupoDet === 'grad') {
      const d = ultimoDet(D.det.sat_grad[c]);
      det = d ? `<p class="ph-note">Graduados consultados en ${esc(d.k)} - ${num(d.rows[0].n)} respuestas${d.rows[0].n < 10 ? ' (base pequeña)' : ''}. Escala de 1 a 7: se cuenta como satisfecho de 5 a 7.</p>` +
        '<div class="hsub">La formación</div>' + hbars(d.rows.filter(r => r.g === 'formacion'), { max: 100, tip: r => `${r.a}\n${num(r.v, 1)} % satisfechos - promedio ${num(r.media, 2)} de 7` }) +
        '<div class="hsub">El personal y los recursos de la universidad</div>' + hbars(d.rows.filter(r => r.g === 'recursos'), { max: 100, tip: r => `${r.a}\n${num(r.v, 1)} % satisfechos - promedio ${num(r.media, 2)} de 7` }) : '<div class="empty"><b>Sin encuestas a graduados hasta ' + st.anio + '</b></div>';
    } else {
      const d = ultimoDet(D.det.sat_doc[c]), cur = medir('sat_doc', c).cur;
      det = d ? `<p class="ph-note">${esc(lblDe(d.k))} - ${num(cur.n)} docentes. La línea vertical marca el resultado global.</p>` +
        hbars(d.rows, { max: 100, ref: cur && cur.v, tip: r => `${r.a}\n${num(r.v, 1)} % de valoraciones de 4 o 5 - promedio ${num(r.media, 2)} de 5` }) : '<div class="empty"><b>Sin encuesta docente hasta ' + st.anio + '</b>La primera medición es de abril – julio 2026.</div>';
    }
    const seg = [['est', 'Estudiantes'], ['grad', 'Graduados'], ['doc', 'Docentes']].map(([k, l]) => `<button type="button" class="segbtn ${grupoDet === k ? 'on' : ''}" data-grupo="${k}">${l}</button>`).join('');
    const notaEst = serie('sat_est', c).some(p => p.glob && p.a <= st.anio) ? 'El primer punto (abril – julio 2025) es una medición general, sin detalle por aspecto.' : '';
    return `<div class="kpis">${ids.map(id => kpi(id)).join('')}</div>` + lectura(insGrupos()) +
      `<div class="grid3">` +
      panel('Estudiantes', 'sat_est', slot(el => lineChart(el, 'sat_est', { h: 230 })), notaEst || 'Valoraciones de 4 o 5, por semestre') +
      panel('Graduados', 'sat_grad', slot(el => lineChart(el, 'sat_grad', { h: 230 })), 'Satisfechos con sus estudios, por año de encuesta. Punto hueco: menos de 10 respuestas') +
      panel('Docentes', 'sat_doc', slot(el => lineChart(el, 'sat_doc', { h: 230 })), 'Valoraciones de 4 o 5. Hasta hoy existe una sola medición') +
      `</div><div class="grid2 wl arriba"><div class="panel"><div class="ph"><h3>¿Qué se valora y qué no?</h3><span style="flex:1"></span><div class="segbtns">${seg}</div></div>${det}</div>` +
      panelGse() + `</div>` + tabla(ids);
  }

  function panelGse() {
    const cur = medir('sat_est', st.car).cur, d = cur && (D.det.sat_gse[st.car] || {})[cur.p];
    const rows = d ? GSE_ORD.filter(g => d[g]).map(g => ({ a: GSE_NOM[g], gse: g, v: d[g].v, n: d[g].n })) : [];
    return panel('Satisfacción estudiantil por nivel socioeconómico', 'sat_est',
      hbars(rows, { max: 100, color: COL[st.car], tip: r => `Nivel ${GSE_NOM[r.gse].toLowerCase()}: ${num(r.v, 1)} % de valoraciones de 4 o 5\n${num(r.n)} estudiantes encuestados` }),
      cur ? `${esc(cur.l)} - pulsa un nivel para filtrar el tablero` : '');
  }

  /* ---------------- Vista 4 - Investigación ---------------- */
  function insInvest() {
    const out = [], c = st.car, s = serie('pub_total', c).filter(p => p.a <= st.anio);
    const full = s.filter(p => !p.parcial), ref = full[full.length - 1];
    if (ref) {
      const base = full.find(p => p.a === ref.a - 2);
      if (base && base.v > 0 && ref.v / base.v >= 1.5) out.push(`En ${ref.a} se publicaron ${B(num(ref.v) + ' artículos')}, ${B(num(ref.v / base.v, 1).replace(',0', '') + ' veces')} los de ${base.a} (${num(base.v)}).`);
      else out.push(`En ${ref.a} se publicaron ${B(num(ref.v) + ' artículos')}${base ? ` (${num(base.v)} en ${base.a})` : ''}.`);
    }
    const dp = medir('doc_prod', c).cur;
    if (dp) out.push(`${B(num(dp.v / 10, 1).replace(',0', '') + ' de cada 10')} docentes de la carrera publicaron al menos un artículo en ${esc(dp.l.replace(' (parcial)', ''))}${dp.parcial ? ', con el año todavía en curso' : ''}.`);
    const pa = medir('pub_alto', c).cur;
    if (pa) out.push(pa.v < 50 ? `Solo ${B(fmt('pub_alto', pa.v))} de los artículos llega a revistas de impacto mundial (Scopus o Web of Science); el resto se publica en revistas regionales.`
      : `${B(fmt('pub_alto', pa.v))} de los artículos se publica en revistas de impacto mundial (Scopus o Web of Science).`);
    const pe = medir('pub_est', c);
    if (pe.cur && pe.prev) out.push(`La coautoría con estudiantes ${pe.cur.v >= pe.prev.v ? 'crece' : 'cae'} a ${B(fmt('pub_est', pe.cur.v))} de los artículos (${fmt('pub_est', pe.prev.v)} en ${esc(pe.prev.l.replace(' (parcial)', ''))}).`);
    return out;
  }
  let cuTodos = true;
  function vInvest() {
    const c = st.car, ids = ['pub_total', 'doc_prod', 'pub_alto', 'pub_q12', 'pub_est'];
    const NIV = [['Científico (Scopus / WoS)', '#1c3247'], ['Regional (Latindex)', '#4597bf'], ['Divulgativo y memorias', '#f7964d']];
    const xs = serie('pub_total', c).filter(p => p.a <= st.anio).map(p => ({ p: p.p, l: p.l, a: p.a, parcial: p.parcial,
      segs: NIV.map(([k, col]) => ({ k, v: (D.det.pub_nivel[c][p.p] || {})[k] || 0, color: col })) }));
    const leg = '<div class="legend">' + NIV.map(([k, col]) => `<span><i class="box" style="background:${col}"></i>${esc(k)}</span>`).join('') + '</div>';
    // Los artículos se suman entre años (cada uno cuenta en un solo año): «Hasta» acumula, «Solo» muestra el último año.
    const cuKs = Object.keys(D.det.pub_cuartil[c] || {}).filter(dentroP).sort();
    const cuSel = cuTodos ? cuKs : cuKs.slice(-1), cuUlt = cuKs[cuKs.length - 1];
    const sumaAnios = id => serie(id, c).filter(p => cuSel.includes(p.p)).reduce((s, p) => s + (p.v || 0), 0);
    const cuQ = q => cuSel.reduce((s, k) => s + (D.det.pub_cuartil[c][k][q] || 0), 0);
    const cuRows = cuSel.length ? ['Q1', 'Q2', 'Q3', 'Q4'].map((k, i) => ({ a: k + (i === 0 ? ' - mayor impacto' : i === 3 ? ' - menor impacto' : ''), v: cuQ(k), color: ['#1c3247', '#335f7f', '#3c7aa0', '#4597bf'][i] })) : [];
    const cuTot = cuRows.reduce((s, r) => s + r.v, 0), artTot = sumaAnios('pub_total'), proyTot = sumaAnios('pub_proy');
    const enCurso = cuUlt == D.anioActual ? (cuSel.length > 1 ? ` (${cuUlt} en curso)` : ' (en curso)') : '';
    const cuRango = cuSel.length > 1 ? `${cuSel[0]} – ${cuUlt}` : cuUlt;
    const cuSeg = `<div class="segbtns"><button type="button" class="segbtn ${cuTodos ? 'on' : ''}" data-cu="1">Hasta ${cuUlt}</button><button type="button" class="segbtn ${!cuTodos ? 'on' : ''}" data-cu="0">Solo ${cuUlt}</button></div>`;
    return `<div class="kpis">${ids.map(id => kpi(id)).join('')}</div>` + lectura(insInvest()) +
      `<div class="grid2 wl">` +
      panel('Artículos publicados por año y nivel de la revista', 'pub_total', slot(el => columnChart(el, { xs, legend: leg })), 'Artículos únicos, aprobados por la universidad') +
      panel('Docentes que publican', 'doc_prod', slot(el => lineChart(el, 'doc_prod', { h: 235 })), 'Porcentaje de la planta docente del año con al menos un artículo') +
      `</div><div class="grid3">` +
      panel('Revistas de impacto mundial', 'pub_alto', slot(el => lineChart(el, 'pub_alto', { h: 200 })), 'Porcentaje de artículos en Scopus o Web of Science') +
      panel('Coautoría con estudiantes', 'pub_est', slot(el => lineChart(el, 'pub_est', { h: 200 })), 'Porcentaje de artículos con al menos un estudiante coautor') +
      (cuSel.length ? `<div class="panel"><div class="ph"><h3>Cuartil de las revistas indexadas</h3>${info('pub_q12')}<span style="flex:1"></span>${cuSeg}</div>` +
        `<p class="ph-note">Solo los artículos con cuartil asignado - ${cuSel.length > 1 ? 'años' : 'año'} ${esc(cuRango)}${enCurso}</p>` +
        hbars(cuRows, { fmt: v => num(v) + ' art.', tip: r => `${r.a}: ${num(r.v)} artículos en ${cuRango}` }) +
        `<p class="ph-note" style="margin:12px 0 0">${B(num(artTot))} artículos publicados${cuSel.length > 1 ? ` entre ${cuSel[0]} y ${cuUlt}` : ` en ${cuUlt}`}; ${B(num(cuTot))} en revistas con cuartil.` +
        `${proyTot ? ` ${num(proyTot)} provienen de proyectos de investigación.` : ''}</p></div>`
        : panel('Cuartil de las revistas indexadas', 'pub_q12', '', 'Solo los artículos con cuartil asignado')) +
      `</div>` + tabla(ids.concat('pub_proy'));
  }

  /* ---------------- Vista 5 - Vinculación ---------------- */
  function insVinc() {
    const out = [], c = st.car;
    const p = medir('vin_proy', c).cur, b = medir('vin_benef', c).cur, a = medir('vin_avance', c).cur, u = medir('vin_culm', c).cur;
    if (p) out.push(`En ${esc(p.l.replace(' (parcial)', ''))}${p.parcial ? ', con el año todavía en curso,' : ''} se ejecutaron ${B(num(p.v) + ' proyectos')} de vinculación` + (b ? `; los que iniciaron ese año se propusieron atender a ${B(num(b.v) + ' personas')} de forma directa.` : '.'));
    if (a) out.push(`Los proyectos que terminaron reportan, en promedio, ${B(fmt('vin_avance', a.v))} de avance sobre lo que planificaron (${esc(baseTxt('vin_avance', a))}, iniciados en ${esc(a.l)}).`);
    if (u) out.push(`${B(fmt('vin_culm', u.v))} de los estudiantes que cerraron su participación la culminó.`);
    return out;
  }
  let vinTodos = true;
  function vVinc() {
    const c = st.car, ids = ['vin_proy', 'vin_benef', 'vin_avance', 'vin_culm'];
    const xsP = serie('vin_proy', c).filter(p => p.a <= st.anio && p.a >= 2021).map(p => ({ p: p.p, l: p.l, a: p.a, segs: [{ k: 'Proyectos', v: p.v, color: COL[c] }] }));
    const xsB = serie('vin_benef', c).filter(p => p.a <= st.anio && p.a >= 2021).map(p => ({ p: p.p, l: p.l, a: p.a, segs: [{ k: 'Beneficiarios previstos', v: p.v, color: COL[c] }] }));
    const filas = (D.det.vin_proyectos[c] || []).filter(f => f.a <= st.anio && (vinTodos || f.f >= st.anio));
    const carN = s => s.split('+').map(k => CORTO[k] || k).join(', ');   // un proyecto compartido lista sus carreras
    const conCar = esAgregado(c);
    const tablaP = filas.length ? `<div class="tbl-wrap" style="max-height:420px;overflow-y:auto"><table class="res"><thead><tr><th>Proyecto</th>${conCar ? '<th>Carrera</th>' : ''}<th class="n">Inicio</th><th>Estado</th><th>Avance reportado</th><th class="n">Beneficiarios previstos</th><th class="n">Estudiantes</th></tr></thead><tbody>` +
      filas.map(f => `<tr class="${f.a <= st.anio && f.f >= st.anio ? 'hl' : ''}"><td style="min-width:260px">${esc(f.nom)}</td>${conCar ? `<td class="per">${esc(carN(f.car))}</td>` : ''}<td class="n">${f.a}</td>` +
        `<td><span class="pill ${/ejecuci/i.test(f.estado) ? 'ej' : 'fin'}">${/ejecuci/i.test(f.estado) ? 'En ejecución' : esc(f.estado)}</span></td>` +
        `<td>${f.av == null ? '<span class="per">Sin informe aprobado</span>' : `<span class="mini-bar"><i style="width:${f.av}%"></i></span>${num(f.av, 0)} %`}</td>` +
        `<td class="n">${num(f.ben)}</td><td class="n">${num(f.est)}</td></tr>`).join('') + '</tbody></table></div>'
      : `<div class="empty"><b>No hay proyectos ejecutados en ${st.anio}</b></div>`;
    const seg = `<div class="segbtns"><button type="button" class="segbtn ${vinTodos ? 'on' : ''}" data-vin="1">Hasta ${st.anio}</button><button type="button" class="segbtn ${!vinTodos ? 'on' : ''}" data-vin="0">Solo ${st.anio}</button></div>`;
    return `<div class="kpis">${ids.map(id => kpi(id)).join('')}</div>` + lectura(insVinc()) +
      `<div class="grid2">` +
      panel('Proyectos ejecutados por año', 'vin_proy', slot(el => columnChart(el, { xs: xsP, h: 205 }))) +
      panel('Beneficiarios directos previstos', 'vin_benef', slot(el => columnChart(el, { xs: xsB, h: 205 }))) +
      `</div><div class="panel"><div class="ph"><h3>Proyectos de vinculación</h3><span style="flex:1"></span>${seg}</div>` +
      `<p class="ph-note">${num(filas.length)} proyectos. Se resaltan los que estuvieron en ejecución en ${st.anio}. El avance es el que el propio proyecto reporta en sus informes aprobados, frente a lo que planificó.</p>${tablaP}</div>` +
      tabla(ids.concat('vin_est'));
  }

  /* ---------------- Vista 6 - Servicios de apoyo ---------------- */
  function insApoyo() {
    const out = [], c = st.car;
    const bc = medir('beca_cob', c).cur, g = ultimoDet(D.det.beca_gse[c], k => bc && k === bc.p);
    if (bc && g && g.rows.BAJO && !dimAct()) {
      const v = g.rows.BAJO.v;
      out.push(`Las becas llegan al ${B(num(v, 1) + ' %')} de los estudiantes de nivel socioeconómico bajo: ${B(num(Math.round(10 - v / 10)) + ' de cada 10')} no recibe ayuda (${esc(bc.l)}).`);
    } else if (bc) out.push(`${B(fmt('beca_cob', bc.v))} de los estudiantes${deGrupo()} recibe una beca o ayuda en ${esc(bc.l)}.`);
    const tc = medir('tut_cob', c);
    if (tc.cur) out.push(`${B(fmt('tut_cob', tc.cur.v))} de los matriculados${deGrupo()} asistió al menos a una tutoría en ${esc(tc.cur.l)}` +
      (tc.prev ? ` (${fmt('tut_cob', tc.prev.v)} el semestre anterior).` : '.'));
    const ex = extremos('tut_cob', c, 10);
    if (ex && ex.hi.v - ex.lo.v >= 10) out.push(`La cobertura de tutorías es desigual entre carreras: ${B(NOM[ex.hi.k] + ' ' + fmt('tut_cob', ex.hi.v))} frente a ${B(NOM[ex.lo.k] + ' ' + fmt('tut_cob', ex.lo.v))}.`);
    const te = medir('tut_ejec', c);
    if (te.cur && te.pts.length > 2) {
      const mx = te.pts.reduce((a, b) => b.v > a.v ? b : a);
      if (mx.v - te.cur.v >= 8) out.push(`Se realiza el ${B(fmt('tut_ejec', te.cur.v))} de las tutorías agendadas, frente al ${fmt('tut_ejec', mx.v)} de ${esc(mx.l)}: las cancelaciones van en aumento.`);
    }
    const ss = ultimoDet(detDe('sat_serv', c));
    if (ss && ss.rows.length) { const lo = ss.rows[ss.rows.length - 1]; out.push(`El servicio peor valorado por los estudiantes${deGrupo()} es ${q(lo.a)} (${num(lo.v, 1)} %).`); }
    return out;
  }
  function vApoyo() {
    const c = st.car, ids = ['sat_serv', 'tut_cob', 'tut_ejec', 'beca_cob', 'tut_int'];
    const bc = medir('beca_cob', c).cur;
    const g = bc ? ultimoDet(D.det.beca_gse[c], k => k === bc.p) : null;
    const ORD = ['BAJO', 'MEDIO BAJO', 'MEDIO TÍPICO', 'MEDIO ALTO', 'ALTO'];
    const gRows = g ? ORD.filter(k => g.rows[k]).map(k => ({ a: GSE_NOM[k], gse: k, v: g.rows[k].v, n: g.rows[k].n })) : [];
    const tp = bc ? (detDe('beca_tipo', c) || {})[bc.p] : null;
    const tRows = tp ? Object.entries(tp).map(([k, v]) => ({ a: k[0] + k.slice(1).toLowerCase().replace(/\s*\(desde 2do nivel\)/, ' (desde 2.º nivel)'), v })).sort((a, b) => (b.v || 0) - (a.v || 0)) : [];
    const ss = ultimoDet(detDe('sat_serv', c)), sc = medir('sat_serv', c).cur;
    const tcur = medir('tut_cob', c).cur;
    const tn = st.niv ? null : (tcur && (D.det.tut_niv[c] || {})[tcur.p]);
    const nRows = tn ? NIV_ORD.filter(k => tn[k]).map(k => ({ a: nivNom(k), niv: k, v: tn[k].v, n: tn[k].n })) : [];
    const tnSel = st.niv ? ultimoDet(D.det.tut_niv[c]) : null;
    const nRowsSel = tnSel ? NIV_ORD.filter(k => tnSel.rows[k]).map(k => ({ a: nivNom(k), niv: k, v: tnSel.rows[k].v, n: tnSel.rows[k].n })) : [];
    return `<div class="kpis">${ids.map(id => kpi(id)).join('')}</div>` + lectura(insApoyo()) +
      `<div class="grid2">` +
      panel('Cobertura de tutorías académicas', 'tut_cob', slot(el => lineChart(el, 'tut_cob'))) +
      panel('Estudiantes con beca o ayuda', 'beca_cob', slot(el => lineChart(el, 'beca_cob'))) +
      `</div><div class="grid2">` +
      panel('¿A quién llegan las becas?', 'beca_cob', hbars(gRows, { max: Math.max(25, ...gRows.map(r => r.v)), color: COL[c], tip: r => `Nivel ${GSE_NOM[r.gse].toLowerCase()}: ${num(r.v, 1)} % con beca\n${num(r.n)} matriculados en el grupo` }),
        bc ? `Porcentaje con beca dentro de cada nivel - ${esc(bc.l)} - pulsa un nivel para filtrar` : '') +
      panel('Tipo de beca', 'beca_cob', hbars(tRows, { fmt: v => num(v) + ' est.', vacio: '1 a 4 est.', color: '#4597bf', tip: r => r.v == null ? `${r.a}: entre 1 y 4 estudiantes (no se publica el número exacto)` : `${r.a}: ${num(r.v)} estudiantes` }) +
        (tRows.some(r => r.v == null) ? `<p class="ph-note" style="margin:12px 0 0">${esc(tRows.filter(r => r.v == null).map(r => r.a).join(', '))}: entre 1 y 4 estudiantes. No se publica el número exacto para proteger su identidad.</p>` : ''),
        bc ? `Estudiantes beneficiarios - ${esc(bc.l)}` : '') +
      `</div><div class="grid2">` +
      panel('Cobertura de tutorías por nivel', 'tut_cob', hbars(st.niv ? nRowsSel : nRows, { max: 100, color: COL[c], tip: r => `${r.a}: ${num(r.v, 1)} % asistió a tutorías\n${num(r.n)} matriculados en el nivel` }),
        tcur ? `${esc(tcur.l)} - pulsa un nivel para filtrar el tablero` : '') +
      panel('Satisfacción con cada servicio', 'sat_serv', ss ? hbars(ss.rows, { max: 100, prev: ss.prev && mapa(ss.prev), ref: sc && sc.v, tip: r => `${r.a}\n${num(r.v, 1)} % de valoraciones de 4 o 5 - promedio ${num(r.media, 2)} de 5` }) : '',
        ss ? `${esc(lblDe(ss.k))}${ss.prevK ? ' - la flecha compara con ' + esc(lblDe(ss.prevK)) : ''}` : `Sin medición hasta ${st.anio}`) +
      `</div>` + tabla(ids);
  }

  /* ================================================================ render */
  const RENDER = { inicio: vInicio, estudiantes: vEst, docentes: vDocentes, grupos: vGrupos, investigacion: vInvest, vinculacion: vVinc, apoyo: vApoyo };
  const root = document.getElementById('vista');

  function nav() {
    document.getElementById('nav').innerHTML = VISTAS.map(v => v.sep ? '<li class="nav-sep" role="separator"></li>' :
      `<li><button type="button" class="${st.vista === v.id ? 'on' : ''}" ${v.off ? 'disabled title="Vista en preparación"' : `data-go="${v.id}"`} ${st.vista === v.id ? 'aria-current="page"' : ''}>` +
      `<svg viewBox="0 0 24 24">${IC[v.id]}</svg>${v.num ? `<span class="num">${v.num}.</span>` : ''}<span>${esc(v.nom)}</span></button></li>`).join('');
  }
  let modoPrevio = null;
  function render(scroll) {
    // Rendimiento académico trabaja con un semestre; al salir de él, el resto del tablero vuelve al año
    const modo = enRend() ? 'sem' : 'anio';
    if (modo === 'sem' && !st.sem) st.sem = semDeAnio(st.anio) || ultimoSem;
    if (modo === 'anio' && modoPrevio === 'sem') st.sem = null;
    if (st.sem) st.anio = +st.sem.slice(-4);
    modoPrevio = modo;
    selectorPeriodo(); selectorCarrera();
    tipHide(); nav();
    const v = VISTAS.find(x => x.id === st.vista);
    const chips = [];
    if (st.sem && !enRend()) chips.push(`<button type="button" class="chip" data-quitar="sem">Periodo: ${esc(tick(st.sem))}<span class="x" aria-label="Quitar">×</span></button>`);
    if (st.gse) chips.push(`<button type="button" class="chip" data-quitar="gse">Nivel socioeconómico: ${esc(GSE_NOM[st.gse])}<span class="x" aria-label="Quitar">×</span></button>`);
    if (st.niv) chips.push(`<button type="button" class="chip" data-quitar="niv">${esc(nivNom(st.niv))}<span class="x" aria-label="Quitar">×</span></button>`);
    if (st.rf && enRend()) chips.push(`<button type="button" class="chip" data-quitar="rf">${esc(rfNom(st.rf))}<span class="x" aria-label="Quitar">×</span></button>`);
    if (st.gf && enGrad()) chips.push(`<button type="button" class="chip" data-quitar="gf">${esc(gfNom(st.gf))}<span class="x" aria-label="Quitar">×</span></button>`);
    if (st.tf && enTray()) chips.push(`<button type="button" class="chip" data-quitar="tf">${esc(rfNom(st.tf))}<span class="x" aria-label="Quitar">×</span></button>`);
    if (enPerf()) Object.entries(st.pc).forEach(([d, v]) => chips.push(`<button type="button" class="chip" data-quitar="pc:${esc(d)}">${esc(pcNom(d, v))}<span class="x" aria-label="Quitar">×</span></button>`));
    const head = `<div class="vhead"><div class="ic"><svg viewBox="0 0 24 24">${IC[v.id]}</svg></div><div><h2>${v.num ? v.num + '. ' : ''}${esc(v.nom)}</h2><p>${esc(v.obj)} - ${esc(NOM[st.car])}, ${esc(etiquetaCorte())}</p></div>` +
      `<div class="chips">${chips.join('')}${chips.length ? '<button type="button" class="chip-limpiar" data-quitar="todo">Quitar filtros</button>' : '<span class="chip-ayuda">Pulsa un punto, una barra o una carrera en los gráficos para filtrar todo el tablero</span>'}</div></div>`;
    pend = [];
    // Mientras la base de estudiantes esté incompleta, las vistas que dependen de ella lo advierten.
    const prov = D.provisional && D.provisional.estudiantes && ['inicio', 'estudiantes', 'apoyo'].includes(st.vista)
      ? `<div class="aviso-prov" role="note"><b>Datos provisionales.</b><span>La base de estudiantes del SGA llegó incompleta (límite de filas de Excel): ` +
        `faltan, entre otras, Turismo, Turismo 2019 y Trabajo Social 2019. Matrícula, trayectoria, perfil, rendimiento y las coberturas de tutorías y becas se actualizarán con el extracto completo.</span></div>` : '';
    root.innerHTML = head + prov + RENDER[st.vista]();
    montar(root);
    if (st.foco) {
      const k = document.getElementById('k-' + st.foco);
      if (k) { k.classList.add('flash'); if (scroll) k.scrollIntoView({ block: 'center' }); }
    } else if (scroll) window.scrollTo(0, 0);
    const h = '#' + st.vista + (st.foco ? '/' + st.foco : '') + `?c=${st.car}&a=${st.anio}` + (st.sem ? '&s=' + st.sem : '') +
      (st.vista === 'estudiantes' ? `&t=${st.sub}` + (st.sub === 'grad' ? `&v=${st.gv}&m=${st.gmom}` : '') : '') +
      (st.gse ? '&g=' + encodeURIComponent(st.gse) : '') + (st.niv ? '&n=' + st.niv : '') +
      (st.rf ? '&f=' + encodeURIComponent(st.rf) : '') + (st.gf ? '&gf=' + encodeURIComponent(st.gf) : '') +
      (st.tf ? '&tf=' + encodeURIComponent(st.tf) : '') +
      (hayPc() ? '&pc=' + encodeURIComponent(Object.entries(st.pc).map(([d, v]) => d + ':' + v).join(';')) : '');
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function leerHash() {
    const m = location.hash.match(/^#([a-z]+)(?:\/([a-z_]+))?(?:\?(.*))?$/);
    if (!m) return;
    if (m[1] === 'rendimiento') { st.vista = 'estudiantes'; st.sub = 'rend'; }  // enlaces anteriores
    else if (RENDER[m[1]]) st.vista = m[1];
    st.foco = m[2] && CAT[m[2]] ? m[2] : null;
    const qs = new URLSearchParams(m[3] || '');
    if (NOM[qs.get('c')]) st.car = qs.get('c');
    // Periodo: año (a); semestre (s) en Rendimiento académico o por filtro cruzado
    if (anios.includes(+qs.get('a'))) st.anio = +qs.get('a');
    st.sem = D.periodos.some(x => x.p === qs.get('s')) ? qs.get('s') : null;
    if (st.sem) st.anio = +st.sem.slice(-4);
    if (['tray', 'perfil', 'rend', 'grad'].includes(qs.get('t'))) st.sub = qs.get('t');
    if (st.foco && CAT[st.foco].sub) { st.sub = CAT[st.foco].sub; if (CAT[st.foco].gv) st.gv = CAT[st.foco].gv; }
    if (GV[qs.get('v')]) st.gv = qs.get('v');
    if (MOMENTOS[qs.get('m')]) st.gmom = qs.get('m');
    st.gse = GSE_NOM[qs.get('g')] ? qs.get('g') : null;
    st.niv = !st.gse && NIV_ORD.includes(qs.get('n')) ? qs.get('n') : null;
    st.rf = !st.gse && !st.niv && rfValido(qs.get('f')) ? qs.get('f') : null;
    st.gf = !st.gse && gfValido(qs.get('gf')) ? qs.get('gf') : null;
    st.tf = !st.gse && tfValido(qs.get('tf')) ? qs.get('tf') : null;
    st.pc = {};
    (qs.get('pc') || '').split(';').forEach(x => { const i = x.indexOf(':'); if (i > 0 && pcValido(x.slice(0, i), x.slice(i + 1))) st.pc[x.slice(0, i)] = x.slice(i + 1); });
    modoPrevio = null;  // un enlace con semestre fuera de Rendimiento se respeta como filtro cruzado
  }

  /* ---------- filtro cruzado ---------- */
  function filtrarPeriodo(p) {
    if (enRend()) st.sem = esAnual(p) ? (semDeAnio(p) || st.sem) : p;   // Rendimiento: siempre un semestre
    else if (esAnual(p)) { st.sem = null; st.anio = +p; }
    else if (st.sem === p) st.sem = null;          // segundo clic: quita el filtro
    else st.sem = p;
    if (st.sem) st.anio = +st.sem.slice(-4);
    render(false);
  }
  function filtrarCarrera(c) { st.car = st.car === c && c !== FAC ? FAC : c; render(false); }
  function filtrarGse(g) { st.gse = st.gse === g ? null : g; if (st.gse) { st.niv = null; st.rf = null; st.gf = null; st.tf = null; } fN.value = st.niv || ''; render(false); }
  function filtrarNivel(n) { st.niv = st.niv === n ? null : n; if (st.niv) { st.gse = null; st.rf = null; } fN.value = st.niv || ''; render(false); }
  /* Grupo propio de Rendimiento: excluye nivel y nivel socioeconómico (un cruce a la vez). */
  function filtrarRend(rf) { st.rf = st.rf === rf ? null : rf; if (st.rf) { st.gse = null; st.niv = null; } fN.value = ''; render(false); }
  /* Grupo propio de Graduados: excluye el nivel socioeconómico. */
  function filtrarGf(gf) { st.gf = st.gf === gf ? null : gf; if (st.gf) st.gse = null; render(false); }
  /* Grupo propio de Trayectoria: excluye el nivel socioeconómico. */
  function filtrarTf(tf) { st.tf = st.tf === tf ? null : tf; if (st.tf) st.gse = null; render(false); }
  /* Filtro cruzado del Perfil: agrega o quita el valor de una dimensión; se combina con los demás. */
  function filtrarPc(d, v) { if (st.pc[d] === v) delete st.pc[d]; else st.pc[d] = v; render(false); }

  /* filtros */
  const fC = document.getElementById('fCarrera'), fA = document.getElementById('fAnio'), fN = document.getElementById('fNivel'),
    fM = document.getElementById('fModalidad');
  /* Modalidad y carrera: la modalidad acota la lista de carreras; sin modalidad, las carreras se agrupan por modalidad. */
  function selectorCarrera() {
    const m = st.car === FAC ? '' : MOD_DE[st.car];
    fM.innerHTML = '<option value="">Todas</option>' + MODS.map(x => `<option value="${x.k}">${esc(x.nom)}</option>`).join('');
    fM.value = m;
    fC.innerHTML = m
      ? `<option value="${m}">Toda la modalidad</option>` + miembros(m).map(k => `<option value="${k}">${esc(NOM[k])}</option>`).join('')
      : `<option value="${FAC}">Toda la facultad</option>` + MODS.map(x => `<optgroup label="${esc(x.nom)}">` +
        x.carreras.map(k => `<option value="${k}">${esc(NOM[k])}</option>`).join('') + '</optgroup>').join('');
    fC.value = st.car;
  }
  fM.addEventListener('change', () => { st.car = fM.value || FAC; render(false); });
  fN.innerHTML = '<option value="">Todos</option>' + NIV_ORD.map(n => `<option value="${n}">${nivNom(n)}</option>`).join('');
  /* Selector de periodo: semestres en Rendimiento académico, años en el resto. */
  function selectorPeriodo() {
    const modo = enRend() ? 'sem' : 'anio';
    if (fA.dataset.modo !== modo) {
      fA.innerHTML = modo === 'sem'
        ? D.periodos.map(x => `<option value="${x.p}" title="${esc(x.l)}">${esc(tick(x.p))}</option>`).join('')
        : anios.slice().reverse().map(a => `<option value="${a}">${a}</option>`).join('');
      fA.dataset.modo = modo;
    }
    fA.value = modo === 'sem' ? st.sem : st.anio;
  }
  leerHash();
  fC.value = st.car; fN.value = st.niv || '';
  fN.addEventListener('change', () => { st.niv = fN.value || null; if (st.niv) { st.gse = null; st.rf = null; } render(false); });
  document.addEventListener('change', e => {
    const pd = e.target.dataset && e.target.dataset.pdim;
    if (pd) {   // filtros del perfil: se combinan con el filtro cruzado
      const v = e.target.value;
      if (pd === 'gse') st.gse = v || null; else if (v) st.pc[pd] = v; else delete st.pc[pd];
      render(false); return;
    }
    const fd = e.target.dataset && e.target.dataset.fdim;
    if (fd) {   // filtros separados de Estudiantes: elegir uno quita los demás
      const prop = propioDe(e.target.dataset.ftab), v = e.target.value;
      if (fd === 'gse') { st.gse = v || null; if (v) { st[prop] = null; st.niv = null; } }
      else { st[prop] = v ? fd + ':' + v : null; if (v) { st.gse = null; if (prop === 'rf') st.niv = null; } }
      fN.value = st.niv || ''; render(false); return;
    }
    const id = e.target.id;
    if (!['fRend', 'fGrad', 'fTray'].includes(id)) return;
    const v = e.target.value;
    if (!v) { st.gse = null; if (id === 'fRend') st.rf = null; else if (id === 'fGrad') st.gf = null; else st.tf = null; fN.value = st.niv || ''; render(false); }
    else if (v.startsWith('g:')) { st.gse = null; filtrarGse(v.slice(2)); }
    else if (id === 'fRend') { st.rf = null; filtrarRend(v); }
    else if (id === 'fGrad') { st.gf = null; filtrarGf(v); }
    else { st.tf = null; filtrarTf(v); }
  });
  fC.addEventListener('change', () => { st.car = fC.value; render(false); });
  fA.addEventListener('change', () => {
    if (enRend()) { st.sem = fA.value; st.anio = +st.sem.slice(-4); }
    else { st.anio = +fA.value; st.sem = null; }
    render(false);
  });

  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) {
      e.preventDefault(); st.vista = go.dataset.go; st.foco = go.dataset.foco || null;
      if (go.dataset.sub) st.sub = go.dataset.sub;
      if (go.dataset.gv) st.gv = go.dataset.gv;
      render(true); return;
    }
    const sb = e.target.closest('[data-sub]');
    if (sb) { st.sub = sb.dataset.sub; st.foco = null; render(false); return; }
    const gvb = e.target.closest('[data-gv]');
    if (gvb) { st.gv = gvb.dataset.gv; st.foco = null; render(false); return; }
    const gm = e.target.closest('[data-gmom]');
    if (gm) { const v = gm.dataset.gmom; st.gmom = gm.classList.contains('hrow') && st.gmom === v ? 'T' : v; render(false); return; }
    const gl = e.target.closest('[data-glin]');
    if (gl) { st.glin = gl.dataset.glin; render(false); return; }
    const pfb = e.target.closest('[data-pf]');
    if (pfb) { const x = pfb.dataset.pf, i = x.indexOf(':'); filtrarPc(x.slice(0, i), x.slice(i + 1)); return; }
    const pir = e.target.closest('[data-pir]');
    if (pir) {   // pirámide: filtra sexo y edad a la vez (un segundo clic los quita)
      const [s, ed] = pir.dataset.pir.split('|');
      if (st.pc.sexo === s && st.pc.edad === ed) { delete st.pc.sexo; delete st.pc.edad; } else { st.pc.sexo = s; st.pc.edad = ed; }
      render(false); return;
    }
    const gfb = e.target.closest('[data-gf]');
    if (gfb) { filtrarGf(gfb.dataset.gf); return; }
    const gr = e.target.closest('[data-grupo]');
    if (gr) { grupoDet = gr.dataset.grupo; render(false); return; }
    const vi = e.target.closest('[data-vin]');
    if (vi) { vinTodos = vi.dataset.vin === '1'; render(false); return; }
    const cq = e.target.closest('[data-cu]');
    if (cq) { cuTodos = cq.dataset.cu === '1'; render(false); return; }
    const ca = e.target.closest('.legend [data-car]');
    if (ca) { filtrarCarrera(ca.dataset.car); return; }
    const gs = e.target.closest('[data-gse]');
    if (gs) { filtrarGse(gs.dataset.gse); return; }
    const nv = e.target.closest('[data-niv]');
    if (nv) { filtrarNivel(nv.dataset.niv); return; }
    const rf = e.target.closest('[data-rf]');
    if (rf) { filtrarRend(rf.dataset.rf); return; }
    const cs = e.target.closest('[data-carsel]');
    if (cs) { st.car = cs.dataset.carsel; fC.value = st.car; render(false); return; }
    const qu = e.target.closest('[data-quitar]');
    if (qu) {
      const k = qu.dataset.quitar;
      if (k === 'gse' || k === 'todo') st.gse = null;
      if (k === 'niv' || k === 'todo') st.niv = null;
      if (k === 'rf' || k === 'todo') st.rf = null;
      if (k === 'gf' || k === 'todo') st.gf = null;
      if (k === 'tf' || k === 'todo') st.tf = null;
      if (k === 'todo') st.pc = {};
      if (k.startsWith('pc:')) delete st.pc[k.slice(3)];
      if (k === 'sem' || (k === 'todo' && !enRend())) st.sem = null;
      fN.value = st.niv || '';
      render(false);
    }
  });
  let rz; let anchoPrevio = innerWidth;
  window.addEventListener('resize', () => {  // los gráficos se dibujan al ancho real de su panel
    clearTimeout(rz); rz = setTimeout(() => { if (Math.abs(innerWidth - anchoPrevio) > 40) { anchoPrevio = innerWidth; render(false); } }, 200);
  });
  window.addEventListener('hashchange', () => { leerHash(); fC.value = st.car; fN.value = st.niv || ''; render(true); });
  render(false);
})();
