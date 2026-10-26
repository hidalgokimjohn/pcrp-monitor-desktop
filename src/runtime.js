// ===================================================================
// RUNTIME — runs the Encoding Monitor's server code (Code.js, Store.js,
// WebApp.js) in the browser. The Sheet becomes an in-memory set of tables,
// the Apps Script services become small stand-ins, and google.script.run
// becomes call(). Nothing is sent anywhere: files are read on this PC.
// ===================================================================

var TABS = {};          // sheet name -> { headers, rows }
var SNAP = null;        // the computed snapshot

// ---- the Sheet ---------------------------------------------------------
readRawTable = function (name) {
  var t = TABS[name];
  return t ? { headers: t.headers.slice(), rows: t.rows } : { headers: [], rows: [] };
};
findSheetByName_ = function (name) { return TABS[name] ? { __name: name } : null; };
sheet_ = function (name) { return { __name: name }; };
body_ = function (s) { var t = TABS[s.__name]; return t ? t.rows : []; };

// ---- Apps Script services -------------------------------------------------
var Logger = { log: function () {} };
PropertiesService = { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {} }; } };
// One person on their own PC: they see everything, names included.
isEditor_ = function () { return true; };
isWhitelistedGoogleUser_ = function () { return false; };
currentUser_ = function () { return ''; };
readTargets = function () { return []; };
readAppraisal = function () { return []; };
apiGetRecipientDirectory = function () { return {}; };
historyDates = function () { return []; };
getSnapshot = function () { return SNAP; };

/** google.script.run, locally: the server functions are right here. */
function call(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  return new Promise(function (resolve, reject) {
    try { resolve(window[fn].apply(null, args)); } catch (e) { reject(e); }
  });
}
function getEditorPasskey() { return ''; }

/** Recompute everything from the tables loaded now. evalDate: the KCIS pull date (YYYY-MM-DD), today when empty. */
function computeAll(evalDate) {
  SNAP = buildSnapshot(evalDate || undefined);
  return SNAP;
}

// ---- reading files ---------------------------------------------------------

/** The entries of a zip file, inflated on demand with the browser's own DecompressionStream. */
function unzipEntries(buf) {
  var dv = new DataView(buf), u8 = new Uint8Array(buf);
  var eocd = buf.byteLength - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('This file is not a valid .xlsx (zip) file.');
  var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true);
  var td = new TextDecoder('utf-8'), files = {};
  for (var i = 0; i < count; i++) {
    var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    var off = dv.getUint32(p + 42, true);
    var name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
    var start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    files[name] = { method: method, data: u8.subarray(start, start + csize) };
    p += 46 + nlen + xlen + clen;
  }
  return files;
}
function zipText(entry) {
  if (!entry) return Promise.resolve(null);
  if (entry.method === 0) return Promise.resolve(new TextDecoder('utf-8').decode(entry.data));
  var ds = new DecompressionStream('deflate-raw');
  var stream = new Blob([entry.data]).stream().pipeThrough(ds);
  return new Response(stream).text();
}

function xmlDecode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (m, c) { return String.fromCharCode(+c); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, c) { return String.fromCharCode(parseInt(c, 16)); })
    .replace(/&amp;/g, '&');
}

function parseSheetXml(xml, shared) {
  var rows = [], rr = /<row [^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g, r;
  while ((r = rr.exec(xml))) {
    var row = [], cr = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
    while ((c = cr.exec(r[1] || ''))) {
      var idx = 0;
      for (var k = 0; k < c[1].length; k++) idx = idx * 26 + c[1].charCodeAt(k) - 64;
      idx--;
      var tm = /t="([^"]+)"/.exec(c[2]), type = tm ? tm[1] : 'n';
      var inner = c[3] || '', v = /<v>([\s\S]*?)<\/v>/.exec(inner), val = '';
      if (type === 's' && v) val = shared[+v[1]];
      else if (type === 'inlineStr') { var t = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(inner); val = t ? xmlDecode(t[1]) : ''; }
      else if (type === 'b' && v) val = v[1] === '1';
      else if ((type === 'str' || type === 'e') && v) val = xmlDecode(v[1]);
      else if (v) val = Number(v[1]);
      while (row.length < idx) row.push('');
      row[idx] = val;
    }
    rows.push(row);
  }
  return rows;
}

