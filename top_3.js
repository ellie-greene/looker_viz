looker.plugins.visualizations.add({
  options: {},
  create: function(element, config) {
    element.innerHTML = '<div id="top3-container" style="height:100%; display:flex; align-items:center; justify-content:center; padding: 12px;"></div>';
  },
  updateAsync: function(data, element, config, queryResponse, details, done) {
    try {
      if (!data || data.length === 0) { done(); return; }
      var fields = queryResponse.fields;
      var dimField   = (fields.dimensions || [])[0];
      var allMeas    = (fields.measures || []).concat(fields.table_calculations || []);
      var measField  = allMeas[0] || null;
      var meas2Field = allMeas[1] || null;
      var meas3Field = allMeas[2] || null;
      if (!dimField || !measField) { done(); return; }
      function getVal(cell) {
        if (cell.rendered != null) return cell.rendered;
        if (cell.value != null) return cell.value;
        return '—';
      }
      var rows = data;
      var html = '<div style="width:100%; font-family: Google Sans, Roboto, sans-serif;">';
      rows.forEach(function(row, i) {
        var dimVal   = getVal(row[dimField.name]);
        var measVal  = getVal(row[measField.name]);
        var meas2Val = meas2Field ? getVal(row[meas2Field.name]) : null;
        var meas3Val = meas3Field ? getVal(row[meas3Field.name]) : null;
        var fontSize   = '1.05em';
        var fontWeight = '400';
        var color      = '#696969';
        var marginTop  = i > 0 ? 'margin-top: 8px;' : '';
        var borderStyle = i < rows.length - 1
          ? 'border-bottom: 0.5px solid #e0e0e0; padding-bottom: 8px;'
          : '';
        html +=
          '<div id="top3-row-' + i + '" style="display:flex; justify-content:space-between; align-items:baseline; ' + borderStyle + marginTop + '">' +
            '<span style="font-size:' + fontSize + '; font-weight:' + fontWeight + '; color:' + color + ';">' + dimVal + '</span>' +
            '<div style="display:flex; gap:1.5rem; align-items:baseline;">' +
              '<span style="font-size:' + fontSize + '; font-weight:' + fontWeight + '; color:' + color + ';">' + measVal + '</span>' +
              (meas2Val != null ? '<span style="font-size:' + fontSize + '; font-weight:' + fontWeight + '; color:' + color + ';">' + meas2Val + '</span>' : '') +
              (meas3Val != null ? '<span style="font-size:' + fontSize + '; font-weight:' + fontWeight + '; color:' + color + ';">' + meas3Val + '</span>' : '') +
            '</div>' +
          '</div>';
      });
      html += '</div>';
      document.getElementById('top3-container').innerHTML = html;
    } catch(e) {
      console.error("TOP3 VIZ ERROR:", e);
    }
    done();
  }
});
