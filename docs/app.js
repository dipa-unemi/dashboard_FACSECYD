(function(){
  "use strict";

  /* ---------- Parse rows (nivel de fila, un registro = una matrícula) ---------- */
  const rows = ROWS_RAW.length ? ROWS_RAW.split("\n") : [];
  const N = rows.length;
  const F = {
    periodo:new Int16Array(N), carrera:new Int16Array(N), modalidad:new Int16Array(N),
    sede:new Int16Array(N), sexo:new Int16Array(N), etnia:new Int16Array(N),
    disc:new Int16Array(N), ppl:new Int8Array(N), grupo:new Int16Array(N),
    rango:new Int16Array(N), ecuador:new Int16Array(N), provincia:new Int16Array(N), pais:new Int16Array(N),
    insc:new Int32Array(N), edad:new Int16Array(N), persona:new Int32Array(N)
  };
  for (let i=0;i<N;i++){
    const p = rows[i].split("|");
    F.periodo[i]=+p[0]; F.carrera[i]=+p[1]; F.modalidad[i]=+p[2]; F.sede[i]=+p[3];
    F.sexo[i]=+p[4]; F.etnia[i]=+p[5]; F.disc[i]=+p[6]; F.ppl[i]=+p[7]; F.grupo[i]=+p[8];
    F.rango[i]=+p[9]; F.ecuador[i]=+p[10]; F.provincia[i]=+p[11]; F.pais[i]=+p[12];
    F.insc[i]=+p[13]; F.edad[i]=+p[14]; F.persona[i]=+p[15];
  }

  const D = DICTS;
  const DEFAULT_PERIODO = D.periodo.length - 1; // most recent
  const state = {
    periodo: new Set([DEFAULT_PERIODO]), // Set of selected periodo indices, or null = all periods
    carrera: null,   // null = all
    modalidad: null,
    sede: null,
    cross: {} // click-to-filter from any chart: {fieldName: selectedIdx, ...} - one value per dimension, any number of dimensions at once
  };

  const fieldLabel = {
    carrera:"Carrera", modalidad:"Modalidad", sede:"Sede", sexo:"Sexo",
    etnia:"Etnia", disc:"Discapacidad", grupo:"Grupo socioeconómico",
    rango:"Edad de ingreso", ecuador:"Origen", provincia:"Provincia", pais:"País"
  };
  function titleCase(s){ return s.toLowerCase().replace(/(^|[\s/])([a-záéíóúñü])/g, (m,sep,c)=> sep+c.toUpperCase()); }
  function labelFor(field, idx){
    const dictKey = field === "disc" ? "discapacidad" : field;
    const raw = D[dictKey][idx];
    if (field === "grupo") return grupoDisplay[raw] || raw;
    if (field === "modalidad" || field === "sede") return cap(raw);
    if (field === "provincia" || field === "pais") return raw === "No registra" ? raw : titleCase(raw);
    return raw;
  }
  function crossIdx(field){ return Object.prototype.hasOwnProperty.call(state.cross, field) ? state.cross[field] : null; }
  function setCross(field, idx){
    if (state.cross[field] === idx){
      delete state.cross[field];
    } else {
      state.cross[field] = idx;
    }
    renderAll();
  }
  function renderCrossChip(){
    const box = document.getElementById("crossChip");
    const fields = Object.keys(state.cross);
    if (!fields.length){ box.innerHTML = ""; return; }
    box.innerHTML = fields.map(f =>
      '<button type="button" class="cross-chip" data-field="'+f+'">'+
        '<span>'+fieldLabel[f]+': '+labelFor(f, state.cross[f])+'</span>'+
        '<span class="x">&times;</span></button>'
    ).join("");
    box.querySelectorAll(".cross-chip").forEach(btn=>{
      btn.addEventListener("click", ()=>{ delete state.cross[btn.dataset.field]; renderAll(); });
    });
  }

  const fmt = new Intl.NumberFormat("es-EC");
  const fmt1 = (x)=> (Math.round(x*10)/10).toLocaleString("es-EC",{minimumFractionDigits:1,maximumFractionDigits:1});

  /* ---------- Filtering helpers ---------- */
  function matches(i, opts){
    opts = opts || {};
    if (opts.periodoOverride !== undefined){
      if (F.periodo[i] !== opts.periodoOverride) return false;
    } else if (state.periodo && !state.periodo.has(F.periodo[i])){
      return false;
    }
    if (state.carrera && !state.carrera.has(F.carrera[i])) return false;
    if (state.modalidad && !state.modalidad.has(F.modalidad[i])) return false;
    if (state.sede && !state.sede.has(F.sede[i])) return false;
    for (const field in state.cross){
      if (field === opts.skipField) continue;
      if (F[field][i] !== state.cross[field]) return false;
    }
    return true;
  }

  const INCONSISTENT_RANGO_IDX = D.rango.indexOf("Dato inconsistente");

  // Deduplica por inscripcion_id: un mismo estudiante matriculado en varios periodos
  // seleccionados debe contar una sola vez, no una vez por periodo.
  // Devuelve Map(inscripcion_id -> row index representativo).
  function dedupedRows(opts){
    const rep = new Map();
    for (let i=0;i<N;i++){
      if (!matches(i, opts)) continue;
      rep.set(F.insc[i], i);
    }
    return rep;
  }

  function aggregate(byField, opts){
    // returns Map(dictIndex -> {n, edadSum, edadN}) - conteo de inscripciones únicas,
    // nunca se autofiltra por el campo que agrupa
    const o = Object.assign({}, opts, {skipField: byField});
    const rep = dedupedRows(o);
    const m = new Map();
    rep.forEach((i)=>{
      const key = byField ? F[byField][i] : 0;
      let cell = m.get(key);
      if (!cell){ cell = {n:0, edadSum:0, edadN:0}; m.set(key, cell); }
      cell.n += 1;
      if (F.rango[i] !== INCONSISTENT_RANGO_IDX){ cell.edadSum += F.edad[i]; cell.edadN += 1; }
    });
    return m;
  }

  function totalFor(opts){
    const rep = dedupedRows(opts);
    let edadSum=0, edadN=0;
    rep.forEach((i)=>{
      if (F.rango[i] !== INCONSISTENT_RANGO_IDX){ edadSum += F.edad[i]; edadN += 1; }
    });
    return {n: rep.size, edadSum, edadN};
  }

  // Deduplica por id_persona en vez de por inscripcion_id: para datos que
  // describen a la PERSONA (grupo socioeconómico, etnia, discapacidad) y no
  // cambian entre sus distintas matrículas, así alguien matriculado en 2
  // carreras a la vez no se cuenta dos veces en esa misma categoría.
  function dedupedPersonas(opts){
    const rep = new Map();
    for (let i=0;i<N;i++){
      if (!matches(i, opts)) continue;
      rep.set(F.persona[i], i);
    }
    return rep;
  }

  function aggregateByPersona(byField, opts){
    // returns Map(dictIndex -> {n}) - conteo de personas únicas
    const o = Object.assign({}, opts, {skipField: byField});
    const rep = dedupedPersonas(o);
    const m = new Map();
    rep.forEach((i)=>{
      const key = byField ? F[byField][i] : 0;
      let cell = m.get(key);
      if (!cell){ cell = {n:0}; m.set(key, cell); }
      cell.n += 1;
    });
    return m;
  }

  /* ---------- Multi-select control ---------- */
  function buildMsel(id, dictName, onChange, opts){
    opts = opts || {};
    const root = document.getElementById(id);
    const trigger = root.querySelector(".msel-trigger");
    const label = root.querySelector(".msel-label");
    const countEl = root.querySelector(".count");
    const panel = root.querySelector(".msel-panel");
    const items = DICTS[dictName];
    let selected = opts.defaultSelected ? new Set(opts.defaultSelected) : null; // null = all

    function normalize(s){
      return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    }
    function buildOptsHtml(filter){
      const nf = filter ? normalize(filter) : "";
      const html = items.map((name, idx) => {
        const labelText = opts.labels ? opts.labels[idx] : name;
        if (nf && !normalize(labelText).includes(nf)) return "";
        const isChecked = selected === null || selected.has(idx);
        return '<label class="msel-opt"><input type="checkbox" value="'+idx+'" '+(isChecked?'checked':'')+'> '+
          '<span>'+ labelText +'</span></label>';
      }).join("");
      return html || '<div class="msel-empty">Sin resultados</div>';
    }
    const showSearch = items.length > 6;
    panel.innerHTML =
      (showSearch ? '<div class="msel-search-wrap"><input type="text" class="msel-search" placeholder="Buscar..." autocomplete="off" spellcheck="false"></div>' : "") +
      '<div class="msel-actions"><button type="button" data-a="all">Todas</button>' +
      '<button type="button" data-a="none">Ninguna</button></div>' +
      '<div class="msel-opts">' + buildOptsHtml() + '</div>';
    const searchInput = panel.querySelector(".msel-search");
    const optsWrap = panel.querySelector(".msel-opts");
    if (searchInput){
      searchInput.addEventListener("input", ()=>{
        optsWrap.innerHTML = buildOptsHtml(searchInput.value);
      });
      searchInput.addEventListener("click", (e)=> e.stopPropagation());
    }

    function refreshLabel(){
      if (selected === null || selected.size === items.length){
        label.textContent = opts.allLabel || "Todas";
        countEl.textContent = "";
      } else if (selected.size === 0){
        label.textContent = "Ninguna";
        countEl.textContent = "";
      } else if (selected.size === 1){
        const only = [...selected][0];
        label.textContent = opts.labels ? opts.labels[only] : items[only];
        countEl.textContent = "";
      } else {
        label.textContent = selected.size + " seleccionadas";
        countEl.textContent = "/" + items.length;
      }
    }

    panel.addEventListener("change", (e)=>{
      if (e.target.tagName !== "INPUT") return;
      if (selected === null) selected = new Set(items.map((_,i)=>i));
      const v = +e.target.value;
      if (e.target.checked) selected.add(v); else selected.delete(v);
      if (selected.size === items.length) selected = null;
      refreshLabel();
      onChange(selected);
    });
    panel.addEventListener("click", (e)=>{
      const a = e.target.getAttribute("data-a");
      if (!a) return;
      const boxes = panel.querySelectorAll("input");
      if (a === "all"){ selected = null; boxes.forEach(b=>b.checked=true); }
      else { selected = new Set(); boxes.forEach(b=>b.checked=false); }
      refreshLabel();
      onChange(selected);
    });
    trigger.addEventListener("click", ()=>{
      document.querySelectorAll(".msel.open").forEach(m=>{ if(m!==root) m.classList.remove("open"); });
      root.classList.toggle("open");
    });
    document.addEventListener("click", (e)=>{
      if (!root.contains(e.target)) root.classList.remove("open");
    });

    refreshLabel();
    return {
      reset(){
        selected = opts.defaultSelected ? new Set(opts.defaultSelected) : null;
        panel.querySelectorAll("input").forEach(b=>{ b.checked = (selected===null || selected.has(+b.value)); });
        refreshLabel();
      },
      setSelected(newSelected){
        selected = newSelected === null ? null : new Set(newSelected);
        panel.querySelectorAll("input").forEach(b=>{ b.checked = (selected===null || selected.has(+b.value)); });
        refreshLabel();
      }
    };
  }

  /* ---------- SVG chart helpers ---------- */
  // Ancho real del contenedor en px, para que el viewBox coincida 1:1 con el tamaño
  // en pantalla y las tarjetas redimensionables (modo edición) no estiren ni encojan
  // barras/texto de forma desproporcionada.
  function chartW(id, fallback){
    const node = document.getElementById(id);
    return (node && node.clientWidth) || fallback;
  }
  const SVG_NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs){
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function showTip(evt, html){
    const tip = document.getElementById("tooltip");
    tip.innerHTML = html;
    tip.classList.add("show");
    moveTip(evt);
  }
  function moveTip(evt){
    const tip = document.getElementById("tooltip");
    const x = evt.clientX, y = evt.clientY;
    const pad = 14;
    let left = x + pad, top = y + pad;
    if (left + 230 > window.innerWidth) left = x - 230;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip(){ document.getElementById("tooltip").classList.remove("show"); }

  function barChartH(container, data, opts){
    // data: [{label, value, color}], horizontal bars
    opts = opts || {};
    if (!data.length){ container.innerHTML = '<div class="empty-state">Sin datos para esta combinación de filtros</div>'; return; }
    let rowH = opts.rowH || 26;
    const gap = 8;
    const W = opts.W || 600;
    // Ajuste completo: la columna de etiquetas se angosta proporcionalmente al
    // ancho disponible (nunca deja el área de barras en negativo), y las filas
    // se comprimen si el alto disponible es menor al natural. Con espacio de
    // sobra en cualquiera de los dos ejes, usa el tamaño natural (nunca estira).
    const labelW = Math.min(opts.labelW || 190, Math.max(50, W*0.42));
    const naturalH = data.length * (rowH+gap) - gap + 8;
    const availH = container.clientHeight;
    if (availH && availH < naturalH) rowH = Math.max(12, (availH - 8 + gap)/data.length - gap);
    container.innerHTML = "";
    const H = data.length * (rowH+gap) - gap + 8;
    const plotW = Math.max(20, W - labelW - 56);
    const max = Math.max(...data.map(d=>d.value), 1);
    const hasSelection = opts.selectedIdx != null;

    const svg = el("svg", {class:"chart", viewBox:"0 0 "+W+" "+H, role:"img", "aria-label": opts.ariaLabel || "Gráfico de barras"});
    data.forEach((d,i)=>{
      const y = i*(rowH+gap);
      const w = Math.max((d.value/max) * plotW, d.value>0 ? 2 : 0);
      const isSelected = hasSelection && d.idx === opts.selectedIdx;
      const dimmed = hasSelection && !isSelected;
      const g = el("g", {opacity: dimmed ? "0.38" : "1"});
      const lbl = el("text", {class:"bar-label", x:labelW-10, y:y+rowH/2+4, "text-anchor":"end"});
      lbl.textContent = d.label;
      g.appendChild(lbl);
      const track = el("rect", {x:labelW, y:y, width:plotW, height:rowH, rx:3, fill:"var(--surface-2)"});
      g.appendChild(track);
      const barAttrs = {class:"bar-rect", x:labelW, y:y, width:w, height:rowH, rx:3, fill:d.color || "var(--s1)"};
      if (isSelected){ barAttrs.stroke = "var(--ink)"; barAttrs["stroke-width"] = "1.5"; }
      const bar = el("rect", barAttrs);
      g.appendChild(bar);
      const val = el("text", {class:"bar-value", x:labelW+w+8, y:y+rowH/2+4});
      val.textContent = fmt.format(d.value) + (opts.pct ? "" : "");
      g.appendChild(val);
      const hit = el("rect", {x:0,y:y,width:W,height:rowH, fill:"transparent", style:"cursor:pointer"});
      hit.addEventListener("mousemove", (e)=> showTip(e, "<b>"+d.label+"</b><br>"+fmt.format(d.value)+ (opts.unit?" "+opts.unit:"")+ (opts.pctOf ? " ("+fmt1(100*d.value/opts.pctOf)+"%)" : "") + (opts.onClick ? "<br><span style=\"opacity:.65\">clic para filtrar</span>" : "")));
      hit.addEventListener("mouseleave", hideTip);
      if (opts.onClick) hit.addEventListener("click", ()=>{ hideTip(); opts.onClick(d); });
      g.appendChild(hit);
      svg.appendChild(g);
    });
    container.appendChild(svg);
  }

  function stackedBar(container, segments, opts){
    // segments: [{label, value, color}]
    opts = opts || {};
    container.innerHTML = "";
    const total = segments.reduce((a,d)=>a+d.value,0);
    if (!total){ container.innerHTML = '<div class="empty-state">Sin datos</div>'; return; }
    const W = opts.W || 560, H = 46, barY = 18, barH = 22;
    const hasSelection = opts.selectedIdx != null;
    const svg = el("svg", {class:"chart", viewBox:"0 0 "+W+" "+H, role:"img", "aria-label": opts.ariaLabel || "Barra apilada"});
    let x = 0;
    const gapPx = 2;
    segments.forEach((s,i)=>{
      const w = (s.value/total) * W;
      const drawW = Math.max(w - (i<segments.length-1?gapPx:0), 0);
      const isSelected = hasSelection && s.idx === opts.selectedIdx;
      const dimmed = hasSelection && !isSelected;
      const rectAttrs = {x:x, y:barY, width:drawW, height:barH, rx:3, fill:s.color, opacity: dimmed?"0.38":"1", style:"cursor:pointer"};
      if (isSelected){ rectAttrs.stroke = "var(--ink)"; rectAttrs["stroke-width"] = "1.5"; }
      const rect = el("rect", rectAttrs);
      rect.addEventListener("mousemove",(e)=> showTip(e, "<b>"+s.label+"</b><br>"+fmt.format(s.value)+" · "+fmt1(100*s.value/total)+"%"));
      rect.addEventListener("mouseleave", hideTip);
      if (opts.onClick) rect.addEventListener("click", ()=>{ hideTip(); opts.onClick(s); });
      svg.appendChild(rect);
      if (w > 46){
        const t = el("text", {x:x+drawW/2, y:barY+barH/2+4, "text-anchor":"middle", fill:"var(--accent-ink)", "font-size":"11", "font-family":"var(--font-mono)"});
        t.textContent = fmt1(100*s.value/total)+"%";
        svg.appendChild(t);
      }
      x += w;
    });
    container.appendChild(svg);

    const legend = document.createElement("div");
    legend.className = "legend";
    legend.innerHTML = segments.map(s=>
      '<span class="legend-item"><span class="legend-swatch" style="background:'+s.color+'"></span>'+s.label+' &middot; '+fmt.format(s.value)+'</span>'
    ).join("");
    container.appendChild(legend);
  }

  function lineChart(container, points, opts){
    opts = opts || {};
    // Sin filas que contar (es una serie continua): siempre se ajusta al alto
    // disponible del contenedor, nunca necesita scroll.
    const H = Math.max(140, container.clientHeight || 260);
    container.innerHTML = "";
    const W = opts.W || 620, padL = 50, padR = 16, padT = 16, padB = 64;
    const plotW = W-padL-padR, plotH = H-padT-padB;
    const max = Math.max(...points.map(p=>p.value), 1);
    const svg = el("svg", {class:"chart", viewBox:"0 0 "+W+" "+H, role:"img", "aria-label": opts.ariaLabel || "Serie de tiempo"});

    const xStep = points.length>1 ? plotW/(points.length-1) : 0;
    const xAt = (i)=> padL + i*xStep;
    const yAt = (v)=> padT + plotH - (v/max)*plotH;

    // gridlines (4)
    for (let g=0; g<=4; g++){
      const gy = padT + plotH - (g/4)*plotH;
      svg.appendChild(el("line", {class:"gridline", x1:padL, x2:W-padR, y1:gy, y2:gy}));
      const t = el("text", {class:"axis-label", x:padL-8, y:gy+3, "text-anchor":"end"});
      t.textContent = fmt.format(Math.round(max*g/4));
      svg.appendChild(t);
    }

    let d = "M " + xAt(0) + " " + yAt(points[0].value);
    for (let i=1;i<points.length;i++) d += " L " + xAt(i) + " " + yAt(points[i].value);

    let areaD = "M "+xAt(0)+" "+(padT+plotH);
    points.forEach((p,i)=> areaD += " L "+xAt(i)+" "+yAt(p.value));
    areaD += " L "+xAt(points.length-1)+" "+(padT+plotH)+" Z";

    svg.appendChild(el("path", {d:areaD, fill:"var(--accent)", opacity:"0.10", stroke:"none"}));
    svg.appendChild(el("path", {d:d, fill:"none", stroke:"var(--accent)", "stroke-width":"2", "stroke-linejoin":"round"}));

    points.forEach((p,i)=>{
      const cx=xAt(i), cy=yAt(p.value);
      const isSel = p.selected;
      const dot = el("circle", {cx:cx, cy:cy, r: isSel?5:3.5, fill: isSel? "var(--accent)":"var(--surface)", stroke:"var(--accent)", "stroke-width":"2"});
      svg.appendChild(dot);
      const hit = el("rect", {x:cx-xStep/2, y:padT, width:xStep||plotW, height:plotH, fill:"transparent", style:"cursor:pointer"});
      hit.addEventListener("mousemove",(e)=> showTip(e, "<b>"+p.label+"</b><br>"+fmt.format(p.value)+" inscripciones"+(opts.onClick?"<br><span style=\"opacity:.65\">clic para filtrar</span>":"")));
      hit.addEventListener("mouseleave", hideTip);
      if (opts.onClick) hit.addEventListener("click", ()=>{ hideTip(); opts.onClick(p, i); });
      svg.appendChild(hit);
      const labelY = padT + plotH + 14;
      const lab = el("text", {class:"axis-label", x:cx, y:labelY, "text-anchor":"end", transform:"rotate(-90 "+cx+" "+labelY+")"});
      lab.textContent = p.short;
      svg.appendChild(lab);
    });

    svg.appendChild(el("line", {class:"baseline", x1:padL, x2:W-padR, y1:padT+plotH, y2:padT+plotH}));
    container.appendChild(svg);
  }

  function pyramidChart(container, data, opts){
    // data: [{label, h, m}] - mirrored horizontal bars, hombres left / mujeres right
    opts = opts || {};
    if (!data.length){ container.innerHTML = '<div class="empty-state">Sin datos para esta combinación de filtros</div>'; return; }
    let rowH = 28;
    const gap = 6, centerW = 74, labelPad = 46;
    const naturalH = data.length*(rowH+gap) - gap + 8;
    const availH = container.clientHeight;
    if (availH && availH < naturalH) rowH = Math.max(14, (availH - 8 + gap)/data.length - gap);
    container.innerHTML = "";
    const W = opts.W || 760, H = data.length*(rowH+gap) - gap + 8;
    const halfW = Math.max(20, (W - centerW)/2 - labelPad);
    const max = Math.max(1, ...data.map(d=>Math.max(d.h, d.m)));
    const cx = W/2;
    const hasSelection = opts.selectedIdx != null;
    const svg = el("svg", {class:"chart", viewBox:"0 0 "+W+" "+H, role:"img", "aria-label": opts.ariaLabel || "Pirámide poblacional"});
    data.forEach((d,i)=>{
      const y = i*(rowH+gap);
      const hw = (d.h/max) * halfW;
      const mw = (d.m/max) * halfW;
      const hx0 = cx - centerW/2 - hw;
      const mx0 = cx + centerW/2;
      const isSelected = hasSelection && d.idx === opts.selectedIdx;
      const dimmed = hasSelection && !isSelected;
      const rowOpacity = dimmed ? "0.38" : "1";
      const cursor = opts.onClick ? "pointer" : "default";

      svg.appendChild(el("rect", {x:hx0, y:y, width:hw, height:rowH, rx:3, fill:"var(--s2)", opacity:rowOpacity}));
      svg.appendChild(el("rect", {x:mx0, y:y, width:mw, height:rowH, rx:3, fill:"var(--s1)", opacity:rowOpacity}));

      const lbl = el("text", {class:"axis-label", x:cx, y:y+rowH/2+4, "text-anchor":"middle"});
      lbl.textContent = d.label;
      svg.appendChild(lbl);

      const hVal = el("text", {class:"bar-value", x:hx0-6, y:y+rowH/2+4, "text-anchor":"end", opacity:rowOpacity});
      hVal.textContent = fmt.format(d.h);
      svg.appendChild(hVal);
      const mVal = el("text", {class:"bar-value", x:mx0+mw+6, y:y+rowH/2+4, opacity:rowOpacity});
      mVal.textContent = fmt.format(d.m);
      svg.appendChild(mVal);

      const hHit = el("rect", {x:0, y:y, width:cx-centerW/2, height:rowH, fill:"transparent", style:"cursor:"+cursor});
      hHit.addEventListener("mousemove",(e)=> showTip(e, "<b>Hombres &middot; "+d.label+"</b><br>"+fmt.format(d.h)+" inscripciones"));
      hHit.addEventListener("mouseleave", hideTip);
      if (opts.onClick) hHit.addEventListener("click", ()=>{ hideTip(); opts.onClick(d); });
      svg.appendChild(hHit);
      const mHit = el("rect", {x:cx+centerW/2, y:y, width:cx-centerW/2, height:rowH, fill:"transparent", style:"cursor:"+cursor});
      mHit.addEventListener("mousemove",(e)=> showTip(e, "<b>Mujeres &middot; "+d.label+"</b><br>"+fmt.format(d.m)+" inscripciones"));
      mHit.addEventListener("mouseleave", hideTip);
      if (opts.onClick) mHit.addEventListener("click", ()=>{ hideTip(); opts.onClick(d); });
      svg.appendChild(mHit);
    });
    container.appendChild(svg);
  }

  /* ---------- Renderers ---------- */
  function renderKpis(){
    const mIdx = D.sexo.indexOf("MUJER");

    // Un solo pase sobre las inscripciones ÚNICAS (deduplicadas) que cumplen los filtros actuales
    const rep = dedupedRows();
    const personaSet = new Set();
    let mujeres=0, hombres=0, extranjero=0;
    rep.forEach((i)=>{
      personaSet.add(F.persona[i]);
      if (F.sexo[i] === mIdx) mujeres++; else hombres++;
      if (D.ecuador[F.ecuador[i]] === "Extranjero") extranjero++;
    });
    const cur = { n: rep.size };
    const pctMujeres = cur.n ? 100*mujeres/cur.n : 0;
    const pctExtranjero = cur.n ? 100*extranjero/cur.n : 0;

    document.getElementById("kpiInscripcionesValue").textContent = fmt.format(cur.n);
    document.getElementById("kpiPersonasValue").textContent = fmt.format(personaSet.size);
    document.getElementById("kpiMujeresValue").textContent = fmt1(pctMujeres)+"%";
    document.getElementById("kpiInternacionalValue").textContent = fmt1(pctExtranjero)+"%";
  }

  function periodoPointClick(p, idx){
    if (state.periodo && state.periodo.size === 1 && state.periodo.has(idx)){
      state.periodo = null;
    } else {
      state.periodo = new Set([idx]);
    }
    mselPeriodo.setSelected(state.periodo);
    renderAll();
  }

  function renderTrend(){
    const points = D.periodo.map((name, idx)=>{
      const t = totalFor({periodoOverride: idx});
      return { label:name, short:D.periodoOrden[idx], value:t.n, selected: !!(state.periodo && state.periodo.has(idx)) };
    });
    lineChart(document.getElementById("chartTrend"), points, {W: chartW("chartTrend", 620), ariaLabel:"Inscripciones únicas por periodo", onClick: periodoPointClick});
  }

  function renderCarrera(){
    const agg = aggregate("carrera");
    const data = D.carrera.map((name,idx)=>({label:name, value:(agg.get(idx)||{n:0}).n, idx}))
      .filter(d=>d.value>0)
      .sort((a,b)=>b.value-a.value);
    document.getElementById("carreraNote").textContent = data.length + " carreras con matrícula en el periodo";
    barChartH(document.getElementById("chartCarrera"), data, {
      rowH:24, labelW:280, W: chartW("chartCarrera", 600), ariaLabel:"Inscripciones por carrera",
      selectedIdx: crossIdx("carrera"),
      onClick: (d)=> setCross("carrera", d.idx)
    });
  }

  function renderModalidad(){
    const agg = aggregate("modalidad");
    const data = D.modalidad.map((name,idx)=>({label:cap(name), value:(agg.get(idx)||{n:0}).n, idx})).sort((a,b)=>b.value-a.value);
    barChartH(document.getElementById("chartModalidad"), data, {
      rowH:24, labelW:110, W: chartW("chartModalidad", 600), ariaLabel:"Inscripciones por modalidad",
      selectedIdx: crossIdx("modalidad"),
      onClick: (d)=> setCross("modalidad", d.idx)
    });
  }

  function renderSede(){
    const agg = aggregate("sede");
    const data = D.sede.map((name,idx)=>({label:cap(name), value:(agg.get(idx)||{n:0}).n, idx})).sort((a,b)=>b.value-a.value);
    barChartH(document.getElementById("chartSede"), data, {
      rowH:24, labelW:150, W: chartW("chartSede", 600), ariaLabel:"Inscripciones por sede",
      selectedIdx: crossIdx("sede"),
      onClick: (d)=> setCross("sede", d.idx)
    });
  }

  function findIdxCI(arr, target){ return arr.findIndex(v => v.toUpperCase() === target.toUpperCase()); }

  const grupoOrder = ["BAJO","MEDIO BAJO","MEDIO TÍPICO","MEDIO ALTO","ALTO","SIN SOCIOECONOMICO"];
  const grupoDisplay = { "BAJO":"Bajo", "MEDIO BAJO":"Medio Bajo", "MEDIO TÍPICO":"Medio Típico", "MEDIO ALTO":"Medio Alto", "ALTO":"Alto", "SIN SOCIOECONOMICO":"Sin dato" };
  function renderGrupo(){
    const agg = aggregateByPersona("grupo");
    const data = grupoOrder.map(name=>{
      const idx = findIdxCI(D.grupo, name);
      return {label: grupoDisplay[name]||name, value: idx>=0 ? (agg.get(idx)||{n:0}).n : 0, idx};
    }).filter(d=> d.label !== "Sin dato" || d.value > 0);
    barChartH(document.getElementById("chartGrupo"), data, {
      rowH:32, labelW:110, W: chartW("chartGrupo", 600), unit:"personas", ariaLabel:"Personas por grupo socioeconómico",
      selectedIdx: crossIdx("grupo"),
      onClick: (d)=> d.idx>=0 && setCross("grupo", d.idx)
    });
  }

  function renderEtnia(){
    const agg = aggregateByPersona("etnia");
    const data = D.etnia.map((name,idx)=>({label:name, value:(agg.get(idx)||{n:0}).n, idx}))
      .filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
    barChartH(document.getElementById("chartEtnia"), data, {
      rowH:28, labelW:130, W: chartW("chartEtnia", 600), unit:"personas", ariaLabel:"Autoidentificación étnica",
      selectedIdx: crossIdx("etnia"),
      onClick: (d)=> setCross("etnia", d.idx)
    });
  }

  function renderDisc(){
    const agg = aggregateByPersona("disc");
    const sinIdx = findIdxCI(D.discapacidad, "SIN DISCAPACIDAD");
    const total = dedupedPersonas().size;
    const sinN = sinIdx>=0 ? (agg.get(sinIdx)||{n:0}).n : 0;
    document.getElementById("discNote").textContent =
      fmt1(total? 100*(total-sinN)/total : 0) + "% de las personas reportan alguna discapacidad";
    const data = D.discapacidad.map((name,idx)=>({label:name, value:(agg.get(idx)||{n:0}).n, idx}))
      .filter(d=> d.label.toUpperCase() !== "SIN DISCAPACIDAD" && d.value>0)
      .sort((a,b)=>b.value-a.value);
    barChartH(document.getElementById("chartDisc"), data, {
      rowH:28, labelW:130, W: chartW("chartDisc", 600), unit:"personas", ariaLabel:"Tipos de discapacidad reportados",
      selectedIdx: crossIdx("disc"),
      onClick: (d)=> setCross("disc", d.idx)
    });
  }

  const pyramidBands = ["40+","35-39","30-34","25-29","20-24","15-19"]; // arriba = mayor edad, abajo = menor edad
  function renderPyramidStats(hIdx, mIdx, hTotal, mTotal){
    const total = hTotal + mTotal;
    const sel = crossIdx("sexo");
    const hDim = sel!=null && sel!==hIdx;
    const mDim = sel!=null && sel!==mIdx;
    const box = document.getElementById("pyramidStats");
    box.innerHTML =
      '<button type="button" class="sex-stat" id="sexStatH" style="opacity:'+(hDim?0.4:1)+'">'+
        '<span class="sex-symbol" style="color:var(--s2)">&#9794;</span>'+
        '<span class="sex-text"><span class="sex-total">'+fmt.format(hTotal)+'</span><span class="sex-pct">'+fmt1(total?100*hTotal/total:0)+'% Hombres</span></span>'+
      '</button>'+
      '<button type="button" class="sex-stat" id="sexStatM" style="opacity:'+(mDim?0.4:1)+'">'+
        '<span class="sex-symbol" style="color:var(--s1)">&#9792;</span>'+
        '<span class="sex-text"><span class="sex-total">'+fmt.format(mTotal)+'</span><span class="sex-pct">'+fmt1(total?100*mTotal/total:0)+'% Mujeres</span></span>'+
      '</button>';
    document.getElementById("sexStatH").addEventListener("click", ()=> setCross("sexo", hIdx));
    document.getElementById("sexStatM").addEventListener("click", ()=> setCross("sexo", mIdx));
  }
  function renderPyramid(){
    const mIdx = D.sexo.indexOf("MUJER"), hIdx = D.sexo.indexOf("HOMBRE");
    const counts = {};
    let inconsistentN = 0;
    const rep = dedupedRows();
    rep.forEach((i)=>{
      if (F.rango[i] === INCONSISTENT_RANGO_IDX){ inconsistentN++; return; }
      const rIdx = F.rango[i];
      if (!counts[rIdx]) counts[rIdx] = {h:0, m:0};
      if (F.sexo[i] === hIdx) counts[rIdx].h++;
      else if (F.sexo[i] === mIdx) counts[rIdx].m++;
    });
    const data = pyramidBands.map(name=>{
      const idx = D.rango.indexOf(name);
      const c = counts[idx] || {h:0, m:0};
      return {label:name, h:c.h, m:c.m, idx};
    });
    let hTotal=0, mTotal=0;
    data.forEach(d=>{ hTotal+=d.h; mTotal+=d.m; });
    renderPyramidStats(hIdx, mIdx, hTotal, mTotal);
    document.getElementById("pyramidNote").textContent =
      "Excluye " + fmt.format(inconsistentN) + " inscripción" + (inconsistentN===1?"":"es") + " con dato de edad inconsistente";
    pyramidChart(document.getElementById("chartPyramid"), data, {
      W: chartW("chartPyramid", 760), ariaLabel:"Estructura de la población por sexo y edad de ingreso",
      selectedIdx: crossIdx("rango"),
      onClick: (d)=> setCross("rango", d.idx)
    });
  }

  function renderEcuadorSplit(){
    const agg = aggregate("ecuador");
    const ecIdx = D.ecuador.indexOf("Ecuador"), exIdx = D.ecuador.indexOf("Extranjero");
    const segs = [
      {label:"Ecuador", value:(agg.get(ecIdx)||{n:0}).n, color:"var(--s1)", idx:ecIdx},
      {label:"Extranjero", value:(agg.get(exIdx)||{n:0}).n, color:"var(--s2)", idx:exIdx}
    ];
    stackedBar(document.getElementById("chartEcuador"), segs, {
      W: chartW("chartEcuador", 560), ariaLabel:"Distribución Ecuador / Extranjero",
      selectedIdx: crossIdx("ecuador"),
      onClick: (s)=> setCross("ecuador", s.idx)
    });
  }

  // Nombre (tal como aparece en los datos) -> código ISO3, para colorear el mapa mundial.
  // Aruba no existe como polígono propio en el atlas usado (isla muy pequeña), se omite.
  const PAIS_ISO = {
    "ESTADOS UNIDOS":"USA", "ESPAÑA":"ESP", "CHILE":"CHL", "COLOMBIA":"COL",
    "ITALIA":"ITA", "PERU":"PER", "ARGENTINA":"ARG", "MEXICO":"MEX",
    "ALEMANIA":"DEU", "VENEZUELA":"VEN",
    "REINO UNIDO DE GRANBRETAÑA E IRLANDA DEL NORTE":"GBR",
    "FRANCIA":"FRA", "BRASIL":"BRA", "CANADA":"CAN", "AUSTRALIA":"AUS",
    "SUIZA":"CHE", "CUBA":"CUB", "BOLIVIA":"BOL", "RUSIA":"RUS",
    "PAÍSES BAJOS":"NLD", "PANAMA":"PAN", "TURQUIA":"TUR",
    "COSTA RICA":"CRI", "CHINA":"CHN", "PUERTO RICO":"PRI", "QATAR":"QAT",
    "EL SALVADOR":"SLV", "HONDURAS":"HND", "URUGUAY":"URY", "BAHAMAS":"BHS",
    "EGIPTO":"EGY", "REPUBLICA DOMINICANA":"DOM", "POLONIA":"POL", "ISRAEL":"ISR"
  };
  let worldMapCounts = {}; // iso -> {name, n} del último render, usado por el tooltip

  function renderWorldMap(){
    const rep = dedupedRows();
    const counts = {};
    const ecuadorIdx = D.pais.indexOf("ECUADOR");
    rep.forEach((i)=>{
      const idx = F.pais[i];
      const paisName = D.pais[idx];
      const iso = idx === ecuadorIdx ? "ECU" : PAIS_ISO[paisName];
      if (!iso) return; // "No registra" o país sin polígono en el atlas
      if (!counts[iso]) counts[iso] = { name: idx === ecuadorIdx ? "Ecuador" : titleCase(paisName), n: 0, idx };
      counts[iso].n += 1;
    });
    worldMapCounts = counts;

    const sel = crossIdx("pais");
    const svg = document.getElementById("worldMapSvg");
    if (svg) {
      svg.querySelectorAll("path").forEach(p=>{
        const iso = p.id.slice(2);
        const c = counts[iso];
        if (c) {
          if (iso !== "ECU") p.style.fill = c.n >= 200 ? "var(--seq-650)" : c.n >= 50 ? "var(--seq-450)" : "var(--seq-250)";
          p.classList.add("has-data");
          const dimmed = sel != null && sel !== c.idx;
          p.style.opacity = dimmed ? "0.38" : "1";
          if (sel != null && sel === c.idx){ p.style.stroke = "var(--ink)"; p.style.strokeWidth = "1.6"; }
          else { p.style.stroke = ""; p.style.strokeWidth = ""; }
        } else {
          p.style.fill = "";
          p.style.opacity = "";
          p.style.stroke = "";
          p.style.strokeWidth = "";
          p.classList.remove("has-data");
        }
      });
    }
    const noteEl = document.getElementById("worldMapNote");
    const foreignCount = Object.keys(counts).filter(k=>k!=="ECU").length;
    if (noteEl) noteEl.textContent = foreignCount + " países, fuera de Ecuador · país más reciente por inscripción";
  }

  // Siempre acotado a Ecuador (provincia no aplica a extranjeros) - ignora un cross-filter de "ecuador" activo.
  // Compartido entre el gráfico de barras y el mapa de provincias.
  function dedupedEcuadorRows(){
    const ecIdx = D.ecuador.indexOf("Ecuador");
    const rep = new Map(); // inscripcion_id -> row index, deduplicado
    for (let i=0;i<N;i++){
      if (state.periodo && !state.periodo.has(F.periodo[i])) continue;
      if (F.ecuador[i] !== ecIdx) continue;
      if (state.carrera && !state.carrera.has(F.carrera[i])) continue;
      if (state.modalidad && !state.modalidad.has(F.modalidad[i])) continue;
      if (state.sede && !state.sede.has(F.sede[i])) continue;
      let skip = false;
      for (const field in state.cross){
        if (field === "provincia" || field === "ecuador") continue;
        if (F[field][i] !== state.cross[field]) { skip = true; break; }
      }
      if (skip) continue;
      rep.set(F.insc[i], i);
    }
    return rep;
  }

  // Nombre (tal como aparece en los datos) -> codigo iso_2, para colorear el mapa de provincias
  const PROVINCIA_ISO = {
    "GUAYAS":"EC-G", "LOS RIOS":"EC-R", "PICHINCHA":"EC-P", "CAÑAR":"EC-F",
    "TUNGURAHUA":"EC-T", "EL ORO":"EC-O", "ZAMORA CHINCHIPE":"EC-Z", "SANTA ELENA":"EC-SE",
    "LOJA":"EC-L", "COTOPAXI":"EC-X", "BOLIVAR":"EC-B", "AZUAY":"EC-A",
    "GALAPAGOS":"EC-W", "SANTO DOMINGO DE LOS TSACHILAS":"EC-SD", "CHIMBORAZO":"EC-H",
    "ESMERALDAS":"EC-E", "SUCUMBIOS":"EC-U", "ORELLANA":"EC-D", "IMBABURA":"EC-I",
    "MANABI":"EC-M", "MORONA SANTIAGO":"EC-S", "PASTAZA":"EC-Y", "CARCHI":"EC-C", "NAPO":"EC-N"
  };
  let ecuadorMapCounts = {};

  function renderEcuadorMap(){
    const rep = dedupedEcuadorRows();
    const counts = {};
    rep.forEach((i)=>{
      const idx = F.provincia[i];
      const provName = D.provincia[idx];
      const iso = PROVINCIA_ISO[provName];
      if (!iso) return; // "No registra"
      if (!counts[iso]) counts[iso] = { name: titleCase(provName), n: 0, idx };
      counts[iso].n += 1;
    });
    ecuadorMapCounts = counts;
    const sel = crossIdx("provincia");
    const svg = document.getElementById("ecuadorMapSvg");
    if (svg) {
      svg.querySelectorAll("path").forEach(p=>{
        const iso = p.id.slice(2);
        const c = counts[iso];
        if (c) {
          p.style.fill = c.n >= 5000 ? "var(--seq-650)" : c.n >= 1000 ? "var(--seq-450)" : "var(--seq-250)";
          p.classList.add("has-data");
          const dimmed = sel != null && sel !== c.idx;
          p.style.opacity = dimmed ? "0.38" : "1";
          if (sel != null && sel === c.idx){ p.style.stroke = "var(--ink)"; p.style.strokeWidth = "1.6"; }
          else { p.style.stroke = ""; p.style.strokeWidth = ""; }
        } else {
          p.style.fill = "";
          p.style.opacity = "";
          p.style.stroke = "";
          p.style.strokeWidth = "";
          p.classList.remove("has-data");
        }
      });
    }
  }

  function cap(s){ return s.charAt(0)+s.slice(1).toLowerCase().replace(/í|Í/g,"í"); }

  function periodTagText(){
    if (!state.periodo || state.periodo.size === D.periodo.length) return "Todos los periodos";
    if (state.periodo.size === 0) return "Ningún periodo";
    if (state.periodo.size === 1){
      const only = [...state.periodo][0];
      return D.periodoOrden[only] + " · " + D.periodoLabel[only];
    }
    return state.periodo.size + " periodos seleccionados";
  }

  function renderAll(){
    document.getElementById("periodTag").textContent = periodTagText();
    renderCrossChip();
    renderKpis();
    renderPyramid();
    renderTrend();
    renderCarrera();
    renderModalidad();
    renderSede();
    renderGrupo();
    renderEtnia();
    renderDisc();
    renderEcuadorSplit();
    renderWorldMap();
    renderEcuadorMap();
  }

  /* ---------- Wire controls ---------- */
  const worldMapSvg = document.getElementById("worldMapSvg");
  if (worldMapSvg) {
    worldMapSvg.addEventListener("mousemove", (e)=>{
      const path = e.target.closest("path");
      const iso = path && path.id ? path.id.slice(2) : null;
      const c = iso ? worldMapCounts[iso] : null;
      if (!c) { hideTip(); return; }
      showTip(e, "<b>"+c.name+"</b><br>"+fmt.format(c.n)+" inscripciones");
    });
    worldMapSvg.addEventListener("mouseleave", hideTip);
    worldMapSvg.addEventListener("click", (e)=>{
      const path = e.target.closest("path");
      const iso = path && path.id ? path.id.slice(2) : null;
      const c = iso ? worldMapCounts[iso] : null;
      if (!c) return;
      hideTip();
      setCross("pais", c.idx);
    });
  }

  const ecuadorMapSvg = document.getElementById("ecuadorMapSvg");
  if (ecuadorMapSvg) {
    ecuadorMapSvg.addEventListener("mousemove", (e)=>{
      const path = e.target.closest("path");
      const iso = path && path.id ? path.id.slice(2) : null;
      const c = iso ? ecuadorMapCounts[iso] : null;
      if (!c) { hideTip(); return; }
      showTip(e, "<b>"+c.name+"</b><br>"+fmt.format(c.n)+" inscripciones");
    });
    ecuadorMapSvg.addEventListener("mouseleave", hideTip);
    ecuadorMapSvg.addEventListener("click", (e)=>{
      const path = e.target.closest("path");
      const iso = path && path.id ? path.id.slice(2) : null;
      const c = iso ? ecuadorMapCounts[iso] : null;
      if (!c) return;
      hideTip();
      setCross("provincia", c.idx);
    });
  }

  const mselPeriodo = buildMsel("msel-periodo", "periodo", (sel)=>{ state.periodo = sel; renderAll(); }, {
    allLabel: "Todos los periodos",
    labels: D.periodo.map((_,idx)=> D.periodoOrden[idx] + " · " + D.periodoLabel[idx]),
    defaultSelected: [DEFAULT_PERIODO]
  });
  const mselCarrera = buildMsel("msel-carrera", "carrera", (sel)=>{ state.carrera = sel; renderAll(); }, {allLabel:"Todas las carreras"});
  const mselModalidad = buildMsel("msel-modalidad", "modalidad", (sel)=>{ state.modalidad = sel; renderAll(); }, {allLabel:"Todas", labels: D.modalidad.map(cap)});
  const mselSede = buildMsel("msel-sede", "sede", (sel)=>{ state.sede = sel; renderAll(); }, {allLabel:"Todas", labels: D.sede.map(cap)});

  document.getElementById("resetBtn").addEventListener("click", ()=>{
    state.periodo = new Set([DEFAULT_PERIODO]); state.carrera=null; state.modalidad=null; state.sede=null;
    state.cross = {};
    mselPeriodo.reset(); mselCarrera.reset(); mselModalidad.reset(); mselSede.reset();
    renderAll();
  });

  function wireInfoIcon(id, text){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("mousemove", (e)=> showTip(e, text));
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("focus", ()=>{
      const r = el.getBoundingClientRect();
      showTip({clientX: r.left, clientY: r.bottom}, text);
    });
    el.addEventListener("blur", hideTip);
  }
  wireInfoIcon("kpiInscripcionesInfo", "Se diferencia de Personas únicas porque un estudiante puede cursar una o más carreras a la vez.");
  wireInfoIcon("grupoInfo", "Se cuenta por personas únicas, no por inscripciones: si alguien está matriculado en más de una carrera, se cuenta una sola vez aquí.");
  wireInfoIcon("etniaInfo", "Se cuenta por personas únicas, no por inscripciones: si alguien está matriculado en más de una carrera, se cuenta una sola vez aquí.");
  wireInfoIcon("discInfo", "Se cuenta por personas únicas, no por inscripciones: si alguien está matriculado en más de una carrera, se cuenta una sola vez aquí.");

  /* ---------- Editor de diseño: lienzo de posición libre ----------
     Cada tarjeta es position:absolute con left/top/width/height propios, sin
     ataduras a filas ni columnas. Si hay un diseño guardado se aplica tal cual;
     si no, computeDefaultLayout arma una disposición inicial razonable (mismo
     acomodo que antes: pirámide arriba, luego 3 tercios, 2 mitades, y el resto
     a lo ancho) calculando las posiciones directamente, sin depender de un
     paso previo en flujo (evita el colapso de flex-column con alto "auto"). */
  const LAYOUT_KEY = "facsecyd-dash-layout-v4";
  const dashGrid = document.getElementById("dashGrid");

  function updateGridHeight(){
    let maxBottom = 0;
    dashGrid.querySelectorAll(".dcard").forEach(c=>{
      const bottom = c.offsetTop + c.offsetHeight;
      if (bottom > maxBottom) maxBottom = bottom;
    });
    dashGrid.style.height = (maxBottom + 4) + "px";
  }

  function loadLayout(){
    let raw;
    try { raw = localStorage.getItem(LAYOUT_KEY); } catch(e){ return false; }
    if (!raw) return false;
    let layout;
    try { layout = JSON.parse(raw); } catch(e){ return false; }
    const positions = layout.positions || {};
    if (!Object.keys(positions).length) return false;
    Object.entries(positions).forEach(([id,pos])=>{
      const card = dashGrid.querySelector('.dcard[data-id="'+id+'"]');
      if (!card) return;
      if (pos.left) card.style.left = pos.left;
      if (pos.top) card.style.top = pos.top;
      if (pos.width) card.style.width = pos.width;
      if (pos.height) card.style.height = pos.height;
    });
    updateGridHeight();
    return true;
  }
  function saveLayout(){
    const cards = [...dashGrid.querySelectorAll(".dcard")];
    const layout = {
      positions: Object.fromEntries(cards.map(c=>[c.dataset.id, {
        left: c.style.left || "", top: c.style.top || "",
        width: c.style.width || "", height: c.style.height || ""
      }]))
    };
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch(e){}
    return layout;
  }
  function computeDefaultLayout(){
    const containerW = dashGrid.clientWidth || 1200;
    const gap = 14;
    const widthPx = { "100%": containerW, "50%": (containerW-gap)/2, "33%": (containerW-2*gap)/3, "25%": (containerW-3*gap)/4 };
    const heightPx = {
      kpiInscripciones:110, kpiPersonas:110, kpiMujeres:110, kpiInternacional:110,
      pyramid:300, grupo:260, etnia:260, disc:260, trend:320, modsede:300,
      carrera:460, ecuadorsplit:130, worldmap:420, ecuadormap:420
    };
    let x=0, y=0, rowH=0;
    dashGrid.querySelectorAll(".dcard").forEach(c=>{
      const id = c.dataset.id;
      const w = widthPx[c.dataset.w] || containerW;
      const h = heightPx[id] || 260;
      if (x > 0 && x+w > containerW+1){ x=0; y+=rowH+gap; rowH=0; }
      c.style.left = Math.round(x) + "px";
      c.style.top = Math.round(y) + "px";
      c.style.width = Math.round(w) + "px";
      c.style.height = Math.round(h) + "px";
      x += w+gap;
      rowH = Math.max(rowH, h);
    });
    updateGridHeight();
  }

  // Diseño elegido y confirmado por el usuario (vía "Exportar diseño"), fijado
  // como disposición por defecto para cualquiera que abra el artifact sin un
  // diseño propio guardado en su navegador. Se aplica ENCIMA del empaquetado
  // automático de computeDefaultLayout, que sigue sirviendo de respaldo por si
  // en el futuro se agrega una tarjeta que todavía no tiene posición fija aquí.
  const DEFAULT_POSITIONS = {
    kpiInscripciones:  { left:"0px",   top:"0px",       width:"227px", height:"139px" },
    kpiPersonas:       { left:"236px", top:"0px",       width:"228px", height:"141px" },
    kpiMujeres:        { left:"473px", top:"0px",       width:"225px", height:"139px" },
    kpiInternacional:  { left:"710px", top:"0px",       width:"222px", height:"142px" },
    trend:             { left:"3px",   top:"152px",     width:"408px", height:"283px" },
    modsede:           { left:"431px", top:"151px",     width:"498px", height:"285px" },
    carrera:           { left:"8px",   top:"451px",     width:"919px", height:"312px" },
    etnia:             { left:"344px", top:"776px",     width:"305px", height:"253px" },
    grupo:             { left:"662px", top:"778px",     width:"264px", height:"252px" },
    pyramid:           { left:"14px",  top:"781px",     width:"319px", height:"416px" },
    disc:              { left:"342px", top:"1042px",    width:"585px", height:"158px" },
    ecuadorsplit:      { left:"6px",   top:"1220px",    width:"917px", height:"125px" },
    worldmap:          { left:"5px",   top:"1366px",    width:"519px", height:"328px" },
    ecuadormap:        { left:"533px", top:"1369.67px", width:"394px", height:"318px" }
  };
  function applyDefaultPositions(){
    Object.entries(DEFAULT_POSITIONS).forEach(([id,pos])=>{
      const card = dashGrid.querySelector('.dcard[data-id="'+id+'"]');
      if (!card) return;
      card.style.left = pos.left;
      card.style.top = pos.top;
      card.style.width = pos.width;
      card.style.height = pos.height;
    });
    updateGridHeight();
  }

  let editMode = false;
  const btnEditToggle = document.getElementById("btnEditToggle");
  const btnExport = document.getElementById("btnExport");
  const btnResetLayout = document.getElementById("btnResetLayout");
  const editHint = document.getElementById("editHint");

  function setEditMode(on){
    editMode = on;
    document.body.classList.toggle("edit-mode", on);
    btnEditToggle.querySelector("span").textContent = on ? "Guardar y salir" : "Editar diseño";
    btnExport.hidden = !on;
    btnResetLayout.hidden = !on;
    editHint.hidden = !on;
    if (!on){
      saveLayout();
      renderAll();
    }
  }
  btnEditToggle.addEventListener("click", ()=> setEditMode(!editMode));

  // Mover: arrastrar desde el asa (::drag-handle) actualiza left/top en vivo,
  // siguiendo al cursor - posición libre, sin reordenar filas ni columnas.
  let dragEl = null, dragging = false, dragOffX = 0, dragOffY = 0;
  dashGrid.addEventListener("mousedown", (e)=>{
    if (!editMode) return;
    const handle = e.target.closest(".drag-handle");
    if (!handle) return;
    dragEl = handle.closest(".dcard");
    if (!dragEl) return;
    const r = dragEl.getBoundingClientRect();
    dragOffX = e.clientX - r.left;
    dragOffY = e.clientY - r.top;
    dragging = true;
    dragEl.classList.add("dragging");
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e)=>{
    if (!dragging || !dragEl) return;
    const gridRect = dashGrid.getBoundingClientRect();
    const left = Math.max(0, e.clientX - gridRect.left - dragOffX);
    const top = Math.max(0, e.clientY - gridRect.top - dragOffY);
    dragEl.style.left = left + "px";
    dragEl.style.top = top + "px";
    updateGridHeight();
  });
  document.addEventListener("mouseup", ()=>{
    if (!dragging) return;
    dragging = false;
    if (dragEl) dragEl.classList.remove("dragging");
    dragEl = null;
    updateGridHeight();
    saveLayout();
    renderAll();
  });

  // Redimensionar (ancho y alto a la vez): resize nativo del navegador, arrastrando la
  // esquina inferior derecha de la tarjeta; al soltar el mouse se guarda el tamaño resultante.
  dashGrid.addEventListener("mouseup", ()=>{
    if (!editMode || dragging) return;
    updateGridHeight();
    saveLayout();
    renderAll();
  });

  // Exportar diseño actual como JSON, para pegarlo en el chat y dejarlo fijo
  const exportModal = document.getElementById("exportModal");
  const exportText = document.getElementById("exportText");
  btnExport.addEventListener("click", ()=>{
    const layout = saveLayout();
    exportText.value = JSON.stringify(layout, null, 2);
    exportModal.hidden = false;
    exportText.focus();
    exportText.select();
  });
  document.getElementById("btnCloseExport").addEventListener("click", ()=>{ exportModal.hidden = true; });
  document.getElementById("btnCopyExport").addEventListener("click", ()=>{
    exportText.select();
    const btn = document.getElementById("btnCopyExport");
    const restore = ()=> btn.textContent = "Copiar";
    const marked = ()=>{ btn.textContent = "Copiado"; setTimeout(restore, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(exportText.value).then(marked).catch(()=>{ document.execCommand("copy"); marked(); });
    } else {
      document.execCommand("copy");
      marked();
    }
  });

  // Restablecer diseño: pide confirmar con un segundo clic (sin usar confirm() nativo)
  let resetArmed = false;
  btnResetLayout.addEventListener("click", ()=>{
    if (!resetArmed){
      resetArmed = true;
      btnResetLayout.textContent = "¿Seguro? Clic de nuevo";
      setTimeout(()=>{ resetArmed = false; btnResetLayout.textContent = "Restablecer diseño"; }, 3000);
      return;
    }
    try { localStorage.removeItem(LAYOUT_KEY); } catch(e){}
    location.reload();
  });

  window.addEventListener("mousemove", (e)=>{ if (document.getElementById("tooltip").classList.contains("show")) moveTip(e); });

  // El artifact vive dentro de un iframe cuyo ancho final lo define la página
  // que lo aloja, después de la primera carga. Si calculáramos las posiciones
  // (computeDefaultLayout, que depende de dashGrid.clientWidth) de forma
  // síncrona aquí, mediríamos un ancho de 0/incorrecto y quedaría fijo para
  // siempre. Se difiere con doble requestAnimationFrame para asegurar que el
  // iframe ya se asentó en su tamaño real antes de medir y renderizar.
  function initDashboard(){
    // 1) Empaquetado automático como respaldo para todas las tarjetas,
    // 2) el diseño fijo confirmado por el usuario por encima,
    // 3) el diseño guardado en ESTE navegador (si existe) por encima de todo.
    // Así, una tarjeta nueva que todavía no tenga posición fija siempre
    // aparece en un lugar razonable en vez de quedar sin posición.
    computeDefaultLayout();
    applyDefaultPositions();
    loadLayout();
    renderAll();
    document.getElementById("loadingVeil").style.display = "none";
    document.getElementById("app").style.visibility = "visible";
  }
  requestAnimationFrame(()=> requestAnimationFrame(initDashboard));
})();
