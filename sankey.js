// sankey_flow.js
// Pure Pet Food — Looker custom visualization
// Two-dimension + one-measure flow diagram (e.g. initial choice -> current choice)
// Deploy pattern: ellie-greene/looker_viz via jsDelivr
//   https://cdn.jsdelivr.net/gh/ellie-greene/looker_viz@main/sankey_flow.js
//   purge: https://purge.jsdelivr.net/gh/ellie-greene/looker_viz@main/sankey_flow.js

(function () {

  // ── Pure Pet Food brand palette (same order used across scorecards.js / line_chart_breakdown.js) ──
  var PURE_PALETTE = [
    '#713170', // purple
    '#F2A900', // yellow
    '#96A44F', // light green
    '#274C46', // dark green
    '#553527', // brown
    '#BE0021', // red
    '#FFB4A8', // pink
    '#E65A1E', // orange
    '#556041', // sage
    '#7C1334', // deep red
    '#EAE5DC'  // off-white
  ];

  var FONT_STACK = "'Sofia Pro Medium', 'Proxima Nova', Arial, sans-serif";

  looker.plugins.visualizations.add({
    id: 'pure_sankey_flow',
    label: 'Pure Sankey Flow',

    options: {
      node_width: {
        type: 'number', label: 'Node width (px)', default: 20, section: 'Style', order: 1
      },
      node_gap: {
        type: 'number', label: 'Gap between nodes (px)', default: 12, section: 'Style', order: 2
      },
      link_opacity: {
        type: 'number', label: 'Link opacity (0-1)', default: 0.45, section: 'Style', order: 3
      },
      color_by: {
        type: 'string',
        label: 'Colour ribbons by',
        display: 'select',
        values: [
          { 'Source node': 'source' },
          { 'Target node': 'target' }
        ],
        default: 'source',
        section: 'Style',
        order: 4
      },
      show_value_labels: {
        type: 'boolean', label: 'Show value + % labels', default: true, section: 'Style', order: 5
      },
      label_format: {
        type: 'string',
        label: 'Label number format',
        display: 'select',
        values: [
          { 'Comma (1,234)': 'comma' },
          { 'Abbreviated (1.2k)': 'abbr' }
        ],
        default: 'comma',
        section: 'Style',
        order: 6
      }
    },

    create: function (element, config) {
      element.innerHTML =
        '<style>' +
        '.pure-sankey-wrap { width:100%; height:100%; font-family:' + FONT_STACK + '; ' +
        'box-sizing:border-box; overflow:hidden; }' +
        '.pure-sankey-wrap svg text { font-family:' + FONT_STACK + '; fill:#3d3d3a; }' +
        '.pure-sankey-wrap .node-title { font-size:13px; font-weight:600; }' +
        '.pure-sankey-wrap .node-sub { font-size:11px; fill:#6b6a63; }' +
        '.pure-sankey-wrap .col-header { font-size:12px; font-weight:600; fill:#6b6a63; text-transform:uppercase; letter-spacing:.03em; }' +
        '.pure-sankey-tip { position:absolute; pointer-events:none; background:#274C46; color:#fff; ' +
        'font-family:' + FONT_STACK + '; font-size:12px; padding:6px 10px; border-radius:4px; ' +
        'opacity:0; transition:opacity .1s; z-index:10; white-space:nowrap; }' +
        '.pure-sankey-wrap .ribbon { cursor:pointer; }' +
        '.pure-sankey-wrap .ribbon:hover { opacity:0.75 !important; }' +
        '</style>' +
        '<div class="pure-sankey-wrap"><svg></svg></div>' +
        '<div class="pure-sankey-tip"></div>';

      this._svg = element.querySelector('svg');
      this._tip = element.querySelector('.pure-sankey-tip');
      this._container = element.querySelector('.pure-sankey-wrap');
    },

    updateAsync: function (data, element, config, queryResponse, details, done) {
      this.clearErrors();

      var dims = queryResponse.fields.dimension_like;
      var meas = queryResponse.fields.measure_like;

      if (dims.length < 2 || meas.length < 1) {
        this.addError({
          title: 'Two dimensions + one measure required',
          message: 'Add a source dimension, a target dimension, and one measure (e.g. deliveries).'
        });
        done();
        return;
      }

      var sourceField = dims[0].name;
      var targetField = dims[1].name;
      var measField = meas[0].name;

      // ── Aggregate rows into links, preserving first-seen node order per column ──
      var links = [];
      var sourceOrder = [];
      var targetOrder = [];
      var total = 0;

      data.forEach(function (row) {
        var s = row[sourceField].value;
        var t = row[targetField].value;
        var v = row[measField].value || 0;
        if (sourceOrder.indexOf(s) === -1) sourceOrder.push(s);
        if (targetOrder.indexOf(t) === -1) targetOrder.push(t);
        links.push({ source: s, target: t, value: v, row: row });
        total += v;
      });

      if (total === 0) { done(); return; }

      // Stable colour assignment: union of node names, in first-seen order, cycling the brand palette
      var colorMap = {};
      var allNames = sourceOrder.concat(targetOrder.filter(function (t) {
        return sourceOrder.indexOf(t) === -1;
      }));
      allNames.forEach(function (name, i) {
        colorMap[name] = PURE_PALETTE[i % PURE_PALETTE.length];
      });

      // ── Layout constants ──
      var width = this._container.clientWidth || 680;
      var height = this._container.clientHeight || 420;
      var nodeW = config.node_width || 20;
      var gap = config.node_gap || 12;
      var margin = { top: 36, right: 130, bottom: 20, left: 130 };
      var plotW = Math.max(width - margin.left - margin.right, 120);
      var plotH = Math.max(height - margin.top - margin.bottom, 120);
      var scale = plotH / total; // px per unit, before gaps

      function columnLayout(order, linksBySide) {
        // linksBySide(name) -> array of link objects touching this node on this side
        var totalGap = gap * (order.length - 1);
        var usableH = plotH - totalGap;
        var localScale = usableH / total;
        var y = 0;
        var layout = {};
        order.forEach(function (name) {
          var nodeTotal = linksBySide(name).reduce(function (a, l) { return a + l.value; }, 0);
          var h = nodeTotal * localScale;
          layout[name] = { y: y, h: h, total: nodeTotal };
          y += h + gap;
        });
        return layout;
      }

      var leftLayout = columnLayout(sourceOrder, function (name) {
        return links.filter(function (l) { return l.source === name; });
      });
      var rightLayout = columnLayout(targetOrder, function (name) {
        return links.filter(function (l) { return l.target === name; });
      });

      var localScaleLeft = (plotH - gap * (sourceOrder.length - 1)) / total;
      var localScaleRight = (plotH - gap * (targetOrder.length - 1)) / total;

      // Sub-segment offsets within each node, ordered to match the opposite column's order
      function assignSegments(order, sideKey, oppositeOrder, oppKey, localScale) {
        var cursor = {};
        order.forEach(function (name) { cursor[name] = leftLayout[name] ? leftLayout[name].y : rightLayout[name].y; });
        var segByLink = {};
        order.forEach(function (name) {
          var base = (sideKey === 'source' ? leftLayout[name] : rightLayout[name]).y;
          oppositeOrder.forEach(function (opp) {
            var match = links.filter(function (l) {
              return sideKey === 'source' ? (l.source === name && l.target === opp) : (l.target === name && l.source === opp);
            });
            match.forEach(function (l) {
              var h = l.value * localScale;
              var key = l.source + '||' + l.target;
              segByLink[key] = segByLink[key] || {};
              segByLink[key][sideKey] = { y0: base, y1: base + h };
              base += h;
            });
          });
        });
        return segByLink;
      }

      var srcSeg = assignSegments(sourceOrder, 'source', targetOrder, 'target', localScaleLeft);
      var tgtSeg = assignSegments(targetOrder, 'target', sourceOrder, 'source', localScaleRight);

      function fmt(v) {
        if (config.label_format === 'abbr') {
          if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
          return String(Math.round(v));
        }
        return Math.round(v).toLocaleString();
      }

      // ── Build SVG ──
      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = this._svg;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

      function el(tag, attrs) {
        var e = document.createElementNS(svgNS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        return e;
      }

      var g = el('g', { transform: 'translate(' + margin.left + ',' + margin.top + ')' });
      svg.appendChild(g);

      g.appendChild(el('text', { class: 'col-header', x: nodeW / 2, y: -14, 'text-anchor': 'middle' }));
      g.lastChild.textContent = dims[0].label_short || dims[0].label;
      g.appendChild(el('text', { class: 'col-header', x: plotW - nodeW / 2, y: -14, 'text-anchor': 'middle' }));
      g.lastChild.textContent = dims[1].label_short || dims[1].label;

      var tip = this._tip;
      var wrapEl = this._container;

      function showTip(html, evt) {
        tip.innerHTML = html;
        tip.style.opacity = 1;
        var rect = wrapEl.getBoundingClientRect();
        tip.style.left = (evt.clientX - rect.left + 12) + 'px';
        tip.style.top = (evt.clientY - rect.top + 12) + 'px';
      }
      function hideTip() { tip.style.opacity = 0; }

      // Ribbons
      links.forEach(function (l) {
        var key = l.source + '||' + l.target;
        var s = srcSeg[key] && srcSeg[key].source;
        var t = tgtSeg[key] && tgtSeg[key].target;
        if (!s || !t) return;
        var xL = nodeW;
        var xR = plotW - nodeW;
        var xMid = (xL + xR) / 2;
        var d = 'M ' + xL + ' ' + s.y0 +
          ' C ' + xMid + ' ' + s.y0 + ', ' + xMid + ' ' + t.y0 + ', ' + xR + ' ' + t.y0 +
          ' L ' + xR + ' ' + t.y1 +
          ' C ' + xMid + ' ' + t.y1 + ', ' + xMid + ' ' + s.y1 + ', ' + xL + ' ' + s.y1 + ' Z';
        var color = colorMap[config.color_by === 'target' ? l.target : l.source];
        var path = el('path', {
          class: 'ribbon', d: d, fill: color, opacity: config.link_opacity != null ? config.link_opacity : 0.45, stroke: 'none'
        });
        path.addEventListener('mousemove', function (evt) {
          var pct = ((l.value / total) * 100).toFixed(0);
          showTip('<strong>' + l.source + ' \u2192 ' + l.target + '</strong><br>' + fmt(l.value) + ' (' + pct + '%)', evt);
        });
        path.addEventListener('mouseleave', hideTip);
        path.addEventListener('click', function (evt) {
          if (LookerCharts.Utils.openDrillMenu) {
            LookerCharts.Utils.openDrillMenu({ links: LookerCharts.Utils.textForCell ? [] : [], event: evt });
          }
        });
        g.appendChild(path);
      });

      // Nodes + labels
      function drawColumn(order, layout, x, anchor, labelX) {
        order.forEach(function (name) {
          var n = layout[name];
          if (!n || n.h <= 0) return;
          var rect = el('rect', {
            x: x, y: n.y, width: nodeW, height: Math.max(n.h, 2), rx: 4,
            fill: colorMap[name], stroke: 'none'
          });
          g.appendChild(rect);

          var pct = ((n.total / total) * 100).toFixed(0);
          var title = el('text', { class: 'node-title', x: labelX, y: n.y + n.h / 2 - 6, 'text-anchor': anchor });
          title.textContent = name;
          g.appendChild(title);

          if (config.show_value_labels) {
            var sub = el('text', { class: 'node-sub', x: labelX, y: n.y + n.h / 2 + 10, 'text-anchor': anchor });
            sub.textContent = fmt(n.total) + ' (' + pct + '%)';
            g.appendChild(sub);
          }
        });
      }

      drawColumn(sourceOrder, leftLayout, 0, 'end', -10);
      drawColumn(targetOrder, rightLayout, plotW - nodeW, 'start', plotW + 10);

      done();
    }
  });
})();
