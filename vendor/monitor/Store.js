/**
 * Store.gs — the Sheet is the database. Everything that touches
 * SpreadsheetApp lives here so Core.gs can stay portable and testable.
 */

var SHEETS = {
  BASELINE: 'Baseline',        // Province | Municipality | Barangay | Batch | Monitored
  ACTIVITIES: 'Activities',    // Seq | Code | KCIS Name | Label | Level | Households | Field conduct
  PARTICIPANTS: 'Raw_Participants',
  HH_PARTICIPATION: 'Raw_HH_Participation',  // KCIS Household Participation export (households counted per activity)
  VOLUNTEERS: 'Raw_Volunteers',  // KCIS Community Volunteer List (1st BA: BResT, SFMSC)
  HISTORY: 'History',          // long format, one row per muni per activity per snapshot
  SETTINGS: 'Settings',
  TARGETS: 'Target_Deadlines', // one row per management deadline (see TARGET_HEADERS in Code.js)
  APPRAISAL: 'RPMO_Appraisal', // Province | Municipality | Status | Date, set by the PEO
  FINDINGS: 'DQA_Findings'     // open Data Health items per pull, places and counts only (Fix list)
};

var HISTORY_HEADERS = [
  'Snapshot date', 'Province', 'Municipality', 'Seq', 'Activity', 'Expected',
  'Fully encoded', 'Attendees missing', 'Not encoded', 'Attendees encoded',
  'Households listed', 'Households represented', 'Backlog'
];

var CACHE_KEY = 'pcrp_snap_v229';   // bumped: K2 from the Household Participation counts
var CACHE_TTL = 21600;   // 6 hours; every import busts it explicitly

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '';
  try {
    return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function findSheetByName_(name) {
  var ss = ss_();
  if (!ss) return null;
  var exact = ss.getSheetByName(name);
  if (exact) return exact;

  var all = ss.getSheets();
  var targetKey = normKey(name);
  for (var i = 0; i < all.length; i++) {
    if (normKey(all[i].getName()) === targetKey) return all[i];
  }
  return null;
}

function sheet_(name, headers) {
  var s = findSheetByName_(name);
  if (!s) {
    s = ss_().insertSheet(name);
    if (headers) {
      s.getRange(1, 1, 1, headers.length).setValues([headers])
       .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
      s.setFrozenRows(1);
    }
  }
  return s;
}

/** Values below the header row, or [] when the sheet is empty. */
function body_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
}

function replaceBody_(sheet, rows, width) {
  var last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, sheet.getMaxColumns()).clearContent();
  if (!rows.length) return;
  sheet.getRange(2, 1, rows.length, width || rows[0].length).setValues(rows);
}

// ===================================================================
// BASELINE  and  ACTIVITIES
// ===================================================================

