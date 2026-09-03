(function(){
  "use strict";

  /* ---------- Parse rows (nivel de COMBINACION de variables, no de persona ni
     matrícula individual -- ver scripts/agregar_datos.R). Cada fila trae,
     para una combinación exacta de las 13 dimensiones, cuántas inscripciones
     (nInsc) caen ahí -- no se usa n_personas de esta tabla porque, al incluir
     carrera/modalidad/sede en la combinación, siempre coincide con nInsc (una
     persona no puede tener 2 matrículas dentro de la MISMA combinación exacta
     de carrera+modalidad+sede+periodo+demografía). ---------- */
  const rows = ROWS_RAW.length ? ROWS_RAW.split("\n") : [];
  const N = rows.length;
  const F = {
    periodo:new Int16Array(N), carrera:new Int16Array(N), modalidad:new Int16Array(N),
    sede:new Int16Array(N), sexo:new Int16Array(N), etnia:new Int16Array(N),
    disc:new Int16Array(N), ppl:new Int8Array(N), grupo:new Int16Array(N),
    rango:new Int16Array(N), ecuador:new Int16Array(N), provincia:new Int16Array(N), pais:new Int16Array(N),
    nInsc:new Int32Array(N)
  };
  for (let i=0;i<N;i++){
    const p = rows[i].split("|");
    F.periodo[i]=+p[0]; F.carrera[i]=+p[1]; F.modalidad[i]=+p[2]; F.sede[i]=+p[3];
    F.sexo[i]=+p[4]; F.etnia[i]=+p[5]; F.disc[i]=+p[6]; F.ppl[i]=+p[7]; F.grupo[i]=+p[8];
    F.rango[i]=+p[9]; F.ecuador[i]=+p[10]; F.provincia[i]=+p[11]; F.pais[i]=+p[12];
    F.nInsc[i]=+p[13];
  }

  // Segunda tabla, agregada solo por periodo + sexo/discapacidad/ecuador (las
  // únicas variables de persona que usan los 4 KPI institucionales de arriba).
  // Al no cruzar con carrera/modalidad/sede, "personas únicas" es exacto ahí
  // -- por eso esos 4 KPI solo reaccionan al filtro de Periodo.
  const iRows = (typeof ROWS_INST !== "undefined" && ROWS_INST.length) ? ROWS_INST.split("\n") : [];
  const NI = iRows.length;
  const FI = {
    periodo:new Int16Array(NI), sexo:new Int16Array(NI), disc:new Int16Array(NI), ecuador:new Int16Array(NI),
    nInsc:new Int32Array(NI), nPersonas:new Int32Array(NI)
  };
  for (let i=0;i<NI;i++){
    const p = iRows[i].split("|");
    FI.periodo[i]=+p[0]; FI.sexo[i]=+p[1]; FI.disc[i]=+p[2]; FI.ecuador[i]=+p[3];
    FI.nInsc[i]=+p[4]; FI.nPersonas[i]=+p[5];
  }

  // Personas con 2+ carreras distintas en el mismo periodo, un entero por
  // periodo (mismo orden que DICTS.periodo) -- calculado en el pipeline de R
  // con los microdatos reales, ya que el navegador nunca recibe id_persona.
  const MULTI = (typeof MULTI_CARRERA !== "undefined") ? MULTI_CARRERA : [];

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

  // Suma nInsc de todas las filas (ya agregadas por combinación) que cumplen
  // los filtros actuales -- ya no hace falta deduplicar por id: cada fila de
  // ROWS_RAW es una combinación de dimensiones distinta, así que sumarlas
  // nunca cuenta dos veces la misma inscripción real.
  function sumRaw(opts){
    let n = 0;
    for (let i=0;i<N;i++){
      if (!matches(i, opts)) continue;
      n += F.nInsc[i];
    }
    return n;
  }

  function aggregate(byField, opts){
    // returns Map(dictIndex -> {n}) - suma de inscripciones por valor de byField,
    // nunca se autofiltra por el campo que agrupa
    const o = Object.assign({}, opts, {skipField: byField});
    const m = new Map();
    for (let i=0;i<N;i++){
      if (!matches(i, o)) continue;
      const key = byField ? F[byField][i] : 0;
      let cell = m.get(key);
      if (!cell){ cell = {n:0}; m.set(key, cell); }
      cell.n += F.nInsc[i];
    }
    return m;
  }

  function totalFor(opts){
    return { n: sumRaw(opts) };
  }

  // Filtra filas de la tabla institucional (ROWS_INST): solo periodo +
  // cross-filters de sexo/disc/ecuador, que son las únicas dimensiones que
  // esa tabla tiene. Un cross-filter de cualquier otro campo (carrera, rango,
  // provincia, etc.) se ignora a propósito -- ROWS_INST no puede reflejarlo.
  function matchesInst(i, opts){
    opts = opts || {};
    if (opts.periodoOverride !== undefined){
      if (FI.periodo[i] !== opts.periodoOverride) return false;
    } else if (state.periodo && !state.periodo.has(FI.periodo[i])){
      return false;
    }
    if (opts.skipField !== "sexo" && crossIdx("sexo") != null && FI.sexo[i] !== state.cross.sexo) return false;
    if (opts.skipField !== "disc" && crossIdx("disc") != null && FI.disc[i] !== state.cross.disc) return false;
    if (opts.skipField !== "ecuador" && crossIdx("ecuador") != null && FI.ecuador[i] !== state.cross.ecuador) return false;
    return true;
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
  // Sumar a través de varios periodos sobrestima (alguien matriculado en 3 de
  // los 11 periodos se contaría 3 veces) -- así que, salvo Evolución (que
  // muestra un punto por periodo, nunca los suma), todo el resto del
  // dashboard exige exactamente un periodo seleccionado.
  function singlePeriodSelected(){ return !!(state.periodo && state.periodo.size === 1); }
  const PERIOD_BLOCK_MSG = "Selecciona un solo periodo para ver este gráfico";

  function renderKpis(){
    const alertEl = document.getElementById("kpiInstAlert");
    if (!singlePeriodSelected()){
      ["kpiInscripcionesValue","kpiDobleCarreraValue","kpiSexoMujeresValue",
       "kpiSexoHombresValue","kpiDiscapacidadValue","kpiInternacionalValue"
      ].forEach(id => document.getElementById(id).textContent = "0");
      if (alertEl) alertEl.hidden = false;
      return;
    }
    if (alertEl) alertEl.hidden = true;

    const mIdx = D.sexo.indexOf("MUJER"), hIdx = D.sexo.indexOf("HOMBRE");
    const exIdx = D.ecuador.indexOf("Extranjero");
    const sinDiscIdx = D.discapacidad.indexOf("SIN DISCAPACIDAD");

    // Los KPI institucionales usan ROWS_INST (exacta para sexo/disc/ecuador
    // por periodo) -- por eso solo reaccionan al filtro de Periodo y a
    // cross-filters de sexo/disc/ecuador, no a Carrera/Modalidad/Sede.
    let nInsc=0, nMujeres=0, nHombres=0, nConDisc=0, nExtranjero=0;
    for (let i=0;i<NI;i++){
      if (!matchesInst(i)) continue;
      nInsc += FI.nInsc[i];
      if (FI.sexo[i] === mIdx) nMujeres += FI.nPersonas[i];
      else if (FI.sexo[i] === hIdx) nHombres += FI.nPersonas[i];
      if (FI.disc[i] !== sinDiscIdx) nConDisc += FI.nPersonas[i];
      if (FI.ecuador[i] === exIdx) nExtranjero += FI.nPersonas[i];
    }

    // MULTI_CARRERA es un entero por periodo -- con exactamente un periodo
    // seleccionado, esto ya es exacto (sin riesgo de sobreconteo).
    const periodoIdx = [...state.periodo][0];
    const nDobleCarrera = MULTI[periodoIdx] || 0;

    document.getElementById("kpiInscripcionesValue").textContent = fmt.format(nInsc);
    document.getElementById("kpiDobleCarreraValue").textContent = fmt.format(nDobleCarrera);
    document.getElementById("kpiSexoMujeresValue").textContent = fmt.format(nMujeres);
    document.getElementById("kpiSexoHombresValue").textContent = fmt.format(nHombres);
    document.getElementById("kpiDiscapacidadValue").textContent = fmt.format(nConDisc);
    document.getElementById("kpiInternacionalValue").textContent = fmt.format(nExtranjero);
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
    const wrap = document.getElementById("chartCarrera"), note = document.getElementById("carreraNote");
    if (!singlePeriodSelected()){ wrap.innerHTML = '<div class="empty-state">'+PERIOD_BLOCK_MSG+'</div>'; note.textContent = ""; return; }
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
    const wrap = document.getElementById("chartModalidad");
    if (!singlePeriodSelected()){ wrap.innerHTML = '<div class="empty-state">'+PERIOD_BLOCK_MSG+'</div>'; return; }
    const agg = aggregate("modalidad");
    const data = D.modalidad.map((name,idx)=>({label:cap(name), value:(agg.get(idx)||{n:0}).n, idx})).sort((a,b)=>b.value-a.value);
    barChartH(document.getElementById("chartModalidad"), data, {
      rowH:24, labelW:110, W: chartW("chartModalidad", 600), ariaLabel:"Inscripciones por modalidad",
      selectedIdx: crossIdx("modalidad"),
      onClick: (d)=> setCross("modalidad", d.idx)
    });
  }

  function renderSede(){
    const wrap = document.getElementById("chartSede");
    if (!singlePeriodSelected()){ wrap.innerHTML = '<div class="empty-state">'+PERIOD_BLOCK_MSG+'</div>'; return; }
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
    const wrap = document.getElementById("chartGrupo");
    if (!singlePeriodSelected()){ wrap.innerHTML = '<div class="empty-state">'+PERIOD_BLOCK_MSG+'</div>'; return; }
    const agg = aggregate("grupo");
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
    const wrap = document.getElementById("chartEtnia");
    if (!singlePeriodSelected()){ wrap.innerHTML = '<div class="empty-state">'+PERIOD_BLOCK_MSG+'</div>'; return; }
    const agg = aggregate("etnia");
    const data = D.etnia.map((name,idx)=>({label:name, value:(agg.get(idx)||{n:0}).n, idx}))
      .filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
    barChartH(document.getElementById("chartEtnia"), data, {
      rowH:28, labelW:130, W: chartW("chartEtnia", 600), unit:"personas", ariaLabel:"Autoidentificación étnica",
      selectedIdx: crossIdx("etnia"),
      onClick: (d)=> setCross("etnia", d.idx)
    });
  }

  function renderDisc(){
    const wrap = document.getElementById("chartDisc"), note = document.getElementById("discNote");
    if (!singlePeriodSelected()){ wrap.innerHTML = '<div class="empty-state">'+PERIOD_BLOCK_MSG+'</div>'; note.textContent = ""; return; }
    const agg = aggregate("disc");
    const sinIdx = findIdxCI(D.discapacidad, "SIN DISCAPACIDAD");
    const total = sumRaw();
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
    if (!singlePeriodSelected()){
      document.getElementById("chartPyramid").innerHTML = '<div class="empty-state">'+PERIOD_BLOCK_MSG+'</div>';
      document.getElementById("pyramidStats").innerHTML = "";
      document.getElementById("pyramidNote").textContent = "";
      return;
    }
    const mIdx = D.sexo.indexOf("MUJER"), hIdx = D.sexo.indexOf("HOMBRE");
    const counts = {};
    let inconsistentN = 0, inconsistentH = 0, inconsistentM = 0;
    for (let i=0;i<N;i++){
      if (!matches(i)) continue;
      if (F.rango[i] === INCONSISTENT_RANGO_IDX){
        inconsistentN += F.nInsc[i];
        if (F.sexo[i] === hIdx) inconsistentH += F.nInsc[i];
        else if (F.sexo[i] === mIdx) inconsistentM += F.nInsc[i];
        continue;
      }
      const rIdx = F.rango[i];
      if (!counts[rIdx]) counts[rIdx] = {h:0, m:0};
      if (F.sexo[i] === hIdx) counts[rIdx].h += F.nInsc[i];
      else if (F.sexo[i] === mIdx) counts[rIdx].m += F.nInsc[i];
    }
    const data = pyramidBands.map(name=>{
      const idx = D.rango.indexOf(name);
      const c = counts[idx] || {h:0, m:0};
      return {label:name, h:c.h, m:c.m, idx};
    });
    let hTotal=0, mTotal=0;
    data.forEach(d=>{ hTotal+=d.h; mTotal+=d.m; });
    renderPyramidStats(hIdx, mIdx, hTotal, mTotal);
    document.getElementById("pyramidNote").textContent =
      "Excluye " + fmt.format(inconsistentN) + " inscripción" + (inconsistentN===1?"":"es") + " con dato de edad inconsistente"
      + " (" + fmt.format(inconsistentM) + " mujeres, " + fmt.format(inconsistentH) + " hombres)";
    pyramidChart(document.getElementById("chartPyramid"), data, {
      W: chartW("chartPyramid", 760), ariaLabel:"Estructura de la población por sexo y edad de ingreso",
      selectedIdx: crossIdx("rango"),
      onClick: (d)=> setCross("rango", d.idx)
    });
  }

  function renderEcuadorSplit(){
    const wrap = document.getElementById("chartEcuador");
    if (!singlePeriodSelected()){ wrap.innerHTML = '<div class="empty-state">'+PERIOD_BLOCK_MSG+'</div>'; return; }
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

  function clearMapPaths(svg){
    if (!svg) return;
    svg.querySelectorAll("path").forEach(p=>{
      p.style.fill = ""; p.style.opacity = ""; p.style.stroke = ""; p.style.strokeWidth = "";
      p.classList.remove("has-data");
    });
  }

  function renderWorldMap(){
    const blockEl = document.getElementById("worldMapBlock");
    const noteEl0 = document.getElementById("worldMapNote");
    if (!singlePeriodSelected()){
      worldMapCounts = {};
      clearMapPaths(document.getElementById("worldMapSvg"));
      if (noteEl0) noteEl0.textContent = "";
      if (blockEl) blockEl.hidden = false;
      return;
    }
    if (blockEl) blockEl.hidden = true;
    const counts = {};
    const ecuadorIdx = D.pais.indexOf("ECUADOR");
    for (let i=0;i<N;i++){
      if (!matches(i)) continue;
      const idx = F.pais[i];
      const paisName = D.pais[idx];
      const iso = idx === ecuadorIdx ? "ECU" : PAIS_ISO[paisName];
      if (!iso) continue; // "No registra" o país sin polígono en el atlas
      if (!counts[iso]) counts[iso] = { name: idx === ecuadorIdx ? "Ecuador" : titleCase(paisName), n: 0, idx };
      counts[iso].n += F.nInsc[i];
    }
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
    const blockEl = document.getElementById("ecuadorMapBlock");
    if (!singlePeriodSelected()){
      ecuadorMapCounts = {};
      clearMapPaths(document.getElementById("ecuadorMapSvg"));
      if (blockEl) blockEl.hidden = false;
      return;
    }
    if (blockEl) blockEl.hidden = true;
    // Siempre acotado a Ecuador (provincia no aplica a extranjeros) - ignora
    // un cross-filter de "ecuador" activo.
    const ecIdx = D.ecuador.indexOf("Ecuador");
    const counts = {};
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
      const idx = F.provincia[i];
      const provName = D.provincia[idx];
      const iso = PROVINCIA_ISO[provName];
      if (!iso) continue; // "No registra"
      if (!counts[iso]) counts[iso] = { name: titleCase(provName), n: 0, idx };
      counts[iso].n += F.nInsc[i];
    }
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

  /* ---------- Zoom/pan de mapas: rueda para zoom (centrado en el cursor),
     arrastrar para desplazar. Un arrastre real marca svg.dataset.justDragged
     para que el "click" de filtrado (más abajo) lo ignore -- así un clic
     simple sigue filtrando por país/provincia como antes. */
  function wireMapZoom(svg, wrapId){
    if (!svg) return;
    const wrap = document.getElementById(wrapId);
    const vb = svg.viewBox.baseVal;
    const base = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
    let vx = base.x, vy = base.y, vw = base.w, vh = base.h;
    const MIN_W = base.w * 0.12;

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "map-reset-zoom";
    resetBtn.textContent = "Restablecer zoom";
    resetBtn.hidden = true;
    wrap.appendChild(resetBtn);

    function apply(){
      svg.setAttribute("viewBox", vx+" "+vy+" "+vw+" "+vh);
      resetBtn.hidden = vw >= base.w - 0.01;
    }
    function reset(){ vx=base.x; vy=base.y; vw=base.w; vh=base.h; apply(); }
    resetBtn.addEventListener("click", (e)=>{ e.stopPropagation(); reset(); });

    svg.addEventListener("wheel", (e)=>{
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const mx = vx + (px/rect.width) * vw;
      const my = vy + (py/rect.height) * vh;
      const factor = e.deltaY < 0 ? 0.85 : 1/0.85;
      const newW = Math.min(base.w, Math.max(MIN_W, vw * factor));
      const newH = newW * (base.h/base.w);
      vx = mx - (px/rect.width) * newW;
      vy = my - (py/rect.height) * newH;
      vw = newW; vh = newH;
      apply();
    }, { passive:false });

    let dragging=false, moved=false, lastX=0, lastY=0, pointerId=null;
    svg.addEventListener("pointerdown", (e)=>{
      if (e.button !== 0) return;
      dragging = true; moved = false;
      lastX = e.clientX; lastY = e.clientY;
      pointerId = e.pointerId;
      // OJO: no capturar el puntero aquí todavía. setPointerCapture hace que
      // Chrome retargete el "click" resultante al propio <svg> en vez del
      // <path> real bajo el cursor, así que un clic simple (sin arrastre)
      // dejaría de encontrar el país/provincia clickeado. Solo se captura
      // más abajo, una vez confirmado un arrastre real.
    });
    svg.addEventListener("pointermove", (e)=>{
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)){
        moved = true;
        try { svg.setPointerCapture(pointerId); } catch(err){}
      }
      if (!moved) return;
      const rect = svg.getBoundingClientRect();
      vx -= dx / rect.width * vw;
      vy -= dy / rect.height * vh;
      lastX = e.clientX; lastY = e.clientY;
      apply();
      hideTip();
    });
    function endDrag(){
      dragging = false;
      svg.dataset.justDragged = moved ? "1" : "";
    }
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);
    svg.addEventListener("dblclick", (e)=>{ e.stopPropagation(); reset(); });
  }

  /* ---------- Wire controls ---------- */
  const worldMapSvg = document.getElementById("worldMapSvg");
  if (worldMapSvg) {
    wireMapZoom(worldMapSvg, "worldMapWrap");
    worldMapSvg.addEventListener("mousemove", (e)=>{
      const path = e.target.closest("path");
      const iso = path && path.id ? path.id.slice(2) : null;
      const c = iso ? worldMapCounts[iso] : null;
      if (!c) { hideTip(); return; }
      showTip(e, "<b>"+c.name+"</b><br>"+fmt.format(c.n)+" inscripciones");
    });
    worldMapSvg.addEventListener("mouseleave", hideTip);
    worldMapSvg.addEventListener("click", (e)=>{
      if (worldMapSvg.dataset.justDragged === "1"){ worldMapSvg.dataset.justDragged = ""; return; }
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
    wireMapZoom(ecuadorMapSvg, "ecuadorMapWrap");
    ecuadorMapSvg.addEventListener("mousemove", (e)=>{
      const path = e.target.closest("path");
      const iso = path && path.id ? path.id.slice(2) : null;
      const c = iso ? ecuadorMapCounts[iso] : null;
      if (!c) { hideTip(); return; }
      showTip(e, "<b>"+c.name+"</b><br>"+fmt.format(c.n)+" inscripciones");
    });
    ecuadorMapSvg.addEventListener("mouseleave", hideTip);
    ecuadorMapSvg.addEventListener("click", (e)=>{
      if (ecuadorMapSvg.dataset.justDragged === "1"){ ecuadorMapSvg.dataset.justDragged = ""; return; }
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
  // "Reacciona solo a Periodo" aplica a los 5 KPI institucionales por igual
  // (todos vienen de ROWS_INST), pero el POR QUÉ es distinto para Inscripciones
  // -- que nunca pretende ser un conteo de personas -- que para los otros 4,
  // que sí lo son y por eso necesitan la ventana de un solo periodo para ser exactos.
  const kpiPeriodoOnlyNote = " Solo reacciona al filtro de Periodo (no a Carrera/Modalidad/Sede), igual que el resto de los indicadores institucionales.";
  const kpiInstNote = " Solo reacciona al filtro de Periodo (no a Carrera/Modalidad/Sede), para que el conteo de personas únicas sea siempre exacto.";
  wireInfoIcon("kpiInscripcionesInfo", "Cuenta cada matrícula: un estudiante en más de una carrera se cuenta varias veces aquí, a diferencia de Mujeres/Hombres (personas únicas)." + kpiPeriodoOnlyNote);
  wireInfoIcon("kpiDobleCarreraInfo", "Personas matriculadas en 2 o más carreras distintas a la vez dentro del periodo seleccionado. Solo cuenta carreras de esta facultad -- si alguien tiene una segunda carrera en otra facultad de la universidad, esos datos no están en este dashboard." + kpiInstNote);
  wireInfoIcon("kpiSexoInfo", "Personas únicas por sexo, sin importar en cuántas carreras estén matriculadas a la vez." + kpiInstNote);
  wireInfoIcon("kpiDiscapacidadInfo", "Personas únicas que reportan algún tipo de discapacidad." + kpiInstNote);
  wireInfoIcon("kpiInternacionalInfo", "Personas únicas con país de origen distinto a Ecuador." + kpiInstNote);

  // Estos gráficos cuentan inscripciones (como Inscripciones únicas arriba),
  // no personas -- aunque el título diga "estudiantes" o "población". Alguien
  // matriculado en 2 carreras a la vez puede aparecer 2 veces.
  const inscOverlapNote = " Cuenta inscripciones, no personas -- un estudiante matriculado en 2 carreras a la vez puede aparecer 2 veces aquí.";
  wireInfoIcon("grupoInfo", "Personas por grupo socioeconómico." + inscOverlapNote);
  wireInfoIcon("etniaInfo", "Personas por autoidentificación étnica." + inscOverlapNote);
  wireInfoIcon("discInfo", "Personas por tipo de discapacidad reportado." + inscOverlapNote);
  wireInfoIcon("pyramidInfo", "Estructura por sexo y edad de ingreso a la carrera." + inscOverlapNote + " Además excluye las inscripciones con edad inconsistente (ver nota abajo) -- por ambas razones, el total no va a coincidir con Mujeres/Hombres arriba.");
  wireInfoIcon("ecuadorSplitInfo", "Distribución de inscripciones entre Ecuador y el extranjero." + inscOverlapNote);
  wireInfoIcon("worldMapInfo", "País de origen más reciente por inscripción." + inscOverlapNote);
  wireInfoIcon("ecuadorMapInfo", "Provincia de origen más reciente por inscripción, solo estudiantes de Ecuador." + inscOverlapNote);
  wireInfoIcon("carreraInfo", "Inscripciones por carrera." + inscOverlapNote);
  wireInfoIcon("modsedeInfo", "Inscripciones por modalidad y por sede." + inscOverlapNote);
  wireInfoIcon("trendInfo", "El único gráfico que no exige un solo periodo: siempre muestra la evolución completa, sin importar cuántos periodos tengas seleccionados." + inscOverlapNote);

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
      tituloIndicadores:36, tituloGraficos:36,
      kpiInscripciones:110, kpiDobleCarrera:110, kpiSexo:110, kpiDiscapacidad:110, kpiInternacional:110,
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
    tituloIndicadores: { left:"15px",      top:"0px",       width:"1118px", height:"32px" },
    kpiInscripciones:  { left:"22px",      top:"31px",      width:"272px",  height:"166px" },
    kpiDobleCarrera:   { left:"644px",     top:"38px",      width:"275px",  height:"158px" },
    kpiSexo:           { left:"327px",     top:"33px",      width:"279px",  height:"162px" },
    kpiDiscapacidad:   { left:"955px",     top:"39px",      width:"279px",  height:"156px" },
    kpiInternacional:  { left:"1276px",    top:"38px",      width:"257px",  height:"160px" },
    tituloGraficos:    { left:"17px",      top:"202px",     width:"1118px", height:"32px" },
    trend:             { left:"22px",      top:"255px",     width:"405px",  height:"248px" },
    modsede:           { left:"444.953px", top:"250.969px", width:"351px",  height:"250px" },
    carrera:           { left:"809.953px", top:"245.953px", width:"723px",  height:"252px" },
    etnia:             { left:"352.984px", top:"513.984px", width:"302px",  height:"251px" },
    grupo:             { left:"664.984px", top:"514.984px", width:"280px",  height:"248px" },
    pyramid:           { left:"21px",      top:"517.953px", width:"313px",  height:"472px" },
    disc:              { left:"352.984px", top:"778.984px", width:"584px",  height:"209px" },
    ecuadorsplit:      { left:"958.969px", top:"512.969px", width:"585px",  height:"141px" },
    worldmap:          { left:"958px",     top:"661.969px", width:"298px",  height:"329px" },
    ecuadormap:        { left:"1266.98px", top:"665.203px", width:"282px",  height:"332px" }
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
