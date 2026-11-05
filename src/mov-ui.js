var MOV_UI = { municipality: '', activity: '', status: '', search: '', view: 'checklist', open: '', requirement: '', candidateSearch: '', limit: 60, sort: 'location', direction: 'asc', reviewer: '', note: null };
var MOV_CACHE = null;

function movGetData() {
  if (STATE.computed && SNAP && SNAP.movs) return SNAP.movs;
  if (MOV_CACHE && MOV_CACHE.table === TABS.Raw_MOVs && MOV_CACHE.baseline === TABS.Baseline && MOV_CACHE.review === MOV_STATE) return MOV_CACHE.data;
  var bl = readBaseline(), base = buildBaseline(bl.rows, bl.monitored), index = buildActivityIndex(readActivities());
  var data = movBuild(base, index, {}, TABS.Raw_MOVs || null, MOV_STATE, prefs().evalDate || today(), false);
  MOV_CACHE = { table: TABS.Raw_MOVs, baseline: TABS.Baseline, review: MOV_STATE, data: data };
  return data;
}
function movInScope(row) { return pScopeTest(isMunicipalUser() ? homeKey() : MOV_UI.municipality)(row); }
function movFilteredGroups(data) {
  var q = normSearch(MOV_UI.search);
  var rows = data.groups.filter(function (g) {
    return movInScope(g) && (!MOV_UI.activity || g.actCode === MOV_UI.activity) &&
      (!q || normSearch([g.province, g.municipality, g.barangay, g.actLabel].join(' ')).indexOf(q) !== -1) &&
      (!MOV_UI.status || g.requirements.some(function (r) { return r.status === MOV_UI.status; }));
  });
  return rows.sort(function (a, b) {
    var left = MOV_UI.sort === 'submission' ? a.submitted / Math.max(1, a.required) : (MOV_UI.sort === 'activity' ? a.actLabel : [a.province, a.municipality, a.barangay, a.actCode].join('|'));
    var right = MOV_UI.sort === 'submission' ? b.submitted / Math.max(1, b.required) : (MOV_UI.sort === 'activity' ? b.actLabel : [b.province, b.municipality, b.barangay, b.actCode].join('|'));
    return (left < right ? -1 : left > right ? 1 : 0) * (MOV_UI.direction === 'desc' ? -1 : 1);
  });
}
function movFilteredAttachments(data) {
  var q = normSearch(MOV_UI.search);
  return data.attachments.filter(function (a) { return movInScope(a) && (!MOV_UI.activity || a.actCode === MOV_UI.activity) &&
    (!q || normSearch([a.province, a.municipality, a.barangay, a.category, a.label, a.filename, a.path].join(' ')).indexOf(q) !== -1); });
}
function movPill(status) { return '<span class="pill ' + (status === 'Submitted' ? 'good' : status === 'Lacking' ? 'bad' : status === 'Not applicable' ? 'idle' : 'warn') + '">' + esc(status) + '</span>'; }
function movOption(value, text, selected) { return '<option value="' + attr(value) + '"' + (selected ? ' selected' : '') + '>' + esc(text) + '</option>'; }
function movRefresh() {
  MOV_CACHE = null;
  if (LOADED.activityTracker) computeAndShow('movs');
  else { renderMovs(); updateTabBadges(); }
  savedSaveCurrent();
}
function movReviewActor() {
  var reviewer = ($('mov-reviewer') && $('mov-reviewer').value.trim()) || '', note = ($('mov-note') && $('mov-note').value.trim()) || '';
  if (!reviewer || !note) { toast('Enter the reviewer and a note before saving a MOV decision.'); return null; }
  return { reviewer: reviewer, note: note, at: new Date().toISOString() };
}
function movCurrentRequirement() {
  var data = movGetData(), g = data.byKey[MOV_UI.open];
  if (!g || !movInScope(g)) return null;
  return g.requirements.filter(function (r) { return r.id === MOV_UI.requirement; })[0] || null;
}
function movApproveAssignment(requirementKey, attachmentKey, actor) {
  var data = movGetData(), requirement;
  data.groups.some(function (g) { return g.requirements.some(function (r) { if (r.key === requirementKey) { requirement = r; return true; } return false; }); });
  var a = data.byAttachmentKey[attachmentKey];
  if (!requirement || !a || !movInScope(requirement) || !movInScope(a) || !a.locationOK ||
      normKey(a.province) !== normKey(requirement.province) || normKey(a.municipality) !== normKey(requirement.municipality)) throw new Error('Choose evidence within the same municipality and your workspace scope.');
  if (!actor || !actor.reviewer || !actor.note) throw new Error('A reviewer and note are required.');
  var record = Object.assign({}, actor, { path: a.path, sourceActivity: a.category, sourceLocation: movPlaceKey(a) });
  (MOV_STATE.assignments[requirementKey] = MOV_STATE.assignments[requirementKey] || {})[attachmentKey] = record;
}
function movSetApplicability(requirementKey, state, actor) {
  var data = movGetData(), requirement;
  data.groups.forEach(function (g) { g.requirements.forEach(function (r) { if (r.key === requirementKey) requirement = r; }); });
  if (!requirement || !requirement.conditional || !movInScope(requirement)) throw new Error('This requirement has no editable applicability in your scope.');
  if (!actor || !actor.reviewer || !actor.note || ['applicable', 'notApplicable', 'unknown'].indexOf(state) === -1) throw new Error('Choose applicability and enter a reviewer and note.');
  if (state === 'unknown') delete MOV_STATE.applicability[requirementKey];
  else MOV_STATE.applicability[requirementKey] = Object.assign({}, actor, { state: state });
}

