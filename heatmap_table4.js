/**
 * heatmap_table.js
 * Looker custom visualisation — native-style table showing ONE measure at a
 * time, chosen from a dropdown. Formatting, colour system and options match
 * scaled_heatmap_table.js:
 *
 *  - Looks like Looker's default table (Open Sans, white sticky header, zebra rows)
 *  - Selected column is scaled to its own min → max, white (low) → column colour
 *  - Per-measure colour from the Pure brand palette, overridable in the viz editor
 *  - Per-measure direction (High is good / Low is good / No colouring) with a
 *    "▲ good" / "▼ good" indicator in the column header
 *  - Optional: invert the ramp on low-is-good columns so colour depth always
 *    means "good" rather than "high"
 *  - Optional data-bar rendering instead of heat colouring for a given measure
 *  - Pivot support: each pivot column of the selected measure scales independently
 *  - Drill menu support on cell click
 *  - Hover tooltip with rank and column min/max
 *
 * Host at ellie-greene/looker_viz, serve via jsDelivr:
 *   https://cdn.jsdelivr.net/gh/ellie-greene/looker_viz@main/heatmap_table.js
 * Purge after updates:
 *   https://purge.jsdelivr.net/gh/ellie-greene/looker_viz@main/heatmap_table.js
 */

looker.plugins.visualizations.add({
  id: "heatmap_table",
  label: "Heatmap Table (Single Metric)",

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
      default: "#713170", // Pure purple
    },
    show_direction_badge: {
      section: "Formatting",
      order: 2,
      type: "boolean",
      label: "Show good-direction indicator in headers",
      default: true,
    },
    show_selector_label: {
      section: "Formatting",
      order: 3,
      type: "boolean",
      label: "Show 'Metric' label next to selector",
      default: true,
    },
    show_tooltip: {
      section: "Formatting",
      order: 4,
      type: "boolean",
      label: "Show hover tooltip (rank, min, max)",
      default: true,
    },
  },

  // Pure brand palette, ordered for legibility on a white ramp
  _PALETTE: [
    "#713170", // purple
    "#274C46", // dark green
    "#E65A1E", // orange
    "#96A44F", // light green
    "#7C1334", // deep red
    "#556041", // sage
    "#F2A900", // yellow
    "#553527", // brown
    "#BE0021", // red
    "#FFB4A8", // pink
  ],

  // ────────────────────────────────────────────────────────────────────────

  create: function (element) {
    element.innerHTML = "";

    const style = document.createElement("style");
    style.innerHTML = `
      .sht-outer {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        font-family: 'Open Sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 12px;
        color: #262d33;
      }
      .sht-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        flex-shrink: 0;
        border-bottom: 1px solid #eef0f1;
      }
      .sht-controls label {
        font-size: 12px;
        color: #6c7681;
      }
      .sht-controls select {
        font-family: inherit;
        font-size: 12px;
        color: #262d33;
        padding: 3px 6px;
        border: 1px solid #d0d4d6;
        border-radius: 3px;
        background: #ffffff;
        cursor: pointer;
      }
      .sht-container {
        flex: 1;
        overflow: auto;
        box-sizing: border-box;
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
      .sht-error {
        padding: 16px;
        color: #9aa0a6;
        font-style: italic;
      }
      .sht-tooltip {
        position: fixed;
        background: rgba(38,45,51,0.94);
        color: #ffffff;
        font-family: 'Open Sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 3px;
        pointer-events: none;
        z-index: 999;
        display: none;
        white-space: nowrap;
      }
    `;
    element.appendChild(style);

    this._outer = element.appendChild(document.createElement("div"));
    this._outer.className = "sht-outer";

    this._controls = this._outer.appendChild(document.createElement("div"));
    this._controls.className = "sht-controls";

    this._selectorLabel = this._controls.appendChild(document.createElement("label"));
    this._selectorLabel.textContent = "Metric";

    this._select = this._controls.appendChild(document.createElement("select"));

    this._container = this._outer.appendChild(document.createElement("div"));
    this._container.className = "sht-container";

    this._content = this._container.appendChild(document.createElement("div"));

    this._tooltip = element.appendChild(document.createElement("div"));
    this._tooltip.className = "sht-tooltip";

    this._registeredOptionsKey = null;
    this._selectKey = null;
    this._selected = null;
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

  _formatNum: function (n) {
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2);
  },

  // ─── Main render ─────────────────────────────────────────────────────────

  updateAsync: function (data, element, config, queryResponse, details, done) {
    const self = this;
    const dims = queryResponse.fields.dimension_like || [];
    const measures = queryResponse.fields.measure_like || [];
    const pivots = queryResponse.pivots || null;
    const hasPivot = pivots && pivots.length > 0;

    if (measures.length === 0) {
      this._controls.style.display = "none";
      this._content.innerHTML =
        '<div class="sht-error">Add at least one measure to use this visualisation.</div>';
      done();
      return;
    }

    if (!data || data.length === 0) {
      this._controls.style.display = "none";
      this._content.innerHTML = '<div class="sht-error">No data returned.</div>';
      done();
      return;
    }

    // ── Dynamically register per-measure options (viz-level config only —
    //    no LookML changes required) ─────────────────────────────────────────
    const dynamicOptions = {};
    for (const key in this.options) dynamicOptions[key] = this.options[key];

    measures.forEach(function (m, i) {
      const label = m.label_short || m.label;
      dynamicOptions["direction_" + m.name] = {
        section: "Column scales",
        order: i * 2 + 1,
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
        order: i * 2 + 2,
        type: "string",
        display: "color",
        label: label + " — colour",
        default: self._PALETTE[i % self._PALETTE.length],
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
      label: "Show data bar on (colouring disabled for that measure)",
      values: barValues,
      default: "__none__",
    };

    // Only re-register when the field set changes, to avoid render loops
    const optionsKey = measures.map(function (m) { return m.name; }).join("|");
    if (optionsKey !== this._registeredOptionsKey) {
      this._registeredOptionsKey = optionsKey;
      this.trigger("registerOptions", dynamicOptions);
    }

    // ── Metric selector ────────────────────────────────────────────────────
    if (optionsKey !== this._selectKey) {
      this._selectKey = optionsKey;
      this._select.innerHTML = "";
      measures.forEach(function (m) {
        const o = document.createElement("option");
        o.value = m.name;
        o.textContent = m.label_short || m.label || m.name;
        self._select.appendChild(o);
      });
      if (!measures.some(function (m) { return m.name === self._selected; })) {
        this._selected = measures[0].name;
      }
      this._select.value = this._selected;
    }

    this._controls.style.display = measures.length <= 1 ? "none" : "flex";
    this._selectorLabel.style.display =
      config.show_selector_label === false ? "none" : "block";

    const WHITE = [255, 255, 255];
    const barColor = config.bar_color || "#713170";
    const useContrast = config.text_contrast !== false;
    const invertLowGood = config.invert_low_good !== false;
    const showBadge = config.show_direction_badge !== false;
    const showTooltip = config.show_tooltip !== false;
    const tooltip = this._tooltip;

    // ── Cell accessor ──────────────────────────────────────────────────────
    function getCell(row, col) {
      const holder = row[col.measure.name];
      if (holder == null) return null;
      return col.pivotKey != null ? holder[col.pivotKey] : holder;
    }

    // ── Render for the selected measure ────────────────────────────────────
    const renderTable = function (selectedName) {
      const measure =
        measures.filter(function (m) { return m.name === selectedName; })[0] ||
        measures[0];
      const mIdx = measures.indexOf(measure);

      // Build flat column list (one column, or one per pivot value)
      const columns = [];
      if (hasPivot) {
        pivots.forEach(function (p) {
          if (p.key === "$$$_row_total_$$$") return;
          const pivotLabel = p.metadata
            ? Object.keys(p.metadata)
                .map(function (k) { return p.metadata[k].rendered || p.metadata[k].value; })
                .join(" ")
            : p.key;
          columns.push({
            measure: measure,
            measureIndex: mIdx,
            pivotKey: p.key,
            label: pivotLabel,
          });
        });
      } else {
        columns.push({
          measure: measure,
          measureIndex: mIdx,
          pivotKey: null,
          label: measure.label_short || measure.label,
        });
      }

      // Per-column min/max (independent scales) + colour + direction
      columns.forEach(function (col) {
        let min = Infinity;
        let max = -Infinity;
        const vals = [];
        data.forEach(function (row) {
          const cell = getCell(row, col);
          const v = cell ? cell.value : null;
          if (typeof v === "number" && isFinite(v)) {
            vals.push(v);
            if (v < min) min = v;
            if (v > max) max = v;
          }
        });
        col.min = min;
        col.max = max;
        col.vals = vals.sort(function (a, b) { return b - a; });
        col.hasRange = isFinite(min) && isFinite(max);
        col.direction = config["direction_" + col.measure.name] || "high";
        col.isBar = config["bar_measure"] === col.measure.name;
        col.rgb =
          self._hexToRgb(config["color_" + col.measure.name]) ||
          self._hexToRgb(self._PALETTE[col.measureIndex % self._PALETTE.length]);
      });

      // Build table
      let html = '<table class="sht-table"><thead><tr>';
      dims.forEach(function (d) {
        html += "<th>" + self._escape(d.label_short || d.label) + "</th>";
      });
      columns.forEach(function (col) {
        let badge = "";
        if (showBadge && !col.isBar && col.direction !== "none") {
          badge =
            '<span class="sht-dir">' +
            (col.direction === "low" ? "&#9660; good" : "&#9650; good") +
            "</span>";
        }
        html += '<th class="sht-num">' + self._escape(col.label) + badge + "</th>";
      });
      html += "</tr></thead><tbody>";

      data.forEach(function (row, rIdx) {
        html += "<tr>";

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
              textColor = self._luminance(rgb) > 0.45 ? "#262d33" : "#ffffff";
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

      html += "</tbody></table>";
      self._content.innerHTML = html;

      // ── Drill support ────────────────────────────────────────────────────
      self._content.querySelectorAll("td.sht-drillable").forEach(function (td) {
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

      // ── Tooltip ──────────────────────────────────────────────────────────
      tooltip.style.display = "none";
      if (!showTooltip) return;

      self._content.querySelectorAll("td.sht-num[data-c]").forEach(function (td) {
        const rIdx = parseInt(td.getAttribute("data-r"), 10);
        const col = columns[parseInt(td.getAttribute("data-c"), 10)];
        const cell = getCell(data[rIdx], col);
        const v = cell ? cell.value : null;
        if (typeof v !== "number" || !isFinite(v) || !col.hasRange) return;

        const displayVal =
          cell.rendered !== undefined && cell.rendered !== null ? cell.rendered : v;
        const rank = col.vals.indexOf(v) + 1;

        td.addEventListener("mouseenter", function () {
          tooltip.textContent =
            col.label + ": " + displayVal +
            "  ·  #" + rank + " of " + col.vals.length +
            "  (min " + self._formatNum(col.min) +
            ", max " + self._formatNum(col.max) + ")";
          tooltip.style.display = "block";
        });
        td.addEventListener("mousemove", function (e) {
          tooltip.style.left = (e.clientX + 12) + "px";
          tooltip.style.top = (e.clientY - 24) + "px";
        });
        td.addEventListener("mouseleave", function () {
          tooltip.style.display = "none";
        });
      });
    };

    if (!this._selectBound) {
      this._selectBound = true;
      this._select.addEventListener("change", function () {
        self._selected = self._select.value;
        renderTable(self._selected);
      });
    }

    if (!measures.some(function (m) { return m.name === self._selected; })) {
      this._selected = measures[0].name;
      this._select.value = this._selected;
    }

    renderTable(this._selected);
    done();
  },
});
