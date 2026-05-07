const eventCalendarViz = {
  id: "event_calendar",
  label: "Event Calendar",
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
    const allFields = [...(fields.dimensions || []), ...(fields.measures || [])];
 
    const yearField = allFields.find(f =>
      (f.label_short || f.label || f.name).toLowerCase().includes("year")
    );
    const monthField = allFields.find(f => {
      const l = (f.label_short || f.label || f.name).toLowerCase();
      return l.includes("month") && !l.includes("year");
    });
    const measures = fields.measures || [];
 
    if (!yearField || !monthField || measures.length === 0 || data.length === 0) {
      wrap.innerHTML = `<p style="color:#aaa;font-size:13px;padding:20px;">Configure the query with a year dimension, month dimension, and at least one measure.</p>`;
      done();
      return;
    }
 
    const controls = document.createElement("div");
    controls.className = "ecv-controls";
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
 
    const tableWrap = document.createElement("div");
    wrap.appendChild(tableWrap);
 
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const isLowGood = config.is_low_good || false;
 
    function getCellValue(row, field) {
      if (!field || !row) return null;
      const cell = row[field.name];
      if (!cell) return null;
      const v = cell.value;
      return (v === null || v === undefined || v === "") ? null : Number(v);
    }
 
    function fmtValue(v, field) {
      if (v === null || v === undefined) return null;
      const fname = (field.name + (field.value_format || "")).toLowerCase();
      if (fname.includes("gbp") || fname.includes("cost") || fname.includes("commission") || fname.includes("expense") || fname.includes("cpa")) {
        if (fname.includes("cpa") || fname.includes("decimal")) return "\u00a3" + v.toFixed(2);
        return "\u00a3" + Math.round(v).toLocaleString("en-GB");
      }
      return Math.round(v).toLocaleString("en-GB");
    }
 
    function renderTable(mIdx) {
      tableWrap.innerHTML = "";
      const measure = measures[mIdx];
 
      const byYearMonth = {};
      const years = new Set();
      const monthsFound = new Set();
 
      data.forEach(row => {
        const y = String(row[yearField.name]?.value || "");
        const m = String(row[monthField.name]?.value || "");
        if (!y || !m) return;
        years.add(y);
        monthsFound.add(m);
        if (!byYearMonth[y]) byYearMonth[y] = {};
        byYearMonth[y][m] = row;
      });
 
      const sortedYears = Array.from(years).sort();
      const activeMths = MONTHS.filter(m => monthsFound.has(m));
 
      const table = document.createElement("table");
      table.className = "ecv-table";
 
      let thRow = "<tr><th class='year-h'>Year</th>";
      activeMths.forEach(m => { thRow += `<th>${m.slice(0,3)}</th>`; });
      thRow += "</tr>";
      table.innerHTML = `<thead>${thRow}</thead>`;
 
      const tbody = document.createElement("tbody");
 
      sortedYears.forEach(y => {
        const prevY = String(Number(y) - 1);
        const tr = document.createElement("tr");
        let html = `<td class="year-cell">${y}</td>`;
 
        activeMths.forEach(mo => {
          const curr = getCellValue(byYearMonth[y]?.[mo], measure);
          const prev = getCellValue(byYearMonth[prevY]?.[mo], measure);
 
          if (curr === null) {
            html += `<td class="metric-cell"><span class="ecv-null">\u2014</span></td>`;
            return;
          }
 
          const fmted = fmtValue(curr, measure);
          let ppHtml = `<div class="ecv-pp ecv-neu">\u2014</div>`;
 
          if (prev !== null && prev !== 0) {
            const pct = (curr - prev) / Math.abs(prev) * 100;
            const isGood = isLowGood ? pct < 0 : pct > 0;
            const isBad  = isLowGood ? pct > 0 : pct < 0;
            const cls    = isGood ? "ecv-pos" : isBad ? "ecv-neg" : "ecv-neu";
            const arrow  = pct > 0 ? "\u2191" : pct < 0 ? "\u2193" : "\u2192";
            ppHtml = `<div class="ecv-pp ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</div>`;
          }
 
          html += `<td class="metric-cell"><div class="ecv-main">${fmted}</div>${ppHtml}</td>`;
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