function readBaseline() {
  var table = readRawTable(SHEETS.BASELINE);
  var headers = table.headers || [];
  var rows = table.rows || [];

  var map = {};
  headers.forEach(function (h, idx) {
    if (h !== null && h !== undefined) {
      map[normKey(h)] = idx;
    }
  });

  var hasNamedHeaders = map[normKey('Municipality')] !== undefined || map[normKey('Barangay')] !== undefined;

  var colProvince = hasNamedHeaders && map[normKey('Province')] !== undefined ? map[normKey('Province')] : 0;
  var colMuni = hasNamedHeaders && map[normKey('Municipality')] !== undefined ? map[normKey('Municipality')] : 1;
  var colBrgy = hasNamedHeaders && map[normKey('Barangay')] !== undefined ? map[normKey('Barangay')] : 2;
  var colBatch = hasNamedHeaders && map[normKey('Batch')] !== undefined ? map[normKey('Batch')] : 3;
  var colFocal = hasNamedHeaders && map[normKey('FocalArea')] !== undefined ? map[normKey('FocalArea')] : null;
  var colPsgcBrgy = hasNamedHeaders && map[normKey('lib_brgy.code_correspondence')] !== undefined ? map[normKey('lib_brgy.code_correspondence')] : null;
  var colPsgcCity = hasNamedHeaders && map[normKey('lib_city.code_correspondence')] !== undefined ? map[normKey('lib_city.code_correspondence')] : null;
  var colPsgcProv = hasNamedHeaders && map[normKey('lib_province.code_correspondence')] !== undefined ? map[normKey('lib_province.code_correspondence')] : null;
  var colPsgcReg = hasNamedHeaders && map[normKey('lib_region.code_correspondence')] !== undefined ? map[normKey('lib_region.code_correspondence')] : null;
  var colMonitored = map[normKey('Monitored')] !== undefined ? map[normKey('Monitored')] : (hasNamedHeaders ? null : 4);
  var colStage2Prio = map[normKey('Stage 2 Prioritized')] !== undefined ? map[normKey('Stage 2 Prioritized')]
    : (map[normKey('Stage 2 Priority')] !== undefined ? map[normKey('Stage 2 Priority')]
    : (map[normKey('Stage2Prioritized')] !== undefined ? map[normKey('Stage2Prioritized')]
    : (map[normKey('Prioritized')] !== undefined ? map[normKey('Prioritized')]
    : null)));
  // Optional community-profile household total; absent until that data exists.
  var colCpHh = null;
  if (hasNamedHeaders) {
    CP_HH_HEADERS.forEach(function (h) {
      if (colCpHh === null && map[normKey(h)] !== undefined) colCpHh = map[normKey(h)];
    });
  }

  var baseline = [], monitored = {}, order = [];
  rows.forEach(function (r) {
    var brgyName = r[colBrgy] ? String(r[colBrgy]).trim() : '';
    var muniName = r[colMuni] ? String(r[colMuni]).trim() : '';
    if (!brgyName || !muniName) return;

    var prioVal = colStage2Prio !== null && r[colStage2Prio] !== undefined ? String(r[colStage2Prio]).trim().toLowerCase() : '';
    var isStage2Prio = colStage2Prio !== null ? (prioVal === 'yes' || prioVal === 'true' || prioVal === '1') : true;

    var bObj = {
      province: r[colProvince] ? String(r[colProvince]).trim() : '',
      municipality: muniName,
      barangay: brgyName,
      batch: colBatch !== null && r[colBatch] !== undefined ? String(r[colBatch]).trim() : '',
      focalArea: colFocal !== null && r[colFocal] !== undefined ? String(r[colFocal]).trim() : '',
      stage2Prio: isStage2Prio,
      psgcBrgy: colPsgcBrgy !== null && r[colPsgcBrgy] !== undefined ? String(r[colPsgcBrgy]).trim() : '',
      psgcCity: colPsgcCity !== null && r[colPsgcCity] !== undefined ? String(r[colPsgcCity]).trim() : '',
      psgcProvince: colPsgcProv !== null && r[colPsgcProv] !== undefined ? String(r[colPsgcProv]).trim() : '',
      psgcRegion: colPsgcReg !== null && r[colPsgcReg] !== undefined ? String(r[colPsgcReg]).trim() : '',
      cpHh: colCpHh !== null ? parseHhCount(r[colCpHh]) : null
    };
    baseline.push(bObj);

    var on = colMonitored !== null && r[colMonitored] !== undefined ? String(r[colMonitored]).trim().toLowerCase() : '';
    var isOn = on === '' || on === 'yes' || on === 'true';
    if (isOn && !monitored[muniName]) {
      monitored[muniName] = true;
      order.push(muniName);
    }
  });

  return { rows: baseline, monitored: order };
}

/**
 * Every municipality in the baseline with its monitored flag — including the
 * switched-off ones, so the admin screen can switch them back on.
 */
function readAllMunicipalities() {
  var table = readRawTable(SHEETS.BASELINE);
  var headers = table.headers || [];
  var rows = table.rows || [];

  var map = {};
  headers.forEach(function (h, idx) {
    if (h !== null && h !== undefined) {
      map[normKey(h)] = idx;
    }
  });

  var hasNamedHeaders = map[normKey('Municipality')] !== undefined;
  var colProvince = hasNamedHeaders && map[normKey('Province')] !== undefined ? map[normKey('Province')] : 0;
  var colMuni = hasNamedHeaders && map[normKey('Municipality')] !== undefined ? map[normKey('Municipality')] : 1;
  var colBatch = hasNamedHeaders && map[normKey('Batch')] !== undefined ? map[normKey('Batch')] : 3;
  var colMonitored = map[normKey('Monitored')] !== undefined ? map[normKey('Monitored')] : (hasNamedHeaders ? null : 4);

  var seen = {}, out = [];
  rows.forEach(function (r) {
    var p = r[colProvince] ? String(r[colProvince]).trim() : '';
    var m = r[colMuni] ? String(r[colMuni]).trim() : '';
    var key = p + '|' + m;
    if (!m || seen[key]) return;
    seen[key] = true;
    var on = colMonitored !== null && r[colMonitored] !== undefined ? String(r[colMonitored]).trim().toLowerCase() : '';
    out.push({
      province: p,
      municipality: m,
      batch: colBatch !== null && r[colBatch] !== undefined ? String(r[colBatch]).trim() : '',
      monitored: on === '' || on === 'yes' || on === 'true'
    });
  });

  return out.sort(function (a, b) {
    var mDiff = (a.municipality || '').localeCompare(b.municipality || '', undefined, { sensitivity: 'base', numeric: true });
    if (mDiff !== 0) return mDiff;
    return (a.province || '').localeCompare(b.province || '', undefined, { sensitivity: 'base', numeric: true });
  });
}