/** Every sheet of an .xlsx file as { name: rows[][] }. */
function readXlsx(buf, onProgress) {
  var z = unzipEntries(buf);
  var sharedP = zipText(z['xl/sharedStrings.xml']).then(function (x) {
    var shared = [];
    if (!x) return shared;
    var re = /<si>([\s\S]*?)<\/si>/g, m;
    while ((m = re.exec(x))) {
      var t = '', tr = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, q;
      while ((q = tr.exec(m[1]))) t += q[1];
      shared.push(xmlDecode(t));
    }
    return shared;
  });
  return Promise.all([sharedP, zipText(z['xl/workbook.xml']), zipText(z['xl/_rels/workbook.xml.rels'])]).then(function (res) {
    var shared = res[0], wbXml = res[1], relXml = res[2], rels = {}, sheets = [];
    relXml.replace(/<Relationship\b[^>]*>/g, function (tag) {
      var id = /Id="([^"]+)"/.exec(tag), tg = /Target="([^"]+)"/.exec(tag);
      if (id && tg) rels[id[1]] = tg[1];
    });
    wbXml.replace(/<sheet\b[^>]*>/g, function (tag) {
      var nm = /name="([^"]+)"/.exec(tag), id = /r:id="([^"]+)"/.exec(tag);
      if (nm && id && rels[id[1]]) sheets.push({ name: xmlDecode(nm[1]), path: 'xl/' + rels[id[1]].replace(/^\/?xl\//, '') });
    });
    var out = {};
    return sheets.reduce(function (pr, s) {
      return pr.then(function () {
        if (onProgress) onProgress('Reading sheet ' + s.name + '…');
        return zipText(z[s.path]).then(function (xml) { out[s.name] = xml ? parseSheetXml(xml, shared) : []; });
      });
    }, Promise.resolve()).then(function () { return out; });
  });
}

/** CSV with quoted fields, commas and new lines inside quotes. */
function parseCsv(text) {
  var rows = [], row = [], cur = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function toTable(rows) {
  var hi = 0;
  while (hi < rows.length && rows[hi].filter(function (v) { return v !== '' && v !== null && v !== undefined; }).length < 3) hi++;
  var headers = (rows[hi] || []).map(function (h) { return String(h === undefined || h === null ? '' : h).trim(); });
  var body = rows.slice(hi + 1).filter(function (r) {
    return r.some(function (v) { return v !== '' && v !== null && v !== undefined; });
  }).map(function (r) {
    var x = r.slice(); while (x.length < headers.length) x.push(''); return x;
  });
  return { headers: headers, rows: body };
}

/**
 * What a table is, from its headers: participants | households (the Household
 * Participation export) | volunteers | baseline | activities | roster | null.
 * 'roster' is the old household roster export, which is no longer read.
 */
function detectKind(headers, sheetName) {
  var keys = {}, names = 0;
  headers.forEach(function (h) { var k = normKey(h); keys[k] = true; if (k === 'name') names++; });
  var has = function (h) { return !!keys[normKey(h)]; };
  var sn = normKey(sheetName || '');
  if (sn === 'raw_participants') return 'participants';
  if (sn === 'raw_hh_participation') return 'households';
  if (sn === 'raw_households') return 'roster';
  if (sn === 'raw_volunteers') return 'volunteers';
  if (sn === 'baseline') return 'baseline';
  if (sn === 'activities') return 'activities';
  if (names >= 3 || (has('Committee') && has('Position'))) return 'volunteers';
  if (has('Total Hh Represented') || has('Total Hh In Barangay')) return 'households';
  if (has('Is Present') || has('Is Hh Head') && has('Birthdate')) return 'roster';
  if (has('Sequence No') && has('First Name')) return 'participants';
  if ((has('Barangay') || has('Barangay Name')) && (has('Municipality') || has('City Name')) && !has('First Name')) return 'baseline';
  if (has('Code') && has('KCIS Name')) return 'activities';
  return null;
}

var KIND_INFO = {
  participants: { sheet: 'Raw_Participants', label: 'Participants export', expected: function () { return PARTICIPANT_HEADERS; } },
  households:   { sheet: 'Raw_HH_Participation', label: 'Household Participation export', expected: function () { return HH_COUNT_HEADERS; } },
  volunteers:   { sheet: 'Raw_Volunteers',   label: 'Community Volunteer List', expected: function () { return VOLUNTEER_HEADERS; } },
  baseline:     { sheet: 'Baseline',         label: 'Baseline (monitored barangays)', expected: function () { return ['Province', 'Municipality', 'Barangay']; } },
  activities:   { sheet: 'Activities',       label: 'Activities (field conduct)', expected: function () { return ['Seq', 'Code']; } }
};

/**
 * Read one dropped file into zero or more tables. A monitor workbook
 * (Raw_Participants, Baseline, …) gives several; a KCIS export gives one.
 */
function readDataFile(file, onProgress) {
  var isCsv = /\.csv$/i.test(file.name);
  return file.arrayBuffer().then(function (buf) {
    if (isCsv) return { Sheet1: parseCsv(new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '')) };
    return readXlsx(buf, onProgress);
  }).then(function (sheets) {
    var names = Object.keys(sheets), found = [], roster = false;
    var multi = names.some(function (n) { return /^raw_/i.test(n); });
    names.forEach(function (nm, i) {
      if (!multi && i > 0) return;                       // a KCIS export: its first sheet
      var t = toTable(sheets[nm]);
      if (!t.headers.length) return;
      var kind = detectKind(t.headers, multi ? nm : '');
      if (kind === 'roster') { roster = true; return; }  // the old household roster: K2 now comes from the counts
      if (!kind) return;
      if (kind === 'volunteers') t.headers = volunteerHeaders(t.headers);
      var expected = KIND_INFO[kind].expected();
      var missing = checkHeaders(t.headers, expected).map(function (p) { return p.replace(/^Missing required column: /, ''); });
      if (kind === 'baseline') missing = (has3(t.headers)) ? [] : missing;
      // The monitor reads Activities by position (row 1 skipped), whatever its headers.
      if (kind === 'activities') missing = [];
      found.push({ file: file.name, sheet: nm, kind: kind, table: t, missing: missing });
    });
    if (!found.length && roster) {
      throw new Error(file.name + ': this is the household roster export, which is no longer used. ' +
                      'Import the KCIS Household Participation export (Total Hh In Barangay, Total Hh Represented) instead.');
    }
    if (!found.length) throw new Error(file.name + ': not a participants, household participation, volunteer or baseline file (the column headers were not recognised).');
    return found;
  });
  function has3(headers) {
    var k = headers.map(normKey);
    return (k.indexOf('barangay') !== -1 || k.indexOf('barangay name') !== -1) && (k.indexOf('municipality') !== -1 || k.indexOf('city name') !== -1);
  }
}

// ---- writing Excel -----------------------------------------------------------

var CRC_TABLE = (function () {
  var t = [];
  for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** A stored (uncompressed) zip from { path: string }. */
function makeZip(files) {
  var te = new TextEncoder(), parts = [], central = [], offset = 0;
  Object.keys(files).forEach(function (name) {
    var data = te.encode(files[name]), nm = te.encode(name), crc = crc32(data);
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true);
    ch.setUint32(42, offset, true);
    parts.push(new Uint8Array(lh.buffer), nm, data);
    central.push(new Uint8Array(ch.buffer), nm);
    offset += 30 + nm.length + data.length;
  });
  var csize = central.reduce(function (s, a) { return s + a.length; }, 0);
  var end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** An .xlsx workbook from [{ name, rows: [[...]] }]; the first row of each sheet is bold and frozen. */
function makeXlsx(sheets) {
  var colName = function (i) { var s = ''; i++; while (i > 0) { var t = (i - 1) % 26; s = String.fromCharCode(65 + t) + s; i = (i - 1 - t) / 26; } return s; };
  var files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) { return '<sheet name="' + xmlEsc(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>' +
      '<cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>'
  };
  sheets.forEach(function (s, si) {
    var widths = [];
    s.rows.forEach(function (r) { r.forEach(function (v, i) { widths[i] = Math.min(60, Math.max(widths[i] || 8, String(v === null || v === undefined ? '' : v).length + 2)); }); });
    var body = s.rows.map(function (r, ri) {
      return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
        var ref = colName(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
        if (v === null || v === undefined || v === '') return '';
        return '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    files['xl/worksheets/sheet' + (si + 1) + '.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      (widths.length ? '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '') +
      '<sheetData>' + body + '</sheetData></worksheet>';
  });
  return makeZip(files);
}

function saveBlob(blob, filename) {
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}
function downloadCsv(filename, csv) { saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), filename); }
