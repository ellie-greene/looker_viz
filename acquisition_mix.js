const acquisitionMixViz = {
  id: "acquisition_mix",
  label: "Acquisition Mix",
  options: {
    threshold: {
      type: "number",
      label: "Anomaly threshold (pp)",
      default: 5,
      section: "Style"
    },
    dimension_label: {
      type: "string",
      label: "Dimension label",
      default: "",
      placeholder: "e.g. Channel, Dog size",
      section: "Style"
    }
  },

  create: function(element, config) {
    element.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      .am-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 12px 16px; box-sizing: border-box; height: 100%; overflow-y: auto; }
      .am-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 6px; }
      .am-title { font-size: 12px; font-weight: 600; color: #444; text-transform: uppercase; letter-spacing: 0.04em; }
      .am-anomalies { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; min-height: 22px; }
      .am-pill { font-size: 11px; padding: 2px 8px; border-radius: 20px; display: inline-flex; align-items: center; gap: 3px; }
      .am-pill-high { background: #fdf0cc; color: #553527; }
      .am-pill-low  { background: #f5e8f0; color: #7c1334; }
      .am-pill-ok   { font-size: 11px; color: #aaa; }
      .am-rows { display: flex; flex-direction: column; gap: 6px; }
      .am-row { display: flex; align-items: center; gap: 8px; position: relative; }
      .am-seg { font-size: 11px; color: #666; width: 90px; flex-shrink: 0; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .am-track { flex: 1; height: 8px; background: #f0f0f0; border-radius: 4px; position: relative; overflow: visible; cursor: default; }
      .am-bar { height: 100%; border-radius: 4px; position: absolute; top: 0; left: 0; }
      .am-needle { position: absolute; top: -3px; width: 2px; height: 14px; background: #555; border-radius: 1px; z-index: 2; }
      .am-pct { font-size: 11px; width: 32px; text-align: right; flex-shrink: 0; color: #333; font-variant-numeric: tabular-nums; }
      .am-delta { font-size: 10px; font-weight: 500; padding: 1px 5px; border-radius: 4px; white-space: nowrap; flex-shrink: 0; min-width: 44px; text-align: center; }
      .am-delta-high { background: #fdf0cc; color: #553527; }
      .am-delta-low  { background: #f5e8f0; color: #7c1334; }
      .am-delta-ok   { background: #f4f4f4; color: #999; }
      .am-tooltip { position: fixed; background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 11px; font-size: 11px; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: none; z-index: 9999; min-width: 160px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .am-tooltip-title { font-weight: 600; color: #222; margin-bottom: 5px; font-size: 12px; }
      .am-tooltip-row { display: flex; justify-content: space-between; gap: 16px; color: #555; margin-top: 3px; }
      .am-tooltip-label { color: #999; }
      .am-tooltip-val { font-weight: 500; color: #222; font-variant-numeric: tabular-nums; }
      .am-tooltip-delta-high { color: #553527; font-weight: 600; }
      .am-tooltip-delta-low  { color: #7c1334; font-weight: 600; }
      .am-tooltip-delta-ok   { color: #999; }
      .am-legend { display: flex; gap: 14px; margin-top: 12px; font-size: 10px; color: #999; flex-wrap: wrap; align-items: center; }
      .am-legend-item { display: flex; align-items: center; gap: 4px; }
      .am-legend-bar { width: 12px; height: 7px; border-radius: 2px; }
      .am-legend-needle { width: 2px; height: 12px; background: #555; border-radius: 1px; }
      .am-debug { font-size: 11px; color: #aaa; padding: 8px; }
    `;
    element.appendChild(style);

    const tooltip = document.createElement("div");
    tooltip.className = "am-tooltip";
    tooltip.id = "am-tooltip-" + Math.random().toString(36).slice(2);
    document.body.appendChild(tooltip);
    this._tooltip = tooltip;

    const wrap = document.createElement("div");
    wrap.className = "am-wrap";
    element.appendChild(wrap);
    this._wrap = wrap;
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    const wrap    = this._wrap;
    const tooltip = this._tooltip;
    wrap.innerHTML = "";

    const PALETTE = [
      "#713170", "#F2A900", "#96A34F", "#274C46", "#553527",
      "#BE0021", "#FFB4A8", "#E65A1E", "#556041", "#7C1334", "#EAE5DC"
    ];

    const dims     = queryResponse.fields.dimensions || [];
    const measures = (queryResponse.fields.measures || []).concat(queryResponse.fields.table_calculations || []);

    if (!dims.length || measures.length < 2 || !data.length) {
      wrap.innerHTML = `<div class="am-debug">Add one dimension (segment) and two measures: current period trialists + 8-week rolling trialists.</div>`;
      done(); return;
    }

    const threshold = config.threshold != null ? Number(config.threshold) : 5;
    const dimField  = dims[0];
    const mCurrent  = measures[0];
    const mRolling  = measures[1];

    const rows = data.map(row => {
      const segCell     = row[dimField.name];
      const currentCell = row[mCurrent.name];
      const rollingCell = row[mRolling.name];
      return {
        seg:     segCell     ? String(segCell.rendered     || segCell.value     || "") : "(none)",
        current: currentCell ? (Number(currentCell.value) || 0) : 0,
        rolling: rollingCell ? (Number(rollingCell.value) || 0) : 0,
        links:   currentCell ? (currentCell.links || []) : []
      };
    }).filter(r => r.seg);

    if (!rows.length) {
      wrap.innerHTML = `<div class="am-debug">No data rows returned.</div>`;
      done(); return;
    }

    const totalCurrent = rows.reduce((s, r) => s + r.current, 0) || 1;
    const totalRolling = rows.reduce((s, r) => s + r.rolling, 0) || 1;

    rows.forEach(r => {
      r.currentPct  = (r.current / totalCurrent) * 100;
      r.baselinePct = (r.rolling / totalRolling) * 100;
      r.delta       = r.currentPct - r.baselinePct;
    });

    // Header
    const header = document.createElement("div");
    header.className = "am-header";
    const titleEl = document.createElement("div");
    titleEl.className = "am-title";
    titleEl.textContent = config.dimension_label || (dimField.label_short || dimField.label || "");
    header.appendChild(titleEl);
    wrap.appendChild(header);

    // Anomaly pills
    const anomalies = rows.filter(r => Math.abs(r.delta) >= threshold);
    const pillStrip = document.createElement("div");
    pillStrip.className = "am-anomalies";
    if (anomalies.length === 0) {
      const ok = document.createElement("span");
      ok.className = "am-pill-ok";
      ok.textContent = "Within normal range";
      pillStrip.appendChild(ok);
    } else {
      anomalies.forEach(r => {
        const pill  = document.createElement("span");
        pill.className = "am-pill " + (r.delta > 0 ? "am-pill-high" : "am-pill-low");
        const arrow = r.delta > 0 ? "▲" : "▼";
        const sign  = r.delta > 0 ? "+" : "";
        pill.textContent = `${arrow} ${r.seg} (${sign}${r.delta.toFixed(1)}pp)`;
        pillStrip.appendChild(pill);
      });
    }
    wrap.appendChild(pillStrip);

    // Rows
    const rowsEl = document.createElement("div");
    rowsEl.className = "am-rows";

    const mCurrentLabel = mCurrent.label_short || mCurrent.label || "This week";
    const mRollingLabel = mRolling.label_short || mRolling.label || "8-week avg";

    rows.forEach((r, i) => {
      const barColor   = PALETTE[i % PALETTE.length];
      const deltaClass = r.delta >= threshold ? "am-delta-high" : r.delta <= -threshold ? "am-delta-low" : "am-delta-ok";
      const sign       = r.delta > 0 ? "+" : "";

      const row = document.createElement("div");
      row.className = "am-row";

      const seg = document.createElement("div");
      seg.className = "am-seg";
      seg.textContent = r.seg;
      seg.title = r.seg;

      const track = document.createElement("div");
      track.className = "am-track";

      const bar = document.createElement("div");
      bar.className = "am-bar";
      bar.style.width      = Math.min(r.currentPct, 100).toFixed(1) + "%";
      bar.style.background = barColor;
      bar.style.opacity    = "0.8";

      const needle = document.createElement("div");
      needle.className  = "am-needle";
      needle.style.left = Math.min(r.baselinePct, 100).toFixed(1) + "%";

      track.appendChild(bar);
      track.appendChild(needle);

      // Tooltip
      track.addEventListener("mouseenter", function(e) {
        const tooltipDeltaClass = r.delta >= threshold ? "am-tooltip-delta-high" : r.delta <= -threshold ? "am-tooltip-delta-low" : "am-tooltip-delta-ok";
        const arrow = r.delta > 0 ? "▲" : r.delta < 0 ? "▼" : "–";
        tooltip.innerHTML = `
          <div class="am-tooltip-title">${r.seg}</div>
          <div class="am-tooltip-row"><span class="am-tooltip-label">${mCurrentLabel}</span><span class="am-tooltip-val">${r.currentPct.toFixed(1)}% (${r.current.toLocaleString()})</span></div>
          <div class="am-tooltip-row"><span class="am-tooltip-label">${mRollingLabel}</span><span class="am-tooltip-val">${r.baselinePct.toFixed(1)}%</span></div>
          <div class="am-tooltip-row"><span class="am-tooltip-label">vs avg</span><span class="am-tooltip-val ${tooltipDeltaClass}">${arrow} ${sign}${r.delta.toFixed(1)}pp</span></div>
        `;
        tooltip.style.display = "block";
      });
      track.addEventListener("mousemove", function(e) {
        const pad = 12;
        let left = e.clientX + pad;
        let top  = e.clientY + pad;
        const tw = 180;
        if (left + tw > window.innerWidth) left = e.clientX - tw - pad;
        tooltip.style.left = left + "px";
        tooltip.style.top  = top  + "px";
      });
      track.addEventListener("mouseleave", function() {
        tooltip.style.display = "none";
      });

      const pct = document.createElement("div");
      pct.className   = "am-pct";
      pct.textContent = r.currentPct.toFixed(1) + "%";

      const delta = document.createElement("div");
      delta.className   = "am-delta " + deltaClass;
      delta.textContent = sign + r.delta.toFixed(1) + "pp";

      row.appendChild(seg);
      row.appendChild(track);
      row.appendChild(pct);
      row.appendChild(delta);

      if (r.links && r.links.length) {
        row.style.cursor = "pointer";
        row.addEventListener("click", e => {
          LookerCharts.Utils.openDrillMenu({ links: r.links, event: e });
        });
      }

      rowsEl.appendChild(row);
    });

    wrap.appendChild(rowsEl);

    // Legend
    const legend = document.createElement("div");
    legend.className = "am-legend";
    legend.innerHTML = `
      <div class="am-legend-item"><div class="am-legend-needle"></div><span>8-week avg</span></div>
      <div class="am-legend-item"><div class="am-legend-bar" style="background:#E65A1E;opacity:0.8"></div><span>higher than usual</span></div>
      <div class="am-legend-item"><div class="am-legend-bar" style="background:#96A34F;opacity:0.8"></div><span>lower than usual</span></div>
    `;
    wrap.appendChild(legend);

    done();
  }
};

looker.plugins.visualizations.add(acquisitionMixViz);
