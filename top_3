looker.plugins.visualizations.add({
  options: {},
  create: function(element, config) {
    element.innerHTML = '<div id="top3-container" style="height:100%; display:flex; align-items:center; justify-content:center; padding: 12px;"></div>';
  },
  updateAsync: function(data, element, config, queryResponse, details, done) {
    try {
      console.log("TOP3: data rows", data && data.length);
      console.log("TOP3: fields keys", queryResponse && queryResponse.fields && Object.keys(queryResponse.fields));

      if (!data || data.length === 0) { done(); return; }

      var fields = queryResponse.fields;

      console.log("TOP3: dimensions", (fields.dimensions || []).map(function(f){ return f.name; }));
      console.log("TOP3: measures", (fields.measures || []).map(function(f){ return f.name; }));
      console.log("TOP3: table_calcs", (fields.table_calculations || []).map(function(f){ return f.name; }));
      console.log("TOP3: row[0]", JSON.stringify(data[0]));

      var dimField  = (fields.dimensions || [])[0];
      var measField = (fields.measures || []).concat(fields.table_calculations || [])[0];

      console.log("TOP3: dimField", dimField && dimField.name);
      console.log("TOP3: measField", measField && measField.name);

      if (!dimField || !measField) { console.error("TOP3: missing dimField or measField"); done(); return; }

      var rows = data.slice(0, 3);

      var html = '<div style="width:100%; font-family: Google Sans, Roboto, sans-serif;">';

      rows.forEach(function(row, i) {
        var dimVal  = row[dimField.name].rendered  || row[dimField.name].value  || '—';
        var measVal = row[measField.name].rendered || row[measField.name].value || '—';
        var isTop   = i === 0;
        var borderStyle = i < rows.length - 1
          ? 'border-bottom: 0.5px solid #e0e0e0; padding-bottom: ' + (isTop ? '12px' : '8px') + ';'
          : '';
        var fontSize  = isTop ? '1.6em' : '1.05em';
        var fontWeight= isTop ? '600'   : '400';
        var color     = isTop ? '#282828' : '#696969';
        var marginTop = i > 0 ? 'margin-top: 8px;' : '';

        html +=
          '<div id="top3-row-' + i + '" style="display:flex; justify-content:space-between; align-items:baseline; ' + borderStyle + marginTop + '">' +
            '<span style="font-size:' + fontSize + '; font-weight:' + fontWeight + '; color:' + color + ';">' + dimVal + '</span>' +
            '<span style="font-size:' + fontSize + '; font-weight:' + fontWeight + '; color:' + color + ';">' + measVal + '</span>' +
          '</div>';
      });

      html += '</div>';

      console.log("TOP3: html built", html);

      var container = document.getElementById('top3-container');
      console.log("TOP3: container found", !!container);
      container.innerHTML = html;

    } catch(e) {
      console.error("TOP3 VIZ ERROR:", e);
    }
    done();
  }
});
