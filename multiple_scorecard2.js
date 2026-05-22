looker.plugins.visualizations.add({
  options: {},

  create: function(element, config) {
    element.innerHTML = '<div id="one-line-kpi-container" style="height:100%; display:flex; align-items:stretch; justify-content:center; flex-wrap:nowrap; gap:8px; padding:12px; box-sizing:border-box; overflow:hidden;"></div>';
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    var container = element.querySelector('#one-line-kpi-container');
    container.innerHTML = '';

    try {
      if (!data || data.length === 0) { done(); return; }

      var fields   = queryResponse.fields;
      var pivots   = queryResponse.pivots;
      var measures = (fields.measures || []).concat(fields.table_calculations || []);

      // Row 1 = current (value), Row 2 = comparison
      var currentRow    = data.length > 0 ? data[0] : null;
      var previousRow   = data.length > 1 ? data[1] : null;

      // Find the dimension field so we can label the comparison row
      var dimField = null;
      var allCandidates = []
        .concat(fields.dimensions || [])
        .concat(fields.dimension_like || []);
      if (allCandidates.length) {
        dimField = allCandidates[0];
      } else {
        // Fallback: find first key in row that has a string-like value
        var rowKeys = currentRow ? Object.keys(currentRow) : [];
        rowKeys.forEach(function(key) {
          if (dimField) return;
          var cell = currentRow[key];
          if (cell && typeof cell === 'object' && typeof (cell.value || cell.rendered) === 'string') {
            dimField = { name: key, label: key };
          }
        });
      }

      // Get the comparison row's dimension label
      var compLabel = 'comparison';
      if (previousRow && dimField) {
        var compCell = previousRow[dimField.name];
        if (compCell) compLabel = compCell.rendered || compCell.value || 'comparison';
      }

      if (!currentRow) { done(); return; }

      // DEBUG
      container.innerHTML = '<pre style="font-size:10px; overflow:auto; white-space:pre-wrap;">' + 
        'measures: ' + JSON.stringify(measures.map(function(m){ return {name:m.name, label:m.label}; }), null, 2) + '\n\n' +
        'tableCalcs: ' + JSON.stringify((fields.table_calculations||[]).map(function(m){ return m.name; }), null, 2) + '\n\n' +
        'currentRow sample: ' + JSON.stringify(currentRow, null, 2).slice(0, 500) +
        '</pre>';
      done(); return;


      function formatDiff(diff, rendered) {
        // Sniff prefix (£, $, €) and suffix (%) from rendered string
        var prefix = '', suffix = '';
        var r = rendered || '';
        var preMatch = r.match(/^([^0-9\-(]+)/);
        var sufMatch = r.match(/([^0-9,.]+)$/);
        if (preMatch) prefix = preMatch[1];
        if (sufMatch && sufMatch[1] !== prefix) suffix = sufMatch[1];

        // Match decimal places from rendered
        var decimals = (r.match(/\.(\d+)/) || [, ''])[1].length;
        var abs = Math.abs(diff);
        var sign = diff >= 0 ? '+' : '-';
        // Add thousands separator
        var parts = abs.toFixed(decimals).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return sign + prefix + parts.join('.') + suffix;
      }

      function makeCard(label, currentVal, currentRendered, previousVal, previousRendered) {
        var ppLine = '';
        if (previousRow && previousVal != null && currentVal != null) {
          var diff  = currentVal - previousVal;
          var arrow = diff >= 0
            ? '<span class="kpi-arrow" style="color:#1e8c45;">▲</span>'
            : '<span class="kpi-arrow" style="color:#c0392b;">▼</span>';
          var diffStr = formatDiff(diff, currentRendered || previousRendered || '');
          ppLine = '<div class="kpi-pp">' + arrow + ' ' + diffStr + ' vs ' + compLabel + '</div>';
        } else if (previousRow) {
          ppLine = '<div class="kpi-pp">— vs ' + compLabel + '</div>';
        }

        var card = document.createElement('div');
        card.className = 'kpi-card';
        card.innerHTML =
          '<div class="kpi-label">' + label + '</div>' +
          '<div class="kpi-value">' + (currentRendered != null ? currentRendered : currentVal) + '</div>' +
          ppLine;
        return card;
      }

      // Build cards
      if (pivots && pivots.length > 0) {
        var measure = measures[0];
        var tableCalcNames = (fields.table_calculations || []).map(function(tc) { return tc.name; });
        var isTableCalc = tableCalcNames.indexOf(measure.name) >= 0;

        if (isTableCalc) {
          // Table calcs in pivoted queries are stored as a single flat key per row — one card only
          var currentCell  = currentRow[measure.name]  || {};
          var previousCell = previousRow ? (previousRow[measure.name] || {}) : {};
          var label = measure.label_short || measure.label || measure.name;
          container.appendChild(makeCard(label, currentCell.value, currentCell.rendered, previousCell.value, previousCell.rendered));
        } else {
          pivots.forEach(function(pivot) {
            var pivotKey   = pivot.key;
            var pivotLabel = pivot.labels[Object.keys(pivot.labels)[0]] || pivotKey;
            var currentCellParent  = currentRow[measure.name] || {};
            var previousCellParent = previousRow ? (previousRow[measure.name] || {}) : {};
            var currentCell  = (typeof currentCellParent[pivotKey] === 'object' ? currentCellParent[pivotKey] : null) || {};
            var previousCell = (typeof previousCellParent[pivotKey] === 'object' ? previousCellParent[pivotKey] : null) || {};
            container.appendChild(makeCard(pivotLabel, currentCell.value, currentCell.rendered, previousCell.value, previousCell.rendered));
          });
        }
      } else {
        measures.forEach(function(measure) {
          var currentCell  = currentRow[measure.name]  || {};
          var previousCell = previousRow ? (previousRow[measure.name] || {}) : {};
          var label = measure.label_short || measure.label || measure.name;
          container.appendChild(makeCard(label, currentCell.value, currentCell.rendered, previousCell.value, previousCell.rendered));
        });
      }

      // ── Responsive font scaling via ResizeObserver ──
      // Base sizes at 160px card width; scale linearly with actual card width
      function scaleFonts() {
        var cards = container.querySelectorAll('.kpi-card');
        if (!cards.length) return;
        var cardWidth = cards[0].offsetWidth;
        if (!cardWidth) return;

        // At 160px wide → value 1.6em, label 0.75em, pp 0.7em
        // At 240px wide → value 2.4em, label 0.85em, pp 0.78em
        var ratio       = Math.min(Math.max(cardWidth / 160, 0.6), 2.0);
        var valueSize   = (1.6  * ratio).toFixed(2) + 'em';
        var labelSize   = (0.75 * ratio).toFixed(2) + 'em';
        var ppSize      = (0.70 * ratio).toFixed(2) + 'em';

        cards.forEach(function(card) {
          var v = card.querySelector('.kpi-value');
          var l = card.querySelector('.kpi-label');
          var p = card.querySelector('.kpi-pp');
          if (v) v.style.fontSize = valueSize;
          if (l) l.style.fontSize = labelSize;
          if (p) p.style.fontSize = ppSize;
        });
      }

      // Inject base styles once
      if (!element.querySelector('#kpi-styles')) {
        var style = document.createElement('style');
        style.id  = 'kpi-styles';
        style.textContent = [
          '.kpi-card { text-align:center; font-family:Google Sans,Roboto,sans-serif; background:#fff;',
          '  border-radius:8px; padding:12px 8px; min-width:0; flex:1;',
          '  box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; flex-direction:column; justify-content:center; overflow:hidden; }',
          '.kpi-label { color:#696969; margin-bottom:6px; font-weight:500; text-transform:capitalize;',
          '  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:0.85em; }',
          '.kpi-value { font-weight:600; color:#282828; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:2em; }',
          '.kpi-pp    { color:#696969; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:0.78em; }'
        ].join('\n');
        element.appendChild(style);
      }

      // Scale immediately, then watch for resize
      setTimeout(scaleFonts, 0);
      if (window.ResizeObserver) {
        if (element._kpiObserver) element._kpiObserver.disconnect();
        element._kpiObserver = new ResizeObserver(scaleFonts);
        element._kpiObserver.observe(container);
      }

    } catch(e) {
      container.innerHTML = '<div style="color:red;font-family:Google Sans,Roboto,sans-serif;padding:16px;font-size:0.85em;"><strong>ERROR:</strong> ' + e.message + '</div>';
    }

    done();
  }
});
