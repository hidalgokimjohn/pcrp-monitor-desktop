// ===================================================================
// VERIFY — the Precision part of the DQA (SM7 Table 8). The PEA or MDE takes
// the signed paper form and tags each row encoded in KCIS: it matches the
// form, it differs (and how), or it is not on the form. They also count the
// names on the form, so the people on paper but not encoded show too.
//
// Four forms, one record each:
//   att    attendance sheet         per barangay (or municipality) and activity
//   hh     household roster         per barangay and assembly
//   cv     CV Profile Form and the barangay resolution, per barangay and body (BResT, SFMSC)
//   mrest  the Executive Order creating the MResT, per municipality
//
// A tag is kept by person (name key), not by row number, so it survives a
// re-import; a tagged name no longer in the export shows as "no longer in
// KCIS". Tags are saved with the data (saved.js) and go into the .pcrp file.
// ===================================================================

var VERIFY = {
  tags: { version: 1, records: {} },
  ui: { form: 'att', muni: '', brgy: '', show: 'all', open: '', search: '' },
  cache: null, cacheFor: null
};

var VF_FORMS = {
  att:   { label: 'Attendance sheet', paper: 'the signed attendance sheet', unit: 'attendee', units: 'attendees',
           countLabel: 'Names on the signed sheet', absent: 'Not on the sheet',
           what: ['Name spelling', 'Sex', 'Other'] },
  hh:    { label: 'Household roster', paper: 'the household roster form', unit: 'household', units: 'households',
           countLabel: 'Households on the roster form', absent: 'Not on the roster',
           what: ['Name spelling', 'Birthdate', 'Is Present', 'Other'] },
  cv:    { label: 'Volunteers (BResT, SFMSC)', paper: 'the CV Profile Forms and the barangay resolution', unit: 'volunteer', units: 'volunteers',
           countLabel: 'Volunteers in the resolution', absent: 'Not in the resolution',
           what: ['Name spelling', 'Sex', 'Committee', 'Position', 'Other'] },
  mrest: { label: 'MResT (Executive Order)', paper: 'the Executive Order creating the MResT', unit: 'member', units: 'members',
           countLabel: 'Members in the Executive Order', absent: 'Not in the EO',
           what: ['Name spelling', 'Sex', 'Position or office', 'Other'] }
};
var VF_SAMPLE_SHARE = 0.1, VF_SAMPLE_MIN = 3;

// ---- the records, from the exports on screen ----------------------------------------

/** MResT members: Seq 1 committee rows of the volunteer list that name the MResT, per municipality. */
function vfMrestRows() {
  var V = readRawTable(SHEETS.VOLUNTEERS);
  if (!V.rows.length) return null;
  var C = volunteerColumnIndex(V.headers);
  var bl = readBaseline(), base = buildBaseline(bl.rows, bl.monitored);
  var byKey = {}, noProv = {};
  base.muniList.forEach(function (m) {
    byKey[normKey(m.province) + '|' + normKey(m.municipality)] = m;
    var k = normKey(m.municipality);
    noProv[k] = noProv.hasOwnProperty(k) ? null : m;
  });
  var out = [];
  V.rows.forEach(function (row) {
    var com = row[C.committee];
    if (cvCommitteeKind(com) !== 'SEQ1') return;
    var a = normAlpha(com);
    if (a.indexOf('mrest') === -1 && a.indexOf('municipalresilienceteam') === -1) return;   // the municipal SFMC is not the MResT
    var m = byKey[normKey(row[C.province]) + '|' + normKey(row[C.muni])] || noProv[normKey(row[C.muni])];
    if (!m) return;
    var first = row[C.first], middle = row[C.middle], last = row[C.last];
    out.push({ province: m.province, municipality: m.municipality, barangay: '', act: 'MREST',
      name: personName(first, middle, last), key: personKey(first, middle, last),
      sex: normText(row[C.sex]).toLowerCase(), position: normText(row[C.position]), committee: normText(com) });
  });
  return out;
}

