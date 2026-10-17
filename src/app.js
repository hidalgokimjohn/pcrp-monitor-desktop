// ===================================================================
// APP — import, pages and export. All figures come from the monitor's own
// functions (apiOverview, apiMatrix, barangay rows, Data Health checks).
// ===================================================================

var PREFS_KEY = 'pcrp-desktop:v1';
var LOADED = {};          // kind -> { file, sheet, rows }
var IMPORT_ERRORS = [];   // { file, error }
var STATE = { page: 'import', stage: 1, prov: '', muniSearch: '', muni: '', brgySearch: '', brgyFilter: 'all', computed: false, computedAt: null, ms: 0 };
var FIELD_VALUES = ['Not started', 'On-going', 'Completed'];

// ---- small helpers ---------------------------------------------------------

// Settings are remembered in browser storage when it is available; otherwise
// (blocked storage, some locked-down PCs) they are kept in memory for this
// window, so the app never gets stuck.
var MEM_PREFS = null, PREFS_WARNED = false;
function prefs() {
  try {
    var s = localStorage.getItem(PREFS_KEY);
    if (s !== null) return JSON.parse(s);
  } catch (e) { /* storage blocked */ }
  return MEM_PREFS ? clone(MEM_PREFS) : {};
}
function savePrefs(p) {
  MEM_PREFS = clone(p);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
  catch (e) {
    if (!PREFS_WARNED) { PREFS_WARNED = true; toast('This browser blocks saved settings: they apply until this window is closed.'); }
  }
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function attr(s) { return esc(s).replace(/'/g, '&#39;'); }
function pctOf(a, b) { return b ? a / b : null; }
function pctText(v) { return v === null || v === undefined ? '—' : (Math.round(v * 1000) / 10).toFixed(1) + '%'; }
function today() { return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

var toastTimer = null;
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
}

// Lucide icons are not available offline; the pages' <i data-lucide> become small glyphs.
var ICON_GLYPH = {
  'check': '✓', 'check-circle-2': '✓', 'chevron-down': '⌄', 'download': '⤓', 'file-text': '▤', 'lock': '🔒', 'info': 'ⓘ',
  'map-pin': '⌖', 'map-pin-off': '⌖', 'list-checks': '☰', 'building-2': '▦', 'help-circle': '?', 'scale': '⚖', 'git-merge': '⇵',
  'user-round-x': '✕', 'user-x': '✕', 'copy': '⧉', 'git-compare': '⇆', 'user-plus': '+', 'users-round': '☷', 'tag': '#',
  'clipboard-x': '✕', 'search': '⌕', 'x': '✕', 'alert-triangle': '⚠', 'external-link': '↗',
  // Data quality checks, Scorecard and Fix list
  'clock-alert': '⏱', 'calendar-x': '✕', 'files': '⧉', 'users': '☷', 'spell-check': 'Aa', 'cake': '✱', 'gauge': '◔',
  'list-todo': '☑', 'target': '◎', 'repeat': '↻', 'crosshair': '⌖', 'clock': '⏱', 'shield-check': '✓', 'circle-alert': '!', 'clipboard-check': '☑', 'clipboard': '☐'
};
function refreshIcons(root) {
  Array.prototype.forEach.call((root && root.querySelectorAll ? root : document).querySelectorAll('i[data-lucide]'), function (el) {
    var s = document.createElement('span');
    s.className = 'ico'; s.setAttribute('aria-hidden', 'true');
    s.textContent = ICON_GLYPH[el.getAttribute('data-lucide')] || '•';
    el.replaceWith(s);
  });
}

// Follow the system light / dark theme (the dh- styles key off html.dark).
(function () {
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  function apply() { document.documentElement.classList.toggle('dark', !!(mq && mq.matches)); }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
})();

// ---- reference tables (baseline, activities) -------------------------------

function loadReferenceTables() {
  var p = prefs();
  TABS.Baseline = p.baseline ? p.baseline.table : clone(BUILT_IN.Baseline);
  TABS.Activities = p.activities ? p.activities.table : clone(BUILT_IN.Activities);
  if (p.field) {
    var seen = {};
    TABS.Activities.rows.forEach(function (r) {
      var code = String(r[1] || '').trim();
      seen[code] = true;
      if (p.field[code]) r[6] = p.field[code];
    });
    // An activity missing from the tab (readActivities falls back to its default)
    // gets a row, so its field conduct setting still applies.
    DEFAULT_ACTIVITIES.forEach(function (d) {
      if (!seen[d.code] && p.field[d.code]) {
        TABS.Activities.rows.push([d.seq, d.code, d.name, d.label, d.level, d.households ? 'Yes' : 'No', p.field[d.code], d.stage || 1, d.prioOnly ? 'Yes' : 'No']);
      }
    });
  }
}

function baselineSummary() {
  var b = readBaseline();
  var munis = {};
  b.rows.forEach(function (r) { if (b.monitored.indexOf(r.municipality) !== -1) munis[r.province + '|' + r.municipality] = true; });
  var monitoredBrgys = b.rows.filter(function (r) { return b.monitored.indexOf(r.municipality) !== -1; }).length;
  return { rows: b.rows.length, munis: Object.keys(munis).length, brgys: monitoredBrgys };
}

// ---- your municipality ---------------------------------------------------------
// The users are MDMs and PEAs: each works one municipality. It is chosen once,
// before import, and every page, the memo and the export open on it. RPMO
// staff can choose "All municipalities" for the regional view.

/** { province, municipality } | { region: true } | null when not chosen yet. */
function home() { return prefs().home || null; }
function homeKey() { var h = home(); return h && !h.region ? h.province + '|' + h.municipality : ''; }
function homeLabel() { var h = home(); return !h ? '' : h.region ? 'All municipalities' : h.municipality + ' (' + h.province + ')'; }

/** Monitored municipalities from the baseline loaded now, by province. */
function baselineMunis() {
  var b = readBaseline(), seen = {}, out = [];
  b.rows.forEach(function (r) {
    if (b.monitored.indexOf(r.municipality) === -1) return;
    var k = r.province + '|' + r.municipality;
    if (!seen[k]) { seen[k] = { province: r.province, municipality: r.municipality, barangays: 0 }; out.push(seen[k]); }
    seen[k].barangays++;
  });
  return out.sort(function (a, b) { return a.province.localeCompare(b.province) || a.municipality.localeCompare(b.municipality); });
}

function renderHome() {
  var h = home(), card = $('home-card');
  if (h && !STATE.editHome) {
    card.innerHTML = '<div class="home-set"><div><div class="tiny"><span class="step-no">1</span>Your municipality</div>' +
      '<div class="home-name">' + esc(homeLabel()) + '</div>' +
      '<div class="muted">' + (h.region ? 'Regional view: every monitored municipality.' : 'The findings, memo and export open on this municipality. Other municipalities stay available on the Municipalities page.') + '</div></div>' +
      '<button class="btn ghost" data-act="home-edit">Change</button></div>';
  } else {
    var list = baselineMunis(), opts = '<option value="">Choose your municipality…</option>', prov = '';
    list.forEach(function (m) {
      if (m.province !== prov) { opts += (prov ? '</optgroup>' : '') + '<optgroup label="' + attr(m.province) + '">'; prov = m.province; }
      var v = m.province + '|' + m.municipality;
      opts += '<option value="' + attr(v) + '"' + (homeKey() === v ? ' selected' : '') + '>' + esc(m.municipality) + ' · ' + m.barangays + ' barangays</option>';
    });
    opts += (prov ? '</optgroup>' : '') + '<option value="REGION"' + (h && h.region ? ' selected' : '') + '>All municipalities (RPMO regional view)</option>';
    card.innerHTML = '<h2><span class="step-no">1</span> Your municipality</h2>' +
      '<p class="muted">Choose the municipality you monitor as MDM or PEA. It is remembered on this computer, and you can change it at any time.</p>' +
      '<div class="filters"><label class="field"><span>Municipality</span><select id="home-select">' + opts + '</select></label>' +
        '<button class="btn primary" data-act="home-save">Save</button>' +
        (h ? '<button class="btn ghost" data-act="home-cancel">Cancel</button>' : '') + '</div>';
  }
  var locked = !h || STATE.editHome;
  $('import-card').classList.toggle('locked', locked);
  $('import-card').setAttribute('aria-disabled', locked);
  $('file-input').disabled = locked;
  var chip = $('home-chip');
  chip.hidden = !h;
  chip.textContent = h ? '⌖ ' + homeLabel() : '';
}

function saveHome(v) {
  if (!v) { toast('Choose your municipality first.'); return; }
  var p = prefs();
  if (v === 'REGION') p.home = { region: true };
  else { var parts = v.split('|'); p.home = { province: parts[0], municipality: parts[1] }; }
  savePrefs(p);
  STATE.editHome = false;
  applyHomeScope();
  renderHome();
  if (STATE.computed) { renderPage(); renderStatus(); }
  toast('Municipality set: ' + homeLabel() + '.');
}

/** Point every page at the chosen municipality. */
function applyHomeScope() {
  var h = home(), key = homeKey();
  STATE.muni = key || STATE.muni;
  STATE.prov = h && !h.region ? h.province : '';
  S.healthScope = key ? 'm:' + key : '';
  S.healthPage = {};
}

/** How much of the chosen municipality the participants export covers. */
function homeCoverage() {
  var key = homeKey();
  if (!key || !SNAP) return null;
  var brs = SNAP.barangayRows.filter(function (b) { return b.province + '|' + b.municipality === key; });
  var enc = brs.filter(function (b) {
    return Object.keys(b.activities).some(function (k) { var s = b.activities[k].status; return s === 'Complete' || s === 'No Attendees'; });
  }).length;
  return { barangays: brs.length, encoded: enc };
}

function coverageBanner() {
  var c = homeCoverage();
  if (!c) return '';
  if (!c.encoded) {
    return '<div class="msg warn">⚠ The participants export has <strong>no records for ' + esc(homeLabel()) + '</strong>. Check that it is the right export, or that your municipality is set correctly (Import › Change).</div>';
  }
  return '';
}

// ---- navigation --------------------------------------------------------------

function go(page) {
  STATE.page = page;
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    var on = b.getAttribute('data-page') === page;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.page'), function (s) { s.classList.toggle('on', s.id === 'page-' + page); });
  renderPage();
  window.scrollTo(0, 0);
}

function renderPage() {
  if (STATE.page === 'overview') renderOverview();
  else if (STATE.page === 'munis') renderMunis();
  else if (STATE.page === 'brgys') renderBrgys();
  else if (STATE.page === 'people') renderPeople();
  else if (STATE.page === 'verify') renderVerify();
  else if (STATE.page === 'health') renderHealth();
  else if (STATE.page === 'settings') renderSettings();
  else renderImport();
}

function setTabsEnabled(on) {
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    var p = b.getAttribute('data-page');
    if (p !== 'import' && p !== 'settings') b.disabled = !on;
  });
  $('btn-export').disabled = !on;
}

// Hooks the Data Health page calls.
function openMuni(mKey) { STATE.muni = mKey; STATE.brgyFilter = 'all'; STATE.brgySearch = ''; go('brgys'); }
function openPasskeyModal() {}
function openHealthMemoModal() { $('memo-text').value = dhMemoText(); $('memo-dialog').showModal(); }

// ---- import --------------------------------------------------------------

function setProgress(msg) {
  var el = $('import-progress');
  el.hidden = !msg;
  el.innerHTML = msg ? '<span class="spin"></span> ' + esc(msg) : '';
}

function acceptTable(item) {
  var info = KIND_INFO[item.kind];
  if (item.missing.length) {
    IMPORT_ERRORS.push({ file: item.file, error: info.label + ' is missing required columns: ' + item.missing.join(', ') + '. Nothing was loaded from it.' });
    return;
  }
  if (item.kind === 'baseline' || item.kind === 'activities') {
    var p = prefs();
    p[item.kind] = { file: item.file, at: new Date().toISOString(), table: item.table };
    if (item.kind === 'activities') delete p.field;   // the workbook's own field conduct
    savePrefs(p);
    loadReferenceTables();
    if (item.kind === 'activities') TABS.Activities = item.table;
    if (item.kind === 'baseline') TABS.Baseline = item.table;
  } else {
    TABS[info.sheet] = item.table;
    savedNewExports(item.kind);
  }
  LOADED[item.kind] = { file: item.file, sheet: item.sheet, rows: item.table.rows.length };
}

function handleFiles(fileList) {
  var files = Array.prototype.slice.call(fileList || []);
  if (!files.length) return;
  if (!home() || STATE.editHome) { toast('Choose your municipality first (step 1).'); return; }
  IMPORT_ERRORS = IMPORT_ERRORS.filter(function (e) { return !files.some(function (f) { return f.name === e.file; }); });
  // A saved .pcrp file is the whole session: open it on its own.
  var save = files.filter(function (f) { return /.pcrp$/i.test(f.name); })[0];
  if (save) {
    setProgress('Opening ' + save.name + '…');
    savedFromFile(save).catch(function (e) { setProgress(''); IMPORT_ERRORS.push({ file: save.name, error: e.message }); renderImport(); });
    return;
  }
  files.reduce(function (pr, f) {
    return pr.then(function () {
      setProgress('Reading ' + f.name + '…');
      return readDataFile(f, setProgress).then(function (found) { found.forEach(acceptTable); })
        .catch(function (e) { IMPORT_ERRORS.push({ file: f.name, error: e.message }); });
    });
  }, Promise.resolve()).then(function () {
    setProgress('');
    renderImport(); renderStatus();
    if (LOADED.participants) computeAndShow(STATE.computed ? null : 'overview');
  });
}

function computeAndShow(thenPage) {
  if (!LOADED.participants) { toast('Load the participants export first.'); return; }
  setProgress('Computing the findings… (a few seconds for a full regional export)');
  setTimeout(function () {
    try {
      var t0 = Date.now();
      computeAll(prefs().evalDate || '');
      PEOPLE = null;                    // the People index is rebuilt on first use
      S.overview = apiOverview('');
      S.matrix = apiMatrix();
      S.hhIssues = apiHouseholdIssues('');
      S.hhIssuesFor = hhIssuesKey(S.overview);
      S.healthOpen = null;
      STATE.computed = true; STATE.computedAt = new Date(); STATE.ms = Date.now() - t0;
      applyHomeScope();
      setProgress('');
      setTabsEnabled(true);
      renderStatus();
      renderImport();   // shows how much of the chosen municipality the export covers
      if (thenPage) go(thenPage); else renderPage();
      savedAfterCompute();
      var cov = homeCoverage();
      toast(cov && !cov.encoded
        ? 'Findings ready, but the export has no records for ' + homeLabel() + '. Check the file.'
        : 'Findings ready for ' + homeLabel() + ' (' + (STATE.ms / 1000).toFixed(1) + ' s).');
    } catch (e) {
      setProgress('');
      IMPORT_ERRORS.push({ file: 'Computation', error: e.message });
      renderImport();
      console.error(e);
    }
  }, 30);
}

function renderImport() {
  renderHome();
  renderSavedBar();
  var kinds = ['participants', 'households', 'volunteers'];
  var p = prefs();
  var items = kinds.map(function (k) {
    var l = LOADED[k], info = KIND_INFO[k];
    return '<div class="import-item">' +
      '<span class="status-chip ' + (l ? 'ok' : 'off') + '">' + (l ? '✓ Loaded' : (k === 'participants' ? 'Required' : 'Optional')) + '</span>' +
      '<div><div class="what">' + esc(info.label) + '</div>' +
        '<div class="where">' + (l ? esc(l.file) + (l.sheet && l.sheet !== 'Sheet1' ? ' · sheet ' + esc(l.sheet) : '') + ' · ' + n(l.rows) + ' rows'
          : (k === 'participants' ? 'Needed for every finding.' : k === 'households' ? 'Needed for K2 and the household roster checks.' : 'Needed for the 1st BA BResT / SFMSC tracking.')) + '</div></div>' +
      '<span></span></div>';
  });
  var refs = '<div class="import-item"><span class="status-chip ok">✓ ' + (p.baseline ? 'Loaded' : 'Built in') + '</span>' +
    '<div><div class="what">Baseline (monitored barangays)</div><div class="where">' +
    (p.baseline ? esc(p.baseline.file) : 'From ' + esc(BUILT_IN.source)) + ' · change it in Settings</div></div><span></span></div>';
  var errs = IMPORT_ERRORS.map(function (e) {
    return '<div class="import-item"><span class="status-chip off">⚠ Not loaded</span><div><div class="what">' + esc(e.file) + '</div><div class="where">' + esc(e.error) + '</div></div><span></span></div>';
  });
  var cov = homeCoverage();
  var covLine = cov ? '<div class="msg ' + (cov.encoded ? 'ok' : 'warn') + '" style="margin-top:10px">' + (cov.encoded
    ? '✓ ' + esc(homeLabel()) + ': ' + n(cov.encoded) + ' of ' + n(cov.barangays) + ' barangays have records in this export.'
    : '⚠ This export has no records for ' + esc(homeLabel()) + '. Is it the right file, and is your municipality set correctly?') + '</div>' : '';
  var pullLine = LOADED.participants ? '<div class="filters" style="margin:12px 0 0">' +
    '<label class="field"><span>KCIS pull date of these exports</span><input type="date" data-act="im-evaldate" value="' + attr(p.evalDate || today()) + '"></label>' +
    '<span class="tiny" style="flex:1 1 240px">The day the exports were pulled from KCIS. Set it whenever you drop a newer pull: the 3-day window and the Fix list (new, still open, resolved) go by this date.</span></div>' : '';
  $('import-list').innerHTML = items.join('') + refs + errs.join('') + covLine + pullLine;
  $('btn-compute').disabled = !LOADED.participants;
  $('btn-compute').textContent = STATE.computed ? 'Recompute findings' : 'Show findings';
}

function renderStatus() {
  var chip = function (on, label) { return '<span class="status-chip ' + (on ? 'ok' : '') + '">' + label + '</span>'; };
  var l = LOADED;
  $('top-status').innerHTML =
    chip(l.participants, 'Participants ' + (l.participants ? n(l.participants.rows) : '—')) +
    chip(l.households, 'Households ' + (l.households ? n(l.households.rows) : '—')) +
    chip(l.volunteers, 'Volunteers ' + (l.volunteers ? n(l.volunteers.rows) : '—')) +
    (STATE.computed ? chip(true, 'Computed ' + STATE.computedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '');
}

// ---- scope helpers ---------------------------------------------------------

function provinces() {
  var p = {};
  (S.overview.municipalities || []).forEach(function (m) { p[m.province] = true; });
  return Object.keys(p).sort();
}
function stageActs() {
  return (S.overview.activities || []).filter(function (a) { return (a.stage || 1) === STATE.stage; });
}
function matrixRows() {
  return (S.matrix.rows || []).filter(function (r) { return !STATE.prov || r.province === STATE.prov; });
}
/** The rows the Overview and the export summarise: the chosen municipality, else the province filter. */
function overviewRows() {
  var key = homeKey();
  return key ? (S.matrix.rows || []).filter(function (r) { return r.province + '|' + r.municipality === key; }) : matrixRows();
}
function inOverviewScope(p) {
  var key = homeKey();
  return key ? p.province + '|' + p.municipality === key : (!STATE.prov || p.province === STATE.prov);
}

/** Activity tallies for the Overview scope, from the matrix rows. */
function scopedPipeline() {
  var rows = overviewRows();
  return stageActs().map(function (a) {
    var t = { expected: 0, complete: 0, noAttendees: 0, notEncoded: 0, backlog: 0, attendees: 0 };
    rows.forEach(function (r) {
      var c = r.cells[a.code];
      if (!c) return;
      t.expected += c.expected || 0; t.complete += c.complete || 0; t.noAttendees += c.noAttendees || 0;
      t.notEncoded += c.notEncoded || 0; t.backlog += c.backlog || 0; t.attendees += c.attendees || 0;
    });
    return Object.assign({ a: a }, t);
  });
}
function scopedK2() {
  var t = { listed: 0, present: 0, reporting: 0, met: 0 };
  overviewRows().forEach(function (r) {
    var h = r.households || {};
    t.listed += h.listed || 0; t.present += h.present || 0; t.reporting += h.reporting || 0; t.met += h.quorumMet || 0;
  });
  t.rate = t.listed ? t.present / t.listed : null;
  return t;
}
function scopedVolunteers() {
  var v = S.overview.volunteers;
  if (!v || !v.imported) return null;
  var out = {};
  (v.bodies || []).forEach(function (b) { out[b.code] = { expected: 0, encoded: 0, needsFix: 0, notEncoded: 0, pending: 0 }; });
  overviewRows().forEach(function (r) {
    if (!r.volunteers) return;
    Object.keys(out).forEach(function (k) {
      var x = r.volunteers[k] || {}, t = out[k];
      t.expected += x.expected || 0; t.encoded += x.encoded || 0; t.needsFix += x.needsFix || 0; t.notEncoded += x.notEncoded || 0; t.pending += x.pending || 0;
    });
  });
  var iss = S.overview.health.volunteerIssues;
  out.missing = iss ? iss.missing.filter(inOverviewScope).length : 0;
  return out;
}

function stageSwitch() {
  return '<div class="filters" role="group" aria-label="Stage">' +
    [1, 2].map(function (s) {
      return '<button class="filter-chip' + (STATE.stage === s ? ' active' : '') + '" data-act="stage" data-v="' + s + '">Stage ' + s + (s === 1 ? ' · Assessment & Planning' : ' · Sub-Project Development') + '</button>';
    }).join('') + '</div>';
}
function provChips() {
  return '<div class="filters" role="group" aria-label="Province">' +
    ['', ].concat(provinces()).map(function (p) {
      return '<button class="filter-chip' + (STATE.prov === p ? ' active' : '') + '" data-act="prov" data-v="' + attr(p) + '">' + (p ? esc(p) : 'Whole region') + '</button>';
    }).join('') + '</div>';
}
function progressBar(ok, warn, total) {
  var w = function (v) { return total ? Math.max(0, Math.min(100, v / total * 100)).toFixed(1) : 0; };
  return '<span class="bar" role="img" aria-label="' + attr(ok + ' with attendance sheet, ' + warn + ' without, of ' + total) + '">' +
    (ok ? '<i class="ok" style="width:' + w(ok) + '%"></i>' : '') + (warn ? '<i class="warn" style="width:' + w(warn) + '%"></i>' : '') + '</span>';
}

// ---- overview -----------------------------------------------------------------

function renderOverview() {
  var o = S.overview, pipe = scopedPipeline(), k2 = scopedK2(), cv = scopedVolunteers();
  var tot = pipe.reduce(function (s, p) { s.e += p.expected; s.c += p.complete; s.na += p.noAttendees; s.b += p.backlog; return s; }, { e: 0, c: 0, na: 0, b: 0 });
  var munis = overviewRows().length;
  var brgys = (SNAP.barangayRows || []).filter(inOverviewScope).length;
  var kpi = function (label, value, sub) { return '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div><div class="kpi-sub">' + sub + '</div></div>'; };
  var key = homeKey();
  var scopeName = key ? homeLabel() : (STATE.prov || 'Caraga Region');

  // Data Health in the same scope as the page
  var keepScope = S.healthScope;
  S.healthScope = key ? 'm:' + key : (STATE.prov ? 'p:' + STATE.prov : '');
  var evs = dhEvaluateAll(o, '').filter(function (e) { return !e.outOfScope; });
  S.healthScope = keepScope;
  var open = evs.filter(function (e) { return e.status === 'critical' || e.status === 'verify'; });
  var sevCount = { critical: 0, verify: 0, passed: 0 };
  evs.forEach(function (e) { if (sevCount[e.status] !== undefined) sevCount[e.status]++; });

  var rows = pipe.map(function (p) {
    var cond = p.complete + p.noAttendees;
    return '<tr><td class="num">' + esc(p.a.seq) + '</td><td><strong>' + esc(p.a.label) + '</strong>' + (p.a.prioOnly ? ' <span class="pill idle">Prioritized only</span>' : '') +
      '<div class="tiny">' + esc(p.a.level) + ' level · field: ' + esc(p.a.field) + '</div></td>' +
      '<td class="num">' + n(p.expected) + '</td><td class="num">' + n(p.complete) + '</td><td class="num">' + n(p.noAttendees) + '</td>' +
      '<td class="num">' + n(p.notEncoded) + '</td><td class="num">' + (p.backlog ? '<strong style="color:var(--bad-text)">' + n(p.backlog) + '</strong>' : '0') + '</td>' +
      '<td><div class="cell-pct"><span>' + pctText(pctOf(p.complete, p.expected)) + ' <span class="tiny">(' + pctText(pctOf(cond, p.expected)) + ' recorded)</span></span>' + progressBar(p.complete, p.noAttendees, p.expected) + '</div></td></tr>';
  }).join('');

  var cvHtml = cv ? (S.overview.volunteers.bodies || []).map(function (b) {
    var t = cv[b.code];
    return '<div class="cv-row"><strong>' + esc(b.short) + '</strong>' + progressBar(t.encoded, t.needsFix, t.expected) +
      '<span class="num">' + n(t.encoded) + '/' + n(t.expected) + (t.needsFix ? ' <span class="tiny" style="color:var(--warn-text)">+' + n(t.needsFix) + ' to fix</span>' : '') + '</span></div>';
  }).join('') + (cv.missing ? '<p class="tiny" style="color:var(--warn-text);font-weight:700">⚠ ' + n(cv.missing) + ' barangays: 1st BA encoded, volunteers not encoded. <button class="link" data-act="health-open" data-v="cv_missing">See the list</button></p>' : '')
    : '<p class="muted">Load the Community Volunteer List to track the BResT and SFMSC.</p>';

  $('ov-body').innerHTML =
    coverageBanner() +
    '<div class="card-head"><div><h2>Overview · ' + esc(scopeName) + '</h2>' +
      '<div class="muted">' + (key ? '' : n(munis) + ' municipalities · ') + n(brgys) + ' barangays monitored · pull date ' + esc(prefs().evalDate || today() + ' (today)') + '</div></div>' +
      (key ? '<button class="btn ghost" data-act="go-brgys">See the barangays</button>' : '') + '</div>' +
    stageSwitch() + (key ? '' : provChips()) +
    '<div class="grid-kpi">' +
      kpi('Records with attendance sheet', pctText(pctOf(tot.c, tot.e)), n(tot.c) + ' of ' + n(tot.e) + ' Stage ' + STATE.stage + ' records') +
      kpi('Recorded without a sheet', n(tot.na), 'encoded, attendance sheet still missing') +
      kpi('Lacking records', n(tot.b), 'past the 3-day window, or not encoded where field conduct is Completed') +
      kpi('K2 · 1st BA households', pctText(k2.rate), k2.listed ? n(k2.present) + ' of ' + n(k2.listed) + ' listed households present (target 70%)' : 'Not reported: load the households export') +
    '</div>' +
    '<div class="two-col">' +
      '<div class="card"><div class="card-head"><h3>Stage ' + STATE.stage + ' activities</h3><button class="btn ghost" data-act="csv-pipeline">CSV</button></div>' +
        '<div class="legend"><span class="pill good">With attendance sheet</span><span class="pill warn">Recorded, no sheet</span><span>Not encoded means not in KCIS yet, not "not conducted".</span></div>' +
        '<div class="table-wrap"><table class="grid"><thead><tr><th class="num">Seq</th><th>Activity</th><th class="num">Target</th><th class="num">With sheet</th><th class="num">No sheet</th><th class="num">Not encoded</th><th class="num">Lacking</th><th>Progress</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div>' +
        '<div class="card"><h3>1st BA community volunteers</h3>' + cvHtml + '</div>' +
        '<div class="card"><div class="card-head"><h3>Data Health</h3><button class="link" data-act="go" data-v="health">Open</button></div>' +
          '<div class="muted" style="margin-bottom:6px"><strong style="color:var(--bad-text)">' + sevCount.critical + '</strong> critical · <strong style="color:var(--warn-text)">' + sevCount.verify + '</strong> to verify · <strong style="color:var(--good-text)">' + sevCount.passed + '</strong> passed · ' + esc(scopeName) + '</div>' +
          open.map(function (e) {
            return '<div class="sev-line"><span><span class="pill ' + (e.status === 'critical' ? 'bad' : 'warn') + '">' + (e.status === 'critical' ? 'Critical' : 'To verify') + '</span> ' + esc(e.check.name) + '</span>' +
              '<button class="link" data-act="health-open" data-v="' + attr(e.check.id) + '">' + n(e.count) + ' ' + esc(e.count === 1 ? e.check.unit[0] : e.check.unit[1]) + '</button></div>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>';
  refreshIcons($('ov-body'));
}

// ---- municipalities ---------------------------------------------------------

function muniK2(r) { var h = r.households || {}; return h.listed ? h.present / h.listed : null; }
function cvCell(v, code) {
  if (!v || !v[code]) return '<span class="tiny">—</span>';
  var x = v[code];
  return n(x.encoded) + '/' + n(x.expected) + (x.needsFix ? ' <span class="tiny" style="color:var(--warn-text)">+' + n(x.needsFix) + '⚠</span>' : '');
}

function muniTableData() {
  var q = normSearch(STATE.muniSearch);
  return matrixRows().filter(function (r) { return !q || normSearch(r.municipality + ' ' + r.province).indexOf(q) !== -1; })
    .sort(function (a, b) { return a.province.localeCompare(b.province) || a.municipality.localeCompare(b.municipality); });
}

function renderMunis() {
  var acts = stageActs(), rows = muniTableData(), cvOn = STATE.stage === 1 && S.overview.volunteers && S.overview.volunteers.imported;
  var lacking = function (r) { return acts.reduce(function (s, a) { return s + ((r.cells[a.code] || {}).backlog || 0); }, 0); };
  var cell = function (c, a) {
    if (!c || (a.prioOnly && !c.expected)) return '<td class="num tiny">—</td>';
    var p = c.expected ? c.complete / c.expected : 0;
    return '<td><div class="cell-pct"><span class="num">' + n(c.complete) + '/' + n(c.expected) + (c.noAttendees ? ' <span class="tiny" style="color:var(--warn-text)">+' + n(c.noAttendees) + '</span>' : '') + '</span>' +
      progressBar(c.complete, c.noAttendees, c.expected) + '</div></td>';
  };
  var body = rows.map(function (r) {
    var k = muniK2(r);
    var mine = homeKey() === r.province + '|' + r.municipality;
    return '<tr class="click' + (mine ? ' mine' : '') + '" data-act="muni" data-v="' + attr(r.province + '|' + r.municipality) + '" tabindex="0">' +
      '<td class="sticky"><strong>' + esc(r.municipality) + '</strong>' + (mine ? ' <span class="pill good">Yours</span>' : '') + '<div class="tiny">' + esc(r.province) + '</div></td>' +
      acts.map(function (a) { return cell(r.cells[a.code], a); }).join('') +
      '<td class="num">' + (lacking(r) ? '<strong style="color:var(--bad-text)">' + n(lacking(r)) + '</strong>' : '0') + '</td>' +
      (STATE.stage === 1 ? '<td class="num">' + (k === null ? '<span class="tiny">not reported</span>' : '<span style="color:' + (k >= 0.7 ? 'var(--good-text)' : 'var(--warn-text)') + '">' + pctText(k) + '</span>') + '</td>' : '') +
      (cvOn ? '<td class="num">' + cvCell(r.volunteers, 'BREST') + '</td><td class="num">' + cvCell(r.volunteers, 'SFMSC') + '</td>' : '') +
    '</tr>';
  }).join('');
  $('mu-body').innerHTML =
    '<div class="card"><div class="card-head"><div><h2>Municipalities</h2><div class="muted">Records with an attendance sheet / target per activity (+ recorded without a sheet). Click a municipality for its barangays.</div></div>' +
      '<button class="btn ghost" data-act="csv-munis">CSV</button></div>' +
      stageSwitch() +
      '<div class="filters">' +
        '<label class="field"><span>Province</span><select data-act="prov-select">' + ['<option value="">Whole region</option>'].concat(provinces().map(function (p) {
          return '<option value="' + attr(p) + '"' + (STATE.prov === p ? ' selected' : '') + '>' + esc(p) + '</option>'; })).join('') + '</select></label>' +
        '<label class="field"><span>Search</span><input type="search" id="mu-search" value="' + attr(STATE.muniSearch) + '" placeholder="Municipality or province"></label>' +
      '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th class="sticky">Municipality (' + rows.length + ')</th>' +
        acts.map(function (a) { return '<th title="' + attr(a.label) + '">' + esc(a.code) + '<div class="tiny" style="text-transform:none">Seq ' + esc(a.seq) + '</div></th>'; }).join('') +
        '<th class="num">Lacking</th>' + (STATE.stage === 1 ? '<th class="num">K2 (1st BA)</th>' : '') + (cvOn ? '<th class="num">BResT</th><th class="num">SFMSC</th>' : '') +
      '</tr></thead><tbody>' + (body || '<tr><td colspan="20" class="empty-state">No municipality matches.</td></tr>') + '</tbody></table></div>' +
    '</div>';
  bindSearch('mu-search', function (v) { STATE.muniSearch = v; renderMunis(); });
}

// ---- barangays ---------------------------------------------------------------

var BRGY_FILTERS = [
  { id: 'all', label: 'All barangays', test: function () { return true; } },
  { id: 'lacking', label: 'Lacking records', test: function (b) { return (b.owed || 0) > 0; } },
  { id: 'nosheet', label: 'Recorded without sheet', test: function (b) { return Object.keys(b.activities).some(function (k) { return b.activities[k].status === 'No Attendees' && !b.activities[k].notApplicable; }); } },
  { id: 'k2', label: 'K2 below 70%', test: function (b) { return b.hhListed > 0 && b.hhRate < 0.7; } },
  { id: 'cv', label: 'Volunteers missing', test: function (b) { return !!b.volunteers && Object.keys(b.volunteers).some(function (k) { return b.volunteers[k].status === 'Not encoded'; }); } },
  { id: 'sfmsc', label: 'SFMSC to fix', test: function (b) { return !!b.volunteers && b.volunteers.SFMSC && b.volunteers.SFMSC.status === 'Needs fixing'; } }
];

function brgyStatusPill(x, a) {
  if (!x || x.notApplicable || x.status === 'N/A') return '<span class="tiny">—</span>';
  if (x.status === 'Complete') return '<span class="pill good" title="' + attr(n(x.attendees) + ' attendees') + '">✓ ' + n(x.attendees) + '</span>';
  if (x.status === 'No Attendees') return '<span class="pill warn" title="Encoded, attendance sheet missing">No sheet</span>';
  return '<span class="pill ' + (a.field === 'Completed' ? 'bad' : 'idle') + '" title="Not in KCIS' + (a.field === 'Completed' ? ' (field conduct: Completed)' : '') + '">○</span>';
}
function cvPill(v, code) {
  if (!v || !v[code]) return '<span class="tiny">—</span>';
  var x = v[code], cls = x.status === 'Encoded' ? 'good' : x.status === 'Needs fixing' ? 'warn' : 'bad';
  return '<span class="pill ' + cls + '" title="' + attr(x.status + (x.reasons && x.reasons.length ? ': ' + x.reasons.join(', ') : '')) + '">' + esc(x.status === 'Encoded' ? '✓ ' + x.members : x.status === 'Needs fixing' ? '⚠ ' + x.members : '○') + '</span>' +
    (x.reasons && x.reasons.length ? '<div class="tiny">' + esc(x.reasons.join(' · ')) + '</div>' : '');
}

function brgyRows() {
  var key = STATE.muni, q = normSearch(STATE.brgySearch);
  var f = BRGY_FILTERS.filter(function (x) { return x.id === STATE.brgyFilter; })[0] || BRGY_FILTERS[0];
  return (SNAP.barangayRows || []).filter(function (b) {
    return (!key || b.province + '|' + b.municipality === key) && (!q || normSearch(b.barangay).indexOf(q) !== -1) && f.test(b);
  });
}

function renderBrgys() {
  var munis = (S.overview.municipalities || []).slice().sort(function (a, b) { return a.province.localeCompare(b.province) || a.municipality.localeCompare(b.municipality); });
  if (!STATE.muni && munis.length) STATE.muni = munis[0].province + '|' + munis[0].municipality;
  var acts = stageActs(), cvOn = STATE.stage === 1 && S.overview.volunteers && S.overview.volunteers.imported;
  var all = (SNAP.barangayRows || []).filter(function (b) { return b.province + '|' + b.municipality === STATE.muni; });
  var rows = brgyRows();
  var opts = '', lastProv = '';
  munis.forEach(function (m) {
    if (m.province !== lastProv) { opts += (lastProv ? '</optgroup>' : '') + '<optgroup label="' + attr(m.province) + '">'; lastProv = m.province; }
    var v = m.province + '|' + m.municipality;
    opts += '<option value="' + attr(v) + '"' + (STATE.muni === v ? ' selected' : '') + '>' + esc(m.municipality) + '</option>';
  });
  opts += '</optgroup>';
  var chips = BRGY_FILTERS.map(function (f) {
    var c = all.filter(f.test).length;
    if (f.id === 'cv' || f.id === 'sfmsc') { if (!cvOn) return ''; }
    return '<button class="filter-chip' + (STATE.brgyFilter === f.id ? ' active' : '') + '" data-act="brgy-filter" data-v="' + f.id + '">' + esc(f.label) + ' <span class="chip-count">' + c + '</span></button>';
  }).join('');
  // every cell opens the people behind it on the People page
  var link = function (v, html, title) { return '<button class="cell-link" data-act="p-open" data-v="' + attr(v) + '" title="' + attr(title) + '">' + html + '</button>'; };
  var body = rows.map(function (b) {
    var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
    return '<tr><td class="sticky"><strong>' + esc(b.barangay) + '</strong>' + (b.stage2Prio && STATE.stage === 2 ? ' <span class="pill idle">Prio</span>' : '') +
        '<div><button class="link tiny" data-act="p-open" data-v="' + attr('attendees#' + bkey) + '">People</button></div></td>' +
      acts.map(function (a) {
        var x = b.activities[a.code], pill = brgyStatusPill(x, a);
        return '<td>' + (x && x.status !== 'Not Encoded' && x.status !== 'N/A' && a.level !== 'Municipal' ? link('attendees#' + bkey + '#' + a.code, pill, 'See the attendees') : pill) + '</td>';
      }).join('') +
      (STATE.stage === 1 ? '<td class="num">' + (b.hhListed
        ? link('households#' + bkey + '#BA1', '<span style="color:' + (b.hhRate >= 0.7 ? 'var(--good-text)' : 'var(--warn-text)') + '">' + pctText(b.hhRate) + '</span><div class="tiny">' + n(b.hhPresent) + '/' + n(b.hhListed) + '</div>', 'See the household roster')
        : '<span class="tiny">not reported</span>') + '</td>' : '') +
      (cvOn ? '<td>' + link('volunteers#' + bkey + '#BREST', cvPill(b.volunteers, 'BREST'), 'See the BResT') + '</td><td>' + link('volunteers#' + bkey + '#SFMSC', cvPill(b.volunteers, 'SFMSC'), 'See the SFMSC') + '</td>' : '') +
      '<td class="tiny">' + (b.todo && b.todo.length ? esc(b.todo.join(' · ')) : '') + '</td></tr>';
  }).join('');
  var parts = STATE.muni.split('|');
  $('bg-body').innerHTML =
    '<div class="card"><div class="card-head"><div><h2>Barangays · ' + esc(parts[1] || '') + ' <span class="muted" style="font-weight:400">(' + esc(parts[0] || '') + ')</span></h2>' +
      '<div class="muted">' + n(all.length) + ' monitored barangays. ✓ = with attendance sheet (attendees), No sheet = encoded without attendance, ○ = not in KCIS.</div></div>' +
      '<button class="btn ghost" data-act="csv-brgys">CSV</button></div>' +
      stageSwitch() +
      '<div class="filters">' +
        '<label class="field"><span>Municipality</span><select data-act="muni-select">' + opts + '</select></label>' +
        '<label class="field"><span>Search</span><input type="search" id="bg-search" value="' + attr(STATE.brgySearch) + '" placeholder="Barangay"></label>' +
      '</div>' +
      '<div class="filters">' + chips + '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th class="sticky">Barangay (' + rows.length + ')</th>' +
        acts.map(function (a) { return '<th title="' + attr(a.label) + '">' + esc(a.code) + '<div class="tiny" style="text-transform:none">Seq ' + esc(a.seq) + '</div></th>'; }).join('') +
        (STATE.stage === 1 ? '<th class="num">K2</th>' : '') + (cvOn ? '<th>BResT</th><th>SFMSC</th>' : '') + '<th>Lacking</th>' +
      '</tr></thead><tbody>' + (body || '<tr><td colspan="30" class="empty-state">No barangay matches.</td></tr>') + '</tbody></table></div>' +
    '</div>';
  bindSearch('bg-search', function (v) { STATE.brgySearch = v; renderBrgys(); });
}

function bindSearch(id, fn) {
  var el = $(id);
  if (!el) return;
  el.addEventListener('input', function () {
    var v = el.value, pos = el.selectionStart;
    fn(v);
    var again = $(id);
    if (again) { again.focus({ preventScroll: true }); try { again.setSelectionRange(pos, pos); } catch (e) {} }
  });
}

// ---- settings ----------------------------------------------------------------

function renderSettings() {
  var p = prefs(), bs = baselineSummary();
  var acts = readActivities();
  $('st-body').innerHTML =
    '<div class="card"><div class="home-set"><div><h2>Your municipality</h2><div class="muted">' + esc(homeLabel() || 'Not chosen yet') + '</div></div>' +
      '<button class="btn ghost" data-act="home-edit">Change</button></div></div>' +
    '<div class="card"><h2>Baseline</h2>' +
      '<p class="muted">' + (p.baseline ? 'Loaded from <strong>' + esc(p.baseline.file) + '</strong> on ' + esc(new Date(p.baseline.at).toLocaleString()) + '.'
        : 'Built in from <strong>' + esc(BUILT_IN.source) + '</strong> (built ' + esc(new Date(BUILT_IN.builtAt).toLocaleDateString()) + ').') +
      ' ' + n(bs.rows) + ' barangays listed; ' + n(bs.brgys) + ' monitored in ' + n(bs.munis) + ' municipalities.</p>' +
      '<div class="row-actions"><label class="btn ghost">Load a newer baseline…<input type="file" id="st-baseline" accept=".xlsx,.csv" hidden></label>' +
        (p.baseline ? '<button class="btn ghost" data-act="baseline-reset">Use the built-in baseline</button>' : '') + '</div>' +
      '<p class="tiny">A Baseline file needs Province, Municipality and Barangay columns (PSGC codes and Monitored are used when present). The monitor workbook works too.</p></div>' +
    '<div class="card"><h2>KCIS pull date</h2>' +
      '<p class="muted">The date the exports were pulled from KCIS. A record with no attendance sheet counts as lacking from the 3rd day after the activity, judged on this date.</p>' +
      '<div class="filters"><label class="field"><span>Pull date</span><input type="date" id="st-evaldate" value="' + attr(p.evalDate || '') + '"></label>' +
        '<button class="btn ghost" data-act="evaldate-clear">Use today</button></div></div>' +
    '<div class="card"><h2>Field conduct per activity</h2>' +
      '<p class="muted">A record not in KCIS counts as lacking only when its activity is marked <strong>Completed</strong> in the field. ' +
        (p.activities ? 'Taken from <strong>' + esc(p.activities.file) + '</strong>.' : 'Starts from the built-in monitor settings.') + '</p>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th class="num">Seq</th><th>Activity</th><th>Stage</th><th>Field conduct</th></tr></thead><tbody>' +
        acts.map(function (a) {
          return '<tr><td class="num">' + esc(a.seq) + '</td><td>' + esc(a.label) + '</td><td>' + esc(a.stage) + '</td><td><select data-act="field" data-v="' + attr(a.code) + '">' +
            FIELD_VALUES.map(function (f) { return '<option' + (a.field === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></td></tr>';
        }).join('') + '</tbody></table></div></div>' +
    '<div class="card note-card"><h3>About</h3><ul>' +
      '<li>PCRP Monitor Desktop runs the Encoding Monitor v' + esc(BUILT_IN.monitorVersion) + ' rules on this computer. Files are never uploaded.</li>' +
      '<li>The loaded exports, the findings of earlier pulls and the verification tags are kept in this browser until you choose "Forget saved data" on the Import page; settings above are remembered too.</li>' +
      '<li>Household heads\' names appear in Data Health, as for an editor of the web monitor. Handle the exports and any downloaded file under the Data Privacy Act.</li>' +
    '</ul></div>';
  var bf = $('st-baseline');
  if (bf) bf.addEventListener('change', function () {
    var f = bf.files[0]; if (!f) return;
    readDataFile(f).then(function (found) {
      var b = found.filter(function (x) { return x.kind === 'baseline'; })[0];
      if (!b) throw new Error(f.name + ' has no Baseline (Province, Municipality, Barangay) table.');
      acceptTable(b);
      toast('Baseline loaded: ' + n(b.table.rows.length) + ' barangays.');
      afterSettingsChange();
    }).catch(function (e) { toast(e.message); });
  });
  var ed = $('st-evaldate');
  if (ed) ed.addEventListener('change', function () { var q = prefs(); q.evalDate = ed.value || ''; delete q.evalDateFromSave; savePrefs(q); afterSettingsChange(); });
}

function afterSettingsChange() {
  loadReferenceTables();
  if (STATE.computed) computeAndShow(null);
  renderSettings();
}

// ---- export ------------------------------------------------------------------

function pipelineTable() {
  return [['Seq', 'Activity', 'Level', 'Field conduct', 'Target', 'With attendance sheet', 'Recorded without sheet', 'Not encoded', 'Lacking', '% with sheet']]
    .concat(scopedPipeline().map(function (p) {
      return [p.a.seq, p.a.label, p.a.level, p.a.field, p.expected, p.complete, p.noAttendees, p.notEncoded, p.backlog, p.expected ? Math.round(p.complete / p.expected * 1000) / 10 : ''];
    }));
}
function muniTable(allStages) {
  var acts = allStages ? S.overview.activities : stageActs();
  var cvOn = S.overview.volunteers && S.overview.volunteers.imported;
  var head = ['Province', 'Municipality'];
  acts.forEach(function (a) { head.push(a.code + ' with sheet', a.code + ' target', a.code + ' no sheet', a.code + ' lacking'); });
  head.push('K2 listed', 'K2 present', 'K2 %');
  if (cvOn) head.push('BResT encoded', 'BResT target', 'SFMSC encoded', 'SFMSC to fix', 'SFMSC target');
  // the export compares the chosen municipality with the rest of its province
  var h = home(), exportRows = S.matrix.rows.filter(function (r) { return !h || h.region || r.province === h.province; });
  var rows = (allStages ? exportRows : muniTableData()).map(function (r) {
    var line = [r.province, r.municipality];
    acts.forEach(function (a) { var c = r.cells[a.code] || {}; line.push(c.complete || 0, c.expected || 0, c.noAttendees || 0, c.backlog || 0); });
    var h = r.households || {};
    line.push(h.listed || 0, h.present || 0, h.listed ? Math.round(h.present / h.listed * 1000) / 10 : '');
    if (cvOn) { var v = r.volunteers || {}, B = v.BREST || {}, F = v.SFMSC || {}; line.push(B.encoded || 0, B.expected || 0, F.encoded || 0, F.needsFix || 0, F.expected || 0); }
    return line;
  });
  return [head].concat(rows);
}
function brgyTable(rows, allStages) {
  var acts = allStages ? S.overview.activities : stageActs();
  var cvOn = S.overview.volunteers && S.overview.volunteers.imported;
  var head = ['Province', 'Municipality', 'Barangay', 'PSGC'].concat(acts.map(function (a) { return a.code + ' (Seq ' + a.seq + ')'; }))
    .concat(['K2 listed', 'K2 present', 'K2 %']).concat(cvOn ? ['BResT', 'BResT volunteers', 'SFMSC', 'SFMSC volunteers', 'SFMSC to fix'] : []).concat(['Lacking']);
  var st = function (x) { return !x || x.notApplicable || x.status === 'N/A' ? 'N/A' : x.status === 'Complete' ? 'With sheet (' + x.attendees + ')' : x.status === 'No Attendees' ? 'No sheet' : 'Not encoded'; };
  return [head].concat(rows.map(function (b) {
    var line = [b.province, b.municipality, b.barangay, b.psgcBrgy || ''].concat(acts.map(function (a) { return st(b.activities[a.code]); }))
      .concat([b.hhListed || 0, b.hhPresent || 0, b.hhListed ? Math.round(b.hhRate * 1000) / 10 : '']);
    if (cvOn) {
      var v = b.volunteers || {}, B = v.BREST || {}, F = v.SFMSC || {};
      line = line.concat([B.status || '', B.members || 0, F.status || '', F.members || 0, (F.reasons || []).join('; ')]);
    }
    return line.concat([(b.todo || []).join(' | ')]);
  }));
}
function healthTable() {
  var keep = S.healthScope; S.healthScope = homeKey() ? 'm:' + homeKey() : '';
  var evs = dhEvaluateAll(S.overview, '');
  var lines = [['Check', 'Severity', 'Province', 'Municipality', 'Barangay', 'Detail']];
  evs.forEach(function (e) {
    if (e.pending || e.outOfScope) return;
    var c = e.check;
    if (!e.rows.length && e.count) { lines.push([c.name, DH_SEV[c.severity].label, '', '', '', e.count + ' ' + c.unit[e.count === 1 ? 0 : 1] + ' (count only)']); return; }
    e.rows.forEach(function (r) {
      // the listing inside the chosen municipality (a household head can be listed in two)
      var p = c.places(r).filter(dhInScope)[0] || c.places(r)[0] || {};
      lines.push([c.name, DH_SEV[c.severity].label, p.province || '', p.municipality || '', p.barangay || '', c.detail(r)]);
    });
  });
  S.healthScope = keep;
  return lines;
}
function csvOf(rows) {
  return rows.map(function (r) {
    return r.map(function (v) { var s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
  }).join('\n');
}
function stamp() { return new Date().toISOString().slice(0, 10); }

function exportExcel() {
  var keepStage = STATE.stage, keepProv = STATE.prov;
  var summary = [['PCRP Monitor Desktop — findings'], ['Municipality', homeLabel()], ['Generated', new Date().toLocaleString()], ['Pull date', prefs().evalDate || today()],
    ['Monitor rules', 'v' + BUILT_IN.monitorVersion], ['Participants file', LOADED.participants ? LOADED.participants.file : ''],
    ['Households file', LOADED.households ? LOADED.households.file : ''], ['Volunteer file', LOADED.volunteers ? LOADED.volunteers.file : ''], []];
  STATE.prov = '';
  [1, 2].forEach(function (s) { STATE.stage = s; summary.push(['Stage ' + s]); summary = summary.concat(pipelineTable()); summary.push([]); });
  STATE.stage = keepStage; STATE.prov = keepProv;
  var sheets = [
    { name: 'Summary', rows: summary },
    { name: homeKey() ? 'Municipalities in ' + home().province.slice(0, 15) : 'Municipalities', rows: muniTable(true) },
    { name: 'Barangays', rows: brgyTable((SNAP.barangayRows || []).filter(function (b) { return !homeKey() || inOverviewScope(b); }), true) },
    { name: 'Data Health', rows: healthTable() }
  ];
  var fname = 'PCRP_findings_' + (homeKey() ? home().municipality.replace(/[^A-Za-z0-9]+/g, '_') + '_' : '') + stamp() + '.xlsx';
  saveBlob(makeXlsx(sheets), fname);
  toast('Saved ' + fname + ' (4 sheets).');
}

// ---- events -------------------------------------------------------------------

document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-act]');
  if (!t) return;
  var act = t.getAttribute('data-act'), v = t.getAttribute('data-v');
  if (t.tagName === 'SELECT') return;
  if (act === 'stage') { STATE.stage = Number(v); renderPage(); }
  else if (act === 'prov') { STATE.prov = v || ''; renderPage(); }
  else if (act === 'go') go(v);
  else if (act === 'muni') openMuni(v);
  else if (act === 'brgy-filter') { STATE.brgyFilter = v; renderBrgys(); }
  else if (act === 'health-open') {
    S.healthOpen = {}; S.healthOpen[v] = true;
    S.healthScope = homeKey() ? 'm:' + homeKey() : (STATE.prov ? 'p:' + STATE.prov : '');
    S.healthView = 'check'; S.healthSeverity = 'all'; go('health');
  }
  else if (act === 'go-brgys') { STATE.muni = homeKey() || STATE.muni; STATE.brgyFilter = 'all'; go('brgys'); }
  else if (act === 'home-edit') { STATE.editHome = true; go('import'); }
  else if (act === 'home-cancel') { STATE.editHome = false; renderHome(); }
  else if (act === 'home-save') saveHome($('home-select') && $('home-select').value);
  else if (act === 'csv-pipeline') downloadCsv('PCRP_activities_stage' + STATE.stage + '_' + stamp() + '.csv', csvOf(pipelineTable()));
  else if (act === 'csv-munis') downloadCsv('PCRP_municipalities_stage' + STATE.stage + '_' + stamp() + '.csv', csvOf(muniTable(false)));
  else if (act === 'csv-brgys') downloadCsv('PCRP_barangays_' + STATE.muni.replace(/[^A-Za-z0-9]+/g, '_') + '_' + stamp() + '.csv', csvOf(brgyTable(brgyRows(), false)));
  else if (act === 'baseline-reset') { var p = prefs(); delete p.baseline; savePrefs(p); toast('Using the built-in baseline.'); afterSettingsChange(); }
  else if (act === 'evaldate-clear') { var q = prefs(); delete q.evalDate; delete q.evalDateFromSave; savePrefs(q); afterSettingsChange(); }
});
document.addEventListener('keydown', function (ev) {
  if (ev.key !== 'Enter') return;
  var t = ev.target.closest && ev.target.closest('tr[data-act="muni"]');
  if (t) openMuni(t.getAttribute('data-v'));
});
document.addEventListener('change', function (ev) {
  var t = ev.target;
  var act = t.getAttribute && t.getAttribute('data-act');
  if (act === 'prov-select') { STATE.prov = t.value; renderPage(); }
  else if (act === 'im-evaldate') {
    var q = prefs(); q.evalDate = t.value || ''; delete q.evalDateFromSave; savePrefs(q);
    if (STATE.computed) computeAndShow(null); else renderImport();
  }
  else if (act === 'muni-select') { STATE.muni = t.value; STATE.brgyFilter = 'all'; renderBrgys(); }
  else if (act === 'field') {
    var p = prefs(); p.field = p.field || {}; p.field[t.getAttribute('data-v')] = t.value; savePrefs(p);
    toast('Field conduct saved' + (STATE.computed ? '; recomputing.' : '.')); afterSettingsChange();
  }
});

$('tabs').addEventListener('click', function (ev) {
  var b = ev.target.closest('button[data-page]');
  if (b && !b.disabled) go(b.getAttribute('data-page'));
});
$('btn-import-top').addEventListener('click', function () { go('import'); });
$('btn-export').addEventListener('click', exportExcel);
$('btn-compute').addEventListener('click', function () { computeAndShow('overview'); });
$('btn-clear').addEventListener('click', function () {
  delete TABS.Raw_Participants; delete TABS.Raw_Households; delete TABS.Raw_Volunteers;
  LOADED = {}; IMPORT_ERRORS = []; STATE.computed = false; SNAP = null; S.overview = null; S.matrix = null; PEOPLE = null;
  // The saved exports go too; earlier pulls and verification tags stay until "Forget saved data".
  SAVED.current = null;
  if (SAVED.available) savedTx('readwrite', function (s) { s.delete('current'); }).then(renderSavedBar).catch(function () {});
  setTabsEnabled(false); renderStatus(); renderImport();
});
$('file-input').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
var drop = $('drop');
['dragenter', 'dragover'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add('over'); }); });
['dragleave', 'drop'].forEach(function (e) { drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove('over'); }); });
drop.addEventListener('drop', function (ev) { handleFiles(ev.dataTransfer && ev.dataTransfer.files); });
// a file dropped anywhere on the window should not open in the browser
['dragover', 'drop'].forEach(function (e) { window.addEventListener(e, function (ev) { ev.preventDefault(); }); });
$('memo-copy').addEventListener('click', function () {
  var ta = $('memo-text'); ta.select();
  (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(function () { toast('Memo copied.'); })
    .catch(function () { document.execCommand('copy'); toast('Memo copied.'); });
});
$('memo-save').addEventListener('click', function () {
  saveBlob(new Blob([$('memo-text').value], { type: 'text/plain;charset=utf-8' }), 'PCRP_data_health_memo_' + stamp() + '.txt');
});

$('home-chip').addEventListener('click', function () { STATE.editHome = true; go('import'); });

// ---- start ----------------------------------------------------------------------
loadReferenceTables();
applyHomeScope();
renderImport();
renderStatus();
// after the computation's own 'Findings ready' message, so this one is the one left on screen
savedRestore().then(function (restored) {
  if (restored) setTimeout(function () { toast('Opened the data saved on this PC: as of ' + SAVED.current.pullDate + '. Drop newer exports to replace it.'); }, 800);
});
