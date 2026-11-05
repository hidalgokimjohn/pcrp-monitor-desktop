// Activity Tracker schema. BA List columns are deliberately not part of this contract.
var ACTIVITY_TRACKER_HEADERS = [
  'Region', 'Province', 'City / Municipality', 'Barangay', 'Modality', 'CRIP/MC09 Activity', 'Activity Title',
  'Target Start', 'Target End', 'Actual Start', 'Actual End',
  'Participants - Male', 'Participants - Female', 'Participants - Unspecified', 'Participants - Total',
  'Person Volunteers - Male', 'Person Volunteers - Female', 'Person Volunteers - Unspecified', 'Person Volunteers - Total',
  'BA Participation - Total HH in Barangay', 'BA Participation - Total HH Represented',
  'BA Participation - % HH Participation', 'BA Participation - 4Ps HH Represented',
  'BA Participation - SLP HH Represented', 'BA Participation - IP HH Represented',
  'BA Participation - Individual Male', 'BA Participation - Individual Female', 'BA Participation - Individual Total'
];

function trackerColumnIndex(headers) {
  var map = {};
  headers.forEach(function (h, i) { map[normKey(h)] = i; });
  var at = function (h) { return map[normKey(h)]; };
  var counts = function (prefix) {
    return { male: at(prefix + ' - Male'), female: at(prefix + ' - Female'),
      unspecified: at(prefix + ' - Unspecified'), total: at(prefix + ' - Total') };
  };
  return { summary: true, province: at('Province'), muni: at('City / Municipality'), brgy: at('Barangay'),
    modality: at('Modality'), name: at('CRIP/MC09 Activity'), title: at('Activity Title'),
    targetStart: at('Target Start'), targetEnd: at('Target End'), dateStart: at('Actual Start'), dateEnd: at('Actual End'),
    participants: counts('Participants'), personVolunteers: counts('Person Volunteers'),
    hhTotal: at('BA Participation - Total HH in Barangay'), hhRepresented: at('BA Participation - Total HH Represented'),
    hhDetail: { kcisRate: at('BA Participation - % HH Participation'), hh4Ps: at('BA Participation - 4Ps HH Represented'),
      hhSlp: at('BA Participation - SLP HH Represented'), hhIp: at('BA Participation - IP HH Represented'),
      indivMale: at('BA Participation - Individual Male'), indivFemale: at('BA Participation - Individual Female'),
      indivTotal: at('BA Participation - Individual Total') }
  };
}

function trackerBarangay(value) {
  return normAlpha(value) === 'buenagracia' ? 'Buena Gracia' : normText(value);
}

function trackerNumber(value) {
  if (!hasValue(value) || (typeof value !== 'number' && typeof value !== 'string')) return null;
  var x = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  return isFinite(x) && x >= 0 && Math.floor(x) === x ? x : null;
}

function trackerCounts(row, columns) {
  var result = {};
  Object.keys(columns).forEach(function (k) { result[k] = trackerNumber(row[columns[k]]) || 0; });
  return result;
}

function trackerEarlier(a, b) { return b && (!a || b < a) ? b : (a || null); }
function trackerLater(a, b) { return b && (!a || b > a) ? b : (a || null); }

