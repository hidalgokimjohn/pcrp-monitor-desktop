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

var _dbPromise = null;

function savedDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise(function (resolve, reject) {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('This browser cannot keep data.'));
      return;
    }
    var req = indexedDB.open(SAVE_DB, 1);
    req.onupgradeneeded = function (ev) {
      var db = ev.target.result;
      if (!db.objectStoreNames.contains(SAVE_STORE)) {
        db.createObjectStore(SAVE_STORE);
      }
    };
    req.onsuccess = function (ev) {
      var db = ev.target.result;
      db.onversionchange = function () { db.close(); _dbPromise = null; };
      db.onclose = function () { _dbPromise = null; };
      resolve(db);
    };
    req.onerror = function (ev) {
      _dbPromise = null;
      reject(req.error || new Error('Browser storage is blocked.'));
    };
  });
  return _dbPromise;
}

function savedTx(mode, fn) {
  return savedDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction(SAVE_STORE, mode);
        var store = tx.objectStore(SAVE_STORE);
        var out = fn(store);
        tx.oncomplete = function () {
          resolve(out instanceof IDBRequest ? out.result : out);
        };
        tx.onerror = function () {
          reject(tx.error || new Error('Could not save in this browser.'));
        };
        tx.onabort = function () {
          reject(tx.error || new Error('Transaction aborted.'));
        };
      } catch (err) {
        _dbPromise = null;
        reject(err);
      }
    });
  });
}

function fallbackGet(key) {
  try {
    var raw = (typeof localStorage !== 'undefined' ? localStorage.getItem('pcrp_save_' + key) : null) ||
              (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pcrp_save_' + key) : null);
    return raw ? JSON.parse(raw) : undefined;
  } catch (e) {
    return undefined;
  }
}

function fallbackPut(key, val) {
  try {
    var s = typeof val === 'string' ? val : JSON.stringify(val);
    if (typeof localStorage !== 'undefined') localStorage.setItem('pcrp_save_' + key, s);
  } catch (e) {
    try {
      var s2 = typeof val === 'string' ? val : JSON.stringify(val);
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('pcrp_save_' + key, s2);
    } catch (e2) {}
  }
}

function fallbackClear() {
  try {
    ['current', 'ledger', 'tags'].forEach(function (k) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('pcrp_save_' + k);
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('pcrp_save_' + k);
    });
  } catch (e) {}
}

function savedGet(key) {
  return savedTx('readonly', function (s) { return s.get(key); })
    .catch(function () {
      return fallbackGet(key);
    })
    .then(function (res) {
      if (res === undefined) {
        res = fallbackGet(key);
      }
      if (res && typeof PCRP_CRYPTO !== 'undefined' && typeof PCRP_CRYPTO.decrypt === 'function') {
        return PCRP_CRYPTO.decrypt(res);
      }
      return res;
    });
}

function savedPut(key, val) {
  var pr = (typeof PCRP_CRYPTO !== 'undefined' && typeof PCRP_CRYPTO.encrypt === 'function')
    ? PCRP_CRYPTO.encrypt(val)
    : Promise.resolve(val);

  return pr.then(function (encVal) {
    fallbackPut(key, encVal);
    return savedTx('readwrite', function (s) {
      s.put(encVal, key);
    }).catch(function (e) {
      console.warn('[Saved] IndexedDB put failed, kept in fallback storage:', e.message);
    });
  });
}

function savedPutMany(items) {
  var keys = Object.keys(items);
  if (!keys.length) return Promise.resolve();

  return Promise.all(keys.map(function (k) {
    var val = items[k];
    var pr = (typeof PCRP_CRYPTO !== 'undefined' && typeof PCRP_CRYPTO.encrypt === 'function')
      ? PCRP_CRYPTO.encrypt(val)
      : Promise.resolve(val);
    return pr.then(function (encVal) {
      fallbackPut(k, encVal);
      return { key: k, val: encVal };
    });
  })).then(function (processed) {
    return savedTx('readwrite', function (store) {
      processed.forEach(function (it) {
        store.put(it.val, it.key);
      });
    }).catch(function (e) {
      console.warn('[Saved] IndexedDB batch put failed, fallback kept:', e.message);
    });
  });
}