function readActivities() {
  var rows = body_(sheet_(SHEETS.ACTIVITIES));
  var defaultByCode = {};
  DEFAULT_ACTIVITIES.forEach(function (d) { defaultByCode[d.code] = d; });
  var out = [];
  var seen = {};

  if (rows && rows.length) {
    rows.forEach(function (r) {
      var code = r[1] ? String(r[1]).trim() : '';
      if (!code) return;
      seen[code] = true;
      var def = defaultByCode[code] || {};
      var stg = r[7] !== undefined && r[7] !== '' ? parseInt(r[7], 10) : (def.stage || (Number(r[0]) >= 6 ? 2 : 1));
      var prio = r[8] !== undefined && r[8] !== '' ? (String(r[8]).trim().toLowerCase() === 'yes') : (def.prioOnly !== undefined ? def.prioOnly : false);
      var isHh = String(r[5] || '').toLowerCase() === 'yes' || code === 'BA1' || code === 'BA2' || code === 'BA3';

      out.push({
        seq: String(r[0]),
        code: code,
        name: String(r[2] || def.name || ''),
        label: String(r[3] || def.label || code),
        level: String(r[4] || def.level || 'Barangay'),
        households: isHh,
        field: String(r[6] || def.field || 'On-going'),
        stage: isNaN(stg) ? (def.stage || 1) : stg,
        prioOnly: prio
      });
    });
  }

  // Ensure all activities from DEFAULT_ACTIVITIES are present
  DEFAULT_ACTIVITIES.forEach(function (def) {
    if (!seen[def.code]) {
      out.push({
        seq: def.seq,
        code: def.code,
        name: def.name,
        label: def.label,
        level: def.level,
        households: !!def.households,
        field: def.field || 'On-going',
        stage: def.stage || 1,
        prioOnly: !!def.prioOnly
      });
    }
  });

  return out;
}

function writeActivities(activities) {
  var s = sheet_(SHEETS.ACTIVITIES, ['Seq', 'Code', 'KCIS Name', 'Label', 'Level',
                                     'Households', 'Field conduct', 'Stage', 'Prioritized Only']);
  replaceBody_(s, activities.map(function (a) {
    return [a.seq, a.code, a.name, a.label, a.level,
            a.households ? 'Yes' : 'No', a.field,
            a.stage || 1, a.prioOnly ? 'Yes' : 'No'];
  }), 9);
}

/** Only the PEO should move field conduct — it decides what counts as backlog. */
function setFieldConduct(code, value, passkey) {
  requireEditor_(passkey);
  if (FIELD_CONDUCT.indexOf(value) === -1) throw new Error('Unknown field conduct: ' + value);
  var acts = readActivities();
  var found = false;
  acts.forEach(function (a) { if (a.code === code) { a.field = value; found = true; } });
  if (!found) throw new Error('Unknown activity: ' + code);
  writeActivities(acts);
  bustCache_();
  return { ok: true };
}

function setAllFieldConduct(value, passkey) {
  requireEditor_(passkey);
  if (FIELD_CONDUCT.indexOf(value) === -1) throw new Error('Unknown field conduct: ' + value);
  var acts = readActivities();
  acts.forEach(function (a) { a.field = value; });
  writeActivities(acts);
  bustCache_();
  return { ok: true };
}

function setMonitored(target, on, passkey) {
  requireEditor_(passkey);
  var s = sheet_(SHEETS.BASELINE);
  var last = s.getLastRow();
  if (last < 2) return { ok: true };
  var lastCol = s.getLastColumn();
  var headers = s.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) { map[normKey(h)] = i; });
  var colProvince = map[normKey('Province')] !== undefined ? map[normKey('Province')] : 0;
  var colMuni = map[normKey('Municipality')] !== undefined ? map[normKey('Municipality')] : 1;
  var colMon = map[normKey('Monitored')];
  if (colMon === undefined) {
    colMon = headers.length;
    s.getRange(1, colMon + 1).setValue('Monitored').setFontWeight('bold');
    lastCol = colMon + 1;
  }
  var targetMuni = String(target || '').trim(), targetProv = '';
  if (targetMuni.indexOf('|') !== -1) {
    var parts = targetMuni.split('|');
    targetProv = parts[0].trim();
    targetMuni = parts[1].trim();
  }
  var data = s.getRange(2, 1, last - 1, lastCol).getValues();
  data.forEach(function (r) {
    var pMatch = targetProv ? normAlpha(r[colProvince]) === normAlpha(targetProv) : true;
    var mMatch = normAlpha(r[colMuni]) === normAlpha(targetMuni);
    if (mMatch && pMatch) {
      r[colMon] = on ? 'Yes' : 'No';
    }
  });
  s.getRange(2, 1, data.length, data[0].length).setValues(data);
  bustCache_();
  return { ok: true };
}

function setAllMonitored(on, passkey) {
  requireEditor_(passkey);
  var s = sheet_(SHEETS.BASELINE);
  var last = s.getLastRow();
  if (last < 2) return { ok: true };
  var lastCol = s.getLastColumn();
  var headers = s.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) { map[normKey(h)] = i; });
  var colMon = map[normKey('Monitored')];
  if (colMon === undefined) {
    colMon = headers.length;
    s.getRange(1, colMon + 1).setValue('Monitored').setFontWeight('bold');
    lastCol = colMon + 1;
  }
  var data = s.getRange(2, 1, last - 1, lastCol).getValues();
  data.forEach(function (r) {
    r[colMon] = on ? 'Yes' : 'No';
  });
  s.getRange(2, 1, data.length, data[0].length).setValues(data);
  bustCache_();
  return { ok: true };
}

// ===================================================================
// RAW DATA
// ===================================================================

