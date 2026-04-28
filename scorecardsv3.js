looker.plugins.visualizations.add({
  options: {},
  create: function(element, config) {
    element.innerHTML = '<div id="kpi-container" style="height:100%; display:flex; align-items:center; justify-content:center;"></div>';
  },
  updateAsync: function(data, element, config, queryResponse, details, done) {
    try {
      console.log("KPI VIZ: data length", data && data.length);
      console.log("KPI VIZ: fields keys", queryResponse && queryResponse.fields && Object.keys(queryResponse.fields));
      if (!data || data.length === 0) { done(); return; }
      var row    = data[0];
      var fields = queryResponse.fields;
      var allFields = (fields.measures || [])
        .concat(fields.dimensions || [])
        .concat(fields.table_calculations || []);
      console.log("KPI VIZ: allFields count", allFields.length, allFields.map(function(f){ return f.name; }));
      if (allFields.length === 0) { done(); return; }
      var mainField = allFields[0];
      var targetActualField = allFields.find(function(f) {
        return f.name.toLowerCase().includes('target_actual') || (f.label_short || f.label || '').toLowerCase().includes('target_actual');
      }) || null;
      var targetPercField = allFields.find(function(f) {
        var name = f.name.toLowerCase();
        return (name.includes('target_perc') && !name.includes('target_actual')) ||
               (f.label_short || f.label || '').toLowerCase().includes('target_perc');
      }) || null;
      var ppActualField = allFields.find(function(f) {
        return f.name.toLowerCase().includes('pp_actual') || (f.label_short || f.label || '').toLowerCase().includes('pp_actual');
      }) || null;
      var ppPercField = allFields.find(function(f) {
        var name = f.name.toLowerCase();
        return (name.includes('pp_perc') && !name.includes('pp_actual')) ||
               (f.label_short || f.label || '').toLowerCase().includes('pp_perc');
      }) || null;
      var m0Field = allFields.find(function(f) {
        return f.name.toLowerCase().includes('m0');
      }) || null;
      var daysField = allFields.find(function(f) {
        return f.name.toLowerCase().includes('days_to_become_active_subtitle');
      }) || null;
      var mainValue = row[mainField.name].rendered || row[mainField.name].value;
      var ppLine = '';
      if (ppActualField) {
        var ppActualValue    = row[ppActualField.name].value;
        var ppActualRendered = row[ppActualField.name].rendered != null
          ? (ppActualValue >= 0 ? '+' : '') + row[ppActualField.name].rendered
          : (ppActualValue >= 0 ? '+' : '') + row[ppActualField.name].value;
        var ppArrow = ppActualValue >= 0
          ? '<span style="color:green;">▲</span>'
          : '<span style="color:red;">▼</span>';
        var ppTooltipAttr = '';
        if (ppPercField) {
          var ppPercRendered = row[ppPercField.name].rendered || row[ppPercField.name].value;
          ppTooltipAttr = ' title="' + ppPercRendered + ' difference vs prev. period"';
        }
        ppLine = '<div style="font-size:0.85em; color:#696969; margin-top:2px; cursor:' + (ppPercField ? 'help' : 'default') + ';"' + ppTooltipAttr + '>' + ppArrow + ' ' + ppActualRendered + 'p vs prev. period</div>';
      }
      var targetLine = '';
      if (targetActualField) {
        var targetActualValue    = row[targetActualField.name].value;
        var targetActualRendered = row[targetActualField.name].rendered != null
          ? (targetActualValue >= 0 ? '+' : '') + row[targetActualField.name].rendered
          : (targetActualValue >= 0 ? '+' : '') + row[targetActualField.name].value;
        var isLowGood = targetActualField.name.toLowerCase().includes('_low_');
        var emojiValue = targetPercField ? row[targetPercField.name].value : (targetActualValue >= 0 ? 1 : -1);
        var targetEmoji;
        if (isLowGood) {
          targetEmoji = emojiValue < 0 ? '🟢' : emojiValue <= 0.05 ? '🟡' : '🔴';
        } else {
          targetEmoji = emojiValue >= 0 ? '🟢' : emojiValue >= -0.05 ? '🟡' : '🔴';
        }
        var isPercMetric = targetActualField.name.toLowerCase().includes('_perc');
        var vsTargetLabel = isPercMetric
          ? targetActualRendered + '%p vs target'
          : targetActualRendered + ' vs target';
        var tooltipAttr = '';
        if (targetPercField) {
          var targetPercRendered = row[targetPercField.name].rendered || row[targetPercField.name].value;
          tooltipAttr = ' title="' + targetPercRendered + ' difference vs target"';
        }
        targetLine = '<div style="font-size:0.85em; color:#696969; margin-top:4px; cursor:' + (targetPercField ? 'help' : 'default') + ';"' + tooltipAttr + '>' + targetEmoji + ' ' + vsTargetLabel + '</div>';
      }
      var m0Line = '';
      if (m0Field) {
        var m0Value = row[m0Field.name].rendered || row[m0Field.name].value;
        m0Line = '<div style="font-size:0.75em; color:#696969; margin-top:4px;">Starting from order ' + m0Value + '</div>';
      }
      var daysLine = '';
      if (daysField) {
        var daysValue = row[daysField.name].rendered || row[daysField.name].value;
        daysLine = '<div style="font-size:0.75em; color:#696969; margin-top:4px;">Days to convert: ' + daysValue + '</div>';
      }
      var container = document.getElementById('kpi-container');
      container.innerHTML =
        '<div style="text-align:center; font-family: Google Sans, Roboto, sans-serif;">' +
          '<div id="kpi-main-value" style="font-size:2.5em; font-weight:600; color:#282828; cursor:pointer;">' + mainValue + '</div>' +
          m0Line +
          daysLine +
          targetLine +
          ppLine +
        '</div>';
      var drillLinks = row[mainField.name].links;
      if (drillLinks && drillLinks.length > 0) {
        document.getElementById('kpi-main-value').addEventListener('click', function(e) {
          LookerCharts.Utils.openDrillMenu({ links: drillLinks, event: e });
        });
      }
    } catch(e) {
      console.error("KPI VIZ ERROR:", e);
    }
    done();
  }
});
