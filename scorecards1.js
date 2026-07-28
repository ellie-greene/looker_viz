looker.plugins.visualizations.add({
  options: {},
  create: function(element, config) {
    element.innerHTML = '<div id="kpi-container" style="height:100%; display:flex; align-items:center; justify-content:center;"></div>';
  },
  updateAsync: function(data, element, config, queryResponse, details, done) {
    try {
      if (!data || data.length === 0) {
        var emptyContainer = document.getElementById('kpi-container');
        if (emptyContainer) {
          emptyContainer.innerHTML =
            '<div style="text-align:center; font-family: Google Sans, Roboto, sans-serif; color:#9AA0A6;">' +
              '<div style="font-size:1.5em; font-weight:600;">No data</div>' +
              '<div style="font-size:0.85em; margin-top:2px;">for this date range</div>' +
            '</div>';
        }
        done();
        return;
      }
      var fields = queryResponse.fields;
      var allFields = (fields.measures || [])
        .concat(fields.dimensions || [])
        .concat(fields.table_calculations || []);
      if (allFields.length === 0) {
        var noFieldsContainer = document.getElementById('kpi-container');
        if (noFieldsContainer) {
          noFieldsContainer.innerHTML =
            '<div style="text-align:center; font-family: Google Sans, Roboto, sans-serif; color:#9AA0A6;">' +
              '<div style="font-size:1.5em; font-weight:600;">No data</div>' +
            '</div>';
        }
        done();
        return;
      }

      // ── number-format sniffing (used to render the derived pp delta) ──────
      function analyzeFormat(renderedStr) {
        renderedStr = String(renderedStr == null ? '' : renderedStr);
        var m = renderedStr.match(/^(\D*)([\d,]+(?:\.\d+)?)(\D*)$/);
        if (!m) return { prefix: '', suffix: '', decimals: 0 };
        var prefix = m[1] || '';
        var numPart = m[2] || '';
        var suffix = m[3] || '';
        var decMatch = numPart.match(/\.(\d+)$/);
        var decimals = decMatch ? decMatch[1].length : 0;
        return { prefix: prefix, suffix: suffix, decimals: decimals };
      }
      function formatWithStyle(value, style) {
        var abs = Math.abs(value);
        var formatted = abs.toLocaleString('en-GB', {
          minimumFractionDigits: style.decimals,
          maximumFractionDigits: style.decimals
        });
        var sign = value >= 0 ? '+' : '-';
        return sign + style.prefix + formatted + style.suffix;
      }
      // ────────────────────────────────────────────────────────────────────────

      var mainField        = allFields[0];
      var targetActualField = allFields.find(function(f) {
        return f.name.toLowerCase().includes('target_actual') || (f.label_short || f.label || '').toLowerCase().includes('target_actual');
      }) || null;
      var targetPercField = allFields.find(function(f) {
        var name = f.name.toLowerCase();
        return (name.includes('target_perc') && !name.includes('target_actual')) ||
               (f.label_short || f.label || '').toLowerCase().includes('target_perc');
      }) || null;
      // legacy explicit pp fields (still supported as a fallback)
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

      // ── NEW: detect a "period" dimension by its rendered VALUES, not its name ──
      // Looks for a field where the data rows contain "current period" / "previous period"
      // text, so this works regardless of what you've named the filter dimension.
      var periodField = null;
      var currentRow = null;
      var previousRow = null;
      var periodFieldDetected = false; // true once we find a dimension carrying "current/previous period" values at all

      (fields.dimensions || []).concat(fields.table_calculations || []).some(function(f) {
        var currentMatch = null, previousMatch = null, anyMatch = false;
        for (var i = 0; i < data.length; i++) {
          var cell = data[i][f.name];
          if (!cell) continue;
          var text = String(cell.rendered || cell.value || '').toLowerCase();
          if (/current period/.test(text)) { currentMatch = data[i]; anyMatch = true; }
          else if (/previous period/.test(text)) { previousMatch = data[i]; anyMatch = true; }
        }
        if (anyMatch) {
          periodField = f;
          currentRow = currentMatch;
          previousRow = previousMatch;
          periodFieldDetected = true;
          return true; // stop at first matching dimension
        }
        return false;
      });

      // If this data clearly has a period-comparison dimension but no "current period" row came back,
      // don't fall back to showing the previous period's figure as if it were current - show no-data instead.
      if (periodFieldDetected && !currentRow) {
        var noCurrentContainer = document.getElementById('kpi-container');
        if (noCurrentContainer) {
          noCurrentContainer.innerHTML =
            '<div style="text-align:center; font-family: Google Sans, Roboto, sans-serif; color:#9AA0A6;">' +
              '<div style="font-size:1.5em; font-weight:600;">No data</div>' +
              '<div style="font-size:0.85em; margin-top:2px;">for current period</div>' +
            '</div>';
        }
        done();
        return;
      }

      // row used for the main value / target lines / subtitle / link / source-group badge
      // (only reaches here in legacy single-row mode if no period field was detected at all)
      var row = currentRow || data[0];
      // ────────────────────────────────────────────────────────────────────────

      var mainValue = row[mainField.name].rendered || row[mainField.name].value;
      var isLowGood = targetActualField ? targetActualField.name.toLowerCase().includes('_low_') : false;

      // ── detect "no data" rows (main measure is 0/null, likely a target-only row) ──
      var mainNumericValue = row[mainField.name].value;
      var isNoData = (mainNumericValue === 0 || mainNumericValue === null);
      // ────────────────────────────────────────────────────────────────────────

      // ── source_group filter badge ──────────────────────────────────────────
      var sourceGroupLine = '';
      var appliedFilters = queryResponse.applied_filters || {};
      var sourceGroupFilter = Object.keys(appliedFilters).find(function(k) {
        return k.toLowerCase().includes('source_group');
      });
      if (sourceGroupFilter) {
        var filterValue = (appliedFilters[sourceGroupFilter].value || '').trim();
        var sgColour = null;
        if (/digital/i.test(filterValue)) {
          sgColour = '#1A73E8';
        } else if (/face.*(2|to).*face|f2f/i.test(filterValue)) {
          sgColour = '#D93025';
        }
        if (sgColour) {
          var displayValue = filterValue.charAt(0).toUpperCase() + filterValue.slice(1);
          sourceGroupLine = '<div style="display:inline-block; font-size:12px; font-weight:600; line-height:1; color:' + sgColour + '; letter-spacing:0.03em;">' + displayValue + '</div>';
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      // ── period-on-period line (suppressed entirely when isNoData) ───────────
      var ppLine = '';
      if (!isNoData && periodField && previousRow) {
        // NEW PATH: derive the delta from the two rows' main measure value
        var currentValue  = row[mainField.name].value;
        var previousValue = previousRow[mainField.name].value;
        var ppActualValue = currentValue - previousValue;

        var style = analyzeFormat(mainValue);
        var isPercMetric = style.suffix.indexOf('%') !== -1 || mainField.name.toLowerCase().includes('perc');

        var ppActualRendered = formatWithStyle(ppActualValue, style);

        var ppGood;
        if (isLowGood) {
          ppGood = ppActualValue < 0 ? 'good' : 'bad';
        } else {
          ppGood = ppActualValue >= 0 ? 'good' : 'bad';
        }
        var ppColour = ppGood === 'good' ? 'green' : 'red';
        var ppArrow = ppActualValue >= 0
          ? '<span style="color:' + ppColour + ';">▲</span>'
          : '<span style="color:' + ppColour + ';">▼</span>';

        var ppActualLabel = isPercMetric
          ? ppActualRendered + 'p vs prev. period'
          : ppActualRendered + ' vs prev. period';

        var ppTooltipAttr = '';
        if (previousValue !== 0 && previousValue != null) {
          var ppPercValue = ppActualValue / previousValue;
          var ppPercRendered = (ppPercValue >= 0 ? '+' : '') + (ppPercValue * 100).toFixed(2) + '%';
          ppTooltipAttr = ' title="' + ppPercRendered + ' difference vs prev. period"';
        }
        ppLine = '<div style="font-size:0.85em; color:#696969; margin-top:2px; cursor:' + (ppTooltipAttr ? 'help' : 'default') + ';"' + ppTooltipAttr + '>' + ppArrow + ' ' + ppActualLabel + '</div>';

      } else if (!isNoData && ppActualField) {
        // LEGACY PATH: explicit pp_actual / pp_perc measure fields on a single row
        var ppActualValueLegacy    = row[ppActualField.name].value;
        var ppActualRenderedLegacy = row[ppActualField.name].rendered != null
          ? (ppActualValueLegacy >= 0 ? '+' : '') + row[ppActualField.name].rendered
          : (ppActualValueLegacy >= 0 ? '+' : '') + row[ppActualField.name].value;
        var ppGoodLegacy;
        if (isLowGood) {
          ppGoodLegacy = ppActualValueLegacy < 0 ? 'good' : 'bad';
        } else {
          ppGoodLegacy = ppActualValueLegacy >= 0 ? 'good' : 'bad';
        }
        var ppColourLegacy = ppGoodLegacy === 'good' ? 'green' : 'red';
        var ppArrowLegacy = ppActualValueLegacy >= 0
          ? '<span style="color:' + ppColourLegacy + ';">▲</span>'
          : '<span style="color:' + ppColourLegacy + ';">▼</span>';
        var isPpPercMetricLegacy = ppActualField.name.toLowerCase().includes('_perc');
        var ppActualLabelLegacy = isPpPercMetricLegacy
          ? ppActualRenderedLegacy + '%p vs prev. period'
          : ppActualRenderedLegacy + ' vs prev. period';
        var ppTooltipAttrLegacy = '';
        if (ppPercField) {
          var ppPercRenderedLegacy = row[ppPercField.name].rendered || row[ppPercField.name].value;
          ppTooltipAttrLegacy = ' title="' + ppPercRenderedLegacy + ' difference vs prev. period"';
        }
        ppLine = '<div style="font-size:0.85em; color:#696969; margin-top:2px; cursor:' + (ppPercField ? 'help' : 'default') + ';"' + ppTooltipAttrLegacy + '>' + ppArrowLegacy + ' ' + ppActualLabelLegacy + '</div>';
      }
      // ──────────────────────────────────────────────────────────────────────

      var targetLine = '';
      if (targetActualField) {
        var targetActualValue    = row[targetActualField.name].value;
        var targetActualRendered = row[targetActualField.name].rendered != null
          ? (targetActualValue >= 0 ? '+' : '') + row[targetActualField.name].rendered
          : (targetActualValue >= 0 ? '+' : '') + row[targetActualField.name].value;
        var isPercMetricTarget = targetActualField.name.toLowerCase().includes('_perc');
        var vsTargetLabel = isPercMetricTarget
          ? targetActualRendered + '%p vs target'
          : targetActualRendered + ' vs target';

        if (isNoData) {
          // no colour coding, no emoji - just the plain figure
          targetLine = '<div style="font-size:0.85em; color:#696969; margin-top:4px;">' + vsTargetLabel + '</div>';
        } else {
          var emojiValue = targetPercField ? row[targetPercField.name].value : (targetActualValue >= 0 ? 1 : -1);
          var targetEmoji;
          if (isLowGood) {
            targetEmoji = emojiValue < 0 ? '🟢' : emojiValue <= 0.05 ? '🟡' : '🔴';
          } else {
            targetEmoji = emojiValue >= 0 ? '🟢' : emojiValue >= -0.05 ? '🟡' : '🔴';
          }
          var tooltipAttr = '';
          if (targetPercField) {
            var targetPercRendered = row[targetPercField.name].rendered || row[targetPercField.name].value;
            tooltipAttr = ' title="' + targetPercRendered + ' difference vs target"';
          }
          targetLine = '<div style="font-size:0.85em; color:#696969; margin-top:4px; cursor:' + (targetPercField ? 'help' : 'default') + ';"' + tooltipAttr + '>' + targetEmoji + ' ' + vsTargetLabel + '</div>';
        }
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

      // ── main value display (swapped for "No data for this period" when isNoData) ──
      var mainDisplay = isNoData
        ? '<div style="font-size:1.3em; font-weight:600; color:#9AA0A6;">No data for this period</div>'
        : '<div style="font-size:2.5em; font-weight:600; color:#282828;">' + mainValue + '</div>';

      var container = document.getElementById('kpi-container');
      container.innerHTML =
        '<div style="text-align:center; font-family: Google Sans, Roboto, sans-serif;">' +
        sourceGroupLine +
          mainDisplay +
          subtitleLine +
          targetLine +
          ppLine +
          linkIcon +
        '</div>';

      if (linkField && linkIcon) {
        var linkLinksFinal = row[linkField.name].links;
        if (linkLinksFinal && linkLinksFinal.length > 0) {
          document.getElementById('kpi-link-icon').addEventListener('click', function(e) {
            LookerCharts.Utils.openDrillMenu({ links: linkLinksFinal, event: e });
          });
        }
      }

    } catch(e) {
      console.error("KPI VIZ ERROR:", e);
    }
    done();
  }
});