function readRaw(name) {
  var s = findSheetByName_(name);
  if (!s || s.getLastRow() < 2) return [];
  return body_(s);
}

function readRawTable(name) {
  var s = findSheetByName_(name);
  if (!s || s.getLastRow() < 1) return { headers: [], rows: [] };
  var lastRow = s.getLastRow();
  var lastCol = s.getLastColumn();
  if (lastCol < 1) return { headers: [], rows: [] };

  // Attempt Sheets Advanced Service v4 batch read if available (10x faster than SpreadsheetApp)
  if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
    try {
      var ssId = ss_().getId();
      var range = "'" + name + "'!A1:" + columnToLetter_(lastCol) + lastRow;
      var resp = Sheets.Spreadsheets.Values.get(ssId, range, { valueRenderOption: 'UNFORMATTED_VALUE' });
      var vals = resp.values || [];
      if (vals.length) {
        var hRow = vals[0] || [];
        var rRows = vals.slice(1);
        var w = hRow.length;
        for (var i = 0; i < rRows.length; i++) {
          while (rRows[i].length < w) rRows[i].push('');
        }
        return { headers: hRow, rows: rRows };
      }
    } catch (e) {
      Logger.log('Sheets API readRawTable failed, falling back to SpreadsheetApp: ' + e.message);
    }
  }

  var headers = s.getRange(1, 1, 1, lastCol).getValues()[0];
  if (lastRow < 2) return { headers: headers, rows: [] };
  var rows = s.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return { headers: headers, rows: rows };
}

