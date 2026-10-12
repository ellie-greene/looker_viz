const barChartViz = {
  id: "bar_chart_breakdown",
  label: "Bar Chart (Breakdown)",
  options: {
    layout_default: {
      type: "string",
      label: "Default layout",
      display: "select",
      values: [{ "Grouped": "grouped" }, { "Stacked": "stacked" }],
      default: "grouped",
      section: "Style",
      order: 1
    },
    orientation_default: {
      type: "string",
      label: "Default orientation",
      display: "select",
      values: [{ "Vertical": "vertical" }, { "Horizontal": "horizontal" }],
      default: "vertical",
      section: "Style",
      order: 2
    },
    is_low_good: {
      type: "boolean",
      label: "Lower is better (e.g. CPA)",
      default: false,
      section: "Style",
      order: 3
    },
    show_value_labels: {
      type: "boolean",
      label: "Show value labels on bars",
      default: false,
      section: "Style",
      order: 4
    },
    legend_collapse_at: {
      type: "number",
      label: "Collapse legend above N series",
      default: 8,
      section: "Style",
      order: 5
    }
  },

  create: function(element, config) {
    element.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      .bc-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 4px 6px; overflow-x: auto; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; }
      .bc-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
      .bc-controls label { font-size: 13px; color: #222; }
      .bc-controls select { font-size: 13px; padding: 3px 7px; border-radius: 6px; border: 1px solid #ddd; background: #fff; color: #111; cursor: pointer; }
      .bc-legend { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-left: 4px; max-height: 92px; overflow-y: auto; padding: 2px 0; }
      .bc-legend.bc-collapsed { display: none; }
      .bc-legend-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #222; cursor: pointer; user-select: none; }
      .bc-legend-item.hidden { opacity: 0.35; text-decoration: line-through; }
      .bc-legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
      .bc-legend-toggle { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #222; background: #f7f7f7; border: 1px solid #e4e4e4; border-radius: 6px; padding: 3px 8px; cursor: pointer; user-select: none; white-space: nowrap; }
      .bc-legend-toggle:hover { background: #f0f0f0; }
      .bc-legend-caret { font-size: 9px; color: #999; }
      .bc-legend-count { color: #999; }
      .bc-legend-reset { font-size: 12px; color: #7B0060; cursor: pointer; user-select: none; text-decoration: underline; }
      .bc-chart-wrap { flex: 1; position: relative; min-height: 200px; }
      .bc-svg { width: 100%; height: 100%; }
      .bc-axis-label { font-size: 12px; fill: #222; }
      .bc-value-label { font-size: 11px; fill: #222; }
      .bc-tooltip { position: absolute; background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; font-size: 12px; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: none; z-index: 10; min-width: 160px; }
      .bc-tooltip-title { font-weight: 600; color: #222; margin-bottom: 6px; }
      .bc-tooltip-row { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
      .bc-tooltip-swatch { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .bc-tooltip-val { color: #444; }
      .bc-tooltip-total { margin-top: 6px; padding-top: 5px; border-top: 1px solid #eee; color: #222; font-weight: 600; }
      .bc-tooltip-pp { font-size: 11px; margin-left: auto; }
      .bc-pos { color: #B0BC25; }
      .bc-neg { color: #B52555; }
      .bc-neu { color: #aaa; }
      .bc-debug { font-size: 11px; color: #aaa; padding: 8px; background: #fafafa; border-radius: 4px; margin-bottom: 10px; }
      .bc-controls-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
    `;
    element.appendChild(style);
    const wrap = document.createElement("div");
    wrap.className = "bc-wrap";
    element.appendChild(wrap);
    this._wrap = wrap;
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    const wrap = this._wrap;

    // ── persist selections across re-renders ──
    const existingSel    = wrap.querySelector('#bc-sel-primary');
    const existingLayout = wrap.querySelector('#bc-sel-layout');
    const existingOrient = wrap.querySelector('#bc-sel-orient');
    const savedPrimary   = existingSel    ? existingSel.value    : '0';

    // Keep the viewer's dropdown choice across re-renders, but if the "Default layout" /
    // "Default orientation" option is changed in the editor, that change wins
    const cfgLayout = config.layout_default      || 'grouped';
    const cfgOrient = config.orientation_default || 'vertical';
    const lastCfg   = this._lastCfg || {};
    const savedLayout = (existingLayout && lastCfg.layout === cfgLayout) ? existingLayout.value : cfgLayout;
    const savedOrient = (existingOrient && lastCfg.orient === cfgOrient) ? existingOrient.value : cfgOrient;
    this._lastCfg = { layout: cfgLayout, orient: cfgOrient };

    wrap.innerHTML = "";

    const dims     = queryResponse.fields.dimensions || [];
    const measures = (queryResponse.fields.measures || []).concat(queryResponse.fields.table_calculations || []);

    if (!dims.length || !measures.length || !data.length) {
      wrap.innerHTML = `<div class="bc-debug">No data. Add a date/period dimension (X axis) and optionally a breakdown dimension, plus at least one measure.</div>`;
      done(); return;
    }

    // dim[0] = X axis (e.g. week), dim[1] = breakdown series (e.g. source_group value)
    const dimField       = dims[0];
    const breakdownField = dims.length > 1 ? dims[1] : null;

    const isLowGood  = config.is_low_good || false;
    const showLabels = config.show_value_labels === true;

    // ── Pure brand palette (pack colours, light/dark pairs) — same order as the line and sankey vizs ──
    const PALETTE = [
      "#7B0060", "#FFB81C", "#00558C", "#1D6960", "#C07D59", "#FA8DDC", "#DC4405",
      "#51A8E0", "#683431", "#115E67", "#B0BC25", "#B52555", "#86C8BC", "#FFAD95"
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

    const seriesColour = {};
    seriesValues.forEach((v, i) => { seriesColour[v] = PALETTE[i % PALETTE.length]; });

    // ── Hidden series state (legend click to toggle) ──
    let hiddenSeries = new Set(
      wrap.dataset.hidden ? JSON.parse(wrap.dataset.hidden) : []
    );

    // ── Controls: metric + layout selectors ──
    const controls = document.createElement("div");
    controls.className = "bc-controls";

    const lbl = document.createElement("label");
    lbl.textContent = "Metric";
    controls.appendChild(lbl);

    const sel = document.createElement("select");
    sel.id = "bc-sel-primary";
    measures.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = m.label_short || m.label || m.name;
      sel.appendChild(o);
    });
    sel.value = savedPrimary || "0";
    controls.appendChild(sel);

    const lblO = document.createElement("label");
    lblO.textContent = "Orientation";
    controls.appendChild(lblO);

    const selOrient = document.createElement("select");
    selOrient.id = "bc-sel-orient";
    [["vertical", "Vertical"], ["horizontal", "Horizontal"]].forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = t;
      selOrient.appendChild(o);
    });
    selOrient.value = savedOrient;
    controls.appendChild(selOrient);

    // Layout only matters when there is more than one series
    const selLayout = document.createElement("select");
    selLayout.id = "bc-sel-layout";
    [["grouped", "Grouped"], ["stacked", "Stacked"]].forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = t;
      selLayout.appendChild(o);
    });
    selLayout.value = savedLayout;
    if (seriesValues.length > 1) {
      const lbl2 = document.createElement("label");
      lbl2.textContent = "Layout";
      controls.appendChild(lbl2);
      controls.appendChild(selLayout);
    }

    wrap.appendChild(controls);

    // ── Legend (collapsible) ──
    const collapseThreshold = Math.max(1, config.legend_collapse_at || 8);
    let legendOpen;
    if (wrap.dataset.legendOpen === "1")      legendOpen = true;
    else if (wrap.dataset.legendOpen === "0") legendOpen = false;
    else                                      legendOpen = seriesValues.length <= collapseThreshold;

    const legendRow = document.createElement("div");
    legendRow.className = "bc-controls-row";

    const legendToggle = document.createElement("div");
    legendToggle.className = "bc-legend-toggle";
    legendRow.appendChild(legendToggle);

    const legendReset = document.createElement("span");
    legendReset.className = "bc-legend-reset";
    legendReset.textContent = "show all";
    legendReset.style.display = "none";
    legendRow.appendChild(legendReset);

    const legend = document.createElement("div");
    legend.className = "bc-legend";
    if (seriesValues.length > 1) {
      wrap.appendChild(legendRow);
      wrap.appendChild(legend);
    }

    function paintLegendToggle() {
      const hiddenCount = hiddenSeries.size;
      const caret = legendOpen ? "▾" : "▸";
      const countTxt = hiddenCount
        ? `${seriesValues.length} series · ${hiddenCount} hidden`
        : `${seriesValues.length} series`;
      legendToggle.innerHTML =
        `<span class="bc-legend-caret">${caret}</span>Legend <span class="bc-legend-count">(${countTxt})</span>`;
      legend.classList.toggle("bc-collapsed", !legendOpen);
      legendReset.style.display = hiddenCount ? "inline" : "none";
    }

    legendToggle.addEventListener("click", () => {
      legendOpen = !legendOpen;
      wrap.dataset.legendOpen = legendOpen ? "1" : "0";
      paintLegendToggle();
      redraw();
    });

    legendReset.addEventListener("click", () => {
      hiddenSeries.clear();
      wrap.dataset.hidden = "[]";
      redraw();
    });

    // ── Chart area ──
    const chartWrap = document.createElement("div");
    chartWrap.className = "bc-chart-wrap";
    wrap.appendChild(chartWrap);

    const tooltip = document.createElement("div");
    tooltip.className = "bc-tooltip";
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

    // Compact version for on-bar labels
    function fmtShort(v, field) {
      if (v === null || v === undefined) return "";
      if (isPercentField(field)) return (v * 100).toFixed(Math.abs(v * 100) < 10 ? 1 : 0) + "%";
      const prefix = isCurrencyField(field) ? "£" : "";
      const abs = Math.abs(v), sign = v < 0 ? "-" : "";
      if (abs >= 1000000) return sign + prefix + (abs / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
      if (abs >= 1000)    return sign + prefix + (abs / 1000).toFixed(1).replace(/\.0$/, "") + "k";
      return sign + prefix + (abs < 10 ? abs.toFixed(1).replace(/\.0$/, "") : Math.round(abs));
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

    // Bars always start at zero, so the baseline is always part of the range
    function niceTicks(minV, maxV) {
      let lo = Math.min(0, minV), hi = Math.max(0, maxV);
      if (hi === lo) { hi = lo + 1; }

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
    // Returns Map<seriesVal → Map<x → {y, rendered, links}>> and ordered x values
    function buildSeriesPoints(measure) {
      const xOrder = [];
      const xSeen  = new Set();
      data.forEach(row => {
        const xCell = row[dimField.name];
        const xVal  = xCell ? String(xCell.rendered || xCell.value || "") : "";
        if (xVal && !xSeen.has(xVal)) { xSeen.add(xVal); xOrder.push(xVal); }
      });

      const seriesMap = new Map();

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

      return { seriesMap, xOrder };
    }

    function svgEl(name, attrs) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", name);
      Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k]));
      return el;
    }

    function renderChart() {
      const mIdx    = parseInt(sel.value) || 0;
      const stacked    = seriesValues.length > 1 && selLayout.value === "stacked";
      const horizontal = selOrient.value === "horizontal";

      const oldSvg = chartWrap.querySelector("svg");
      if (oldSvg) oldSvg.remove();

      const measure = measures[mIdx];
      const { seriesMap, xOrder } = buildSeriesPoints(measure);
      const activeSeries = seriesValues.filter(v => !hiddenSeries.has(v));

      if (!xOrder.length) {
        chartWrap.innerHTML = '<div class="bc-debug">No data points to render.</div>';
        return;
      }

      // Build the legend BEFORE measuring the chart area
      buildLegend();

      const valueAt = (sVal, x) => {
        const m = seriesMap.get(sVal);
        const p = m ? m.get(x) : null;
        return p && p.y !== null ? p.y : null;
      };

      // Y range: stacked → positive/negative sums per x; grouped → raw values
      let lo = 0, hi = 0;
      xOrder.forEach(x => {
        let pos = 0, neg = 0;
        activeSeries.forEach(s => {
          const v = valueAt(s, x);
          if (v === null) return;
          if (stacked) { if (v >= 0) pos += v; else neg += v; }
          else { hi = Math.max(hi, v); lo = Math.min(lo, v); }
        });
        if (stacked) { hi = Math.max(hi, pos); lo = Math.min(lo, neg); }
      });
      const { ticks, nMin, nMax, interval } = niceTicks(lo, hi);

      // SVG dimensions
      const W = chartWrap.clientWidth  || 600;
      const H = chartWrap.clientHeight || 300;

      // Horizontal bars put the category labels on the left, so size that margin to the longest one
      const catMaxChars = 28;
      const longestCat  = xOrder.reduce((m, x) => Math.max(m, Math.min(x.length, catMaxChars)), 0);
      const marginL = horizontal ? Math.max(50, Math.min(220, Math.round(longestCat * 6.6 + 14))) : 65;
      const marginR = horizontal ? (showLabels ? 44 : 20) : 12;
      const marginT = 10;
      const marginB = horizontal ? 28 : 44;
      const plotW   = W - marginL - marginR;
      const plotH   = H - marginT - marginB;

      // Category axis runs along X (vertical bars) or down Y (horizontal bars); value axis is the other way
      const catLen   = horizontal ? plotH : plotW;
      const band     = catLen / xOrder.length;
      const catStart = i => (horizontal ? marginT : marginL) + i * band;
      const valScale = v => horizontal
        ? marginL + ((v - nMin) / (nMax - nMin || 1)) * plotW
        : marginT + plotH - ((v - nMin) / (nMax - nMin || 1)) * plotH;
      const v0 = valScale(0);

      const barRect = (cs, cl, pA, pB, fill, rx) => svgEl("rect", horizontal
        ? { x: Math.min(pA, pB), y: cs, width: Math.max(0.5, Math.abs(pB - pA)), height: cl, fill, rx }
        : { x: cs, y: Math.min(pA, pB), width: cl, height: Math.max(0.5, Math.abs(pB - pA)), fill, rx });

      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
      svg.classList.add("bc-svg");

      // Gridlines + value axis
      ticks.forEach(v => {
        const p      = valScale(v);
        const stroke = v === 0 ? "#ddd" : "#f0f0f0";
        let t;
        if (horizontal) {
          svg.appendChild(svgEl("line", { x1: p, x2: p, y1: marginT, y2: marginT + plotH, stroke, "stroke-width": "1" }));
          t = svgEl("text", { x: p, y: marginT + plotH + 16, "text-anchor": "middle" });
        } else {
          svg.appendChild(svgEl("line", { x1: marginL, x2: W - marginR, y1: p, y2: p, stroke, "stroke-width": "1" }));
          t = svgEl("text", { x: marginL - 6, y: p + 4, "text-anchor": "end" });
        }
        t.classList.add("bc-axis-label");
        t.textContent = fmtTick(v, measure, interval);
        svg.appendChild(t);
      });

      // Category axis labels
      const maxLabels = Math.max(1, Math.floor(catLen / (horizontal ? 16 : 60)));
      const step      = Math.max(1, Math.ceil(xOrder.length / maxLabels));
      xOrder.forEach((x, i) => {
        if (i % step !== 0) return;
        const c = catStart(i) + band / 2;
        const t = svgEl("text", horizontal
          ? { x: marginL - 6, y: c + 4, "text-anchor": "end" }
          : { x: c, y: marginT + plotH + 16, "text-anchor": "middle" });
        t.classList.add("bc-axis-label");
        t.textContent = horizontal && x.length > catMaxChars ? x.slice(0, catMaxChars - 1) + "…" : x;
        if (horizontal && x.length > catMaxChars) {
          const full = svgEl("title"); full.textContent = x; t.appendChild(full);
        }
        svg.appendChild(t);
      });


      // Tooltip wiring
      function attachTooltip(rect, x, xi, sVal, p) {
        rect.addEventListener("mouseenter", function() {
          const color = seriesColour[sVal];
          // change vs previous x for this series
          let ppHtml = "";
          const prevY = xi > 0 ? valueAt(sVal, xOrder[xi - 1]) : null;
          if (prevY !== null && prevY !== 0) {
            const pct    = (p.y - prevY) / Math.abs(prevY) * 100;
            const isGood = isLowGood ? pct < 0 : pct > 0;
            const cls    = isGood ? "bc-pos" : pct !== 0 ? "bc-neg" : "bc-neu";
            const arrow  = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
            ppHtml = `<div class="bc-tooltip-pp ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</div>`;
          }
          let totalHtml = "";
          if (stacked) {
            let tot = 0;
            activeSeries.forEach(s => { const v = valueAt(s, x); if (v !== null) tot += v; });
            totalHtml = `<div class="bc-tooltip-total">Total: ${fmtValue(tot, measure)}</div>`;
          }
          tooltip.innerHTML = `
            <div class="bc-tooltip-title">${x}</div>
            <div class="bc-tooltip-row">
              <span class="bc-tooltip-swatch" style="background:${color}"></span>
              <span class="bc-tooltip-val">${sVal}: ${p.rendered || fmtValue(p.y, measure)}</span>
              ${ppHtml}
            </div>
            ${totalHtml}
          `;
          tooltip.style.display = "block";
        });
        rect.addEventListener("mousemove", function(e) {
          const r = chartWrap.getBoundingClientRect();
          let left = e.clientX - r.left + 12;
          let top  = e.clientY - r.top  - 10;
          if (left + 200 > r.width) left = e.clientX - r.left - 200;
          tooltip.style.left = left + "px";
          tooltip.style.top  = top  + "px";
        });
        rect.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
        if (p.links && p.links.length) {
          rect.style.cursor = "pointer";
          rect.addEventListener("click", e => LookerCharts.Utils.openDrillMenu({ links: p.links, event: e }));
        }
      }

      // cc = centre of the bar along the category axis; pPos / pNeg = pixel position of the
      // positive / negative end of the bar along the value axis
      function addLabel(cc, pPos, pNeg, v, positive) {
        if (!showLabels) return;
        const t = svgEl("text", horizontal
          ? { x: positive ? pPos + 4 : pNeg - 4, y: cc + 4, "text-anchor": positive ? "start" : "end" }
          : { x: cc, y: positive ? pPos - 4 : pNeg + 11, "text-anchor": "middle" });
        t.classList.add("bc-value-label");
        t.textContent = fmtShort(v, measure);
        svg.appendChild(t);
      }


      // Draw bars
      xOrder.forEach((x, xi) => {
        const pad       = Math.min(band * 0.2, 12);
        const groupSize = Math.max(1, band - pad);
        const gs        = catStart(xi) + (band - groupSize) / 2;   // start of this group along the category axis

        if (stacked) {
          let posBase = 0, negBase = 0;
          activeSeries.forEach(sVal => {
            const v = valueAt(sVal, x);
            if (v === null || v === 0) return;
            const from = v >= 0 ? posBase : negBase;
            const to   = from + v;
            if (v >= 0) posBase = to; else negBase = to;
            const rect = barRect(gs, groupSize, valScale(from), valScale(to), seriesColour[sVal], 2);
            svg.appendChild(rect);
            attachTooltip(rect, x, xi, sVal, seriesMap.get(sVal).get(x));
          });
          if (showLabels) {
            const tot = posBase + negBase;
            if (posBase !== 0 || negBase !== 0) {
              addLabel(gs + groupSize / 2, valScale(posBase), valScale(negBase), tot, tot >= 0);
            }
          }
        } else {
          const n       = activeSeries.length;
          const gap     = n > 1 ? 2 : 0;
          const barSize = Math.max(1, (groupSize - gap * (n - 1)) / n);
          activeSeries.forEach((sVal, si) => {
            const v = valueAt(sVal, x);
            if (v === null) return;
            const bs   = gs + si * (barSize + gap);
            const pPos = valScale(Math.max(v, 0));
            const pNeg = valScale(Math.min(v, 0));
            const rect = barRect(bs, barSize, pPos, pNeg, seriesColour[sVal], Math.min(2, barSize / 2));
            svg.appendChild(rect);
            attachTooltip(rect, x, xi, sVal, seriesMap.get(sVal).get(x));
            // Only label when the bar is thick enough for the text
            if (barSize >= (horizontal ? 14 : 22)) addLabel(bs + barSize / 2, pPos, pNeg, v, v >= 0);
          });
        }
      });

      // Zero baseline on top of bars
      svg.appendChild(svgEl("line", horizontal
        ? { x1: v0, x2: v0, y1: marginT, y2: marginT + plotH, stroke: "#ccc", "stroke-width": "1" }
        : { x1: marginL, x2: W - marginR, y1: v0, y2: v0, stroke: "#ccc", "stroke-width": "1" }));


      chartWrap.appendChild(svg);
    }

    // ── Legend with click-to-hide ──
    function buildLegend() {
      legend.innerHTML = "";
      seriesValues.forEach(sVal => {
        const color = seriesColour[sVal];
        const item  = document.createElement("div");
        item.className = "bc-legend-item" + (hiddenSeries.has(sVal) ? " hidden" : "");
        item.innerHTML = `<span class="bc-legend-dot" style="background:${color}"></span>${sVal}`;
        item.addEventListener("click", () => {
          if (hiddenSeries.has(sVal)) {
            hiddenSeries.delete(sVal);
          } else {
            // Don't allow hiding all series
            if (hiddenSeries.size < seriesValues.length - 1) hiddenSeries.add(sVal);
          }
          wrap.dataset.hidden = JSON.stringify([...hiddenSeries]);
          redraw();
        });
        legend.appendChild(item);
      });

      paintLegendToggle();
    }

    function redraw() { renderChart(); }

    renderChart();

    sel.addEventListener("change", redraw);
    selLayout.addEventListener("change", redraw);
    selOrient.addEventListener("change", redraw);

    done();
  }
};

looker.plugins.visualizations.add(barChartViz);
