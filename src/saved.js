// ===================================================================
// SAVED DATA — keeps the loaded exports, the verification tags and the
// findings of earlier pulls in this browser (IndexedDB), so a refresh or a
// reopened window does not start from zero. "Save to a file" writes the same
// thing to one .pcrp file, to move it to another PC or send it to the RPMO.
//
//   current  the exports of the latest pull: { pullDate, savedAt, home, loaded, tables, findings }
//   ledger   { pullDate: { findingKey: finding } }, earlier pulls, places and counts only
//   tags     the verification tags (see verify.js)
//
// Earlier pulls keep their findings only, never their rows: the Fix list
// needs what was open, not who was listed.
// ===================================================================

var SAVED = { current: null, ledger: {}, available: true, dataStamp: '' };   // dataStamp: which exports are on screen
var SAVE_DB = 'pcrp-desktop', SAVE_STORE = 'kv', SAVE_KEEP_PULLS = 12;
var SAVE_TABLES = ['Raw_Participants', 'Raw_Households', 'Raw_Volunteers'];
var SAVE_FORMAT = 'pcrp-desktop-save';
var saveTimer = null;

function savedDb() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) { reject(new Error('This browser cannot keep data.')); return; }
    var req = indexedDB.open(SAVE_DB, 1);
    req.onupgradeneeded = function () { req.result.createObjectStore(SAVE_STORE); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error('Browser storage is blocked.')); };
  });
}

function savedTx(mode, fn) {
  return savedDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(SAVE_STORE, mode), store = tx.objectStore(SAVE_STORE), out = fn(store);
      // a get resolves to its value, which is undefined for a key never saved
      tx.oncomplete = function () { db.close(); resolve(out instanceof IDBRequest ? out.result : out); };
      tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error('Could not save in this browser.')); };
    });
  });
}
function savedGet(key) { return savedTx('readonly', function (s) { return s.get(key); }); }
function savedPut(key, val) { return savedTx('readwrite', function (s) { s.put(val, key); }); }
function savedClear() { return savedTx('readwrite', function (s) { s.clear(); }); }

/** The pull date of the data on screen: the Settings date, else today. */
function pullDate() { return prefs().evalDate || today(); }

/** The DQA_Findings ledger and the pull dates, as the monitor's apiFixList reads them. */
function savedApplyLedger() {
  var rows = [];
  Object.keys(SAVED.ledger).sort().forEach(function (d) {
    var m = SAVED.ledger[d];
    Object.keys(m).forEach(function (k) {
      var f = m[k];
      rows.push([d, k, f.check, f.province, f.municipality, f.barangay, f.act, f.part, f.count]);
    });
  });
  TABS[SHEETS.FINDINGS] = { headers: FINDINGS_HEADERS.slice(), rows: rows };
}
historyDates = function () {
  // Pulls after the one on screen (an older pull reopened) are not "earlier".
  var pd = pullDate();
  var ds = Object.keys(SAVED.ledger).filter(function (d) { return d < pd; });
  if (STATE.computed) ds.push(pd);
  return ds.sort();
};

/**
 * Save the data on screen after a computation. A new participants export
 * starts a new pull: the previous pull's findings move into the ledger under
 * its own pull date first, so the Fix list can say what changed since.
 * Households or volunteers dropped later, or a corrected pull date, belong to
 * the same pull and move nothing.
 */
function savedAfterCompute() {
  if (!SAVED.available) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    var pd = pullDate();
    var prev = SAVED.current;
    if (prev && prev.pullDate && prev.dataStamp !== SAVED.dataStamp && prev.findings) {
      var m = {};
      prev.findings.forEach(function (f) { m[dqaFindingKey(f)] = f; });
      SAVED.ledger[prev.pullDate] = m;
      var keep = Object.keys(SAVED.ledger).sort().slice(-SAVE_KEEP_PULLS), trimmed = {};
      keep.forEach(function (d) { trimmed[d] = SAVED.ledger[d]; });
      SAVED.ledger = trimmed;
    }
    var tables = {};
    SAVE_TABLES.forEach(function (t) { if (TABS[t]) tables[t] = TABS[t]; });
    SAVED.current = {
      pullDate: pd, savedAt: new Date().toISOString(), home: prefs().home || null, dataStamp: SAVED.dataStamp,
      loaded: LOADED, tables: tables,
      findings: (SNAP && SNAP.health) ? dqaFindings(SNAP.health, HH_LISTS) : []
    };
    savedApplyLedger();
    Promise.all([savedPut('current', SAVED.current), savedPut('ledger', SAVED.ledger)])
      .then(function () { renderSavedBar(); })
      .catch(function (e) { savedUnavailable(e); });
  }, 400);
}

function savedUnavailable(e) {
  if (!SAVED.available) return;
  SAVED.available = false;
  toast('This browser could not keep the data (' + (e && e.message || 'storage blocked') + '). Use "Save to a file" instead.');
  renderSavedBar();
}

/** The verification tags, saved on their own: they outlive any one pull. */
function savedPutTags() {
  if (!SAVED.available) return Promise.resolve();
  return savedPut('tags', VERIFY.tags).catch(savedUnavailable);
}

/** At start: bring back the last data saved in this browser, if any. */
function savedRestore() {
  return Promise.all([savedGet('current'), savedGet('ledger'), savedGet('tags')]).then(function (r) {
    SAVED.ledger = r[1] || {};
    if (r[2]) VERIFY.tags = r[2];
    savedApplyLedger();
    var cur = r[0];
    if (!cur || !cur.tables || !cur.tables.Raw_Participants) { renderSavedBar(); return false; }
    SAVED.current = cur;
    savedLoadCurrent(cur);
    return true;
  }).catch(function (e) { savedUnavailable(e); return false; });
}

