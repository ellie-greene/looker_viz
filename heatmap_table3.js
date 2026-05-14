/**
 * heatmap_table.js
 * Looker custom visualisation — per-column conditional formatting heatmap table
 * Host at ellie-greene/looker_viz and serve via jsDelivr
 */

looker.plugins.visualizations.add({

  // ─── Config options exposed in the Looker viz editor ─────────────────────
  options: {
    color_low: {
      section: "Colours",
      order: 1,
      type: "string",
      display: "color",
      label: "Low value colour",
      default: "#D94F3D",
    },
    color_mid: {
      section: "Colours",
      order: 2,
      type: "string",
      display: "color",
      label: "Mid value colour (leave blank for 2-colour scale)",
      default: "#F5F0E8",
    },
    color_high: {
      section: "Colours",
      order: 3,
      type: "string",
      display: "color",
      label: "High value colour",
      default: "#3A7D44",
    },
    low_is_good: {
      section: "Colours",
      order: 4,
      type: "boolean",
      label: "Low values are good (invert colour scale)",
      default: false,
    },
    text_contrast: {
      section: "Colours",
      order: 5,
      type: "boolean",
      label: "Auto dark/light text for readability",
      default: true,
    },
    exclude_cols: {
      section: "Formatting",
      order: 1,
      type: "string",
      label: "Columns to exclude from colouring (comma-separated field names)",
      default: "",
      placeholder: "e.g. orders.status, orders.country",
    },
    color_dimensions: {
      section: "Formatting",
      order: 2,
      type: "boolean",
      label: "Colour dimension columns too",
      default: false,
    },
    show_bars: {
      section: "Formatting",
      order: 3,
      type: "boolean",
      label: "Show value bars inside cells",
      default: false,
    },
    font_size: {
      section: "Formatting",
      order: 4,
      type: "string",
      display: "select",
      label: "Font size",
      values: [
        { "Small": "12px" },
        { "Medium": "13px" },
        { "Large": "15px" },
      ],
      default: "13px",
    },
    header_bg: {
      section: "Formatting",
      order: 5,
      type: "string",
      display: "color",
      label: "Header background colour",
      default: "#1A1A2E",
    },
    header_text: {
      section: "Formatting",
      order: 6,
      type: "string",
      display: "color",
      label: "Header text colour",
      default: "#FFFFFF",
    },
    row_padding: {
      section: "Formatting",
      order: 7,
      type: "string",
      display: "select",
      label: "Row density",
      values: [
        { "Compact": "4px 8px" },
        { "Normal": "7px 12px" },
        { "Comfortable": "11px 14px" },
      ],
      default: "7px 12px",
    },
    stripe_rows: {
      section: "Formatting",
      order: 8,
      type: "boolean",
      label: "Stripe alternate rows",
      default: false,
    },
  },

  // ─── Create: inject base styles ───────────────────────────────────────────
  create(element, config) {
    const style = document.createElement("style");
    style.textContent = `
      .ht-wrap {
        width: 100%;
        height: 100%;
        overflow: auto;
        font-family: 'Sofia Pro', 'Proxima Nova', 'Helvetica Neue', Arial, sans-serif;
        font-weight: 500;
        box-sizing: border-box;
      }
      .ht-wrap table {
        border-collapse: collapse;
        width: 100%;
        table-layout: auto;
      }
      .ht-wrap th {
        position: sticky;
        top: 0;
        z-index: 2;
        font-family: 'Proxima Nova', 'Helvetica Neue', Arial, sans-serif;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: none;
        font-size: 0.78em;
        white-space: nowrap;
        border-right: 1px solid rgba(255,255,255,0.12);
        user-select: none;
      }
      .ht-wrap th:last-child { border-right: none; }
      .ht-wrap td {
        border-right: 1px solid rgba(0,0,0,0.06);
        white-space: nowrap;
        position: relative;
        transition: filter 0.1s;
      }
      .ht-wrap td:last-child { border-right: none; }
      .ht-wrap tr:last-child td { border-bottom: none; }
      .ht-wrap td.dim { text-align: left; font-weight: 500; }
      .ht-wrap td.msr { text-align: right; font-variant-numeric: tabular-nums; }
      .ht-wrap tbody tr:hover td { filter: brightness(0.93); }

      /* bar overlay */
      .ht-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        pointer-events: none;
        opacity: 0.55;
        border-radius: 0 2px 0 0;
      }

      /* stripe */
      .ht-stripe tbody tr:nth-child(even) td {
        filter: brightness(0.96);
      }

      /* tooltip */
      .ht-tooltip {
        position: fixed;
        background: rgba(20,20,30,0.92);
        color: #fff;
        font-family: 'Sofia Pro', 'Proxima Nova', 'Helvetica Neue', Arial, sans-serif;
        font-weight: 500;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 4px;
        pointer-events: none;
        z-index: 999;
        display: none;
        white-space: nowrap;
      }
    `;
    element.appendChild(style);

    this._wrap = element.appendChild(document.createElement("div"));
    this._wrap.className = "ht-wrap";

    this._tooltip = element.appendChild(document.createElement("div"));
    this._tooltip.className = "ht-tooltip";
  },

  // ─── Update: main render ──────────────────────────────────────────────────
  updateAsync(data, element, config, queryResponse, details, done) {
    this._wrap.innerHTML = "";

    if (!data || data.length === 0) {
      this._wrap.innerHTML = `<p style="padding:16px;color:#888;">No data returned.</p>`;
      done();
      return;
    }

    const cfg = config;
    const dims = queryResponse.fields.dimensions;
    const msrs = queryResponse.fields.measures;
    const allFields = [...dims, ...msrs];

    // Parse excluded columns
    const excluded = new Set(
      (cfg.exclude_cols || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    );

    // Determine which fields get coloured
    const colourable = new Set(
      allFields
        .filter(f => {
          if (excluded.has(f.name) || excluded.has(f.label) || excluded.has(f.label_short)) return false;
          const isMsr = msrs.some(m => m.name === f.name);
          const isDim = dims.some(d => d.name === f.name);
          if (isMsr) return true;
          if (isDim && cfg.color_dimensions) return true;
          return false;
        })
        .map(f => f.name)
    );

    // Per-column stats (numeric only)
    const colStats = {};
    for (const f of allFields) {
      if (!colourable.has(f.name)) continue;
      const vals = data
        .map(row => {
          const v = row[f.name]?.value;
          return typeof v === "number" ? v : parseFloat(v);
        })
        .filter(v => !isNaN(v));
      if (vals.length === 0) continue;
      colStats[f.name] = {
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    // Build table
    const table = document.createElement("table");
    if (cfg.stripe_rows) table.classList.add("ht-stripe");

    // Header row
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headerRow.style.background = cfg.header_bg || "#1A1A2E";
    headerRow.style.color = cfg.header_text || "#FFFFFF";

    for (const f of allFields) {
      const th = document.createElement("th");
      th.textContent = (f.label_short || f.label || f.name).toLowerCase();
      th.style.background = cfg.header_bg || "#1A1A2E";
      th.style.color = cfg.header_text || "#FFFFFF";
      th.style.padding = cfg.row_padding || "7px 12px";
      th.style.fontSize = cfg.font_size || "13px";
      th.style.textAlign = msrs.some(m => m.name === f.name) ? "right" : "left";
      headerRow.appendChild(th);
    }

    // Body rows
    const tbody = table.createTBody();
    for (const row of data) {
      const tr = tbody.insertRow();
      for (const f of allFields) {
        const td = tr.insertCell();
        const cell = row[f.name] || {};
        const isMsr = msrs.some(m => m.name === f.name);

        td.className = isMsr ? "msr" : "dim";
        td.style.padding = cfg.row_padding || "7px 12px";
        td.style.fontSize = cfg.font_size || "13px";

        // Display value
        const displayVal = cell.rendered != null ? cell.rendered : (cell.value != null ? cell.value : "—");
        td.textContent = displayVal;

        // Colouring
        if (colStats[f.name]) {
          const { min, max } = colStats[f.name];
          const rawVal = typeof cell.value === "number" ? cell.value : parseFloat(cell.value);

          if (!isNaN(rawVal)) {
            let t = max === min ? 0.5 : (rawVal - min) / (max - min);
            if (cfg.low_is_good) t = 1 - t;

            const bg = interpolateColor(
              cfg.color_low || "#D94F3D",
              cfg.color_high || "#3A7D44",
              t,
              cfg.color_mid || null
            );
            td.style.backgroundColor = bg;

            if (cfg.text_contrast !== false) {
              td.style.color = contrastColor(bg);
            }

            // Optional bar
            if (cfg.show_bars) {
              const bar = document.createElement("div");
              bar.className = "ht-bar";
              bar.style.width = (t * 100) + "%";
              bar.style.background = cfg.low_is_good
                ? (t < 0.5 ? cfg.color_high : cfg.color_low)
                : (t > 0.5 ? cfg.color_high : cfg.color_low);
              td.appendChild(bar);
            }

            // Tooltip showing rank in column
            const rank = data
              .map(r => {
                const v = r[f.name]?.value;
                return typeof v === "number" ? v : parseFloat(v);
              })
              .filter(v => !isNaN(v))
              .sort((a, b) => b - a)
              .indexOf(rawVal) + 1;

            td.addEventListener("mouseenter", (e) => {
              this._tooltip.textContent =
                `${f.label_short || f.label}: ${displayVal}  ·  #${rank} of ${data.length}  (min ${formatNum(min)}, max ${formatNum(max)})`;
              this._tooltip.style.display = "block";
            });
            td.addEventListener("mousemove", (e) => {
              this._tooltip.style.left = (e.clientX + 12) + "px";
              this._tooltip.style.top = (e.clientY - 24) + "px";
            });
            td.addEventListener("mouseleave", () => {
              this._tooltip.style.display = "none";
            });
          }
        }
      }
    }

    this._wrap.appendChild(table);
    done();
  },
});

// ─── Colour helpers ───────────────────────────────────────────────────────────

function hexToRgb(hex) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

function lerpRgb(c1, c2, t) {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
  };
}

/**
 * Interpolate between low → mid → high (or low → high if no mid)
 * t: 0–1
 */
function interpolateColor(hexLow, hexHigh, t, hexMid) {
  const low = hexToRgb(hexLow);
  const high = hexToRgb(hexHigh);

  let rgb;
  if (hexMid && hexMid.trim() !== "") {
    const mid = hexToRgb(hexMid);
    if (t < 0.5) {
      rgb = lerpRgb(low, mid, t * 2);
    } else {
      rgb = lerpRgb(mid, high, (t - 0.5) * 2);
    }
  } else {
    rgb = lerpRgb(low, high, t);
  }

  return rgbToHex(rgb);
}

/**
 * Return black or white text based on background luminance (WCAG formula)
 */
function contrastColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = 0.2126 * linearise(r / 255)
    + 0.7152 * linearise(g / 255)
    + 0.0722 * linearise(b / 255);
  return luminance > 0.179 ? "#111111" : "#FFFFFF";
}

function linearise(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function formatNum(n) {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}