function movRenderGroup(data, group) {
  var r = group.requirements.filter(function (r) { return r.id === MOV_UI.requirement; })[0];
  var rows = group.requirements.map(function (req) {
    var links = req.attachmentKeys.map(function (key) {
      var a = data.byAttachmentKey[key];
      return '<div class="mov-filename">' + esc(a.filename) + ' <button class="link" data-act="mov-copy" data-key="' + attr(key) + '">Copy path</button></div>';
    }).join('');
    return '<tr><td>' + esc(req.name) + '<div class="tiny">Field Guide · Stage 1 row ' + req.sourceRow + (req.note ? ' · ' + esc(req.note) : '') + '</div></td>' +
      '<td>' + movPill(data.imported ? req.status : 'MOVs not assessed') + '</td><td>' + (links || '<span class="tiny">No credited attachment</span>') + '</td><td>' +
      '<button class="btn ghost btn-sm" data-act="mov-requirement" data-v="' + attr(req.id) + '">Review</button></td></tr>';
  }).join('');
  var editor = '';
  if (r) {
    var q = normSearch(MOV_UI.candidateSearch), candidates = data.attachments.filter(function (a) {
      return a.locationOK && movInScope(a) && normKey(a.province) === normKey(r.province) && normKey(a.municipality) === normKey(r.municipality) &&
        (!q || normSearch([a.filename, a.label, a.category, a.barangay, a.path].join(' ')).indexOf(q) !== -1);
    }).sort(function (a, b) { return Number(r.candidateKeys.indexOf(b.key) !== -1) - Number(r.candidateKeys.indexOf(a.key) !== -1); });
    var options = movOption('', 'Select an attachment…') + candidates.slice(0, 100).map(function (a) {
      return movOption(a.key, (r.candidateKeys.indexOf(a.key) !== -1 ? 'Candidate · ' : '') + a.label + ' · ' + (a.barangay || 'Municipal') + ' · ' + a.category + ' · ' + a.filename);
    }).join('');
    var applicability = MOV_STATE.applicability[r.key];
    var assignments = MOV_STATE.assignments[r.key] || {};
    editor = '<div class="card mov-review"><h3>Review: ' + esc(r.name) + '</h3><p class="muted">Confirm the association against the source document. An approved assignment credits submission, including a reviewed bundled document. Contents and signatures remain unverified.</p>' +
      '<div class="filters"><label class="field"><span>Reviewer</span><input id="mov-reviewer" value="' + attr(MOV_UI.reviewer || prefs().verifier || '') + '"></label><label class="field mov-note"><span>Decision note</span><input id="mov-note" maxlength="1000" value="' + attr(MOV_UI.note === null ? (applicability ? applicability.note : '') : MOV_UI.note) + '" placeholder="Explain the document match or applicability"></label></div>' +
      (r.conditional ? '<div class="filters"><label class="field"><span>Year 2/3 priority applicability</span><select id="mov-applicability">' + movOption('unknown', 'Needs applicability', !applicability) + movOption('applicable', 'Applicable', applicability && applicability.state === 'applicable') + movOption('notApplicable', 'Not applicable', applicability && applicability.state === 'notApplicable') + '</select></label><button class="btn ghost" data-act="mov-applicability-save">Save applicability</button></div>' : '') +
      '<div class="filters"><label class="field mov-note"><span>Find source evidence (' + candidates.length + ' matches; first 100 shown)</span><input id="mov-candidate-search" value="' + attr(MOV_UI.candidateSearch) + '" placeholder="Filename, label, barangay or source activity"></label></div>' +
      '<label class="field"><span>Attachment in this municipality</span><select id="mov-candidate">' + options + '</select></label><button class="btn primary" data-act="mov-approve">Approve assignment</button>' +
      '<div class="tiny">Original filing activity and location are retained. Different filing activities or barangays remain flagged in DQA.</div>' +
      Object.keys(assignments).map(function (key) {
        var assignment = assignments[key], active = !!data.byAttachmentKey[key];
        return '<div class="mov-assignment"><strong>' + esc(assignment.path || key) + '</strong><div>' + esc(assignment.reviewer + ': ' + assignment.note) + '</div><span class="tiny">' + (active ? 'Source record present' : 'Source removed or changed; no credit') + '</span> <button class="link" data-act="mov-revoke" data-key="' + attr(key) + '">Remove assignment</button></div>';
      }).join('') + '</div>';
  }
  var attachments = data.attachments.filter(function (a) { return a.groupKey === group.key; });
  return '<div class="card"><button class="link" data-act="mov-back">← All Stage 1 MOVs</button><h2>' + esc(group.barangay || group.municipality) + ' · ' + esc(group.actLabel) + '</h2>' +
    '<p>' + esc(group.municipality + ', ' + group.province) + ' · ' + group.submitted + '/' + group.required + ' submitted · ' +
    (group.due ? (group.actCode === 'APPRAISAL' ? 'Appraisal follow-up due after MRP end: ' : 'Activity ended: ') + esc(group.dateEnd) : 'Activity end not yet recorded or after pull date') + '</p>' +
    '<div class="table-wrap"><table class="grid"><thead><tr><th>Required MOV</th><th>Submission status</th><th>Credited evidence</th><th>Review</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' + editor +
    '<div class="card"><h3>Source attachments and supplementary files (' + attachments.length + ' distinct associations)</h3>' + movAttachmentTable(attachments.slice(0, MOV_UI.limit)) +
    (attachments.length > MOV_UI.limit ? '<button class="btn ghost" data-act="mov-more">Show more attachments</button>' : '') + '</div>';
}
function movAttachmentTable(rows) {
  return '<div class="table-wrap"><table class="grid"><thead><tr><th>Location / filed activity</th><th>KCIS label / type</th><th>Actual filename</th><th>Source dates</th><th>Source rows</th><th>Path</th></tr></thead><tbody>' + rows.map(function (a) {
    return '<tr><td>' + esc([a.municipality, a.barangay || 'Municipal', a.category || 'Unmapped activity'].join(' · ')) + '</td><td>' + esc(a.label) + '<div class="tiny">ID ' + esc(a.typeId) + ' · ' + esc(a.mime) + (a.supplementary ? ' · Supplementary' : '') + '</div></td><td class="mov-filename">' + esc(a.filename) + '</td><td>' + esc(a.dateStart || '—') + '<br>' + esc(a.dateEnd || '—') + '</td><td>' + a.sourceRows.join(', ') + '</td><td><button class="link" data-act="mov-copy" data-key="' + attr(a.key) + '">Copy path</button></td></tr>';
  }).join('') + '</tbody></table></div>';
}
function renderMovs() {
  var body = $('mov-body'); if (!body) return;
  var data = movGetData(), group = data.byKey[MOV_UI.open];
  if (group && movInScope(group)) {
    body.innerHTML = (typeof renderDqaBreadcrumb === 'function' ? renderDqaBreadcrumb() : '') + movRenderGroup(data, group);
    bindSearch('mov-candidate-search', function (v) { MOV_UI.candidateSearch = v; renderMovs(); }); refreshIcons(body); return;
  }
  MOV_UI.open = '';
  var groups = movFilteredGroups(data), attachments = movFilteredAttachments(data), scoped = data.groups.filter(movInScope);
  var ready = Object.keys(data.byMuni).map(function (k) { return data.byMuni[k]; }).filter(movInScope);
  var option = movOption, munis = option('', 'All municipalities', !MOV_UI.municipality) + baselineMunis().map(function (m) { var k = m.province + '|' + m.municipality; return option(k, m.municipality + ' · ' + m.province, MOV_UI.municipality === k); }).join('');
  var actOptions = option('', 'All Stage 1 activities', !MOV_UI.activity) + Object.keys(MOV_CATALOG).map(function (code) { var g = data.groups.filter(function (g) { return g.actCode === code; })[0]; return option(code, g ? g.actLabel : code, MOV_UI.activity === code); }).join('');
  var statusOptions = option('', 'All statuses', !MOV_UI.status) + ['Submitted', 'Needs review', 'Lacking', 'Pending activity', 'Needs applicability', 'Not applicable'].map(function (s) { return option(s, s, MOV_UI.status === s); }).join('');
  var rows = groups.slice(0, MOV_UI.limit).map(function (g) {
    return '<tr><td>' + esc(g.province + ' · ' + g.municipality) + '<div>' + esc(g.barangay || 'Municipal level') + '</div></td><td>' + esc(g.actLabel) + '</td><td class="num">' + g.submitted + '/' + g.required + '</td><td>' +
      movPill(!data.imported ? 'MOVs not assessed' : g.ready ? 'Submitted' : g.requirements.some(function (r) { return r.status === 'Needs applicability'; }) ? 'Needs applicability' : g.requirements.some(function (r) { return r.status === 'Needs review'; }) ? 'Needs review' : g.lacking ? 'Lacking' : 'Pending activity') + '</td><td>' + esc(g.dateEnd || 'No actual end date') + (g.actCode === 'APPRAISAL' ? '<div class="tiny">MRP follow-up trigger</div>' : '') + '</td><td><button class="link" data-act="mov-open" data-key="' + attr(g.key) + '">Open checklist</button></td></tr>';
  }).join('');
  body.innerHTML = (typeof renderDqaBreadcrumb === 'function' ? renderDqaBreadcrumb() : '') + '<div class="card"><div class="card-head"><div><h2>Stage 1 MOVs</h2><p class="muted">Submission evidence from KCIS. Document contents and signatures are unverified. Later stages are outside this checklist.</p></div><button class="btn ghost" data-act="mov-export">Export CSV</button></div>' +
    (!data.imported ? '<div class="msg warn">Import the KCIS MOV attachments export to assess Stage 1 completion.</div>' : '') +
    (!data.trackerImported ? '<div class="msg warn">Activity Tracker is required for attendance completion and due-date evaluation. Imported attachments can be inspected and saved.</div>' : '') +
    '<div class="grid-kpi"><div class="kpi"><div class="kpi-label">Submitted requirements</div><div class="kpi-value">' + n(scoped.reduce(function (s, g) { return s + g.submitted; }, 0)) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">MOV backlog · due groups</div><div class="kpi-value">' + n(scoped.filter(function (g) { return g.lacking; }).length) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">MOV-ready municipalities</div><div class="kpi-value">' + (data.imported ? ready.filter(function (m) { return m.movsReady; }).length + '/' + ready.length : 'Not assessed') + '</div><div class="tiny">Includes RPMO appraisal requirements</div></div></div>' +
    activityProgressBars({ expected: scoped.filter(function (g) { return g.pipelineApplicable; }).length, encoded: scoped.filter(function (g) { return g.pipelineApplicable && g.trackerEncoded; }).length, complete: scoped.filter(function (g) { return g.pipelineApplicable && g.attendance > 0; }).length, movsReady: scoped.filter(function (g) { return g.pipelineApplicable && g.ready; }).length }, 1) +
    '<p class="tiny">Import: ' + n(data.stats.records) + ' rows · ' + n(data.stats.attachmentRows) + ' attachment rows · ' + n(data.stats.emptyRows) + ' empty attachment rows · ' + n(data.stats.distinctPaths) + ' distinct paths · ' + n(data.stats.repeatedPaths) + ' repeated paths (' + n(data.stats.repeatedOccurrences) + ' extra occurrences).</p>' +
    '<div class="filters">' + (isMunicipalUser() ? '<span>Municipality: ' + esc(homeLabel()) + '</span>' : '<label class="field"><span>Municipality</span><select data-act="mov-municipality">' + munis + '</select></label>') +
    '<label class="field"><span>Activity</span><select data-act="mov-activity">' + actOptions + '</select></label><label class="field"><span>Status</span><select data-act="mov-status">' + statusOptions + '</select></label>' +
    '<label class="field"><span>View</span><select data-act="mov-view">' + option('checklist', 'Required MOVs', MOV_UI.view === 'checklist') + option('attachments', 'Source attachments', MOV_UI.view === 'attachments') + '</select></label>' +
    '<label class="field"><span>Sort</span><select data-act="mov-sort">' + option('location', 'Location', MOV_UI.sort === 'location') + option('activity', 'Activity', MOV_UI.sort === 'activity') + option('submission', 'Submission rate', MOV_UI.sort === 'submission') + '</select></label>' +
    '<button class="btn ghost" data-act="mov-direction">' + (MOV_UI.direction === 'asc' ? 'Ascending' : 'Descending') + '</button><label class="field"><span>Search</span><input id="mov-search" value="' + attr(MOV_UI.search) + '" placeholder="Location, activity or filename"></label></div>' +
    (MOV_UI.view === 'attachments' ? movAttachmentTable(attachments.slice(0, MOV_UI.limit)) : '<div class="table-wrap"><table class="grid"><thead><tr><th>Location</th><th>Activity</th><th>Submitted</th><th>Status</th><th>Actual end / follow-up</th><th>Checklist</th></tr></thead><tbody>' + rows + '</tbody></table></div>') +
    ((MOV_UI.view === 'attachments' ? attachments.length : groups.length) > MOV_UI.limit ? '<button class="btn ghost" data-act="mov-more">Show more</button>' : '') + '</div>';
  bindSearch('mov-search', function (v) { MOV_UI.search = v; MOV_UI.limit = 60; renderMovs(); }); refreshIcons(body);
}

