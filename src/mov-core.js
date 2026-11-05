// Stage 1 only. Reference: Field Guide, Stage 1!D4:I38. Presence is not content verification.
var MOV_REFERENCE_VERSION = 'stage1-field-guide-2026-11-04';
var MOV_STATE = { referenceVersion: MOV_REFERENCE_VERSION, assignments: {}, applicability: {} };
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
function validateMovState(state) {
  if (!state || state.referenceVersion !== MOV_REFERENCE_VERSION || !state.assignments || !state.applicability ||
      typeof state.assignments !== 'object' || Array.isArray(state.assignments) || typeof state.applicability !== 'object' || Array.isArray(state.applicability)) throw new Error('Invalid or unsupported MOV review data.');
  Object.keys(state.assignments).forEach(function (k) {
    var assignments = state.assignments[k];
    if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) throw new Error('Invalid MOV assignment.');
    Object.keys(assignments).forEach(function (a) { var v = assignments[a]; if (!v || typeof v.note !== 'string' || !v.note.trim() || typeof v.reviewer !== 'string' || !v.reviewer.trim()) throw new Error('MOV assignments require a reviewer and note.'); });
  });
  Object.keys(state.applicability).forEach(function (k) { var v = state.applicability[k]; if (!v || ['applicable', 'notApplicable'].indexOf(v.state) === -1 || !v.note || !v.reviewer) throw new Error('Invalid MOV applicability decision.'); });
}

