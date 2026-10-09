/**
 * scaled_heatmap_table.js
 * Looker custom visualisation — native-style table with conditional formatting
 * where EACH measure column is scaled independently (own min → max) with its
 * own single-hue ramp: white (low) → column colour (high).
 *
 * Features:
 *  - Looks like Looker's default table (fonts, zebra rows, sticky header)
 *  - Per-column colour scale: every measure normalised to its own min/max
 *  - Per-column colour, defaulting to the Pure brand palette in rotation,
 *    overridable per measure in the viz editor
 *  - Per-measure direction (High is good / Low is good / No colouring) set in
 *    the viz config — no LookML/measure changes needed. Shown as a small
 *    "▲ good" / "▼ good" indicator in the column header
 *  - Optional: invert the ramp on low-is-good columns so colour depth always
 *    means "good" rather than "high"
 *  - Optional data-bar column (like the Complaints bar in the standard table)
 *  - Pivot support: each measure × pivot combination scales independently
 *  - Row-total column: when the Explore's "Row Total" is on, the pivot total
 *    is shown as a plain bold "Total" column (unscaled — never heat-coloured
 *    or turned into a bar, matching Looker's own table)
 *  - Grand-totals footer row, computed client-side across the rows the
 *    visualisation actually received (see caveat below)
 *  - Drill menu support on cell click
 *  - Click any column header to sort (measures: high → low first; dimensions:
 *    A → Z first; a third click restores Looker's row order). The totals
 *    footer stays pinned at the bottom.
 *
 * A note on totals: Looker's Visualization API does not hand custom
 * visualisations a separately-computed grand-total row — queryResponse only
 * exposes `has_totals` / `has_row_totals` flags, and the per-row pivot total
 * arrives as a normal pivot with `is_total: true` (key "$$$_row_total_$$$").
 * So the row-total *column* below is real Looker data, but the totals
 * *footer row* is this visualisation summing the rows it was given — if the
 * query is row-limited, that sum can differ from Looker's own "Total" value
 * for a measure (which is computed server-side over the full result set).
 * Only genuinely additive measure types (sum/count/count_distinct/
 * sum_distinct) are summed by default — ratios, percentages, averages and
 * anything typed "number" show "—" instead of a meaningless summed or
 * re-averaged percentage. Override per measure via the "— totals row"
 * option (Auto / Sum / None) if you know a "number"-type measure really is
 * additive.
 *
 * Host at ellie-greene/looker_viz, serve via jsDelivr:
 *   https://cdn.jsdelivr.net/gh/ellie-greene/looker_viz@main/scaled_heatmap_table.js
 * Purge after updates:
 *   https://purge.jsdelivr.net/gh/ellie-greene/looker_viz@main/scaled_heatmap_table.js
 */
