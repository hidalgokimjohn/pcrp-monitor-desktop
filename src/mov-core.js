// Stage 1 only. Reference: Field Guide, Stage 1!D4:I38. Presence is not content verification.
var MOV_REFERENCE_VERSION = 'stage1-field-guide-2026-11-04';
var MOV_HEADERS = ['Region Name', 'Province Name', 'City Name', 'Barangay Name', 'Activity_ID', 'Activity_Category',
  'Date End', 'Date Start', 'Display On (Tab)', 'Attachment_Type_ID', 'File Type', 'File Name',
  'lib_region.code_correspondence', 'lib_province.code_correspondence', 'lib_city.code_correspondence',
  'lib_brgy.code_correspondence', 'File Path'];
var MOV_ACTIVITY_IDS = { '1': 'MREST', '2': 'BA1', '16': 'PROFILE', '17': 'WALK', '18': 'MAP', '19': 'FGD', '3': 'BPRVA', '4': 'MRP', '5': 'BDC' };
var MOV_TYPES = { '26': 'Municipal Activity Minutes Form', '27': 'Municipal Activity Attendance Sheet',
  '29': 'Barangay Activity Attendance Sheet', '30': 'Barangay Activity Minutes Form', '31': 'Barangay Household Participation Form',
  '32': 'EO Forming the MResT', '37': 'Community Volunteer Profile Form', '38': 'Risk Mapping Content',
  '39': 'Format for Summary of FGD and PRVA Results', '41': 'Municipal Profile', '42': 'MRP Template', '43': 'Sub-Project Concept Note' };
var MOV_CATALOG = {};
(function () {
  // hint: a filename pattern (regex source) for candidate attachments; note: guidance shown to the reviewer.
  function add(code, id, name, row, types, candidates, conditional, hint, note) {
    (MOV_CATALOG[code] = MOV_CATALOG[code] || []).push({ id: id, name: name, sourceRow: row, types: types || [],
      candidateTypes: candidates || [], conditional: !!conditional, hint: hint || '', note: note || '' });
  }
  function records(code, municipal, minuteRow, attendanceRow) {
    add(code, 'minutes', (municipal ? 'Municipal' : 'Barangay') + ' Activity Minutes Form' + (code === 'BPRVA' ? ' including risk ranking' : ''), minuteRow, [municipal ? '26' : '30']);
    add(code, 'attendance', (municipal ? 'Municipal' : 'Barangay') + ' Activity Attendance Sheets', attendanceRow, [municipal ? '27' : '29']);
  }
  add('MREST', 'eo', 'Executive Order expanding the MResT members, including all PBs', 4, ['32']);
  add('MREST', 'sfm', 'Resolution creating the Municipal SFM committee', 5, [], ['34']);
  add('MREST', 'profile', 'MResT Profile', 6, [], ['41'], false, 'mrest.*profile|mrest profile');
  records('MREST', true, 7, 8);
  add('MREST', 'mwfp', 'Municipal Work and Financial Plan', 9, [], [], false, 'mwfp|work.*financial');
  records('BA1', false, 10, 11);
  add('BA1', 'households', 'Barangay Household participation form', 12, ['31']);
  add('BA1', 'profiles', 'Community Volunteers Profile (BResT, CSFMC)', 13, ['37']);
  add('PROFILE', 'profile', 'Validated Community Profile', 14, [], ['40', '67'], false, 'community.*profile');
  add('WALK', 'notes_map', 'BResT Note and Accomplished baseline Map', 15, [], ['38', '40', '67']);
  add('MAP', 'risk_map', 'Risk Map', 16, ['38']);
  add('BPRVA', 'cause_effect', 'Accomplished Cause and Effect Matrix', 17, ['39'], ['40', '67']);
  add('FGD', 'consolidated', 'Consolidated FGD output', 18, [], ['39', '40', '67']);
  ['WALK', 'MAP', 'FGD', 'BPRVA'].forEach(function (code) { records(code, false, 19, 20); });
  add('MRP', 'profile', 'Municipal Consolidated Profile', 22, ['41']);
  add('MRP', 'risk_map', 'Municipal Risk Map', 23, ['38']);
  add('MRP', 'prva', 'Municipal Consolidated PRVA results', 24, ['39']);
  add('MRP', 'mrp', 'Accomplished MRP', 25, ['42']);
  add('MRP', 'ppas', 'List of Prioritized PPAs for PCRP Funding (using MRP template)', 26, [], ['42']);
  add('MRP', 'concept', 'Approved Concept Note for Year 1', 27, ['43'], [], false, '', 'Year 2/3 concept notes: within 90 days after MRP approval; no approval date is inferred from conduct dates.');
  add('MRP', 'endorsement', 'MResT resolution endorsing MRP and requesting next CRIP activities', 28, [], ['66']);
  records('MRP', true, 29, 30);
  add('BDC', 'committees', 'BDC Resolution creating CSPMC Chairperson, PPSC and OMSC for Year 2/3 prioritized barangays', 31, [], ['65', '69'], true);
  add('BDC', 'action_plan', 'Community Action Plan cum Resource Accessing Plan (prioritized and non-prioritized)', 32, [], [], false, 'action.*plan|resource.*access');
  records('BDC', false, 33, 34);
  add('APPRAISAL', 'observations', 'Accomplished RTWG observation Matrix', 35, [], [], false, 'rtwg|observation');
  add('APPRAISAL', 'clearance', 'Approved RPMO Clearance approving MRP and next CRIP activities', 36, [], ['66'], false, 'clearance');
  records('APPRAISAL', true, 37, 38);
})();

