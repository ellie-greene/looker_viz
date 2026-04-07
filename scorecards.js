looker.plugins.visualizations.add({
  options: {},
  create: function(element, config) {
    element.innerHTML = '<div id="kpi-container" style="height:100%; display:flex; align-items:center; justify-content:center;"></div>';
  },
  updateAsync: function(data, element, config, queryResponse, details, done) {
    try {
      var row       = data[0];
      var fields    = queryResponse.fields;
      var allFields = fields.measures.concat(fields.dimensions);

      console.log("KPI VIZ: allFields", JSON.stringify(allFields.map(f => f.name)));

      var mainField   = allFields[0];
      var targetField = allFields[1] || null;
      var ppField     = allFields[2] || null;

      var mainValue = row[mainField.name].rendered || row[mainField.name].value;

      // Build target line only if field exists in the query
      var targetLine = '';
      if (targetField) {
        var targetValue    = row[targetField.name].value;
        var targetRendered = row[targetField.name].rendered || (targetValue * 100).toFixed(1) + '%';
        var targetEmoji    = targetValue > 0.95 ? '🟢' : targetValue > 0.90 ? '🟡' : '🔴';
        targetLine = `
          <div style="font-size:0.85em; color:#696969; margin-top:4px;">
            ${targetEmoji} ${targetRendered} vs target
          </div>`;
      }

      // Build prev period line only if field exists in the query
      var ppLine = '';
      if (ppField) {
        var ppValue    = row[ppField.name].value;
        var ppRendered = row[ppField.name].rendered || (ppValue * 100).toFixed(1) + '%';
        var ppArrow    = ppValue >= 0
          ? '<span style="color:green;">▲</span>'
          : '<span style="color:red;">▼</span>';
        ppLine = `
          <div style="font-size:0.85em; color:#696969; margin-top:2px;">
            ${ppArrow} ${ppRendered} vs prev. period
          </div>`;
      }

      var container = document.getElementById('kpi-container');
      container.innerHTML = `
        <div style="text-align:center; font-family: 'Google Sans', 'Roboto', sans-serif;">
          <div id="kpi-main-value" style="font-size:2.5em; font-weight:600; color:#282828; cursor:pointer;">${mainValue}</div>
          ${targetLine}
          ${ppLine}
        </div>
      `;

      var drillLinks = row[mainField.name].links;
      if (drillLinks && drillLinks.length > 0) {
        document.getElementById('kpi-main-value').addEventListener('click', function(e) {
          LookerCharts.Utils.openDrillMenu({
            links: drillLinks,
            event: e
          });
        });
      }
    } catch(e) {
      console.error("KPI VIZ ERROR:", e);
    }
    done();
  }
});
