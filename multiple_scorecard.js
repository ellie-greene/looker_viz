looker.plugins.visualizations.add({
  options: {},

  create: function(element, config) {
    element.innerHTML = '<div id="one-line-kpi-container" style="height:100%; display:flex; align-items:stretch; justify-content:center; flex-wrap:nowrap; gap:16px; padding:16px; box-sizing:border-box; overflow:hidden;"></div>';
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    var container = element.querySelector('#one-line-kpi-container');
    container.innerHTML = '';

    try {
      if (!data || data.length === 0) { done(); return; }

      var fields    = queryResponse.fields;
      var pivots    = queryResponse.pivots;
      var dimField  = fields.dimensions[0];
      var measures  = fields.measures;

      // Find current and previous period rows by dimension value
      var currentRow  = null;
      var previousRow = null;
      data.forEach(function(row) {
        var val = (row[dimField.name].value || '').toString().toLowerCase();
        if (val === 'current period') currentRow  = row;
        if (val === 'previous period') previousRow = row;
      });

      if (!currentRow) { done(); return; }

      // Count cards to scale font size
      var cardCount = pivots && pivots.length > 0 ? pivots.length : measures.length;

      // Scale value font size down as card count increases
      // 1 card → 2.5em, 4 cards → 1.8em, 8+ cards → 1.1em
      var valueFontSize = Math.max(1.1, 2.5 - (cardCount - 1) * 0.18);

      // Scale label and pp line proportionally
      var labelFontSize = Math.max(0.62, 0.85 - (cardCount - 1) * 0.025);
      var ppFontSize    = Math.max(0.58, 0.82 - (cardCount - 1) * 0.025);

      // Padding also shrinks slightly
      var hPad = Math.max(10, 28 - (cardCount - 1) * 3);
      var vPad = Math.max(10, 20 - (cardCount - 1) * 2);

      function makeCard(label, currentVal, currentRendered, previousVal, previousRendered) {
        var ppLine = '';
        if (previousRow && previousVal !== null && previousVal !== undefined && currentVal !== null && currentVal !== undefined) {
          var diff  = currentVal - previousVal;
          var arrow = diff >= 0
            ? '<span style="color:#1e8c45;">▲</span>'
            : '<span style="color:#c0392b;">▼</span>';

          // Try to infer a prefix/suffix from the rendered values (e.g. £, $, %)
          var prefix = '', suffix = '';
          var rendered = currentRendered || previousRendered || '';
          var prefixMatch = rendered.match(/^([^0-9\-\(]+)/);
          var suffixMatch = rendered.match(/([^0-9,\.]+)$/);
          if (prefixMatch) prefix = prefixMatch[1];
          if (suffixMatch && suffixMatch[1] !== prefixMatch[1]) suffix = suffixMatch[1];

          // Format the absolute diff value, matching decimal places of rendered value
          var decimals = (rendered.match(/\.(\d+)/) || [,''])[1].length;
          var absDiff  = Math.abs(diff);
          var diffStr  = prefix + (diff >= 0 ? '+' : '-') + absDiff.toFixed(decimals) + suffix;

          ppLine = '<div style="font-size:' + ppFontSize + 'em; color:#696969; margin-top:4px;">' + arrow + ' ' + diffStr + ' vs prev. period</div>';
        } else if (previousRow) {
          ppLine = '<div style="font-size:' + ppFontSize + 'em; color:#696969; margin-top:4px;">— vs prev. period</div>';
        }

        var card = document.createElement('div');
        card.style.cssText = 'text-align:center; font-family: Google Sans, Roboto, sans-serif; background:#fff; border-radius:8px; padding:' + vPad + 'px ' + hPad + 'px; min-width:0; flex:1; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; flex-direction:column; justify-content:center; overflow:hidden;';
        card.innerHTML =
          '<div style="font-size:' + labelFontSize + 'em; color:#696969; margin-bottom:8px; font-weight:500; text-transform:capitalize; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + label + '</div>' +
          '<div style="font-size:' + valueFontSize + 'em; font-weight:600; color:#282828; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + (currentRendered || currentVal) + '</div>' +
          ppLine;
        return card;
      }

      // ── PIVOT MODE ── one card per pivot value, single measure
      if (pivots && pivots.length > 0) {
        var measure = measures[0];
        pivots.forEach(function(pivot) {
          var pivotKey    = pivot.key;
          var pivotLabel  = pivot.labels[Object.keys(pivot.labels)[0]] || pivotKey;
          var currentCell = currentRow[measure.name][pivotKey]  || {};
          var previousCell= previousRow ? (previousRow[measure.name][pivotKey] || {}) : {};
          var card = makeCard(
            pivotLabel,
            currentCell.value,
            currentCell.rendered,
            previousCell.value,
            previousCell.rendered
          );
          container.appendChild(card);
        });

      // ── MULTI-MEASURE MODE ── one card per measure, period dimension used for PP
      } else {
        measures.forEach(function(measure) {
          var currentCell  = currentRow[measure.name]  || {};
          var previousCell = previousRow ? (previousRow[measure.name] || {}) : {};
          var label = measure.label_short || measure.label || measure.name;
          var card = makeCard(
            label,
            currentCell.value,
            currentCell.rendered,
            previousCell.value,
            previousCell.rendered
          );
          container.appendChild(card);
        });
      }

    } catch(e) {
      container.innerHTML = '<div style="color:red; font-family:Google Sans,Roboto,sans-serif; padding:16px; font-size:0.85em;"><strong>ERROR:</strong> ' + e.message + '</div>';
    }

    done();
  }
});
