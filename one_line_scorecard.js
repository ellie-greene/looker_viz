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

      // DEBUG — remove once working
      container.innerHTML = '<pre style="font-size:10px; text-align:left; overflow:auto; width:100%; white-space:pre-wrap;">' +
        JSON.stringify({
          pivots: pivots,
          measures: (fields.measures || []).map(function(f){ return f.name; }),
          dimensions: (fields.dimensions || []).map(function(f){ return f.name; }),
          row0keys: Object.keys(data[0]),
          row0sample: data[0]
        }, null, 2) + '</pre>';
      done(); return;

    } catch(e) {
      container.innerHTML = '<div style="color:red; font-family: Google Sans, Roboto, sans-serif; padding:16px; font-size:0.85em;"><strong>ERROR:</strong> ' + e.message + '<br><br>' + e.stack + '</div>';
      done();
    }
  }
});
