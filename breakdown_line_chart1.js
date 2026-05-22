const lineChartBreakdownViz = {
  id: "line_chart_breakdown",
  label: "Line Chart (Breakdown)",
  options: {},

  create: function(element, config) {
    element.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      .lc-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 12px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; }
      .lc-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
      .lc-controls label { font-size: 12px; color: #6b6b6b; flex-shrink: 0; }
      .lc-controls select { font-size: 12px; padding: 3px 7px; border-radius: 6px; border: 1px solid #ddd; background: #fff; color: #333; cursor: pointer; }

      /* Multi-select filter */
      .lc-filter-wrap { position: relative; }
      .lc-filter-btn { font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid #ddd; background: #fff; color: #333; cursor: pointer; white-space: nowrap; }
      .lc-filter-btn:hover { border-color: #aaa; }
      .lc-dropdown { display: none; position: absolute; top: calc(100% + 4px); left: 0; background: #fff; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); z-index: 100; min-width: 180px; max-height: 260px; overflow-y: auto; padding: 6px 0; }
      .lc-dropdown.open { display: block; }
      .lc-dropdown-item { display: flex; align-items: center; gap: 8px; padding: 5px 12px; cursor: pointer; font-size: 12px; color: #333; }
      .lc-dropdown-item:hover { background: #f5f5f5; }
      .lc-dropdown-item input { accent-color: #713170; cursor: pointer; margin: 0; }
      .lc-dropdown-divider { border: none; border-top: 1px solid #eee; margin: 4px 0; }
      .lc-dropdown-action { padding: 4px 12px; font-size: 11px; color: #713170; cursor: pointer; }
      .lc-dropdown-action:hover { text-decoration: underline; }

      .lc-legend { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 2px; }
      .lc-legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #555; }
      .lc-legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
      .lc-chart-wrap { flex: 1; position: relative; min-height: 200px; }
      .lc-svg { width: 100%; height: 100%; }
      .lc-axis-label { font-size: 11px; fill: #888; }
      .lc-tooltip { position: absolute; background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; font-size: 12px; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: none; z-index: 10; min-width: 160px; max-width: 240px; }
      .lc-tooltip-title { font-weight: 600; color: #222; margin-bottom: 6px; }
      .lc-tooltip-row { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
      .lc-tooltip-swatch { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .lc-tooltip-val { color: #444; }
      .lc-debug { font-size: 11px; color: #aaa; padding: 8px; background: #fafafa; border-radius: 4px; }
    `;
    element.appendChild(style);
    const wrap = document.createElement("div");
    wrap.className = "lc-wrap";
    element.appendChild(wrap);
    this._wrap = wrap;
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    const wrap = this._wrap;
    wrap.innerHTML = "";

    const dims     = queryResponse.fields.dimensions || [];
    const measures = (queryResponse.fields.measures || []).concat(queryResponse.fields.table_calculations || []);

    if (dims.length < 2 || !measures.length || !data.length) {
      wrap.innerHTML = `<div class="lc-debug">Add a date dimension, a breakdown dimension, then at least one measure.</div>`;
      done(); return;
    }

    const xDimField      = dims[1];
    const breakdownField = dims[0];


    // Brand palette
    const PALETTE = [
      "#713170", "#274C46", "#F2A900", "#96A44F", "#BE0021",
      "#E65A1E", "#553527", "#556041", "#FFB4A8", "#7c1334"
    ];

    // ── Build all series upfront ──────────────────────────────────────────────
    function buildAllSeries(measure) {
      const xOrder = [], xSeen = new Set();
      data.forEach(row => {
        const v = String(row[xDimField.name].rendered || row[xDimField.name].value || "");
        if (v && !xSeen.has(v)) { xSeen.add(v); xOrder.push(v); }
      });

      const seriesMap = {};
      data.forEach(row => {
        const xVal  = String(row[xDimField.name].rendered || row[xDimField.name].value || "");
        const bVal  = String(row[breakdownField.name].rendered || row[breakdownField.name].value || "");
        const yCell = row[measure.name] || {};
        const yVal  = (yCell.value !== null && yCell.value !== undefined) ? Number(yCell.value) : null;
        if (!seriesMap[bVal]) seriesMap[bVal] = {};
        seriesMap[bVal][xVal] = { y: yVal, rendered: yCell.rendered || null, links: yCell.links || [] };
      });

      return {
        xLabels: xOrder,
        series: Object.keys(seriesMap).sort().map((bVal, idx) => ({
          label: bVal,
          color: PALETTE[idx % PALETTE.length],
          points: xOrder.map(x => seriesMap[bVal][x] || { y: null, rendered: null, links: [] })
        }))
      };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function fmtValue(v, field) {
      if (v === null || v === undefined) return "—";
      const fname = ((field.name || "") + (field.value_format || "")).toLowerCase();
      const label = (field.label_short || field.label || "").toLowerCase();
      const isCurrency = fname.includes("gbp") || fname.includes("cost") || fname.includes("cpa") || label.includes("cost") || label.includes("cpa");
      if (isCurrency) return Math.abs(v) < 100 ? "£" + v.toFixed(2) : "£" + Math.round(v).toLocaleString("en-GB");
      if (Math.abs(v) < 10) return v.toFixed(2);
      return Math.round(v).toLocaleString("en-GB");
    }

    function fmtTick(v, field) {
      const fname = ((field.name || "") + (field.value_format || "")).toLowerCase();
      const label = (field.label_short || field.label || "").toLowerCase();
      const isCurrency = fname.includes("gbp") || fname.includes("cost") || fname.includes("cpa") || label.includes("cost") || label.includes("cpa");
      const prefix = isCurrency ? "£" : "";
      const abs = Math.abs(v), sign = v < 0 ? "-" : "";
      if (abs >= 1000000) return sign + prefix + (abs / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
      if (abs >= 1000)    return sign + prefix + (abs / 1000).toFixed(1).replace(/\.0$/, "") + "k";
      if (abs < 10 && abs !== 0) return sign + prefix + abs.toFixed(1);
      return sign + prefix + Math.round(abs).toLocaleString("en-GB");
    }

    function niceNum(range, round) {
      const exp = Math.floor(Math.log10(range)), frac = range / Math.pow(10, exp);
      let nice;
      if (round) { nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10; }
      else        { nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10; }
      return nice * Math.pow(10, exp);
    }

    function niceTicks(minV, maxV) {
      const range = niceNum(Math.max(maxV - minV, 1), false);
      const interval = niceNum(range / 5, true);
      const nMin = Math.floor(minV / interval) * interval;
      const nMax = Math.ceil(maxV / interval) * interval;
      const ticks = [];
      for (let v = nMin; v <= nMax + interval * 0.5; v += interval) ticks.push(Math.round(v * 1e10) / 1e10);
      return { ticks, nMin, nMax };
    }

    // ── Controls row ──────────────────────────────────────────────────────────
    const controls = document.createElement("div");
    controls.className = "lc-controls";

    // Metric selector
    const lblM = document.createElement("label");
    lblM.textContent = "Metric";
    controls.appendChild(lblM);
    const selM = document.createElement("select");
    measures.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = i; o.textContent = m.label_short || m.label || m.name;
      selM.appendChild(o);
    });
    controls.appendChild(selM);

    // Series filter button + dropdown
    const filterWrap = document.createElement("div");
    filterWrap.className = "lc-filter-wrap";
    const filterBtn = document.createElement("button");
    filterBtn.className = "lc-filter-btn";
    filterBtn.textContent = "Filter series ▾";
    filterWrap.appendChild(filterBtn);

    const dropdown = document.createElement("div");
    dropdown.className = "lc-dropdown";
    filterWrap.appendChild(dropdown);
    controls.appendChild(filterWrap);

    // Close dropdown when clicking outside
    document.addEventListener("click", function onOutside(e) {
      if (!filterWrap.contains(e.target)) dropdown.classList.remove("open");
    });
    filterBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });

    // Legend
    const legend = document.createElement("div");
    legend.className = "lc-legend";
    controls.appendChild(legend);

    wrap.appendChild(controls);

    const chartWrap = document.createElement("div");
    chartWrap.className = "lc-chart-wrap";
    wrap.appendChild(chartWrap);

    const tooltip = document.createElement("div");
    tooltip.className = "lc-tooltip";
    chartWrap.appendChild(tooltip);

    // ── State ─────────────────────────────────────────────────────────────────
    let allSeries  = [];
    let xLabels    = [];
    let activeSet  = new Set();  // labels of visible series

    function updateFilterBtn() {
      const total   = allSeries.length;
      const visible = allSeries.filter(s => activeSet.has(s.label)).length;
      filterBtn.textContent = visible === total ? "Filter series ▾" : `${visible} / ${total} series ▾`;
    }

    function buildDropdown() {
      dropdown.innerHTML = "";

      // Select all / none
      const allAction = document.createElement("div");
      allAction.className = "lc-dropdown-action";
      allAction.textContent = "Select all";
      allAction.addEventListener("click", function(e) {
        e.stopPropagation();
        allSeries.forEach(s => activeSet.add(s.label));
        buildDropdown();
        updateFilterBtn();
        renderChart(parseInt(selM.value) || 0);
      });
      dropdown.appendChild(allAction);

      const noneAction = document.createElement("div");
      noneAction.className = "lc-dropdown-action";
      noneAction.textContent = "Select none";
      noneAction.addEventListener("click", function(e) {
        e.stopPropagation();
        activeSet.clear();
        buildDropdown();
        updateFilterBtn();
        renderChart(parseInt(selM.value) || 0);
      });
      dropdown.appendChild(noneAction);

      const divider = document.createElement("hr");
      divider.className = "lc-dropdown-divider";
      dropdown.appendChild(divider);

      allSeries.forEach(function(s) {
        const item = document.createElement("label");
        item.className = "lc-dropdown-item";
        item.addEventListener("click", e => e.stopPropagation());

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = activeSet.has(s.label);
        cb.addEventListener("change", function() {
          if (cb.checked) activeSet.add(s.label);
          else activeSet.delete(s.label);
          updateFilterBtn();
          renderChart(parseInt(selM.value) || 0);
        });

        const swatch = document.createElement("span");
        swatch.className = "lc-legend-dot";
        swatch.style.background = s.color;

        item.appendChild(cb);
        item.appendChild(swatch);
        item.appendChild(document.createTextNode(s.label));
        dropdown.appendChild(item);
      });
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function renderChart(mIdx) {
      const oldSvg = chartWrap.querySelector("svg");
      if (oldSvg) oldSvg.remove();
      legend.innerHTML = "";

      const measure = measures[mIdx];
      const built   = buildAllSeries(measure);
      xLabels  = built.xLabels;

      // First run: set allSeries and default activeSet to all
      if (allSeries.length === 0 || allSeries.map(s=>s.label).join() !== built.series.map(s=>s.label).join()) {
        allSeries = built.series;
        activeSet = new Set(allSeries.map(s => s.label));
        buildDropdown();
        updateFilterBtn();
      } else {
        allSeries = built.series; // update colours/points but keep activeSet
      }

      const visibleSeries = allSeries.filter(s => activeSet.has(s.label));

      if (!xLabels.length || !visibleSeries.length) {
        chartWrap.innerHTML = '<div class="lc-debug">No series selected.</div>';
        return;
      }

      const allY = visibleSeries.flatMap(s => s.points.map(p => p.y)).filter(v => v !== null);
      if (!allY.length) return;
      const { ticks, nMin, nMax } = niceTicks(Math.min(...allY), Math.max(...allY));

      const W = chartWrap.clientWidth || 600;
      const H = chartWrap.clientHeight || 300;
      const marginL = 65, marginR = 20, marginT = 20, marginB = 50;
      const plotW = W - marginL - marginR;
      const plotH = H - marginT - marginB;
      const n = xLabels.length;

      const xScale = i => marginL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
      const yScale = v => marginT + plotH - ((v - nMin) / (nMax - nMin || 1)) * plotH;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      svg.classList.add("lc-svg");

      // Gridlines + left axis
      ticks.forEach(v => {
        const y = yScale(v);
        const grid = document.createElementNS("http://www.w3.org/2000/svg", "line");
        grid.setAttribute("x1", marginL); grid.setAttribute("x2", W - marginR);
        grid.setAttribute("y1", y); grid.setAttribute("y2", y);
        grid.setAttribute("stroke", "#f0f0f0"); grid.setAttribute("stroke-width", "1");
        svg.appendChild(grid);
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", marginL - 6); txt.setAttribute("y", y + 4);
        txt.setAttribute("text-anchor", "end");
        txt.classList.add("lc-axis-label");
        txt.textContent = fmtTick(v, measure);
        svg.appendChild(txt);
      });

      // X axis labels
      const maxLabels = Math.floor(plotW / 60);
      const step = Math.max(1, Math.ceil(n / maxLabels));
      xLabels.forEach((lbl, i) => {
        const x = xScale(i);
        const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick.setAttribute("x1", x); tick.setAttribute("x2", x);
        tick.setAttribute("y1", marginT + plotH); tick.setAttribute("y2", marginT + plotH + 4);
        tick.setAttribute("stroke", "#ddd");
        svg.appendChild(tick);
        if (i % step === 0) {
          const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
          txt.setAttribute("x", x); txt.setAttribute("y", marginT + plotH + 16);
          txt.setAttribute("text-anchor", "middle");
          txt.classList.add("lc-axis-label");
          txt.textContent = lbl;
          svg.appendChild(txt);
        }
      });

      // Lines + dots
      visibleSeries.forEach(function(s) {
        const valid = s.points.map((p, i) => ({ ...p, i })).filter(p => p.y !== null);
        if (valid.length < 1) return;

        if (valid.length >= 2) {
          let d = `M ${xScale(valid[0].i)} ${yScale(valid[0].y)}`;
          valid.slice(1).forEach(p => { d += ` L ${xScale(p.i)} ${yScale(p.y)}`; });
          const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
          line.setAttribute("d", d);
          line.setAttribute("fill", "none");
          line.setAttribute("stroke", s.color);
          line.setAttribute("stroke-width", "2");
          line.setAttribute("stroke-linejoin", "round");
          line.setAttribute("stroke-linecap", "round");
          svg.appendChild(line);
        }

        valid.forEach(function(p) {
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", xScale(p.i)); dot.setAttribute("cy", yScale(p.y));
          dot.setAttribute("r", "4");
          dot.setAttribute("fill", s.color);
          dot.setAttribute("stroke", "#fff"); dot.setAttribute("stroke-width", "2");
          dot.style.cursor = "pointer";

          dot.addEventListener("mouseenter", function(e) {
            const rows = visibleSeries.map(function(ser) {
              const pt = ser.points[p.i];
              if (!pt || pt.y === null) return "";
              return `<div class="lc-tooltip-row">
                <span class="lc-tooltip-swatch" style="background:${ser.color}"></span>
                <span class="lc-tooltip-val">${ser.label}: ${pt.rendered || fmtValue(pt.y, measure)}</span>
              </div>`;
            }).join("");
            tooltip.innerHTML = `<div class="lc-tooltip-title">${xLabels[p.i]}</div>${rows}`;
            tooltip.style.display = "block";
          });
          dot.addEventListener("mousemove", function(e) {
            const rect = chartWrap.getBoundingClientRect();
            let left = e.clientX - rect.left + 12;
            let top  = e.clientY - rect.top  - 10;
            if (left + 200 > rect.width) left = e.clientX - rect.left - 200;
            tooltip.style.left = left + "px"; tooltip.style.top = top + "px";
          });
          dot.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
          if (p.links && p.links.length) {
            dot.addEventListener("click", e => LookerCharts.Utils.openDrillMenu({ links: p.links, event: e }));
          }
          svg.appendChild(dot);
        });
      });

      chartWrap.appendChild(svg);

      // Legend
      visibleSeries.forEach(function(s) {
        const item = document.createElement("div");
        item.className = "lc-legend-item";
        item.innerHTML = `<span class="lc-legend-dot" style="background:${s.color}"></span>${s.label}`;
        legend.appendChild(item);
      });
    }

    renderChart(parseInt(selM.value) || 0);
    selM.addEventListener("change", function() {
      allSeries = []; // reset so series list rebuilds on metric change
      renderChart(parseInt(selM.value) || 0);
    });

    done();
  }
};

looker.plugins.visualizations.add(lineChartBreakdownViz);