function columnToLetter_(column) {
  var temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

/**
 * Replace a raw tab with the header and rows given, in the monitor's
 * spreadsheet (ss_()). Checks the rows landed and throws when they did not, so
 * an import never reports rows it did not write. Returns {rows, spreadsheet, url}.
 */
function writeRaw(name, headerRow, dataRows) {
  try { PropertiesService.getScriptProperties().setProperty('LAST_IMPORT_AT', new Date().toISOString()); } catch (e) {}
  var s = sheet_(name);
  var ss = s.getParent();   // the spreadsheet that holds the tab; the batch write must target the same one
  s.clear();
  s.getRange(1, 1, 1, headerRow.length).setValues([headerRow])
   .setFontWeight('bold').setBackground('#595959').setFontColor('#ffffff');
  var n = dataRows ? dataRows.length : 0;
  var landed = function () { SpreadsheetApp.flush(); return Math.max(0, s.getLastRow() - 1); };
  if (n) {
    // Attempt Sheets Advanced Service v4 batch write if available
    var written = false;
    if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
      try {
        var range = "'" + s.getName().replace(/'/g, "''") + "'!A2:" + columnToLetter_(headerRow.length) + (n + 1);
        var valueRange = Sheets.newValueRange();
        valueRange.values = dataRows;
        Sheets.Spreadsheets.Values.update(valueRange, ss.getId(), range, { valueInputOption: 'USER_ENTERED' });
        written = landed() === n;
        if (!written) Logger.log('Sheets Advanced Service write left ' + landed() + ' of ' + n + ' rows; writing with setValues');
      } catch (e) {
        Logger.log('Sheets Advanced Service write failed, falling back to setValues: ' + e.message);
      }
    }
    if (!written) {
      var CH = 5000;
      for (var i = 0; i < n; i += CH) {
        var part = dataRows.slice(i, i + CH);
        s.getRange(2 + i, 1, part.length, headerRow.length).setValues(part);
      }
    }
  }
  s.setFrozenRows(1);
  var got = landed();
  if (got !== n) {
    throw new Error('Only ' + got + ' of ' + n + ' rows reached the "' + s.getName() + '" tab of "' + ss.getName() + '". The import did not complete; please import the file again.');
  }
  return { rows: got, spreadsheet: ss.getName(), url: ss.getUrl() };
}

function writeRawChunk(name, chunkIndex, totalChunks, headerRow, chunkRows, startRow) {
  var s = sheet_(name);
  if (chunkIndex === 0) {
    s.clear();
    s.getRange(1, 1, 1, headerRow.length).setValues([headerRow])
     .setFontWeight('bold').setBackground('#595959').setFontColor('#ffffff');
  }
  if (chunkRows && chunkRows.length) {
    s.getRange(startRow || 2, 1, chunkRows.length, headerRow.length).setValues(chunkRows);
  }
  if (chunkIndex === totalChunks - 1) {
    s.setFrozenRows(1);
  }
}

// ===================================================================
// SNAPSHOT  (computed once, then cached)
// ===================================================================

function bustCache_() {
  var c = CacheService.getScriptCache();
  c.remove(CACHE_KEY);
  c.remove('pcrp_snap_v228');
  c.remove('pcrp_snap_v228_hh');
  c.remove('pcrp_snap_v215');
  c.remove('pcrp_snap_v213');
  c.remove('pcrp_snapshot_v1');
  for (var i = 0; i < 20; i++) {
    c.remove(CACHE_KEY + '_' + i);
    c.remove('pcrp_snap_v215_' + i);
    c.remove('pcrp_snap_v213_' + i);
    c.remove('pcrp_snapshot_v1_' + i);
  }
}

/** Reassemble a value cached in slices by cachePutChunked_, or null. One getAll, not one call per slice. */
function cacheGetChunked_(cache, key) {
  var meta = cache.get(key);
  if (!meta) return null;
  try {
    var n = JSON.parse(meta).chunks, keys = [];
    for (var i = 0; i < n; i++) keys.push(key + '_' + i);
    var got = cache.getAll(keys), parts = [];
    for (var j = 0; j < keys.length; j++) {
      if (got[keys[j]] === undefined || got[keys[j]] === null) return null;
      parts.push(got[keys[j]]);
    }
    return JSON.parse(parts.join(''));
  } catch (e) {
    return null;
  }
}

/** Values over the 100 KB cache limit are stored in slices. Never throws. */
function cachePutChunked_(cache, key, obj) {
  try {
    var s = JSON.stringify(obj), size = 90000, map = {}, n = 0;
    for (var j = 0; j < s.length; j += size) map[key + '_' + (n++)] = s.slice(j, j + size);
    cache.putAll(map, CACHE_TTL);
    cache.put(key, JSON.stringify({ chunks: n }), CACHE_TTL);
  } catch (e) { /* caching is an optimisation, never a requirement */ }
}

/** evalDateIso: the day the backlog is judged on (YYYY-MM-DD); today when omitted. */
function buildSnapshot(evalDateIso) {
  var base = readBaseline();
  var acts = readActivities();
  var pTable = readRawTable(SHEETS.PARTICIPANTS);
  var hTable = readRawTable(SHEETS.HH_PARTICIPATION);
  var vTable = readRawTable(SHEETS.VOLUNTEERS);   // empty until the volunteer list is imported
  var snap = computeSnapshot(pTable.rows,
                             hTable.rows,
                             base.rows, base.monitored, acts,
                             pTable.headers, hTable.headers, evalDateIso,
                             vTable.rows, vTable.headers);
  snap.generatedAt = new Date().toISOString();
  snap.activities = acts;
  return snap;
}

/**
 * The whole snapshot can exceed the 100 KB cache limit once the Region is
 * encoding, so cache it in slices and reassemble.
 */
function getSnapshot(force) {
  var cache = CacheService.getScriptCache();
  if (!force) {
    var parsed = cacheGetChunked_(cache, CACHE_KEY);
    // A snapshot cached yesterday judged the backlog on yesterday's date.
    if (parsed && parsed.evalDate === todayIso() && Array.isArray(parsed.noAttendeesRecords)) {
      var hasExpected = parsed.pipeline && parsed.pipeline.some(function (p) { return (p.noAttendees || 0) > 0; });
      if (!hasExpected || parsed.noAttendeesRecords.length > 0) {
        return parsed;
      }
    }
  }
  var snap = buildSnapshot();
  cachePutChunked_(cache, CACHE_KEY, snap);
  return snap;
}

// ===================================================================
// HISTORY
// ===================================================================

function appendHistory(snap, dateISO) {
  var s = sheet_(SHEETS.HISTORY, HISTORY_HEADERS);
  var rows = snapshotToHistory(snap, dateISO);
  if (!rows || !rows.length) return 0;
  var width = HISTORY_HEADERS.length;
  var lastRow = s.getLastRow();

  if (lastRow < 2) {
    // Sheet has only header or is completely empty
    s.getRange(2, 1, rows.length, width).setValues(rows);
    return rows.length;
  }

  // Scan ONLY Column A (dates) to find if this snapshot date already exists
  // Reading 1 column takes ~0.1s instead of reading all columns of 20,000+ rows
  var dateVals = s.getRange(2, 1, lastRow - 1, 1).getValues();
  var matchIndices = [];
  for (var i = 0; i < dateVals.length; i++) {
    var d = formatDateVal(dateVals[i][0]) || (dateVals[i][0] ? String(dateVals[i][0]).trim() : '');
    if (d === dateISO) {
      matchIndices.push(i + 2); // 1-based row index in sheet
    }
  }

  if (matchIndices.length === 0) {
    // FAST PATH: Date does not exist yet. Simply append to the bottom!
    // Takes ~1 second instead of wiping and rewriting 20,000+ rows!
    s.getRange(lastRow + 1, 1, rows.length, width).setValues(rows);
    return rows.length;
  }

  // If date already exists, check if existing rows form a contiguous block matching row count
  var isContiguous = true;
  for (var j = 1; j < matchIndices.length; j++) {
    if (matchIndices[j] !== matchIndices[j - 1] + 1) {
      isContiguous = false;
      break;
    }
  }

  if (isContiguous && matchIndices.length === rows.length) {
    // Overwrite exact same block in place without wiping the sheet!
    s.getRange(matchIndices[0], 1, rows.length, width).setValues(rows);
    return rows.length;
  }

  // Fallback: full rewrite only if non-contiguous or length mismatch
  var existing = body_(s).filter(function (r) {
    var d = formatDateVal(r[0]) || (r[0] ? String(r[0]).trim() : '');
    return d && d !== dateISO;
  });
  replaceBody_(s, existing.concat(rows), width);
  return rows.length;
}

/**
 * Movement against the most recent EARLIER snapshot for the same municipality
 * AND activity. Computed here rather than with sheet formulas so it stays right
 * however the rows are ordered.
 */
function readHistory(filter) {
  var rows = body_(sheet_(SHEETS.HISTORY, HISTORY_HEADERS));
  var recs = rows.filter(function (r) { return r[0] && r[2]; }).map(function (r) {
    var dStr = formatDateVal(r[0]);
    if (!dStr && r[0]) {
      var raw = String(r[0]).trim();
      dStr = raw.length === 10 ? raw : formatDateVal(raw);
    }
    return {
      date: dStr || '',
      province: String(r[1] || '').trim(),
      municipality: String(r[2] || '').trim(),
      seq: String(r[3] || '').trim(),
      activity: String(r[4] || '').trim(),
      expected: +r[5] || 0,
      complete: +r[6] || 0,
      noAttendees: +r[7] || 0,
      notEncoded: +r[8] || 0,
      attendees: +r[9] || 0,
      hhListed: r[10] === '' || r[10] === null ? null : +r[10],
      hhPresent: r[11] === '' || r[11] === null ? null : +r[11],
      backlog: +r[12] || 0
    };
  }).filter(function (r) { return r.date && r.date.length === 10; });

  // Volunteer rows (CV_BREST, CV_SFMSC) count barangays, not records, so they
  // stay out of every activity total; they are read only when asked for.
  var wantCv = filter && filter.activity && isVolunteerHistoryCode(filter.activity);
  recs = recs.filter(function (r) { return wantCv ? isVolunteerHistoryCode(r.activity) : !isVolunteerHistoryCode(r.activity); });

  var byKey = {};
  recs.forEach(function (r) {
    var k = r.province + '|' + r.municipality + '|' + r.activity;
    (byKey[k] = byKey[k] || []).push(r);
  });
  Object.keys(byKey).forEach(function (k) {
    var list = byKey[k].sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    list.forEach(function (r, i) {
      if (i === 0) return;
      var p = list[i - 1];
      r.prevDate = p.date;
      r.dComplete = r.complete - p.complete;
      r.dAttendees = r.attendees - p.attendees;
      r.dNotEncoded = r.notEncoded - p.notEncoded;
      var days = (new Date(r.date) - new Date(p.date)) / 86400000;
      r.days = days;
      r.perDay = days > 0 ? (r.complete - p.complete) / days : null;
    });
  });

  if (filter && filter.municipality) {
    var fm = String(filter.municipality).trim();
    if (fm === 'REGION') {
      recs = recs.filter(function (r) { return r.municipality === 'REGION'; });
    } else {
      var fProv = '', fMuni = fm;
      if (fm.indexOf('|') !== -1) {
        var parts = fm.split('|');
        fProv = parts[0].trim();
        fMuni = parts[1].trim();
      } else if (fm.indexOf('(') !== -1 && fm.indexOf(')') !== -1) {
        var mMatch = fm.match(/^(.*?)\s*\((.*?)\)$/);
        if (mMatch) {
          fMuni = mMatch[1].trim();
          fProv = mMatch[2].trim();
        }
      }

      var fMuniKey = normKey(fMuni);
      var fMuniAlpha = normAlpha(fMuni);
      var fProvKey = fProv ? normKey(fProv) : '';
      var fProvAlpha = fProv ? normAlpha(fProv) : '';

      // Exact name match first. Substring matching is only a fallback: on its
      // own it makes "Carmen" pick up "Del Carmen" as well.
      var matchWith = function (loose) {
        return recs.filter(function (r) {
          if (r.municipality === 'REGION') return false;
          var rMuniKey = normKey(r.municipality);
          var rMuniAlpha = normAlpha(r.municipality);
          var mMatches = (rMuniKey === fMuniKey) || (rMuniAlpha === fMuniAlpha) || (r.municipality === fMuni) ||
                         (loose && ((rMuniKey.indexOf(fMuniKey) !== -1) || (fMuniKey.indexOf(rMuniKey) !== -1)));

          if (!mMatches) return false;
          if (!fProvKey) return true;

          var rProvKey = normKey(r.province);
          var rProvAlpha = normAlpha(r.province);
          return (rProvKey === fProvKey) || (rProvAlpha === fProvAlpha) || (r.province === fProv) ||
                 (loose && ((rProvKey.indexOf(fProvKey) !== -1) || (fProvKey.indexOf(rProvKey) !== -1)));
        });
      };
      var exact = matchWith(false);
      recs = exact.length ? exact : matchWith(true);
    }
  }

  if (filter && filter.activity) {
    var fa = String(filter.activity).trim();
    var faKey = normKey(fa);
    recs = recs.filter(function (r) {
      return r.activity === fa || normKey(r.activity) === faKey;
    });
  }

  return recs.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
}

/** Dates on which a snapshot exists, oldest first. */
function historyDates() {
  var seen = {}, out = [];
  body_(sheet_(SHEETS.HISTORY, HISTORY_HEADERS)).forEach(function (r) {
    var d = formatDateVal(r[0]);
    if (!d && r[0]) {
      var s = String(r[0]).trim();
      d = s.length === 10 ? s : formatDateVal(s);
    }
    if (d && d.length === 10 && !seen[d]) {
      seen[d] = true;
      out.push(d);
    }
  });
  return out.sort();
}

/** Municipalities with no movement across the last n snapshots. */
function stalled(n) {
  var dates = historyDates().slice(-(n + 1));
  if (dates.length < n + 1) return [];
  var recs = readHistory(null).filter(function (r) {
    return dates.indexOf(r.date) !== -1 && r.municipality !== 'REGION';
  });
  // Key on province AND municipality. PCRP covers Loreto in both Agusan del Sur
  // and Dinagat Islands, Carmen in both Agusan del Norte and Surigao del Sur,
  // and San Francisco in both Agusan del Sur and Surigao del Norte. Keying on
  // the name alone sums the pair, so one municipality moving hides the other
  // standing still — the exact case this function exists to catch.
  var byMuni = {};
  recs.forEach(function (r) {
    var k = r.province + '|' + r.municipality;
    byMuni[k] = byMuni[k] || { province: r.province, municipality: r.municipality, dates: {} };
    byMuni[k].dates[r.date] = (byMuni[k].dates[r.date] || 0) + r.complete;
  });
  return Object.keys(byMuni).filter(function (k) {
    var vals = dates.map(function (d) { return byMuni[k].dates[d]; })
                    .filter(function (v) { return v !== undefined; });
    return vals.length === dates.length &&
           vals.every(function (v) { return v === vals[0]; });
  }).map(function (k) { return byMuni[k].municipality + ' (' + byMuni[k].province + ')'; });
}

// ===================================================================
// DQA FINDINGS LEDGER  (what was open at each pull, for the Fix list)
// ===================================================================

var FINDINGS_HEADERS = ['Pull date', 'Key', 'Check', 'Province', 'Municipality', 'Barangay', 'Activity', 'Problem', 'Count'];
var FINDINGS_KEEP_PULLS = 12;   // how far back "open since" looks

function findingDate_(v) {
  return formatDateVal(v) || (v ? String(v).trim() : '');
}

/** Record the open findings of one pull, replacing that pull's earlier rows. */
function writeFindings(dateISO, findings) {
  var s = sheet_(SHEETS.FINDINGS, FINDINGS_HEADERS);
  var width = FINDINGS_HEADERS.length;
  var rows = (findings || []).map(function (f) {
    return [dateISO, dqaFindingKey(f), f.check, f.province, f.municipality, f.barangay, f.act, f.part, f.count];
  });
  var lastRow = s.getLastRow();
  var hasDate = lastRow >= 2 && s.getRange(2, 1, lastRow - 1, 1).getValues().some(function (r) { return findingDate_(r[0]) === dateISO; });
  if (!hasDate) {
    // Same fast path as the history: a new pull is appended, nothing is rewritten.
    if (rows.length) s.getRange(lastRow + 1, 1, rows.length, width).setValues(rows);
    return rows.length;
  }
  var keep = body_(s).filter(function (r) { return findingDate_(r[0]) !== dateISO; });
  replaceBody_(s, keep.concat(rows), width);
  return rows.length;
}

/** {date: {key: finding}} for the last FINDINGS_KEEP_PULLS pulls before beforeDate (all pulls when beforeDate is ''). */
function readFindingsLedger(beforeDate) {
  var s = findSheetByName_(SHEETS.FINDINGS);
  if (!s) return {};
  var byDate = {};
  body_(s).forEach(function (r) {
    var d = findingDate_(r[0]);
    if (!d || (beforeDate && d >= beforeDate)) return;
    (byDate[d] = byDate[d] || {})[String(r[1])] = {
      check: String(r[2]), province: String(r[3]), municipality: String(r[4]), barangay: String(r[5]),
      act: String(r[6]), part: String(r[7]), count: Number(r[8]) || 0
    };
  });
  var keep = Object.keys(byDate).sort().slice(-FINDINGS_KEEP_PULLS), out = {};
  keep.forEach(function (d) { out[d] = byDate[d]; });
  return out;
}

// ===================================================================
// RPMO APPRAISAL STATUS  (set by hand; not in the KCIS exports)
// ===================================================================

var APPRAISAL_HEADERS = ['Province', 'Municipality', 'Status', 'Date'];

/** Never creates the sheet: this runs on every page load, including for read-only viewers. */
function readAppraisal() {
  var s = findSheetByName_(SHEETS.APPRAISAL);
  if (!s || s.getLastRow() < 2) return [];
  return appraisalList(body_(s));
}

function setAppraisal(province, municipality, status, dateIso, passkey) {
  requireEditor_(passkey);
  var s = sheet_(SHEETS.APPRAISAL, APPRAISAL_HEADERS);
  var rows = upsertAppraisalRows(body_(s), province, municipality, status, dateIso);
  replaceBody_(s, rows, APPRAISAL_HEADERS.length);
  return { ok: true };
}

// ===================================================================
// SETTINGS & TARGET DEADLINES
// ===================================================================

var SETTINGS_HEADERS = ['Key', 'Value', 'Description'];

function readSettings() {
  var s = sheet_(SHEETS.SETTINGS, SETTINGS_HEADERS);
  var rows = body_(s);
  var settings = {
    PRVA_FIELD: DEFAULT_TARGET_DEADLINES.PRVA_FIELD,
    PRVA_ENCODING: DEFAULT_TARGET_DEADLINES.PRVA_ENCODING,
    STAGE1_ENCODING: DEFAULT_TARGET_DEADLINES.STAGE1_ENCODING
  };

  if (!rows || !rows.length) {
    saveSettings(settings);
    return settings;
  }

  rows.forEach(function (r) {
    if (r[0]) {
      var k = String(r[0]).trim();
      var v = formatDateVal(r[1]) || String(r[1] || '').trim();
      if (v) settings[k] = v;
    }
  });
  return settings;
}

function saveSettings(newSettings) {
  var s = sheet_(SHEETS.SETTINGS, SETTINGS_HEADERS);
  var current = {
    PRVA_FIELD: DEFAULT_TARGET_DEADLINES.PRVA_FIELD,
    PRVA_ENCODING: DEFAULT_TARGET_DEADLINES.PRVA_ENCODING,
    STAGE1_ENCODING: DEFAULT_TARGET_DEADLINES.STAGE1_ENCODING
  };

  var existing = body_(s);
  existing.forEach(function (r) {
    if (r[0]) {
      var k = String(r[0]).trim();
      var v = formatDateVal(r[1]) || String(r[1] || '').trim();
      if (v) current[k] = v;
    }
  });

  for (var key in newSettings) {
    if (newSettings[key]) {
      current[key] = formatDateVal(newSettings[key]) || String(newSettings[key]).trim();
    }
  }

  // Every key is written back, not only the three known ones, so a row added by
  // hand is not wiped by the next save.
  var described = {
    PRVA_FIELD: 'Target field conduct completion for PRVA (Seq 3.1 to 3.5)',
    PRVA_ENCODING: 'Target 100% KCIS encoding deadline for PRVA (Seq 3.1 to 3.5)',
    STAGE1_ENCODING: 'Target 100% KCIS encoding deadline for all Stage 1 activities'
  };
  var rows = Object.keys(current).map(function (k) { return [k, current[k], described[k] || '']; });

  replaceBody_(s, rows, SETTINGS_HEADERS.length);
  bustCache_();
  return current;
}

/**
 * The management deadlines. On first use the tab is created and seeded from the
 * Settings tab (the three issued deadlines), so nothing set before is lost.
 */
function readTargets() {
  var s = findSheetByName_(SHEETS.TARGETS);
  if (s) return targetsFromRows(body_(s));   // an emptied tab stays empty
  var seeded = legacyTargets(readSettings(), readActivities());
  s = sheet_(SHEETS.TARGETS, TARGET_HEADERS);
  replaceBody_(s, targetsToRows(seeded), TARGET_HEADERS.length);
  return seeded;
}

/**
 * Replaces the deadline list after validating it. A deadline keeps its first
 * date as Original Date, and only rows that actually changed get a new
 * Updated By / Updated At, so the tab shows who moved which date.
 */
function saveTargets(list, editorName) {
  var activities = readActivities();
  var clean = (list || []).map(function (t) {
    return {
      id: String(t.id || '').trim().toUpperCase(), stage: parseInt(t.stage, 10) || 0,
      type: t.type === 'field' ? 'field' : (t.type === 'encoding' ? 'encoding' : ''),
      scope: t.scope === 'activities' ? 'activities' : 'stage',
      codes: t.scope === 'activities' ? (t.codes || []).map(String) : [],
      label: String(t.label || '').trim().slice(0, 120), date: formatDateVal(t.date) || '',
      note: String(t.note || '').trim().slice(0, 300)
    };
  });
  var errors = validateTargets(clean, activities);
  if (errors.length) throw new Error('Deadlines not saved: ' + errors.join(' '));

  var s = sheet_(SHEETS.TARGETS, TARGET_HEADERS);
  var before = {};
  targetsFromRows(body_(s)).forEach(function (t) { before[t.id] = t; });
  var who = String(editorName || '').trim() || currentUser_() || 'Editor';
  var stamp = Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyy-MM-dd');
  clean.forEach(function (t) {
    var old = before[t.id];
    var same = old && old.stage === t.stage && old.type === t.type && old.scope === t.scope &&
               old.codes.join(',') === t.codes.join(',') && old.label === t.label &&
               old.date === t.date && old.note === t.note;
    t.originalDate = old ? (old.originalDate || old.date) : t.date;
    t.updatedBy = same ? old.updatedBy : who;
    t.updatedAt = same ? old.updatedAt : stamp;
  });
  replaceBody_(s, targetsToRows(clean), TARGET_HEADERS.length);
  return clean;
}

/** id -> date, for code that still reads the old three-key shape. */
function targetsAsDeadlineMap(list) {
  var out = {};
  (list || []).forEach(function (t) { out[t.id] = t.date; });
  return out;
}