function trackerIsDate(value) {
  var iso = formatDateVal(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
  var date = new Date(iso + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

function trackerRecord(row, c, sourceRow) {
  var metrics = function (cols) {
    var out = {};
    Object.keys(cols).forEach(function (k) { out[k] = trackerNumber(row[cols[k]]); });
    return out;
  };
  return { sourceRow: row.sourceRow || sourceRow, title: normText(row[c.title]),
    targetStart: formatDateVal(row[c.targetStart]) || '', targetEnd: formatDateVal(row[c.targetEnd]) || '',
    actualStart: formatDateVal(row[c.dateStart]) || '', actualEnd: formatDateVal(row[c.dateEnd]) || '',
    participants: metrics(c.participants), personVolunteers: metrics(c.personVolunteers),
    householdDetail: Object.keys(c.hhDetail).reduce(function (out, k) { out[k] = hasValue(row[c.hhDetail[k]]) ? row[c.hhDetail[k]] : null; return out; }, {}),
    hhTotal: hasValue(row[c.hhTotal]) ? trackerNumber(row[c.hhTotal]) : null,
    hhRepresented: hasValue(row[c.hhRepresented]) ? trackerNumber(row[c.hhRepresented]) : null };
}

function trackerSnapshot(rec, base, source, c, index) {
  var rows = [], repeated = [], issues = [], totals = { participants: 0, personVolunteers: 0, records: source.length, invalidFigures: 0, otherModality: 0 };
  source.forEach(function (r, i) {
    var place = { province: normText(r[c.province]), municipality: normText(r[c.muni]), barangay: trackerBarangay(r[c.brgy]),
      actCode: classify(index, null, r[c.name], null), sourceRow: r.sourceRow || i + 2 };
    var municipal = place.actCode && index.byCode[place.actCode].level === 'Municipal';
    var placeKey = normKey(place.province) + '|' + normKey(place.municipality);
    var canonical = municipal ? (base.byMuni[placeKey] || base.muniNoProv['|' + normKey(place.municipality)])
      : (base.brgyRowByKey[placeKey + '|' + normKey(place.barangay)] || base.brgyNoProv['|' + normKey(place.municipality) + '|' + normKey(place.barangay)]);
    if (canonical) { place.province = canonical.province; place.municipality = canonical.municipality; if (!municipal) place.barangay = canonical.barangay; }
    if (municipal) place.barangay = '';
    function flag(problem) { issues.push(Object.assign({ problem: problem }, place)); }
    var code = place.actCode, pcrp = normKey(r[c.modality]) === 'pcrp';
    // Rows the summary leaves out (another modality, an unrecognized activity) are
    // counted but not checked: their figures never reach a finding, so checking them
    // only fills DQA with noise. An unrecognized PCRP activity is still one finding.
    if (!pcrp) totals.otherModality++;
    else if (!code) flag('Unrecognized controlled activity: ' + normText(r[c.name]));
    var check = pcrp && code ? flag : function () {};
    if (code && index.byCode[code].level !== 'Municipal' && !place.barangay) check('Barangay is missing for a barangay activity');
    [['Participants', c.participants], ['Person Volunteers', c.personVolunteers]].forEach(function (group) {
      var v = {}, valid = true;
      Object.keys(group[1]).forEach(function (k) {
        v[k] = trackerNumber(r[group[1][k]]);
        if (v[k] === null) { valid = false; if (pcrp && code) totals.invalidFigures++; check(group[0] + ' ' + k + ': missing or invalid nonnegative whole count'); }
      });
      if (valid && v.male + v.female + v.unspecified !== v.total) check(group[0] + ': male + female + unspecified differs from total');
      totals[group[0] === 'Participants' ? 'participants' : 'personVolunteers'] += v.total || 0;
    });
    [c.hhTotal, c.hhRepresented, c.hhDetail.hh4Ps, c.hhDetail.hhSlp, c.hhDetail.hhIp,
      c.hhDetail.indivMale, c.hhDetail.indivFemale, c.hhDetail.indivTotal].forEach(function (j) {
      if (hasValue(r[j]) && trackerNumber(r[j]) === null) check('Invalid household/individual count in source column ' + (j + 1));
    });
    if (hasValue(r[c.hhTotal]) && trackerNumber(r[c.hhTotal]) === 0) check('Household total must be greater than zero for a quorum rate');
    var t = trackerNumber(r[c.hhTotal]), p = trackerNumber(r[c.hhRepresented]), rate = r[c.hhDetail.kcisRate];
    if (hasValue(rate)) {
      var value = Number(String(rate).replace(/[%,\s]/g, ''));
      if (!isFinite(value) || value < 0 || value > 100) check('Invalid KCIS household participation percentage');
      else if (t > 0 && p !== null && Math.abs(value - p / t * 100) > 0.011) check('KCIS household percentage differs from represented / total');
    }
    var im = trackerNumber(r[c.hhDetail.indivMale]), iff = trackerNumber(r[c.hhDetail.indivFemale]), it = trackerNumber(r[c.hhDetail.indivTotal]);
    if (im !== null && iff !== null && it !== null && im + iff !== it) check('Household individual male + female differs from individual total');
    if (trackerNumber(r[c.participants.total]) > 0 && (!hasValue(r[c.dateStart]) || !hasValue(r[c.dateEnd]))) check('Positive attendance with missing actual conduct dates');
    ['targetStart', 'targetEnd', 'dateStart', 'dateEnd'].forEach(function (k) {
      if (hasValue(r[c[k]]) && !trackerIsDate(r[c[k]])) check('Unreadable ' + k + ' date');
    });
    if (formatDateVal(r[c.targetStart]) && formatDateVal(r[c.targetEnd]) < formatDateVal(r[c.targetStart]) && hasValue(r[c.targetEnd])) check('Target End before Target Start');
  });
  Object.keys(rec).forEach(function (key) {
    var s = rec[key], parts = key.split('|'), place = dqaPlace_(base, parts[0], parts[1], parts[2]);
    var r = Object.assign({ act: parts[3], actCode: parts[3], actLabel: index.byCode[parts[3]].label,
      seq: index.byCode[parts[3]].seq, dateStart: s.dateStart, dateEnd: s.dateEnd,
      targetStart: s.targetStart, targetEnd: s.targetEnd, sourceRows: s.sourceRows,
      participants: { male: s.m, female: s.f, unspecified: s.u, total: s.att }, personVolunteers: s.pv,
      repeated: s.rows > 1, sourceCount: s.rows }, place);
    r.invalidMetrics = ['male', 'female', 'unspecified', 'total'].filter(function (k) {
      return s.sourceRows.some(function (sourceRow) { return sourceRow.participants[k] === null; });
    });
    r.key = ['att-summary-v2', r.province, r.municipality, r.barangay, r.act].join('|');
    r.q = [r.province, r.municipality, r.barangay, r.actLabel].join(' ').toLowerCase();
    r.hasIssues = issues.some(function (x) { return normKey(x.province) === normKey(r.province) && normKey(x.municipality) === normKey(r.municipality) && normKey(x.barangay) === normKey(r.barangay) && x.actCode === r.act; });
    rows.push(r);
    if (r.repeated) {
      var fingerprints = {}, datePairs = {}, countPairs = {};
      s.sourceRows.forEach(function (sr) {
        var copy = Object.assign({}, sr); delete copy.sourceRow;
        fingerprints[JSON.stringify(copy)] = true;
        datePairs[sr.actualStart + '|' + sr.actualEnd] = true;
        countPairs[JSON.stringify([sr.participants, sr.personVolunteers, sr.hhTotal, sr.hhRepresented, sr.householdDetail])] = true;
      });
      repeated.push(Object.assign({ actCode: r.act, records: s.rows, extraRows: s.rows - 1, sourceRows: s.sourceRows,
        kinds: [Object.keys(fingerprints).length < s.rows ? 'Identical records' : '', Object.keys(countPairs).length > 1 ? 'Conflicting counts' : '',
          Object.keys(datePairs).length > 1 ? 'Different dates' : ''].filter(Boolean) }, place));
    }
  });
  return { rows: rows, repeated: repeated, issues: issues, totals: totals };
}

// Preserve source row numbers while removing ignored BA List and unrelated columns.
function trackerTable(table) {
  var map = {};
  table.headers.forEach(function (h, i) { map[normKey(h)] = i; });
  return { headers: ACTIVITY_TRACKER_HEADERS.slice(), rowNumbers: table.rowNumbers,
    rows: table.rows.map(function (r) { return ACTIVITY_TRACKER_HEADERS.map(function (h) { return r[map[normKey(h)]]; }); }) };
}

function validateTrackerTable(table) {
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) throw new Error('Invalid Activity Tracker table.');
  var missing = checkHeaders(table.headers, ACTIVITY_TRACKER_HEADERS);
  if (missing.length) throw new Error('Activity Tracker: ' + missing.join('; '));
  var keys = {}, required = {};
  ACTIVITY_TRACKER_HEADERS.forEach(function (h) { required[normKey(h)] = true; });
  table.headers.forEach(function (h) { var key = normKey(h); if (!required[key]) return; if (keys[key]) throw new Error('Duplicate Activity Tracker column: ' + h); keys[key] = true; });
  if (table.rows.some(function (r) { return !Array.isArray(r); })) throw new Error('Activity Tracker has an invalid record.');
  if (table.rowNumbers && (!Array.isArray(table.rowNumbers) || table.rowNumbers.length !== table.rows.length || table.rowNumbers.some(function (n) { return !Number.isInteger(n) || n < 1; }))) throw new Error('Activity Tracker has invalid source row numbers.');
}

function trackerDqaChecks(o, col, colMuni, colProv, colPlace, colAct, one) {
  var h = o.health || {};
  if (!h.repeatedActivities) return [];
  var sourceText = function (r) {
    return r.sourceRows.map(function (s) {
      return 'Row ' + s.sourceRow + ': ' + s.title + '; target ' + (s.targetStart || '—') + ' to ' + (s.targetEnd || '—') +
        '; actual ' + (s.actualStart || '—') + ' to ' + (s.actualEnd || '—') + '; Participants M/F/U/total ' +
        [s.participants.male, s.participants.female, s.participants.unspecified, s.participants.total].join('/') +
        '; Person Volunteers M/F/U/total ' + [s.personVolunteers.male, s.personVolunteers.female, s.personVolunteers.unspecified, s.personVolunteers.total].join('/') +
        '; HH total/represented ' + [s.hhTotal === null ? '—' : s.hhTotal, s.hhRepresented === null ? '—' : s.hhRepresented].join('/');
    }).join('\n');
  };
  return [
    { id: 'hhattendance', dim: 'reliability', name: 'Household and attendance discrepancies', icon: 'scale', severity: 'verify',
      unit: ['assembly', 'assemblies'], total: (h.householdFlags || []).filter(function (r) { return r.kind === 'HH / attendance discrepancy'; }).length,
      meaning: 'Households represented exceeds reported Participants. These are separate measures; review the source forms before drawing conclusions.',
      why: 'Household participation and participant encoding may cover different records or be incomplete.',
      steps: ['Compare household participation and attendance figures against their respective forms.', 'Correct confirmed errors in KCIS and import a fresh Activity Tracker.'],
      rows: function () { return (h.householdFlags || []).filter(function (r) { return r.kind === 'HH / attendance discrepancy'; }); }, places: one,
      cols: [colMuni, colProv, colPlace, colAct, col('Discrepancy', function (r) { return dhFindingLink('hhattendance', r, r.issue, 1, 'Inspect household scorecard'); }, function (r) { return r.issue; })],
      text: function (r) { return [r.province, r.municipality, r.barangay, r.actCode, r.issue]; }, detail: function (r) { return r.issue; } },
    { id: 'activityrepeat', dim: 'integrity', name: 'Repeated activity records', icon: 'copy', severity: 'verify',
      unit: ['activity group', 'activity groups'], total: h.repeatedActivities.length,
      meaning: 'Multiple Activity Tracker records for the same location and controlled activity. All reported attendance counts remain included.',
      why: 'These may be duplicate entries, conflicting summaries, or separate sittings. Compare the source records before changing KCIS.',
      steps: ['Check source sheet rows, dates and totals against the signed forms.', 'Resolve erroneous records in KCIS and import a new Activity Tracker. Counts are not automatically removed.'],
      rows: function () { return h.repeatedActivities; }, places: one,
      cols: [colMuni, colProv, colPlace, colAct,
        col('Record types', function (r) { return dhFindingLink('activityrepeat', r, r.kinds.join('; ') || 'Repeated activity', r.records, 'Inspect Attendance Summary'); }, function (r) { return r.kinds.join('; '); }),
        col('Source records (included)', function (r) { return '<div class="tracker-source-records">' + esc(sourceText(r)).replace(/\n/g, '<br>') + '</div>'; }, sourceText)],
      text: function (r) { return [r.province, r.municipality, r.barangay, r.actCode, sourceText(r)]; },
      detail: function (r) { return r.records + ' source records (' + (r.kinds.join(', ') || 'Repeated activity') + '); attendance included'; } },
    { id: 'summaryfigures', dim: 'accuracy', name: 'Activity Tracker figures and dates', icon: 'calculator', severity: 'verify',
      unit: ['issue', 'issues'], total: h.trackerIssues.length,
      meaning: 'Invalid or missing counts, arithmetic differences, household percentage differences, location gaps or missing conduct dates.',
      why: 'Summary figures require review against their source forms. A discrepancy is not automatically corrected.',
      steps: ['Review the indicated source sheet row and field.', 'Correct KCIS and import a fresh Activity Tracker.'],
      rows: function () { return h.trackerIssues; }, places: one,
      cols: [colMuni, colProv, colPlace, colAct,
        col('Source sheet row', function (r) { return n(r.sourceRow); }, function (r) { return r.sourceRow; }, 'num'),
        col('Issue', function (r) { return dhFindingLink('summaryfigures', r, r.problem, 1, 'Inspect Attendance Summary'); }, function (r) { return r.problem; })],
      text: function (r) { return [r.province, r.municipality, r.barangay, r.actCode, r.problem]; },
      detail: function (r) { return 'Row ' + r.sourceRow + ': ' + r.problem; } }
  ];
}
