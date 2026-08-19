const lineChartViz = {
  id: "line_chart_breakdown",
  label: "Line Chart (Breakdown)",
  options: {
    is_low_good: {
      type: "boolean",
      label: "Lower is better (e.g. CPA)",
      default: false,
      section: "Style"
    },
    y_zero_base: {
      type: "boolean",
      label: "Y axis starts at zero",
      default: true,
      section: "Style"
    }
  },

  create: function(element, config) {
    element.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      .lc-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 12px; overflow-x: auto; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; }
      .lc-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
      .lc-controls label { font-size: 12px; color: #6b6b6b; }
      .lc-controls select { font-size: 12px; padding: 3px 7px; border-radius: 6px; border: 1px solid #ddd; background: #fff; color: #333; cursor: pointer; }
      .lc-legend { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-left: 4px; }
      .lc-legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #555; cursor: pointer; user-select: none; }
      .lc-legend-item.hidden { opacity: 0.35; text-decoration: line-through; }
      .lc-legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
      .lc-chart-wrap { flex: 1; position: relative; min-height: 200px; }
      .lc-svg { width: 100%; height: 100%; }
      .lc-axis-label { font-size: 11px; fill: #888; }
      .lc-tooltip { position: absolute; background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; font-size: 12px; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: none; z-index: 10; min-width: 160px; }
      .lc-tooltip-title { font-weight: 600; color: #222; margin-bottom: 6px; }
      .lc-tooltip-row { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
      .lc-tooltip-swatch { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .lc-tooltip-val { color: #444; }
      .lc-tooltip-pp { font-size: 11px; margin-left: auto; }
      .lc-pos { color: #1a7f45; }
      .lc-neg { color: #c0392b; }
      .lc-neu { color: #aaa; }
      .lc-debug { font-size: 11px; color: #aaa; padding: 8px; background: #fafafa; border-radius: 4px; margin-bottom: 10px; }
      .lc-divider { width: 1px; height: 18px; background: #e0e0e0; margin: 0 4px; }
      .lc-controls-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    `;
    element.appendChild(style);
    const wrap = document.createElement("div");
    wrap.className = "lc-wrap";
    element.appendChild(wrap);
    this._wrap = wrap;
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    const wrap = this._wrap;

    // ── persist selections across re-renders ──
    const existingSel  = wrap.querySelector('#lc-sel-primary');
    const existingSel2 = wrap.querySelector('#lc-sel-compare');
    const savedPrimary = existingSel  ? existingSel.value  : '0';
    const savedCompare = existingSel2 ? existingSel2.value : '-1';

    wrap.innerHTML = "";

    const dims     = queryResponse.fields.dimensions || [];
    const measures = (queryResponse.fields.measures || []).concat(queryResponse.fields.table_calculations || []);

    if (!dims.length || !measures.length || !data.length) {
      wrap.innerHTML = `<div class="lc-debug">No data. Add a date/period dimension (X axis) and the breakdown dimension, plus at least one measure.</div>`;
      done(); return;
    }

    // dim[0] = X axis (e.g. week), dim[1] = breakdown series (e.g. source_group value)
    const dimField       = dims[0];
    const breakdownField = dims.length > 1 ? dims[1] : null;

    const isLowGood = config.is_low_good || false;
    const zeroBase  = config.y_zero_base !== false;

    // ── Colour palette (Looker-ish, enough for ~11 values) ──
    const PALETTE = [
      "#713170", "#F2A900", "#96A34F", "#274C46", "#553527",
      "#BE0021", "#FFB4A8", "#E65A1E", "#556041", "#7C1334", "#EAE5DC"
    ];
    // ── Collect all breakdown series values ──
    let seriesValues = [];
    if (breakdownField) {
      const seen = new Set();
      data.forEach(row => {
        const cell = row[breakdownField.name];
        const val  = cell ? String(cell.rendered || cell.value || "") : "(none)";
        if (!seen.has(val)) { seen.add(val); seriesValues.push(val); }
      });
      seriesValues.sort();
    } else {
      seriesValues = ["All"];
    }

    // Map series → colour
    const seriesColour = {};
    seriesValues.forEach((v, i) => { seriesColour[v] = PALETTE[i % PALETTE.length]; });

    // ── Hidden series state (legend click to toggle) ──
    // Persist via a data attribute on wrap
    let hiddenSeries = new Set(
      wrap.dataset.hidden ? JSON.parse(wrap.dataset.hidden) : []
    );

    // ── Controls: metric selectors ──
    const controls = document.createElement("div");
    controls.className = "lc-controls";

    const lbl = document.createElement("label");
    lbl.textContent = "Metric";
    controls.appendChild(lbl);

    const sel = document.createElement("select");
    sel.id = "lc-sel-primary";
    measures.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = m.label_short || m.label || m.name;
      sel.appendChild(o);
    });
    sel.value = savedPrimary || "0";
    controls.appendChild(sel);

    const lbl2 = document.createElement("label");
    lbl2.textContent = "Compare to";
    controls.appendChild(lbl2);

    const sel2 = document.createElement("select");
    sel2.id = "lc-sel-compare";
    const noneOpt = document.createElement("option");
    noneOpt.value = "-1";
    noneOpt.textContent = "None";
    sel2.appendChild(noneOpt);
    measures.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = m.label_short || m.label || m.name;
      sel2.appendChild(o);
    });
    sel2.value = savedCompare || "-1";
    controls.appendChild(sel2);

    wrap.appendChild(controls);

    // ── Legend row (series toggles) ──
    const legendRow = document.createElement("div");
    legendRow.className = "lc-controls-row";

    const legend = document.createElement("div");
    legend.className = "lc-legend";
    legendRow.appendChild(legend);
    wrap.appendChild(legendRow);

    // ── Chart area ──
    const chartWrap = document.createElement("div");
    chartWrap.className = "lc-chart-wrap";
    wrap.appendChild(chartWrap);

    const tooltip = document.createElement("div");
    tooltip.className = "lc-tooltip";
    chartWrap.appendChild(tooltip);

    // ── Helpers ──
    function isPercentField(field) {
      const fmt = ((field.value_format || "") + (field.value_format_name || "")).toLowerCase();
      return fmt.indexOf("%") > -1 || fmt.indexOf("percent") > -1;
    }

    function isCurrencyField(field) {
      const fname = ((field.name || "") + (field.value_format || "")).toLowerCase();
      const label = (field.label_short || field.label || "").toLowerCase();
      return fname.includes("gbp") || fname.includes("cost") || fname.includes("commission") ||
             fname.includes("expense") || fname.includes("cpa") ||
             label.includes("cost") || label.includes("cpa");
    }

    // How many decimals are needed to render a tick step without duplicate labels
    function decimalsFor(step) {
      if (!isFinite(step) || step <= 0) return 0;
      return Math.max(0, Math.min(6, Math.ceil(-Math.log10(step))));
    }

    function fmtValue(v, field) {
      if (v === null || v === undefined) return "—";
      if (isPercentField(field)) {
        const pct = v * 100;
        return (Math.abs(pct) < 10 ? pct.toFixed(2) : pct.toFixed(1)) + "%";
      }
      if (isCurrencyField(field)) {
        if (Math.abs(v) < 100) return "£" + v.toFixed(2);
        return "£" + Math.round(v).toLocaleString("en-GB");
      }
      if (Math.abs(v) < 10) return v.toFixed(2);
      return Math.round(v).toLocaleString("en-GB");
    }

    function fmtTick(v, field, interval) {
      const sign = v < 0 ? "-" : "";
      const abs  = Math.abs(v);

      if (isPercentField(field)) {
        const d = decimalsFor((interval || 0.01) * 100);
        return sign + (abs * 100).toFixed(d) + "%";
      }

      const prefix = isCurrencyField(field) ? "£" : "";
      if (abs >= 1000000) return sign + prefix + (abs / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
      if (abs >= 1000)    return sign + prefix + (abs / 1000).toFixed(1).replace(/\.0$/, "") + "k";
      return sign + prefix + abs.toFixed(decimalsFor(interval || 1));
    }

    function niceNum(range, round) {
      const exp  = Math.floor(Math.log10(range));
      const frac = range / Math.pow(10, exp);
      let nice;
      if (round) {
        if (frac < 1.5) nice = 1;
        else if (frac < 3) nice = 2;
        else if (frac < 7) nice = 5;
        else nice = 10;
      } else {
        if (frac <= 1) nice = 1;
        else if (frac <= 2) nice = 2;
        else if (frac <= 5) nice = 5;
        else nice = 10;
      }
      return nice * Math.pow(10, exp);
    }

    function niceTicks(minV, maxV, forceZero) {
      let lo = minV, hi = maxV;

      if (forceZero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }

      // Flat series (all values identical) — build a band around the value
      if (hi === lo) {
        const pad = Math.abs(hi) * 0.1 || 1;
        lo -= pad; hi += pad;
      }

      const span     = niceNum(hi - lo, false);
      const interval = niceNum(span / 5, true);
      const nMin     = Math.floor(lo / interval) * interval;
      const nMax     = Math.ceil(hi  / interval) * interval;

      const ticks = [];
      for (let i = 0; nMin + i * interval <= nMax + interval * 0.5; i++) {
        ticks.push(Math.round((nMin + i * interval) * 1e10) / 1e10);
      }
      return { ticks, nMin, nMax, interval };
    }

    // ── Build points per series ──
    // Returns Map<seriesVal → [{x, y, rendered, links, i}]>
    function buildSeriesPoints(measure) {
      // First pass: collect all X values in order
      const xOrder = [];
      const xSeen  = new Set();
      data.forEach(row => {
        const xCell = row[dimField.name];
        const xVal  = xCell ? String(xCell.rendered || xCell.value || "") : "";
        if (xVal && !xSeen.has(xVal)) { xSeen.add(xVal); xOrder.push(xVal); }
      });

      // Second pass: group by series → x → aggregate y
      const seriesMap = new Map(); // series → Map<x → {y, rendered, links}>

      data.forEach(row => {
        const xCell = row[dimField.name];
        const yCell = row[measure.name];
        const xVal  = xCell ? String(xCell.rendered || xCell.value || "") : "";
        if (!xVal) return;

        let sVal = "All";
        if (breakdownField) {
          const sCell = row[breakdownField.name];
          sVal = sCell ? String(sCell.rendered || sCell.value || "") : "(none)";
        }

        if (!seriesMap.has(sVal)) seriesMap.set(sVal, new Map());
        const xMap = seriesMap.get(sVal);

        const yVal     = (yCell && yCell.value !== null && yCell.value !== undefined) ? Number(yCell.value) : null;
        const rendered = yCell ? (yCell.rendered || null) : null;
        const links    = yCell ? (yCell.links || []) : [];

        if (!xMap.has(xVal)) {
          xMap.set(xVal, { y: yVal, rendered: rendered, links: links });
        } else {
          const ex = xMap.get(xVal);
          if (yVal !== null) {
            ex.y = (ex.y || 0) + yVal;
            ex.rendered = null;
            ex.links = ex.links.concat(links);
          }
        }
      });

      // Convert to ordered arrays
      const result = new Map();
      seriesMap.forEach((xMap, sVal) => {
        const pts = xOrder
          .filter(x => xMap.has(x))
          .map((x, i) => ({ x, i: xOrder.indexOf(x), ...xMap.get(x) }));
        result.set(sVal, pts);
      });

      return { seriesMap: result, xOrder };
    }

    function renderChart(mIdx, m2Idx) {
      const oldSvg = chartWrap.querySelector("svg");
      if (oldSvg) oldSvg.remove();
      legend.innerHTML = "";

      const measure  = measures[mIdx];
      const measure2 = m2Idx >= 0 ? measures[m2Idx] : null;

      const { seriesMap, xOrder } = buildSeriesPoints(measure);
      const activeSeries = seriesValues.filter(v => !hiddenSeries.has(v));

      if (!xOrder.length) {
        chartWrap.innerHTML = '<div class="lc-debug">No data points to render.</div>';
        return;
      }

      // Y range across all visible series
      let allY = [];
      seriesMap.forEach((pts, sVal) => {
        if (hiddenSeries.has(sVal)) return;
        pts.forEach(p => { if (p.y !== null) allY.push(p.y); });
      });
      if (!allY.length) allY = [0, 1];
      const { ticks: ticksA, nMin: nMinA, nMax: nMaxA, interval: intervalA } =
        niceTicks(Math.min(...allY), Math.max(...allY), zeroBase);

      // SVG dimensions
      const W       = chartWrap.clientWidth  || 600;
      const H       = chartWrap.clientHeight || 300;
      const marginL = 65;
      const marginR = 20;
      const marginT = 20;
      const marginB = 50;
      const plotW   = W - marginL - marginR;
      const plotH   = H - marginT - marginB;

      const xScale  = i => marginL + (i / (xOrder.length - 1 || 1)) * plotW;
      const yScaleA = v => marginT + plotH - ((v - nMinA) / (nMaxA - nMinA || 1)) * plotH;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("width", W);
      svg.setAttribute("height", H);
      svg.classList.add("lc-svg");

      // Gridlines + left axis
      ticksA.forEach(v => {
        const y = yScaleA(v);
        const gl = document.createElementNS("http://www.w3.org/2000/svg", "line");
        gl.setAttribute("x1", marginL); gl.setAttribute("x2", W - marginR);
        gl.setAttribute("y1", y);       gl.setAttribute("y2", y);
        gl.setAttribute("stroke", "#f0f0f0"); gl.setAttribute("stroke-width", "1");
        svg.appendChild(gl);
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", marginL - 6); t.setAttribute("y", y + 4);
        t.setAttribute("text-anchor", "end");
        t.classList.add("lc-axis-label");
        t.textContent = fmtTick(v, measure, intervalA);
        svg.appendChild(t);
      });

      // X axis labels
      const maxLabels = Math.floor(plotW / 60);
      const step      = Math.max(1, Math.ceil(xOrder.length / maxLabels));
      xOrder.forEach((x, i) => {
        const px = xScale(i);
        const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick.setAttribute("x1", px); tick.setAttribute("x2", px);
        tick.setAttribute("y1", marginT + plotH); tick.setAttribute("y2", marginT + plotH + 4);
        tick.setAttribute("stroke", "#ddd");
        svg.appendChild(tick);
        if (i % step === 0) {
          const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.setAttribute("x", px); t.setAttribute("y", marginT + plotH + 16);
          t.setAttribute("text-anchor", "middle");
          t.classList.add("lc-axis-label");
          t.textContent = x;
          svg.appendChild(t);
        }
      });

      // Draw one line per visible series
      const seriesValidPts = new Map();

      seriesValues.forEach(sVal => {
        if (hiddenSeries.has(sVal)) return;
        const pts   = seriesMap.get(sVal) || [];
        const color = seriesColour[sVal];
        const valid = pts.filter(p => p.y !== null);
        if (valid.length < 2) return;
        seriesValidPts.set(sVal, valid);

        // Line
        let d = `M ${xScale(valid[0].i)} ${yScaleA(valid[0].y)}`;
        valid.slice(1).forEach(p => { d += ` L ${xScale(p.i)} ${yScaleA(p.y)}`; });
        const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.setAttribute("d", d);
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "2");
        line.setAttribute("stroke-linejoin", "round");
        line.setAttribute("stroke-linecap", "round");
        svg.appendChild(line);
      });

      // Dots on top (so they sit above lines)
      seriesValues.forEach(sVal => {
        if (hiddenSeries.has(sVal)) return;
        const valid = seriesValidPts.get(sVal);
        if (!valid) return;
        const color = seriesColour[sVal];

        valid.forEach((p, idx) => {
          const cx  = xScale(p.i);
          const cy  = yScaleA(p.y);
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
          dot.setAttribute("r", "4");
          dot.setAttribute("fill", color);
          dot.setAttribute("stroke", "#fff"); dot.setAttribute("stroke-width", "2");
          dot.style.cursor = "pointer";

          const prevP = idx > 0 ? valid[idx - 1] : null;

          dot.addEventListener("mouseenter", function(e) {
            let ppHtml = "";
            if (prevP) {
              const pct    = (p.y - prevP.y) / Math.abs(prevP.y) * 100;
              const isGood = isLowGood ? pct < 0 : pct > 0;
              const cls    = isGood ? "lc-pos" : pct < 0 ? "lc-neg" : "lc-neu";
              const arrow  = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
              ppHtml = `<div class="lc-tooltip-pp ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</div>`;
            }
            tooltip.innerHTML = `
              <div class="lc-tooltip-title">${p.x}</div>
              <div class="lc-tooltip-row">
                <span class="lc-tooltip-swatch" style="background:${color}"></span>
                <span class="lc-tooltip-val">${sVal}: ${p.rendered || fmtValue(p.y, measure)}</span>
                ${ppHtml}
              </div>
            `;
            tooltip.style.display = "block";
          });
          dot.addEventListener("mousemove", function(e) {
            const rect = chartWrap.getBoundingClientRect();
            let left   = e.clientX - rect.left + 12;
            let top    = e.clientY - rect.top  - 10;
            if (left + 200 > rect.width) left = e.clientX - rect.left - 200;
            tooltip.style.left = left + "px";
            tooltip.style.top  = top  + "px";
          });
          dot.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
          if (p.links && p.links.length) {
            dot.addEventListener("click", e => LookerCharts.Utils.openDrillMenu({ links: p.links, event: e }));
          }
          svg.appendChild(dot);
        });
      });

      chartWrap.appendChild(svg);

      // ── Legend with click-to-hide ──
      seriesValues.forEach(sVal => {
        const color = seriesColour[sVal];
        const item  = document.createElement("div");
        item.className = "lc-legend-item" + (hiddenSeries.has(sVal) ? " hidden" : "");
        item.innerHTML = `<span class="lc-legend-dot" style="background:${color}"></span>${sVal}`;
        item.addEventListener("click", () => {
          if (hiddenSeries.has(sVal)) {
            hiddenSeries.delete(sVal);
          } else {
            // Don't allow hiding all series
            if (hiddenSeries.size < seriesValues.length - 1) hiddenSeries.add(sVal);
          }
          wrap.dataset.hidden = JSON.stringify([...hiddenSeries]);
          renderChart(parseInt(sel.value) || 0, parseInt(sel2.value));
        });
        legend.appendChild(item);
      });
    }

    renderChart(parseInt(sel.value) || 0, parseInt(sel2.value));

    sel.addEventListener("change",  () => renderChart(parseInt(sel.value), parseInt(sel2.value)));
    sel2.addEventListener("change", () => renderChart(parseInt(sel.value), parseInt(sel2.value)));

    done();
  }
};

looker.plugins.visualizations.add(lineChartViz);
