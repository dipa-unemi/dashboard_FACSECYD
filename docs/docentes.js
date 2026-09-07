// Vista "Docentes", fusionada dentro del mismo dashboard que "Perfil Estudiantil /
// Población" (index.html + app.js): mismas tarjetas .dcard dentro del mismo
// #dashGrid (así hereda gratis el editor de diseño arrastrar/redimensionar/
// exportar de app.js), mismos componentes visuales (filtros .msel, gráficos de
// barras y de línea SVG, tooltip compartido). Vive en su propio archivo y su
// propia IIFE -con sus propias copias de los pequeños helpers de gráficos y de
// filtro- para no acoplarse al estado interno de app.js (que es privado a su
// closure) ni arriesgar una regresión ahí; el único punto de contacto real es
// el ResizeObserver del final, que redibuja esta vista cuando sus tarjetas
// cambian de tamaño (incluido el redimensionado a mano en modo edición).
(function () {
  "use strict";

  /* ---------- Datos: tablas ya agregadas del distributivo docente ---------- */
  function zip(tbl) {
    const keys = Object.keys(tbl);
    if (!keys.length) return [];
    const n = Array.isArray(tbl[keys[0]]) ? tbl[keys[0]].length : 1;
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = {};
      for (const k of keys) row[k] = Array.isArray(tbl[k]) ? tbl[k][i] : tbl[k];
      rows[i] = row;
    }
    return rows;
  }
  function periodoKey(codigo) {
    const m = /^([12])S-(\d{4})$/.exec(codigo || "");
    if (!m) return -1;
    return parseInt(m[2], 10) * 10 + parseInt(m[1], 10);
  }
  function byPeriodo(a, b) { return periodoKey(a.periodo_codigo) - periodoKey(b.periodo_codigo); }
  function latestPeriodo(rows) {
    if (!rows.length) return null;
    return rows.reduce((a, b) => periodoKey(a.periodo_codigo) >= periodoKey(b.periodo_codigo) ? a : b).periodo_codigo;
  }
  function fmtPct(v) { return (v === null || v === undefined || isNaN(v)) ? "—" : v.toFixed(1) + "%"; }
  function fmtNum(v) { return (v === null || v === undefined || isNaN(v)) ? "—" : Math.round(v).toLocaleString("es-EC"); }
  function fmtDec(v, d) { d = d || 1; return (v === null || v === undefined || isNaN(v)) ? "—" : v.toFixed(d); }
  function escHtml(s) { return (s === null || s === undefined) ? "" : String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function sumField(rows, f) { return rows.reduce((a, r) => a + (r[f] || 0), 0); }
  function groupBy(rows, keyFn) {
    const m = new Map();
    rows.forEach(r => { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return m;
  }
  function pctOf(list, matchFn) {
    const total = list.reduce((a, r) => a + (r.docentes || 0), 0);
    if (!total) return null;
    const num = list.filter(matchFn).reduce((a, r) => a + (r.docentes || 0), 0);
    return Math.round(1000 * num / total) / 10;
  }

  const DOC_GENERAL = zip(DOCENTES_RAW.docentes_general);
  const DOC_PERIODO = zip(DOCENTES_RAW.docentes_periodo).sort(byPeriodo);
  const DOC_MODALIDAD = zip(DOCENTES_RAW.docentes_modalidad).sort(byPeriodo);
  const DOC_CARRERA = zip(DOCENTES_RAW.docentes_carrera).sort(byPeriodo);
  const DOC_PERFIL = DOCENTES_RAW.docentes_perfil_demografico;
  const OPCIONES_DOC = DOCENTES_RAW.docentes_opciones;
  const LATEST_PERIODO_DOC = latestPeriodo(DOC_PERIODO);

  /* ---------- Estado de filtros: mismo patrón que Población (Set = selección,
     null = todos), a diferencia del selector único que tenía la versión
     independiente de este dashboard. Así reutiliza el mismo componente .msel
     multi-selección y combineDocRows() suma sin problema sobre cualquier
     subconjunto de periodos/carreras/modalidades elegido. ---------- */
  const docState = {
    periodo: new Set([LATEST_PERIODO_DOC]),
    carrera: null,
    modalidad: null,
  };
  function periodoLabelText() {
    if (!docState.periodo) return "todos los periodos";
    if (docState.periodo.size === 1) return [...docState.periodo][0];
    return docState.periodo.size + " periodos seleccionados";
  }
  function carreraLabelText() {
    if (!docState.carrera) return "todas las carreras";
    if (docState.carrera.size === 1) return [...docState.carrera][0];
    return docState.carrera.size + " carreras seleccionadas";
  }
  function modalidadLabelText() {
    if (!docState.modalidad) return "todas las modalidades";
    if (docState.modalidad.size === 1) return [...docState.modalidad][0];
    return docState.modalidad.size + " modalidades seleccionadas";
  }

  /* ---------- Helpers de gráficos SVG: copia deliberada de los mismos
     helpers de app.js (mismo trazo, mismo tooltip compartido #tooltip) para
     que Docentes se vea y se comporte exactamente como Población, sin
     depender de las funciones privadas del closure de app.js. ---------- */
  const fmt = new Intl.NumberFormat("es-EC");
  const SVG_NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function chartW(id, fallback) {
    const node = document.getElementById(id);
    return (node && node.clientWidth) || fallback;
  }
  function showTip(evt, html) {
    const tip = document.getElementById("tooltip");
    tip.innerHTML = html;
    tip.classList.add("show");
    moveTip(evt);
  }
  function moveTip(evt) {
    const tip = document.getElementById("tooltip");
    const x = evt.clientX, y = evt.clientY;
    const pad = 14;
    let left = x + pad, top = y + pad;
    if (left + 230 > window.innerWidth) left = x - 230;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { document.getElementById("tooltip").classList.remove("show"); }

  function barChartH(container, data, opts) {
    opts = opts || {};
    if (!data.length) { container.innerHTML = '<div class="empty-state">Sin datos para esta combinación de filtros</div>'; return; }
    let rowH = opts.rowH || 26;
    const gap = 8;
    const W = opts.W || 600;
    const labelW = Math.min(opts.labelW || 190, Math.max(50, W * 0.42));
    const naturalH = data.length * (rowH + gap) - gap + 8;
    const availH = container.clientHeight;
    if (availH && availH < naturalH) rowH = Math.max(12, (availH - 8 + gap) / data.length - gap);
    container.innerHTML = "";
    const H = data.length * (rowH + gap) - gap + 8;
    const plotW = Math.max(20, W - labelW - 56);
    const max = Math.max(...data.map(d => d.value), 1);
    const hasSelection = opts.selectedIdx != null;

    const svg = el("svg", { class: "chart", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.ariaLabel || "Gráfico de barras" });
    data.forEach((d, i) => {
      const y = i * (rowH + gap);
      const w = Math.max((d.value / max) * plotW, d.value > 0 ? 2 : 0);
      const isSelected = hasSelection && d.idx === opts.selectedIdx;
      const dimmed = hasSelection && !isSelected;
      const g = el("g", { opacity: dimmed ? "0.38" : "1" });
      const lbl = el("text", { class: "bar-label", x: labelW - 10, y: y + rowH / 2 + 4, "text-anchor": "end" });
      lbl.textContent = d.label;
      g.appendChild(lbl);
      const track = el("rect", { x: labelW, y: y, width: plotW, height: rowH, rx: 3, fill: "var(--surface-2)" });
      g.appendChild(track);
      const barAttrs = { class: "bar-rect", x: labelW, y: y, width: w, height: rowH, rx: 3, fill: d.color || "var(--s1)" };
      if (isSelected) { barAttrs.stroke = "var(--ink)"; barAttrs["stroke-width"] = "1.5"; }
      const bar = el("rect", barAttrs);
      g.appendChild(bar);
      const val = el("text", { class: "bar-value", x: labelW + w + 8, y: y + rowH / 2 + 4 });
      val.textContent = fmt.format(d.value);
      g.appendChild(val);
      const hit = el("rect", { x: 0, y: y, width: W, height: rowH, fill: "transparent", style: "cursor:pointer" });
      hit.addEventListener("mousemove", (e) => showTip(e, "<b>" + d.label + "</b><br>" + fmt.format(d.value) + (opts.unit ? " " + opts.unit : "") + (opts.onClick ? "<br><span style=\"opacity:.65\">clic para filtrar</span>" : "")));
      hit.addEventListener("mouseleave", hideTip);
      if (opts.onClick) hit.addEventListener("click", () => { hideTip(); opts.onClick(d); });
      g.appendChild(hit);
      svg.appendChild(g);
    });
    container.appendChild(svg);
  }

  function lineChart(container, points, opts) {
    opts = opts || {};
    const H = Math.max(140, container.clientHeight || 220);
    container.innerHTML = "";
    const W = opts.W || 620, padL = 44, padR = 16, padT = 16, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    if (!points.length) { container.innerHTML = '<div class="empty-state">Sin datos para esta combinación de filtros</div>'; return; }
    const max = Math.max(...points.map(p => p.value), 1);
    const svg = el("svg", { class: "chart", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.ariaLabel || "Serie de tiempo" });

    const xStep = points.length > 1 ? plotW / (points.length - 1) : 0;
    const xAt = (i) => padL + i * xStep;
    const yAt = (v) => padT + plotH - (v / max) * plotH;

    for (let g = 0; g <= 4; g++) {
      const gy = padT + plotH - (g / 4) * plotH;
      svg.appendChild(el("line", { class: "gridline", x1: padL, x2: W - padR, y1: gy, y2: gy }));
      const t = el("text", { class: "axis-label", x: padL - 8, y: gy + 3, "text-anchor": "end" });
      t.textContent = fmt.format(Math.round(max * g / 4));
      svg.appendChild(t);
    }

    let d = "M " + xAt(0) + " " + yAt(points[0].value);
    for (let i = 1; i < points.length; i++) d += " L " + xAt(i) + " " + yAt(points[i].value);
    let areaD = "M " + xAt(0) + " " + (padT + plotH);
    points.forEach((p, i) => areaD += " L " + xAt(i) + " " + yAt(p.value));
    areaD += " L " + xAt(points.length - 1) + " " + (padT + plotH) + " Z";
    svg.appendChild(el("path", { d: areaD, fill: "var(--accent)", opacity: "0.10", stroke: "none" }));
    svg.appendChild(el("path", { d: d, fill: "none", stroke: "var(--accent)", "stroke-width": "2", "stroke-linejoin": "round" }));

    points.forEach((p, i) => {
      const cx = xAt(i), cy = yAt(p.value);
      const dot = el("circle", { cx: cx, cy: cy, r: 3.5, fill: "var(--surface)", stroke: "var(--accent)", "stroke-width": "2" });
      svg.appendChild(dot);
      const hit = el("rect", { x: cx - (xStep || plotW) / 2, y: padT, width: xStep || plotW, height: plotH, fill: "transparent", style: "cursor:default" });
      hit.addEventListener("mousemove", (e) => showTip(e, "<b>" + p.label + "</b><br>" + fmt.format(p.value) + " docentes"));
      hit.addEventListener("mouseleave", hideTip);
      svg.appendChild(hit);
      const labelY = padT + plotH + 16;
      const lab = el("text", { class: "axis-label", x: cx, y: labelY, "text-anchor": "middle" });
      lab.textContent = p.label;
      svg.appendChild(lab);
    });
    svg.appendChild(el("line", { class: "baseline", x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH }));
    container.appendChild(svg);
  }

  function wireInfoIcon(id, text) {
    const node = document.getElementById(id);
    if (!node) return;
    node.addEventListener("mousemove", (e) => showTip(e, text));
    node.addEventListener("mouseleave", hideTip);
    node.addEventListener("focus", () => {
      const r = node.getBoundingClientRect();
      showTip({ clientX: r.left, clientY: r.bottom }, text);
    });
    node.addEventListener("blur", hideTip);
  }

  /* ---------- Filtro multi-selección: mismo componente visual que el .msel
     de Población (buildMsel en app.js), adaptado para operar sobre valores de
     texto directos (carrera/modalidad/periodo del catálogo docente) en vez de
     índices de un diccionario numérico. ---------- */
  function buildMselMulti(id, items, onChange, opts) {
    opts = opts || {};
    const root = document.getElementById(id);
    const trigger = root.querySelector(".msel-trigger");
    const label = root.querySelector(".msel-label");
    const countEl = root.querySelector(".count");
    const panel = root.querySelector(".msel-panel");
    let selected = opts.defaultSelected ? new Set(opts.defaultSelected) : null;

    function normalize(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
    function buildOptsHtml(filter) {
      const nf = filter ? normalize(filter) : "";
      const html = items.map((val) => {
        if (nf && !normalize(val).includes(nf)) return "";
        const isChecked = selected === null || selected.has(val);
        return '<label class="msel-opt"><input type="checkbox" value="' + escHtml(val) + '" ' + (isChecked ? "checked" : "") + "> " +
          "<span>" + escHtml(val) + "</span></label>";
      }).join("");
      return html || '<div class="msel-empty">Sin resultados</div>';
    }
    const showSearch = items.length > 6;
    panel.innerHTML =
      (showSearch ? '<div class="msel-search-wrap"><input type="text" class="msel-search" placeholder="Buscar..." autocomplete="off" spellcheck="false"></div>' : "") +
      '<div class="msel-actions"><button type="button" data-a="all">Todas</button>' +
      '<button type="button" data-a="none">Ninguna</button></div>' +
      '<div class="msel-opts">' + buildOptsHtml() + "</div>";
    const searchInput = panel.querySelector(".msel-search");
    const optsWrap = panel.querySelector(".msel-opts");
    if (searchInput) {
      searchInput.addEventListener("input", () => { optsWrap.innerHTML = buildOptsHtml(searchInput.value); });
      searchInput.addEventListener("click", (e) => e.stopPropagation());
    }

    function refreshLabel() {
      if (selected === null || selected.size === items.length) {
        label.textContent = opts.allLabel || "Todas";
        countEl.textContent = "";
      } else if (selected.size === 0) {
        label.textContent = "Ninguna";
        countEl.textContent = "";
      } else if (selected.size === 1) {
        label.textContent = [...selected][0];
        countEl.textContent = "";
      } else {
        label.textContent = selected.size + " seleccionadas";
        countEl.textContent = "/" + items.length;
      }
    }

    panel.addEventListener("change", (e) => {
      if (e.target.tagName !== "INPUT") return;
      if (selected === null) selected = new Set(items);
      const v = e.target.value;
      if (e.target.checked) selected.add(v); else selected.delete(v);
      if (selected.size === items.length) selected = null;
      refreshLabel();
      onChange(selected);
    });
    panel.addEventListener("click", (e) => {
      const a = e.target.getAttribute("data-a");
      if (!a) return;
      const boxes = panel.querySelectorAll("input");
      if (a === "all") { selected = null; boxes.forEach(b => b.checked = true); }
      else { selected = new Set(); boxes.forEach(b => b.checked = false); }
      refreshLabel();
      onChange(selected);
    });
    trigger.addEventListener("click", () => {
      document.querySelectorAll(".msel.open").forEach(m => { if (m !== root) m.classList.remove("open"); });
      root.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!root.contains(e.target)) root.classList.remove("open");
    });

    refreshLabel();
    return {
      reset() {
        selected = opts.defaultSelected ? new Set(opts.defaultSelected) : null;
        panel.querySelectorAll("input").forEach(b => { b.checked = (selected === null || selected.has(b.value)); });
        refreshLabel();
      },
      setSelected(newSelected) {
        selected = newSelected === null ? null : new Set(newSelected);
        panel.querySelectorAll("input").forEach(b => { b.checked = (selected === null || selected.has(b.value)); });
        refreshLabel();
      }
    };
  }

  /* ---------- Agregación (tablas ya precalculadas del lado del servidor;
     combinar aquí es solo sumar filas ya resueltas) ---------- */
  function combineDocRows(rows) {
    if (!rows.length) return null;
    const docentes = sumField(rows, "docentes");
    const asignaciones = sumField(rows, "asignaciones");
    const estudiantes_total = sumField(rows, "estudiantes_total");
    const porTipo = {};
    rows.forEach(r => (r.por_tipo || []).forEach(t => {
      if (!porTipo[t.tipo]) porTipo[t.tipo] = { tipo: t.tipo, docentes: 0, asignaciones: 0 };
      porTipo[t.tipo].docentes += t.docentes || 0;
      porTipo[t.tipo].asignaciones += t.asignaciones || 0;
    }));
    return {
      docentes, asignaciones, estudiantes_total,
      carga_promedio: docentes ? Math.round(10 * estudiantes_total / docentes) / 10 : null,
      asignaciones_por_docente: docentes ? Math.round(100 * asignaciones / docentes) / 100 : null,
      por_tipo: Object.values(porTipo).sort((a, b) => b.docentes - a.docentes),
    };
  }
  function breakdownBy(rows, field) {
    const m = groupBy(rows, r => r[field]);
    const out = [];
    m.forEach((rs, key) => out.push({ categoria: key, docentes: sumField(rs, "docentes") }));
    out.sort((a, b) => b.docentes - a.docentes);
    return out;
  }
  function resolveDocente() {
    const cAll = !docState.carrera, pAll = !docState.periodo, mAll = !docState.modalidad;
    if (cAll) {
      let rows, label;
      if (pAll) { rows = DOC_GENERAL; label = "Todos los periodos · todas las carreras y modalidades"; }
      else if (mAll) {
        rows = DOC_PERIODO.filter(r => docState.periodo.has(r.periodo_codigo));
        label = periodoLabelText() + " · todas las carreras y modalidades";
      } else {
        rows = DOC_MODALIDAD.filter(r => docState.periodo.has(r.periodo_codigo) && docState.modalidad.has(r.modalidad));
        label = periodoLabelText() + " · " + modalidadLabelText();
      }
      return { rows, combined: combineDocRows(rows), label };
    }
    let periodoSet = docState.periodo;
    let periodoNote = "";
    if (pAll) {
      const rowsCarrera = DOC_CARRERA.filter(r => docState.carrera.has(r.docente_carrera_pertenencia) && (mAll || docState.modalidad.has(r.modalidad)));
      const lp = latestPeriodo(rowsCarrera);
      periodoSet = lp ? new Set([lp]) : null;
      periodoNote = lp ? " · periodo más reciente disponible" : "";
    }
    const matches = periodoSet ? DOC_CARRERA.filter(r => periodoSet.has(r.periodo_codigo) && docState.carrera.has(r.docente_carrera_pertenencia) && (mAll || docState.modalidad.has(r.modalidad))) : [];
    if (!matches.length) return { rows: [], combined: null, label: "Sin docentes para este filtro" };
    let rows, modNote = "";
    if (!mAll) {
      rows = matches;
    } else {
      const byMod = groupBy(matches, r => r.modalidad);
      let bestRows = null, bestN = -1;
      byMod.forEach((rs) => { const c = combineDocRows(rs); if ((c.docentes || 0) > bestN) { bestN = c.docentes || 0; bestRows = rs; } });
      rows = bestRows;
      if (byMod.size > 1) modNote = " · modalidad predominante: " + rows[0].modalidad;
    }
    const pLabel = pAll ? (periodoSet ? [...periodoSet][0] : "—") : periodoLabelText();
    return { rows, combined: combineDocRows(rows), label: pLabel + " · " + carreraLabelText() + modNote + periodoNote };
  }
  function resolveDocenteSeries() {
    const cAll = !docState.carrera, mAll = !docState.modalidad;
    if (cAll && mAll) {
      const series = [...groupBy(DOC_PERIODO, r => r.periodo_codigo).entries()].map(([, rs]) => ({ periodo_codigo: rs[0].periodo_codigo, ...combineDocRows(rs) })).sort(byPeriodo);
      return { series, label: "FACSECYD · todas las carreras y modalidades" };
    }
    if (cAll) {
      const rows = DOC_MODALIDAD.filter(r => docState.modalidad.has(r.modalidad));
      const series = [...groupBy(rows, r => r.periodo_codigo).entries()].map(([, rs]) => ({ periodo_codigo: rs[0].periodo_codigo, ...combineDocRows(rs) })).sort(byPeriodo);
      return { series, label: "FACSECYD · modalidad " + modalidadLabelText() };
    }
    const rows = DOC_CARRERA.filter(r => docState.carrera.has(r.docente_carrera_pertenencia) && (mAll || docState.modalidad.has(r.modalidad)));
    let series;
    if (mAll) {
      series = [...groupBy(rows, r => r.periodo_codigo).entries()].map(([, rs]) => {
        const byMod = groupBy(rs, r => r.modalidad);
        let best = null, bestN = -1;
        byMod.forEach(modRows => { const c = combineDocRows(modRows); if ((c.docentes || 0) > bestN) { bestN = c.docentes || 0; best = { periodo_codigo: modRows[0].periodo_codigo, ...c }; } });
        return best;
      }).sort(byPeriodo);
    } else {
      series = [...groupBy(rows, r => r.periodo_codigo).entries()].map(([, rs]) => ({ periodo_codigo: rs[0].periodo_codigo, ...combineDocRows(rs) })).sort(byPeriodo);
    }
    return { series, label: carreraLabelText() + (mAll ? "" : " · " + modalidadLabelText()) };
  }
  function docPeriodoScalar() {
    if (!docState.periodo) return LATEST_PERIODO_DOC;
    return latestPeriodo([...docState.periodo].map(p => ({ periodo_codigo: p }))) || LATEST_PERIODO_DOC;
  }
  function rowsDocCarreraPeriodo() {
    const p = docPeriodoScalar();
    const rows = DOC_CARRERA.filter(r => r.periodo_codigo === p && (!docState.modalidad || docState.modalidad.has(r.modalidad)));
    const byCarreraMod = groupBy(rows, r => r.docente_carrera_pertenencia + "||" + r.modalidad);
    return [...byCarreraMod.entries()].map(([, rs]) => {
      const dedic = breakdownBy(rs, "docente_dedicacion");
      const nivel = breakdownBy(rs, "docente_nivel_academico");
      return {
        docente_carrera_pertenencia: rs[0].docente_carrera_pertenencia, modalidad: rs[0].modalidad,
        ...combineDocRows(rs),
        _pctTC: pctOf(dedic, r => r.categoria === "TIEMPO COMPLETO"),
        _pctCuarto: pctOf(nivel, r => r.categoria === "CUARTO NIVEL" || r.categoria === "POSGRADO PHD" || r.categoria === "POSGRADO MAESTRIA" || r.categoria === "MAESTRÍA"),
      };
    });
  }
  function drillDocCarrera(carrera) {
    docState.carrera = new Set([carrera]);
    mselDocCarrera.setSelected(docState.carrera);
    renderDocAll();
  }

  /* ---------- Tabla ordenable: clic en un encabezado ordena asc/desc (las
     filas siguen siendo clicables para filtrar por carrera, vía delegación de
     eventos en el tbody ya que se reemplaza por completo en cada orden). ---------- */
  function wireSortableTable(theadEl, tbodyEl, renderRowHtml, emptyColspan, initial) {
    let sortKey = initial ? initial.key : null;
    let sortDir = initial ? initial.dir : 1;
    const ths = Array.prototype.slice.call(theadEl.querySelectorAll("th[data-key]"));
    function draw(rows) {
      if (sortKey) {
        const th = ths.find(t => t.dataset.key === sortKey);
        const isNum = th && th.dataset.type === "number";
        rows = rows.slice().sort((a, b) => {
          const va = a[sortKey], vb = b[sortKey];
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          return isNum ? sortDir * (va - vb) : sortDir * String(va).localeCompare(String(vb), "es");
        });
      }
      tbodyEl.innerHTML = rows.length ? rows.map(renderRowHtml).join("") :
        '<tr class="empty-row"><td colspan="' + emptyColspan + '">Sin resultados.</td></tr>';
      ths.forEach(th => {
        th.classList.toggle("sorted-asc", th.dataset.key === sortKey && sortDir === 1);
        th.classList.toggle("sorted-desc", th.dataset.key === sortKey && sortDir === -1);
      });
    }
    ths.forEach(th => {
      th.addEventListener("click", () => {
        if (sortKey === th.dataset.key) sortDir = -sortDir;
        else { sortKey = th.dataset.key; sortDir = th.dataset.type === "string" ? 1 : -1; }
        draw(lastRows);
      });
    });
    let lastRows = [];
    return { draw(rows) { lastRows = rows; draw(rows); } };
  }
  const docCarreraTableSorter = wireSortableTable(
    document.querySelector('[data-id="doc-carreratabla"] thead'),
    document.getElementById("docCarreraTablaBody"),
    docCarreraRowHtml, 7, { key: "docentes", dir: -1 }
  );
  function docCarreraRowHtml(r) {
    const isSel = docState.carrera && docState.carrera.size === 1 && [...docState.carrera][0] === r.docente_carrera_pertenencia;
    return '<tr class="clickable-row' + (isSel ? " selected" : "") + '" data-carrera="' + escHtml(r.docente_carrera_pertenencia) + '">' +
      '<td style="font-weight:600">' + escHtml(r.docente_carrera_pertenencia) + "</td>" +
      '<td><span class="pill pill-info">' + escHtml(r.modalidad) + "</span></td>" +
      "<td>" + fmtNum(r.docentes) + "</td>" +
      "<td>" + fmtPct(r._pctTC) + "</td>" +
      "<td>" + fmtPct(r._pctCuarto) + "</td>" +
      "<td>" + fmtDec(r.carga_promedio, 1) + "</td>" +
      "<td>" + fmtDec(r.asignaciones_por_docente, 2) + "</td>" +
      "</tr>";
  }
  document.getElementById("docCarreraTablaBody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-carrera]");
    if (!tr) return;
    drillDocCarrera(tr.dataset.carrera);
  });

  /* ---------- Renderers ---------- */
  function renderDocKPIs() {
    const { rows, combined } = resolveDocente();
    const ids = ["kpiDocDocentesValue", "kpiDocTCValue", "kpiDocCuartoValue", "kpiDocCargaValue", "kpiDocAsigValue"];
    if (!combined) { ids.forEach(id => document.getElementById(id).textContent = "—"); return; }
    const dedic = breakdownBy(rows, "docente_dedicacion");
    const nivel = breakdownBy(rows, "docente_nivel_academico");
    const pctTC = pctOf(dedic, r => r.categoria === "TIEMPO COMPLETO");
    const pctCuarto = pctOf(nivel, r => r.categoria === "CUARTO NIVEL" || r.categoria === "POSGRADO PHD" || r.categoria === "POSGRADO MAESTRIA" || r.categoria === "MAESTRÍA");
    document.getElementById("kpiDocDocentesValue").textContent = fmtNum(combined.docentes);
    document.getElementById("kpiDocTCValue").textContent = fmtPct(pctTC);
    document.getElementById("kpiDocCuartoValue").textContent = fmtPct(pctCuarto);
    document.getElementById("kpiDocCargaValue").textContent = fmtDec(combined.carga_promedio, 1);
    document.getElementById("kpiDocAsigValue").textContent = fmtDec(combined.asignaciones_por_docente, 2);
  }
  function renderDocTrend() {
    const { series, label } = resolveDocenteSeries();
    document.getElementById("docTrendNote").textContent = "Alcance: " + label + " · " + series.length + " periodo" + (series.length !== 1 ? "s" : "");
    const points = series.map(r => ({ label: r.periodo_codigo, value: r.docentes || 0 }));
    lineChart(document.getElementById("chartDocTrend"), points, { W: chartW("chartDocTrend", 560), ariaLabel: "Evolución de la planta docente por periodo" });
  }
  function renderDocTipo() {
    const { rows, label } = resolveDocente();
    const combined = combineDocRows(rows);
    const items = combined ? combined.por_tipo : [];
    document.getElementById("docTipoNote").textContent = "Alcance: " + label + ". Un docente puede aparecer en más de un rol.";
    const data = items.map(i => ({ label: i.tipo, value: i.docentes || 0 }));
    barChartH(document.getElementById("chartDocTipo"), data, { rowH: 26, labelW: 160, W: chartW("chartDocTipo", 560), unit: "docentes", ariaLabel: "Docentes por rol en el aula" });
  }
  function renderDocCategoria() {
    const { rows, label } = resolveDocente();
    document.getElementById("docCategoriaNote").textContent = "Alcance: " + label + ".";
    const data = breakdownBy(rows, "docente_categoria").map(i => ({ label: i.categoria, value: i.docentes || 0 }));
    barChartH(document.getElementById("chartDocCategoria"), data, { rowH: 24, labelW: 130, W: chartW("chartDocCategoria", 320), unit: "docentes", ariaLabel: "Distribución por categoría" });
  }
  function renderDocDedicacion() {
    const { rows, label } = resolveDocente();
    document.getElementById("docDedicacionNote").textContent = "Alcance: " + label + ".";
    const data = breakdownBy(rows, "docente_dedicacion").map(i => ({ label: i.categoria, value: i.docentes || 0 }));
    barChartH(document.getElementById("chartDocDedicacion"), data, { rowH: 24, labelW: 130, W: chartW("chartDocDedicacion", 320), unit: "docentes", ariaLabel: "Distribución por dedicación" });
  }
  function renderDocNivel() {
    const { rows, label } = resolveDocente();
    document.getElementById("docNivelNote").textContent = "Alcance: " + label + ".";
    const data = breakdownBy(rows, "docente_nivel_academico").map(i => ({ label: i.categoria, value: i.docentes || 0 }));
    barChartH(document.getElementById("chartDocNivel"), data, { rowH: 24, labelW: 140, W: chartW("chartDocNivel", 320), unit: "docentes", ariaLabel: "Distribución por nivel académico" });
  }
  function renderDocCarreraBar() {
    const p = docPeriodoScalar();
    const rows = rowsDocCarreraPeriodo().sort((a, b) => (b.docentes || 0) - (a.docentes || 0));
    document.getElementById("docCarreraBarNote").textContent = "Periodo: " + p + (docState.modalidad ? " · Modalidad: " + modalidadLabelText() : "") + ".";
    const data = rows.map(r => ({ label: r.docente_carrera_pertenencia, value: r.docentes || 0, idx: r.docente_carrera_pertenencia }));
    const selIdx = (docState.carrera && docState.carrera.size === 1) ? [...docState.carrera][0] : null;
    barChartH(document.getElementById("chartDocCarreraBar"), data, {
      rowH: 24, labelW: 280, W: chartW("chartDocCarreraBar", 600), unit: "docentes", ariaLabel: "Docentes por carrera de pertenencia",
      selectedIdx: selIdx,
      onClick: d => drillDocCarrera(d.idx)
    });
  }
  function renderDocCarreraTabla() {
    const p = docPeriodoScalar();
    document.getElementById("docCarreraTablaNote").textContent = "Periodo: " + p + (docState.modalidad ? " · Modalidad: " + modalidadLabelText() : "") + ".";
    docCarreraTableSorter.draw(rowsDocCarreraPeriodo());
  }
  function renderDocPerfil() {
    document.getElementById("docPerfilNote").textContent =
      "Fotografía institucional del periodo más reciente (" + DOC_PERFIL.periodo_codigo + " · " + DOC_PERFIL.total_docentes + " docentes activos), sin filtrar. Categorías con menos de " +
      DOC_PERFIL.umbral_agrupacion + " docentes se agrupan en \"Otro / pocos casos\" para no identificar personas. No se cruza con carrera, periodo ni modalidad.";
    function draw(containerId, items) {
      const data = items.map(i => ({ label: i.categoria, value: i.docentes || 0 }));
      barChartH(document.getElementById(containerId), data, { rowH: 24, labelW: 120, W: chartW(containerId, 260), unit: "docentes", ariaLabel: "Perfil demográfico institucional" });
    }
    draw("chartDocPerfilSexo", DOC_PERFIL.sexo);
    draw("chartDocPerfilEtnia", DOC_PERFIL.etnia);
    draw("chartDocPerfilDisc", DOC_PERFIL.discapacidad);
  }
  function renderDocAll() {
    renderDocKPIs();
    renderDocTrend();
    renderDocTipo();
    renderDocCategoria();
    renderDocDedicacion();
    renderDocNivel();
    renderDocCarreraBar();
    renderDocCarreraTabla();
    renderDocPerfil();
  }

  /* ---------- Filtros: mismo componente .msel que Población, catálogos
     propios de la planta docente (independientes de los del estudiante). ---------- */
  const periodosDoc = [...new Set(DOC_PERIODO.map(r => r.periodo_codigo))].sort((a, b) => periodoKey(a) - periodoKey(b));
  const carrerasDoc = [...(OPCIONES_DOC.carrera || [])].sort((a, b) => a.localeCompare(b, "es"));
  const modalidadesDoc = [...(OPCIONES_DOC.modalidad || [])].sort();

  const mselDocPeriodo = buildMselMulti("msel-doc-periodo", periodosDoc, sel => { docState.periodo = sel; renderDocAll(); }, {
    allLabel: "Todos los periodos", defaultSelected: [LATEST_PERIODO_DOC]
  });
  const mselDocCarrera = buildMselMulti("msel-doc-carrera", carrerasDoc, sel => { docState.carrera = sel; renderDocAll(); }, { allLabel: "Todas las carreras" });
  const mselDocModalidad = buildMselMulti("msel-doc-modalidad", modalidadesDoc, sel => { docState.modalidad = sel; renderDocAll(); }, { allLabel: "Todas" });

  document.getElementById("resetDocBtn").addEventListener("click", () => {
    docState.periodo = new Set([LATEST_PERIODO_DOC]); docState.carrera = null; docState.modalidad = null;
    mselDocPeriodo.reset(); mselDocCarrera.reset(); mselDocModalidad.reset();
    renderDocAll();
  });

  wireInfoIcon("kpiDocDocentesInfo", "Personas únicas en el alcance seleccionado.");
  wireInfoIcon("kpiDocCuartoInfo", "Maestría, PhD o posgrado, sobre el total de docentes del alcance.");
  wireInfoIcon("kpiDocCargaInfo", "Suma de estudiantes en todas las asignaturas del docente en el alcance (no es tamaño de clase).");
  wireInfoIcon("kpiDocAsigInfo", "Promedio de asignaturas-paralelo por docente.");

  /* ---------- Redibuja al cambiar de tamaño cualquier tarjeta de Docentes:
     cubre tanto el redimensionado a mano en modo edición (compartido con
     Población vía app.js) como el resize de la ventana. ---------- */
  function initDocentes() {
    renderDocAll();
    if (window.ResizeObserver) {
      let pending = false;
      const ro = new ResizeObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; renderDocAll(); });
      });
      document.querySelectorAll('.dcard[data-id^="doc-"]').forEach(c => ro.observe(c));
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(initDocentes));
})();