function movExportRows(data, scope) {
  var rows = [['Province', 'Municipality', 'Barangay', 'Activity', 'Required MOV', 'Status', 'Due', 'Actual end / MRP follow-up', 'Credited paths', 'Reference row', 'Applicability note', 'Reviewer', 'Assignment reviews']];
  data.groups.filter(scope).forEach(function (g) { g.requirements.forEach(function (r) { var decision = MOV_STATE.applicability[r.key];
    var reviews = MOV_STATE.assignments[r.key] || {};
    var notes = Object.keys(reviews).map(function (key) { var v = reviews[key]; return [v.path || key, v.reviewer, v.at || '', v.note, data.byAttachmentKey[key] ? 'Source present' : 'Source removed or changed; no credit'].join(' | '); }).join('\n');
    rows.push([g.province, g.municipality, g.barangay, g.actLabel, r.name, data.imported ? r.status : 'MOVs not assessed', g.due ? 'Yes' : 'No', g.dateEnd || '', r.submittedPaths.join('\n'), r.sourceRow, decision ? decision.note : '', decision ? decision.reviewer : '', notes]);
  }); }); return rows;
}
function movAttachmentExportRows(data, scope) {
  return [['Province', 'Municipality', 'Barangay', 'Filed activity', 'Activity ID', 'Attachment type ID', 'KCIS label', 'Actual filename', 'File type', 'Source start', 'Source end', 'File path', 'Source rows']].concat(data.attachments.filter(scope).map(function (a) {
    return [a.province, a.municipality, a.barangay, a.category, a.activityId, a.typeId, a.label, a.filename, a.mime, a.dateStart, a.dateEnd, a.path, a.sourceRows.join('; ')];
  }));
}
function movCompletionNotice() {
  if (!SNAP || !SNAP.movs || STATE.stage !== 1) return '';
  var data = SNAP.movs, groups = data.groups.filter(inOverviewScope);
  var municipalities = Object.keys(data.byMuni).map(function (k) { return data.byMuni[k]; }).filter(inOverviewScope);
  return '<div class="msg info"><div><strong>Attendance and MOV submission are assessed separately.</strong> ' +
    (data.imported ? 'MOV-ready municipalities: ' + municipalities.filter(function (m) { return m.movsReady; }).length + '/' + municipalities.length +
      ' (including appraisal). MOV backlog: ' + groups.filter(function (g) { return g.lacking; }).length + ' due checklist groups.' : 'MOVs not assessed. Attendance completion remains available.') +
    ' <button class="link" data-act="go" data-v="movs">Open Stage 1 MOVs</button></div></div>';
}

