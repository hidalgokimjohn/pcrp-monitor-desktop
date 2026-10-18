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
  ui: { form: 'att', muni: '', brgy: '', show: 'all', open: '', search: '', sortCol: 'brgy', sortDir: 'asc', itemSearch: '', itemFilter: 'all', itemSortCol: 'num', itemSortDir: 'asc' },
  cache: null, cacheFor: null
};

var VF_FORMS = {
  att:   { label: 'Attn Sheet', paper: 'the signed attendance sheet (attn sheet)', unit: 'attendee', units: 'attendees',
           countLabel: 'Names on the signed attn sheet', absent: 'Not on the attn sheet',
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

function vfRefreshFilterCardCounts(rec) {
  var t = vfTag(rec.key) || {}, tags = t.rows || {};
  var iq = normSearch(VERIFY.ui.itemSearch || '');
  var searchRows = rec.rows.filter(function (r) {
    if (!iq) return true;
    return normSearch(r.name + ' ' + (r.detail || '')).indexOf(iq) !== -1;
  });
  var cAll = searchRows.length;
  var cUnchecked = searchRows.filter(function (r) { return !tags[r.rk]; }).length;
  var cMatch = searchRows.filter(function (r) { return tags[r.rk] && tags[r.rk].s === 'match'; }).length;
  var cDiffers = searchRows.filter(function (r) { return tags[r.rk] && tags[r.rk].s === 'differs'; }).length;
  var cAbsent = searchRows.filter(function (r) { return tags[r.rk] && tags[r.rk].s === 'absent'; }).length;

  var updateFc = function (val, cnt) {
    var badge = document.querySelector('button[data-act="vf-item-filter"][data-v="' + val + '"] .fc-count');
    if (badge) badge.textContent = n(cnt);
  };
  updateFc('all', cAll);
  updateFc('unchecked', cUnchecked);
  updateFc('match', cMatch);
  updateFc('differs', cDiffers);
  updateFc('absent', cAbsent);
}

function vfUpdateInPlace(recKey, rk, status, what) {
  var rec = vfFind(recKey);
  if (!rec) return false;
  var rowBtn = document.querySelector('[data-act="vf-tag"][data-rec="' + recKey + '"][data-rk="' + rk + '"]');
  if (!rowBtn) return false;
  var tr = rowBtn.closest('tr');
  if (!tr) return false;

  // If filtered to non-all, we should re-render so row leaves/enters the filtered view with scroll preserved
  if (VERIFY.ui.itemFilter && VERIFY.ui.itemFilter !== 'all') return false;

  // Update row class
  tr.classList.remove('vf-match', 'vf-differs', 'vf-absent');
  if (status) tr.classList.add('vf-' + status);

  // Update tag buttons inside the row
  var tagsDiv = tr.querySelector('.vf-tags');
  if (tagsDiv) {
    var btns = tagsDiv.querySelectorAll('button.vf-tag');
    Array.prototype.forEach.call(btns, function (b) {
      var s = b.getAttribute('data-s');
      b.classList.toggle('on', s === status);
      b.classList.toggle(s, s === status);
    });
    var whatSel = tagsDiv.querySelector('select.vf-what');
    if (status === 'differs') {
      if (!whatSel) {
        var F = VF_FORMS[rec.form];
        var selHtml = '<select class="vf-what" data-act="vf-what" data-rec="' + attr(rec.key) + '" data-rk="' + attr(rk) + '">' +
          F.what.map(function (w) { return '<option' + (what === w ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('') + '</select>';
        tagsDiv.insertAdjacentHTML('beforeend', selHtml);
      } else if (what) {
        whatSel.value = what;
      }
    } else if (whatSel) {
      whatSel.remove();
    }
  }

  // Update summary stats (.vf-sum)
  var s = vfStats(rec);
  var sumEl = document.querySelector('.vf-sum');
  if (sumEl) {
    var F = VF_FORMS[rec.form];
    var notEnc = s.formCount !== null && s.formCount > s.encoded ? s.formCount - s.encoded : 0;
    sumEl.innerHTML =
      '<span><strong>' + n(s.checked) + '</strong> of ' + n(s.encoded) + ' checked</span>' +
      '<span style="min-width:110px">' + progressBar(s.match, s.differs + s.absent, s.encoded) + '</span>' +
      '<span class="good-t"><strong>' + n(s.match) + '</strong> match</span>' +
      '<span class="warn-t"><strong>' + n(s.differs) + '</strong> differ</span>' +
      '<span class="bad-t"><strong>' + n(s.absent) + '</strong> ' + esc(F.absent.toLowerCase()) + '</span>' +
      (notEnc ? '<span class="bad-t"><strong>' + n(notEnc) + '</strong> on the form but not encoded</span>' : '') +
      (s.formCount !== null && s.encoded ? '<span>On the form ÷ encoded: <strong>' + (s.formCount / s.encoded).toFixed(2) + '</strong></span>' : '');
  }

  // Update card header status pill
  var headPill = document.querySelector('#vf-body .card-head > div:last-child');
  if (headPill) headPill.innerHTML = vfStatusPill(s);

  // Update filter card counts
  vfRefreshFilterCardCounts(rec);

  return true;
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
  if (typeof updateTabBadges === 'function') updateTabBadges();
  
  if (VERIFY.ui.open === recKey && vfUpdateInPlace(recKey, rk, status, what)) {
    return;
  }
  renderVerify(true);
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
  if (typeof updateTabBadges === 'function') updateTabBadges();
  renderVerify(true);
}

function vfSetFormCount(recKey, v) {
  var rec = vfFind(recKey);
  if (!rec) return;
  var t = vfEnsure(rec), num = String(v).trim() === '' ? null : Math.max(0, Math.round(Number(v)));
  if (num === null || isNaN(num)) delete t.formCount; else t.formCount = num;
  t.at = new Date().toISOString(); if (vfVerifier()) t.by = vfVerifier();
  savedPutTags();
  if (typeof updateTabBadges === 'function') updateTabBadges();
  renderVerify(true);
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
  if (typeof updateTabBadges === 'function') updateTabBadges();
  toast(want + (want === 1 ? ' record' : ' records') + ' picked at random for the sample.');
  renderVerify();
}

// ---- the page --------------------------------------------------------------------------

/** Records of the chosen form in the chosen municipality (or the home scope), before the list filter. */
function vfScoped() {
  var recs = vfRecords(VERIFY.ui.form);
  if (!recs) return null;
  var m = (typeof isMunicipalUser === 'function' && isMunicipalUser()) ? homeKey() : (VERIFY.ui.muni || homeKey());
  return recs.filter(function (r) { return !m || r.province + '|' + r.municipality === m; });
}

function vfStatusPill(s) {
  if (s.gone && !s.checked) return '<span class="pill warn">Tagged names no longer in KCIS</span>';
  if (!s.checked) return s.sample ? '<span class="pill">In sample · not verified</span>' : '<span class="tiny">Not verified</span>';
  var bits = s.done ? '<span class="pill ' + (s.issues ? 'warn' : 'good') + '">✓ Verified' + (s.issues ? ' · ' + n(s.issues) + ' to fix' : '') + '</span>'
                    : '<span class="pill">' + n(s.checked) + ' of ' + n(s.encoded) + ' checked</span>';
  return bits + (s.sample ? ' <span class="pill idle">Sample</span>' : '');
}

function vfPct(v) { return v === null ? '—' : (Math.round(v * 1000) / 10).toFixed(1) + '%'; }

function renderVerify(keepScroll) {
  var body = $('vf-body');
  if (!body) return;

  var prevWrap = body.querySelector('.table-wrap');
  var prevWrapScroll = prevWrap ? prevWrap.scrollTop : 0;
  var prevWinScroll = window.scrollY || document.documentElement.scrollTop || 0;

  if (!STATE.computed) { body.innerHTML = '<div class="card"><p class="muted">Load the exports first.</p></div>'; return; }
  var u = VERIFY.ui, F = VF_FORMS[u.form];
  if (u.open && vfFind(u.open)) {
    body.innerHTML = vfRecordView(vfFind(u.open));
    afterVerifyRender();
    if (keepScroll !== false) {
      var newWrap = body.querySelector('.table-wrap');
      if (newWrap && prevWrapScroll) newWrap.scrollTop = prevWrapScroll;
      window.scrollTo(0, prevWinScroll);
      var activeRow = body.querySelector('tr.vf-active-row');
      if (activeRow && newWrap) {
        var rTop = activeRow.offsetTop, rHeight = activeRow.offsetHeight, wHeight = newWrap.clientHeight;
        if (rTop < newWrap.scrollTop || (rTop + rHeight) > (newWrap.scrollTop + wHeight)) {
          activeRow.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
      }
    }
    return;
  }
  u.open = '';

  var munis = baselineMunis();
  var isMuni = typeof isMunicipalUser === 'function' && isMunicipalUser();
  var region = typeof isRegionalUser === 'function' && isRegionalUser();
  var mScope = isMuni ? homeKey() : (u.muni || homeKey());
  var formCards = '<div class="vf-form-tabs" role="tablist" aria-label="Paper form type">' + Object.keys(VF_FORMS).map(function (k) {
    var fRecs = vfRecords(k);
    var scoped = fRecs ? fRecs.filter(function (r) { return !mScope || r.province + '|' + r.municipality === mScope; }) : null;
    var fTot = scoped ? vfTotals(scoped) : null;
    return '<button type="button" class="vf-form-card' + (u.form === k ? ' active' : '') + '" data-act="vf-form-btn" data-v="' + k + '">' +
      '<strong>' + esc(VF_FORMS[k].label) + '</strong>' +
      '<span>' + (fTot ? n(fTot.verified) + ' of ' + n(fTot.records) + ' verified' : 'Volunteer export needed') + '</span>' +
    '</button>';
  }).join('') + '</div>';

  var formSel = '<label class="field"><span>Form</span><select data-act="vf-form">' + Object.keys(VF_FORMS).map(function (k) {
    return '<option value="' + k + '"' + (u.form === k ? ' selected' : '') + '>' + esc(VF_FORMS[k].label) + '</option>';
  }).join('') + '</select></label>';
  var muniSel = (region && !isMuni) ? '<label class="field"><span>Municipality</span><select data-act="vf-muni"><option value="">All municipalities</option>' +
    munis.map(function (m) { var k = m.province + '|' + m.municipality; return '<option value="' + attr(k) + '"' + (u.muni === k ? ' selected' : '') + '>' + esc(m.municipality + ' (' + m.province + ')') + '</option>'; }).join('') +
    '</select></label>' : '';
  var bySel = '<label class="field"><span>Checked by</span><input id="vf-by" data-act="vf-by" placeholder="Name and position, e.g. J. Cruz (PEA)" value="' + attr(vfVerifier()) + '" style="min-width:220px"></label>';
  var head = '<div class="card"><div class="card-head"><div><h2>Verify against the forms</h2>' +
    '<div class="muted">The Precision part of the DQA (SM7 Table 8): check what is encoded in KCIS against ' + esc(F.paper) + '.</div></div>' +
    '<div class="row-actions" style="margin:0"><button class="btn ghost btn-sm" data-act="vf-sample">' + icon('crosshair') + ' <span>Suggest a sample</span></button>' +
    '<button class="btn ghost btn-sm" data-act="vf-csv">' + icon('download') + ' <span>CSV of the results</span></button></div></div>' +
    formCards +
    '<div class="toolbar-row"><div class="filters" style="margin:0">' + formSel + muniSel + bySel + '</div></div>';

  var recs = vfScoped();
  if (!recs) {
    body.innerHTML = head + '<div class="empty-state">Load the Community Volunteer List to verify ' + esc(F.units) + '.</div></div>';
    afterVerifyRender(); return;
  }
  var t = vfTotals(recs);
  var totIssues = t.differs + t.absent + t.notEncoded;
  var kpi = function (label, val, sub, accent, showVal) {
    return '<button type="button" class="kpi clickable ' + (accent || '') + '" data-act="vf-show-btn" data-v="' + (showVal || 'all') + '">' +
      '<div class="kpi-label">' + label + '</div><div class="kpi-value">' + val + '</div>' + (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</button>';
  };
  var kpis = '<div class="grid-kpi">' +
    kpi('Records verified', n(t.verified) + ' <span class="tiny">of ' + n(t.records) + '</span>', n(t.complete) + ' fully checked' + (t.sample ? ' · ' + n(t.sample) + ' in the sample' : ''), t.complete ? 'accent-good' : '', 'done') +
    kpi('Rows matching the form', vfPct(t.agreement), t.checked ? n(t.match) + ' of ' + n(t.checked) + ' rows checked' : 'nothing checked yet', t.agreement !== null && t.agreement >= 0.95 ? 'accent-good' : (t.checked ? 'accent-warn' : 'accent-idle'), 'all') +
    kpi('On the form ÷ encoded', t.factor === null ? '—' : t.factor.toFixed(2), t.factor === null ? 'enter the count on the form' : n(t.form) + ' on the forms, ' + n(t.encodedWithForm) + ' encoded', t.factor === 1 ? 'accent-good' : 'accent-idle', 'all') +
    kpi('Items to fix in KCIS', n(totIssues), [t.differs ? n(t.differs) + ' differ' : '', t.absent ? n(t.absent) + ' not on the form' : '', t.notEncoded ? n(t.notEncoded) + ' on the form, not encoded' : ''].filter(Boolean).join(' · ') || 'No discrepancies tagged', totIssues ? 'accent-bad' : 'accent-good', 'issues') +
  '</div>';

  var q = normSearch(u.search || '');
  var baseList = recs.filter(function (r) {
    return !q || normSearch(r.municipality + ' ' + r.barangay + ' ' + r.label).indexOf(q) !== -1;
  });
  var cRecAll = baseList.length;
  var cRecTodo = baseList.filter(function (r) { return !vfStats(r).checked; }).length;
  var cRecSample = baseList.filter(function (r) { return vfStats(r).sample; }).length;
  var cRecIssues = baseList.filter(function (r) { return vfStats(r).issues; }).length;
  var cRecDone = baseList.filter(function (r) { return vfStats(r).done; }).length;

  var recCard = function (id, label, cnt, colorCls) {
    return '<button type="button" class="filter-card' + (colorCls ? ' ' + colorCls : '') + (u.show === id ? ' active' : '') + '" data-act="vf-show-btn" data-v="' + id + '">' +
      '<span class="fc-label">' + esc(label) + '</span>' +
      '<span class="fc-count">' + n(cnt) + '</span>' +
    '</button>';
  };
  var showCards = '<div class="filter-cards" style="margin:8px 0 10px">' +
    recCard('all', 'All Records', cRecAll) +
    recCard('todo', 'Not Verified', cRecTodo) +
    recCard('sample', 'In Sample', cRecSample) +
    recCard('issues', 'With Items to Fix', cRecIssues, 'fc-warn') +
    recCard('done', 'Fully Verified', cRecDone, 'fc-good') +
  '</div>';

  var list = recs.filter(function (r) {
    var s = vfStats(r);
    if (u.show === 'todo' && s.checked) return false;
    if (u.show === 'sample' && !s.sample) return false;
    if (u.show === 'issues' && !s.issues) return false;
    if (u.show === 'done' && !s.done) return false;
    return !q || normSearch(r.municipality + ' ' + r.barangay + ' ' + r.label).indexOf(q) !== -1;
  });

  var curCol = u.sortCol || 'brgy';
  var curDir = u.sortDir || 'asc';
  var vfExtractors = {
    brgy: function (r) { return r.barangay || 'Municipal level'; },
    label: function (r) { return r.label; },
    encoded: function (r) { return vfStats(r).encoded; },
    form: function (r) { var s = vfStats(r); return s.formCount === null ? -1 : s.formCount; },
    status: function (r) { var s = vfStats(r); return s.done ? 3 : (s.issues ? 1 : (s.checked ? 2 : 0)); },
    by: function (r) { return vfStats(r).by || ''; }
  };
  list = tblSort(list, curCol, curDir, vfExtractors);

  var rows = list.map(function (r) {
    var s = vfStats(r);
    return '<tr class="click" data-act="vf-open" data-v="' + attr(r.key) + '" tabindex="0">' +
      '<td><strong>' + esc(r.barangay || 'Municipal level') + '</strong>' + (region && !u.muni ? ' <span class="tiny">' + esc(r.municipality) + '</span>' : '') + '</td>' +
      '<td>' + esc(r.label) + '</td><td class="num">' + n(s.encoded) + '</td>' +
      '<td class="num">' + (s.formCount === null ? '<span class="tiny">—</span>' : n(s.formCount)) + '</td>' +
      '<td>' + vfStatusPill(s) + '</td><td class="tiny">' + esc(s.by || '—') + '</td></tr>';
  }).join('');

  var th = function (col, label, num) {
    return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, act: 'vf-sort' });
  };

  var table = list.length
    ? '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('brgy', 'Barangay') +
        th('label', u.form === 'cv' ? 'Body' : 'Activity') +
        th('encoded', 'Encoded', true) +
        th('form', 'On the form', true) +
        th('status', 'Status') +
        th('by', 'Checked by') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>'
    : '<div class="empty-state">No records match these filters.</div>';
  body.innerHTML = head + kpis +
    '<div class="toolbar-row" style="margin-top:10px;margin-bottom:6px"><div class="filters" style="margin:0;flex:1"><label class="field" style="flex:1"><span>Search records</span><input data-act="vf-search" id="vf-search" placeholder="Barangay or activity…" value="' + attr(u.search) + '"></label>' +
    (u.search ? '<button type="button" class="btn ghost btn-sm" data-act="vf-search-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
    '</div><span class="tiny">Showing <strong>' + n(list.length) + '</strong> of <strong>' + n(recs.length) + '</strong></span></div>' +
    showCards +
    table + '<p class="tiny" style="margin-top:8px">Click a record to check it against the form. The tags stay on this PC with the saved data and go into "Save to a file".</p></div>';
  afterVerifyRender();
  if (keepScroll !== false) {
    var newWrapMain = body.querySelector('.table-wrap');
    if (newWrapMain && prevWrapScroll) newWrapMain.scrollTop = prevWrapScroll;
    window.scrollTo(0, prevWinScroll);
  }
}

function vfRecordView(rec) {
  var F = VF_FORMS[rec.form], t = vfTag(rec.key) || {}, tags = t.rows || {}, s = vfStats(rec);
  if (typeof VERIFY.ui.rowIdx !== 'number' || VERIFY.ui.rowIdx < 0 || VERIFY.ui.rowIdx >= rec.rows.length) {
    var firstUnchecked = -1;
    for (var k = 0; k < rec.rows.length; k++) { if (!tags[rec.rows[k].rk]) { firstUnchecked = k; break; } }
    VERIFY.ui.rowIdx = firstUnchecked !== -1 ? firstUnchecked : 0;
  }
  var activeIdx = VERIFY.ui.rowIdx;
  var btn = function (rk, st, label, on) {
    return '<button type="button" class="vf-tag' + (on ? ' on ' + st : '') + '" data-act="vf-tag" data-rec="' + attr(rec.key) + '" data-rk="' + attr(rk) + '" data-s="' + st + '">' + esc(label) + '</button>';
  };

  var iq = normSearch(VERIFY.ui.itemSearch || '');
  var itemFilter = VERIFY.ui.itemFilter || 'all';
  var indexedRows = rec.rows.map(function (r, i) {
    return { r: r, origIdx: i, tag: tags[r.rk] };
  });
  var filteredItems = indexedRows.filter(function (it) {
    var st = it.tag ? it.tag.s : '';
    if (itemFilter === 'unchecked' && st) return false;
    if (itemFilter === 'match' && st !== 'match') return false;
    if (itemFilter === 'differs' && st !== 'differs') return false;
    if (itemFilter === 'absent' && st !== 'absent') return false;
    if (!iq) return true;
    return normSearch(it.r.name + ' ' + (it.r.detail || '')).indexOf(iq) !== -1;
  });

  var itemSortCol = VERIFY.ui.itemSortCol || 'num';
  var itemSortDir = VERIFY.ui.itemSortDir || 'asc';
  var itemExtractors = {
    num: function (it) { return it.origIdx; },
    name: function (it) { return it.r.name; },
    status: function (it) { var st = it.tag ? it.tag.s : ''; return st === 'match' ? 3 : (st === 'differs' ? 2 : (st === 'absent' ? 1 : 0)); }
  };
  var sortedItems = tblSort(filteredItems, itemSortCol, itemSortDir, itemExtractors);

  var ith = function (col, label, num) {
    return sortTh({ col: col, curCol: itemSortCol, dir: itemSortDir, label: label, num: num, act: 'vf-item-sort' });
  };

  var searchRows = rec.rows.filter(function (r) {
    if (!iq) return true;
    return normSearch(r.name + ' ' + (r.detail || '')).indexOf(iq) !== -1;
  });
  var cAll = searchRows.length;
  var cUnchecked = searchRows.filter(function (r) { return !tags[r.rk]; }).length;
  var cMatch = searchRows.filter(function (r) { return tags[r.rk] && tags[r.rk].s === 'match'; }).length;
  var cDiffers = searchRows.filter(function (r) { return tags[r.rk] && tags[r.rk].s === 'differs'; }).length;
  var cAbsent = searchRows.filter(function (r) { return tags[r.rk] && tags[r.rk].s === 'absent'; }).length;

  var vfc = function (id, label, cnt, colorCls) {
    return '<button type="button" class="filter-card' + (colorCls ? ' ' + colorCls : '') + (itemFilter === id ? ' active' : '') + '" data-act="vf-item-filter" data-v="' + id + '">' +
      '<span class="fc-label">' + esc(label) + '</span>' +
      '<span class="fc-count">' + n(cnt) + '</span>' +
    '</button>';
  };

  var itemCardsHtml = '<div class="filter-cards" style="margin:0">' +
    vfc('all', 'All Names', cAll) +
    vfc('unchecked', 'Unchecked', cUnchecked) +
    vfc('match', 'Matches', cMatch, 'fc-good') +
    vfc('differs', 'Differs', cDiffers, 'fc-warn') +
    vfc('absent', 'Absent from ' + (rec.form === 'att' ? 'Attn Sheet' : 'Form'), cAbsent, 'fc-bad') +
  '</div>';

  var rows = sortedItems.map(function (it) {
    var r = it.r, i = it.origIdx, g = it.tag, st = g ? g.s : '';
    var what = st === 'differs' ? '<select class="vf-what" data-act="vf-what" data-rec="' + attr(rec.key) + '" data-rk="' + attr(r.rk) + '">' +
      F.what.map(function (w) { return '<option' + (g.what === w ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('') + '</select>' : '';
    var trCls = [st ? 'vf-' + st : '', i === activeIdx ? 'vf-active-row' : ''].filter(Boolean).join(' ');
    return '<tr class="' + trCls + '" data-act="vf-row-sel" data-idx="' + i + '"><td class="num tiny">' + (i + 1) + '</td>' +
      '<td><strong>' + esc(r.name) + '</strong><div class="tiny">' + esc(r.detail) + '</div></td>' +
      '<td><div class="vf-tags">' + btn(r.rk, 'match', 'Matches', st === 'match') + btn(r.rk, 'differs', 'Differs', st === 'differs') +
        btn(r.rk, 'absent', F.absent, st === 'absent') + (st ? '<button type="button" class="link tiny" data-act="vf-tag" data-rec="' + attr(rec.key) + '" data-rk="' + attr(r.rk) + '" data-s="">Clear</button>' : '') +
        what + '</div></td></tr>';
  }).join('');
  var gone = Object.keys(tags).filter(function (rk) { return !rec.rows.some(function (r) { return r.rk === rk; }); });
  var notEnc = s.formCount !== null && s.formCount > s.encoded ? s.formCount - s.encoded : 0;
  return '<div class="card"><div class="card-head"><div>' +
      '<button type="button" class="link" data-act="vf-back">' + icon('arrow-left') + ' <span>All records</span></button>' +
      '<h2 style="margin-top:4px">' + esc(rec.barangay || rec.municipality) + ' · ' + esc(rec.label) + '</h2>' +
      '<div class="muted">' + esc(F.label) + ' · ' + esc(rec.municipality) + ', ' + esc(rec.province) + ' · ' + n(s.encoded) + ' ' + esc(s.encoded === 1 ? F.unit : F.units) + ' encoded in KCIS</div></div>' +
      '<div>' + vfStatusPill(s) + '</div></div>' +
    '<p class="muted">Open ' + esc(F.paper) + '. For each name encoded in KCIS, mark whether it matches the form. Then count the names on the form.</p>' +
    '<div class="toolbar-row"><div class="filters" style="margin:0;width:100%"><label class="field"><span>Checked by</span><input id="vf-by" data-act="vf-by" placeholder="Name and position" value="' + attr(vfVerifier()) + '" style="min-width:220px"></label>' +
      '<label class="field"><span>' + esc(F.countLabel) + '</span><input type="number" min="0" data-act="vf-count" data-rec="' + attr(rec.key) + '" value="' + (s.formCount === null ? '' : s.formCount) + '" style="width:110px"></label>' +
      '<label class="field" style="flex:1"><span>Note</span><input data-act="vf-note" data-rec="' + attr(rec.key) + '" maxlength="500" placeholder="e.g. page 2 of the attn sheet missing" value="' + attr(t.note || '') + '"></label></div></div>' +
    '<div class="vf-sum">' +
      '<span><strong>' + n(s.checked) + '</strong> of ' + n(s.encoded) + ' checked</span>' +
      '<span style="min-width:110px">' + progressBar(s.match, s.differs + s.absent, s.encoded) + '</span>' +
      '<span class="good-t"><strong>' + n(s.match) + '</strong> match</span>' +
      '<span class="warn-t"><strong>' + n(s.differs) + '</strong> differ</span>' +
      '<span class="bad-t"><strong>' + n(s.absent) + '</strong> ' + esc(F.absent.toLowerCase()) + '</span>' +
      (notEnc ? '<span class="bad-t"><strong>' + n(notEnc) + '</strong> on the form but not encoded</span>' : '') +
      (s.formCount !== null && s.encoded ? '<span>On the form ÷ encoded: <strong>' + (s.formCount / s.encoded).toFixed(2) + '</strong></span>' : '') +
    '</div>' +
    '<div class="vf-kbd-bar">' +
      '<span><strong>Quick keys:</strong></span>' +
      '<span><kbd class="vf-kbd">1</kbd> or <kbd class="vf-kbd">M</kbd> Matches</span>' +
      '<span><kbd class="vf-kbd">2</kbd> or <kbd class="vf-kbd">D</kbd> Differs</span>' +
      '<span><kbd class="vf-kbd">3</kbd> or <kbd class="vf-kbd">N</kbd> ' + esc(F.absent) + '</span>' +
      '<span><kbd class="vf-kbd">↑</kbd> <kbd class="vf-kbd">↓</kbd> Navigate rows</span>' +
      '<span><kbd class="vf-kbd">Esc</kbd> All records</span>' +
    '</div>' +
    '<div class="toolbar-row" style="margin-top:12px;margin-bottom:10px">' +
      '<div class="filters" style="margin:0;flex:1">' +
        '<label class="field" style="flex:1"><span>Filter names in record</span>' +
          '<input type="search" id="vf-item-search" placeholder="Name or detail in this record…" value="' + attr(VERIFY.ui.itemSearch || '') + '">' +
        '</label>' +
        (VERIFY.ui.itemSearch ? '<button type="button" class="btn ghost btn-sm" data-act="vf-item-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
      '</div>' +
      itemCardsHtml +
      '<span class="tiny">Showing <strong>' + n(sortedItems.length) + '</strong> of <strong>' + n(rec.rows.length) + '</strong></span>' +
    '</div>' +
    (gone.length ? '<div class="msg warn">' + n(gone.length) + ' tagged ' + (gone.length === 1 ? 'name is' : 'names are') + ' no longer in this record in KCIS (corrected or removed since it was checked).</div>' : '') +
    '<div class="table-wrap"><table class="grid vf-table"><thead><tr>' +
      ith('num', '#', true) +
      ith('name', 'Encoded in KCIS') +
      ith('status', 'Against the form') +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="3" class="empty-state">No row matches this filter.</td></tr>') + '</tbody></table></div>' +
    '<div class="row-actions"><button type="button" class="btn ghost" data-act="vf-rest" data-v="' + attr(rec.key) + '">' + icon('check-circle-2') + ' <span>Mark the rest as matching</span></button>' +
      '<button type="button" class="btn primary" data-act="vf-back">Done</button></div>' +
    (t.by ? '<p class="tiny" style="margin-top:8px">Last checked by <strong>' + esc(t.by) + '</strong> on ' + esc(new Date(t.at).toLocaleString()) + '.</p>' : '') +
  '</div>';
}

function afterVerifyRender() {
  refreshIcons($('vf-body'));
  bindSearch('vf-search', function (v) { VERIFY.ui.search = v; renderVerify(); });
  bindSearch('vf-item-search', function (v) { VERIFY.ui.itemSearch = v; renderVerify(); });
}

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
  if (act === 'vf-open') { VERIFY.ui.open = el.getAttribute('data-v'); VERIFY.ui.rowIdx = -1; renderVerify(); window.scrollTo(0, 0); }
  else if (act === 'vf-back') { VERIFY.ui.open = ''; renderVerify(); }
  else if (act === 'vf-form-btn') { VERIFY.ui.form = el.getAttribute('data-v'); VERIFY.ui.open = ''; renderVerify(); }
  else if (act === 'vf-show-btn') { VERIFY.ui.show = el.getAttribute('data-v'); renderVerify(); }
  else if (act === 'vf-sort') {
    var col = el.getAttribute('data-col');
    if (VERIFY.ui.sortCol === col) {
      VERIFY.ui.sortDir = VERIFY.ui.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      VERIFY.ui.sortCol = col;
      VERIFY.ui.sortDir = (col === 'encoded' || col === 'form') ? 'desc' : 'asc';
    }
    renderVerify();
  }
  else if (act === 'vf-search-reset') {
    VERIFY.ui.search = '';
    renderVerify();
  }
  else if (act === 'vf-item-sort') {
    var col = el.getAttribute('data-col');
    if (VERIFY.ui.itemSortCol === col) {
      VERIFY.ui.itemSortDir = VERIFY.ui.itemSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      VERIFY.ui.itemSortCol = col;
      VERIFY.ui.itemSortDir = (col === 'status') ? 'desc' : 'asc';
    }
    renderVerify();
  }
  else if (act === 'vf-item-filter') {
    VERIFY.ui.itemFilter = el.getAttribute('data-v');
    renderVerify();
  }
  else if (act === 'vf-item-reset') {
    VERIFY.ui.itemSearch = '';
    renderVerify();
  }
  else if (act === 'vf-row-sel') {
    if (!ev.target.closest('button, select, input')) {
      VERIFY.ui.rowIdx = Number(el.getAttribute('data-idx')) || 0;
      renderVerify();
    }
  }
  else if (act === 'vf-tag') {
    var recKey = el.getAttribute('data-rec'), rk = el.getAttribute('data-rk');
    var recObj = vfFind(recKey);
    if (recObj) {
      for (var idx = 0; idx < recObj.rows.length; idx++) {
        if (recObj.rows[idx].rk === rk) { VERIFY.ui.rowIdx = idx; break; }
      }
    }
    var cur = ((vfTag(recKey) || {}).rows || {})[rk];
    var st = el.getAttribute('data-s');
    vfSetRow(recKey, rk, cur && cur.s === st ? '' : st);
  }
  else if (act === 'vf-rest') vfMarkRest(el.getAttribute('data-v'));
  else if (act === 'vf-sample') vfSuggestSample();
  else if (act === 'vf-csv') vfCsv();
  else if (act === 'save-file') savedToFile();
  else if (act === 'saved-forget') savedForget();
  else if (act === 'open-verify') openVerify();
});
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter') {
    var t = ev.target.closest && ev.target.closest('tr[data-act="vf-open"]');
    if (t) { VERIFY.ui.open = t.getAttribute('data-v'); VERIFY.ui.rowIdx = -1; renderVerify(); return; }
  }
  // Keyboard shortcuts inside an open Verify record when not typing in an input/select
  if (STATE.page === 'verify' && VERIFY.ui.open && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    var tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    var rec = vfFind(VERIFY.ui.open);
    if (!rec || !rec.rows.length) return;
    var idx = typeof VERIFY.ui.rowIdx === 'number' ? VERIFY.ui.rowIdx : 0;
    idx = Math.max(0, Math.min(rec.rows.length - 1, idx));
    var k = ev.key.toLowerCase();
    if (ev.key === 'Escape') { ev.preventDefault(); VERIFY.ui.open = ''; renderVerify(); }
    else if (ev.key === 'ArrowDown' || k === 'j') {
      ev.preventDefault();
      VERIFY.ui.rowIdx = Math.min(rec.rows.length - 1, idx + 1);
      renderVerify();
    } else if (ev.key === 'ArrowUp' || k === 'k') {
      ev.preventDefault();
      VERIFY.ui.rowIdx = Math.max(0, idx - 1);
      renderVerify();
    } else if (k === '1' || k === 'm') {
      ev.preventDefault();
      VERIFY.ui.rowIdx = Math.min(rec.rows.length - 1, idx + 1);
      vfSetRow(rec.key, rec.rows[idx].rk, 'match');
    } else if (k === '2' || k === 'd') {
      ev.preventDefault();
      vfSetRow(rec.key, rec.rows[idx].rk, 'differs');
    } else if (k === '3' || k === 'n') {
      ev.preventDefault();
      VERIFY.ui.rowIdx = Math.min(rec.rows.length - 1, idx + 1);
      vfSetRow(rec.key, rec.rows[idx].rk, 'absent');
    } else if (k === '0' || ev.key === 'Backspace') {
      ev.preventDefault();
      vfSetRow(rec.key, rec.rows[idx].rk, '');
    }
  }
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