function movBuild(base, index, rec, table, review, evalDate, trackerImported) {
  review = review || { assignments: {}, applicability: {} };
  var imported = !!table, groups = [], byKey = {}, attachments = [], byAttachmentKey = {}, findings = [], findingIndex = {};
  var stats = { records: table ? table.rows.length : 0, attachmentRows: 0, emptyRows: 0, distinctPaths: 0, repeatedPaths: 0, repeatedOccurrences: 0 };
  function issue(kind, place, code, text, rows, paths, requirement) {
    var k = [kind, movPlaceKey(place), code || '', requirement || '', text].join('|');
    var f = findingIndex[k];
    if (!f) { f = findingIndex[k] = { kind: kind, actCode: code || '', issue: text, sourceRows: [], paths: [], requirementId: requirement || '', groupKey: movGroupKey(place, code || ''), province: place.province, municipality: place.municipality, barangay: place.barangay || '' }; findings.push(f); }
    (rows || []).forEach(function (r) { if (f.sourceRows.indexOf(r) === -1) f.sourceRows.push(r); });
    (paths || []).forEach(function (p) { if (f.paths.indexOf(p) === -1) f.paths.push(p); });
  }
  function makeGroup(place, code, pipelineApplicable) {
    var key = movGroupKey(place, code), slotCode = code === 'APPRAISAL' ? 'MRP' : code;
    var slot = rec[movGroupKey(place, slotCode)], end = slot ? slot.dateEnd : null;
    var due = !!trackerImported && trackerIsDate(end) && end <= evalDate;
    var group = Object.assign({ key: key, actCode: code, actLabel: code === 'APPRAISAL' ? 'RPMO Appraisal of Municipal Resilience Plan' : index.byCode[code].label,
      trackerEncoded: !!(slot && slot.rows > 0) && code !== 'APPRAISAL', pipelineApplicable: pipelineApplicable, due: due, dateEnd: end, attendance: slot && code !== 'APPRAISAL' ? slot.att : 0, requirements: [], ready: false }, place);
    group.requirements = MOV_CATALOG[code].map(function (def) { return Object.assign({ key: key + '|' + def.id, groupKey: key, actCode: code,
      status: 'Pending activity', submittedPaths: [], attachmentKeys: [], candidateKeys: [], due: due, assessed: imported }, def, place); });
    groups.push(group); byKey[key] = group;
  }
  base.muniList.forEach(function (m) { ['MREST', 'MRP', 'APPRAISAL'].forEach(function (code) { if (code === 'APPRAISAL' || index.byCode[code]) makeGroup({ province: m.province, municipality: m.municipality, barangay: '' }, code, code !== 'APPRAISAL'); }); });
  base.rows.forEach(function (b) {
    ['BA1', 'PROFILE', 'WALK', 'MAP', 'FGD', 'BPRVA', 'BDC'].forEach(function (code) {
      if (index.byCode[code]) makeGroup({ province: b.province, municipality: b.municipality, barangay: b.barangay }, code, !index.byCode[code].prioOnly || b.stage2Prio);
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
      var isStage1 = !!MOV_CATALOG[code], municipal = code === 'APPRAISAL' || (index.byCode[code] && index.byCode[code].level === 'Municipal');
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
      if (attachmentIndex[identity]) {
        var existing = attachmentIndex[identity]; existing.sourceRows.push(sourceRow);
        if (formatDateVal(val('Date Start')) !== existing.dateStart || formatDateVal(val('Date End')) !== existing.dateEnd) issue('dates', place, code, 'Repeated file path carries different attachment dates', [sourceRow], [path]);
        return;
      }
      var filename = path.split('/').pop(); try { filename = decodeURIComponent(filename); } catch (e) {}
      var a = Object.assign({ key: identity, path: path, filename: filename, label: label, typeId: type, activityId: activityId, category: category,
        actCode: code || '', groupKey: movGroupKey(place, code || ''), sourceRows: [sourceRow], dateStart: formatDateVal(val('Date Start')),
        dateEnd: formatDateVal(val('Date End')), tab: normText(val('Display On (Tab)')), mime: normText(val('File Type')),
        locationOK: !!canonical, activityOK: activityOK, supplementary: ['14', '20', '33', '35', '36'].indexOf(type) !== -1 }, place);
      attachments.push(a); attachmentIndex[identity] = a; byAttachmentKey[identity] = a;
      (byGroup[a.groupKey] = byGroup[a.groupKey] || []).push(a);
      if (!canonical) issue('unmapped', place, code, 'Attachment location is not in the monitored baseline', [sourceRow], [path]);
      if (!code) issue('unmapped', place, '', 'Attachment activity is unrecognized or missing', [sourceRow], [path]);
      else if (isStage1 && !activityOK) issue('conflict', place, code, 'Activity_ID does not agree with Activity_Category', [sourceRow], [path]);
      if (!isStage1) return;
      if (MOV_TYPES[type] && normAlpha(MOV_TYPES[type]) !== normAlpha(label)) issue('conflict', place, code, 'Attachment type ID and document label disagree', [sourceRow], [path]);
      var trackerSlot = rec[a.groupKey];
      if (trackerImported && canonical && !trackerSlot && code !== 'APPRAISAL') issue('unmapped', place, code, 'MOV activity has no Activity Tracker record', [sourceRow], [path]);
      if (trackerSlot) {
        var pairs = trackerSlot.sourceRows || [];
        var agrees = pairs.some(function (s) { return a.dateStart && a.dateEnd && s.actualStart === a.dateStart && s.actualEnd === a.dateEnd; });
        if (!agrees) issue('dates', place, code, 'Attachment dates differ from or are missing against Tracker actual dates; clear MOV matches remain credited', [sourceRow], [path]);
      }
    });
    stats.distinctPaths = Object.keys(pathRows).length;
    Object.keys(pathRows).forEach(function (p) {
      var rows = pathRows[p];
      if (rows.length > 1) {
        stats.repeatedPaths++; stats.repeatedOccurrences += rows.length - 1;
        attachments.filter(function (a) { return a.path === p && MOV_CATALOG[a.actCode]; }).forEach(function (a) {
          issue('repeated', a, a.actCode, 'Repeated file path: counted once per requirement', a.sourceRows, [p]);
        });
      }
    });
  }
  var byMuni = {};
  groups.forEach(function (g) {
    var source = byGroup[g.key] || [];
    g.requirements.forEach(function (r) {
      var decision = review.applicability[r.key];
      if (r.conditional && !decision) r.status = 'Needs applicability';
      else if (r.conditional && decision.state === 'notApplicable') r.status = 'Not applicable';
      else {
        var candidates = [], credit = Object.create(null);
        source.forEach(function (a) {
          var exact = a.locationOK && a.activityOK && r.types.indexOf(a.typeId) !== -1 && MOV_TYPES[a.typeId] && normAlpha(MOV_TYPES[a.typeId]) === normAlpha(a.label);
          if (exact) { credit[a.path] = a.key; }
          else if (!a.supplementary && (r.types.indexOf(a.typeId) !== -1 || r.candidateTypes.indexOf(a.typeId) !== -1 || movHintMatches(r.hint, a.filename))) candidates.push(a.key);
        });
        Object.keys(review.assignments[r.key] || {}).forEach(function (key) {
          var a = byAttachmentKey[key], approval = review.assignments[r.key][key];
          if (!a || !a.locationOK || !approval.note || !approval.reviewer || normKey(a.province) !== normKey(r.province) || normKey(a.municipality) !== normKey(r.municipality)) return;
          credit[a.path] = a.key;
          if (a.actCode !== r.actCode || normKey(a.barangay) !== normKey(r.barangay)) issue('reassigned', r, r.actCode, 'Reviewed evidence is filed under a different activity or barangay: ' + a.category + ' / ' + (a.barangay || 'Municipal level'), a.sourceRows, [a.path], r.id);
        });
        r.submittedPaths = Object.keys(credit); r.attachmentKeys = r.submittedPaths.map(function (p) { return credit[p]; }); r.candidateKeys = candidates;
        r.status = r.submittedPaths.length ? 'Submitted' : (candidates.length ? 'Needs review' : (imported && g.due ? 'Lacking' : 'Pending activity'));
      }
      if (imported && r.status === 'Needs applicability') issue('applicability', r, r.actCode, r.name + ': applicability requires a reviewer decision', [], [], r.id);
      if (imported && r.status === 'Needs review') issue('review', r, r.actCode, r.name + ': uncertain attachments need assignment review', [], [], r.id);
      if (imported && g.due && r.status !== 'Submitted' && r.status !== 'Not applicable' && r.status !== 'Needs applicability') issue('lacking', r, r.actCode, r.name + ': required MOV not submitted', [], [], r.id);
    });
    g.ready = imported && g.requirements.every(function (r) { return r.status === 'Submitted' || r.status === 'Not applicable'; });
    g.submitted = g.requirements.filter(function (r) { return r.status === 'Submitted'; }).length;
    g.required = g.requirements.filter(function (r) { return r.status !== 'Not applicable'; }).length;
    g.lacking = imported && g.due && !g.ready;
    var mk = normKey(g.province) + '|' + normKey(g.municipality);
    if (!byMuni[mk]) byMuni[mk] = { province: g.province, municipality: g.municipality, movsReady: imported, submitted: 0, required: 0, lacking: 0, unresolved: 0, appraisalReady: false };
    var m = byMuni[mk]; m.submitted += g.submitted; m.required += g.required; if (g.lacking) m.lacking++;
    m.unresolved += g.requirements.filter(function (r) { return r.status === 'Needs applicability'; }).length;
    if (!g.ready) m.movsReady = false;
    if (g.actCode === 'APPRAISAL') m.appraisalReady = g.ready;
  });
  return { imported: imported, trackerImported: !!trackerImported, referenceVersion: MOV_REFERENCE_VERSION, groups: groups, byKey: byKey,
    attachments: attachments, byAttachmentKey: byAttachmentKey, findings: findings, stats: stats, byMuni: byMuni,
    movsReady: imported && Object.keys(byMuni).length > 0 && Object.keys(byMuni).every(function (k) { return byMuni[k].movsReady; }) };
}

function movDqaChecks(o, col, muni, province, place, activity, one) {
  var data = o.health && o.health.movs;
  if (!data || !data.imported) return [];
  var titles = { lacking: 'Required MOVs lacking after activity end', applicability: 'MOV applicability unresolved', review: 'MOV assignments need review',
    repeated: 'Repeated MOV file paths', unmapped: 'Unmapped MOV records', conflict: 'MOV activity or document type conflicts', dates: 'MOV date discrepancies', reassigned: 'MOVs filed under another activity or barangay' };
  return Object.keys(titles).map(function (kind) {
    var rows = data.findings.filter(function (f) { return f.kind === kind; });
    return { id: 'mov_' + kind, dim: kind === 'lacking' ? 'completeness' : (kind === 'repeated' ? 'integrity' : 'accuracy'), name: titles[kind], icon: 'files', severity: 'verify',
      unit: ['finding', 'findings'], total: rows.length, meaning: 'Stage 1 MOV submission records; document contents and signatures are unverified.',
      why: 'Check the imported attachment metadata against the Stage 1 requirements and source documents.',
      steps: ['Open the Stage 1 MOV checklist and review the source rows.', 'Resolve assignment or applicability with a note, or correct KCIS and reimport.'],
      rows: function () { return rows; }, places: one,
      cols: [muni, province, place, activity, col('Finding', function (r) { return dhFindingLink('mov_' + kind, r, r.issue, 1, 'Open Stage 1 MOVs', { requirement: r.requirementId, path: r.paths[0] || '' }); }, function (r) { return r.issue; }),
        col('Source rows', function (r) { return esc(r.sourceRows.join(', ')); }, function (r) { return r.sourceRows.join('; '); })],
      text: function (r) { return [r.province, r.municipality, r.barangay, r.actCode, r.issue, r.sourceRows.join(' ')]; }, detail: function (r) { return r.issue + (r.sourceRows.length ? ' (rows ' + r.sourceRows.join(', ') + ')' : ''); } };
  });
}