document.addEventListener('click', function (event) {
  var el = event.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT') return;
  var act = el.getAttribute('data-act'), key = el.getAttribute('data-key');
  try {
    if (act === 'mov-open') { MOV_UI.open = key; MOV_UI.requirement = ''; MOV_UI.candidateSearch = ''; renderMovs(); }
    else if (act === 'mov-back') { MOV_UI.open = ''; MOV_UI.requirement = ''; renderMovs(); }
    else if (act === 'mov-requirement') { MOV_UI.requirement = el.getAttribute('data-v'); MOV_UI.candidateSearch = ''; MOV_UI.note = null; renderMovs(); }
    else if (act === 'mov-more') { MOV_UI.limit += 60; renderMovs(); }
    else if (act === 'mov-direction') { MOV_UI.direction = MOV_UI.direction === 'asc' ? 'desc' : 'asc'; renderMovs(); }
    else if (act === 'mov-copy') { var a = movGetData().byAttachmentKey[key]; if (a && movInScope(a)) { navigator.clipboard.writeText(a.path).then(function () { toast('KCIS path copied.'); }).catch(function () { toast(a.path); }); } }
    else if (act === 'mov-export') { var data = movGetData(); downloadCsv('PCRP_Stage1_MOVs_' + stamp() + '.csv', csvOf(MOV_UI.view === 'attachments' ? movAttachmentExportRows(data, movInScope) : movExportRows(data, movInScope))); }
    else if (act === 'mov-approve' || act === 'mov-applicability-save') {
      var actor = movReviewActor(), r = movCurrentRequirement(); if (!actor || !r) return;
      if (act === 'mov-approve') movApproveAssignment(r.key, $('mov-candidate').value, actor);
      else movSetApplicability(r.key, $('mov-applicability').value, actor);
      var p = prefs(); p.verifier = actor.reviewer; savePrefs(p); movRefresh();
    } else if (act === 'mov-revoke') { var r = movCurrentRequirement(); if (r && MOV_STATE.assignments[r.key]) { delete MOV_STATE.assignments[r.key][key]; movRefresh(); } }
  } catch (error) { toast(error.message); }
});
document.addEventListener('change', function (event) {
  var act = event.target.getAttribute('data-act'), value = event.target.value;
  var fields = { 'mov-municipality': 'municipality', 'mov-activity': 'activity', 'mov-status': 'status', 'mov-view': 'view', 'mov-sort': 'sort' };
  if (fields[act]) { MOV_UI[fields[act]] = value; MOV_UI.limit = 60; renderMovs(); }
});
document.addEventListener('input', function (event) {
  if (event.target.id === 'mov-reviewer') MOV_UI.reviewer = event.target.value;
  if (event.target.id === 'mov-note') MOV_UI.note = event.target.value;
});

// Keep completion rules visible when existing filters render a page directly.
['renderOverview', 'renderMunis', 'renderBrgys', 'renderKpiSummary'].forEach(function (name) {
  var original = window[name]; if (typeof original !== 'function') return;
  window[name] = function () {
    var result = original.apply(this, arguments);
    var pageIds = { renderOverview: 'ov-body', renderMunis: 'mu-body', renderBrgys: 'bg-body', renderKpiSummary: 'kpi-body' };
    var body = $(pageIds[name]);
    if (body) {
      var old = body.querySelector('.mov-completion-notice'); if (old) old.remove();
      var notice = movCompletionNotice();
      if (notice) body.insertAdjacentHTML('afterbegin', '<div class="mov-completion-notice">' + notice + '</div>');
    }
    return result;
  };
});
