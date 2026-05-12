looker.plugins.visualizations.add({
  options: {},

  create: function(element, config) {
    element.innerHTML = '<div id="one-line-kpi-container" style="height:100%; display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:16px; padding:16px; box-sizing:border-box;"></div>';
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

      function makeCard(label, currentVal, currentRendered, previousVal) {
        var ppLine = '';
        if (previousRow && previousVal !== null && previousVal !== undefined && currentVal !== null && currentVal !== undefined && previousVal !== 0) {
          var pct        = (currentVal - previousVal) / Math.abs(previousVal);
          var pctStr     = (pct >= 0 ? '+' : '') + (pct * 100).toFixed(1) + '%';
          var arrow      = pct >= 0
            ? '<span style="color:#1e8c45;">▲</span>'
            : '<span style="color:#c0392b;">▼</span>';
          ppLine = '<div style="font-size:0.82em; color:#696969; margin-top:4px;">' + arrow + ' ' + pctStr + ' vs prev. period</div>';
        } else if (previousRow) {
          ppLine = '<div style="font-size:0.82em; color:#696969; margin-top:4px;">— vs prev. period</div>';
        }

        var card = document.createElement('div');
        card.style.cssText = 'text-align:center; font-family: Google Sans, Roboto, sans-serif; background:#fff; border-radius:8px; padding:20px 28px; min-width:140px; flex:1; box-shadow:0 1px 3px rgba(0,0,0,0.1);';
        card.innerHTML =
          '<div style="font-size:0.85em; color:#696969; margin-bottom:8px; font-weight:500; text-transform:capitalize;">' + label + '</div>' +
          '<div style="font-size:2.5em; font-weight:600; color:#282828;">' + (currentRendered || currentVal) + '</div>' +
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
            previousCell.value
          );
          container.appendChild(card);
        });

      // ── MULTI-MEASURE MODE ── one card per measure, period dimension used for PP
      } else {
        measures.forEach(function(measure) {
          var currentCell  = currentRow[measure.name]  || {};
          var previousCell = previousRow ? (previousRow[measure.name] || {}) : {};
          // Use measure label, stripping view name prefix for display
          var label = measure.label_short || measure.label || measure.name;
          var card = makeCard(
            label,
            currentCell.value,
            currentCell.rendered,
            previousCell.value
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
