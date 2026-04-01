looker.plugins.visualizations.add({
  options: {},
  create: function(element, config) {
    console.log("KPI VIZ: create called");
    element.innerHTML = '<div id="kpi-container" style="height:100%; display:flex; align-items:center; justify-content:center;"></div>';
  },
  updateAsync: function(data, element, config, queryResponse, details, done) {
    console.log("KPI VIZ: updateAsync called");
    console.log("KPI VIZ: data", JSON.stringify(data));
    console.log("KPI VIZ: queryResponse", JSON.stringify(queryResponse));

    try {
      var row        = data[0];
      var fields     = queryResponse.fields;
      var allFields  = fields.measures.concat(fields.dimensions);

      console.log("KPI VIZ: allFields", allFields.map(f => f.name));
      console.log("KPI VIZ: row", JSON.stringify(row));

      var mainField   = allFields[0];
      var targetField = allFields[1];
      var ppField     = allFields[2];

      var mainValue   = row[mainField.name].rendered  || row[mainField.name].value;
      var targetValue = row[targetField.name].value;
      var ppValue     = row[ppField.name].value;

      console.log("KPI VIZ: mainValue", mainValue);
      console.log("KPI VIZ: targetValue", targetValue);
      console.log("KPI VIZ: ppValue", ppValue);

      var targetRendered = row[targetField.name].rendered || (targetValue * 100).toFixed(1) + '%';
      var ppRendered     = row[ppField.name].rendered    || (ppValue * 100).toFixed(1) + '%';

      var targetEmoji = targetValue > 0.95 ? '🟢' : targetValue > 0.90 ? '🟡' : '🔴';

      var ppArrow = ppValue >= 0
        ? '<span style="color:green;">▲</span>'
        : '<span style="color:red;">▼</span>';

      var container = document.getElementById('kpi-container');
      console.log("KPI VIZ: container", container);

      container.innerHTML = `
        <div style="text-align:center; font-family:sans-serif;">
          <div style="font-size:2.5em; font-weight:bold;">${mainValue}</div>
          <div style="font-size:0.85em; color:grey; margin-top:4px;">
            ${targetEmoji} ${targetRendered} vs target
          </div>
          <div style="font-size:0.85em; margin-top:2px;">
            ${ppArrow} ${ppRendered} vs prev. period
          </div>
        </div>
      `;

    } catch(e) {
      console.error("KPI VIZ ERROR:", e);
    }

    done();
  }
});

    done();
  }
});
