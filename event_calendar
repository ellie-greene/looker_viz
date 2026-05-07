const eventCalendarViz = {
  id: "event_calendar",
  label: "Event Calendar",
  options: {
    is_low_good: {
      type: "boolean",
      label: "Lower is better (e.g. CPA)",
      default: false,
      section: "Style"
    },
    main_label: {
      type: "string",
      label: "Main metric label",
      default: "",
      placeholder: "Auto-detected from field",
      section: "Style"
    }
  },
 
  create: function(element, config) {
    element.innerHTML = "";
 
    const style = document.createElement("style");
    style.textContent = `
      .ecv-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 12px; overflow-x: auto; }
      .ecv-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
      .ecv-controls label { font-size: 12px; color: #6b6b6b; }
      .ecv-controls select { font-size: 12px; padding: 3px 7px; border-radius: 6px; border: 1px solid #ddd; background: #fff; color: #333; cursor: pointer; }
      .ecv-table { border-collapse: collapse; width: 100%; }
      .ecv-table th { font-size: 11px; font-weight: 500; color: #888; padding: 5px 8px; text-align: center; border-bottom: 1px solid #e8e8e8; background: #fafafa; white-space: nowrap; }
      .ecv-table th.year-h { text-align: left; }
      .ecv-table td.year-cell { font-size: 12px; font-weight: 600; color: #555; padding: 6px 10px; border-right: 1px solid #e8e8e8; white-space: nowrap; vertical-align: middle; background: #fafafa; }
      .ecv-table td.metric-cell { padding: 5px 6px; text-align: center; border: 0.5px solid #f0f0f0; vertical-align: middle; min-width: 68px; }
      .ecv-table tr:hover td { background: #f7f8ff; }
      .ecv-main { font-size: 14px; font-weight: 600; color: #222; line-height: 1.2; }
      .ecv-pp { font-size: 10px; margin-top: 3px; display: flex; align-items: center; justify-content: center; gap: 2px; white-space: nowrap; }
      .ecv-pos { color: #1a7f45; }
      .ecv-neg { color: #c0392b; }
      .ecv-neu { color: #aaa; }
      .ecv-null { color: #ccc; font-size: 12px; }
      .ecv-title { font-size: 11px; font-weight: 500; color: #888; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    `;
    element.appendChild(style);
 
    const wrap = document.createElement("div");
    wrap.className = "ecv-wrap";
    element.appendChild(wrap);
    this._wrap = wrap;
  },
 
  updateAsync: function(data, element, config, queryResponse, details, done) {
    const wrap = this._wrap;
    wrap.innerHTML = "";
 
    const fields = queryResponse.fields;
    const allFields = [
      ...(fields.dimensions || []),
      ...(fields.measures || [])
    ];
 
    // Find year and month dimensions
    const yearField = allFields.find(f =>
      f.name.toLowerCase().includes("year") ||
      f.label_short?.toLowerCase().includes("year")
    );
    const monthField = allFields.find(f =>
      f.name.toLowerCase().includes("month") &&
      !f.name.toLowerCase().includes("year")
    );
 
    // Find measure pairs: current + _pp
    const measures = fields.measures || [];
    const currentMeasures = measures.filter(f => !f.name.toLowerCase().includes("_pp"));
    const ppMeasures = measures.filter(f => f.name.toLowerCase().includes("_pp") && !f.name.toLowerCase().includes("_perc") && !f.name.toLowerCase().includes("_actual"));
 
    // Build measure options: pair current with matching _pp
    const pairs = currentMeasures.map(cm => {
      const baseName = cm.name;
      const pp = ppMeasures.find(p => p.name === baseName + "_pp" || p.name.replace("_pp","") === baseName);
      return { label: cm.label_short || cm.label || cm.name, current: cm, pp: pp || null };
    });
 
    if (!yearField || !monthField || pairs.length === 0 || data.length === 0) {
      wrap.innerHTML = `<p style="color:#aaa;font-size:13px;padding:20px;">Configure the query with year dimension, month dimension, and at least one measure.</p>`;
      done();
      return;
    }
 
    // Controls
    const controls = document.createElement("div");
    controls.className = "ecv-controls";
 
    const lbl = document.createElement("label");
    lbl.textContent = "Metric";
    controls.appendChild(lbl);
 
    const sel = document.createElement("select");
    pairs.forEach((p, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = p.label;
      sel.appendChild(o);
    });
    controls.appendChild(sel);
    wrap.appendChild(controls);
 
    const tableWrap = document.createElement("div");
    wrap.appendChild(tableWrap);
 
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const MONTHS_SHORT = MONTHS.map(m => m.slice(0,3));
 
    const isLowGood = config.is_low_good || false;
 
    function getCellValue(row, field) {
      if (!field) return null;
      const cell = row[field.name];
      if (!cell) return null;
      const v = cell.value;
      return (v === null || v === undefined || v === "") ? null : Number(v);
    }
 
    function fmtValue(v, field) {
      if (v === null || v === undefined) return null;
      const rendered = field ? (field.value_format || "") : "";
      if (rendered.includes("£") || rendered.includes("gbp") || (field && field.name.toLowerCase().includes("cost")) || (field && field.name.toLowerCase().includes("commission")) || (field && field.name.toLowerCase().includes("expense"))) {
        return "£" + Math.round(v).toLocaleString("en-GB");
      }
      if (rendered.includes("%") || (field && field.name.toLowerCase().includes("perc"))) {
        return (v * 100).toFixed(1) + "%";
      }
      if (rendered.includes(".00") || (field && field.name.toLowerCase().includes("cpa"))) {
        return "£" + v.toFixed(2);
      }
      return Math.round(v).toLocaleString("en-GB");
    }
 
    function renderTable(pairIdx) {
      tableWrap.innerHTML = "";
      const pair = pairs[pairIdx];
 
      // Index data by year → month
      const byYearMonth = {};
      const years = new Set();
      const monthsFound = new Set();
 
      data.forEach(row => {
        const yearVal = row[yearField.name]?.value;
        const monthVal = row[monthField.name]?.value;
        if (!yearVal || !monthVal) return;
        const y = String(yearVal);
        const m = String(monthVal);
        years.add(y);
        monthsFound.add(m);
        if (!byYearMonth[y]) byYearMonth[y] = {};
        byYearMonth[y][m] = row;
      });
 
      // Sort years ascending
      const sortedYears = Array.from(years).sort();
 
      // Determine which months are present, in calendar order
      const activeMths = MONTHS.filter(m => monthsFound.has(m));
 
      const table = document.createElement("table");
      table.className = "ecv-table";
 
      // Header
      const thead = document.createElement("thead");
      let thRow = "<tr><th class='year-h'>Year</th>";
      activeMths.forEach(m => { thRow += `<th>${m.slice(0,3)}</th>`; });
      thRow += "</tr>";
      thead.innerHTML = thRow;
      table.appendChild(thead);
 
      // Body
      const tbody = document.createElement("tbody");
      sortedYears.forEach(y => {
        const tr = document.createElement("tr");
        let html = `<td class="year-cell">${y}</td>`;
 
        activeMths.forEach(mo => {
          const row = byYearMonth[y]?.[mo];
          const prevRow = byYearMonth[String(Number(y)-1)]?.[mo];
 
          const curr = row ? getCellValue(row, pair.current) : null;
          const pp = row && pair.pp ? getCellValue(row, pair.pp) : null;
 
          // pp% = (curr - pp) / pp
          let ppPct = null;
          if (curr !== null && pp !== null && pp !== 0) {
            ppPct = (curr - pp) / Math.abs(pp) * 100;
          }
 
          if (curr === null) {
            html += `<td class="metric-cell"><span class="ecv-null">—</span></td>`;
          } else {
            const fmted = fmtValue(curr, pair.current);
            let ppHtml = "";
            if (ppPct !== null) {
              const isGood = isLowGood ? ppPct < 0 : ppPct > 0;
              const isBad = isLowGood ? ppPct > 0 : ppPct < 0;
              const cls = isGood ? "ecv-pos" : isBad ? "ecv-neg" : "ecv-neu";
              const arrow = ppPct > 0 ? "↑" : ppPct < 0 ? "↓" : "→";
              ppHtml = `<div class="ecv-pp ${cls}">${arrow} ${Math.abs(ppPct).toFixed(1)}%</div>`;
            } else {
              ppHtml = `<div class="ecv-pp ecv-neu">—</div>`;
            }
            html += `<td class="metric-cell"><div class="ecv-main">${fmted}</div>${ppHtml}</td>`;
          }
        });
 
        tr.innerHTML = html;
        tbody.appendChild(tr);
      });
 
      table.appendChild(tbody);
      tableWrap.appendChild(table);
    }
 
    renderTable(parseInt(sel.value) || 0);
    sel.addEventListener("change", () => renderTable(parseInt(sel.value)));
 
    done();
  }
};
 
looker.plugins.visualizations.add(eventCalendarViz);