/** Every record of one form in the exports on screen: { key, form, province, municipality, barangay, act, label, rows }. */
function vfRecords(form) {
  if (!VERIFY.cache || VERIFY.cacheFor !== S.overview) { VERIFY.cache = {}; VERIFY.cacheFor = S.overview; }
  if (VERIFY.cache[form]) return VERIFY.cache[form];
  var src, group, detail;
  var P = people();
  if (form === 'att') {
    src = P.attendees;
    group = function (r) { return r.act; };
    detail = function (r) { return [r.sex ? cap(r.sex) : 'sex not recorded', r.date].filter(Boolean).join(' · '); };
  } else if (form === 'hh') {
    src = P.households;
    group = function (r) { return r.act; };
    detail = function (r) { return [r.birthdate ? 'born ' + r.birthdate : 'no birthdate', r.head ? 'head' : '', r.present ? 'present' : 'not present'].filter(Boolean).join(' · '); };
  } else if (form === 'cv') {
    src = LOADED.volunteers ? P.volunteers.filter(function (r) { return r.body; }) : null;
    group = function (r) { return r.body; };
    detail = function (r) { return [r.position || 'no position', r.sex ? cap(r.sex) : 'sex not recorded'].join(' · '); };
  } else {
    src = LOADED.volunteers ? vfMrestRows() : null;
    group = function () { return 'MREST'; };
    detail = function (r) { return [r.position || 'no position', r.sex ? cap(r.sex) : 'sex not recorded'].join(' · '); };
  }
  if (!src) return (VERIFY.cache[form] = null);
  var by = {}, list = [];
  src.forEach(function (r) {
    if (!r.key) return;              // a row with no name cannot be found on a form; Data Health lists those
    var act = group(r);
    var key = [form, r.province, r.municipality, r.barangay || '', act].join('|');
    var rec = by[key];
    if (!rec) {
      rec = by[key] = { key: key, form: form, province: r.province, municipality: r.municipality, barangay: r.barangay || '',
                        act: act, label: vfActLabel(form, act), rows: [], seen: {} };
      list.push(rec);
    }
    // the same name twice in one record is two rows to check: keep both
    var base = r.key, rk = base, i = 2;
    while (rec.seen[rk]) rk = base + ' ~' + (i++);
    rec.seen[rk] = true;
    rec.rows.push({ rk: rk, name: r.name, detail: detail(r) });
  });
  list.forEach(function (r) { delete r.seen; });
  list.sort(function (a, b) {
    return (a.municipality + '|' + a.barangay + '|' + a.label).localeCompare(b.municipality + '|' + b.barangay + '|' + b.label);
  });
  return (VERIFY.cache[form] = list);
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function vfActLabel(form, act) {
  if (form === 'cv') return act === 'SFMSC' ? 'SFMSC' : 'BResT';
  if (form === 'mrest') return 'MResT';
  var acts = (S.overview && S.overview.activities) || [];
  for (var i = 0; i < acts.length; i++) if (acts[i].code === act) return acts[i].label;
  return act;
}

// ---- tags and their numbers -----------------------------------------------------

function vfTag(recKey) { return VERIFY.tags.records[recKey] || null; }

/** Numbers for one record: rows checked against the form, how they came out, and the form count. */
function vfStats(rec) {
  var t = vfTag(rec.key) || {}, rows = t.rows || {}, s = { encoded: rec.rows.length, checked: 0, match: 0, differs: 0, absent: 0, gone: 0,
    formCount: typeof t.formCount === 'number' ? t.formCount : null, sample: !!t.sample, by: t.by || '', at: t.at || '' };
  var present = {};
  rec.rows.forEach(function (r) {
    present[r.rk] = true;
    var g = rows[r.rk];
    if (!g) return;
    s.checked++;
    s[g.s]++;
  });
  Object.keys(rows).forEach(function (rk) { if (!present[rk]) s.gone++; });
  s.done = s.encoded > 0 && s.checked === s.encoded;
  s.issues = s.differs + s.absent + (s.formCount !== null && s.formCount > s.encoded ? s.formCount - s.encoded : 0);
  return s;
}

/** Totals over records: rows matching the form, and names on the form against rows encoded. */
function vfTotals(recs) {
  var t = { records: recs.length, verified: 0, complete: 0, checked: 0, match: 0, differs: 0, absent: 0, form: 0, encodedWithForm: 0, notEncoded: 0, sample: 0 };
  recs.forEach(function (rec) {
    var s = vfStats(rec);
    if (s.sample) t.sample++;
    if (s.checked) t.verified++;
    if (s.done) t.complete++;
    t.checked += s.checked; t.match += s.match; t.differs += s.differs; t.absent += s.absent;
    if (s.formCount !== null) {
      t.form += s.formCount; t.encodedWithForm += s.encoded;
      if (s.formCount > s.encoded) t.notEncoded += s.formCount - s.encoded;
    }
  });
  t.agreement = t.checked ? t.match / t.checked : null;
  t.factor = t.encodedWithForm ? t.form / t.encodedWithForm : null;
  return t;
}

/**
 * For the Data Health Scorecard (Precision card): totals over every form, for
 * the records in scope. inScope(place) is the page's own scope test.
 */
function dhPrecisionSummary(inScope) {
  if (!STATE.computed) return null;
  var all = [];
  Object.keys(VF_FORMS).forEach(function (f) {
    (vfRecords(f) || []).forEach(function (r) { if (inScope(r)) all.push(r); });
  });
  var t = vfTotals(all);
  t.byForm = {};
  Object.keys(VF_FORMS).forEach(function (f) {
    var recs = (vfRecords(f) || []).filter(inScope);
    if (recs.length) t.byForm[f] = vfTotals(recs);
  });
  return t;
}
function openVerify() { go('verify'); }

// ---- tagging ------------------------------------------------------------------------

function vfVerifier() { return (prefs().verifier || '').trim(); }

function vfEnsure(rec) {
  var t = VERIFY.tags.records[rec.key];
  if (!t) t = VERIFY.tags.records[rec.key] = { form: rec.form, province: rec.province, municipality: rec.municipality,
                                              barangay: rec.barangay, act: rec.act, label: rec.label, rows: {} };
  t.rows = t.rows || {};
  return t;
}

function vfFind(recKey) {
  var form = recKey.split('|')[0];
  return (vfRecords(form) || []).filter(function (r) { return r.key === recKey; })[0] || null;
}

function vfSetRow(recKey, rk, status, what) {
  if (!vfVerifier()) { toast('Type your name in "Checked by" first.'); var i = $('vf-by'); if (i) i.focus(); return; }
  var rec = vfFind(recKey);
  if (!rec) return;
  var t = vfEnsure(rec);
  var now = new Date().toISOString();
  if (!status) delete t.rows[rk];
  else t.rows[rk] = { s: status, what: status === 'differs' ? (what || (t.rows[rk] && t.rows[rk].what) || VF_FORMS[rec.form].what[0]) : '', by: vfVerifier(), at: now };
  t.by = vfVerifier(); t.at = now;
  savedPutTags();
  renderVerify();
}

function vfMarkRest(recKey) {
  if (!vfVerifier()) { toast('Type your name in "Checked by" first.'); return; }
  var rec = vfFind(recKey);
  if (!rec) return;
  var left = rec.rows.filter(function (r) { return !((vfTag(recKey) || {}).rows || {})[r.rk]; });
  if (!left.length) return;
  if (!confirm('Mark the ' + left.length + ' rows not checked yet as matching ' + VF_FORMS[rec.form].paper + '? Only do this after reading each of them on the form.')) return;
  var t = vfEnsure(rec), now = new Date().toISOString();
  left.forEach(function (r) { t.rows[r.rk] = { s: 'match', what: '', by: vfVerifier(), at: now }; });
  t.by = vfVerifier(); t.at = now;
  savedPutTags();
  renderVerify();
}

function vfSetFormCount(recKey, v) {
  var rec = vfFind(recKey);
  if (!rec) return;
  var t = vfEnsure(rec), num = String(v).trim() === '' ? null : Math.max(0, Math.round(Number(v)));
  if (num === null || isNaN(num)) delete t.formCount; else t.formCount = num;
  t.at = new Date().toISOString(); if (vfVerifier()) t.by = vfVerifier();
  savedPutTags();
  renderVerify();
}

function vfSetNote(recKey, v) {
  var rec = vfFind(recKey);
  if (!rec) return;
  var t = vfEnsure(rec);
  t.note = String(v || '').slice(0, 500);
  savedPutTags();
}

/** Random records not yet verified, VF_SAMPLE_SHARE of the scope (at least VF_SAMPLE_MIN), marked "in sample". */
function vfSuggestSample() {
  var recs = vfScoped();
  if (!recs) return;
  var free = recs.filter(function (r) { var s = vfStats(r); return !s.checked && !s.sample; });
  var want = Math.min(free.length, Math.max(VF_SAMPLE_MIN, Math.ceil(recs.length * VF_SAMPLE_SHARE)));
  if (!want) { toast('Every record here is already verified or in the sample.'); return; }
  for (var i = free.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = free[i]; free[i] = free[j]; free[j] = x; }
  var day = today();
  free.slice(0, want).forEach(function (r) { vfEnsure(r).sample = day; });
  VERIFY.ui.show = 'sample';
  savedPutTags();
  toast(want + (want === 1 ? ' record' : ' records') + ' picked at random for the sample.');
  renderVerify();
}

// ---- the page --------------------------------------------------------------------------

/** Records of the chosen form in the chosen municipality (or the home scope), before the list filter. */
function vfScoped() {
  var recs = vfRecords(VERIFY.ui.form);
  if (!recs) return null;
  var m = VERIFY.ui.muni || homeKey();
  return recs.filter(function (r) { return !m || r.province + '|' + r.municipality === m; });
}

function vfStatusPill(s) {
  if (s.gone && !s.checked) return '<span class="pill warn">Tagged names no longer in KCIS</span>';
  if (!s.checked) return s.sample ? '<span class="pill">In sample · not verified</span>' : '<span class="tiny">Not verified</span>';
  var bits = s.done ? '<span class="pill ' + (s.issues ? 'warn' : 'good') + '">Verified' + (s.issues ? ' · ' + n(s.issues) + ' to fix' : '') + '</span>'
                    : '<span class="pill">' + n(s.checked) + ' of ' + n(s.encoded) + ' checked</span>';
  return bits + (s.sample ? ' <span class="pill">Sample</span>' : '');
}

function vfPct(v) { return v === null ? '—' : (Math.round(v * 1000) / 10).toFixed(1) + '%'; }

function renderVerify() {
  var body = $('vf-body');
  if (!body) return;
  if (!STATE.computed) { body.innerHTML = '<div class="card"><p class="muted">Load the exports first.</p></div>'; return; }
  var u = VERIFY.ui, F = VF_FORMS[u.form];
  if (u.open && vfFind(u.open)) { body.innerHTML = vfRecordView(vfFind(u.open)); afterVerifyRender(); return; }
  u.open = '';

  var munis = baselineMunis();
  var region = !homeKey();
  var formSel = '<label class="field"><span>Form</span><select data-act="vf-form">' + Object.keys(VF_FORMS).map(function (k) {
    return '<option value="' + k + '"' + (u.form === k ? ' selected' : '') + '>' + esc(VF_FORMS[k].label) + '</option>';
  }).join('') + '</select></label>';
  var muniSel = region ? '<label class="field"><span>Municipality</span><select data-act="vf-muni"><option value="">All municipalities</option>' +
    munis.map(function (m) { var k = m.province + '|' + m.municipality; return '<option value="' + attr(k) + '"' + (u.muni === k ? ' selected' : '') + '>' + esc(m.municipality + ' (' + m.province + ')') + '</option>'; }).join('') +
    '</select></label>' : '';
  var showSel = '<label class="field"><span>Show</span><select data-act="vf-show">' + [['all', 'All records'], ['todo', 'Not verified'], ['sample', 'In the sample'], ['issues', 'With items to fix'], ['done', 'Verified']].map(function (x) {
    return '<option value="' + x[0] + '"' + (u.show === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
  }).join('') + '</select></label>';
  var bySel = '<label class="field"><span>Checked by</span><input id="vf-by" data-act="vf-by" placeholder="Name and position, e.g. J. Cruz (PEA)" value="' + attr(vfVerifier()) + '" style="min-width:220px"></label>';
  var head = '<div class="card"><div class="card-head"><div><h2>Verify against the forms</h2>' +
    '<div class="muted">The Precision part of the DQA (SM7 Table 8): check what is encoded in KCIS against ' + esc(F.paper) + '.</div></div>' +
    '<div class="row-actions" style="margin:0"><button class="btn ghost" data-act="vf-sample">Suggest a sample</button>' +
    '<button class="btn ghost" data-act="vf-csv">CSV of the results</button></div></div>' +
    '<div class="filters">' + formSel + muniSel + showSel + bySel + '</div>';

  var recs = vfScoped();
  if (!recs) {
    body.innerHTML = head + '<p class="muted">Load the Community Volunteer List to verify ' + esc(F.units) + '.</p></div>';
    afterVerifyRender(); return;
  }
  var t = vfTotals(recs);
  var kpi = function (label, val, sub) { return '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + val + '</div>' + (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>'; };
  var kpis = '<div class="grid-kpi">' +
    kpi('Records verified', n(t.verified) + ' <span class="tiny">of ' + n(t.records) + '</span>', n(t.complete) + ' fully checked' + (t.sample ? ' · ' + n(t.sample) + ' in the sample' : '')) +
    kpi('Rows matching the form', vfPct(t.agreement), t.checked ? n(t.match) + ' of ' + n(t.checked) + ' rows checked' : 'nothing checked yet') +
    kpi('On the form ÷ encoded', t.factor === null ? '—' : t.factor.toFixed(2), t.factor === null ? 'enter the count on the form' : n(t.form) + ' on the forms, ' + n(t.encodedWithForm) + ' encoded') +
    kpi('Items to fix in KCIS', n(t.differs + t.absent + t.notEncoded), [t.differs ? n(t.differs) + ' differ' : '', t.absent ? n(t.absent) + ' not on the form' : '', t.notEncoded ? n(t.notEncoded) + ' on the form, not encoded' : ''].filter(Boolean).join(' · ')) +
  '</div>';

  var q = normSearch(u.search || '');
  var list = recs.filter(function (r) {
    var s = vfStats(r);
    if (u.show === 'todo' && s.checked) return false;
    if (u.show === 'sample' && !s.sample) return false;
    if (u.show === 'issues' && !s.issues) return false;
    if (u.show === 'done' && !s.done) return false;
    return !q || normSearch(r.municipality + ' ' + r.barangay + ' ' + r.label).indexOf(q) !== -1;
  });
  var rows = list.map(function (r) {
    var s = vfStats(r);
    return '<tr class="click" data-act="vf-open" data-v="' + attr(r.key) + '" tabindex="0">' +
      '<td>' + esc(r.barangay || 'Municipal level') + (region && !u.muni ? ' <span class="tiny">' + esc(r.municipality) + '</span>' : '') + '</td>' +
      '<td>' + esc(r.label) + '</td><td class="num">' + n(s.encoded) + '</td>' +
      '<td class="num">' + (s.formCount === null ? '<span class="tiny">—</span>' : n(s.formCount)) + '</td>' +
      '<td>' + vfStatusPill(s) + '</td><td class="tiny">' + esc(s.by) + '</td></tr>';
  }).join('');
  var table = list.length
    ? '<div class="table-wrap"><table class="grid"><thead><tr><th>Barangay</th><th>' + (u.form === 'cv' ? 'Body' : 'Activity') + '</th><th class="num">Encoded</th><th class="num">On the form</th><th>Status</th><th>Checked by</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '<p class="muted">No records match.</p>';
  body.innerHTML = head + kpis +
    '<div class="filters"><label class="field" style="flex:1"><span>Search</span><input data-act="vf-search" id="vf-search" placeholder="Barangay or activity" value="' + attr(u.search) + '"></label></div>' +
    table + '<p class="tiny" style="margin-top:8px">Click a record to check it against the form. The tags stay on this PC with the saved data and go into "Save to a file".</p></div>';
  afterVerifyRender();
}

function vfRecordView(rec) {
  var F = VF_FORMS[rec.form], t = vfTag(rec.key) || {}, tags = t.rows || {}, s = vfStats(rec);
  var btn = function (rk, st, label, on) {
    return '<button class="vf-tag' + (on ? ' on ' + st : '') + '" data-act="vf-tag" data-rec="' + attr(rec.key) + '" data-rk="' + attr(rk) + '" data-s="' + st + '">' + esc(label) + '</button>';
  };
  var rows = rec.rows.map(function (r, i) {
    var g = tags[r.rk], st = g ? g.s : '';
    var what = st === 'differs' ? '<select class="vf-what" data-act="vf-what" data-rec="' + attr(rec.key) + '" data-rk="' + attr(r.rk) + '">' +
      F.what.map(function (w) { return '<option' + (g.what === w ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('') + '</select>' : '';
    return '<tr class="' + (st ? 'vf-' + st : '') + '"><td class="num tiny">' + (i + 1) + '</td>' +
      '<td><strong>' + esc(r.name) + '</strong><div class="tiny">' + esc(r.detail) + '</div></td>' +
      '<td><div class="vf-tags">' + btn(r.rk, 'match', 'Matches', st === 'match') + btn(r.rk, 'differs', 'Differs', st === 'differs') +
        btn(r.rk, 'absent', F.absent, st === 'absent') + (st ? '<button class="link tiny" data-act="vf-tag" data-rec="' + attr(rec.key) + '" data-rk="' + attr(r.rk) + '" data-s="">Clear</button>' : '') +
        what + '</div></td></tr>';
  }).join('');
  var gone = Object.keys(tags).filter(function (rk) { return !rec.rows.some(function (r) { return r.rk === rk; }); });
  var notEnc = s.formCount !== null && s.formCount > s.encoded ? s.formCount - s.encoded : 0;
  return '<div class="card"><div class="card-head"><div>' +
      '<button class="link" data-act="vf-back">← All records</button>' +
      '<h2>' + esc(rec.barangay || rec.municipality) + ' · ' + esc(rec.label) + '</h2>' +
      '<div class="muted">' + esc(F.label) + ' · ' + esc(rec.municipality) + ', ' + esc(rec.province) + ' · ' + n(s.encoded) + ' ' + esc(s.encoded === 1 ? F.unit : F.units) + ' encoded in KCIS</div></div>' +
      '<div>' + vfStatusPill(s) + '</div></div>' +
    '<p class="muted">Open ' + esc(F.paper) + '. For each name encoded in KCIS, mark whether it matches the form. Then count the names on the form.</p>' +
    '<div class="filters"><label class="field"><span>Checked by</span><input id="vf-by" data-act="vf-by" placeholder="Name and position" value="' + attr(vfVerifier()) + '" style="min-width:220px"></label>' +
      '<label class="field"><span>' + esc(F.countLabel) + '</span><input type="number" min="0" data-act="vf-count" data-rec="' + attr(rec.key) + '" value="' + (s.formCount === null ? '' : s.formCount) + '" style="width:110px"></label>' +
      '<label class="field" style="flex:1"><span>Note</span><input data-act="vf-note" data-rec="' + attr(rec.key) + '" maxlength="500" placeholder="e.g. page 2 of the sheet missing" value="' + attr(t.note || '') + '"></label></div>' +
    '<div class="vf-sum">' +
      '<span><strong>' + n(s.checked) + '</strong> of ' + n(s.encoded) + ' checked</span>' +
      '<span class="good-t"><strong>' + n(s.match) + '</strong> match</span>' +
      '<span class="warn-t"><strong>' + n(s.differs) + '</strong> differ</span>' +
      '<span class="bad-t"><strong>' + n(s.absent) + '</strong> ' + esc(F.absent.toLowerCase()) + '</span>' +
      (notEnc ? '<span class="bad-t"><strong>' + n(notEnc) + '</strong> on the form but not encoded</span>' : '') +
      (s.formCount !== null && s.encoded ? '<span>On the form ÷ encoded: <strong>' + (s.formCount / s.encoded).toFixed(2) + '</strong></span>' : '') +
    '</div>' +
    (gone.length ? '<div class="msg warn">' + n(gone.length) + ' tagged ' + (gone.length === 1 ? 'name is' : 'names are') + ' no longer in this record in KCIS (corrected or removed since it was checked).</div>' : '') +
    '<div class="table-wrap"><table class="grid vf-table"><thead><tr><th class="num">#</th><th>Encoded in KCIS</th><th>Against the form</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="row-actions"><button class="btn ghost" data-act="vf-rest" data-v="' + attr(rec.key) + '">Mark the rest as matching</button>' +
      '<button class="btn ghost" data-act="vf-back">Done</button></div>' +
    (t.by ? '<p class="tiny">Last checked by ' + esc(t.by) + ' on ' + esc(new Date(t.at).toLocaleString()) + '.</p>' : '') +
  '</div>';
}

function afterVerifyRender() { refreshIcons($('vf-body')); }

/** Every tagged row and every record with a form count, for the DQA report. Holds names. */
function vfCsv() {
  var lines = [['Form', 'Province', 'Municipality', 'Barangay', 'Activity or body', 'Name', 'Against the form', 'What differs',
                'Checked by', 'Checked on', 'Encoded in KCIS', 'On the form', 'In sample', 'Note']];
  Object.keys(VF_FORMS).forEach(function (f) {
    (vfRecords(f) || []).forEach(function (rec) {
      var t = vfTag(rec.key);
      if (!t) return;
      var s = vfStats(rec), F = VF_FORMS[f];
      var common = function (name, st, what, by, at) {
        return [F.label, rec.province, rec.municipality, rec.barangay || 'Municipal level', rec.label, name, st, what, by, at ? at.slice(0, 10) : '',
                s.encoded, s.formCount === null ? '' : s.formCount, t.sample ? 'Yes' : '', t.note || ''];
      };
      var any = false;
      rec.rows.forEach(function (r) {
        var g = (t.rows || {})[r.rk];
        if (!g) return;
        any = true;
        lines.push(common(r.name, g.s === 'match' ? 'Matches' : g.s === 'differs' ? 'Differs' : F.absent, g.what || '', g.by, g.at));
      });
      if (!any) lines.push(common('', 'Not checked yet', '', t.by || '', t.at || ''));
    });
  });
  downloadCsv('PCRP_verification_' + (homeLabel() || 'region').replace(/[^A-Za-z0-9]+/g, '_') + '_' + today() + '.csv', csvOf(lines));
  toast('The file holds names: keep it under the Data Privacy Act.');
}

// ---- events --------------------------------------------------------------------------------

document.addEventListener('click', function (ev) {
  var el = ev.target.closest && ev.target.closest('[data-act]');
  if (!el) return;
  var act = el.getAttribute('data-act');
  if (act === 'vf-open') { VERIFY.ui.open = el.getAttribute('data-v'); renderVerify(); window.scrollTo(0, 0); }
  else if (act === 'vf-back') { VERIFY.ui.open = ''; renderVerify(); }
  else if (act === 'vf-tag') {
    var cur = ((vfTag(el.getAttribute('data-rec')) || {}).rows || {})[el.getAttribute('data-rk')];
    var st = el.getAttribute('data-s');
    vfSetRow(el.getAttribute('data-rec'), el.getAttribute('data-rk'), cur && cur.s === st ? '' : st);
  }
  else if (act === 'vf-rest') vfMarkRest(el.getAttribute('data-v'));
  else if (act === 'vf-sample') vfSuggestSample();
  else if (act === 'vf-csv') vfCsv();
  else if (act === 'save-file') savedToFile();
  else if (act === 'saved-forget') savedForget();
  else if (act === 'open-verify') openVerify();
});
document.addEventListener('keydown', function (ev) {
  if (ev.key !== 'Enter') return;
  var t = ev.target.closest && ev.target.closest('tr[data-act="vf-open"]');
  if (t) { VERIFY.ui.open = t.getAttribute('data-v'); renderVerify(); }
});
document.addEventListener('change', function (ev) {
  var t = ev.target, act = t.getAttribute && t.getAttribute('data-act');
  if (act === 'vf-form') { VERIFY.ui.form = t.value; VERIFY.ui.open = ''; renderVerify(); }
  else if (act === 'vf-muni') { VERIFY.ui.muni = t.value; renderVerify(); }
  else if (act === 'vf-show') { VERIFY.ui.show = t.value; renderVerify(); }
  else if (act === 'vf-by') { var p = prefs(); p.verifier = t.value.trim().slice(0, 80); savePrefs(p); }
  else if (act === 'vf-count') vfSetFormCount(t.getAttribute('data-rec'), t.value);
  else if (act === 'vf-note') vfSetNote(t.getAttribute('data-rec'), t.value);
  else if (act === 'vf-what') vfSetRow(t.getAttribute('data-rec'), t.getAttribute('data-rk'), 'differs', t.value);
});
document.addEventListener('input', function (ev) {
  var t = ev.target;
  if (t.getAttribute && t.getAttribute('data-act') === 'vf-search') {
    VERIFY.ui.search = t.value;
    var pos = t.selectionStart;
    renderVerify();
    var again = $('vf-search');
    if (again) { again.focus({ preventScroll: true }); try { again.setSelectionRange(pos, pos); } catch (e) {} }
  }
});