/** Put a saved pull back on screen, judged on its own pull date. */
function savedLoadCurrent(cur) {
  SAVE_TABLES.forEach(function (t) { delete TABS[t]; if (cur.tables[t]) TABS[t] = cur.tables[t]; });
  LOADED = cur.loaded || {};
  SAVED.dataStamp = cur.dataStamp || cur.savedAt || 'restored';
  var p = prefs();
  if (!p.evalDate || p.evalDate !== cur.pullDate) { p.evalDate = cur.pullDate; p.evalDateFromSave = true; }
  if (cur.home && !p.home) p.home = cur.home;
  savePrefs(p);
  computeAndShow('overview');
}

/** A new participants export dropped in: a new pull, and a pull date taken from saved data no longer applies. */
function savedNewExports(kind) {
  if (kind !== 'participants') return;
  SAVED.dataStamp = 'x' + Date.now();
  var p = prefs();
  if (p.evalDateFromSave) { delete p.evalDate; delete p.evalDateFromSave; savePrefs(p); }
}

/** Forget everything kept in this browser: exports, earlier findings and tags. */
function savedForget() {
  if (!confirm('Remove the saved exports, the earlier pulls and the verification tags from this browser? Save to a file first if you still need them.')) return;
  savedClear().then(function () { location.reload(); }).catch(function (e) { toast(e.message); });
}

// ---- one file -----------------------------------------------------------------

function gzipText(text) {
  if (typeof CompressionStream === 'undefined') return Promise.resolve(new Blob([text], { type: 'application/json' }));
  var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}
function gunzipBuf(buf) {
  var u8 = new Uint8Array(buf);
  if (!(u8[0] === 0x1f && u8[1] === 0x8b)) return Promise.resolve(new TextDecoder().decode(u8));
  if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot open a compressed .pcrp file.'));
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

function savedToFile() {
  if (!STATE.computed) { toast('Load and compute the exports first.'); return; }
  var pd = pullDate();
  var tables = {};
  SAVE_TABLES.forEach(function (t) { if (TABS[t]) tables[t] = TABS[t]; });
  var p = prefs();
  var data = {
    format: SAVE_FORMAT, version: 1, monitorVersion: BUILT_IN.monitorVersion, savedAt: new Date().toISOString(),
    pullDate: pd, home: p.home || null, field: p.field || null,
    loaded: LOADED, tables: tables, ledger: SAVED.ledger, tags: VERIFY.tags
  };
  setProgress('Writing the file…');
  gzipText(JSON.stringify(data)).then(function (blob) {
    setProgress('');
    var where = homeLabel().replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/, '') || 'region';
    saveBlob(blob, 'PCRP_data_' + where + '_as_of_' + pd + '.pcrp');
    toast('Saved. The file holds names and birthdates: keep it under the Data Privacy Act.');
  }).catch(function (e) { setProgress(''); toast(e.message); });
}

/** A .pcrp file dropped in: its pull, its earlier findings and its tags replace what is on screen. */
function savedFromFile(file) {
  return file.arrayBuffer().then(gunzipBuf).then(function (text) {
    var d = JSON.parse(text);
    if (!d || d.format !== SAVE_FORMAT || !d.tables || !d.tables.Raw_Participants) throw new Error(file.name + ' is not a PCRP Monitor Desktop save file.');
    var p = prefs();
    if (d.home) p.home = d.home;
    if (d.field) p.field = d.field;
    savePrefs(p);
    loadReferenceTables();
    SAVED.ledger = d.ledger || {};
    if (d.tags) VERIFY.tags = d.tags;
    var cur = { pullDate: d.pullDate, savedAt: d.savedAt, home: d.home, loaded: d.loaded, tables: d.tables, findings: null, dataStamp: 'file' + d.savedAt };
    SAVED.current = null;              // the file is the data now; no ledger move for it
    savedApplyLedger();
    IMPORT_ERRORS = [];
    savedLoadCurrent(cur);           // its computation saves it in this browser too
    savedPutTags();
    toast('Opened ' + file.name + ': data as of ' + d.pullDate + '.');
  });
}

// ---- the bar on the Import page ---------------------------------------------------

function renderSavedBar() {
  var el = $('saved-bar');
  if (!el) return;
  var cur = SAVED.current, pulls = Object.keys(SAVED.ledger).length;
  var verified = VERIFY.tags ? Object.keys(VERIFY.tags.records || {}).length : 0;
  if (!SAVED.available) {
    el.innerHTML = '<div class="msg warn">This browser does not keep data, so a refresh clears the exports. ' +
      'Use <button class="link" data-act="save-file">Save to a file</button>, and drop that file back in next time.</div>';
    return;
  }
  if (!cur && !pulls && !verified) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="saved-bar">' +
    '<span class="ico" aria-hidden="true">⛁</span>' +
    '<div class="saved-text"><strong>Saved on this PC' + (cur ? ': data as of ' + esc(cur.pullDate) : '') + '</strong>' +
      '<span class="tiny">' + [
        cur ? 'saved ' + esc(new Date(cur.savedAt).toLocaleString()) : 'no exports saved',
        pulls ? n(pulls) + ' earlier ' + (pulls === 1 ? 'pull' : 'pulls') + ' kept for the Fix list' : '',
        verified ? n(verified) + ' verified ' + (verified === 1 ? 'record' : 'records') : ''
      ].filter(Boolean).join(' · ') + '. It stays until you forget it; anyone using this browser can open it.</span></div>' +
    '<button class="btn ghost" data-act="save-file">Save to a file</button>' +
    '<button class="btn ghost" data-act="saved-forget">Forget saved data</button>' +
  '</div>';
}
