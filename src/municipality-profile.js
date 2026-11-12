// Municipality monitoring is a view over the existing Tracker and MOV results.
var PROFILE_CACHE = null;
var PROFILE_STATE = { municipality: '', barangay: '', stage: 1, activity: '', view: 'status', home: 'sequence', filters: {}, panel: null, returnLink: false };
var PROFILE_RESTORED = false;
var PROFILE_PANEL_FOCUS = '';
var PROFILE_ENTERING = false;
var PROFILE_SCROLL = Object.create(null);

function profileKey(p) { return [p.province, p.municipality, p.barangay || ''].map(normKey).join('|'); }
function profileAllowed(key) { return !isMunicipalUser() || (!!homeKey() && key === homeKey()); }
function profileIndex() {
  var mov = movGetData(), snap = STATE.computed && SNAP ? SNAP : null;
  if (PROFILE_CACHE && PROFILE_CACHE.snap === snap && PROFILE_CACHE.mov === mov && PROFILE_CACHE.baseline === TABS.Baseline && PROFILE_CACHE.activities === TABS.Activities) return PROFILE_CACHE;
  var bl = readBaseline(), base = buildBaseline(bl.rows, bl.monitored);
  var result = { snap: snap, mov: mov, baseline: TABS.Baseline, activities: TABS.Activities, base: base,
    acts: readActivities().slice().sort(function (a, b) { return Number(a.seq) - Number(b.seq); }),
    attendance: Object.create(null), barangays: Object.create(null), municipalities: Object.create(null), models: Object.create(null) };
  (snap ? snap.attendanceRows || [] : []).forEach(function (r) { result.attendance[profileKey(r) + '|' + r.actCode] = r; });
  (snap ? snap.barangayRows : []).forEach(function (r) { result.barangays[profileKey(r)] = r; });
  (snap ? snap.municipalRows : []).forEach(function (r) { result.municipalities[r.province + '|' + r.municipality] = r; });
  PROFILE_CACHE = result;
  return result;
}
function profileTally(rows) {
  return rows.reduce(function (t, r) {
    if (!r.expected) return t;
    t.expected++; if (r.encoded) t.encoded++; if (r.withAttendees) t.complete++;
    if (r.group && r.group.ready) t.movsReady++;
    // MOV forms: each required form counts as it is uploaded, so partial submission shows in the progress.
    if (r.group) { t.movSubmitted += r.group.submitted; t.movRequired += r.group.required; }
    if (r.attendanceBacklog) t.backlog++;
    if (r.group && r.group.lacking) t.movBacklog++;
    return t;
  }, { expected: 0, encoded: 0, complete: 0, movsReady: 0, movSubmitted: 0, movRequired: 0, backlog: 0, movBacklog: 0 });
}
function profileModel(key) {
  if (!profileAllowed(key)) return null;
  var ix = profileIndex(), muni = ix.base.muniList.filter(function (m) { return m.province + '|' + m.municipality === key; })[0];
  if (!muni) return null;
  if (ix.models[key]) return ix.models[key];
  var places = ix.base.rows.filter(function (b) { return b.province === muni.province && b.municipality === muni.municipality; });
  var model = { key: key, municipality: muni.municipality, province: muni.province, batch: muni.batch || '', focalArea: muni.focalArea || '',
    barangays: places, trackerImported: !!LOADED.activityTracker, movImported: ix.mov.imported, activities: [], byCode: {}, rows: Object.create(null), mov: ix.mov };
  function activity(a) {
    var municipal = a.level === 'Municipal', appraisal = a.code === 'APPRAISAL';
    var rows = (municipal ? [{ province: muni.province, municipality: muni.municipality, barangay: '' }] : places).map(function (p) {
      var id = profileKey(p) + '|' + a.code;
      var owner = municipal ? ix.municipalities[key] : ix.barangays[profileKey(p)];
      var slot = owner && owner.activities[a.code], attendance = ix.attendance[id] || null, group = ix.mov.byKey[id] || null;
      var expected = !appraisal && (!a.prioOnly || p.stage2Prio === true);
      var row = { key: id, place: p, name: p.barangay || muni.municipality, code: a.code, expected: expected, appraisal: appraisal,
        encoded: !!attendance, withAttendees: !!(attendance && attendance.participants.total > 0), attendance: attendance,
        attendanceBacklog: !!(expected && slot && slot.attendanceBacklog), group: group,
        hh: a.households && !municipal ? profileHousehold(slot) : null };
      model.rows[id] = row; return row;
    });
    var item = { code: a.code, seq: a.seq, label: a.label, stage: a.stage || 1, level: a.level, appraisal: appraisal, households: !!a.households && !municipal, rows: rows, tally: profileTally(rows),
      requirements: MOV_CATALOG[a.code] || [] };
    model.activities.push(item); model.byCode[a.code] = item;
  }
  ix.acts.forEach(activity);
  activity({ code: 'APPRAISAL', label: 'RPMO appraisal', level: 'Municipal', stage: 1, seq: '' });
  ix.models[key] = model; return model;
}
function profileDefaults() { return { search: '', encoding: '', attendance: '', mov: '', scope: '', backlog: '', quorum: '', sort: 'name' }; }
// Household quorum for one assembly in one barangay, as the monitor computes it (present ÷ listed, met at 70%).
var PROFILE_QUORUM = 0.7;
var PROFILE_QUORUM_LABEL = { met: 'Met (≥70%)', below: 'Below 70%', incomplete: 'Counts incomplete', noreport: 'No household counts' };
function profileHousehold(slot) {
  if (!slot) return { status: 'noreport', listed: 0, present: 0, rate: null };
  var listed = slot.hhListed || 0;
  return { listed: listed, present: slot.hhPresent || 0, rate: listed ? slot.hhRate : null, total: slot.hhTotal, represented: slot.hhRepresented, conflict: !!slot.hhConflict, detail: slot.hhDetail || null,
    status: listed > 0 ? (slot.hhRate >= PROFILE_QUORUM ? 'met' : 'below') : slot.hhIncomplete ? 'incomplete' : 'noreport' };
}
function profileFilters() {
  var code = PROFILE_STATE.activity || 'overview';
  return PROFILE_STATE.filters[code] || (PROFILE_STATE.filters[code] = profileDefaults());
}
function profileFilterRows(model, activity, filters) {
  var f = Object.assign(profileDefaults(), filters || {}), q = normSearch(f.search);
  return activity.rows.filter(function (r) {
    if (q && normSearch(r.name).indexOf(q) === -1) return false;
    if (f.backlog && !r.attendanceBacklog) return false;
    if (f.quorum && (!r.hh || !model.trackerImported || (f.quorum === 'missing' ? r.hh.status !== 'noreport' && r.hh.status !== 'incomplete' : r.hh.status !== f.quorum))) return false;
    if (f.scope === 'expected' && !r.expected || f.scope === 'additional' && r.expected) return false;
    if (f.encoding && (!model.trackerImported || (f.encoding === 'encoded' ? !r.encoded : r.encoded))) return false;
    if (f.attendance && (!model.trackerImported || (f.attendance === 'positive' ? !r.withAttendees : r.withAttendees))) return false;
    if (f.mov === 'unassessed' && model.movImported) return false;
    if (f.mov && f.mov !== 'unassessed') {
      if (!model.movImported || !r.group) return false;
      if (f.mov === 'ready' && !r.group.ready || f.mov === 'incomplete' && r.group.ready || f.mov === 'due' && !r.group.lacking) return false;
    }
    return true;
  }).sort(function (a, b) {
    if (f.sort === 'attendance') return ((b.attendance ? b.attendance.participants.total : 0) - (a.attendance ? a.attendance.participants.total : 0)) || a.name.localeCompare(b.name);
    if (f.sort === 'quorum') return ((a.hh && a.hh.rate !== null ? a.hh.rate : 2) - (b.hh && b.hh.rate !== null ? b.hh.rate : 2)) || a.name.localeCompare(b.name);
    if (f.sort === 'mov') return ((a.group ? a.group.submitted / Math.max(1, a.group.required) : 0) - (b.group ? b.group.submitted / Math.max(1, b.group.required) : 0)) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}
function profileRequirementStatus(model, r, id) {
  if (!model.movImported) return 'Not assessed';
  var req = r.group && r.group.requirements.filter(function (q) { return q.id === id; })[0];
  return req ? req.status : 'Not configured';
}
function profileEncodingLabel(model, r) { return !model.trackerImported ? 'Not assessed' : r.encoded ? 'Encoded' : 'Not encoded'; }
function profileAttendanceLabel(model, r) { return !model.trackerImported ? 'Not assessed' : r.withAttendees ? 'With attendees' : r.encoded ? 'Attendance not encoded' : 'Not encoded'; }
function profileMovLabel(model, r) {
  if (!r.group) return 'Not configured for this stage';
  if (!model.movImported) return 'Not assessed';
  return r.group.ready ? 'MOVs ready' : r.group.submitted + '/' + r.group.required + ' submitted';
}
function profileExportRows(model, activity, filters, view) {
  if (!model || !profileAllowed(model.key)) return [];
  var rows = profileFilterRows(model, activity, filters);
  var head = ['Province', 'Municipality', 'Barangay', 'Activity', 'Expected activity', 'Encoding', 'Attendance status', 'Participants', 'MOV status', 'MOVs submitted', 'MOVs required', 'Actual Start', 'Actual End', 'Attendance backlog', 'MOV backlog'];
  if (activity.households) head = head.concat(['Households represented', 'Households listed', 'Household quorum', 'Quorum status']);
  if (view === 'checklist') head = head.concat(activity.requirements.map(function (r) { return r.name; }));
  return [head].concat(rows.map(function (r) {
    var att = r.attendance;
    var values = [model.province, model.municipality, r.place.barangay || '', activity.label, r.expected ? 'Yes' : 'No',
      r.appraisal ? 'Not an attendance activity' : profileEncodingLabel(model, r), r.appraisal ? 'Not an attendance activity' : profileAttendanceLabel(model, r),
      model.trackerImported && !r.appraisal ? (att ? att.participants.total : 0) : 'Not assessed', profileMovLabel(model, r), model.movImported && r.group ? r.group.submitted : 'Not assessed', model.movImported && r.group ? r.group.required : 'Not assessed', att ? att.dateStart : '', att ? att.dateEnd : '',
      model.trackerImported ? (r.attendanceBacklog ? 'Yes' : 'No') : 'Not assessed', model.trackerImported && model.movImported ? (r.group && r.group.lacking ? 'Yes' : 'No') : 'Not assessed'];
    if (activity.households) values = values.concat(model.trackerImported ? [r.hh.listed ? r.hh.present : '', r.hh.listed || '', r.hh.rate === null ? '' : pctText(r.hh.rate), PROFILE_QUORUM_LABEL[r.hh.status]] : ['', '', '', 'Not assessed']);
    return view === 'checklist' ? values.concat(activity.requirements.map(function (req) { return profileRequirementStatus(model, r, req.id); })) : values;
  }));
}
function profileRestore() {
  if (PROFILE_RESTORED) return;
  PROFILE_RESTORED = true;
  var saved = prefs().municipalityProfile;
  if (saved && typeof saved === 'object') {
    PROFILE_STATE.home = saved.home === 'movmap' || saved.home === 'cvmap' ? saved.home : 'sequence';
    ['municipality', 'barangay', 'activity', 'view'].forEach(function (k) { if (typeof saved[k] === 'string') PROFILE_STATE[k] = saved[k]; });
    PROFILE_STATE.stage = STATE.stage === 2 ? 2 : 1;   // the header's global stage switch wins
    if (saved.filters && typeof saved.filters === 'object' && !Array.isArray(saved.filters)) Object.keys(saved.filters).forEach(function (code) {
      if (code === '__cv') {
        var cv = saved.filters[code] || {};
        PROFILE_STATE.filters.__cv = { search: typeof cv.search === 'string' ? cv.search.slice(0, 200) : '', show: typeof cv.show === 'string' ? cv.show : '', sort: cv.sort === 'least' ? 'least' : 'name' };
        return;
      }
      if (code === '__map') {
        var map = saved.filters[code] || {};
        PROFILE_STATE.filters.__map = { search: typeof map.search === 'string' ? map.search.slice(0, 200) : '', show: typeof map.show === 'string' && map.show !== 'review' ? map.show : '', sort: map.sort === 'ready' ? 'ready' : 'name' };
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(MOV_CATALOG, code) && !DEFAULT_ACTIVITIES.some(function (a) { return a.code === code; })) return;
      var f = saved.filters[code]; if (!f || typeof f !== 'object') return;
      PROFILE_STATE.filters[code] = profileDefaults();
      Object.keys(profileDefaults()).forEach(function (k) { if (typeof f[k] === 'string') PROFILE_STATE.filters[code][k] = f[k].slice(0, 200); });
      if (PROFILE_STATE.filters[code].mov === 'review') PROFILE_STATE.filters[code].mov = '';   // the MOV review filter was removed
    });
    if (saved.panel && typeof saved.panel.row === 'string') PROFILE_STATE.panel = { row: saved.panel.row, requirement: typeof saved.panel.requirement === 'string' ? saved.panel.requirement : '', kind: saved.panel.kind === 'movs' ? 'movs' : 'attendance' };
  }
}
function profilePersist() {
  var p = prefs();
  p.stage = PROFILE_STATE.stage === 2 ? 2 : 1;   // the global stage follows a deep link into the other stage
  p.municipalityProfile = { municipality: PROFILE_STATE.municipality, barangay: PROFILE_STATE.barangay, stage: PROFILE_STATE.stage, activity: PROFILE_STATE.activity, view: PROFILE_STATE.view, home: PROFILE_STATE.home, filters: PROFILE_STATE.filters, panel: PROFILE_STATE.panel };
  savePrefs(p);
}
function profileValidate() {
  profileRestore();
  if (isMunicipalUser()) PROFILE_STATE.municipality = homeKey();
  var model = profileModel(PROFILE_STATE.municipality);
  // RPMO without a valid selection sees the municipality directory.
  if (!model && !isMunicipalUser()) PROFILE_STATE.municipality = '';
  PROFILE_STATE.stage = PROFILE_STATE.stage === 2 ? 2 : 1;
  STATE.stage = PROFILE_STATE.stage;
  var act = model && model.byCode[PROFILE_STATE.activity];
  if (PROFILE_STATE.activity && (!act || act.stage !== PROFILE_STATE.stage)) { PROFILE_STATE.activity = ''; PROFILE_STATE.panel = null; }
  if (PROFILE_STATE.barangay && !(model && profileBarangayPlace(model, PROFILE_STATE.barangay))) PROFILE_STATE.barangay = '';
  if (PROFILE_STATE.view !== 'checklist') PROFILE_STATE.view = 'status';
  if (PROFILE_STATE.home !== 'movmap' && PROFILE_STATE.home !== 'cvmap') PROFILE_STATE.home = 'sequence';
  if (PROFILE_STATE.panel && !profilePanelAllowed(model, PROFILE_STATE.panel.row)) PROFILE_STATE.panel = null;
  return model;
}
// The evidence drawer belongs to the selected activity, the open barangay profile, or any activity of the municipality-wide MOV map.
function profilePanelAllowed(model, rowKey) {
  var row = model && model.rows[rowKey];
  if (row && PROFILE_STATE.barangay) return row.key.indexOf(PROFILE_STATE.barangay + '|') === 0 && model.byCode[row.code].stage === PROFILE_STATE.stage;
  return !!row && (row.code === PROFILE_STATE.activity || !PROFILE_STATE.activity && PROFILE_STATE.home === 'movmap' && model.byCode[row.code].stage === PROFILE_STATE.stage);
}
function openMunicipalityProfile(key, activity, requirement, rowKey) {
  profileRestore();
  if (!profileModel(key)) { toast('That municipality is outside your workspace or the monitored baseline.'); return false; }
  if (PROFILE_STATE.municipality !== key) { PROFILE_STATE.activity = ''; PROFILE_STATE.barangay = ''; PROFILE_STATE.filters = {}; PROFILE_STATE.panel = null; }
  PROFILE_STATE.municipality = key;
  PROFILE_STATE.stage = STATE.stage === 2 ? 2 : 1;
  if (activity && profileModel(key).byCode[activity]) {
    PROFILE_STATE.activity = activity; PROFILE_STATE.barangay = ''; PROFILE_STATE.home = 'sequence'; PROFILE_STATE.stage = profileModel(key).byCode[activity].stage;
    if (rowKey) PROFILE_STATE.panel = { row: rowKey, requirement: requirement || '', kind: requirement ? 'movs' : 'attendance' };
  }
  profilePersist(); go('profile'); return true;
}
// Deep links from other modules (DQA findings, volunteer pages) open the matching profile view:
// "province|municipality[|barangay]", an optional activity code, and whether to open its attendance panel.
function profileOpenLocation(location, actCode, openPanel) {
  profileRestore();
  var parts = String(location || '').split('|'), key = parts[1] ? parts[0] + '|' + parts[1] : homeKey();
  var model = profileModel(key);
  if (!model) { toast('That location is outside your workspace or the monitored baseline.'); return false; }
  if (PROFILE_STATE.municipality !== key) { PROFILE_STATE.filters = {}; PROFILE_STATE.activity = ''; }
  PROFILE_STATE.municipality = key; PROFILE_STATE.home = 'sequence'; PROFILE_STATE.panel = null;
  var place = parts[2] ? model.barangays.filter(function (b) { return normKey(b.barangay) === normKey(parts[2]); })[0] : null;
  var act = actCode && model.byCode[actCode];
  if (act) { PROFILE_STATE.stage = act.stage; PROFILE_STATE.activity = act.code; }
  PROFILE_STATE.barangay = place ? profileKey(place) : '';
  var owner = place || (act && act.level === 'Municipal' ? { province: model.province, municipality: model.municipality, barangay: '' } : null);
  var row = act && owner && model.rows[profileKey(owner) + '|' + act.code];
  if (row && openPanel) PROFILE_STATE.panel = { row: row.key, requirement: '', kind: 'attendance' };
  profilePersist(); go('profile'); return true;
}
function profileBeforeNavigate(page) {
  if (page === 'profile' && STATE.page !== 'profile') PROFILE_ENTERING = true;
  if (STATE.page === 'profile' && page !== 'profile') {
    profileCaptureScroll();
    PROFILE_STATE.returnLink = page === 'health' || page === 'volunteers' || page === 'mrest';
    profileClosePanel(true);
  }
}
function profileCaptureScroll() {
  var body = $('profile-body'); if (!body) return;
  var key = body.getAttribute('data-profile-context'), grid = body.querySelector('.profile-grid-wrap'), side = body.querySelector('.pstepper-scroll');
  if (key) PROFILE_SCROLL[key] = { page: window.scrollY || 0, left: grid ? grid.scrollLeft : 0, top: grid ? grid.scrollTop : 0, side: side ? side.scrollLeft : 0 };
}

function profilePill(label) {
  var good = ['Encoded', 'With attendees', 'Submitted', 'MOVs ready'].indexOf(label) !== -1;
  var bad = label === 'Lacking' || label === 'Not encoded';
  var idle = label === 'Not applicable' || label.indexOf('Not assessed') === 0 || label.indexOf('Not configured') === 0;
  return '<span class="pill ' + (good ? 'good' : bad ? 'bad' : idle ? 'idle' : 'warn') + '">' + (good ? '✓ ' : idle ? '○ ' : '? ') + esc(label) + '</span>';
}
function profileButton(act, label, value, extra) { return '<button type="button" class="btn ghost btn-sm" data-act="' + act + '" data-v="' + attr(value || '') + '"' + (extra || '') + '>' + esc(label) + '</button>'; }
function profileScopeNote(r) { return r.expected ? '' : '<div class="tiny profile-scope-note">' + (r.appraisal ? 'MOV follow-up · no attendance target' : 'Outside activity target · MOV obligations retained') + '</div>'; }
function profileStageActivities(model, stage) { return model.activities.filter(function (a) { return !a.appraisal && a.stage === (stage || PROFILE_STATE.stage); }); }
function profileSequenceActivities(model) { return profileStageActivities(model).concat(PROFILE_STATE.stage === 1 ? [model.byCode.APPRAISAL] : []); }
function profileMovDue(activity) { return activity.rows.filter(function (r) { return r.group && r.group.lacking; }).length; }
function profilePct(count, total) { return total ? Math.round(count / total * 100) + '%' : '—'; }

// ---- Segmented progress: every target slot sits in exactly one segment, ordered by how far it has progressed.
var PROFILE_SEGMENTS = [
  { key: 'complete', label: 'Complete', hint: 'encoded, with attendees and MOVs ready' },
  { key: 'attendees', label: 'With attendees', hint: 'MOVs not yet ready' },
  { key: 'encoded', label: 'Encoded only', hint: 'no attendees recorded' },
  { key: 'none', label: 'Not encoded', hint: 'no Activity Tracker record' }];
function profileMix(model, activity) {
  var movs = !!model.movImported && activity.requirements.length > 0;
  var m = { total: 0, complete: 0, attendees: 0, encoded: 0, none: 0, movs: movs };
  activity.rows.forEach(function (r) {
    if (!r.expected) return;
    m.total++;
    if (r.withAttendees && (!movs || (r.group && r.group.ready))) m.complete++;
    else if (r.withAttendees) m.attendees++;
    else if (r.encoded) m.encoded++;
    else m.none++;
  });
  return m;
}
function profileMixSum(mixes) {
  return mixes.reduce(function (t, m) {
    ['total', 'complete', 'attendees', 'encoded', 'none'].forEach(function (k) { t[k] += m[k]; });
    t.movs = t.movs || m.movs; return t;
  }, { total: 0, complete: 0, attendees: 0, encoded: 0, none: 0, movs: false });
}
function profileSegments(m) {
  return m.movs ? PROFILE_SEGMENTS : [{ key: 'complete', label: 'With attendees', hint: 'MOVs not assessed here' }, PROFILE_SEGMENTS[2], PROFILE_SEGMENTS[3]];
}
function profileLegend(movs) {
  return '<div class="pstack-legend" aria-hidden="true">' + profileSegments({ movs: movs }).map(function (s) { return '<span><i class="seg-' + s.key + '"></i>' + esc(s.label) + '</span>'; }).join('') + '</div>';
}
function profileStack(m, opts) {
  opts = opts || {};
  var cls = 'pstack' + (opts.size ? ' ' + opts.size : '');
  if (!opts.tracker) return '<div class="' + cls + '">' + (opts.head ? '<div class="pstack-head"><span>Not assessed · import Activity Tracker</span></div>' : '') + '<div class="pstack-bar empty" role="img" aria-label="Not assessed: import Activity Tracker"></div></div>';
  var segs = profileSegments(m), total = m.total, pct = profilePct(m.complete, total);
  var summary = segs.map(function (s) { return s.label + ' ' + m[s.key]; }).join(', ');
  var bar = '<div class="pstack-bar' + (total ? '' : ' empty') + '" role="img" aria-label="' + attr(total ? pct + ' ' + segs[0].label.toLowerCase() + '. ' + summary + ', of ' + total + ' target' : 'No target for this stage') + '">' +
    segs.map(function (s) { return m[s.key] ? '<i class="seg-' + s.key + '" style="flex-grow:' + m[s.key] + '" title="' + attr(s.label + ': ' + m[s.key] + ' of ' + total + ' (' + s.hint + ')') + '"></i>' : ''; }).join('') + '</div>';
  var head = opts.head ? '<div class="pstack-head"><strong>' + pct + '</strong><span>' + (total ? esc(segs[0].label.toLowerCase()) + ' · ' + n(m.complete) + ' of ' + n(total) : 'No target') + '</span></div>' : '';
  var legend = opts.legend ? '<div class="pstack-legend">' + segs.map(function (s) { return '<span><i class="seg-' + s.key + '"></i>' + esc(s.label) + ' <b>' + n(m[s.key]) + '</b></span>'; }).join('') + '</div>' : '';
  return '<div class="' + cls + '">' + head + bar + legend + '</div>';
}
// The three measures stay independent; the segmented bar is a summary of them.
function profileMeasures(model, t, stage) {
  var target = t.expected || 0;
  function part(label, v) { return '<span>' + label + ' <b>' + v + '</b></span>'; }
  function frac(v) { return n(v || 0) + '/' + n(target); }
  var movs = model.movImported && stage === 1;
  return '<div class="pmeasures">' + part('Encoded', model.trackerImported ? frac(t.encoded) : 'Not assessed') + part('With attendees', model.trackerImported ? frac(t.complete) : 'Not assessed') +
    part('MOVs submitted', movs ? n(t.movSubmitted || 0) + '/' + n(t.movRequired || 0) + ' forms' : 'Not assessed') +
    part('MOVs ready', movs ? frac(t.movsReady) : 'Not assessed') + '</div>';
}
function profileFlag(css, text) { return '<span class="pflag ' + css + '">' + (css === 'ok' ? '✓ ' : css === 'warn' ? '? ' : '! ') + esc(text) + '</span>'; }

// ---- MOV states, shared by the barangay list and both checklists.
var PROFILE_GLYPH = { ok: '✓', review: '?', due: '✗', partial: '◐', pending: '○', na: '–', none: '·' };
var PROFILE_TILE_LABEL = { ok: 'Submitted', due: 'Lacking (due)', partial: 'In progress', pending: 'Not yet due', na: 'Not applicable', none: 'Not assessed' };
function profileReqCss(status) { return { 'Submitted': 'ok', 'Lacking': 'due', 'Pending activity': 'pending', 'Not applicable': 'na' }[status] || 'none'; }
function profileGroupState(model, r) {
  var g = r.group; if (!g) return null;
  if (!model.movImported) return { css: 'none', label: 'Not assessed', text: '' };
  var text = g.submitted + '/' + g.required;
  if (g.ready) return { css: 'ok', label: 'MOVs ready', text: text };
  if (g.lacking) return { css: 'due', label: 'MOV backlog · due', text: text };
  if (g.submitted) return { css: 'partial', label: 'In progress', text: text };
  return { css: 'pending', label: 'Not yet due', text: text };
}
function profileFirstOpenReq(r) {
  var g = r.group; if (!g || !g.requirements.length) return '';
  var open = g.requirements.filter(function (q) { return q.status !== 'Submitted' && q.status !== 'Not applicable'; })[0];
  return (open || g.requirements[0]).id;
}
function profileTileLegend(keys) {
  return '<div class="pmap-legend" aria-label="MOV status legend">' + keys.map(function (k) { return '<span><i class="pmap-tile pt-' + k + '" aria-hidden="true">' + PROFILE_GLYPH[k] + '</i>' + esc(PROFILE_TILE_LABEL[k]) + '</span>'; }).join('') + '</div>';
}
function profileReqTile(r, def, status, extraClass) {
  var css = profileReqCss(status), title = r.name + ' · ' + def.name + ': ' + status;
  return '<button type="button" id="' + attr('profile-cell-' + encodeURIComponent(r.key + '|' + def.id)) + '" class="pmap-tile pt-' + css + (extraClass ? ' ' + extraClass : '') + '" data-act="profile-cell" data-row="' + attr(r.key) + '" data-requirement="' + attr(def.id) + '" title="' + attr(title) + '" aria-label="' + attr(title) + '"><span aria-hidden="true">' + PROFILE_GLYPH[css] + '</span></button>';
}
function profileChip(act, value, label, count, active) {
  return '<button type="button" class="pchip' + (active ? ' active' : '') + '" data-act="' + act + '" data-v="' + attr(value) + '" aria-pressed="' + !!active + '">' + esc(label) + (count === null || count === undefined ? '' : ' <b>' + n(count) + '</b>') + '</button>';
}

function profileStepState(model, m) {
  if (!model.trackerImported || !m.total) return 'idle';
  if (m.complete === m.total) return 'done';
  return m.none === m.total ? 'todo' : 'active';
}
// Horizontal stepper: the activity sequence left to right; the selected step's barangays render below it.
function profileStepperHtml(model) {
  var steps = profileSequenceActivities(model).map(function (a) {
    var selected = PROFILE_STATE.activity === a.code, m = profileMix(model, a), due = (model.trackerImported && !a.appraisal ? a.tally.backlog : 0) + (model.trackerImported && model.movImported ? profileMovDue(a) : 0);
    var state = a.appraisal ? 'followup' : profileStepState(model, m), body;
    if (a.appraisal) {
      var gs = profileGroupState(model, a.rows[0]);
      body = '<span class="pstep-meta">MOVs ' + esc(gs && gs.text ? gs.text : gs ? gs.label : '—') + '</span>';
    } else body = profileDonuts(model, a);
    return '<li class="pstep ' + state + (selected ? ' selected' : '') + '"><button type="button" data-act="profile-activity" data-v="' + attr(a.code) + '" aria-current="' + (selected ? 'step' : 'false') + '" title="' + attr(a.label) + '">' +
      '<span class="pstep-marker" aria-hidden="true">' + (state === 'done' ? '✓' : a.appraisal ? '+' : esc(a.seq)) + '</span>' +
      '<span class="pstep-level">' + (a.appraisal ? 'Follow-up' : esc(a.level)) + '</span><span class="pstep-label">' + esc(a.label) + '</span>' + body +
      (due ? '<span class="pstep-due">! ' + n(due) + ' due</span>' : '') + '</button></li>';
  }).join('');
  return '<section class="pstepper-card" aria-label="Stage ' + PROFILE_STATE.stage + ' activity sequence"><div class="pstepper-head"><h3>Stage ' + PROFILE_STATE.stage + ' activity sequence</h3>' + profileDonutLegend(model.movImported && PROFILE_STATE.stage === 1) + '</div><div class="pstepper-scroll"><ol class="pstepper">' + steps + '</ol></div></section>';
}
function profileDefaultActivity(model) {
  var acts = profileStageActivities(model);
  var open = acts.filter(function (a) { var m = profileMix(model, a); return model.trackerImported && m.total && m.complete < m.total; })[0];
  return (open || acts[0] || {}).code || '';
}

// ---- Municipality-wide MOV checklist: one column per required document, grouped under its activity.
function profileMapFilters() { return PROFILE_STATE.filters.__map || (PROFILE_STATE.filters.__map = { search: '', show: '', sort: 'name' }); }
function profileMapLine(model, place, name, acts, municipal) {
  var line = { name: name, key: profileKey(place), municipal: municipal, groups: [], submitted: 0, required: 0, due: false, ready: 0, total: 0, notEncoded: false, noAttendees: false };
  acts.forEach(function (a) {
    var r = model.rows[profileKey(place) + '|' + a.code] || null, state = r ? profileGroupState(model, r) : null;
    var cells = a.requirements.map(function (def) { return { def: def, status: r ? profileRequirementStatus(model, r, def.id) : '' }; });
    if (r) {
      if (model.trackerImported && r.expected) {
        if (!r.encoded) line.notEncoded = true;
        if (!r.withAttendees) line.noAttendees = true;
      }
      line.total++; if (state && state.css === 'ok') line.ready++;
      cells.forEach(function (c) {
        if (c.status === 'Not applicable' || !model.movImported) return;
        line.required++; if (c.status === 'Submitted') line.submitted++;
        if (c.status === 'Lacking') line.due = true;
      });
    }
    line.groups.push({ act: a, row: r, state: state, cells: cells });
  });
  return line;
}
function profileMapData(model, includeActivities) {
  var acts = profileSequenceActivities(model).filter(function (a) { return includeActivities || a.requirements.length; });
  var brgyActs = acts.filter(function (a) { return a.level !== 'Municipal'; }), muniActs = acts.filter(function (a) { return a.level === 'Municipal'; });
  return { acts: acts, brgyActs: brgyActs, muniActs: muniActs,
    muni: profileMapLine(model, { province: model.province, municipality: model.municipality, barangay: '' }, model.municipality, muniActs, true),
    lines: model.barangays.map(function (b) { return profileMapLine(model, b, b.barangay, brgyActs, false); }) };
}
function profileMapShow(l, show) { return !show || show === 'attention' && (l.due || l.notEncoded || l.noAttendees) || show === 'notEncoded' && l.notEncoded || show === 'noAttendees' && l.noAttendees || show === 'due' && l.due || show === 'complete' && l.required > 0 && l.submitted === l.required; }
function profileMapLines(data, f) {
  var q = normSearch(f.search);
  return data.lines.filter(function (l) { return (!q || normSearch(l.name).indexOf(q) !== -1) && profileMapShow(l, f.show); }).sort(function (a, b) {
    if (f.sort === 'ready') return (a.submitted / Math.max(1, a.required)) - (b.submitted / Math.max(1, b.required)) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}
// Column head for one location in a flipped checklist: rotated name (opens the barangay profile) and its submitted count.
function profileLocationHead(name, placeKey, stat) {
  return '<th scope="col" class="pmap-bcol" title="' + attr(name) + '">' + (placeKey ? '<button type="button" class="pmap-colhead" data-act="profile-barangay" data-v="' + attr(placeKey) + '" title="Open ' + attr(name) + ' barangay profile"><span class="pmap-vert">' + esc(name) + '</span></button>' : '<span class="pmap-vert">' + esc(name) + '</span>') +
    '<span class="pmap-colstat">' + stat + '</span></th>';
}
// Activity status checks precede the individual MOV forms.
var PROFILE_CHECKS = [['encoding', 'Encoding'], ['attendees', 'With attendees']];
function profileCheck(model, row, kind) {
  if (!row) return { text: '—', label: 'Not applicable', css: 'na', value: 'Not applicable' };
  if (kind === 'movs') {
    var state = profileGroupState(model, row);
    if (!state) return { text: '—', label: 'MOV requirements not configured for this stage', css: 'na', value: 'Not configured' };
    return { text: model.movImported ? state.text : '—', label: state.label + (model.movImported ? ' · ' + state.text + ' requirements submitted' : ''),
      css: state.css, value: model.movImported ? state.text + ' · ' + state.label : 'Not assessed', req: profileFirstOpenReq(row) };
  }
  if (row.appraisal) return { text: 'N/A', label: 'Not an attendance activity', css: 'na', value: 'Not an attendance activity' };
  if (!model.trackerImported) return { text: '—', label: 'Import Activity Tracker', css: 'none', value: 'Not assessed' };
  if (kind === 'encoding') return { text: row.encoded ? '✓' : '○', label: profileEncodingLabel(model, row), css: row.encoded ? 'ok' : 'pending', value: profileEncodingLabel(model, row) };
  return { text: row.withAttendees ? '✓' : row.encoded ? '○' : '—',
    label: row.withAttendees ? 'With attendees' : row.encoded ? 'No reported attendees' : 'Not encoded',
    css: row.withAttendees ? 'ok' : 'pending', value: row.encoded ? (row.withAttendees ? 'With attendees' : 'No reported attendees') : 'Not encoded' };
}
function profileCheckTotal(model, rows, kind) {
  rows = rows.filter(function (r) { return r && (kind === 'movs' ? !!r.group : r.expected && !r.appraisal); });
  if (!rows.length) return 'N/A';
  if (!(kind === 'movs' ? model.movImported : model.trackerImported)) return 'Not assessed';
  var numerator = rows.reduce(function (t, r) { return t + (kind === 'movs' ? r.group.submitted : kind === 'encoding' ? +r.encoded : +r.withAttendees); }, 0);
  var denominator = kind === 'movs' ? rows.reduce(function (t, r) { return t + r.group.required; }, 0) : rows.length;
  return numerator + '/' + denominator;
}
function profileCheckRows(model, rows, activity) {
  return PROFILE_CHECKS.map(function (check) {
    var kind = check[0];
    var cells = rows.map(function (r) {
      var item = profileCheck(model, r, kind);
      var title = (r ? r.name + ' · ' : '') + activity.label + ' · ' + check[1] + ': ' + item.label + (r && !r.expected && !r.appraisal ? ' · Outside activity target' : '');
      var content = esc(item.text), css = 'pcheck-cell pt-' + item.css + (r && !r.expected && !r.appraisal ? ' outside' : '');
      if (r && item.css !== 'na') content = '<button type="button" id="' + attr('profile-check-' + encodeURIComponent(r.key + '|' + kind)) + '" class="' + css + '" data-act="profile-cell" data-row="' + attr(r.key) + '" data-requirement="' + attr(item.req || '') + '" title="' + attr(title) + '" aria-label="' + attr(title) + '">' + content + '</button>';
      else content = '<span class="' + css + '" title="' + attr(title) + '">' + content + '</span>';
      return '<td>' + content + '</td>';
    }).join('');
    return '<tr class="pcheck-row' + (kind === 'attendees' ? ' pcheck-divider' : '') + '"><th scope="row" class="pmap-form">' + check[1] + '</th>' + cells + '<td class="pmap-total">' + esc(profileCheckTotal(model, rows, kind)) + '</td></tr>';
  }).join('');
}
// Combined checklist: activities in sequence, one column per location.
// Municipality MOV checklist: one row per activity (sequence) and MOV form under it, one column per location.
function profileReqTable(model, acts, lines) {
  var head = '<tr><th scope="col" class="pmap-corner">Activity · check</th>' + lines.map(function (l) {
    return profileLocationHead(l.municipal ? l.name + ' (municipal)' : l.name, l.municipal ? '' : l.key, model.movImported && l.required ? l.submitted + '/' + l.required : '—');
  }).join('') + '<th scope="col" class="pmap-corner pmap-endcol">Total shown</th></tr>';
  var body = acts.map(function (a, i) {
    var ready = 0, total = 0;
    lines.forEach(function (l) { var g = l.groups[i]; if (g.row) { total++; if (g.state && g.state.css === 'ok') ready++; } });
    var group = '<tr class="pmap-grouprow"><th scope="rowgroup"><button type="button" class="pmap-colhead left" data-act="profile-activity" data-v="' + attr(a.code) + '" title="Open ' + attr(a.label) + '"><span class="pmap-seq">' + (a.appraisal ? 'Follow-up' : 'Seq ' + esc(a.seq)) + '</span>' + esc(a.label) + '</button>' +
      '<span class="pmap-colstat">' + (a.requirements.length ? (model.movImported ? ready + ' of ' + total + ' MOV-ready' : 'MOVs not assessed') : 'MOVs not configured') + '</span></th><td colspan="' + (lines.length + 1) + '"></td></tr>';
    return group + profileCheckRows(model, lines.map(function (l) { return l.groups[i].row; }), a) + a.requirements.map(function (def, j) {
      var submitted = 0, applicable = 0;
      var cells = lines.map(function (l) {
        var g = l.groups[i], c = g.cells[j];
        if (!g.row) return '<td><span class="pmap-void" title="Not configured"></span></td>';
        if (model.movImported && c.status !== 'Not applicable') { applicable++; if (c.status === 'Submitted') submitted++; }
        return '<td>' + profileReqTile(g.row, c.def, c.status, g.row.expected || g.row.appraisal ? '' : 'outside') + '</td>';
      }).join('');
      return '<tr><th scope="row" class="pmap-form">' + esc(def.name) + '</th>' + cells + '<td class="pmap-total">' + (model.movImported ? '<b>' + submitted + '</b>/' + applicable : '—') + '</td></tr>';
    }).join('');
  }).join('');
  return '<div class="profile-grid-wrap pmap-wrap"><table class="pmap pmap-flip pcheck-table' + (lines.length < 4 ? ' pmap-narrow' : '') + '"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
}
function profileMovMapHtml(model) {
  var data = profileMapData(model, true), f = profileMapFilters();
  if (!data.acts.length) return '<div class="msg info">No activities are configured for this stage.</div>';
  var hasMovs = data.acts.some(function (a) { return a.requirements.length; });
  var lines = profileMapLines(data, f), chips = [['', 'All barangays'], ['attention', 'Needs follow-up'], ['notEncoded', 'Not encoded'], ['noAttendees', 'Without attendees']];
  if (hasMovs) chips = chips.concat([['due', 'MOV due'], ['complete', 'All MOVs submitted']]);
  return '<div class="card pmap-card"><div class="pseq-head"><div><h3>Activity &amp; MOV checklist</h3><p class="tiny muted">Encoding, attendance and each MOV form by barangay. Click a mark for details.</p></div><div class="row-actions">' +
    profileButton('profile-map-export', 'Export checklist') + '</div></div>' +
    (!model.trackerImported ? '<div class="msg info">Import Activity Tracker to assess encoding and attendance.</div>' : '') +
    (hasMovs && !model.movImported ? '<div class="msg warn">Import KCIS MOV attachments to assess MOV submission.</div>' : '') +
    (!hasMovs ? '<div class="msg info">Encoding and attendance are available for this stage. MOV requirements are not configured.</div>' : '') +
    '<div class="pfilters"><label class="field psearch"><span>Find barangay</span><input id="profile-map-search" type="search" value="' + attr(f.search) + '" placeholder="Search barangay…"></label>' +
    '<label class="field"><span>Show</span><select data-profile-map-filter="show" aria-label="Show barangays">' + chips.map(function (c) { return movOption(c[0], c[1], f.show === c[0]); }).join('') + '</select></label>' +
    '<label class="field"><span>Sort</span><select data-profile-map-filter="sort">' + movOption('name', 'Barangay A–Z', f.sort === 'name') + (hasMovs ? movOption('ready', 'Least MOVs submitted first', f.sort === 'ready') : '') + '</select></label></div>' +
    '<details class="pcheck-help"><summary>Legend &amp; counting rules</summary><p class="tiny muted">Activity checks: ✓ yes · ○ no · — not assessed or not encoded · N/A not an attendance activity. Click a mark to inspect its records.</p>' +
    (hasMovs ? profileTileLegend(['ok', 'due', 'pending', 'na', 'none']) : '') +
    '<p class="tiny muted">Totals use the locations shown. Activity totals use expected locations. MOV totals include applicable outside-target obligations (dashed marks). Municipal activities are listed separately.</p></details>' +
    (data.brgyActs.length ? '<h4 class="pmap-section">Barangay activities <span class="tiny muted">' + lines.length + ' of ' + data.lines.length + ' barangays</span></h4>' +
      (lines.length ? profileReqTable(model, data.brgyActs, lines) : '<div class="msg info">No barangays match these filters.</div>') : '') +
    (data.muniActs.length ? '<h4 class="pmap-section">Municipal activities &amp; follow-up</h4>' + profileReqTable(model, data.muniActs, [data.muni]) : '') + '</div>';
}
function profileMapExportRows(model) {
  if (!model || !profileAllowed(model.key)) return [];
  // Same orientation as the checklist: one row per activity and MOV form, one column per location.
  var data = profileMapData(model, true), lines = [data.muni].concat(profileMapLines(data, profileMapFilters()));
  var head = ['Province', 'Municipality', 'Seq', 'Activity', 'Check / MOV form'].concat(lines.map(function (l) { return l.municipal ? l.name + ' (municipal level)' : l.name; })).concat(['Total shown']);
  var out = [head];
  data.acts.forEach(function (a) {
    var checkRows = lines.map(function (l) { var g = l.groups.filter(function (x) { return x.act === a; })[0]; return g && g.row; });
    PROFILE_CHECKS.forEach(function (check) {
      out.push([model.province, model.municipality, a.appraisal ? 'Follow-up' : a.seq, a.label, check[1]].concat(checkRows.map(function (r) { return r ? profileCheck(model, r, check[0]).value : ''; })).concat([profileCheckTotal(model, checkRows, check[0])]));
    });
    a.requirements.forEach(function (def) {
      var submitted = 0, applicable = 0;
      var values = lines.map(function (l) {
        var g = l.groups.filter(function (x) { return x.act === a; })[0];
        if (!g || !g.row) return '';
        var status = g.cells.filter(function (x) { return x.def === def; })[0].status;
        if (model.movImported && status !== 'Not applicable') { applicable++; if (status === 'Submitted') submitted++; }
        return status;
      });
      out.push([model.province, model.municipality, a.appraisal ? 'Follow-up' : a.seq, a.label, def.name].concat(values).concat([model.movImported ? submitted + '/' + applicable : 'Not assessed']));
    });
  });
  return out;
}
// ---- Community Volunteer checklist: one row per barangay, one column per committee of the stage.
// Stage 1 reads the BResT and SFMSC status the DQA uses (volunteerSnapshot); Stage 2 counts the CSPMC
// and sub-committee members against each body's rule (Chairperson, minimum members).
var PROFILE_CV_ASSEMBLY = { 1: 'BA1', 2: 'BA2' };
var PROFILE_CV_LABEL = { ok: 'Meets the rules', review: 'Needs fixing', due: 'Not encoded · assembly encoded', pending: 'Not encoded · assembly not yet encoded', none: 'Not assessed' };
function profileCvFilters() { return PROFILE_STATE.filters.__cv || (PROFILE_STATE.filters.__cv = { search: '', show: '', sort: 'name' }); }
function profileCvBodies(stage) {
  if (stage === 2) return (typeof STAGE2_BODIES !== 'undefined' ? STAGE2_BODIES : []).map(function (b) {
    return { id: b.id, short: b.short, label: b.name, chairRequired: !!b.chairRequired, minMembers: b.minMembers || 0, chairRule: b.chairRequired ? 'atLeast1' : 'none', memberMin: 0 };
  });
  // BResT: no size or Chairperson rule (SM1 paras 19–22). SFMSC: exactly one Chairperson and at least two Members
  // (RPMO rule), which also gives the three CVs SM1 para. 43 requires of every CSPMC sub-committee.
  return [{ id: 'BREST', short: 'BResT', label: 'Barangay Resilience Team', snapshot: true, chairRule: 'none', memberMin: 0 },
          { id: 'SFMSC', short: 'SFMSC', label: 'Stakeholder and Feedback Mechanism Sub-Committee', snapshot: true, chairRule: 'exact1', memberMin: 2 }];
}
// The Chairperson and Member halves of a committee mark, each judged against the committee's own rule.
function profileCvRoleCss(body, c, role) {
  if (!c.members) return c.css;
  if (role === 'chair') {
    if (body.chairRule === 'exact1') return c.chairs === 1 ? 'ok' : 'review';
    if (body.chairRule === 'atLeast1') return c.chairs >= 1 ? 'ok' : 'review';
    return 'na';           // no Chairperson rule: an encoded Chairperson is shown, never credited
  }
  if (body.memberMin) return c.memberRole >= body.memberMin ? 'ok' : 'review';
  if (body.minMembers) return c.members >= body.minMembers ? 'ok' : 'review';
  return c.others ? 'ok' : 'na';
}
function profileCvChair(v) { return !!v.chair; }
// Named volunteers of the municipality per barangay, each person once (repeated rows are left out).
function profileCvPeople(model) {
  var by = Object.create(null), muni = { sfmc: [] }, list = [];
  try { list = LOADED.volunteers && typeof people === 'function' ? people().volunteers : []; } catch (e) { list = []; }
  list.forEach(function (v) {
    if (v.province !== model.province || v.municipality !== model.municipality) return;
    if (!v.key || (v.flags || []).indexOf('duplicate') !== -1) return;
    var k = profileKey(v), b = by[k] || (by[k] = { all: [], untagged: 0, byBody: {} });
    b.all.push(v);
    if (v.kind === 'NONE') b.untagged++;
    var body = v.kind === 'BREST' || v.kind === 'SFMSC' ? v.kind : v.isStage2 ? v.stage2Body : '';
    if (body) (b.byBody[body] = b.byBody[body] || []).push(v);
    var a = normAlpha(v.committee);
    if (v.kind === 'SEQ1' && a.indexOf('mrest') === -1 && a.indexOf('municipalresilienceteam') === -1) muni.sfmc.push(v);
  });
  return { barangays: by, municipal: muni };
}
function profileCvCell(model, place, body, ppl, stage) {
  var assembly = model.rows[profileKey(place) + '|' + PROFILE_CV_ASSEMBLY[stage]], held = !!(model.trackerImported && assembly && assembly.encoded);
  var list = (ppl && ppl.byBody[body.id]) || [], members = list.length, chairs = list.filter(profileCvChair).length, memberRole = members - chairs, status, reasons = [];
  if (!LOADED.volunteers) return { status: 'Not assessed', css: 'none', chairCss: 'none', memberCss: 'none', members: 0, chairs: 0, memberRole: 0, others: 0, noPosition: 0, reasons: [], held: held };
  if (body.snapshot) {
    var snapRow = profileIndex().barangays[profileKey(place)], s = snapRow && snapRow.volunteers && snapRow.volunteers[body.id];
    status = s ? s.status : 'Not encoded'; reasons = s ? s.reasons || [] : [];
    if (s) { members = s.members; chairs = s.chairs; memberRole = s.memberRole; }
  } else if (!members) status = 'Not encoded';
  else {
    if (body.chairRequired && !chairs) reasons.push('no Chairperson');
    if (body.minMembers && members < body.minMembers) reasons.push(members + ' of ' + body.minMembers + ' minimum members');
    status = reasons.length ? 'Needs fixing' : 'Encoded';
  }
  var css = status === 'Encoded' ? 'ok' : status === 'Needs fixing' ? 'review' : held ? 'due' : 'pending';
  // "Member" counts everyone who is not a Chairperson; noPosition is the part of it with no position encoded.
  var c = { status: status, css: css, members: members, chairs: chairs, memberRole: memberRole, others: Math.max(0, members - chairs), noPosition: Math.max(0, members - chairs - memberRole), reasons: reasons, held: held };
  c.chairCss = profileCvRoleCss(body, c, 'chair'); c.memberCss = profileCvRoleCss(body, c, 'member');
  return c;
}
function profileCvData(model, stage) {
  stage = stage || PROFILE_STATE.stage;
  var bodies = profileCvBodies(stage), ppl = profileCvPeople(model);
  var lines = model.barangays.map(function (b) {
    var p = ppl.barangays[profileKey(b)] || { all: [], untagged: 0, byBody: {} };
    var cells = bodies.map(function (body) { return profileCvCell(model, b, body, p, stage); });
    // Stage 1 counts every named 1st BA volunteer (untagged ones too); Stage 2 only the CSPMC and its sub-committees.
    var vols = stage === 2 ? p.all.filter(function (v) { return v.isStage2; }) : p.all.filter(function (v) { return !v.isStage2; });
    var women = vols.filter(function (v) { return v.sex === 'female'; }).length;
    return { name: b.barangay, key: profileKey(b), place: b, cells: cells, total: vols.length, women: women, untagged: p.untagged,
      ok: cells.filter(function (c) { return c.css === 'ok'; }).length, due: cells.some(function (c) { return c.css === 'due'; }),
      review: cells.some(function (c) { return c.css === 'review'; }), missing: cells.some(function (c) { return c.css === 'due' || c.css === 'pending'; }) };
  });
  return { stage: stage, bodies: bodies, lines: lines, municipal: ppl.municipal, loaded: !!LOADED.volunteers };
}
function profileCvShow(l, show) {
  return !show || show === 'attention' && (l.ok < l.cells.length || l.untagged > 0) || show === 'due' && l.due || show === 'review' && l.review ||
    show === 'missing' && l.missing || show === 'untagged' && l.untagged > 0 || show === 'complete' && l.ok === l.cells.length;
}
function profileCvLines(data, f) {
  var q = normSearch(f.search);
  return data.lines.filter(function (l) { return (!q || normSearch(l.name).indexOf(q) !== -1) && profileCvShow(l, f.show); }).sort(function (a, b) {
    if (f.sort === 'least') return a.ok - b.ok || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}
var PROFILE_CV_ROLE = { chair: 'Chairperson', member: 'Member' };
function profileCvRuleText(body, role) {
  if (role === 'chair') return body.chairRule === 'exact1' ? 'exactly 1 Chairperson' : body.chairRule === 'atLeast1' ? 'a Chairperson' : body.id === 'BREST' ? 'no Chairperson required, SM1 paras 19–22' : 'no Chairperson rule';
  return body.memberMin ? 'at least ' + body.memberMin + ' Members' : body.minMembers ? 'at least ' + body.minMembers + ' CVs in all, SM1 para. 43' : 'no Member rule';
}
function profileCvTitle(l, body, c, role) {
  var count = role === 'chair' ? c.chairs : c.others, css = role === 'chair' ? c.chairCss : c.memberCss;
  var text = l.name + ' · ' + body.short + ' ' + PROFILE_CV_ROLE[role] + ': ';
  if (c.css === 'none') return text + 'Not assessed';
  if (!c.members) return text + 'committee not encoded' + (c.held ? ' (assembly encoded)' : '');
  text += count + ' ' + (role === 'chair' ? 'Chairperson' + (count === 1 ? '' : 's') : 'Member' + (count === 1 ? '' : 's')) + ' · ' + (css === 'ok' ? 'meets the rule' : css === 'review' ? 'needs fixing' : 'not required') + ' (' + profileCvRuleText(body, role) + ')';
  if (role === 'member' && c.noPosition) text += ' · ' + c.noPosition + ' with no position encoded';
  return text;
}
function profileCvPlace(p) { return p.province + '|' + p.municipality + '|' + (p.barangay || ''); }
function profileCvCellHtml(l, body, c, role) {
  var css = role === 'chair' ? c.chairCss : c.memberCss, count = role === 'chair' ? c.chairs : c.others;
  var title = profileCvTitle(l, body, c, role), glyph = css === 'review' ? '!' : PROFILE_GLYPH[css];
  if (css === 'none') return '<span class="pcv-cell pt-none" title="' + attr(title) + '">' + glyph + '</span>';
  return '<button type="button" class="pcv-cell pt-' + css + '" data-act="profile-cv-cell" data-v="' + attr(profileCvPlace(l.place)) + '" data-body="' + attr(body.id) + '" data-position="' + role + '" title="' + attr(title + '. Click to list them.') + '" aria-label="' + attr(title) + '">' +
    '<span aria-hidden="true">' + glyph + '</span>' + (c.members ? '<b>' + n(count) + '</b>' : '') + '</button>';
}
function profileCvTable(data, lines) {
  var stage1 = data.stage === 1, okIn = function (i) { return lines.filter(function (l) { return l.cells[i].css === 'ok'; }).length; };
  var head = '<tr class="pcv-head1"><th scope="col" rowspan="2" class="pmap-corner">Barangay</th>' + data.bodies.map(function (body, i) {
    return '<th scope="colgroup" colspan="2" class="pcv-col pcv-grp" title="' + attr(body.label + ' · ' + profileCvRuleText(body, 'chair') + ' · ' + profileCvRuleText(body, 'member')) + '"><span class="pcv-colname">' + esc(body.short) + '</span><span class="pmap-colstat">' + (data.loaded ? okIn(i) + '/' + lines.length + ' meet the rules' : '—') + '</span></th>';
  }).join('') + (stage1 ? '<th scope="col" rowspan="2" class="pcv-col pcv-num pcv-grp" title="Named volunteers with no committee tagged in KCIS">No committee</th>' : '') +
    '<th scope="col" rowspan="2" class="pcv-col pcv-num' + (stage1 ? '' : ' pcv-grp') + '" title="Named volunteers, each person counted once">Total CVs</th><th scope="col" rowspan="2" class="pcv-col pcv-num" title="Share of the named volunteers who are women">Women</th>' +
    '<th scope="col" rowspan="2" class="pmap-corner pmap-endcol">Committees</th></tr>' +
    '<tr class="pcv-head2">' + data.bodies.map(function (body) {
      return '<th scope="col" class="pcv-role pcv-grp" title="' + attr(body.short + ': ' + profileCvRuleText(body, 'chair')) + '">Chairperson</th><th scope="col" class="pcv-role" title="' + attr(body.short + ': ' + profileCvRuleText(body, 'member')) + '">Member</th>';
    }).join('') + '</tr>';
  var body = lines.map(function (l) {
    return '<tr><th scope="row" class="pcv-brgy"><button type="button" class="profile-cell-button" data-act="profile-barangay" data-v="' + attr(l.key) + '" title="Open barangay profile">' + esc(l.name) + '</button></th>' +
      data.bodies.map(function (b, i) { return '<td class="pcv-grp">' + profileCvCellHtml(l, b, l.cells[i], 'chair') + '</td><td>' + profileCvCellHtml(l, b, l.cells[i], 'member') + '</td>'; }).join('') +
      (stage1 ? '<td class="pcv-num pcv-grp">' + (!data.loaded ? '—' : l.untagged ? '<button type="button" class="pcv-gap" data-act="profile-cv-cell" data-v="' + attr(profileCvPlace(l.place)) + '" data-body="nocommittee" title="' + attr(l.untagged + ' named volunteer' + (l.untagged === 1 ? '' : 's') + ' with no committee. Click to list them.') + '">' + n(l.untagged) + '</button>' : '<span class="muted">0</span>') + '</td>' : '') +
      '<td class="pcv-num' + (stage1 ? '' : ' pcv-grp') + '">' + (data.loaded ? n(l.total) : '—') + '</td><td class="pcv-num">' + (data.loaded && l.total ? Math.round(l.women / l.total * 100) + '%' : '—') + '</td>' +
      '<td class="pmap-total">' + (data.loaded ? '<b>' + l.ok + '</b>/' + l.cells.length : '—') + '</td></tr>';
  }).join('');
  var sum = function (fn) { return lines.reduce(function (s, l) { return s + fn(l); }, 0); }, total = sum(function (l) { return l.total; }), women = sum(function (l) { return l.women; });
  var foot = '<tr class="pcv-foot"><th scope="row">Total encoded</th>' + data.bodies.map(function (b, i) {
    return '<td class="pcv-num pcv-grp">' + (data.loaded ? n(sum(function (l) { return l.cells[i].chairs; })) : '—') + '</td><td class="pcv-num">' + (data.loaded ? n(sum(function (l) { return l.cells[i].others; })) : '—') + '</td>';
  }).join('') + (stage1 ? '<td class="pcv-num pcv-grp">' + (data.loaded ? n(sum(function (l) { return l.untagged; })) : '—') + '</td>' : '') +
    '<td class="pcv-num' + (stage1 ? '' : ' pcv-grp') + '">' + (data.loaded ? n(total) : '—') + '</td><td class="pcv-num">' + (data.loaded && total ? Math.round(women / total * 100) + '%' : '—') + '</td>' +
    '<td class="pmap-total">' + (data.loaded ? '<b>' + lines.filter(function (l) { return l.ok === l.cells.length; }).length + '</b> complete' : '—') + '</td></tr>';
  return '<div class="profile-grid-wrap pmap-wrap"><table class="pmap pcv"><thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
}
function profileCvMunicipalHtml(model, data) {
  if (data.stage !== 1 || !data.loaded) return '';
  var mrest = null;
  try { mrest = typeof mrestStatusOf === 'function' ? mrestStatusOf(model.province, model.municipality) : null; } catch (e) { mrest = null; }
  var none = !mrest || mrest.status === 'none', mCss = none ? 'due' : mrest.status === 'complete' ? 'ok' : 'review';
  var mText = none ? 'Not in KCIS' : mrest.status === 'complete' ? 'Formed' : 'Incomplete';
  var mTitle = 'MResT: ' + mText + (mrest && mrest.gaps && mrest.gaps.length ? ' · missing ' + mrest.gaps.join('; ') : '');
  var sfmc = data.municipal.sfmc.length;
  return '<h4 class="pmap-section">Municipal committees</h4><div class="pcv-muni">' +
    '<button type="button" class="pcv-muni-card pt-' + mCss + '" data-act="profile-go" data-v="mrest" title="' + attr(mTitle + '. Open the MResT module.') + '"><span>MResT</span><strong>' + esc(mText) + '</strong><small>' + n(mrest ? mrest.members || 0 : 0) + ' members in KCIS</small></button>' +
    '<button type="button" class="pcv-muni-card pt-' + (sfmc ? 'ok' : 'pending') + '" data-act="profile-cv-cell" data-v="' + attr(model.province + '|' + model.municipality + '|') + '" data-body="SFMC" title="SFMC (Municipal) members encoded in KCIS. Click to list them."><span>SFMC (Municipal)</span><strong>' + n(sfmc) + '</strong><small>member' + (sfmc === 1 ? '' : 's') + ' in KCIS</small></button></div>';
}
function profileCvMapHtml(model) {
  var data = profileCvData(model), f = profileCvFilters();
  if (!data.bodies.length) return '<div class="msg info">No committees are configured for this stage.</div>';
  var lines = profileCvLines(data, f), stage1 = data.stage === 1;
  var shows = [['', 'All barangays'], ['attention', 'Needs follow-up'], ['due', 'Not encoded · assembly encoded'], ['missing', 'Any committee not encoded'], ['review', 'Needs fixing']]
    .concat(stage1 ? [['untagged', 'Has volunteers with no committee']] : []).concat([['complete', 'All committees meet the rules']]);
  return '<div class="card pmap-card pcv-card"><div class="pseq-head"><div><h3>Community Volunteer checklist</h3><p class="tiny muted">' + (stage1 ? 'BResT and SFMSC selected at the 1st Barangay Assembly' : 'CSPMC and sub-committees organized at the 2nd Barangay Assembly') + ', by barangay. Click a mark to list its volunteers.</p></div><div class="row-actions">' +
    profileButton('profile-cv-export', 'Export checklist') + '</div></div>' +
    (!data.loaded ? '<div class="msg info">Import the Community Volunteer List to assess the committees.</div>' : '') +
    '<div class="pfilters"><label class="field psearch"><span>Find barangay</span><input id="profile-cv-search" type="search" value="' + attr(f.search) + '" placeholder="Search barangay…"></label>' +
    '<label class="field"><span>Show</span><select data-profile-cv-filter="show" aria-label="Show barangays">' + shows.map(function (c) { return movOption(c[0], c[1], f.show === c[0]); }).join('') + '</select></label>' +
    '<label class="field"><span>Sort</span><select data-profile-cv-filter="sort">' + movOption('name', 'Barangay A–Z', f.sort === 'name') + movOption('least', 'Fewest committees meeting the rules first', f.sort === 'least') + '</select></label></div>' +
    '<details class="pcheck-help"><summary>Legend &amp; counting rules</summary><div class="pmap-legend" aria-label="Committee status legend">' + ['ok', 'review', 'due', 'pending', 'none'].map(function (k) {
      return '<span><i class="pmap-tile pt-' + k + '" aria-hidden="true">' + (k === 'review' ? '!' : PROFILE_GLYPH[k]) + '</i>' + esc(PROFILE_CV_LABEL[k]) + '</span>'; }).join('') + '</div>' +
    '<p class="tiny muted">Each committee has a Chairperson and a Member column; the number in a mark is the people encoded in KCIS in that role, each person counted once (Member includes anyone without a Chairperson position). – means the role has no rule for this committee. ' + (stage1 ? 'BResT is encoded once it has a named member; it has no Chairperson (SM1 paras 19–22), so a Chairperson encoded for it shows grey, not ✓. SFMSC needs exactly one Chairperson and at least two Members (RPMO rule; three CVs in all, SM1 para. 43). Not encoded is not the same as not organized.' : 'The CSPMC and each sub-committee need a Chairperson and at least 3 CVs (SM1 para. 43; for the CMSC also SM7 Section 1.5.1). The Bookkeeper has no size rule.') + '</p></details>' +
    '<h4 class="pmap-section">Barangay committees <span class="tiny muted">' + lines.length + ' of ' + data.lines.length + ' barangays</span></h4>' +
    (lines.length ? profileCvTable(data, lines) : '<div class="msg info">No barangays match these filters.</div>') + profileCvMunicipalHtml(model, data) + '</div>';
}
function profileCvExportRows(model) {
  if (!model || !profileAllowed(model.key)) return [];
  var data = profileCvData(model), lines = profileCvLines(data, profileCvFilters()), stage1 = data.stage === 1;
  var head = ['Province', 'Municipality', 'Barangay'];
  data.bodies.forEach(function (b) { head.push(b.short + ' status', b.short + ' Chairperson', b.short + ' Member'); });
  head = head.concat(stage1 ? ['No committee'] : []).concat(['Total CVs', 'Women', 'Committees meeting the rules']);
  var cellText = function (c) {
    if (!data.loaded) return ['Not assessed', '', ''];
    return [c.status + (c.reasons.length ? ': ' + c.reasons.join('; ') : ''), c.members ? c.chairs : '', c.members ? c.others : ''];
  };
  return [head].concat(lines.map(function (l) {
    return [model.province, model.municipality, l.name].concat([].concat.apply([], l.cells.map(cellText))).concat(stage1 ? [data.loaded ? l.untagged : ''] : [])
      .concat([data.loaded ? l.total : '', data.loaded && l.total ? Math.round(l.women / l.total * 100) + '%' : '', data.loaded ? l.ok + '/' + l.cells.length : '']);
  }));
}
// Open the Volunteers module on one barangay (or the whole municipality) and committee.
function profileOpenVolunteers(place, body, position) {
  var parts = String(place || '').split('|');
  if (typeof VOL_STATE === 'undefined' || parts.length < 3) return;
  VOL_STATE.muni = parts[0] + '|' + parts[1]; VOL_STATE.brgy = parts[2] ? place : '';
  VOL_STATE.body = 'all'; VOL_STATE.position = position === 'chair' || position === 'member' ? position : 'all'; VOL_STATE.sex = 'all'; VOL_STATE.marg = 'all'; VOL_STATE.flag = 'all'; VOL_STATE.search = '';
  if (body === 'BREST' || body === 'SFMSC' || body === 'CMSC' || body === 'CSPMC') VOL_STATE.body = body;
  else if (body === 'nocommittee') VOL_STATE.flag = 'nocommittee';
  else if (body === 'SFMC') VOL_STATE.flag = 'otherbody';
  else if (body) { VOL_STATE.body = 'STAGE2'; if (PEOPLE_FLAGS.volunteers.some(function (f) { return f.id === body; })) VOL_STATE.flag = body; }
  go('volunteers');
}
// ---- Municipality directory (RPMO): a sortable table, one row per municipality.
var PROFILE_DIR = { search: '', sort: 'province', dir: 1, view: 'matrix', format: 'frac', order: 'rank', scope: 'all', mshow: 'all', msort: 'province', animate: true, viewLoaded: false };
var PROFILE_DIR_COLUMNS = [['name', 'Municipality'], ['province', 'Province'], ['barangays', 'Barangays'], ['progress', 'Progress'], ['encoded', 'Encoded'], ['attendees', 'With attendees'], ['movs', 'MOVs submitted'], ['quorum', 'HH quorum'], ['brest', 'BResT'], ['mrest', 'MResT'], ['backlog', 'Attendance due'], ['movDue', 'MOV due']];
function profileDirectoryRows() {
  var ix = profileIndex(), stage = PROFILE_STATE.stage;
  return ix.base.muniList.map(function (m) {
    var key = m.province + '|' + m.municipality, model = profileModel(key); if (!model) return null;
    var acts = profileStageActivities(model), mix = profileMixSum(acts.map(function (a) { return profileMix(model, a); }));
    var t = activityProgressSum(acts.map(function (a) { return a.tally; }));
    return { key: key, model: model, mix: mix, tally: t, kpi: profileKpis(model), backlog: acts.reduce(function (s, a) { return s + a.tally.backlog; }, 0),
      movDue: profileSequenceActivities(model).reduce(function (s, a) { return s + profileMovDue(a); }, 0), pct: mix.total ? mix.complete / mix.total : 0, stage: stage };
  }).filter(Boolean);
}
function profileDirKpiCells(k) {
  var q = k.quorums[0], dim = '<span class="muted">—</span>';
  function rate(v, good, warn) { return v === null ? dim : '<span class="' + (v >= good ? 'pok' : v >= warn ? 'pwarn' : 'pdue') + '">' + pctText(v) + '</span>'; }
  var ms = k.mrest && k.mrest.status;
  return '<td class="num">' + (k.assessed && q ? rate(q.rate, PROFILE_QUORUM, 0.5) : dim) + '</td><td class="num">' + (k.volunteersLoaded ? rate(k.brest.rate, 1, 0.5) : dim) + '</td>' +
    '<td class="num">' + (k.volunteersLoaded ? '<span class="' + (ms === 'complete' ? 'pok' : ms === 'incomplete' ? 'pwarn' : 'pdue') + '">' + esc(profileMrestLabel(k)) + '</span>' : dim) + '</td>';
}
function profileDirectorySort(rows, sort, dir) {
  function value(r) {
    return { name: r.model.municipality, province: r.model.province, barangays: r.model.barangays.length, progress: r.pct, encoded: r.tally.encoded / Math.max(1, r.tally.expected),
      attendees: r.tally.complete / Math.max(1, r.tally.expected), movs: r.tally.movSubmitted / Math.max(1, r.tally.movRequired), backlog: r.backlog, movDue: r.movDue,
      quorum: r.kpi.quorums[0] && r.kpi.quorums[0].rate !== null ? r.kpi.quorums[0].rate : -1, brest: r.kpi.brest.rate === null ? -1 : r.kpi.brest.rate,
      mrest: !r.kpi.mrest ? -1 : r.kpi.mrest.status === 'complete' ? (r.kpi.mrestVerified ? 3 : 2) : r.kpi.mrest.status === 'incomplete' ? 1 : 0 }[sort];
  }
  return rows.slice().sort(function (a, b) {
    var x = value(a), y = value(b), c = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return c * dir || a.model.province.localeCompare(b.model.province) || a.model.municipality.localeCompare(b.model.municipality);
  });
}
function profileDirectoryHtml() {
  var stage = PROFILE_STATE.stage, q = normSearch(PROFILE_DIR.search), tracker = !!LOADED.activityTracker;
  var all = profileDirectoryRows(), movs = all.length && all[0].model.movImported && stage === 1;
  var rows = profileDirectorySort(all.filter(function (c) { return !q || normSearch(c.model.municipality + ' ' + c.model.province).indexOf(q) !== -1; }), PROFILE_DIR.sort, PROFILE_DIR.dir);
  function frac(v, t, assessed) { return assessed ? '<b>' + n(v) + '</b><span class="muted">/' + n(t) + '</span>' : '<span class="muted">—</span>'; }
  var head = '<tr>' + PROFILE_DIR_COLUMNS.map(function (c) {
    var sorted = PROFILE_DIR.sort === c[0];
    return '<th scope="col" aria-sort="' + (sorted ? (PROFILE_DIR.dir > 0 ? 'ascending' : 'descending') : 'none') + '"' + (['name', 'province', 'progress'].indexOf(c[0]) === -1 ? ' class="num"' : '') + '><button type="button" class="pdir-sort" data-act="profile-dir-sort" data-v="' + c[0] + '">' + esc(c[1]) + '<span aria-hidden="true">' + (sorted ? (PROFILE_DIR.dir > 0 ? ' ▲' : ' ▼') : '') + '</span></button></th>';
  }).join('') + '<th><span class="sr-only">Open</span></th></tr>';
  var body = rows.map(function (c) {
    var m = c.model, t = c.tally;
    return '<tr class="pdir-row" data-act="profile-open-muni" data-v="' + attr(c.key) + '"><th scope="row"><button type="button" class="profile-cell-button" data-act="profile-open-muni" data-v="' + attr(c.key) + '">' + esc(m.municipality) + '</button></th><td>' + esc(m.province) + '</td><td class="num">' + n(m.barangays.length) + '</td>' +
      '<td class="pdir-progress">' + (tracker ? '<span class="pdir-pct">' + profilePct(c.mix.complete, c.mix.total) + '</span>' : '') + profileStack(c.mix, { tracker: tracker, size: 'sm' }) + '</td>' +
      '<td class="num">' + frac(t.encoded, t.expected, tracker) + '</td><td class="num">' + frac(t.complete, t.expected, tracker) + '</td><td class="num" title="' + attr(movs ? 'Required MOV forms submitted; ' + n(t.movsReady) + ' of ' + n(t.expected) + ' activities have every required MOV' : '') + '">' + frac(t.movSubmitted, t.movRequired, movs) + '</td>' + profileDirKpiCells(c.kpi) +
      '<td class="num">' + (tracker ? (c.backlog ? '<span class="pdue">' + n(c.backlog) + '</span>' : '0') : '—') + '</td><td class="num">' + (tracker && movs ? (c.movDue ? '<span class="pdue">' + n(c.movDue) + '</span>' : '0') : '—') + '</td><td class="pseq-go">Open →</td></tr>';
  }).join('');
  var region = profileMixSum(all.map(function (c) { return c.mix; }));
  profileDirLoadView();
  var matrix = PROFILE_DIR.view === 'matrix', swimlane = PROFILE_DIR.view === 'swimlane';
  var tabs = [['matrix', 'Activity & MOV checklist', 'grid'], ['list', 'Municipalities', 'building-2'], ['swimlane', 'Activity swimlane', 'map-pin']].map(function (t) {
    var on = PROFILE_DIR.view === t[0];
    return '<button type="button" role="tab" class="sub-nav-btn' + (on ? ' active' : '') + '" id="profile-dir-tab-' + t[0] + '" data-act="profile-dir-view" data-v="' + t[0] + '" aria-selected="' + on + '" tabindex="' + (on ? '0' : '-1') + '">' + icon(t[2]) + '<span>' + esc(t[1]) + '</span></button>';
  }).join('');
  var actions = matrix ? '<div class="pdm-format" role="group" aria-label="Show values as">' +
      [['frac', 'x/y'], ['pct', '%']].map(function (f) { return '<button type="button" data-act="profile-dir-format" data-v="' + f[0] + '" aria-pressed="' + (PROFILE_DIR.format === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      profileButton('profile-dir-matrix-export', 'Export checklist') : swimlane ? '<div class="pdm-format" role="group" aria-label="Course">' +
      [['all', 'All stages'], ['stage', 'Stage ' + stage + ' only']].map(function (f) { return '<button type="button" data-act="profile-race-scope" data-v="' + f[0] + '" aria-pressed="' + ((PROFILE_DIR.scope === 'stage' ? 'stage' : 'all') === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<div class="pdm-format" role="group" aria-label="Lane order">' +
      [['rank', 'Leaders first'], ['province', 'By province']].map(function (f) { return '<button type="button" data-act="profile-race-order" data-v="' + f[0] + '" aria-pressed="' + ((PROFILE_DIR.order === 'province' ? 'province' : 'rank') === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      profileButton('profile-race-replay', 'Replay race') : '';
  // The tab row carries the search and the view's own controls, so the content starts right under it.
  var search = '<label class="field psearch"><span class="sr-only">Find municipality</span><input id="profile-dir-search" type="search" value="' + attr(PROFILE_DIR.search) + '" placeholder="Find municipality or province…" aria-label="Find municipality or province"></label>';
  return '<h1 class="sr-only">Municipality profiles, Stage ' + stage + ', ' + all.length + ' monitored municipalities</h1>' +
    '<div class="profile-controls profile-tabbar pdir-tabbar"><div class="sub-nav-tabs profile-home-tabs" role="tablist" aria-label="Municipality view">' + tabs + '</div><div class="row-actions">' + search + actions + '</div></div>' +
    (!swimlane && !matrix ? '<div class="pdir-region"><span class="eyebrow">Region-wide progress · Stage ' + stage + ' · ' + all.length + ' municipalities</span>' + profileStack(region, { tracker: tracker, head: true }) + '</div>' : '') +
    (swimlane ? profileSwimlaneHtml(rows, all) : matrix ? profileDirMatrixHtml(rows.slice().sort(function (a, b) { return a.model.province.localeCompare(b.model.province) || a.model.municipality.localeCompare(b.model.municipality); }), all) :
      profileLegend(movs) + (rows.length ? '<div class="table-wrap pdir-wrap"><table class="grid pdir-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' : '<div class="msg info">No municipalities match “' + esc(PROFILE_DIR.search) + '”.</div>'));
}

// Actual End is the swimlane's conduct measure; attendance/MOV tallies elsewhere stay independent.
// The course is one stage's activities, or with 'all' every stage's in sequence.
function profileRaceActivities(model, stage) {
  return stage === 'all' ? model.activities.filter(function (a) { return !a.appraisal; }).sort(function (a, b) { return a.stage - b.stage; }) : profileStageActivities(model, stage);
}
function profileRaceScope() { return PROFILE_DIR.scope === 'stage' ? PROFILE_STATE.stage : 'all'; }
function profileSwimlaneData(model, stage) {
  var cells = profileRaceActivities(model, stage).map(function (a) {
    var expected = a.rows.filter(function (r) { return r.expected; });
    var completed = model.trackerImported ? expected.filter(function (r) { return r.attendance && trackerIsDate(r.attendance.dateEnd); }).length : 0;
    return { activity: a, target: expected.length, completed: completed,
      status: !expected.length ? 'na' : !model.trackerImported ? 'unassessed' : completed === expected.length ? 'complete' : completed ? 'partial' : 'none' };
  });
  var applicable = cells.filter(function (c) { return c.target > 0; });
  var first = applicable.filter(function (c) { return c.status !== 'complete'; })[0];
  return { cells: cells, current: model.trackerImported && first ? first.activity.code : '',
    status: !model.trackerImported ? 'unassessed' : !applicable.length ? 'na' : first ? 'active' : 'complete' };
}
function profileSwimmerIcon() {
  return '<svg class="psw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="17" cy="6" r="2"/><path d="m4 12 5-5 5 4 3 2M9 7l3-4 3 1M2 17q2-2 4 0t4 0t4 0t4 0t4 0M2 21q2-2 4 0t4 0t4 0t4 0t4 0"/></svg>';
}
function profileOrdinal(v) { var t = v % 100; return v + (t > 10 && t < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] || 'th'); }
// Race position: the activities cleared before the first gap, plus the share of that activity's locations already
// completed. Later completions count toward the overall share, which only breaks ties.
function profileRaceStanding(data) {
  var cells = data.cells, done = 0, target = 0, at = cells.length, share = 0;
  cells.forEach(function (c, i) { done += c.completed; target += c.target; if (c.activity.code === data.current) { at = i; share = c.target ? c.completed / c.target : 0; } });
  var racing = data.status === 'active' || data.status === 'complete';
  return { racing: racing, at: at, share: share, position: racing ? at + share : -1, done: done, target: target, overall: target ? done / target : 0 };
}
/** Every lane with its standing; equal positions share a place and the next place follows without a gap (1, 2, 2, 3). */
function profileRaceField(rows, stage) {
  var field = rows.map(function (entry) { var data = profileSwimlaneData(entry.model, stage); return { entry: entry, data: data, standing: profileRaceStanding(data), rank: 0 }; });
  function gap(a, b) { return b.standing.position - a.standing.position || b.standing.overall - a.standing.overall; }
  var order = field.filter(function (f) { return f.standing.racing; }).sort(function (a, b) {
    return gap(a, b) || a.entry.model.province.localeCompare(b.entry.model.province) || a.entry.model.municipality.localeCompare(b.entry.model.municipality);
  });
  order.forEach(function (f, i) { f.rank = !i ? 1 : order[i - 1].rank + (Math.abs(gap(order[i - 1], f)) < 1e-9 ? 0 : 1); });
  return field;
}
function profileSwimlaneHtml(rows, all) {
  if (isMunicipalUser()) return '';
  var scope = profileRaceScope(), whole = scope === 'all';
  var intro = '<section class="psw-section" aria-label="Activity swimlane">';
  var help = '<details class="pdm-help"><summary>How the race works</summary><p class="tiny muted">' + (whole ? 'Every municipality swims its own lane through every stage, from the first Stage 1 activity to the last of the final stage.' : 'Every municipality swims its own lane through Stage ' + PROFILE_STATE.stage + '.') + ' The swimmer is in the first unfinished activity, moved along by the share of its locations already completed. A location is completed when its Activity Tracker record has a valid Actual End date. Later completions remain visible. Select a checkpoint to open that activity.</p></details>';
  var legend = '<div class="psw-legend" aria-label="Swimlane legend"><span class="psw-complete">✓ Completed</span><span class="psw-partial">◐ Partially completed</span><span class="psw-none">○ No completion recorded</span><span>' + profileSwimmerIcon() + ' Current position and place</span></div>';
  if (!rows.length) return intro + legend + '<div class="msg info">No municipalities match “' + esc(PROFILE_DIR.search) + '”.</div></section>';
  var acts = profileRaceActivities(rows[0].model, scope);
  if (!acts.length) return intro + legend + '<div class="msg info">No activities are configured for this stage.</div></section>';
  var done = whole ? 'All stages complete' : 'Stage complete';
  // The first activity of each later stage starts a new leg of the course.
  var legs = [], legStart = {}; acts.forEach(function (a, i) { var last = legs[legs.length - 1]; if (last && last.stage === a.stage) last.count++; else { legs.push({ stage: a.stage, count: 1 }); if (i) legStart[a.code] = true; } });
  // Places are decided against every monitored municipality, so a search never changes anyone's place.
  var shown = {}; rows.forEach(function (r) { shown[r.key] = true; });
  var field = profileRaceField(all && all.length ? all : rows, scope).filter(function (f) { return shown[f.entry.key]; });
  var byRank = PROFILE_DIR.order !== 'province';
  field.sort(function (a, b) {
    var place = byRank ? (a.rank || 1e9) - (b.rank || 1e9) : 0;
    return place || a.entry.model.province.localeCompare(b.entry.model.province) || a.entry.model.municipality.localeCompare(b.entry.model.municipality);
  });
  var count = { finished: 0, swimming: 0, blocks: 0, out: 0 };
  field.forEach(function (f) { count[f.data.status === 'complete' ? 'finished' : !f.standing.racing ? 'out' : f.standing.done ? 'swimming' : 'blocks']++; });
  var leader = field.filter(function (f) { return f.rank; }).sort(function (a, b) { return a.rank - b.rank; })[0];
  var summary = !LOADED.activityTracker ? '' : '<div class="psw-summary" aria-label="Race summary"><span><b>' + n(count.finished) + '</b> finished</span><span><b>' + n(count.swimming) + '</b> swimming</span><span><b>' + n(count.blocks) + '</b> on the blocks</span>' +
    (count.out ? '<span><b>' + n(count.out) + '</b> not in the race</span>' : '') + (leader ? '<span class="psw-lead">In front: <b>' + esc(leader.entry.model.municipality) + '</b></span>' : '') + '</div>';
  // Race board: the three leaders, and a dot for every municipality stacked over the activity it is currently in,
  // which shows at a glance where the field is bunched up.
  var racers = field.filter(function (f) { return f.standing.racing; }).sort(function (a, b) { return a.rank - b.rank; }), board = '';
  if (LOADED.activityTracker && racers.length) {
    var podium = racers.slice(0, 3).map(function (f) {
      var m = f.entry.model, st = f.standing, cur = f.data.cells[st.at];
      var where = f.data.status === 'complete' ? done : 'Activity ' + esc(cur.activity.seq) + ' · ' + esc(cur.activity.label) + ' · ' + cur.completed + '/' + cur.target;
      return '<li><span class="psw-rank psw-rank-' + f.rank + '">' + f.rank + '</span><div>' + profileButton('profile-open-muni', m.municipality, m.key) +
        '<span class="psw-note">' + esc(m.province) + ' · ' + where + '</span><span class="psw-meter" aria-hidden="true"><i style="width:' + Math.round(st.position / acts.length * 100) + '%"></i></span></div></li>';
    }).join('');
    var buckets = acts.map(function () { return []; }), home = [];
    racers.forEach(function (f) { (f.data.status === 'complete' ? home : buckets[f.standing.at]).push(f); });
    var most = Math.max.apply(null, buckets.map(function (b) { return b.length; }));
    var dots = function (list) {
      return list.map(function (f) {
        var m = f.entry.model, label = m.municipality + ', ' + m.province + ' · ' + profileOrdinal(f.rank) + ' place · show its lane';
        return '<button type="button" class="psw-dot' + (f.rank < 4 ? ' psw-rank-' + f.rank : '') + '" data-act="profile-race-focus" data-v="' + attr(m.key) + '" title="' + attr(label) + '" aria-label="' + attr(label) + '"></button>';
      }).join('');
    };
    var strip = acts.map(function (a, i) {
      var list = buckets[i];
      return '<div class="psw-field-col' + (legStart[a.code] ? ' psw-leg-start' : '') + (most > 1 && list.length === most ? ' psw-busiest' : '') + '" title="' + attr('Activity ' + a.seq + ' · ' + a.label + ' · ' + list.length + ' here') + '"><div class="psw-dots">' + dots(list) + '</div><b>' + (list.length || '') + '</b><span>' + esc(a.seq) + '</span></div>';
    }).join('') + '<div class="psw-field-col psw-field-fin" title="' + attr(done + ' · ' + home.length) + '"><div class="psw-dots">' + dots(home) + '</div><b>' + (home.length || '') + '</b><span>Finish</span></div>';
    board = '<div class="psw-board"><div class="psw-board-part"><h3>Leaders</h3><ol class="psw-podium">' + podium + '</ol></div>' +
      '<div class="psw-board-part psw-board-field"><h3>Where the field is</h3><p class="tiny muted">One dot per municipality, over the activity it is currently in. Select a dot to jump to its lane.</p>' +
      '<div class="psw-field" style="--n:' + acts.length + '">' + strip + '</div></div></div>';
  }
  var head = '<div class="psw-head"><div class="psw-name">Municipality</div><div class="psw-track">' +
    (whole ? legs.map(function (l, i) { return '<span class="psw-leg' + (i ? ' psw-leg-start' : '') + '" style="grid-column:span ' + l.count + '">Stage ' + esc(l.stage) + '</span>'; }).join('') + '<span class="psw-leg psw-fin"></span>' : '') +
    acts.map(function (a) {
      return '<span' + (legStart[a.code] ? ' class="psw-leg-start"' : '') + '><span class="psw-seq">Activity ' + esc(a.seq) + '</span>' + esc(a.label) + '</span>';
    }).join('') + '<span class="psw-fin"><span class="psw-seq">Finish</span>' + done + '</span></div></div>';
  var animate = PROFILE_DIR.animate !== false; PROFILE_DIR.animate = false;
  var province = null, body = field.map(function (f, index) {
    var m = f.entry.model, data = f.data, st = f.standing, group = '';
    if (!byRank && province !== m.province) { province = m.province; group = '<div class="psw-province"><span>' + esc(province) + '</span></div>'; }
    var place = f.rank ? profileOrdinal(f.rank) : '';
    var note = data.status === 'unassessed' ? 'Not assessed' : data.status === 'na' ? 'No applicable activities' : data.status === 'complete' ? done : n(st.done) + '/' + n(st.target) + ' · ' + profilePct(st.done, st.target);
    var cells = data.cells.map(function (c) {
      var current = data.current === c.activity.code;
      var label = { na: '— No target', unassessed: '— Not assessed', complete: '✓ Completed', partial: '◐ Partially completed', none: '○ No completion recorded' }[c.status];
      var tally = c.target && m.trackerImported ? c.completed + '/' + c.target : '';
      var full = m.municipality + ', ' + m.province + ' · ' + (whole ? 'Stage ' + c.activity.stage + ' · ' : '') + c.activity.label + ' · ' + label + (tally ? ' · ' + tally + (c.activity.level === 'Municipal' ? ' municipality completed' : ' barangays completed') : '') + (current ? ' · First unfinished activity' + (place ? ' · ' + place + ' place' : '') : '');
      return '<button type="button" class="psw-cell psw-' + c.status + (current ? ' psw-current' : '') + (legStart[c.activity.code] ? ' psw-leg-start' : '') + '" data-act="profile-dir-cell" data-v="' + attr(m.key) + '" data-code="' + attr(c.activity.code) + '" title="' + attr(full) + '" aria-label="' + attr(full) + '"' + (current ? ' aria-current="step"' : '') + '>' +
        '<span class="psw-state" aria-hidden="true">' + label.charAt(0) + '</span>' + (tally ? '<span class="psw-count">' + tally + '</span>' : '') + '</button>';
    }).join('');
    var finish = data.status === 'complete' ? '<button type="button" class="psw-finished-marker" data-act="profile-dir-cell" data-v="' + attr(m.key) + '" data-code="' + attr(data.cells.filter(function (c) { return c.target; }).slice(-1)[0].activity.code) + '" aria-label="' + attr(m.municipality + ', ' + m.province + ' · ' + done + ' · Open last applicable activity') + '">✓ Finished</button>' : '';
    var swimmer = st.racing ? '<span class="psw-wake" aria-hidden="true"></span><span class="psw-swimmer" aria-hidden="true"><span class="psw-marker">' + profileSwimmerIcon() + '<strong>' + place + '</strong></span></span>' : '';
    return group + '<div class="psw-lane psw-is-' + data.status + '" role="listitem" data-key="' + attr(m.key) + '" style="--i:' + Math.min(index, 24) + '">' +
      '<div class="psw-name">' + (f.rank ? '<span class="psw-rank' + (f.rank < 4 ? ' psw-rank-' + f.rank : '') + '" title="' + place + ' place">' + f.rank + '</span>' : '<span class="psw-rank" aria-hidden="true">—</span>') +
      '<div>' + profileButton('profile-open-muni', m.municipality, m.key) + '<span class="psw-note">' + (byRank ? esc(m.province) + ' · ' : '') + note + '</span></div></div>' +
      '<div class="psw-track' + (data.status === 'complete' ? ' psw-done' : '') + '" style="--at:' + (st.racing ? st.at : 0) + ';--f:' + (Math.round(st.share * 1000) / 1000) + '">' + cells + '<div class="psw-fin' + (data.status === 'complete' ? ' psw-complete' : '') + '">' + finish + '</div>' + swimmer + '</div></div>';
  }).join('');
  return intro + summary + board + legend + (!LOADED.activityTracker ? '<div class="msg info">Import Activity Tracker to assess conduct dates and position the municipalities.</div>' : '') +
    '<div class="psw-wrap" role="region" tabindex="0" aria-label="' + (whole ? 'All stages' : 'Stage ' + PROFILE_STATE.stage) + ' municipality activity swimlane, ' + (byRank ? 'leaders first' : 'grouped by province') + '; scroll to view more activities">' +
    '<div class="psw-race' + (animate ? ' psw-go' : '') + (acts.length > 10 ? ' psw-long' : '') + '" style="--n:' + acts.length + '">' + head + '<div role="list" aria-label="Lanes">' + body + '</div></div></div>' + help + '</section>';
}

// ---- Municipal Activity & MOV checklist: the manager's overview. Municipalities are rows; each activity is a
// column group of Encoded, With attendees and MOVs (required MOV forms submitted), shown as x/y or as a percentage.
function profileDirLoadView() {
  if (PROFILE_DIR.viewLoaded) return;
  PROFILE_DIR.viewLoaded = true;
  var saved = (prefs().profileDirectory) || {};
  // The checklist opens first unless the user previously selected another directory view.
  PROFILE_DIR.view = ['list', 'swimlane'].indexOf(saved.view) !== -1 ? saved.view : 'matrix';
  PROFILE_DIR.format = saved.format === 'pct' ? 'pct' : 'frac';
  PROFILE_DIR.order = saved.order === 'province' ? 'province' : 'rank';
  PROFILE_DIR.scope = saved.scope === 'stage' ? 'stage' : 'all';
  PROFILE_DIR.mshow = saved.mshow === 'behind' ? 'behind' : 'all';
  PROFILE_DIR.msort = saved.msort === 'low' ? 'low' : 'province';
}
function profileDirSaveView() { var p = prefs(); p.profileDirectory = { view: PROFILE_DIR.view, format: PROFILE_DIR.format, order: PROFILE_DIR.order, scope: PROFILE_DIR.scope, mshow: PROFILE_DIR.mshow, msort: PROFILE_DIR.msort }; savePrefs(p); }
var PROFILE_DIR_OVERALL = '__overall';
/** The column groups: Overall (one combined percentage), then each activity of the stage in sequence with the measures it has. */
function profileDirMatrixColumns(models) {
  var model = models[0]; if (!model) return [];
  var stage = PROFILE_STATE.stage, acts = profileStageActivities(model, stage);
  if (!acts.length) return [];
  // [key, full label, short header label]
  function measures(withMovs) { return [['encoded', 'Encoded', 'Enc'], ['attendees', 'With attendees', 'Att']].concat(withMovs ? [['movs', 'MOVs', 'MOV']] : []); }
  var overall = { act: { code: PROFILE_DIR_OVERALL, label: 'Overall', seq: 'Stage ' + stage, level: '', overall: true, requirements: [] },
    measures: [['overall', 'Overall', '%']], parts: measures(acts.some(function (a) { return a.requirements.length; })) };
  return [overall].concat(acts.map(function (a) { return { act: a, measures: measures(a.requirements.length > 0) }; }));
}
/** One activity's figures, or all of the stage's activities added up: { encoded, attendees, movs } as { v, t, assessed }. */
function profileDirMatrixParts(model, code) {
  var tracker = !!model.trackerImported, movs = !!model.movImported && PROFILE_STATE.stage === 1, t, hasMovs;
  if (code === PROFILE_DIR_OVERALL) {
    var acts = profileStageActivities(model, PROFILE_STATE.stage);
    t = activityProgressSum(acts.map(function (a) { return a.tally; }));
    hasMovs = acts.some(function (a) { return a.requirements.length; });
  } else {
    var a = model.byCode[code]; t = a ? a.tally : null; hasMovs = !!(a && a.requirements.length);
  }
  if (!t) return null;
  return { encoded: { v: t.encoded, t: t.expected, assessed: tracker }, attendees: { v: t.complete, t: t.expected, assessed: tracker },
    movs: { v: t.movSubmitted || 0, t: t.movRequired || 0, assessed: movs && hasMovs } };
}
/**
 * Overall: the Encoded, With attendees and MOVs rates averaged with equal weight, so the many MOV forms do not
 * outweigh the two attendance measures. Only measures that are assessed and have a target take part.
 */
function profileDirCombine(parts, keys) {
  var used = keys.map(function (k) { return parts && parts[k]; }).filter(function (x) { return x && x.assessed && x.t; });
  if (!used.length) return { rate: null, assessed: false, parts: parts, keys: keys };
  return { rate: used.reduce(function (s, x) { return s + x.v / x.t; }, 0) / used.length, assessed: true, parts: parts, keys: keys, used: used.length };
}
function profileDirMatrixValues(model, code) {
  var parts = profileDirMatrixParts(model, code); if (!parts) return null;
  if (code !== PROFILE_DIR_OVERALL) return parts;
  var keys = ['encoded', 'attendees'].concat(parts.movs.assessed ? ['movs'] : []);
  return { overall: profileDirCombine(parts, keys) };
}
/** Overall's cells are set apart, with a heavier divider after its last column. */
function profileDirOverallCss(col, i) { return col.act.overall ? ' pdm-overall' + (i === col.measures.length - 1 ? ' pdm-overall-end' : '') : ''; }
function profileDirMatrixText(x, format) {
  if (!x || !x.assessed) return '—';
  if (x.rate !== undefined) return Math.round(x.rate * 100) + '%';   // Overall is always a percentage
  if (!x.t) return format === 'pct' ? 'N/A' : '0/0';
  return format === 'pct' ? Math.round(x.v / x.t * 100) + '%' : n(x.v) + '/' + n(x.t);
}
function profileDirMatrixCss(x) {
  if (!x || !x.assessed) return 'pdm-na';
  var r = x.rate !== undefined ? x.rate : (x.t ? x.v / x.t : null);
  if (r === null) return 'pdm-na';
  return r >= 1 ? 'pdm-ok' : r >= 0.5 ? 'pdm-mid' : 'pdm-low';
}
/** "Encoded 100% · With attendees 58% · MOVs 19%" behind an Overall figure. */
function profileDirOverallTitle(x) {
  if (!x || !x.assessed) return 'not assessed';
  var labels = { encoded: 'Encoded', attendees: 'With attendees', movs: 'MOVs' };
  return Math.round(x.rate * 100) + '%, the average of ' + x.keys.filter(function (k) { var p = x.parts[k]; return p && p.assessed && p.t; }).map(function (k) {
    var p = x.parts[k]; return labels[k] + ' ' + Math.round(p.v / p.t * 100) + '% (' + n(p.v) + ' of ' + n(p.t) + ')';
  }).join(', ');
}
/** One summary tile: a rate with its counts and a meter, coloured like the cells below it. */
function profileDirTile(label, x, note, main) {
  var assessed = x && x.assessed && (x.rate !== undefined ? x.rate !== null : x.t > 0), rate = !assessed ? 0 : x.rate !== undefined ? x.rate : x.v / x.t;
  return '<div class="pdm-tile' + (main ? ' pdm-tile-main' : '') + ' ' + profileDirMatrixCss(assessed ? x : null) + '"><span class="pdm-tile-label">' + esc(label) + '</span>' +
    '<strong>' + (assessed ? Math.round(rate * 100) + '%' : '—') + '</strong>' +
    '<span class="pdm-meter" aria-hidden="true"><i style="width:' + Math.round(rate * 100) + '%"></i></span>' +
    '<small>' + (assessed ? note : 'Not assessed') + '</small></div>';
}
function profileDirMatrixHtml(rows, all) {
  var cols = profileDirMatrixColumns(all.map(function (c) { return c.model; })), format = PROFILE_DIR.format;
  if (!cols.length) return '<div class="msg info">No activities are configured for this stage.</div>';
  if (!rows.length) return '<div class="msg info">No municipalities match “' + esc(PROFILE_DIR.search) + '”.</div>';
  var tracker = !!LOADED.activityTracker, movs = all[0].model.movImported && PROFILE_STATE.stage === 1;
  // Without a MOV import the MOV columns would be a third of the table saying nothing, so they are left out.
  if (!movs) cols = cols.map(function (c) { return c.act.overall ? c : { act: c.act, measures: c.measures.filter(function (m) { return m[0] !== 'movs'; }) }; });
  var hasMovCols = cols.some(function (c) { return !c.act.overall && c.measures.length > 2; });
  // Overall is a single column, so its heading spans both header rows like the Municipality heading.
  var head1 = '<tr><th scope="col" rowspan="2" class="pdm-name">Municipality</th>' + cols.map(function (c) {
    if (c.act.overall) return '<th scope="col" rowspan="2" class="pdm-act pdm-overall pdm-overall-end pdm-first" title="' + attr('Average of ' + c.parts.map(function (p) { return p[1]; }).join(', ') + ' across all Stage ' + PROFILE_STATE.stage + ' activities') + '"><span class="pdm-seq">' + esc(c.act.seq) + '</span><span class="pdm-label">Overall</span></th>';
    return '<th scope="colgroup" colspan="' + c.measures.length + '" class="pdm-act" title="' + attr(c.act.label) + '"><span class="pdm-seq">Activity ' + esc(c.act.seq) + (c.act.level === 'Municipal' ? ' · Municipal' : '') + '</span><span class="pdm-label">' + esc(c.act.label) + '</span></th>';
  }).join('') + '</tr>';
  var head2 = '<tr>' + cols.filter(function (c) { return !c.act.overall; }).map(function (c) { return c.measures.map(function (m, i) { return '<th scope="col" class="pdm-measure' + (i === 0 ? ' pdm-first' : '') + '" title="' + attr(m[1]) + '"><abbr title="' + attr(m[1]) + '" aria-label="' + attr(m[1]) + '">' + esc(m[2]) + '</abbr></th>'; }).join(''); }).join('') + '</tr>';
  // Every municipality's figures are worked out once, then summed for the tiles and again for the rows on screen.
  var lines = rows.map(function (c) {
    var vals = {}; cols.forEach(function (col) { vals[col.act.code] = profileDirMatrixValues(c.model, col.act.code); });
    var o = vals[PROFILE_DIR_OVERALL] && vals[PROFILE_DIR_OVERALL].overall;
    return { c: c, vals: vals, overall: o, rate: o && o.assessed ? o.rate : null };
  });
  // Totals add counts and targets, so each percentage is the region's own rate, not an average of municipal rates.
  // Overall's region figure combines the region's own Encoded, With attendees and MOVs rates the same way.
  function sum(list) {
    var totals = {};
    function add(k, x) { if (x && x.assessed) { totals[k] = totals[k] || { v: 0, t: 0, assessed: true }; totals[k].v += x.v; totals[k].t += x.t; } }
    list.forEach(function (l) {
      cols.forEach(function (col) {
        if (col.act.overall) { if (l.overall) l.overall.keys.forEach(function (k) { add(PROFILE_DIR_OVERALL + '|' + k, l.overall.parts[k]); }); }
        else col.measures.forEach(function (ms) { add(col.act.code + '|' + ms[0], l.vals[col.act.code] && l.vals[col.act.code][ms[0]]); });
      });
    });
    return totals;
  }
  function overallOf(totals) {
    var keys = cols[0].parts.map(function (p) { return p[0]; }), parts = {};
    keys.forEach(function (k) { parts[k] = totals[PROFILE_DIR_OVERALL + '|' + k]; });
    return profileDirCombine(parts, keys.filter(function (k) { return parts[k]; }));
  }
  var whole = rows.length === all.length, region = sum(lines), regionOverall = overallOf(region);
  var behind = lines.filter(function (l) { return l.rate !== null && l.rate < 1 - 1e-9; }), full = lines.filter(function (l) { return l.rate !== null && l.rate >= 1 - 1e-9; }).length;
  var noun = { encoded: 'activity targets', attendees: 'activity targets', movs: 'required MOV forms' }, names = { encoded: 'Encoded', attendees: 'With attendees', movs: 'MOVs submitted' };
  var summary = '<div class="pdm-summary" aria-label="' + (whole ? 'Region' : 'Shown municipalities') + ' summary, Stage ' + PROFILE_STATE.stage + '">' +
    profileDirTile((whole ? 'Region' : 'Shown') + ' overall · Stage ' + PROFILE_STATE.stage, regionOverall, n(full) + ' of ' + n(lines.length) + ' municipalities at 100%', true) +
    cols[0].parts.filter(function (p) { return p[0] !== 'movs' || movs; }).map(function (p) {
      var x = region[PROFILE_DIR_OVERALL + '|' + p[0]];
      return profileDirTile(names[p[0]], x, x ? n(x.v) + ' of ' + n(x.t) + ' ' + noun[p[0]] : '');
    }).join('') + '</div>';
  var show = PROFILE_DIR.mshow === 'behind' ? 'behind' : 'all', sort = PROFILE_DIR.msort === 'low' ? 'low' : 'province';
  function seg(label, act, options, current) {
    return '<div class="pdm-format" role="group" aria-label="' + label + '">' + options.map(function (o) { return '<button type="button" data-act="' + act + '" data-v="' + o[0] + '" aria-pressed="' + (current === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  var toolbar = '<div class="pdm-toolbar"><div class="pmap-legend pdm-legend" aria-label="Checklist legend"><span><i class="pdm-swatch pdm-ok"></i>100%</span><span><i class="pdm-swatch pdm-mid"></i>50–99%</span><span><i class="pdm-swatch pdm-low"></i>Below 50%</span><span><i class="pdm-swatch pdm-na"></i>Not assessed or no target</span></div>' +
    '<div class="pdm-tools">' + seg('Show municipalities', 'profile-dir-matrix-show', [['all', 'All <b>' + n(lines.length) + '</b>'], ['behind', 'Below 100% <b>' + n(behind.length) + '</b>']], show) +
    seg('Order', 'profile-dir-matrix-sort', [['province', 'By province'], ['low', 'Lowest first']], sort) + '</div></div>';
  var shown = show === 'behind' ? behind : lines;
  if (sort === 'low') shown = shown.slice().sort(function (a, b) { return (a.rate === null ? 2 : a.rate) - (b.rate === null ? 2 : b.rate) || a.c.model.municipality.localeCompare(b.c.model.municipality); });
  var perProvince = {}; shown.forEach(function (l) { perProvince[l.c.model.province] = (perProvince[l.c.model.province] || 0) + 1; });
  var province = null, span = 1 + cols.reduce(function (t, c) { return t + c.measures.length; }, 0);
  var body = shown.map(function (l) {
    var c = l.c, m = c.model, out = '';
    if (sort === 'province' && m.province !== province) { province = m.province; out += '<tr class="pdm-prov"><th scope="rowgroup" colspan="' + span + '"><span>' + esc(province) + ' <small>' + n(perProvince[province]) + '</small></span></th></tr>'; }
    out += '<tr><th scope="row" class="pdm-name"><button type="button" class="profile-cell-button" data-act="profile-open-muni" data-v="' + attr(c.key) + '">' + esc(m.municipality) + '</button>' + (sort === 'low' ? '<span class="pdm-sub">' + esc(m.province) + '</span>' : '') + '</th>' + cols.map(function (col) {
      var vals = l.vals[col.act.code];
      if (col.act.overall) {
        var o = l.overall, ot = m.municipality + ' · Overall: ' + profileDirOverallTitle(o);
        return '<td class="pdm-cell ' + profileDirMatrixCss(o) + ' pdm-first' + profileDirOverallCss(col, 0) + '"><button type="button" data-act="profile-dir-cell" data-v="' + attr(c.key) + '" data-code="" title="' + attr(ot) + '" aria-label="' + attr(ot) + '">' + profileDirMatrixText(o, format) + (l.rate !== null ? '<i class="pdm-bar" aria-hidden="true"><b style="width:' + Math.round(l.rate * 100) + '%"></b></i>' : '') + '</button></td>';
      }
      return col.measures.map(function (ms, i) {
        var x = vals && vals[ms[0]];
        var title = m.municipality + ' · ' + col.act.label + ' · ' + ms[1] + ': ' + (x && x.assessed ? n(x.v) + ' of ' + n(x.t) + (ms[0] === 'movs' ? ' required MOV forms' : '') : 'not assessed');
        return '<td class="pdm-cell ' + profileDirMatrixCss(x) + (i === 0 ? ' pdm-first' : '') + '"><button type="button" data-act="profile-dir-cell" data-v="' + attr(c.key) + '" data-code="' + attr(col.act.code) + '" title="' + attr(title) + '" aria-label="' + attr(title) + '">' + profileDirMatrixText(x, format) + '</button></td>';
      }).join('');
    }).join('') + '</tr>';
    return out;
  }).join('');
  var totals = shown === lines ? region : sum(shown);
  var foot = '<tr class="pdm-total"><th scope="row" class="pdm-name">' + (shown.length === all.length ? 'Region total' : 'Total shown') + '</th>' + cols.map(function (col) {
    if (col.act.overall) {
      var o = overallOf(totals);
      return '<td class="pdm-cell ' + profileDirMatrixCss(o) + ' pdm-first' + profileDirOverallCss(col, 0) + '" title="' + attr('Overall: ' + profileDirOverallTitle(o)) + '">' + profileDirMatrixText(o, format) + '</td>';
    }
    return col.measures.map(function (ms, i) { var x = totals[col.act.code + '|' + ms[0]]; return '<td class="pdm-cell ' + profileDirMatrixCss(x) + (i === 0 ? ' pdm-first' : '') + '">' + profileDirMatrixText(x, format) + '</td>'; }).join('');
  }).join('') + '</tr>';
  var notes = (!tracker ? '<div class="msg info">Import Activity Tracker to assess encoding and attendance.</div>' : '') +
    (PROFILE_STATE.stage === 1 && !movs ? '<div class="msg warn">Import KCIS MOV attachments to assess MOV submission. The MOV columns appear once they are imported.</div>' : '');
  var help = '<details class="pdm-help"><summary>How these figures are counted</summary><p class="tiny muted"><b>Enc</b> Encoded and <b>Att</b> With attendees count against each activity\'s target (barangays, or the municipality for municipal activities).' + (hasMovCols ? ' <b>MOV</b> counts the required MOV forms submitted.' : '') +
    ' Overall is one percentage per municipality: the average of its Encoded, With attendees and MOVs rates across all of the stage\'s activities (hover it for the parts). Totals add counts and targets, so a total is the region\'s own rate. Click a figure to open that activity in the municipality profile.</p></details>';
  return notes + summary + toolbar +
    (shown.length ? '<div class="table-wrap pdm-wrap"><table class="grid pdm-table' + (sort === 'low' ? ' pdm-ranked' : '') + '"><thead>' + head1 + head2 + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>' :
      '<div class="msg info">Every municipality shown is at 100%.</div>') + help;
}
/** CSV of the matrix: Overall as a percentage, then counts and targets in their own columns, whatever the on-screen format. */
function profileDirMatrixExportRows() {
  var all = profileDirectoryRows(), cols = profileDirMatrixColumns(all.map(function (c) { return c.model; }));
  var head = ['Province', 'Municipality'];
  cols.forEach(function (c) {
    if (c.act.overall) { head.push('Overall (Stage ' + PROFILE_STATE.stage + ') %'); return; }
    var l = c.act.seq + ' ' + c.act.label;
    head.push(l + ' · Encoded', l + ' · With attendees', l + ' · Target');
    if (c.measures.length > 2) head.push(l + ' · MOV forms submitted', l + ' · MOV forms required');
  });
  var rows = all.slice().sort(function (a, b) { return a.model.province.localeCompare(b.model.province) || a.model.municipality.localeCompare(b.model.municipality); }).map(function (c) {
    var line = [c.model.province, c.model.municipality];
    cols.forEach(function (col) {
      var v = profileDirMatrixValues(c.model, col.act.code) || {};
      if (col.act.overall) { line.push(v.overall && v.overall.assessed ? Math.round(v.overall.rate * 1000) / 10 : 'Not assessed'); return; }
      function val(x, key) { return x && x.assessed ? x[key] : 'Not assessed'; }
      line.push(val(v.encoded, 'v'), val(v.attendees, 'v'), v.encoded ? v.encoded.t : '');
      if (col.measures.length > 2) line.push(val(v.movs, 'v'), val(v.movs, 't'));
    });
    return line;
  });
  return [head].concat(rows);
}

// ---- Barangay list filters: a search box and quick-filter chips over the same filter fields.
var PROFILE_QUICK = [['', 'All', {}], ['missing', 'Not encoded', { encoding: 'missing' }], ['zero', 'No attendees', { attendance: 'zero' }], ['backlog', 'Attendance due', { backlog: 'due' }],
  ['below', 'Below 70% quorum', { quorum: 'below' }], ['nohh', 'No household counts', { quorum: 'missing' }],
  ['incomplete', 'MOVs incomplete', { mov: 'incomplete' }], ['movdue', 'MOV due', { mov: 'due' }], ['additional', 'Outside target', { scope: 'additional' }]];
var PROFILE_QUICK_FIELDS = ['encoding', 'attendance', 'mov', 'scope', 'backlog', 'quorum'];
function profileQuickActive(f) {
  var hit = PROFILE_QUICK.filter(function (q) { return PROFILE_QUICK_FIELDS.every(function (k) { return (f[k] || '') === (q[2][k] || ''); }); })[0];
  return hit ? hit[0] : null;
}
function profileApplyQuick(f, key) {
  var q = PROFILE_QUICK.filter(function (x) { return x[0] === key; })[0] || PROFILE_QUICK[0];
  if (profileQuickActive(f) === key) q = PROFILE_QUICK[0];
  PROFILE_QUICK_FIELDS.forEach(function (k) { f[k] = q[2][k] || ''; });
  return f;
}
function profileFiltersHtml(model, activity, f) {
  var active = profileQuickActive(f), movs = model.movImported && activity.requirements.length;
  var chips = PROFILE_QUICK.filter(function (q) {
    if (q[2].quorum) return model.trackerImported && activity.households;
    if (q[2].mov) return movs && (q[0] !== 'movdue' || model.trackerImported);
    if (q[2].encoding || q[2].attendance || q[2].backlog) return model.trackerImported;
    if (q[2].scope) return activity.rows.some(function (r) { return !r.expected; });
    return true;
  });
  return '<div class="pfilters"><label class="field psearch"><span>Find barangay</span><input id="profile-search" type="search" value="' + attr(f.search) + '" placeholder="Search barangay…"></label>' +
    '<div class="pchips" role="group" aria-label="Quick filters">' + chips.map(function (q) { return profileChip('profile-quick', q[0], q[1], profileFilterRows(model, activity, Object.assign({ search: f.search }, q[2])).length, active === q[0]); }).join('') + '</div>' +
    '<label class="field"><span>Sort</span><select data-profile-filter="sort">' + [['name', 'Barangay A–Z'], ['attendance', 'Most participants'], ['mov', 'Fewest MOVs submitted']].concat(activity.households ? [['quorum', 'Lowest household quorum']] : []).map(function (o) { return movOption(o[0], o[1], f.sort === o[0]); }).join('') + '</select></label></div>';
}
function profileCellButton(r, req, html) {
  var id = 'profile-cell-' + encodeURIComponent(r.key + '|' + (req || 'attendance'));
  return '<button type="button" id="' + attr(id) + '" class="profile-cell-button" data-act="profile-cell" data-row="' + attr(r.key) + '" data-requirement="' + attr(req || '') + '" aria-label="' + attr(r.name + (req ? ' · ' + req : ' · attendance and source records')) + '">' + html + '</button>';
}
function profileMovDots(model, r) {
  if (!model.movImported) return profilePill('Not assessed');
  var s = profileGroupState(model, r);
  return '<span class="pdots" aria-hidden="true">' + r.group.requirements.map(function (q) { return '<i class="pt-' + profileReqCss(q.status) + '" title="' + attr(q.name + ': ' + q.status) + '"></i>'; }).join('') + '</span>' +
    '<span class="pdots-text"><b>' + esc(s.text) + '</b> ' + esc(s.label) + '</span>';
}
function profileStatusTable(model, activity, rows) {
  return '<div class="profile-grid-wrap"><table class="grid profile-monitor-grid"><thead><tr><th>Barangay</th><th>Encoding</th><th>Attendees</th>' + (activity.households ? '<th>Household quorum</th>' : '') + '<th>MOV checklist</th><th>Actual dates</th><th>Follow-up</th></tr></thead><tbody>' + rows.map(function (r) {
    var a = r.attendance, p = a && a.participants, flags = '';
    if (model.trackerImported && r.attendanceBacklog) flags += profileFlag('bad', 'Attendance due');
    if (model.trackerImported && model.movImported && r.group && r.group.lacking) flags += profileFlag('bad', 'MOV due');
    var attendees = !model.trackerImported ? '<span class="muted">Not assessed</span>' : !a ? '<span class="muted">—</span>' :
      profileCountLine(p);
    return '<tr><th scope="row">' + profileBarangayLink(r) + profileScopeNote(r) + '</th><td>' + profilePill(profileEncodingLabel(model, r)) + '</td><td>' + (a ? profileCellButton(r, '', attendees) : attendees) + '</td>' + (activity.households ? '<td>' + profileQuorumCell(model, r) + '</td>' : '') + '<td>' +
      (r.group ? profileCellButton(r, profileFirstOpenReq(r), profileMovDots(model, r)) : '<span class="tiny muted">Not configured for this stage</span>') + '</td><td class="tiny">' + esc(a ? (a.dateStart || 'Missing start') + ' → ' + (a.dateEnd || 'Missing end') : '—') +
      '</td><td><span class="pseq-flags">' + (flags || '<span class="muted">—</span>') + '</span></td></tr>';
  }).join('') + '</tbody></table></div>';
}
// Activity-level MOV checklist: one row per MOV form, one column per barangay shown.
function profileChecklistGrid(model, activity, rows) {
  var head = '<tr><th scope="col" class="pmap-corner">Activity check / MOV form</th>' + rows.map(function (r) {
    var s = profileGroupState(model, r);
    return profileLocationHead(r.name, profileKey(r.place), s && s.text ? s.text : '—');
  }).join('') + '<th scope="col" class="pmap-corner pmap-endcol">Total shown</th></tr>';
  var body = profileCheckRows(model, rows, activity) + activity.requirements.map(function (def) {
    var submitted = 0, applicable = 0;
    var cells = rows.map(function (r) {
      var status = profileRequirementStatus(model, r, def.id);
      if (model.movImported && status !== 'Not applicable') { applicable++; if (status === 'Submitted') submitted++; }
      return '<td>' + profileReqTile(r, def, status, r.expected || r.appraisal ? '' : 'outside') + '</td>';
    }).join('');
    return '<tr><th scope="row" class="pmap-form">' + esc(def.name) + '</th>' + cells + '<td class="pmap-total">' + (model.movImported ? '<b>' + submitted + '</b>/' + applicable : '—') + '</td></tr>';
  }).join('');
  return (activity.requirements.length && !model.movImported ? '<div class="msg warn">Import the KCIS MOV attachments export to assess MOV submission.</div>' : '') +
    (activity.requirements.length ? profileTileLegend(['ok', 'due', 'pending', 'na']) : '<div class="msg info">MOV requirements are not configured for this stage.</div>') + '<p class="tiny muted">Click a mark for details. Dashed marks are outside the activity target. Totals use the barangays shown.</p>' +
    '<div class="profile-grid-wrap pmap-wrap checklist"><table class="pmap pmap-flip pcheck-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
}
function profileAttendanceHtml(model, row) {
  var a = row.attendance;
  if (row.appraisal) return '<div class="msg info">RPMO appraisal is a MOV follow-up, with MRP actual end as its due-date trigger. It has no attendance activity or target.</div>';
  if (!model.trackerImported) return '<div class="msg info">Import Activity Tracker to assess encoding, attendance and conduct dates.</div>';
  if (!a) return '<div class="msg warn">No Activity Tracker record is encoded for this location and activity.</div>';
  function breakdown(label, p) { return '<tr><th scope="row">' + label + '</th><td>' + n(p.male) + '</td><td>' + n(p.female) + '</td><td>' + n(p.unspecified) + '</td><td>' + n(p.total) + '</td></tr>'; }
  var hh = row.hh ? '<h3>Household quorum</h3><div class="pquorum-panel">' + profileQuorumCell(model, row) + '</div>' + (row.hh.detail && typeof hhSectorCell === 'function' ? '<p class="tiny">Represented households by sector: ' + hhSectorCell(row.hh.detail) + '</p><p class="tiny">Individuals present: ' + hhIndividualsCell(row.hh.detail) + '</p>' : '') + '<p class="tiny muted">Target: at least 70% of listed households represented. Counts come from the Activity Tracker household columns.</p>' : '';
  return '<div class="profile-attendance"><h3>Reported attendance</h3><p class="tiny muted">Reported totals include repeated source records. These are not unique-person totals.</p>' +
    '<div class="table-wrap"><table class="grid"><thead><tr><th>Counts</th><th>Male</th><th>Female</th><th>Unspecified</th><th>Total</th></tr></thead><tbody>' + breakdown('Participants', a.participants) + breakdown('Person Volunteers', a.personVolunteers) + '</tbody></table></div>' +
    hh + '<dl class="profile-dates"><div><dt>Target dates</dt><dd>' + esc((a.targetStart || '—') + ' → ' + (a.targetEnd || '—')) + '</dd></div><div><dt>Actual dates</dt><dd>' + esc((a.dateStart || 'Missing start') + ' → ' + (a.dateEnd || 'Missing end')) + '</dd></div></dl>' +
    '<details><summary>' + a.sourceRows.length + ' source records' + (a.repeated ? ' · repeated records included' : '') + '</summary>' + a.sourceRows.map(function (s) {
      return '<article class="profile-source"><strong>Row ' + n(s.sourceRow) + ' · ' + esc(s.title || 'Untitled activity') + '</strong><div>Target: ' + esc((s.targetStart || '—') + ' → ' + (s.targetEnd || '—')) + '</div><div>Actual: ' + esc((s.actualStart || '—') + ' → ' + (s.actualEnd || '—')) + '</div><div>Participants M/F/U/Total: ' + [s.participants.male, s.participants.female, s.participants.unspecified, s.participants.total].map(n).join(' / ') + '</div></article>';
    }).join('') + '</details></div>';
}
// One circular progress ring per measure: count of target, with the percentage in the middle.
function profileDonut(label, short, count, total, css, assessed) {
  var pct = assessed && total ? Math.round(count / total * 100) : 0, r = 14, c = 2 * Math.PI * r;
  var title = label + ': ' + (assessed ? n(count) + ' of ' + n(total) + (total ? ' (' + pct + '%)' : '') : 'not assessed');
  return '<span class="pdonut ' + css + (assessed ? '' : ' idle') + '" role="img" aria-label="' + attr(title) + '" title="' + attr(title) + '">' +
    '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="pdonut-track" cx="18" cy="18" r="' + r + '"></circle>' +
    (pct ? '<circle class="pdonut-fill" cx="18" cy="18" r="' + r + '" stroke-dasharray="' + (c * pct / 100).toFixed(2) + ' ' + c.toFixed(2) + '"></circle>' : '') + '</svg>' +
    '<b>' + (assessed && total ? pct + '%' : '—') + '</b><small>' + esc(short) + '</small></span>';
}
// Encoded and with attendees against the activity target; MOV as the share of required MOV forms submitted,
// so each upload moves it rather than only a fully complete checklist.
function profileDonuts(model, a) {
  var m = profileMix(model, a), t = a.tally, tracker = model.trackerImported;
  return '<span class="pdonuts">' + profileDonut('Encoded', 'Encoded', t.encoded, t.expected, 'enc', tracker) +
    profileDonut('With attendees', 'Attendees', t.complete, t.expected, 'att', tracker) +
    profileDonut('MOV forms submitted', 'MOV', t.movSubmitted, t.movRequired, 'done', m.movs) + '</span>';
}
function profileDonutLegend(movs) {
  return '<div class="pstack-legend pdonut-legend" aria-hidden="true"><span><i class="enc"></i>Encoded</span><span><i class="att"></i>With attendees</span><span><i class="done"></i>' +
    (movs ? 'MOV (required forms submitted)' : 'MOV (not assessed)') + '</span></div>';
}
// "Total: 100 (M: 50, F: 50, U: 0)" on one line.
function profileCountLine(p, extraClass) {
  return '<span class="patt-line' + (p.total ? '' : ' zero') + (extraClass ? ' ' + extraClass : '') + '">Total: <b>' + n(p.total) + '</b> (M: ' + n(p.male) + ', F: ' + n(p.female) + ', U: ' + n(p.unspecified) + ')</span>';
}
function profileDateRange(start, end, missing) {
  if (!start && !end) return missing || '—';
  return start && end && start !== end ? esc(start) + ' → ' + esc(end) : esc(start || end);
}
// Municipal activities: dates first, then the attendance breakdown, then the required MOVs as small file cards.
function profileMunicipalHtml(model, activity) {
  var row = activity.rows[0], a = row.attendance, html = '';
  if (activity.appraisal) html += '<div class="msg info">RPMO appraisal is a MOV follow-up, with MRP actual end as its due-date trigger. It has no attendance activity or target.</div>';
  else {
    var body = !model.trackerImported ? '<div class="msg info">Import Activity Tracker to assess encoding, attendance and conduct dates.</div>' :
      !a ? '<div class="msg warn">No Activity Tracker record is encoded for this municipal activity.</div>' :
      '<div class="pmuni-dates"><div><span class="eyebrow">Target date</span><strong>' + profileDateRange(a.targetStart, a.targetEnd, 'Not set') + '</strong></div>' +
      '<div><span class="eyebrow">Actual date</span><strong>' + profileDateRange(a.dateStart, a.dateEnd, 'Not recorded') + '</strong></div></div>' +
      '<div class="pmuni-counts"><div><span>Participants</span>' + profileCountLine(a.participants) + '</div><div><span>Person Volunteers</span>' + profileCountLine(a.personVolunteers) + '</div></div>' +
      (a.repeated ? '<p class="tiny muted">Includes repeated source records, so these are not unique-person totals.</p>' : '');
    html += '<div class="card pmuni-att"><h3>Municipal attendance</h3>' + body + '</div>';
  }
  var reqs = activity.requirements, submitted = reqs.filter(function (d) { return profileRequirementStatus(model, row, d.id) === 'Submitted'; }).length;
  html += '<div class="card"><div class="pfiles-head"><h3>Required MOVs</h3><span class="tiny muted">' + (!reqs.length ? '' : model.movImported ? submitted + ' of ' + reqs.length + ' submitted' : 'Not assessed') + '</span></div>' +
    (!reqs.length ? '<p class="muted">MOV requirements are not configured for this stage.</p>' : '<div class="pfiles">' + reqs.map(function (def) {
      var status = profileRequirementStatus(model, row, def.id), css = profileReqCss(status);
      return '<button type="button" id="' + attr('profile-cell-' + encodeURIComponent(row.key + '|' + def.id)) + '" class="pfile pf-' + css + '" data-act="profile-cell" data-row="' + attr(row.key) + '" data-requirement="' + attr(def.id) + '" title="' + attr(def.name + ': ' + status + '. Click to inspect evidence.') + '">' +
        '<span class="pfile-icon">' + icon('file-text') + '</span><span class="pfile-body"><span class="pfile-name">' + esc(def.name) + '</span><span class="pfile-status">' + PROFILE_GLYPH[css] + ' ' + esc(status) + '</span></span></button>';
    }).join('') + '</div>') + '</div>';
  return html;
}
function profileActivityHtml(model, activity) {
  var rows = profileFilterRows(model, activity, profileFilters());
  var html = '<div class="profile-main-title"><div><span class="eyebrow">' + (activity.appraisal ? 'Municipal MOV follow-up' : 'Sequence ' + esc(activity.seq) + ' · ' + esc(activity.level) + ' activity') + '</span><h2>' + esc(activity.label) + '</h2></div><div class="row-actions">' + profileButton('profile-export', 'Export this view') + profileButton('profile-dqa', 'DQA findings', '', model.trackerImported ? '' : ' disabled title="Import Tracker to open DQA findings"') + '</div></div>';
  // The step's donuts above already chart this activity's progress, so only the counts are repeated here.
  if (!activity.appraisal) html += '<div class="profile-activity-progress">' + profileMeasures(model, activity.tally, activity.stage) + (activity.households && model.trackerImported ? profileQuorumSummary(model, activity.code) : '') + '<p class="tiny muted">Full activity target. Filtering the list below does not change these totals.</p></div>';
  else html += '<p class="muted">MRP follow-up trigger: ' + esc(activity.rows[0].group && activity.rows[0].group.dateEnd || 'No MRP actual end recorded') + '</p>';
  if (activity.level === 'Municipal') return html + profileMunicipalHtml(model, activity);
  html += '<div class="card profile-activity-card"><div class="profile-view-tabs" role="group" aria-label="Activity view">' +
    profileButton('profile-view', 'Barangay Encoding Status', 'status', ' aria-pressed="' + (PROFILE_STATE.view === 'status') + '"') + profileButton('profile-view', 'Activity & MOV checklist', 'checklist', ' aria-pressed="' + (PROFILE_STATE.view === 'checklist') + '"') + '</div>' + profileFiltersHtml(model, activity, profileFilters()) +
    '<p class="tiny muted">Showing ' + rows.length + ' of ' + activity.rows.length + ' monitored barangays. Outside-target barangays retain their applicable MOV obligations.</p>';
  if (!rows.length) html += '<div class="msg info">No barangays match these filters.</div>';
  else html += PROFILE_STATE.view === 'checklist' ? profileChecklistGrid(model, activity, rows) : profileStatusTable(model, activity, rows);
  return html + '</div>';
}
// ---- Municipality operational summaries and household participation.
function profileQuorum(model, code) {
  var ix = profileIndex(), act = model.byCode[code];
  var q = { code: code, label: act ? act.label : code, reporting: 0, listed: 0, present: 0, met: 0, barangays: model.barangays.length };
  model.barangays.forEach(function (b) {
    var r = ix.barangays[profileKey(b)], a = r && r.activities[code];
    if (a && a.hhListed > 0) { q.reporting++; q.listed += a.hhListed; q.present += a.hhPresent; if (a.hhRate >= PROFILE_QUORUM) q.met++; }
  });
  q.rate = q.listed ? q.present / q.listed : null;
  return q;
}
function profileQuorumCodes(stage) { return (stage || PROFILE_STATE.stage) === 2 ? ['BA2', 'BA3'] : ['BA1']; }
function profileKpis(model, stage) {
  var ix = profileIndex(), brgys = model.barangays.map(function (b) { return ix.barangays[profileKey(b)]; }).filter(Boolean);
  var acts = profileStageActivities(model, stage), t = activityProgressSum(acts.map(function (a) { return a.tally; }));
  var quorums = profileQuorumCodes(stage).filter(function (c) { return model.byCode[c]; }).map(function (c) { return profileQuorum(model, c); });
  var volunteersLoaded = !!LOADED.volunteers, vols = [], mrest = null, mrestVerified = false;
  try {
    if (volunteersLoaded && typeof people === 'function') vols = people().volunteers.filter(function (v) { return v.province === model.province && v.municipality === model.municipality && v.key && (v.flags || []).indexOf('duplicate') === -1; });
    if (volunteersLoaded && typeof mrestStatusOf === 'function') mrest = mrestStatusOf(model.province, model.municipality);
    var tag = typeof vfTag === 'function' ? vfTag('mrest|' + model.province + '|' + model.municipality + '||MREST') : null;
    mrestVerified = !!(tag && tag.rows && Object.keys(tag.rows).length);
  } catch (e) { vols = []; mrest = null; }
  var brest = { encoded: 0, fixing: 0, total: brgys.length };
  brgys.forEach(function (b) { var s = b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status; if (s === 'Encoded') brest.encoded++; else if (s === 'Needs fixing') brest.fixing++; });
  brest.rate = brest.total ? brest.encoded / brest.total : null;
  var women = vols.filter(function (v) { return v.sex === 'female'; }).length;
  var inclusion = { total: vols.length, women: women, marginalized: vols.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length, chairs: vols.filter(function (v) { return v.chair; }).length };
  inclusion.rate = vols.length ? women / vols.length : null;
  var assessed = !!LOADED.activityTracker;
  return { quorums: quorums, brest: brest, inclusion: inclusion, mrest: mrest, mrestVerified: mrestVerified, volunteersLoaded: volunteersLoaded, assessed: assessed,
    pipeline: { complete: t.complete, expected: t.expected, rate: t.expected ? t.complete / t.expected : null } };
}
function profileMrestLabel(k) {
  if (!k.volunteersLoaded) return 'Not assessed';
  if (!k.mrest) return '—';
  return k.mrest.status === 'complete' ? (k.mrestVerified ? 'Formed · EO verified' : 'Formed') : k.mrest.status === 'incomplete' ? 'Incomplete' : 'Not in KCIS';
}
function profileQuorumSummary(model, code) {
  var q = profileQuorum(model, code);
  return '<div class="pmeasures pquorum"><span>Household quorum <b>' + (q.rate === null ? 'No counts' : pctText(q.rate)) + '</b></span><span><b>' + n(q.present) + '/' + n(q.listed) + '</b> households represented</span><span><b>' + n(q.met) + '/' + n(q.barangays) + '</b> barangays ≥70%</span><span><b>' + n(q.barangays - q.reporting) + '</b> without household counts</span></div>';
}
function profileQuorumCell(model, r) {
  if (!r.hh) return '';
  if (!model.trackerImported) return '<span class="muted">Not assessed</span>';
  var h = r.hh;
  if (h.status === 'noreport' || h.status === 'incomplete') return '<span class="pill idle">○ ' + esc(PROFILE_QUORUM_LABEL[h.status]) + '</span>';
  return '<span class="pill ' + (h.status === 'met' ? 'good">✓ ' : 'warn">⚠ ') + pctText(h.rate) + '</span>' + (h.conflict ? ' <span class="pill bad" title="Repeated records report different household counts">⚠ Conflicting</span>' : '') +
    '<div class="tiny muted">' + n(h.present) + ' of ' + n(h.listed) + ' households</div>';
}
// ---- Compact header: identity, overall progress and the backlog shortcuts in one band.
function profileBacklogs(model) {
  var acts = profileStageActivities(model), all = profileSequenceActivities(model), stage1 = PROFILE_STATE.stage === 1;
  return { attendance: model.trackerImported ? acts.reduce(function (s, a) { return s + a.tally.backlog; }, 0) : null,
    movDue: model.trackerImported && model.movImported && stage1 ? all.reduce(function (s, a) { return s + profileMovDue(a); }, 0) : null };
}
function profileBacklogChips(model) {
  var b = profileBacklogs(model), out = '';
  function chip(kind, css, value, label) { return value ? '<button type="button" class="pflag pflag-btn ' + css + '" data-act="profile-alert" data-v="' + kind + '" title="Open the first affected activity">! ' + n(value) + ' ' + label + '</button>' : ''; }
  out = chip('attendance', 'bad', b.attendance, 'attendance due') + chip('due', 'bad', b.movDue, 'MOV due');
  return out || (b.attendance !== null ? profileFlag('ok', 'No backlog') : '');
}
function profileBandHtml(model, opts) {
  var acts = profileStageActivities(model), totals = activityProgressSum(acts.map(function (a) { return a.tally; }));
  var mix = profileMixSum(acts.map(function (a) { return profileMix(model, a); }));
  return '<header class="profile-band"><div class="profile-band-id"><div class="profile-monogram sm" aria-hidden="true">' + esc(model.municipality.slice(0, 2).toUpperCase()) + '</div><div><span class="eyebrow">Municipality profile · ' + esc(model.province) + '</span><h1>' + esc(model.municipality) + '</h1>' +
    '<p class="tiny muted">' + model.barangays.length + ' monitored barangays' + (model.batch ? ' · ' + esc(/^batch/i.test(model.batch) ? model.batch : 'Batch ' + model.batch) : '') + (model.focalArea ? ' · Focal area: ' + esc(model.focalArea) : '') + ' · Pull date ' + esc(prefs().evalDate || today()) + '</p></div></div>' +
    '<div class="profile-band-progress"><span class="eyebrow">Stage ' + PROFILE_STATE.stage + ' · all activities</span>' + profileStack(mix, { tracker: model.trackerImported, head: true }) + profileMeasures(model, totals, PROFILE_STATE.stage) + '<div class="pseq-flags">' + profileBacklogChips(model) + '</div></div></header>';
}
// The three municipality views as tabs, with the municipality picker (regional users only) and Print at the right.
var PROFILE_HOME_TABS = [['sequence', 'Activities', 'list-todo'], ['movmap', 'Activity & MOV checklist', 'grid'], ['cvmap', 'Volunteer checklist', 'users']];
function profileControlsHtml(model) {
  var municipalitySelect = isMunicipalUser() ? '' : '<label class="field"><span class="sr-only">Municipality</span><select data-act="profile-municipality" aria-label="Municipality">' + profileIndex().base.muniList.map(function (m) { var key = m.province + '|' + m.municipality; return movOption(key, m.municipality + ' · ' + m.province, key === model.key); }).join('') + '</select></label>';
  var tabs = PROFILE_HOME_TABS.map(function (t) {
    var on = PROFILE_STATE.home === t[0] && !PROFILE_STATE.barangay;
    return '<button type="button" role="tab" class="sub-nav-btn' + (on ? ' active' : '') + '" id="profile-tab-' + t[0] + '" data-act="profile-home" data-v="' + t[0] + '" aria-selected="' + on + '" tabindex="' + (on ? '0' : '-1') + '">' + icon(t[2]) + '<span>' + esc(t[1]) + '</span></button>';
  }).join('');
  return '<div class="profile-controls profile-tabbar">' +
    '<div class="sub-nav-tabs profile-home-tabs" role="tablist" aria-label="Profile view">' + tabs + '</div>' +
    '<div class="row-actions">' + municipalitySelect + profileButton('profile-print', 'Print report') + '</div></div>';
}

// ---- Barangay profile: one barangay's activities in sequence, with encoding, attendees and each MOV document.
function profileBarangayPlace(model, key) { return model.barangays.filter(function (b) { return profileKey(b) === key; })[0] || null; }
function profileBarangayLink(r, label) { return '<button type="button" class="profile-cell-button" data-act="profile-barangay" data-v="' + attr(profileKey(r.place)) + '" title="Open barangay profile">' + (label || esc(r.name)) + '</button>'; }
function profileBarangayModel(model, key) {
  var place = profileBarangayPlace(model, key); if (!place) return null;
  var items = profileStageActivities(model).filter(function (a) { return a.level !== 'Municipal'; }).map(function (a) {
    var r = model.rows[key + '|' + a.code] || null;
    return { act: a, row: r, mix: profileMix(model, { rows: r ? [r] : [], requirements: a.requirements }) };
  });
  var rows = items.map(function (i) { return i.row; }).filter(Boolean);
  return { key: key, place: place, name: place.barangay, items: items, mix: profileMixSum(items.map(function (i) { return i.mix; })), tally: profileTally(rows),
    attendanceDue: rows.filter(function (r) { return r.attendanceBacklog; }), movDue: rows.filter(function (r) { return r.group && r.group.lacking; }) };
}
function profileItemState(model, item) {
  if (!item.row) return { css: 'idle', label: 'Not configured' };
  if (!item.row.expected) return { css: 'outside', label: 'Outside target' };
  if (!model.trackerImported) return { css: 'idle', label: 'Not assessed' };
  var m = item.mix, seg = profileSegments(m).filter(function (s) { return m[s.key]; })[0];
  return seg ? { css: seg.key, label: seg.label } : { css: 'idle', label: '—' };
}
function profileBarangayHtml(model, b) {
  var list = model.barangays.slice().sort(function (x, y) { return x.barangay.localeCompare(y.barangay); }), at = list.indexOf(b.place);
  var prev = list[at - 1], next = list[at + 1], movs = model.movImported && PROFILE_STATE.stage === 1, flags = '';
  if (model.trackerImported && b.attendanceDue.length) flags += profileFlag('bad', b.attendanceDue.length + ' attendance due');
  if (model.trackerImported && model.movImported && b.movDue.length) flags += profileFlag('bad', b.movDue.length + ' MOV due');
  if (!flags && model.trackerImported) flags = profileFlag('ok', 'No backlog');
  var brestRow = profileIndex().barangays[b.key], brest = brestRow && brestRow.volunteers && brestRow.volunteers.BREST && brestRow.volunteers.BREST.status;
  if (LOADED.volunteers) flags += profileFlag(brest === 'Encoded' ? 'ok' : 'warn', 'BResT: ' + (brest === 'Encoded' ? 'compliant' : brest === 'Needs fixing' ? 'needs fixing' : 'not encoded'));
  b.items.forEach(function (i) { if (i.row && i.row.hh && model.trackerImported && i.row.hh.status === 'below') flags += profileFlag('warn', i.act.label.replace('Barangay Assembly', 'BA') + ' quorum ' + pctText(i.row.hh.rate)); });
  var header = '<header class="profile-band"><div class="profile-band-id"><div class="profile-monogram sm brgy" aria-hidden="true">' + esc(b.name.slice(0, 2).toUpperCase()) + '</div><div><span class="eyebrow">Barangay profile · ' + esc(model.municipality + ', ' + model.province) + '</span><h1>' + esc(b.name) + '</h1>' +
    '<p class="tiny muted">' + (b.place.stage2Prio === true ? 'Stage 2 prioritized' : 'Not Stage 2 prioritized') + ' · ' + b.items.length + ' barangay-level activities · Pull date ' + esc(prefs().evalDate || today()) + '</p></div></div>' +
    '<div class="profile-band-progress"><span class="eyebrow">Stage ' + PROFILE_STATE.stage + ' · this barangay</span>' + profileStack(b.mix, { tracker: model.trackerImported, head: true }) + profileMeasures(model, b.tally, PROFILE_STATE.stage) + '<div class="pseq-flags">' + flags + '</div></div></header>';
  var controls = '<div class="profile-controls">' + profileButton('profile-barangay', '← ' + model.municipality + ' activities', '') +
    '<div class="row-actions">' + (prev ? profileButton('profile-barangay', '← ' + prev.barangay, profileKey(prev)) : '') +
    '<label class="field"><span class="sr-only">Barangay</span><select data-act="profile-barangay-select" aria-label="Barangay">' + list.map(function (p) { return movOption(profileKey(p), p.barangay, p === b.place); }).join('') + '</select></label>' +
    (next ? profileButton('profile-barangay', next.barangay + ' →', profileKey(next)) : '') + '</div></div>';
  var rows = b.items.map(function (item) {
    var a = item.act, r = item.row, st = profileItemState(model, item);
    if (!r) return '';
    var att = r.attendance, p = att && att.participants, rowFlags = '';
    if (model.trackerImported && r.attendanceBacklog) rowFlags += profileFlag('bad', 'Attendance due');
    if (model.trackerImported && model.movImported && r.group && r.group.lacking) rowFlags += profileFlag('bad', 'MOV due');
    var attendees = !model.trackerImported ? '<span class="muted">Not assessed</span>' : !att ? '<span class="muted">—</span>' :
      profileCellButton(r, '', profileCountLine(p));
    var docs = !a.requirements.length ? '<span class="tiny muted">Not configured for this stage</span>' :
      '<div class="pdoc-row">' + a.requirements.map(function (def) { return profileReqTile(r, def, profileRequirementStatus(model, r, def.id), r.expected ? '' : 'outside'); }).join('') +
      '<span class="pdots-text">' + (movs ? '<b>' + esc(profileGroupState(model, r).text) + '</b>' : 'Not assessed') + '</span></div>';
    return '<tr><td class="pseq-no">' + esc(a.seq) + '</td><th scope="row"><button type="button" class="profile-cell-button" data-act="profile-activity" data-v="' + attr(a.code) + '" title="Open this activity for all barangays">' + esc(a.label) + '</button>' + profileScopeNote(r) + '</th>' +
      '<td><span class="pstate"><i class="seg-' + st.css + '"></i>' + esc(st.label) + '</span></td><td>' + profilePill(profileEncodingLabel(model, r)) + '</td><td>' + attendees + (r.hh ? '<div class="pquorum-cell">' + profileQuorumCell(model, r) + '</div>' : '') + '</td>' +
      '<td class="tiny">' + esc(att ? (att.dateStart || 'Missing start') + ' → ' + (att.dateEnd || 'Missing end') : '—') + '</td><td>' + docs + '</td><td><span class="pseq-flags">' + (rowFlags || '<span class="muted">—</span>') + '</span></td></tr>';
  }).join('');
  return header + controls + '<div class="card pbrgy-card"><div class="pseq-head"><div><h3>Activities in sequence</h3><p class="tiny muted">Click a MOV mark to inspect evidence, attendees to see source records, or an activity to compare all barangays.</p></div>' + profileTileLegend(['ok', 'due', 'pending', 'na']) + '</div>' +
    '<div class="table-wrap"><table class="grid pbrgy-table"><thead><tr><th>Seq</th><th>Activity</th><th>Progress</th><th>Encoding</th><th>Attendees</th><th>Actual dates</th><th>MOV documents</th><th>Follow-up</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

// ---- Printable municipality report (A4 landscape): summary, activity table, MOV checklist and follow-ups.
function profileReportKpis(model) {
  var k = profileKpis(model), cells = k.quorums.map(function (q) {
    return '<div><span>' + esc(q.label.replace('Barangay Assembly', 'BA')) + ' household quorum</span><strong>' + (!k.assessed || q.rate === null ? '—' : pctText(q.rate)) + '</strong><small>' + (q.listed ? n(q.present) + ' of ' + n(q.listed) + ' households · ' + n(q.met) + '/' + n(q.barangays) + ' barangays ≥70%' : 'No household counts') + '</small></div>';
  });
  cells.push('<div><span>Volunteer inclusion</span><strong>' + (k.volunteersLoaded && k.inclusion.total ? pctText(k.inclusion.rate) : '—') + '</strong><small>' + (k.volunteersLoaded ? n(k.inclusion.total) + ' volunteers · ' + n(k.inclusion.women) + ' women' : 'Volunteer List not imported') + '</small></div>');
  cells.push('<div><span>BResT formation</span><strong>' + (k.volunteersLoaded ? pctText(k.brest.rate) : '—') + '</strong><small>' + (k.volunteersLoaded ? n(k.brest.encoded) + ' of ' + n(k.brest.total) + ' compliant' : 'Volunteer List not imported') + '</small></div>');
  cells.push('<div><span>MResT</span><strong class="prep-small">' + esc(profileMrestLabel(k)) + '</strong>' + (k.mrest && k.mrest.status === 'incomplete' ? '<small>Missing: ' + esc(k.mrest.gaps.join('; ')) + '</small>' : '') + '</div>');
  return '<section class="prep-summary prep-kpis">' + cells.join('') + '</section>';
}
// Report MOV checklist in the on-screen orientation: activities and their forms as rows, barangays as columns.
// Barangays are split into blocks so a large municipality still fits the A4 landscape width.
var PROFILE_REPORT_COLUMNS = 30;
function profileReportChecklist(model) {
  var data = profileMapData(model), lines = data.lines.slice().sort(function (x, y) { return x.name.localeCompare(y.name); });
  function mark(g, j) {
    if (!g.row) return '<td class="prep-void"></td>';
    var css = profileReqCss(g.cells[j].status);
    return '<td class="prep-' + css + '">' + PROFILE_GLYPH[css] + '</td>';
  }
  function table(acts, cols, all, label) {
    var head = '<tr><th class="prep-formcol">' + label + '</th>' + cols.map(function (l) { return '<th class="prep-bcol"><span class="prep-vert">' + esc(l.name) + '</span></th>'; }).join('') + '<th class="prep-sum">Submitted</th></tr>';
    var body = acts.map(function (a) {
      var i = data.acts.indexOf(a), ready = 0, total = 0;
      all.forEach(function (l) { var g = l.groups.filter(function (x) { return x.act === a; })[0]; if (g && g.row) { total++; if (g.state && g.state.css === 'ok') ready++; } });
      return '<tr class="prep-group"><th colspan="' + (cols.length + 2) + '">' + esc(a.appraisal ? 'Follow-up' : 'Seq ' + a.seq) + ' · ' + esc(a.label) + ' <span>' + ready + ' of ' + total + ' complete</span></th></tr>' +
        a.requirements.map(function (def, j) {
          var submitted = 0, applicable = 0;
          all.forEach(function (l) {
            var g = l.groups.filter(function (x) { return x.act === a; })[0];
            if (!g || !g.row) return;
            var st = g.cells[j].status; if (st !== 'Not applicable') { applicable++; if (st === 'Submitted') submitted++; }
          });
          return '<tr><th class="prep-formcol">' + esc(def.name) + '</th>' + cols.map(function (l) { return mark(l.groups.filter(function (x) { return x.act === a; })[0], j); }).join('') + '<td class="prep-sum">' + submitted + '/' + applicable + '</td></tr>';
        }).join('');
    }).join('');
    return '<table class="prep-table prep-check prep-flip' + (cols.length < 4 ? ' prep-narrow' : '') + '"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }
  var blocks = [];
  for (var k = 0; k < lines.length; k += PROFILE_REPORT_COLUMNS) blocks.push(lines.slice(k, k + PROFILE_REPORT_COLUMNS));
  var html = '<h2>MOV checklist · each MOV form by barangay</h2>';
  if (data.brgyActs.length) html += blocks.map(function (cols, b) {
    return (blocks.length > 1 ? '<p class="prep-block">Barangays ' + (b * PROFILE_REPORT_COLUMNS + 1) + '–' + (b * PROFILE_REPORT_COLUMNS + cols.length) + ' of ' + lines.length + ' (Submitted counts all barangays)</p>' : '') + table(data.brgyActs, cols, lines, 'Sequence · MOV form');
  }).join('');
  if (data.muniActs.length) html += '<h2 class="prep-sub">Municipal-level MOVs</h2>' + table(data.muniActs, [data.muni], [data.muni], 'Sequence · MOV form');
  return html + '<p class="prep-legend">✓ submitted · ✗ lacking and due · ○ not yet due · – not applicable</p>';
}
function profileReportHtml(model) {
  var stage = PROFILE_STATE.stage, acts = profileStageActivities(model), seq = profileSequenceActivities(model), movs = model.movImported && stage === 1, tracker = model.trackerImported;
  var totals = activityProgressSum(acts.map(function (a) { return a.tally; })), mix = profileMixSum(acts.map(function (a) { return profileMix(model, a); })), b = profileBacklogs(model);
  function frac(v, t, ok) { return ok ? n(v || 0) + '/' + n(t || 0) : '—'; }
  var activityRows = seq.map(function (a) {
    var m = profileMix(model, a), t = a.tally;
    if (a.appraisal) { var gs = profileGroupState(model, a.rows[0]); return '<tr><td>Follow-up</td><td>' + esc(a.label) + '</td><td>Municipal</td><td>—</td><td>—</td><td>—</td><td>' + esc(gs ? gs.text || gs.label : '—') + '</td><td>' + esc(gs ? gs.label : '—') + '</td><td>—</td><td>' + (movs && tracker ? n(profileMovDue(a)) : '—') + '</td></tr>'; }
    return '<tr><td>' + esc(a.seq) + '</td><td>' + esc(a.label) + '</td><td>' + esc(a.level) + '</td><td>' + n(t.expected) + '</td><td>' + frac(t.encoded, t.expected, tracker) + '</td><td>' + frac(t.complete, t.expected, tracker) + '</td><td>' + frac(t.movsReady, t.expected, movs) + '</td>' +
      '<td class="prep-bar">' + profileStack(m, { tracker: tracker, size: 'sm' }) + '<span>' + (tracker ? profilePct(m.complete, m.total) : '—') + '</span></td><td>' + (tracker ? n(t.backlog) : '—') + '</td><td>' + (movs && tracker ? n(profileMovDue(a)) : '—') + '</td></tr>';
  }).join('');
  var checklist = stage === 1 && model.movImported ? profileReportChecklist(model) : '';  var follow = model.barangays.slice().sort(function (x, y) { return x.barangay.localeCompare(y.barangay); }).map(function (p) {
    var bm = profileBarangayModel(model, profileKey(p)), parts = [];
    if (tracker && bm.attendanceDue.length) parts.push('<b>Attendance due:</b> ' + bm.attendanceDue.map(function (r) { return esc(model.byCode[r.code].label); }).join(', '));
    if (tracker && movs && bm.movDue.length) parts.push('<b>MOV due:</b> ' + bm.movDue.map(function (r) { return esc(model.byCode[r.code].label); }).join(', '));
    var low = bm.items.filter(function (i) { return tracker && i.row && i.row.hh && i.row.hh.status === 'below'; });
    if (low.length) parts.push('<b>Quorum below 70%:</b> ' + low.map(function (i) { return esc(i.act.label) + ' ' + pctText(i.row.hh.rate); }).join(', '));
    return parts.length ? '<li><strong>' + esc(p.barangay) + '</strong> — ' + parts.join('; ') + '</li>' : '';
  }).join('');
  return '<article class="prep"><header class="prep-head"><div><p class="prep-eyebrow">PCRP · KALAHI-CIDSS · Stage ' + stage + ' monitoring report</p><h1>' + esc(model.municipality) + ', ' + esc(model.province) + '</h1>' +
    '<p>' + model.barangays.length + ' monitored barangays' + (model.batch ? ' · ' + esc(/^batch/i.test(model.batch) ? model.batch : 'Batch ' + model.batch) : '') + ' · Pull date ' + esc(prefs().evalDate || today()) + ' · Printed ' + esc(today()) + '</p></div>' +
    '<div class="prep-sources">Activity Tracker: ' + (tracker ? 'imported' : 'not imported') + '<br>MOV attachments: ' + (model.movImported ? 'imported' : 'not imported') + '</div></header>' +
    '<section class="prep-summary"><div><span>Complete</span><strong>' + (tracker ? profilePct(mix.complete, mix.total) : '—') + '</strong><small>' + (tracker ? n(mix.complete) + ' of ' + n(mix.total) : 'Not assessed') + '</small></div>' +
    '<div><span>Encoded</span><strong>' + frac(totals.encoded, totals.expected, tracker) + '</strong></div><div><span>With attendees</span><strong>' + frac(totals.complete, totals.expected, tracker) + '</strong></div><div><span>MOVs submitted</span><strong>' + frac(totals.movSubmitted, totals.movRequired, movs) + '</strong><small>forms</small></div><div><span>MOVs ready</span><strong>' + frac(totals.movsReady, totals.expected, movs) + '</strong></div>' +
    '<div><span>Attendance due</span><strong>' + (b.attendance === null ? '—' : n(b.attendance)) + '</strong></div><div><span>MOV due</span><strong>' + (b.movDue === null ? '—' : n(b.movDue)) + '</strong></div></section>' +
    profileReportKpis(model) + '<div class="prep-bar-wide">' + profileStack(mix, { tracker: tracker, legend: true }) + '</div>' +
    '<h2>Activities in sequence</h2><table class="prep-table"><thead><tr><th>Seq</th><th>Activity</th><th>Level</th><th>Target</th><th>Encoded</th><th>With attendees</th><th>MOVs ready</th><th>Complete</th><th>Attendance due</th><th>MOV due</th></tr></thead><tbody>' + activityRows + '</tbody></table>' +
    checklist + '<h2>Barangays needing follow-up</h2>' + (follow ? '<ul class="prep-follow">' + follow + '</ul>' : '<p>No attendance or MOV follow-up is due.</p>') +
    '<footer class="prep-foot">Reported attendance totals include repeated source records and are not unique-person totals. MOV submission records establish attachment presence; document contents and signatures remain unverified.</footer></article>';
}
function profilePrintReport() {
  var model = profileValidate(); if (!model) return;
  profileClosePanel(true);
  var host = $('profile-print');
  if (!host) { host = document.createElement('div'); host.id = 'profile-print'; document.body.appendChild(host); }
  host.innerHTML = profileReportHtml(model);
  var root = document.documentElement, done = function () { root.classList.remove('profile-printing'); window.removeEventListener('afterprint', done); };
  root.classList.add('profile-printing'); window.addEventListener('afterprint', done);
  window.print();
}
function profileRestoreScroll(body, position) {
  var step = body.querySelector('.pstepper-scroll'); if (step) step.scrollLeft = position.side;
  var grid = body.querySelector('.profile-grid-wrap'); if (grid) { grid.scrollLeft = position.left; grid.scrollTop = position.top; }
  requestAnimationFrame(function () { if (STATE.page === 'profile') window.scrollTo(0, position.page); });
}
function renderMunicipalityProfile() {
  var body = $('profile-body'); if (!body) return;
  if (!PROFILE_ENTERING) profileCaptureScroll();
  PROFILE_ENTERING = false;
  var model = profileValidate(), context, position;
  if (!model) {
    profileClosePanel(true);
    if (isMunicipalUser()) { body.innerHTML = '<div class="msg info">Choose your municipality in Settings &amp; Setup to open its profile.</div>'; return; }
    context = 'directory|' + PROFILE_STATE.stage; position = PROFILE_SCROLL[context] || { page: 0, side: 0, left: 0, top: 0 };
    body.innerHTML = profileDirectoryHtml(); body.setAttribute('data-profile-context', context);
    bindSearch('profile-dir-search', function (value) { PROFILE_DIR.search = value; renderMunicipalityProfile(); });
    refreshIcons(body); profilePersist(); profileRestoreScroll(body, position); return;
  }
  var brgy = PROFILE_STATE.barangay ? profileBarangayModel(model, PROFILE_STATE.barangay) : null;
  // The activities view always shows a step: default to the first activity with outstanding work.
  if (!brgy && PROFILE_STATE.home === 'sequence' && !PROFILE_STATE.activity) PROFILE_STATE.activity = profileDefaultActivity(model);
  var activity = PROFILE_STATE.activity && model.byCode[PROFILE_STATE.activity];
  context = model.key + '|' + PROFILE_STATE.stage + '|' + (brgy ? 'b:' + brgy.key : PROFILE_STATE.home + '|' + PROFILE_STATE.activity + '|' + PROFILE_STATE.view);
  var sameMunicipality = !brgy && (body.getAttribute('data-profile-context') || '').indexOf(model.key + '|') === 0 && (body.getAttribute('data-profile-context') || '').indexOf('|b:') === -1;
  position = PROFILE_SCROLL[context] || { page: sameMunicipality ? window.scrollY || 0 : 0, side: sameMunicipality && body.querySelector('.pstepper-scroll') ? body.querySelector('.pstepper-scroll').scrollLeft : 0, left: 0, top: 0 };
  var crumbs = '<nav class="profile-breadcrumb" aria-label="Profile breadcrumb">' + (isMunicipalUser() ? '' : profileButton('profile-directory', '← All municipalities') + '<span>/</span>') +
    (brgy ? profileButton('profile-barangay', model.municipality, '') + '<span>/</span><strong>' + esc(brgy.name) + '</strong>' :
      '<strong>' + esc(model.municipality) + '</strong>' + (activity && PROFILE_STATE.home === 'sequence' ? '<span>/</span><span>' + esc(activity.label) + '</span>' : '')) + '</nav>';
  var main = brgy ? profileBarangayHtml(model, brgy) : profileBandHtml(model) + kpiPageLink('activities', model.key) + profileControlsHtml(model) + (PROFILE_STATE.home === 'movmap' ? profileMovMapHtml(model) : PROFILE_STATE.home === 'cvmap' ? profileCvMapHtml(model) :
    profileStepperHtml(model) + (activity ? '<section class="profile-main" aria-live="polite">' + profileActivityHtml(model, activity) + '</section>' : '<div class="msg info">No activities are configured for this stage.</div>'));
  body.innerHTML = crumbs + main;
  body.setAttribute('data-profile-context', context);
  var current = body.querySelector('.pstep.selected'), scroller = body.querySelector('.pstepper-scroll');
  bindSearch('profile-search', function (value) { profileFilters().search = value; profilePersist(); renderMunicipalityProfile(); });
  bindSearch('profile-map-search', function (value) { profileMapFilters().search = value; renderMunicipalityProfile(); });
  bindSearch('profile-cv-search', function (value) { profileCvFilters().search = value; profilePersist(); renderMunicipalityProfile(); });
  refreshIcons(body); profilePersist();
  if (PROFILE_STATE.panel) profileRenderPanel(); else profileClosePanel(true);
  profileRestoreScroll(body, position);
  if (current && scroller && !PROFILE_SCROLL[context] && !sameMunicipality) scroller.scrollLeft = Math.max(0, current.offsetLeft - scroller.clientWidth / 2 + current.offsetWidth / 2);
}

function profilePanelRow() {
  var model = profileValidate(), selection = PROFILE_STATE.panel;
  return model && selection && profilePanelAllowed(model, selection.row) ? { model: model, row: model.rows[selection.row], selection: selection } : null;
}
function profileClosePanel(keepSelection) {
  var dialog = $('profile-evidence-dialog');
  if (dialog && dialog.open) dialog.close();
  if ($('profile-panel-body')) $('profile-panel-body').innerHTML = '';
  if (!keepSelection) { PROFILE_STATE.panel = null; profilePersist(); }
  if (!keepSelection && PROFILE_PANEL_FOCUS) {
    var target = $(PROFILE_PANEL_FOCUS); if (target) target.focus({ preventScroll: true });
  }
}
function profileRenderPanel() {
  var context = profilePanelRow(), dialog = $('profile-evidence-dialog'), body = $('profile-panel-body');
  if (!context || !dialog || !body || STATE.page !== 'profile') { profileClosePanel(true); return; }
  var row = context.row, model = context.model, selection = context.selection;
  var scroll = body.scrollTop, focused = dialog.contains(document.activeElement) ? document.activeElement.id : '';
  var group = row.group, editor = '';
  if (selection.kind === 'movs' && group) {
    if (!group.requirements.some(function (r) { return r.id === selection.requirement; })) selection.requirement = '';
    MOV_UI.municipality = model.key; MOV_UI.requirement = selection.requirement;
    editor = movRenderGroup(model.mov, group);
  } else editor = profileAttendanceHtml(model, row) + (group ? profileButton('profile-panel-movs', 'Inspect MOV checklist →') : '<p class="muted">MOV requirements are not configured for this stage.</p>');
  body.innerHTML = '<header class="profile-panel-head"><div><span class="eyebrow">' + esc(model.municipality + ' · ' + model.province) + '</span><h2 id="profile-panel-title">' + esc(row.name) + '</h2><p>' + esc(model.byCode[row.code].label) + '</p></div><button type="button" class="btn ghost icon-btn" data-act="profile-panel-close" aria-label="Close evidence panel">' + icon('x') + '</button></header>' +
    '<div class="profile-panel-content">' + (selection.kind === 'movs' ? '' : profileScopeNote(row)) + editor + '</div>';
  if (!dialog.open) dialog.showModal();
  body.scrollTop = scroll;
  if (focused && $(focused)) $(focused).focus({ preventScroll: true });
  refreshIcons(body);
}
function profileSelectActivity(code) {
  var model = profileValidate(), act = model && model.byCode[code];
  if (code && (!act || act.stage !== PROFILE_STATE.stage)) return;
  profileClosePanel(false); PROFILE_STATE.activity = code || ''; PROFILE_STATE.view = 'status'; if (code) PROFILE_STATE.home = 'sequence'; PROFILE_STATE.barangay = '';
  profilePersist(); renderMunicipalityProfile();
  var title = $('profile-body').querySelector('.profile-main-title h2'); if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
}
function profileOpenHealth() {
  var model = profileValidate(), act = model && model.byCode[PROFILE_STATE.activity]; if (!model || !act) return;
  S.healthScope = 'm:' + model.key; S.healthView = 'check'; S.healthSearch = act.code; S.healthOpen = {};
  go('health');
}
function profileAlert(kind) {
  var model = profileValidate(); if (!model) return;
  var acts = profileStageActivities(model).concat(PROFILE_STATE.stage === 1 ? [model.byCode.APPRAISAL] : []);
  var found = acts.filter(function (a) { return a.rows.some(function (r) { return kind === 'attendance' ? r.attendanceBacklog : r.group && r.group.lacking; }); })[0];
  if (!found) return;
  profileSelectActivity(found.code);
  PROFILE_STATE.filters[found.code] = profileDefaults();
  var f = profileFilters();
  // Attendance backlog is its own filter, distinct from simply zero attendance.
  profileApplyQuick(f, kind === 'attendance' ? 'backlog' : 'movdue');
  profilePersist(); renderMunicipalityProfile();
}
function profileAddReturnLink(page) {
  var ids = { health: 'he-body', volunteers: 'vol-body', mrest: 'mrt-body' }, body = $(ids[page]);
  if (!body || !PROFILE_STATE.returnLink || !profileModel(PROFILE_STATE.municipality)) return;
  if (!body.querySelector('.profile-return-link')) body.insertAdjacentHTML('afterbegin', '<div class="msg info profile-return-link">' + profileButton('profile-return', '← Return to ' + PROFILE_STATE.municipality.split('|')[1] + ' profile') + '</div>');
}
var PROFILE_RETURN_PAGES = { renderHealth: 'health', renderVolunteers: 'volunteers', renderMrest: 'mrest' };
Object.keys(PROFILE_RETURN_PAGES).forEach(function (name) {
  var original = window[name];
  if (typeof original === 'function') window[name] = function () { var result = original.apply(this, arguments); profileAddReturnLink(PROFILE_RETURN_PAGES[name]); return result; };
});
document.addEventListener('click', function (event) {
  var button = event.target.closest('[data-act]'); if (!button) return;
  var action = button.getAttribute('data-act'), value = button.getAttribute('data-v') || '';
  if (action.indexOf('profile-') !== 0) return;
  try {
    if (action === 'profile-activity') profileSelectActivity(value);
    else if (action === 'profile-view') { PROFILE_STATE.view = value === 'checklist' ? 'checklist' : 'status'; profilePersist(); renderMunicipalityProfile(); }
    else if (action === 'profile-cell') {
      var model = profileValidate(), row = model && model.rows[button.getAttribute('data-row')];
      if (!row || !profilePanelAllowed(model, row.key)) return;
      PROFILE_PANEL_FOCUS = button.id; var req = button.getAttribute('data-requirement') || '';
      PROFILE_STATE.panel = { row: row.key, requirement: req, kind: req ? 'movs' : 'attendance' };
      profilePersist(); profileRenderPanel();
    } else if (action === 'profile-panel-close') profileClosePanel(false);
    else if (action === 'profile-panel-movs' || action === 'profile-panel-attendance') { if (PROFILE_STATE.panel) { PROFILE_STATE.panel.kind = action === 'profile-panel-movs' ? 'movs' : 'attendance'; profileRenderPanel(); profilePersist(); } }
    else if (action === 'profile-alert') profileAlert(value);
    else if (action === 'profile-export') {
      var model = profileValidate(), act = model && model.byCode[PROFILE_STATE.activity]; if (!act) return;
      downloadCsv('PCRP_' + model.municipality.replace(/[^a-z0-9]+/gi, '_') + '_' + act.code + '_' + PROFILE_STATE.view + '.csv', csvOf(profileExportRows(model, act, profileFilters(), PROFILE_STATE.view)));
    } else if (action === 'profile-dqa') profileOpenHealth();
    else if (action === 'profile-return') { PROFILE_STATE.returnLink = false; go('profile'); }
    else if (action === 'profile-open-muni') { if (openMunicipalityProfile(value) && STATE.page === 'profile') window.scrollTo(0, 0); }
    else if (action === 'profile-directory') {
      if (isMunicipalUser()) return;
      profileClosePanel(false); PROFILE_STATE.municipality = ''; PROFILE_STATE.barangay = ''; PROFILE_STATE.activity = ''; PROFILE_STATE.filters = {};
      profilePersist(); renderMunicipalityProfile();
    } else if (action === 'profile-home') {
      profileClosePanel(false); PROFILE_STATE.home = value === 'movmap' || value === 'cvmap' ? value : 'sequence'; PROFILE_STATE.barangay = ''; if (PROFILE_STATE.home !== 'sequence') PROFILE_STATE.activity = '';
      profilePersist(); renderMunicipalityProfile();
      var activeTab = $('profile-tab-' + PROFILE_STATE.home); if (activeTab && button.getAttribute('role') === 'tab') activeTab.focus({ preventScroll: true });
    } else if (action === 'profile-barangay') {
      profileClosePanel(false); PROFILE_STATE.barangay = value; profilePersist(); renderMunicipalityProfile();
      if (value) window.scrollTo(0, 0);
    } else if (action === 'profile-print') profilePrintReport();
    else if (action === 'profile-go') { if (!isMunicipalUser()) { STATE.muni = PROFILE_STATE.municipality; if (value === 'mrest' && typeof MRT_STATE !== 'undefined') MRT_STATE.muni = PROFILE_STATE.municipality; } go(value); }
    else if (action === 'profile-cv-cell') profileOpenVolunteers(value, button.getAttribute('data-body') || '', button.getAttribute('data-position') || '');
    else if (action === 'profile-cv-export') {
      var cvModel = profileValidate(); if (!cvModel) return;
      downloadCsv('PCRP_' + cvModel.municipality.replace(/[^a-z0-9]+/gi, '_') + '_Stage' + PROFILE_STATE.stage + '_Community_Volunteer_checklist.csv', csvOf(profileCvExportRows(cvModel)));
    }
    else if (action === 'profile-quick') { profileApplyQuick(profileFilters(), value); profilePersist(); renderMunicipalityProfile(); }
    else if (action === 'profile-dir-view') {
      profileDirLoadView(); PROFILE_DIR.view = ['list', 'swimlane'].indexOf(value) !== -1 ? value : 'matrix'; PROFILE_DIR.animate = true; profileDirSaveView(); renderMunicipalityProfile();
      var dirTab = $('profile-dir-tab-' + PROFILE_DIR.view); if (dirTab && button.getAttribute('role') === 'tab') dirTab.focus({ preventScroll: true });
    }
    else if (action === 'profile-race-order') { profileDirLoadView(); PROFILE_DIR.order = value === 'province' ? 'province' : 'rank'; PROFILE_DIR.animate = true; profileDirSaveView(); renderMunicipalityProfile(); }
    else if (action === 'profile-race-scope') { profileDirLoadView(); PROFILE_DIR.scope = value === 'stage' ? 'stage' : 'all'; PROFILE_DIR.animate = true; profileDirSaveView(); renderMunicipalityProfile(); }
    else if (action === 'profile-race-focus') {
      var raceLane = Array.prototype.filter.call(document.querySelectorAll('.psw-lane'), function (lane) { return lane.getAttribute('data-key') === value; })[0];
      if (raceLane) {
        raceLane.scrollIntoView({ block: 'center', behavior: 'smooth' }); raceLane.classList.add('psw-flash');
        setTimeout(function () { raceLane.classList.remove('psw-flash'); }, 2600);
        var laneButton = raceLane.querySelector('.psw-name button'); if (laneButton) laneButton.focus({ preventScroll: true });
      }
    }
    else if (action === 'profile-race-replay') { PROFILE_DIR.animate = true; renderMunicipalityProfile(); }
    else if (action === 'profile-dir-matrix-show') { profileDirLoadView(); PROFILE_DIR.mshow = value === 'behind' ? 'behind' : 'all'; profileDirSaveView(); renderMunicipalityProfile(); }
    else if (action === 'profile-dir-matrix-sort') { profileDirLoadView(); PROFILE_DIR.msort = value === 'low' ? 'low' : 'province'; profileDirSaveView(); renderMunicipalityProfile(); }
    else if (action === 'profile-dir-format') { profileDirLoadView(); PROFILE_DIR.format = value === 'pct' ? 'pct' : 'frac'; profileDirSaveView(); renderMunicipalityProfile(); }
    else if (action === 'profile-dir-cell') openMunicipalityProfile(value, button.getAttribute('data-code') || '');
    else if (action === 'profile-dir-matrix-export') downloadCsv('PCRP_Stage' + PROFILE_STATE.stage + '_Municipal_Activity_MOV_checklist.csv', csvOf(profileDirMatrixExportRows()));
    else if (action === 'profile-dir-sort') { PROFILE_DIR.dir = PROFILE_DIR.sort === value ? -PROFILE_DIR.dir : (['name', 'province'].indexOf(value) === -1 ? -1 : 1); PROFILE_DIR.sort = value; renderMunicipalityProfile(); }
    else if (action === 'profile-map-export') {
      var exportModel = profileValidate(); if (!exportModel) return;
      downloadCsv('PCRP_' + exportModel.municipality.replace(/[^a-z0-9]+/gi, '_') + '_Stage' + PROFILE_STATE.stage + '_Activity_MOV_checklist.csv', csvOf(profileMapExportRows(exportModel)));
    }
  } catch (error) { toast(error.message); console.error(error); }
});
// Profile view tabs: arrow keys, Home and End move between tabs and open them.
document.addEventListener('keydown', function (event) {
  var tab = event.target.closest && event.target.closest('.profile-home-tabs [role="tab"]'); if (!tab) return;
  var tabs = Array.prototype.slice.call(tab.parentNode.querySelectorAll('[role="tab"]')), at = tabs.indexOf(tab);
  var next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  tabs[(next + tabs.length) % tabs.length].click();
});
document.addEventListener('change', function (event) {
  var field = event.target.getAttribute('data-profile-filter'), action = event.target.getAttribute('data-act');
  if (field && Object.prototype.hasOwnProperty.call(profileDefaults(), field)) { profileFilters()[field] = event.target.value; profilePersist(); renderMunicipalityProfile(); }
  else if (event.target.getAttribute('data-profile-cv-filter')) { profileCvFilters()[event.target.getAttribute('data-profile-cv-filter')] = event.target.value; profilePersist(); renderMunicipalityProfile(); }
  else if (event.target.getAttribute('data-profile-map-filter')) { profileMapFilters()[event.target.getAttribute('data-profile-map-filter')] = event.target.value; renderMunicipalityProfile(); }
  else if (action === 'profile-municipality') openMunicipalityProfile(event.target.value);
  else if (action === 'profile-barangay-select') { profileClosePanel(false); PROFILE_STATE.barangay = event.target.value; profilePersist(); renderMunicipalityProfile(); }
});
var profileDialog = $('profile-evidence-dialog');
if (profileDialog) {
  profileDialog.addEventListener('cancel', function (event) { event.preventDefault(); profileClosePanel(false); });
  profileDialog.addEventListener('click', function (event) { if (event.target === profileDialog) { var r = profileDialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right) profileClosePanel(false); } });
}
// Scope changes also update the profile entry label and invalidate disallowed selections on render.
var profileOriginalRenderStatus = renderStatus;
renderStatus = function () {
  var result = profileOriginalRenderStatus.apply(this, arguments);
  if ($('profile-nav-label')) $('profile-nav-label').textContent = isMunicipalUser() ? 'My Municipality' : 'Municipality Profile';
  return result;
};
