looker.plugins.visualizations.add({
  options: {},
  create: function(element, config) {
    element.innerHTML = '<div id="one-line-kpi-container" style="height:100%; display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:16px; padding:16px; box-sizing:border-box;"></div>';
  },

  updateAsync: function(data, element, config, queryResponse, details, done) {
    var container = element.querySelector('#one-line-kpi-container') || element;
    container.innerHTML = '';

    try {
      if (!data || data.length === 0) { done(); return; }

      var fields = queryResponse.fields;
      var pivots = queryResponse.pivots;
      var measureFields = (fields.measures || []).concat(fields.table_calculations || []);

      if (!measureFields.length || !pivots || !pivots.length) {
        container.innerHTML = '<div style="color:#888; font-family: Google Sans, Roboto, sans-serif;">No pivoted data found. Pivot on status and add a measure.</div>';
        done(); return;
      }

      var dimensionField = fields.dimensions && fields.dimensions[0];
      var measureField = measureFields[0];

      // Find current and previous period rows
      var currentRow = null;
      var previousRow = null;

      data.forEach(function(row) {
        if (!dimensionField) return;
        var val = (row[dimensionField.name].value || '').toString().toLowerCase();
        if (val.includes('current')) currentRow = row;
        else if (val.includes('previous')) previousRow = row;
      });

      if (!currentRow && data.length >= 1) currentRow = data[0];
      if (!previousRow && data.length >= 2) previousRow = data[1];

      // Render one scorecard per pivot value
      pivots.forEach(function(pivot) {
        var pivotKey = pivot.key;
        var pivotLabel = pivot.data ? Object.values(pivot.data).join(' ') : pivotKey;

        // Looker nests pivot cells under measure name, keyed by pivot value
        var currentCell = currentRow && currentRow[measureField.name] && currentRow[measureField.name][pivotKey];
        var previousCell = previousRow && previousRow[measureField.name] && previousRow[measureField.name][pivotKey];

        var currentValue = (currentCell && currentCell.value !== null)
          ? (currentCell.rendered || currentCell.value)
          : '—';

        var ppLine = '';
        if (previousCell && previousCell.value !== null && previousCell.value !== undefined) {
          var curr = (currentCell && currentCell.value !== null) ? currentCell.value : 0;
          var prev = previousCell.value;
          if (prev !== 0) {
            var pct = (curr - prev) / Math.abs(prev);
            var pctRendered = (pct >= 0 ? '+' : '') + (pct * 100).toFixed(1) + '%';
            var arrow = pct >= 0
              ? '<span style="color:green;">▲</span>'
              : '<span style="color:red;">▼</span>';
            ppLine = '<div style="font-size:0.85em; color:#696969; margin-top:4px;">' + arrow + ' ' + pctRendered + ' vs prev. period</div>';
          } else {
            ppLine = '<div style="font-size:0.85em; color:#696969; margin-top:4px;">— vs prev. period</div>';
          }
        }

        var card = document.createElement('div');
        card.style.cssText = 'text-align:center; font-family: Google Sans, Roboto, sans-serif; background:#fff; border-radius:8px; padding:20px 28px; min-width:140px; flex:1; box-shadow:0 1px 3px rgba(0,0,0,0.1);';
        card.innerHTML =
          '<div style="font-size:0.85em; color:#696969; margin-bottom:8px; font-weight:500;">' + pivotLabel + '</div>' +
          '<div style="font-size:2.5em; font-weight:600; color:#282828;">' + currentValue + '</div>' +
          ppLine;

        container.appendChild(card);
      });

    } catch(e) {
      container.innerHTML = '<div style="color:red; font-family: Google Sans, Roboto, sans-serif; padding:16px; font-size:0.85em;"><strong>ERROR:</strong> ' + e.message + '<br><br>' + e.stack + '</div>';
    }
    done();
  }
});