/** A requirement's filename pattern, compiled once; an unusable pattern matches nothing. */
var MOV_HINT_RE = {};
function movHintMatches(hint, filename) {
  if (!hint) return false;
  if (!(hint in MOV_HINT_RE)) { try { MOV_HINT_RE[hint] = new RegExp(hint, 'i'); } catch (e) { MOV_HINT_RE[hint] = null; } }
  return !!MOV_HINT_RE[hint] && MOV_HINT_RE[hint].test(filename);
}
function movHas(v) { return v !== null && v !== undefined && !/^(?:\s*|null|none)$/i.test(String(v).trim()); }
function movPath(v) { return movHas(v) ? String(v).trim().replace(/\\/g, '/') : ''; }
function movPlaceKey(p) { return [p.province, p.municipality, p.barangay || ''].map(normKey).join('|'); }
function movGroupKey(p, code) { return movPlaceKey(p) + '|' + code; }
function movColumnIndex(headers) {
  var index = {}; headers.forEach(function (h, i) { index[normKey(h)] = i; }); return index;
}
function validateMovTable(table) {
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) throw new Error('Invalid MOV attachment table.');
  var missing = checkHeaders(table.headers, MOV_HEADERS);
  if (missing.length) throw new Error('MOV attachments: ' + missing.join('; '));
  var seen = {}, required = {}; MOV_HEADERS.forEach(function (h) { required[normKey(h)] = true; });
  table.headers.forEach(function (h) { var k = normKey(h); if (required[k] && seen[k]) throw new Error('Duplicate MOV column: ' + h); seen[k] = true; });
  if (table.rows.some(function (r) { return !Array.isArray(r); })) throw new Error('Invalid MOV attachment record.');
  if (table.rowNumbers && (!Array.isArray(table.rowNumbers) || table.rowNumbers.length !== table.rows.length || table.rowNumbers.some(function (r) { return !Number.isInteger(r) || r < 1; }))) throw new Error('Invalid MOV source row numbers.');
}
function movBuild(base, index, rec, table, evalDate, trackerImported) {
  var imported = !!table, groups = [], byKey = {}, attachments = [], byAttachmentKey = {};
  var stats = { records: table ? table.rows.length : 0, attachmentRows: 0, emptyRows: 0, distinctPaths: 0, repeatedPaths: 0, repeatedOccurrences: 0 };
  // stage2Prio: the baseline's "Stage 2 Prioritized" flag for barangay groups; it decides the conditional Year 2/3 requirements.
  function makeGroup(place, code, pipelineApplicable, stage2Prio) {
    var key = movGroupKey(place, code), slotCode = code === 'APPRAISAL' ? 'MRP' : code;
    var slot = rec[movGroupKey(place, slotCode)], end = slot ? slot.dateEnd : null;
    var due = !!trackerImported && trackerIsDate(end) && end <= evalDate;
    var group = Object.assign({ key: key, actCode: code, actLabel: code === 'APPRAISAL' ? 'RPMO Appraisal of Municipal Resilience Plan' : index.byCode[code].label,
      trackerEncoded: !!(slot && slot.rows > 0) && code !== 'APPRAISAL', pipelineApplicable: pipelineApplicable, stage2Prio: !!stage2Prio, due: due, dateEnd: end, attendance: slot && code !== 'APPRAISAL' ? slot.att : 0, requirements: [], ready: false }, place);
    group.requirements = MOV_CATALOG[code].map(function (def) { return Object.assign({ key: key + '|' + def.id, groupKey: key, actCode: code,
      status: 'Pending activity', submittedPaths: [], attachmentKeys: [], candidateKeys: [], due: due, assessed: imported }, def, place); });
    groups.push(group); byKey[key] = group;
  }
  base.muniList.forEach(function (m) { ['MREST', 'MRP', 'APPRAISAL'].forEach(function (code) { if (code === 'APPRAISAL' || index.byCode[code]) makeGroup({ province: m.province, municipality: m.municipality, barangay: '' }, code, code !== 'APPRAISAL'); }); });
  base.rows.forEach(function (b) {
    ['BA1', 'PROFILE', 'WALK', 'MAP', 'FGD', 'BPRVA', 'BDC'].forEach(function (code) {
      if (index.byCode[code]) makeGroup({ province: b.province, municipality: b.municipality, barangay: b.barangay }, code, !index.byCode[code].prioOnly || b.stage2Prio, b.stage2Prio);
    });
  });
  var pathRows = Object.create(null), attachmentIndex = {}, byGroup = {};
  if (table) {
    var cols = movColumnIndex(table.headers);
    table.rows.forEach(function (row, i) {
      function val(name) { return row[cols[normKey(name)]]; }
      var sourceRow = table.rowNumbers ? table.rowNumbers[i] : i + 2;
      var path = movPath(val('File Path')), category = normText(val('Activity_Category'));
      var code = /rpmo.*appraisal|appraisal.*municipal.*resilience/i.test(category) ? 'APPRAISAL' : classify(index, null, category, null);
      var municipal =code === 'APPRAISAL' || (index.byCode[code] && index.byCode[code].level === 'Municipal');
      var place = { province: normText(val('Province Name')), municipality: normText(val('City Name')), barangay: trackerBarangay(val('Barangay Name')) };
      var cityCode = normKey(val('lib_city.code_correspondence')), brgyCode = normKey(val('lib_brgy.code_correspondence'));
      var canonical = municipal ? base.psgcCityToMuni[cityCode] : base.psgcToBrgy[brgyCode];
      if (!canonical) canonical = municipal ? (base.byMuni[normKey(place.province) + '|' + normKey(place.municipality)] || base.muniNoProv['|' + normKey(place.municipality)])
        : (base.brgyRowByKey[movPlaceKey(place)] || base.brgyNoProv['|' + normKey(place.municipality) + '|' + normKey(place.barangay)]);
      if (canonical) { place.province = canonical.province; place.municipality = canonical.municipality; place.barangay = municipal ? '' : canonical.barangay; }
      else if (municipal) place.barangay = '';
      if (!path) { stats.emptyRows++; return; }
      stats.attachmentRows++;
      (pathRows[path] = pathRows[path] || []).push(sourceRow);
      var activityId = movHas(val('Activity_ID')) ? String(val('Activity_ID')).trim() : '';
      var activityOK = !!code && (code === 'APPRAISAL' || MOV_ACTIVITY_IDS[activityId] === code);
      var type = movHas(val('Attachment_Type_ID')) ? String(val('Attachment_Type_ID')).trim() : '';
      var label = normText(val('File Name'));
      var identity = JSON.stringify([path, movPlaceKey(place), code || category, activityId, type, normKey(label)]);
      if (attachmentIndex[identity]) { attachmentIndex[identity].sourceRows.push(sourceRow); return; }
      var filename = path.split('/').pop(); try { filename = decodeURIComponent(filename); } catch (e) {}
      var a = Object.assign({ key: identity, path: path, filename: filename, label: label, typeId: type, activityId: activityId, category: category,
        actCode: code || '', groupKey: movGroupKey(place, code || ''), sourceRows: [sourceRow], dateStart: formatDateVal(val('Date Start')),
        dateEnd: formatDateVal(val('Date End')), tab: normText(val('Display On (Tab)')), mime: normText(val('File Type')),
        locationOK: !!canonical, activityOK: activityOK, supplementary: ['14', '20', '33', '35', '36'].indexOf(type) !== -1 }, place);
      attachments.push(a); attachmentIndex[identity] = a; byAttachmentKey[identity] = a;
      (byGroup[a.groupKey] = byGroup[a.groupKey] || []).push(a);
    });
    stats.distinctPaths = Object.keys(pathRows).length;
    Object.keys(pathRows).forEach(function (p) {
      var rows = pathRows[p];
      if (rows.length > 1) { stats.repeatedPaths++; stats.repeatedOccurrences += rows.length - 1; }
    });
  }
  var byMuni = {};
  groups.forEach(function (g) {
    var source = byGroup[g.key] || [];
    g.requirements.forEach(function (r) {
      // Year 2/3 requirements apply only to barangays the baseline marks Stage 2 Prioritized.
      if (r.conditional && !g.stage2Prio) r.status = 'Not applicable';
      else {
        // Exact: KCIS type ID and label agree. Candidate: a related type ID or a filename match. Both are credited,
        // since there is no reviewer step; candidates are kept apart so the evidence can still be told apart.
        var candidates = [], credit = Object.create(null);
        source.forEach(function (a) {
          if (!a.locationOK) return;
          var exact = a.activityOK && r.types.indexOf(a.typeId) !== -1 && MOV_TYPES[a.typeId] && normAlpha(MOV_TYPES[a.typeId]) === normAlpha(a.label);
          if (exact) { credit[a.path] = a.key; }
          else if (!a.supplementary && (r.types.indexOf(a.typeId) !== -1 || r.candidateTypes.indexOf(a.typeId) !== -1 || movHintMatches(r.hint, a.filename))) candidates.push(a);
        });
        candidates.forEach(function (a) { if (!credit[a.path]) credit[a.path] = a.key; });
        r.submittedPaths = Object.keys(credit); r.attachmentKeys = r.submittedPaths.map(function (p) { return credit[p]; });
        r.candidateKeys = candidates.map(function (a) { return a.key; });
        r.status = r.submittedPaths.length ? 'Submitted' : (imported && g.due ? 'Lacking' : 'Pending activity');
      }
    });
    g.ready = imported && g.requirements.every(function (r) { return r.status === 'Submitted' || r.status === 'Not applicable'; });
    g.submitted = g.requirements.filter(function (r) { return r.status === 'Submitted'; }).length;
    g.required = g.requirements.filter(function (r) { return r.status !== 'Not applicable'; }).length;
    g.lacking = imported && g.due && !g.ready;
    var mk = normKey(g.province) + '|' + normKey(g.municipality);
    if (!byMuni[mk]) byMuni[mk] = { province: g.province, municipality: g.municipality, movsReady: imported, submitted: 0, required: 0, lacking: 0, appraisalReady: false };
    var m = byMuni[mk]; m.submitted += g.submitted; m.required += g.required; if (g.lacking) m.lacking++;
    if (!g.ready) m.movsReady = false;
    if (g.actCode === 'APPRAISAL') m.appraisalReady = g.ready;
  });
  return { imported: imported, trackerImported: !!trackerImported, referenceVersion: MOV_REFERENCE_VERSION, groups: groups, byKey: byKey,
    attachments: attachments, byAttachmentKey: byAttachmentKey, stats: stats, byMuni: byMuni,
    movsReady: imported && Object.keys(byMuni).length > 0 && Object.keys(byMuni).every(function (k) { return byMuni[k].movsReady; }) };
}