looker.plugins.visualizations.add({
  id: "scaled_heatmap_table",
  label: "Scaled Heatmap Table",
  // Static options — per-measure colour & direction options are added dynamically
  options: {
    text_contrast: {
      section: "Colours",
      order: 1,
      type: "boolean",
      label: "Auto dark/light text for readability",
      default: true,
    },
    invert_low_good: {
      section: "Colours",
      order: 2,
      type: "boolean",
      label: "Deep colour = good (invert ramp on low-is-good columns)",
      default: true,
    },
    bar_color: {
      section: "Colours",
      order: 3,
      type: "string",
      display: "color",
      label: "Data bar colour",
      default: "#7B0060", // Duck dark
    },
    show_direction_badge: {
      section: "Formatting",
      order: 2,
      type: "boolean",
      label: "Show good-direction indicator in headers",
      default: true,
    },
    show_totals_row: {
      section: "Formatting",
      order: 3,
      type: "boolean",
      label: "Show totals row (sums the rows this visualisation received)",
      default: true,
    },
    debug_log_query_response: {
      section: "Formatting",
      order: 4,
      type: "boolean",
      label: "[Debug] Log queryResponse to console (remove once checked)",
      default: false,
    },
  },
  // Pure pack colours (dark shades first), ordered for legibility on a white ramp
  _PALETTE: [
    "#7B0060", // Duck dark
    "#00558C", // Turkey dark
    "#DC4405", // Chicken dark
    "#006731", // Veggie dark
    "#B52555", // Salmon dark
    "#115E67", // Herring dark
    "#683431", // Lamb dark
    "#1D6960", // Game dark
    "#C07D59", // Lamb light
    "#FFB81C", // Chicken light
  ],
  // Measure types where re-summing the visible rows is a meaningful "total".
  // Everything else — averages, medians, min/max, and critically "number"
  // (LookML's generic type, almost always used for ratios/percentages/other
  // derived-not-additive values, e.g. a "% Active" measure) — is excluded on
  // purpose: summing row-level percentages produces nonsense like "3.31"
  // instead of a real percentage. Looker's own advanced_table example
  // visualisation treats "number" the same way, grouping it with averages
  // rather than sums. Use the per-measure "— totals row" option below to
  // override this on a measure you know really is additive.
  _SUMMABLE_TYPES: ["sum", "sum_distinct", "count", "count_distinct"],
  // ────────────────────────────────────────────────────────────────────────
  create: function (element) {
    element.innerHTML = "";
    this._container = element.appendChild(document.createElement("div"));
    this._container.className = "sht-container";
    const style = document.createElement("style");
    style.innerHTML = `
      .sht-container {
        width: 100%;
        height: 100%;
        overflow: auto;
        font-family: 'Open Sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 12px;
        color: #262d33;
      }
      .sht-table {
        border-collapse: collapse;
        width: 100%;
      }
      .sht-table th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #ffffff;
        font-weight: 600;
        text-align: left;
        padding: 8px 12px;
        border-bottom: 1px solid #d0d4d6;
        border-right: 1px solid #e8e9ea;
        white-space: normal;
        vertical-align: bottom;
      }
      .sht-table th.sht-num { text-align: right; }
      .sht-table th.sht-total { background: #f4f2f5; }
      .sht-table th.sht-sortable {
        cursor: pointer;
        user-select: none;
      }
      .sht-table th.sht-sortable:hover { background: #f1f3f4; }
      .sht-sort-ind {
        margin-left: 4px;
        font-size: 11px;
      }
      .sht-dir {
        display: block;
        font-weight: 400;
        font-size: 10px;
        color: #9aa0a6;
        margin-top: 1px;
      }
      .sht-table td {
        padding: 5px 12px;
        border-bottom: 1px solid #eef0f1;
        border-right: 1px solid #eef0f1;
        white-space: nowrap;
      }
      .sht-table td.sht-num { text-align: right; }
      .sht-table tr:nth-child(even) td.sht-plain { background: #f8f8f8; }
      .sht-table tr:hover td.sht-plain { background: #f1f3f4; }
      .sht-table td.sht-total {
        background: #f4f2f5;
        font-weight: 700;
      }
      .sht-null { color: #9aa0a6; }
      .sht-drillable { cursor: pointer; }
      .sht-barcell {
        position: relative;
        min-width: 140px;
      }
      .sht-bar {
        position: absolute;
        left: 2px;
        top: 3px;
        bottom: 3px;
        border-radius: 1px;
        z-index: 0;
      }
      .sht-barlabel {
        position: relative;
        z-index: 1;
        padding-left: 4px;
      }
      .sht-table tfoot td {
        position: sticky;
        bottom: 0;
        z-index: 1;
        background: #eef0f1;
        font-weight: 700;
        border-top: 2px solid #d0d4d6;
        border-bottom: none;
      }
      .sht-error {
        padding: 16px;
        color: #9aa0a6;
        font-style: italic;
      }
    `;
    this._container.appendChild(style);
    this._content = this._container.appendChild(document.createElement("div"));
    this._registeredOptionsKey = null;
    this._sort = null; // { key, dir } — survives re-renders
  },
  // ─── Helpers ─────────────────────────────────────────────────────────────
  _hexToRgb: function (hex) {
    if (!hex) return null;
    const h = hex.replace("#", "").trim();
    if (h.length !== 6) return null;
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  },
  _lerp: function (a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  },
  _luminance: function (rgb) {
    const chan = rgb.map(function (c) {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  },
  _escape: function (s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
  _formatNumber: function (n) {
    if (!isFinite(n)) return String(n);
    const rounded = Math.round(n * 100) / 100;
    return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  // ─── Column sorting ──────────────────────────────────────────────────────
  // Headers carrying data-sort are clickable. First click sorts measures
  // high → low and dimensions A → Z, second click reverses, third restores
  // Looker's row order. Existing <tr>s are reordered in place, so colours,
  // drill links and the tfoot totals row are unaffected. Nulls always sort last.
  _compareValues: function (a, b, dir) {
    const aNull = a == null || (typeof a === "number" && !isFinite(a));
    const bNull = b == null || (typeof b === "number" && !isFinite(b));
    if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1;
    const c =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    return dir === "desc" ? -c : c;
  },
  _bindSorting: function (getters, data) {
    const self = this;
    const table = this._content.querySelector("table.sht-table");
    if (!table) return;
    const tbody = table.tBodies[0];
    const rows = Array.prototype.slice.call(tbody.rows);
    const headers = Array.prototype.slice.call(
      table.querySelectorAll("th[data-sort]")
    );
    // Drop a remembered sort whose column no longer exists
    if (self._sort && !getters[self._sort.key]) self._sort = null;
    function rowIndex(tr) {
      return parseInt(tr.getAttribute("data-r"), 10);
    }
    function apply() {
      const sort = self._sort;
      const order = rows.slice();
      if (sort) {
        const get = getters[sort.key];
        order.sort(function (ra, rb) {
          const ia = rowIndex(ra);
          const ib = rowIndex(rb);
          const c = self._compareValues(get(data[ia]), get(data[ib]), sort.dir);
          return c !== 0 ? c : ia - ib;
        });
      }
      order.forEach(function (tr) { tbody.appendChild(tr); });
      headers.forEach(function (th) {
        const active = sort && sort.key === th.getAttribute("data-sort");
        th.querySelector(".sht-sort-ind").textContent = active
          ? sort.dir === "asc" ? "↑" : "↓"
          : "";
        th.setAttribute(
          "aria-sort",
          active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
        );
      });
    }
    headers.forEach(function (th) {
      th.addEventListener("click", function () {
        const key = th.getAttribute("data-sort");
        const firstDir = th.classList.contains("sht-num") ? "desc" : "asc";
        const s = self._sort;
        if (!s || s.key !== key) {
          self._sort = { key: key, dir: firstDir };
        } else if (s.dir === firstDir) {
          self._sort = { key: key, dir: firstDir === "asc" ? "desc" : "asc" };
        } else {
          self._sort = null;
        }
        apply();
      });
    });
    apply();
  },
  // ─── Main render ─────────────────────────────────────────────────────────
  updateAsync: function (data, element, config, queryResponse, details, done) {
    const self = this;
    const dims = queryResponse.fields.dimension_like || [];
    const measures = queryResponse.fields.measure_like || [];
    const pivots = queryResponse.pivots || null;
    const hasPivot = pivots && pivots.length > 0;
    if (measures.length === 0) {
      this._content.innerHTML =
        '<div class="sht-error">Add at least one measure to use this visualisation.</div>';
      done();
      return;
    }
    // ── TEMPORARY DEBUG — turn on "[Debug] Log queryResponse to console" in
    //    the viz editor, run with Row Total / measure Total enabled, then
    //    check the browser console. Look at the "top-level keys" line first —
    //    anything there beyond data/fields/pivots/has_totals/has_row_totals
    //    is worth inspecting closely. Delete this whole block once checked.
    if (config.debug_log_query_response) {
      console.log("[scaled_heatmap_table] top-level queryResponse keys:", Object.keys(queryResponse));
      console.log("[scaled_heatmap_table] has_totals:", queryResponse.has_totals, "has_row_totals:", queryResponse.has_row_totals);
      console.log("[scaled_heatmap_table] full queryResponse:", queryResponse);
      console.log("[scaled_heatmap_table] first data row:", data && data[0]);
      console.log("[scaled_heatmap_table] last data row:", data && data[data.length - 1]);
    }
    // ── Dynamically register per-measure options (viz-level config only —
    //    no LookML changes required) ─────────────────────────────────────────
    const dynamicOptions = {};
    for (const key in this.options) dynamicOptions[key] = this.options[key];
    measures.forEach(function (m, i) {
      const label = m.label_short || m.label;
      dynamicOptions["direction_" + m.name] = {
        section: "Column scales",
        order: i * 3 + 1,
        type: "string",
        display: "select",
        label: label + " — direction",
        values: [
          { "High is good": "high" },
          { "Low is good": "low" },
          { "No colouring": "none" },
        ],
        default: "high",
      };
      dynamicOptions["color_" + m.name] = {
        section: "Column scales",
        order: i * 3 + 2,
        type: "string",
        display: "color",
        label: label + " — colour",
        default: self._PALETTE[i % self._PALETTE.length],
      };
      dynamicOptions["totals_" + m.name] = {
        section: "Column scales",
        order: i * 3 + 3,
        type: "string",
        display: "select",
        label: label + " — totals row",
        values: [
          { "Auto (sum only if additive)": "auto" },
          { "Sum": "sum" },
          { "None (—)": "none" },
        ],
        default: "auto",
      };
    });
    const barValues = [{ "None": "__none__" }];
    measures.forEach(function (m) {
      const entry = {};
      entry[m.label_short || m.label] = m.name;
      barValues.push(entry);
    });
    dynamicOptions["bar_measure"] = {
      section: "Formatting",
      order: 1,
      type: "string",
      display: "select",
      label: "Show data bar on (colouring disabled for that column)",
      values: barValues,
      default: "__none__",
    };
    // Only re-register when the field set changes, to avoid render loops
    const optionsKey = measures.map(function (m) { return m.name; }).join("|");
    if (optionsKey !== this._registeredOptionsKey) {
      this._registeredOptionsKey = optionsKey;
      this.trigger("registerOptions", dynamicOptions);
    }
    // ── Build flat column list (measure × pivot when pivoted) ─────────────
    // Looker adds a synthetic pivot for the Explore's "Row Total" setting —
    // it carries is_total:true and key "$$$_row_total_$$$". We render it as
    // its own "Total" column instead of dropping it.
    const columns = [];
    measures.forEach(function (m, mIdx) {
      if (hasPivot) {
        pivots.forEach(function (p) {
          const isTotalPivot = p.is_total || p.key === "$$$_row_total_$$$";
          if (isTotalPivot) {
            columns.push({
              measure: m,
              measureIndex: mIdx,
              pivotKey: p.key,
              label: measures.length > 1 ? "Total — " + (m.label_short || m.label) : "Total",
              isTotal: true,
            });
            return;
          }
          const pivotLabel = p.metadata
            ? Object.keys(p.metadata)
                .map(function (k) { return p.metadata[k].rendered || p.metadata[k].value; })
                .join(" ")
            : p.key;
          columns.push({
            measure: m,
            measureIndex: mIdx,
            pivotKey: p.key,
            label:
              measures.length > 1
                ? pivotLabel + " — " + (m.label_short || m.label)
                : pivotLabel,
            isTotal: false,
          });
        });
      } else {
        columns.push({
          measure: m,
          measureIndex: mIdx,
          pivotKey: null,
          label: m.label_short || m.label,
          isTotal: false,
        });
      }
    });
    // ── Cell accessor ──────────────────────────────────────────────────────
    function getCell(row, col) {
      const holder = row[col.measure.name];
      if (holder == null) return null;
      return col.pivotKey != null ? holder[col.pivotKey] : holder;
    }
    // ── Per-column min/max (independent scales) + colour + direction ──────
    // Total columns are never heat-scaled or bar-ified — like Looker's own
    // table, the Total column stays a plain bold number.
    columns.forEach(function (col) {
      let min = Infinity;
      let max = -Infinity;
      if (!col.isTotal) {
        data.forEach(function (row) {
          const cell = getCell(row, col);
          const v = cell ? cell.value : null;
          if (typeof v === "number" && isFinite(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        });
      }
      col.min = min;
      col.max = max;
      col.hasRange = isFinite(min) && isFinite(max);
      col.direction = config["direction_" + col.measure.name] || "high";
      col.isBar = !col.isTotal && config["bar_measure"] === col.measure.name;
      col.rgb =
        self._hexToRgb(config["color_" + col.measure.name]) ||
        self._hexToRgb(self._PALETTE[col.measureIndex % self._PALETTE.length]);
    });
    const WHITE = [255, 255, 255];
    const barColor = config.bar_color || "#7B0060";
    const useContrast = config.text_contrast !== false;
    const invertLowGood = config.invert_low_good !== false;
    const showBadge = config.show_direction_badge !== false;
    const showTotalsRow = config.show_totals_row !== false;
    // ── Sort keys → value getters (keys are stable across re-renders) ─────
    const sortGetters = {};
    dims.forEach(function (d) {
      sortGetters["d:" + d.name] = function (row) {
        const cell = row[d.name];
        return cell ? cell.value : null;
      };
    });
    columns.forEach(function (col) {
      col.sortKey = "m:" + col.measure.name + "|" + (col.pivotKey || "");
      sortGetters[col.sortKey] = function (row) {
        const cell = getCell(row, col);
        return cell ? cell.value : null;
      };
    });
    // ── Build table ────────────────────────────────────────────────────────
    let html = '<table class="sht-table"><thead><tr>';
    dims.forEach(function (d) {
      html +=
        '<th class="sht-sortable" data-sort="' + self._escape("d:" + d.name) +
        '" title="Click to sort">' +
        self._escape(d.label_short || d.label) +
        '<span class="sht-sort-ind"></span></th>';
    });
    columns.forEach(function (col) {
      let badge = "";
      if (showBadge && !col.isBar && !col.isTotal && col.direction !== "none") {
        badge =
          '<span class="sht-dir">' +
          (col.direction === "low" ? "&#9660; good" : "&#9650; good") +
          "</span>";
      }
      html +=
        '<th class="sht-num sht-sortable' + (col.isTotal ? " sht-total" : "") +
        '" data-sort="' + self._escape(col.sortKey) + '" title="Click to sort">' +
        self._escape(col.label) +
        '<span class="sht-sort-ind"></span>' + badge + "</th>";
    });
    html += "</tr></thead><tbody>";
    data.forEach(function (row, rIdx) {
      html += '<tr data-r="' + rIdx + '">';
      dims.forEach(function (d) {
        const cell = row[d.name];
        const text =
          cell && cell.rendered !== undefined && cell.rendered !== null
            ? cell.rendered
            : cell
            ? cell.value
            : null;
        const drillable = cell && cell.links && cell.links.length > 0;
        html +=
          '<td class="sht-plain' +
          (drillable ? " sht-drillable" : "") +
          '" data-r="' + rIdx + '" data-f="' + self._escape(d.name) + '">' +
          (text == null
            ? '<span class="sht-null">&empty;</span>'
            : self._escape(text)) +
          "</td>";
      });
      columns.forEach(function (col, cIdx) {
        const cell = getCell(row, col);
        const v = cell ? cell.value : null;
        const text =
          cell && cell.rendered !== undefined && cell.rendered !== null
            ? cell.rendered
            : v;
        const drillable = cell && cell.links && cell.links.length > 0;
        const attrs = ' data-r="' + rIdx + '" data-c="' + cIdx + '"';
        // Total column — plain bold number, never a bar or heat colour
        if (col.isTotal) {
          html +=
            '<td class="sht-num sht-total' +
            (drillable ? " sht-drillable" : "") +
            '"' + attrs + ">" +
            (text == null
              ? '<span class="sht-null">&empty;</span>'
              : self._escape(text)) +
            "</td>";
          return;
        }
        // Data-bar column — bar instead of heat colouring
        if (col.isBar) {
          let barHtml = "";
          if (
            typeof v === "number" &&
            isFinite(v) &&
            col.hasRange &&
            col.max > 0
          ) {
            const pct = Math.max(0, Math.min(100, (v / col.max) * 100));
            barHtml =
              '<div class="sht-bar" style="width:' +
              pct.toFixed(1) +
              "%;background:" +
              barColor +
              ';"></div>';
          }
          html +=
            '<td class="sht-num sht-plain sht-barcell' +
            (drillable ? " sht-drillable" : "") +
            '"' + attrs + ">" +
            barHtml +
            '<span class="sht-barlabel">' +
            (text == null
              ? '<span class="sht-null">&empty;</span>'
              : self._escape(text)) +
            "</span></td>";
          return;
        }
        // Heat-scaled column: white (low) → column colour (high).
        // If "deep colour = good" is on, low-is-good columns invert so the
        // ramp tracks performance instead of magnitude.
        let styleAttr = "";
        let cellClass = "sht-num sht-plain";
        if (
          col.direction !== "none" &&
          typeof v === "number" &&
          isFinite(v) &&
          col.hasRange
        ) {
          let t =
            col.max === col.min ? 0.5 : (v - col.min) / (col.max - col.min);
          if (invertLowGood && col.direction === "low") t = 1 - t;
          const rgb = self._lerp(WHITE, col.rgb, t);
          let textColor = "";
          if (useContrast) {
            textColor =
              self._luminance(rgb) > 0.45 ? "#262d33" : "#ffffff";
          }
          styleAttr =
            ' style="background:rgb(' +
            rgb.join(",") +
            ")" +
            (textColor ? ";color:" + textColor : "") +
            ';"';
          cellClass = "sht-num"; // no zebra/hover override on coloured cells
        }
        html +=
          "<td class=\"" + cellClass +
          (drillable ? " sht-drillable" : "") +
          "\"" + attrs + styleAttr + ">" +
          (text == null
            ? '<span class="sht-null">&empty;</span>'
            : self._escape(text)) +
          "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody>";
    // ── Grand-totals footer row ────────────────────────────────────────────
    // Summed client-side over the rows this visualisation received. See the
    // header comment: if the query is row-limited, this can differ from
    // Looker's own server-side "Total" for a measure.
    if (showTotalsRow && data.length > 0) {
      html += "<tfoot><tr>";
      dims.forEach(function (d, i) {
        html += '<td>' + (i === 0 ? "Total" : "") + "</td>";
      });
      columns.forEach(function (col) {
        const totalsMode = config["totals_" + col.measure.name] || "auto";
        const summable =
          totalsMode === "sum" ||
          (totalsMode === "auto" &&
            self._SUMMABLE_TYPES.indexOf(col.measure.type) !== -1);
        let cellText = "—"; // em dash for non-summable measure types
        if (summable) {
          let sum = 0;
          let sawValue = false;
          data.forEach(function (row) {
            const cell = getCell(row, col);
            const v = cell ? cell.value : null;
            if (typeof v === "number" && isFinite(v)) {
              sum += v;
              sawValue = true;
            }
          });
          if (sawValue) cellText = self._formatNumber(sum);
        }
        html += '<td class="sht-num">' + self._escape(cellText) + "</td>";
      });
      html += "</tr></tfoot>";
    }
    html += "</table>";
    this._content.innerHTML = html;
    this._bindSorting(sortGetters, data);
    // ── Drill support ──────────────────────────────────────────────────────
    this._content.querySelectorAll("td.sht-drillable").forEach(function (td) {
      td.addEventListener("click", function (event) {
        const rIdx = parseInt(td.getAttribute("data-r"), 10);
        const row = data[rIdx];
        let cell = null;
        if (td.hasAttribute("data-f")) {
          cell = row[td.getAttribute("data-f")];
        } else if (td.hasAttribute("data-c")) {
          const col = columns[parseInt(td.getAttribute("data-c"), 10)];
          cell = getCell(row, col);
        }
        if (cell && cell.links && cell.links.length > 0) {
          LookerCharts.Utils.openDrillMenu({
            links: cell.links,
            event: event,
          });
        }
      });
    });
    done();
  },
});
