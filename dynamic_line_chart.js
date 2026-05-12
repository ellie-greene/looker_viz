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
      .lc-chart-wrap { flex: 1; position: relative; min-height: 200px; }
      .lc-svg { width: 100%; height: 100%; }
      .lc-axis-label { font-size: 11px; fill: #888; }
      .lc-tooltip { position: absolute; background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; font-size: 12px; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: none; z-index: 10; }
      .lc-tooltip-title { font-weight: 600; color: #222; margin-bottom: 4px; }
      .lc-tooltip-value { color: #444; }
      .lc-tooltip-pp { margin-top: 3px; font-size: 11px; }
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

    // Controls
    const controls = document.createElement("div");
    controls.className = "lc-controls";
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
      const isCurrency = fname.includes("gbp") || fname.includes("cost") || fname.includes("commission") || fname.includes("expense") || fname.includes("cpa") || label.includes("£") || label.includes("cost") || label.includes("cpa");
      if (isCurrency) {
        if (Math.abs(v) < 100) return "£" + v.toFixed(2);
        return "£" + Math.round(v).toLocaleString("en-GB");
      }
      if (Math.abs(v) < 10) return v.toFixed(2);
      return Math.round(v).toLocaleString("en-GB");
    }

    function renderChart(mIdx) {
      // Remove old svg
      const oldSvg = chartWrap.querySelector("svg");
      if (oldSvg) oldSvg.remove();

      const measure = measures[mIdx];

      // Build data points
      const points = data.map((row, i) => {
        const xCell = row[dimField.name];
        const yCell = row[measure.name];
        return {
          x: xCell ? String(xCell.rendered || xCell.value || "") : "",
          y: (yCell && yCell.value !== null && yCell.value !== undefined) ? Number(yCell.value) : null,
          rendered: yCell ? (yCell.rendered || null) : null,
          links: yCell ? (yCell.links || []) : []
        };
      }).filter(p => p.x !== "");

      if (!points.length) {
        chartWrap.innerHTML = '<div class="lc-debug">No data points to render.</div>';
        return;
      }

      const validY = points.filter(p => p.y !== null).map(p => p.y);
      const minY = Math.min(...validY);
      const maxY = Math.max(...validY);
      const yPad = (maxY - minY) * 0.15 || 1;
      const yMin = minY - yPad;
      const yMax = maxY + yPad;

      // SVG dimensions
      const W = chartWrap.clientWidth || 600;
      const H = chartWrap.clientHeight || 300;
      const marginL = 60, marginR = 20, marginT = 20, marginB = 50;
      const plotW = W - marginL - marginR;
      const plotH = H - marginT - marginB;

      const xScale = i => marginL + (i / (points.length - 1 || 1)) * plotW;
      const yScale = v => marginT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("width", W);
      svg.setAttribute("height", H);
      svg.classList.add("lc-svg");

      // Grid lines
      const yTicks = 5;
      for (let t = 0; t <= yTicks; t++) {
        const v = yMin + (yMax - yMin) * (t / yTicks);
        const y = yScale(v);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", marginL); line.setAttribute("x2", W - marginR);
        line.setAttribute("y1", y); line.setAttribute("y2", y);
        line.setAttribute("stroke", "#f0f0f0"); line.setAttribute("stroke-width", "1");
        svg.appendChild(line);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", marginL - 6); text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "end");
        text.classList.add("lc-axis-label");
        text.textContent = fmtValue(v, measure);
        svg.appendChild(text);
      }

      // Area fill
      const validPoints = points.map((p, i) => ({ ...p, i })).filter(p => p.y !== null);
      if (validPoints.length > 1) {
        let areaPath = `M ${xScale(validPoints[0].i)} ${yScale(yMin)}`;
        areaPath += ` L ${xScale(validPoints[0].i)} ${yScale(validPoints[0].y)}`;
        validPoints.forEach(p => { areaPath += ` L ${xScale(p.i)} ${yScale(p.y)}`; });
        areaPath += ` L ${xScale(validPoints[validPoints.length - 1].i)} ${yScale(yMin)} Z`;
        const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
        area.setAttribute("d", areaPath);
        area.setAttribute("fill", "rgba(100, 120, 200, 0.08)");
        svg.appendChild(area);

        // Line
        let linePath = `M ${xScale(validPoints[0].i)} ${yScale(validPoints[0].y)}`;
        validPoints.slice(1).forEach(p => { linePath += ` L ${xScale(p.i)} ${yScale(p.y)}`; });
        const linEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        linEl.setAttribute("d", linePath);
        linEl.setAttribute("fill", "none");
        linEl.setAttribute("stroke", "#5b6abf");
        linEl.setAttribute("stroke-width", "2");
        linEl.setAttribute("stroke-linejoin", "round");
        linEl.setAttribute("stroke-linecap", "round");
        svg.appendChild(linEl);
      }

      // X axis labels — show subset to avoid crowding
      const maxLabels = Math.floor(plotW / 60);
      const step = Math.max(1, Math.ceil(points.length / maxLabels));
      points.forEach((p, i) => {
        const x = xScale(i);
        // Tick
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

      // Dots + hover
      validPoints.forEach((p, idx) => {
        const cx = xScale(p.i);
        const cy = yScale(p.y);

        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
        dot.setAttribute("r", "4");
        dot.setAttribute("fill", "#5b6abf");
        dot.setAttribute("stroke", "#fff");
        dot.setAttribute("stroke-width", "2");
        dot.style.cursor = "pointer";

        // PP comparison
        const prevP = idx > 0 ? validPoints[idx - 1] : null;
        dot.addEventListener("mouseenter", function(e) {
          let ppHtml = "";
          if (prevP) {
            const pct = (p.y - prevP.y) / Math.abs(prevP.y) * 100;
            const isGood = isLowGood ? pct < 0 : pct > 0;
            const cls = isGood ? "lc-pos" : pct < 0 ? "lc-neg" : "lc-neu";
            const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
            ppHtml = `<div class="lc-tooltip-pp ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}% vs prev</div>`;
          }
          tooltip.innerHTML = `
            <div class="lc-tooltip-title">${p.x}</div>
            <div class="lc-tooltip-value">${p.rendered || fmtValue(p.y, measure)}</div>
            ${ppHtml}
          `;
          tooltip.style.display = "block";
        });

        dot.addEventListener("mousemove", function(e) {
          const rect = chartWrap.getBoundingClientRect();
          let left = e.clientX - rect.left + 12;
          let top = e.clientY - rect.top - 10;
          if (left + 160 > rect.width) left = e.clientX - rect.left - 160;
          tooltip.style.left = left + "px";
          tooltip.style.top = top + "px";
        });

        dot.addEventListener("mouseleave", function() {
          tooltip.style.display = "none";
        });

        if (p.links && p.links.length) {
          dot.addEventListener("click", function(e) {
            LookerCharts.Utils.openDrillMenu({ links: p.links, event: e });
          });
        }

        svg.appendChild(dot);
      });

      chartWrap.appendChild(svg);
    }

    renderChart(parseInt(sel.value) || 0);
    sel.addEventListener("change", () => renderChart(parseInt(sel.value)));
    done();
  }
};

looker.plugins.visualizations.add(lineChartViz);