function savedClear() {
  fallbackClear();
  return savedTx('readwrite', function (s) { s.clear(); }).catch(function () {});
}

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
 * Save the loaded data (participants, households, volunteers) and computed findings.
 * Called immediately when files are imported and whenever computation completes.
 */
function savedSaveCurrent() {
  clearTimeout(saveTimer);
  var pd = pullDate();
  var tables = {};
  var hasAny = false;
  SAVE_TABLES.forEach(function (t) {
    if (TABS[t] && TABS[t].rows && TABS[t].rows.length > 0) {
      tables[t] = TABS[t];
      hasAny = true;
    }
  });

  if (!hasAny) return Promise.resolve();

  var prev = SAVED.current;
  if (prev && prev.pullDate && prev.dataStamp !== SAVED.dataStamp && prev.findings) {
    var m = {};
    prev.findings.forEach(function (f) {
      if (typeof dqaFindingKey === 'function') m[dqaFindingKey(f)] = f;
    });
    SAVED.ledger[prev.pullDate] = m;
    var keep = Object.keys(SAVED.ledger).sort().slice(-SAVE_KEEP_PULLS), trimmed = {};
    keep.forEach(function (d) { trimmed[d] = SAVED.ledger[d]; });
    SAVED.ledger = trimmed;
  }

  SAVED.current = {
    pullDate: pd,
    savedAt: new Date().toISOString(),
    home: (typeof prefs === 'function' ? prefs().home : null) || null,
    dataStamp: SAVED.dataStamp || ('s' + Date.now()),
    loaded: LOADED,
    tables: tables,
    findings: (SNAP && SNAP.health && typeof dqaFindings === 'function') ? dqaFindings(SNAP.health, HH_LISTS) : []
  };

  savedApplyLedger();

  return savedPutMany({
    current: SAVED.current,
    ledger: SAVED.ledger
  }).then(function () {
    renderSavedBar();
  });
}

function savedAfterCompute() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savedSaveCurrent, 100);
}

function savedUnavailable(e) {
  if (!SAVED.available) return;
  console.warn('[Saved] Storage issue detected:', e);
  renderSavedBar();
}

/** The verification tags, saved on their own: they outlive any one pull. */
function savedPutTags() {
  return savedPut('tags', VERIFY.tags).then(renderSavedBar).catch(savedUnavailable);
}

/** At start: bring back the last data saved in this browser, if any. */
function savedRestore() {
  return Promise.all([savedGet('current'), savedGet('ledger'), savedGet('tags')]).then(function (r) {
    SAVED.ledger = r[1] || {};
    if (r[2]) VERIFY.tags = r[2];
    savedApplyLedger();
    var cur = r[0];

    // If session is locked by PIN, data is encrypted and cannot be restored until PIN is entered
    if (cur && cur.encrypted) {
      renderSavedBar();
      return 'locked';
    }

    if (!cur || !cur.tables) {
      renderSavedBar();
      return false;
    }

    var tableKeys = Object.keys(cur.tables);
    var hasAny = tableKeys.some(function (k) {
      return cur.tables[k] && cur.tables[k].rows && cur.tables[k].rows.length > 0;
    });

    if (!hasAny) {
      renderSavedBar();
      return false;
    }

    SAVED.current = cur;
    savedLoadCurrent(cur);
    return true;
  }).catch(function (e) {
    console.warn('[Saved] Restore failed:', e);
    renderSavedBar();
    return false;
  });
}

