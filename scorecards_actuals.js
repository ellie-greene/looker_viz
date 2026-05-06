looker.plugins.visualizations.add({
  options: {},
  create: function(element, config) {
    element.innerHTML = '<div id="kpi-container" style="height:100%; display:flex; align-items:center; justify-content:center;"></div>';
  },
  updateAsync: function(data, element, config, queryResponse, details, done) {
    try {
      if (!data || data.length === 0) { done(); return; }
      var row    = data[0];
      var fields = queryResponse.fields;
      var allFields = (fields.measures || [])
        .concat(fields.dimensions || [])
        .concat(fields.table_calculations || []);
      if (allFields.length === 0) { done(); return; }

      var mainField        = allFields[0];
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
      var subtitleField = allFields.find(function(f) {
        return f.name.toLowerCase().includes('_subtitle');
      }) || null;
      var linkField = allFields.find(function(f) {
        return f.name.toLowerCase().includes('_link');
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
        var isPpPercMetric = ppActualField.name.toLowerCase().includes('_perc');
        var ppActualLabel = isPpPercMetric
          ? ppActualRendered + '%p vs prev. period'
          : ppActualRendered + ' vs prev. period';
        var ppTooltipAttr = '';
        if (ppPercField) {
          var ppPercRendered = row[ppPercField.name].rendered || row[ppPercField.name].value;
          ppTooltipAttr = ' title="' + ppPercRendered + ' difference vs prev. period"';
        }
        ppLine = '<div style="font-size:0.85em; color:#696969; margin-top:2px; cursor:' + (ppPercField ? 'help' : 'default') + ';"' + ppTooltipAttr + '>' + ppArrow + ' ' + ppActualLabel + '</div>';
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

      var subtitleLine = '';
      if (subtitleField) {
        var subtitleValue = row[subtitleField.name].rendered || row[subtitleField.name].value;
        var subtitleLabel = (subtitleField.label_short || subtitleField.label || '').replace(/_subtitle$/i, '').trim();
        subtitleLine = '<div style="font-size:0.75em; color:#696969; margin-top:4px;">' + subtitleLabel + ': ' + subtitleValue + '</div>';
      }

      var linkIcon = '';
      if (linkField) {
        var linkLinks = row[linkField.name].links;
        if (linkLinks && linkLinks.length > 0) {
          linkIcon = '<div id="kpi-link-icon" style="font-size:1.2em; margin-top:6px; cursor:pointer; color:#4285F4;">↗</div>';
        }
      }

      var container = document.getElementById('kpi-container');
      container.innerHTML =
        '<div style="text-align:center; font-family: Google Sans, Roboto, sans-serif;">' +
          '<div style="font-size:2.5em; font-weight:600; color:#282828;">' + mainValue + '</div>' +
          subtitleLine +
          targetLine +
          ppLine +
          linkIcon +
        '</div>';

      if (linkField && linkIcon) {
        var linkLinks = row[linkField.name].links;
        if (linkLinks && linkLinks.length > 0) {
          document.getElementById('kpi-link-icon').addEventListener('click', function(e) {
            LookerCharts.Utils.openDrillMenu({ links: linkLinks, event: e });
          });
        }
      }

    } catch(e) {
      console.error("KPI VIZ ERROR:", e);
    }
    done();
  }
});
