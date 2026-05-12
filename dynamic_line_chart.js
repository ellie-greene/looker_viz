const lineChartViz = {
  id: "line_chart",
  label: "Line Chart",
  options: {
    is_low_good: {
      type: "boolean",
      label: "Lower is better (e.g. CPA)",
      default: false,
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
      .lc-legend { display: flex; gap: 14px; align-items: center; margin-left: 8px; }
      .lc-legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #555; }
      .lc-legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
      .lc-chart-wrap { flex: 1; position: relative; min-height: 200px; }
      .lc-svg { width: 100%; height: 100%; }
      .lc-axis-label { font-size: 11px; fill: #888; }
      .lc-axis-label-r { font-size: 11px; fill: #274C46; }
      .lc-tooltip { position: absolute; background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; font-size: 12px; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: none; z-index: 10; min-width: 140px; }
      .lc-tooltip-title { font-weight: 600; color: #222; margin-bottom: 6px; }
      .lc-tooltip-row { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
      .lc-tooltip-swatch { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .lc-tooltip-val { color: #444; }
      .lc-tooltip-pp { font-size: 11px; margin-left: auto; }
      .lc-pos { color: #1a7f45; }
      .lc-neg { color: #c0392b; }
      .lc-neu { color: #aaa; }
      .lc-debug { font-size: 11px; color: #aaa; padding: 8px; background: #fafafa; border-radius: 4px; margin-bottom: 10px; }
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

    const dims = queryResponse.fields.dimensions || [];
    const measures = (queryResponse.fields.measures || []).concat(queryResponse.fields.table_calculations || []);

    if (!dims.length || !measures.length || !data.length) {
      wrap.innerHTML = `<div class="lc-debug">No data found. Add a dimension for X axis and at least one measure.</div>`;
      done(); return;
    }

    const dimField = dims[0];
    const isLowGood = config.is_low_good || false;
    const COLOR_A = "#713170";
    const COLOR_B = "#274C46";

    // Controls
    const controls = document.createElement("div");
    controls.className = "lc-controls";

    // Primary metric
    const lbl = document.createElement("label");
    lbl.textContent = "Metric";
    controls.appendChild(lbl);
    const sel = document.createElement("select");
    measures.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = m.label_short || m.label || m.name;
      sel.appendChild(o);
    });
    controls.appendChild(sel);

    // Comparison metric
    const lbl2 = document.createElement("label");
    lbl2.textContent = "Compare to";
    controls.appendChild(lbl2);
    const sel2 = document.createElement("select");
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
    controls.appendChild(sel2);

    // Legend placeholder
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

    function fmtValue(v, field) {
      if (v === null || v === undefined) return "—";
      const fname = ((field.name || "") + (field.value_format || "")).toLowerCase();
      const label = (field.label_short || field.label || "").toLowerCase();
      const isCurrency = fname.includes("gbp") || fname.includes("cost") || fname.includes("commission") || fname.includes("expense") || fname.includes("cpa") || label.includes("cost") || label.includes("cpa");
      if (isCurrency) {
        if (Math.abs(v) < 100) return "£" + v.toFixed(2);
        return "£" + Math.round(v).toLocaleString("en-GB");
      }
      if (Math.abs(v) < 10) return v.toFixed(2);
      return Math.round(v).toLocaleString("en-GB");
    }

    function fmtTick(v, field) {
      const fname = ((field.name || "") + (field.value_format || "")).toLowerCase();
      const label = (field.label_short || field.label || "").toLowerCase();
      const isCurrency = fname.includes("gbp") || fname.includes("cost") || fname.includes("commission") || fname.includes("expense") || fname.includes("cpa") || label.includes("cost") || label.includes("cpa");
      const prefix = isCurrency ? "£" : "";
      const abs = Math.abs(v);
      const sign = v < 0 ? "-" : "";
      if (abs >= 1000000) return sign + prefix + (abs / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
      if (abs >= 1000) return sign + prefix + (abs / 1000).toFixed(1).replace(/\.0$/, "") + "k";
      if (abs < 10 && abs !== 0) return sign + prefix + abs.toFixed(1);
      return sign + prefix + Math.round(abs).toLocaleString("en-GB");
    }

    function niceNum(range, round) {
      const exp = Math.floor(Math.log10(range));
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

    function niceTicks(minV, maxV) {
      const range = niceNum(Math.max(maxV - minV, 1), false);
      const interval = niceNum(range / 5, true);
      const nMin = Math.floor(minV / interval) * interval;
      const nMax = Math.ceil(maxV / interval) * interval;
      const ticks = [];
      for (let v = nMin; v <= nMax + interval * 0.5; v += interval) {
        ticks.push(Math.round(v * 1e10) / 1e10);
      }
      return { ticks, nMin, nMax };
    }

    function buildPoints(measure) {
      return data.map(row => {
        const xCell = row[dimField.name];
        const yCell = row[measure.name];
        return {
          x: xCell ? String(xCell.rendered || xCell.value || "") : "",
          y: (yCell && yCell.value !== null && yCell.value !== undefined) ? Number(yCell.value) : null,
          rendered: yCell ? (yCell.rendered || null) : null,
          links: yCell ? (yCell.links || []) : []
        };
      }).filter(p => p.x !== "");
    }

    function drawLine(svg, points, color, xScale, yScaleN, measure, isSecondary) {
      const valid = points.map((p, i) => ({ ...p, i })).filter(p => p.y !== null);
      if (valid.length < 2) return;

      // Area (primary only)
      if (!isSecondary) {
        let areaPath = `M ${xScale(valid[0].i)} ${yScaleN(0 > Math.min(...valid.map(p=>p.y)) ? Math.min(...valid.map(p=>p.y)) : 0)}`;
        areaPath += ` L ${xScale(valid[0].i)} ${yScaleN(valid[0].y)}`;
        valid.forEach(p => { areaPath += ` L ${xScale(p.i)} ${yScaleN(p.y)}`; });
        areaPath += ` L ${xScale(valid[valid.length - 1].i)} ${yScaleN(0 > Math.min(...valid.map(p=>p.y)) ? Math.min(...valid.map(p=>p.y)) : 0)} Z`;
        const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
        area.setAttribute("d", areaPath);
        area.setAttribute("fill", "rgba(113, 49, 112, 0.08)");
        svg.appendChild(area);
      }

      // Line
      let linePath = `M ${xScale(valid[0].i)} ${yScaleN(valid[0].y)}`;
      valid.slice(1).forEach(p => { linePath += ` L ${xScale(p.i)} ${yScaleN(p.y)}`; });
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("d", linePath);
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", isSecondary ? "1.5" : "2");
      line.setAttribute("stroke-dasharray", isSecondary ? "5,3" : "none");
      line.setAttribute("stroke-linejoin", "round");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);

      return valid;
    }

    function renderChart(mIdx, m2Idx) {
      const oldSvg = chartWrap.querySelector("svg");
      if (oldSvg) oldSvg.remove();
      legend.innerHTML = "";

      const measure = measures[mIdx];
      const measure2 = m2Idx >= 0 ? measures[m2Idx] : null;

      const points = buildPoints(measure);
      const points2 = measure2 ? buildPoints(measure2) : null;

      if (!points.length) {
        chartWrap.innerHTML = '<div class="lc-debug">No data points to render.</div>';
        return;
      }

      const hasComp = measure2 && points2 && points2.filter(p => p.y !== null).length > 0;
      const separateAxes = hasComp;

      // Y ranges
      const validY = points.filter(p => p.y !== null).map(p => p.y);
      const { ticks: ticksA, nMin: nMinA, nMax: nMaxA } = niceTicks(Math.min(...validY), Math.max(...validY));

      let ticksB, nMinB, nMaxB;
      if (hasComp) {
        const validY2 = points2.filter(p => p.y !== null).map(p => p.y);
        ({ ticks: ticksB, nMin: nMinB, nMax: nMaxB } = niceTicks(Math.min(...validY2), Math.max(...validY2)));
      }

      // SVG dimensions
      const W = chartWrap.clientWidth || 600;
      const H = chartWrap.clientHeight || 300;
      const marginL = 65;
      const marginR = hasComp ? 65 : 20;
      const marginT = 20;
      const marginB = 50;
      const plotW = W - marginL - marginR;
      const plotH = H - marginT - marginB;

      const xScale = i => marginL + (i / (points.length - 1 || 1)) * plotW;
      const yScaleA = v => marginT + plotH - ((v - nMinA) / (nMaxA - nMinA || 1)) * plotH;
      const yScaleB = hasComp ? (v => marginT + plotH - ((v - nMinB) / (nMaxB - nMinB || 1)) * plotH) : yScaleA;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("width", W);
      svg.setAttribute("height", H);
      svg.classList.add("lc-svg");

      // Left y-axis ticks
      ticksA.forEach(v => {
        const y = yScaleA(v);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", marginL); line.setAttribute("x2", W - marginR);
        line.setAttribute("y1", y); line.setAttribute("y2", y);
        line.setAttribute("stroke", "#f0f0f0"); line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", marginL - 6); text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "end");
        text.classList.add("lc-axis-label");
        text.textContent = fmtTick(v, measure);
        svg.appendChild(text);
      });

      // Right y-axis ticks (comparison)
      if (hasComp) {
        ticksB.forEach(v => {
          const y = yScaleB(v);
          const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          text.setAttribute("x", W - marginR + 6); text.setAttribute("y", y + 4);
          text.setAttribute("text-anchor", "start");
          text.classList.add("lc-axis-label-r");
          text.textContent = fmtTick(v, measure2);
          svg.appendChild(text);
        });
      }

      // Draw lines
      const validA = drawLine(svg, points, COLOR_A, xScale, yScaleA, measure, false);
      let validB = null;
      if (hasComp) {
        validB = drawLine(svg, points2, COLOR_B, xScale, yScaleB, measure2, true);
      }

      // X axis labels
      const maxLabels = Math.floor(plotW / 60);
      const step = Math.max(1, Math.ceil(points.length / maxLabels));
      points.forEach((p, i) => {
        const x = xScale(i);
        const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick.setAttribute("x1", x); tick.setAttribute("x2", x);
        tick.setAttribute("y1", marginT + plotH); tick.setAttribute("y2", marginT + plotH + 4);
        tick.setAttribute("stroke", "#ddd");
        svg.appendChild(tick);
        if (i % step === 0) {
          const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          text.setAttribute("x", x); text.setAttribute("y", marginT + plotH + 16);
          text.setAttribute("text-anchor", "middle");
          text.classList.add("lc-axis-label");
          text.textContent = p.x;
          svg.appendChild(text);
        }
      });

      // Dots — primary
      (validA || []).forEach((p, idx) => {
        const cx = xScale(p.i);
        const cy = yScaleA(p.y);
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
        dot.setAttribute("r", "4");
        dot.setAttribute("fill", COLOR_A);
        dot.setAttribute("stroke", "#fff"); dot.setAttribute("stroke-width", "2");
        dot.style.cursor = "pointer";

        const prevP = idx > 0 ? validA[idx - 1] : null;
        const compP = hasComp && validB ? validB.find(b => b.x === p.x) : null;

        dot.addEventListener("mouseenter", function(e) {
          let ppHtml = "";
          if (prevP) {
            const pct = (p.y - prevP.y) / Math.abs(prevP.y) * 100;
            const isGood = isLowGood ? pct < 0 : pct > 0;
            const cls = isGood ? "lc-pos" : pct < 0 ? "lc-neg" : "lc-neu";
            const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
            ppHtml = `<div class="lc-tooltip-pp ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</div>`;
          }
          let compHtml = "";
          if (compP) {
            compHtml = `<div class="lc-tooltip-row"><span class="lc-tooltip-swatch" style="background:${COLOR_B}"></span><span class="lc-tooltip-val">${measure2.label_short || measure2.label}: ${compP.rendered || fmtValue(compP.y, measure2)}</span></div>`;
          }
          tooltip.innerHTML = `
            <div class="lc-tooltip-title">${p.x}</div>
            <div class="lc-tooltip-row"><span class="lc-tooltip-swatch" style="background:${COLOR_A}"></span><span class="lc-tooltip-val">${measure.label_short || measure.label}: ${p.rendered || fmtValue(p.y, measure)}</span>${ppHtml}</div>
            ${compHtml}
          `;
          tooltip.style.display = "block";
        });
        dot.addEventListener("mousemove", function(e) {
          const rect = chartWrap.getBoundingClientRect();
          let left = e.clientX - rect.left + 12;
          let top = e.clientY - rect.top - 10;
          if (left + 180 > rect.width) left = e.clientX - rect.left - 180;
          tooltip.style.left = left + "px";
          tooltip.style.top = top + "px";
        });
        dot.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
        if (p.links && p.links.length) {
          dot.addEventListener("click", e => LookerCharts.Utils.openDrillMenu({ links: p.links, event: e }));
        }
        svg.appendChild(dot);
      });

      // Dots — comparison
      (validB || []).forEach((p, idx) => {
        const cx = xScale(p.i);
        const cy = yScaleB(p.y);
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
        dot.setAttribute("r", "3");
        dot.setAttribute("fill", COLOR_B);
        dot.setAttribute("stroke", "#fff"); dot.setAttribute("stroke-width", "2");
        svg.appendChild(dot);
      });

      chartWrap.appendChild(svg);

      // Legend
      legend.innerHTML = `
        <div class="lc-legend-item"><span class="lc-legend-dot" style="background:${COLOR_A}"></span>${measure.label_short || measure.label}</div>
        ${hasComp ? `<div class="lc-legend-item"><span class="lc-legend-dot" style="background:${COLOR_B}; border: 1px dashed ${COLOR_B}"></span>${measure2.label_short || measure2.label}</div>` : ""}
      `;
    }

    renderChart(parseInt(sel.value) || 0, parseInt(sel2.value));
    sel.addEventListener("change", () => renderChart(parseInt(sel.value), parseInt(sel2.value)));
    sel2.addEventListener("change", () => renderChart(parseInt(sel.value), parseInt(sel2.value)));
    done();
  }
};

looker.plugins.visualizations.add(lineChartViz);