/** Put a saved pull back on screen, judged on its own pull date. */
function savedLoadCurrent(cur) {
  SAVE_TABLES.forEach(function (t) {
    delete TABS[t];
    if (cur.tables && cur.tables[t]) TABS[t] = cur.tables[t];
  });
  LOADED = cur.loaded || {};
  SAVED.dataStamp = cur.dataStamp || cur.savedAt || 'restored';
  var p = prefs();
  if (cur.pullDate && (!p.evalDate || p.evalDate !== cur.pullDate)) {
    p.evalDate = cur.pullDate;
    p.evalDateFromSave = true;
  }
  if (cur.home && !p.home) p.home = cur.home;
  savePrefs(p);

  // Read saved active page so refresh does not throw the user back to settings
  var savedPage = null;
  try {
    savedPage = sessionStorage.getItem('pcrp_active_page') || localStorage.getItem('pcrp_active_page');
  } catch (e) {}

  if (LOADED.participants && TABS.Raw_Participants && TABS.Raw_Participants.rows && TABS.Raw_Participants.rows.length > 0) {
    computeAndShow(savedPage || 'overview');
  } else {
    // Only partial exports (e.g., Volunteers or Households)
    setTabsEnabled(true);
    renderStatus();
    renderImport();
    updateTabBadges();
    renderSavedBar();
    if (savedPage && savedPage !== 'settings' && savedPage !== 'import') {
      go(savedPage);
    }
  }
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
  savedClear().then(function () {
    try {
      localStorage.removeItem('pcrp_active_page');
      sessionStorage.removeItem('pcrp_active_page');
    } catch (e) {}
    location.reload();
  }).catch(function (e) { toast(e.message); });
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

/** A .pcrp or .pcrpd file dropped in */
function savedFromFile(file) {
  if (file.name.toLowerCase().endsWith('.pcrpd')) {
    return file.text().then(function (text) {
      if (typeof openDeltaMergeModal === 'function') {
        var delta = PCRP_DELTA.parseDelta(text);
        openDeltaMergeModal(delta);
      } else {
        toast('Verification delta packet received.');
      }
    });
  }
  return file.arrayBuffer().then(gunzipBuf).then(function (text) {
    var d = JSON.parse(text);
    if (!d || d.format !== SAVE_FORMAT || !d.tables || !d.tables.Raw_Participants) throw new Error(file.name + ' is not a PCRP Encoding and Data Quality Assessment Tool save file.');
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
  var icoFn = typeof icon === 'function' ? icon : function () { return '<span class="ico">⛁</span>'; };
  var cur = SAVED.current, pulls = Object.keys(SAVED.ledger).length;
  var verified = VERIFY.tags ? Object.keys(VERIFY.tags.records || {}).length : 0;
  if (!SAVED.available) {
    el.innerHTML = '<div class="msg warn">' + icoFn('alert-triangle') + ' <div>This browser does not keep data, so a refresh clears the exports. ' +
      'Use <button class="link" data-act="save-file">Save to a file</button>, and drop that file back in next time.</div></div>';
    return;
  }
  if (!cur && !pulls && !verified) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="saved-bar">' +
    '<div class="saved-bar-icon">' + icoFn('database') + '</div>' +
    '<div class="saved-text"><strong>Saved on this PC' + (cur ? ' · Data as of ' + esc(cur.pullDate) : '') + '</strong>' +
      '<span class="tiny">' + [
        cur ? 'Saved ' + esc(new Date(cur.savedAt).toLocaleString()) : 'No exports saved',
        pulls ? n(pulls) + ' earlier ' + (pulls === 1 ? 'pull' : 'pulls') + ' kept for the Fix list' : '',
        verified ? n(verified) + ' verified ' + (verified === 1 ? 'record' : 'records') : ''
      ].filter(Boolean).join(' · ') + '. Stays in this browser until you forget it.</span></div>' +
    '<button type="button" class="btn ghost btn-sm" data-act="save-file">' + icoFn('download') + ' <span>Save to a file (.pcrp)</span></button>' +
    '<button type="button" class="btn ghost btn-sm" data-act="saved-forget">' + icoFn('trash-2') + ' <span>Forget saved data</span></button>' +
  '</div>';
}
