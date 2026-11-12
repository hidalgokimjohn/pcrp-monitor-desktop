// ===================================================================
// SFM — the Stakeholders Feedback Mechanism Masterlist (KCIS export).
// One row is one feedback entry (a grievance or a PINCOs record). The SFM
// focal person needs three things from it: what is still open, which records
// are incomplete, and what is worth a second look. Everything here is counted
// from the export alone; nothing is inferred about what happened in the field.
//
//   sfmBuild(table, opts)   pure: entries, attention checks, summary
//   renderSfm()             the SFM page (Overview · Entries · Municipalities)
// ===================================================================

// The columns the module cannot work without. Every other column is optional:
// a check that needs a missing column is skipped, never reported as a finding.
var SFM_HEADERS = ['Reference ID', 'Date of Intake', 'City / Municipality', 'Nature of Issue', 'Status'];

// Working days allowed by the entry's own "EODB Classification" (RA 11032: simple 3, complex 7, highly technical 20).
var SFM_EODB = { 'simple': 3, 'complex': 7, 'highly technical': 20 };

var SFM_SEV = { act: 'Act now', fix: 'Fix the record', review: 'Worth a second look' };
var SFM_CHECKS = [
  { id: 'overdue', sev: 'act', short: 'Overdue', label: 'Open past its EODB processing time',
    why: 'Still not resolved after the working days its EODB classification allows.', todo: 'Follow up with the intake officer today and record the resolution and the Date Addressed.' },
  { id: 'open', sev: 'act', short: 'Open', label: 'Still open',
    why: 'Not yet marked Resolved, and still inside its EODB processing time.', todo: 'Resolve it before the processing time runs out.' },
  { id: 'redflag', sev: 'act', short: 'Red flag', label: 'Sub-project red flag',
    why: 'The entry is tagged as a sub-project red flag.', todo: 'Confirm it was elevated and that the action taken is written in the resolution.' },
  { id: 'open_answered', sev: 'fix', short: 'Status not updated', label: 'Open, but a resolution is already written',
    why: 'The resolution field is filled while the status is not Resolved.', todo: 'If it was answered, set the status to Resolved and enter the Date Addressed.' },
  { id: 'no_date', sev: 'fix', short: 'No date addressed', label: 'Resolved without a Date Addressed',
    why: 'The resolution time cannot be computed, so these entries drop out of any timeliness report.', todo: 'Enter the date the concern was answered.' },
  { id: 'bad_date', sev: 'fix', short: 'Wrong date addressed', label: 'Date Addressed is not a valid date',
    why: 'The date is unreadable, a placeholder such as 1970-01-01, or earlier than the intake date.', todo: 'Correct the Date Addressed.' },
  { id: 'no_resolution', sev: 'fix', short: 'No resolution text', label: 'Resolved without a written resolution',
    why: 'The resolution is blank or only says "None" or "N/A".', todo: 'Write what was answered or done, and by whom.' },
  { id: 'bad_intake', sev: 'fix', short: 'Wrong intake date', label: 'Intake date missing or later than the encoding date',
    why: 'An entry cannot be received after it was encoded.', todo: 'Correct the Date of Intake.' },
  { id: 'no_place', sev: 'fix', short: 'No place', label: 'No municipality or province',
    why: 'The entry cannot be attributed to any municipality.', todo: 'Fill in the province and the city / municipality.' },
  { id: 'no_level', sev: 'fix', short: 'No barangay or level', label: 'No barangay and no intake level',
    why: 'Without either, it is unclear whether this was raised at the barangay or the municipal level.', todo: 'Enter the barangay, or set the Intake Level (Municipal, ACT, Regional).' },
  { id: 'no_category', sev: 'fix', short: 'No category', label: 'No category of concern',
    why: 'Uncategorised entries are left out of the breakdown by concern.', todo: 'Select the category of concern.' },
  { id: 'no_sender', sev: 'fix', short: 'Sender incomplete', label: 'Type of sender or sex is blank',
    why: 'Sex-disaggregated reporting needs both.', todo: 'Fill in the type of sender and, for an individual, the sex.' },
  { id: 'no_feedback', sev: 'fix', short: 'No feedback rating', label: 'Resolved without a feedback rating',
    why: 'Satisfaction cannot be reported for these entries.', todo: 'Record the sender\'s feedback on the resolution.' },
  { id: 'no_form', sev: 'fix', short: 'Form or mode blank', label: 'GRS form or mode of filing is blank',
    why: 'The entry cannot be counted as a Grievance or a PINCOs record, or by how it was filed.', todo: 'Select the GRS form and the mode of filing.' },
  { id: 'ip_group', sev: 'fix', short: 'IP group blank', label: 'IP sender without an IP group',
    why: 'IP is marked Yes but the group is not named.', todo: 'Enter the IP group.' },
  { id: 'type_bc', sev: 'review', short: 'Type B/C', label: 'Type B and Type C entries',
    why: 'Entries classified above Type A. They are few, so each one can be read.', todo: 'Read the narrative: confirm the type is right and that the resolution and dates are complete.' },
  { id: 'late_resolved', sev: 'review', short: 'Resolved late', label: 'Resolved after its EODB processing time',
    why: 'The Date Addressed is later than the working days allowed.', todo: 'Check the dates; if they are right, note the reason for the delay.' },
  { id: 'duplicate', sev: 'review', short: 'Possible duplicate', label: 'Possible duplicate entries',
    why: 'Same municipality, barangay, intake date and narrative as another entry.', todo: 'Keep one entry per feedback, unless several people really raised the same point.' },
  { id: 'self', sev: 'review', short: 'Sender = intake officer', label: 'Complainant and intake officer are the same person',
    why: 'The intake officer is the staff who received the feedback, not the sender.', todo: 'Check which of the two names is wrong.' },
  { id: 'off_list', sev: 'review', short: 'Not monitored', label: 'Municipality is not on the monitored list',
    why: 'The municipality name does not match any monitored municipality in the baseline.', todo: 'Check the spelling, or confirm the entry belongs to another area.' }
];
var SFM_CHECK = {};
SFM_CHECKS.forEach(function (c) { SFM_CHECK[c.id] = c; });

// The entry fields a breakdown (and a click on one of its bars) can filter by.
var SFM_FIELDS = {
  category: 'Category of concern', subject: 'Subject of complaint', designation: 'Who raised it', filing: 'Mode of filing',
  form: 'GRS form', sex: 'Sex', eodb: 'EODB classification', feedback: 'Feedback', month: 'Month received', level: 'Intake level'
};

// ---- small helpers ------------------------------------------------------------

function sfmText(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function sfmPad(v) { return (v < 10 ? '0' : '') + v; }

/** A date cell as YYYY-MM-DD, or '' when it is blank, unreadable or a placeholder (before 2000). */
function sfmDate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    if (!(v > 20000 && v < 80000)) return '';             // an Excel serial date
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  var s = String(v).trim(), m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s), y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) { y = +m[3]; mo = +m[1]; d = +m[2]; }
  else if (/^\d{5}(\.\d+)?$/.test(s)) return sfmDate(Number(s));
  else return '';
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return y + '-' + sfmPad(mo) + '-' + sfmPad(d);
}
function sfmTime(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
/** Calendar days from a to b. */
function sfmDays(a, b) { return Math.round((sfmTime(b) - sfmTime(a)) / 86400000); }
/** Working days (Monday to Friday) after a, up to and including b. Holidays are not known to the tool. */
function sfmWorkdays(a, b) {
  var from = sfmTime(a), to = sfmTime(b), days = 0;
  if (to <= from) return 0;
  var total = Math.round((to - from) / 86400000), weeks = Math.floor(total / 7);
  days = weeks * 5;
  for (var t = from + weeks * 7 * 86400000 + 86400000; t <= to; t += 86400000) {
    var wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) days++;
  }
  return days;
}
function sfmMedian(list) {
  if (!list.length) return null;
  var s = list.slice().sort(function (a, b) { return a - b; }), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
var SFM_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function sfmNiceDate(iso) { return iso ? +iso.slice(8, 10) + ' ' + SFM_MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4) : '—'; }
function sfmNiceMonth(ym) { return ym ? SFM_MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4) : ''; }
/** A resolution that says nothing: blank, "None", "N/A". */
function sfmNoText(s) { return !s || /^(none|n\s*\/?\s*a|nil|no|not applicable)?[\s.>\-]*$/i.test(s); }
/** The words of a person's name, without titles, accents or initials. */
function sfmNameWords(s) {
  var text = String(s || '').toLowerCase();
  if (text.normalize) text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return text.replace(/[^a-z]+/g, ' ').split(' ').filter(function (w) {
    return w.length > 2 && ['mrs', 'pdo', 'iii', 'cef', 'mac', 'swa', 'maam', 'sir', 'hon', 'resident', 'member'].indexOf(w) === -1;
  });
}
function sfmSameName(a, b) {
  var x = sfmNameWords(a), y = sfmNameWords(b);
  if (x.length < 2 || y.length < 2) return false;
  var hit = x.filter(function (w) { return y.indexOf(w) !== -1; }).length;
  return hit >= 2 && hit >= Math.min(x.length, y.length) - 1;
}
function sfmValidateTable(t) {
  if (!t || !Array.isArray(t.headers) || !Array.isArray(t.rows) || t.rows.some(function (r) { return !Array.isArray(r); })) throw new Error('Invalid SFM Masterlist table.');
  var missing = checkHeaders(t.headers, SFM_HEADERS);
  if (missing.length) throw new Error('SFM Masterlist: ' + missing.join('; ') + '.');
}

// ---- the model ----------------------------------------------------------------

/**
 * Entries, attention checks and summary of one SFM Masterlist table.
 * opts.munis  monitored municipalities [{ province, municipality }], to name the ones with no entries
 * opts.home   'Province|Municipality' to keep one municipality only (PEA / MDM scope)
 * opts.today  YYYY-MM-DD, used only when the file carries no dates at all
 */
function sfmBuild(table, opts) {
  opts = opts || {};
  var col = {};
  table.headers.forEach(function (h, i) { var k = normKey(h); if (col[k] === undefined) col[k] = i; });
  function has(name) { return col[normKey(name)] !== undefined; }
  function cell(r, name) { var i = col[normKey(name)]; return i === undefined || r[i] === null || r[i] === undefined ? '' : r[i]; }
  function get(r, name) { return sfmText(cell(r, name)); }

  var munis = opts.munis || [], byKey = {}, byName = {};
  munis.forEach(function (m) {
    byKey[normKey(m.province) + '|' + normKey(m.municipality)] = m;
    (byName[normKey(m.municipality)] = byName[normKey(m.municipality)] || []).push(m);
  });

  var entries = table.rows.map(function (r, i) {
    var province = get(r, 'Province'), municipality = get(r, 'City / Municipality');
    var m = byKey[normKey(province) + '|' + normKey(municipality)] || (!province && (byName[normKey(municipality)] || []).length === 1 ? byName[normKey(municipality)][0] : null);
    var status = get(r, 'Status'), type = /type\s*([abc])\b/i.exec(get(r, 'Nature of Issue'));
    var encodedRaw = cell(r, 'Date Encoded'), narrative = String(cell(r, 'Narrative Summary')).trim(), resolution = String(cell(r, 'Resolution')).trim();
    return {
      i: i, row: table.rowNumbers ? table.rowNumbers[i] : i + 2, ref: get(r, 'Reference ID'),
      intake: sfmDate(cell(r, 'Date of Intake')), intakeRaw: get(r, 'Date of Intake'),
      key: m ? m.province + '|' + m.municipality : '', provinceBlank: !province, province: m ? m.province : province, municipality: m ? m.municipality : municipality,
      barangay: get(r, 'Barangay'), level: get(r, 'Intake Level'), filing: get(r, 'Mode of Filing'), form: get(r, 'GRS Form'),
      feedback: get(r, 'Feedback'), senderType: get(r, 'Type of Sender'), complainant: get(r, 'Complainant'), sex: get(r, 'Sex').toLowerCase(),
      ip: /^y/i.test(get(r, 'IP')), ipGroup: get(r, 'IP Group'), organization: get(r, 'Organization'), designation: get(r, 'Designation'),
      type: type ? type[1].toUpperCase() : '', nature: get(r, 'Nature of Issue'), eodb: get(r, 'EODB Classification'),
      subject: get(r, 'Subject of Complaint'), category: get(r, 'Category of Concern'), redFlag: /^y/i.test(get(r, 'SP Red Flag')),
      narrative: narrative, resolution: resolution, officer: get(r, 'Intake Officer'),
      status: status || 'No status', open: !/^(resolved|closed)/i.test(status),
      addressedRaw: get(r, 'Date Addressed'), addressed: '', days: null, age: null,
      encodedBy: get(r, 'Encoded By'), encoded: sfmDate(typeof encodedRaw === 'number' ? encodedRaw : String(encodedRaw).slice(0, 10)), encodedRaw: sfmText(encodedRaw),
      lag: null, flags: [], dup: []
    };
  });

  // The file is judged as of its own latest encoding date, so the same file always gives the same findings.
  var asOf = '';
  entries.forEach(function (e) { if (e.encoded > asOf) asOf = e.encoded; });
  if (!asOf) entries.forEach(function (e) { if (e.intake > asOf) asOf = e.intake; });
  if (!asOf) asOf = opts.today || new Date().toISOString().slice(0, 10);

  var groups = {};
  entries.forEach(function (e) {
    var text = e.narrative.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!text) return;
    var k = [normKey(e.province), normKey(e.municipality), normKey(e.barangay), e.intake, text].join('|');
    (groups[k] = groups[k] || []).push(e);
  });
  Object.keys(groups).forEach(function (k) {
    var g = groups[k];
    if (g.length < 2) return;
    g.forEach(function (e) { e.dup = g.filter(function (x) { return x !== e; }).map(function (x) { return x.ref; }); });
  });

  entries.forEach(function (e) {
    var limit = SFM_EODB[e.eodb.toLowerCase()] || 0;
    e.limit = limit;
    function flag(id) { e.flags.push(id); }
    if (e.intake && e.encoded) e.lag = sfmDays(e.intake, e.encoded);
    if (e.open) {
      e.age = e.intake ? sfmWorkdays(e.intake, asOf) : null;
      flag(limit && e.age !== null && e.age > limit ? 'overdue' : 'open');
      if (has('Resolution') && !sfmNoText(e.resolution)) flag('open_answered');
    } else {
      if (has('Date Addressed')) {
        var addressed = sfmDate(cell(table.rows[e.i], 'Date Addressed'));
        if (!e.addressedRaw) flag('no_date');
        else if (!addressed || (e.intake && addressed < e.intake)) flag('bad_date');
        else {
          e.addressed = addressed;
          if (e.intake) { e.days = sfmWorkdays(e.intake, addressed); if (limit && e.days > limit) flag('late_resolved'); }
        }
      }
      if (has('Resolution') && sfmNoText(e.resolution)) flag('no_resolution');
      if (has('Feedback') && !e.feedback) flag('no_feedback');
    }
    if (e.redFlag) flag('redflag');
    if (!e.intake || (e.encoded && e.intake > e.encoded)) flag('bad_intake');
    if (!e.municipality || (has('Province') && e.provinceBlank)) flag('no_place');
    else if (has('Barangay') && has('Intake Level') && !e.barangay && !e.level) flag('no_level');
    if (has('Category of Concern') && !e.category) flag('no_category');
    if ((has('Type of Sender') && !e.senderType) || (has('Sex') && !e.sex && !/group/i.test(e.senderType))) flag('no_sender');
    if ((has('GRS Form') && !e.form) || (has('Mode of Filing') && !e.filing)) flag('no_form');
    if (e.ip && has('IP Group') && !e.ipGroup) flag('ip_group');
    if (e.type === 'B' || e.type === 'C') flag('type_bc');
    if (e.dup.length) flag('duplicate');
    if (has('Intake Officer') && sfmSameName(e.complainant, e.officer)) flag('self');
    if (e.municipality && munis.length && !e.key) flag('off_list');
    e.sev = e.flags.reduce(function (s, id) { var v = SFM_CHECK[id].sev; return v === 'act' || s === 'act' ? 'act' : v === 'fix' || s === 'fix' ? 'fix' : 'review'; }, '');
  });

  var scoped = opts.home ? entries.filter(function (e) { return e.key === opts.home; }) : entries;
  var scopeMunis = opts.home ? munis.filter(function (m) { return m.province + '|' + m.municipality === opts.home; }) : munis;

  var checks = SFM_CHECKS.map(function (c) {
    var hit = scoped.filter(function (e) { return e.flags.indexOf(c.id) !== -1; }), places = {};
    hit.forEach(function (e) { var k = e.municipality || '(no municipality)'; places[k] = (places[k] || 0) + 1; });
    return { id: c.id, sev: c.sev, short: c.short, label: c.label, why: c.why, todo: c.todo, count: hit.length,
      top: Object.keys(places).map(function (k) { return [k, places[k]]; }).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); }).slice(0, 3) };
  });

  var open = scoped.filter(function (e) { return e.open; }), rated = scoped.filter(function (e) { return e.feedback; });
  var withEntries = {};
  scoped.forEach(function (e) { if (e.key) withEntries[e.key] = true; });
  var intakes = scoped.map(function (e) { return e.intake; }).filter(Boolean).sort();
  var count = function (test) { return scoped.filter(test).length; };
  var summary = {
    total: scoped.length, resolved: scoped.length - open.length, open: open.length,
    overdue: count(function (e) { return e.flags.indexOf('overdue') !== -1; }),
    oldestOpen: open.reduce(function (m, e) { return e.age !== null && e.age > m ? e.age : m; }, 0),
    typeA: count(function (e) { return e.type === 'A'; }), typeB: count(function (e) { return e.type === 'B'; }), typeC: count(function (e) { return e.type === 'C'; }),
    rated: rated.length, satisfied: rated.filter(function (e) { return /satisfied/i.test(e.feedback) && !/(dis|un|not)\s*satisfied/i.test(e.feedback); }).length,
    act: count(function (e) { return e.sev === 'act'; }),
    toFix: count(function (e) { return e.flags.some(function (id) { return SFM_CHECK[id].sev === 'fix'; }); }),
    review: count(function (e) { return e.flags.some(function (id) { return SFM_CHECK[id].sev === 'review'; }); }),
    dated: count(function (e) { return !!e.addressed; }),
    medianDays: sfmMedian(scoped.filter(function (e) { return e.days !== null; }).map(function (e) { return e.days; })),
    medianLag: sfmMedian(scoped.filter(function (e) { return e.lag !== null; }).map(function (e) { return e.lag; })),
    monitored: scopeMunis.length, municipalities: Object.keys(withEntries).length,
    silent: scopeMunis.filter(function (m) { return !withEntries[m.province + '|' + m.municipality]; }).map(function (m) {
      // Two monitored municipalities can share a name (Loreto): say which one.
      return byName[normKey(m.municipality)].length > 1 ? m.municipality + ' (' + m.province + ')' : m.municipality;
    }),
    first: intakes[0] || '', last: intakes[intakes.length - 1] || ''
  };
  return { entries: scoped, all: entries.length, checks: checks, summary: summary, asOf: asOf, munis: scopeMunis, home: opts.home || '', has: has };
}

/** What an entry holds for one breakdown field. */
function sfmFieldValue(e, field) {
  if (field === 'month') return e.intake ? e.intake.slice(0, 7) : '';
  if (field === 'sex') return e.sex ? e.sex.charAt(0).toUpperCase() + e.sex.slice(1) : '';
  return e[field] || '';
}
/** [[value, count]] of a field, largest first; blank values are counted as '' and listed last. */
function sfmTally(entries, field) {
  var m = {};
  entries.forEach(function (e) { var v = sfmFieldValue(e, field); m[v] = (m[v] || 0) + 1; });
  return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return (a[0] === '') - (b[0] === '') || b[1] - a[1] || a[0].localeCompare(b[0]); });
}

/** One line per municipality (or per barangay inside one municipality): every monitored place appears, entries or not. */
function sfmGroups(data, by) {
  var rows = {}, order = [];
  function row(key, name, province, monitored) {
    if (!rows[key]) { rows[key] = { key: key, name: name, province: province, monitored: monitored, n: 0, open: 0, bc: 0, noDate: 0, fix: 0, dup: 0, lags: [], latest: '', barangays: {} }; order.push(key); }
    return rows[key];
  }
  if (by !== 'barangay') data.munis.forEach(function (m) { row(m.province + '|' + m.municipality, m.municipality, m.province, true); });
  data.entries.forEach(function (e) {
    var g = by === 'barangay' ? row('b:' + normKey(e.barangay), e.barangay || '(No barangay: municipal level)', e.province, true)
      : e.key ? row(e.key, e.municipality, e.province, true) : row('x:' + normKey(e.province) + '|' + normKey(e.municipality), (e.municipality || '(No municipality)') + (e.province ? ' · ' + e.province : ''), e.province || '', false);
    g.n++;
    if (e.open) g.open++;
    if (e.type === 'B' || e.type === 'C') g.bc++;
    if (e.flags.indexOf('no_date') !== -1 || e.flags.indexOf('bad_date') !== -1) g.noDate++;
    if (e.flags.some(function (id) { return SFM_CHECK[id].sev === 'fix'; })) g.fix++;
    if (e.dup.length) g.dup++;
    if (e.lag !== null) g.lags.push(e.lag);
    if (e.intake > g.latest) g.latest = e.intake;
    if (e.barangay) g.barangays[normKey(e.barangay)] = true;
  });
  return order.map(function (k) {
    var g = rows[k];
    g.medianLag = sfmMedian(g.lags); g.barangayCount = Object.keys(g.barangays).length;
    return g;
  }).sort(function (a, b) { return (b.monitored - a.monitored) || a.province.localeCompare(b.province) || a.name.localeCompare(b.name); });
}

/** The entries a set of filters keeps. flag: a check id, or 'attention' | 'act' | 'fix' | 'review'. */
function sfmFilter(data, f, q) {
  f = f || {};
  q = normSearch(q || '');
  return data.entries.filter(function (e) {
    if (f.flag) {
      if (SFM_CHECK[f.flag]) { if (e.flags.indexOf(f.flag) === -1) return false; }
      else if (f.flag === 'attention') { if (e.sev !== 'act' && e.sev !== 'fix') return false; }
      else if (!e.flags.some(function (id) { return SFM_CHECK[id].sev === f.flag; })) return false;
    }
    if (f.muni && (e.key || 'x:' + normKey(e.province) + '|' + normKey(e.municipality)) !== f.muni) return false;
    if (f.barangay !== undefined && f.barangay !== null && f.barangay !== '' && 'b:' + normKey(e.barangay) !== f.barangay) return false;
    if (f.status === 'open' && !e.open) return false;
    if (f.status === 'resolved' && e.open) return false;
    if (f.type && e.type !== f.type) return false;
    if (f.field && sfmFieldValue(e, f.field) !== (f.value || '')) return false;
    if (q && normSearch([e.ref, e.complainant, e.municipality, e.barangay, e.officer, e.category, e.narrative, e.resolution].join(' ')).indexOf(q) === -1) return false;
    return true;
  });
}
function sfmSort(entries, sort) {
  var weight = { act: 3, fix: 2, review: 1, '': 0 };
  return entries.slice().sort(function (a, b) {
    if (sort === 'flags') return weight[b.sev] - weight[a.sev] || b.flags.length - a.flags.length || (b.intake > a.intake ? 1 : b.intake < a.intake ? -1 : 0);
    if (sort === 'old') return (a.intake || '9') > (b.intake || '9') ? 1 : (a.intake || '9') < (b.intake || '9') ? -1 : a.i - b.i;
    return b.intake > a.intake ? 1 : b.intake < a.intake ? -1 : a.i - b.i;
  });
}

// ---- export -------------------------------------------------------------------

function sfmExportSheets(data) {
  var s = data.summary;
  var summary = [['Stakeholders Feedback Mechanism: monitoring summary'], ['Scope', data.home ? data.home.replace('|', ' / ') : 'Whole region'], ['Data as of', data.asOf],
    ['Entries', s.total], ['Resolved', s.resolved], ['Open', s.open], ['Open past EODB processing time', s.overdue], ['Type A', s.typeA], ['Type B', s.typeB], ['Type C', s.typeC],
    ['Entries with a feedback rating', s.rated], ['Rated Satisfied or Very Satisfied', s.satisfied], ['Entries with a record to fix', s.toFix],
    ['Median calendar days from intake to encoding', s.medianLag === null ? 'Not available' : s.medianLag],
    ['Monitored municipalities with entries', s.municipalities + ' of ' + s.monitored], ['Monitored municipalities with no entries', s.silent.join(', ') || 'None'], [],
    ['Check', 'Group', 'Entries', 'What to do']].concat(data.checks.map(function (c) { return [c.label, SFM_SEV[c.sev], c.count, c.todo]; }));
  var attention = [['Reference ID', 'Province', 'Municipality', 'Barangay', 'Date of Intake', 'Status', 'Type', 'Group', 'Finding', 'What to do', 'Intake Officer', 'Encoded By']];
  sfmSort(data.entries, 'flags').forEach(function (e) {
    e.flags.forEach(function (id) { var c = SFM_CHECK[id]; attention.push([e.ref, e.province, e.municipality, e.barangay, e.intake || e.intakeRaw, e.status, e.nature, SFM_SEV[c.sev], c.label, c.todo, e.officer, e.encodedBy]); });
  });
  var places = [[data.home ? 'Barangay' : 'Municipality', 'Province', 'Entries', 'Open', 'Type B/C', 'Date Addressed missing or wrong', 'Entries with a record to fix', 'Possible duplicates', 'Median days intake to encoding', 'Latest intake']]
    .concat(sfmGroups(data, data.home ? 'barangay' : 'municipality').map(function (g) { return [g.name, g.province, g.n, g.open, g.bc, g.noDate, g.fix, g.dup, g.medianLag === null ? '' : g.medianLag, g.latest]; }));
  var list = [['Reference ID', 'Date of Intake', 'Province', 'Municipality', 'Barangay', 'Status', 'Type', 'EODB Classification', 'Category of Concern', 'Subject of Complaint', 'Complainant', 'Designation', 'Intake Officer',
    'Date Addressed', 'Working days to resolve', 'Date Encoded', 'Days intake to encoding', 'Findings', 'Narrative Summary', 'Resolution']]
    .concat(data.entries.map(function (e) {
      return [e.ref, e.intake || e.intakeRaw, e.province, e.municipality, e.barangay, e.status, e.nature, e.eodb, e.category, e.subject, e.complainant, e.designation, e.officer,
        e.addressed || e.addressedRaw, e.days === null ? '' : e.days, e.encoded, e.lag === null ? '' : e.lag, e.flags.map(function (id) { return SFM_CHECK[id].label; }).join('; '), e.narrative, e.resolution];
    }));
  return [{ name: 'Summary', rows: summary }, { name: 'Needs attention', rows: attention }, { name: data.home ? 'Barangays' : 'Municipalities', rows: places }, { name: 'Entries', rows: list }];
}

// ---- the page -----------------------------------------------------------------

var SFM_CACHE = null;
var SFM_UI = { view: 'overview', q: '', page: 0, sort: 'flags', restored: false, f: { flag: '', muni: '', barangay: '', status: '', type: '', field: '', value: '' } };
var SFM_PAGE_SIZE = 50;

function sfmData() {
  var t = TABS.Raw_SFM;
  if (!t) return null;
  var home = isMunicipalUser() ? homeKey() : '', munis = baselineMunis();
  if (SFM_CACHE && SFM_CACHE.table === t && SFM_CACHE.home === home && SFM_CACHE.munis === munis.length) return SFM_CACHE.data;
  SFM_CACHE = { table: t, home: home, munis: munis.length, data: sfmBuild(t, { munis: munis, home: home, today: today() }) };
  return SFM_CACHE.data;
}
function sfmRestore() {
  if (SFM_UI.restored) return;
  SFM_UI.restored = true;
  var saved = prefs().sfm || {};
  if (['overview', 'entries', 'places'].indexOf(saved.view) !== -1) SFM_UI.view = saved.view;
}
function sfmPersist() { var p = prefs(); p.sfm = { view: SFM_UI.view }; savePrefs(p); }
function sfmClearFilters() { SFM_UI.f = { flag: '', muni: '', barangay: '', status: '', type: '', field: '', value: '' }; SFM_UI.q = ''; SFM_UI.page = 0; }
function sfmShow(filters) {
  sfmClearFilters();
  Object.keys(filters || {}).forEach(function (k) { SFM_UI.f[k] = filters[k]; });
  SFM_UI.view = 'entries'; sfmPersist(); renderSfm(); window.scrollTo(0, 0);
}
/** The tab badge: open entries first, then records to fix. */
function sfmBadge() {
  if (!LOADED.sfm || !TABS.Raw_SFM || (isMunicipalUser() && !homeKey())) return null;
  var s = sfmData().summary;
  if (s.open) return { text: n(s.open) + ' open', cls: s.overdue ? 'bad' : 'warn' };
  if (s.toFix) return { text: n(s.toFix) + ' to fix', cls: 'warn' };
  return { text: s.total ? '✓' : '', cls: 'good' };
}

function sfmPct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
function sfmTile(o) {
  var tag = o.act ? 'button' : 'div';
  return '<' + tag + (o.act ? ' type="button" data-act="' + o.act + '" data-v="' + attr(o.v || '') + '" title="Show these entries"' : '') + ' class="pdm-tile sfm-tile' + (o.tone ? ' pdm-' + o.tone : '') + (o.main ? ' pdm-tile-main' : '') + '">' +
    '<span class="pdm-tile-label">' + esc(o.label) + '</span><strong>' + esc(o.value) + '</strong><small>' + esc(o.note || '') + '</small>' +
    (o.pct === undefined ? '' : '<span class="pdm-meter"><i style="width:' + Math.max(0, Math.min(100, o.pct)) + '%"></i></span>') + '</' + tag + '>';
}
function sfmTiles(data) {
  var s = data.summary, pctResolved = sfmPct(s.resolved, s.total), pctSat = sfmPct(s.satisfied, s.rated), pctFix = sfmPct(s.toFix, s.total);
  return '<div class="pdm-summary sfm-tiles">' +
    sfmTile({ label: 'Entries', value: n(s.total), main: true, note: (data.home ? '' : n(s.municipalities) + ' of ' + n(s.monitored) + ' municipalities · ') + (s.first ? sfmNiceDate(s.first) + ' to ' + sfmNiceDate(s.last) : 'no intake dates') }) +
    sfmTile({ label: 'Resolved', value: s.total ? pctResolved + '%' : '—', note: n(s.resolved) + ' of ' + n(s.total), pct: pctResolved, tone: !s.total ? 'na' : s.open ? 'mid' : 'ok' }) +
    sfmTile({ label: 'Open', value: n(s.open), tone: s.overdue ? 'low' : s.open ? 'mid' : 'ok', act: s.open ? 'sfm-status' : '', v: 'open',
      note: s.open ? (s.overdue ? n(s.overdue) + ' past EODB time · ' : '') + 'oldest ' + n(s.oldestOpen) + ' working days' : 'Nothing pending' }) +
    sfmTile({ label: 'Type B and C', value: n(s.typeB + s.typeC), act: s.typeB + s.typeC ? 'sfm-flag' : '', v: 'type_bc', note: 'Type B ' + n(s.typeB) + ' · Type C ' + n(s.typeC) + ' · Type A ' + n(s.typeA) }) +
    sfmTile({ label: 'Rated satisfied', value: s.rated ? pctSat + '%' : '—', note: n(s.satisfied) + ' of ' + n(s.rated) + ' with a rating', pct: pctSat, tone: !s.rated ? 'na' : pctSat >= 90 ? 'ok' : pctSat >= 75 ? 'mid' : 'low' }) +
    sfmTile({ label: 'Records to fix', value: n(s.toFix), act: s.toFix ? 'sfm-flag' : '', v: 'fix', note: s.total ? pctFix + '% of entries have a gap' : '', pct: pctFix, tone: !s.toFix ? 'ok' : pctFix > 25 ? 'low' : 'mid' }) +
    sfmTile({ label: 'Days to encode', value: s.medianLag === null ? '—' : n(s.medianLag), note: 'median, intake to encoding' }) + '</div>';
}
function sfmAttention(data) {
  var out = '', passed = [];
  ['act', 'fix', 'review'].forEach(function (sev) {
    var list = data.checks.filter(function (c) { return c.sev === sev; }), hit = list.filter(function (c) { return c.count; });
    list.forEach(function (c) { if (!c.count) passed.push(c.label); });
    if (!hit.length) { if (sev === 'act') out += '<div class="sfm-group"><h3 class="sfm-group-title sfm-sev-ok">' + SFM_SEV.act + '</h3><p class="sfm-clear">' + icon('check-circle-2') + ' Nothing is open. Every entry is marked Resolved.</p></div>'; return; }
    out += '<div class="sfm-group"><h3 class="sfm-group-title sfm-sev-' + sev + '">' + SFM_SEV[sev] + '</h3>' + hit.sort(function (a, b) { return b.count - a.count; }).map(function (c) {
      return '<button type="button" class="sfm-check sfm-sev-' + c.sev + '" data-act="sfm-flag" data-v="' + c.id + '"><b class="sfm-count">' + n(c.count) + '</b>' +
        '<span class="sfm-check-text"><strong>' + esc(c.label) + '</strong><small>' + esc(c.why) + '</small>' +
        (data.home || !c.top.length ? '' : '<small class="sfm-top">Most: ' + c.top.map(function (t) { return esc(t[0]) + ' ' + n(t[1]); }).join(' · ') + '</small>') + '</span>' +
        '<span class="sfm-go" aria-hidden="true">View →</span></button>';
    }).join('') + '</div>';
  });
  var s = data.summary;
  var silent = s.silent.length ? '<div class="sfm-group"><h3 class="sfm-group-title sfm-sev-review">No entries in the file</h3><p class="sfm-note">' + n(s.silent.length) + ' monitored ' + (s.silent.length === 1 ? 'municipality has' : 'municipalities have') +
    ' no SFM entry: <strong>' + esc(s.silent.join(', ')) + '</strong>. This shows what is encoded, not whether feedback was received in the field.</p></div>' : '';
  return '<section class="sfm-attn" aria-label="Needs attention"><h2>Needs attention</h2>' + out + silent +
    (passed.length ? '<details class="pdm-help"><summary>' + n(passed.length) + ' checks with nothing to report</summary><p class="tiny muted">' + esc(passed.join(' · ')) + '</p></details>' : '') + '</section>';
}
function sfmBars(data, field, limit) {
  var tally = sfmTally(data.entries, field), total = data.entries.length, max = tally.reduce(function (m, t) { return Math.max(m, t[1]); }, 1);
  if (!tally.length || (tally.length === 1 && tally[0][0] === '')) return '';
  var shown = tally.slice(0, limit || 6), rest = tally.slice(shown.length).reduce(function (s, t) { return s + t[1]; }, 0);
  return '<div class="sfm-card"><h3>' + esc(SFM_FIELDS[field]) + '</h3><ul class="sfm-bars">' + shown.map(function (t) {
    return '<li><button type="button" data-act="sfm-pick" data-k="' + field + '" data-v="' + attr(t[0]) + '" title="Show these entries"><span class="sfm-bar-label' + (t[0] ? '' : ' sfm-blank') + '">' + esc(t[0] || 'Blank') + '</span>' +
      '<span class="sfm-bar-track"><i style="width:' + Math.max(1, Math.round(t[1] / max * 100)) + '%"></i></span><b>' + n(t[1]) + '</b><small>' + sfmPct(t[1], total) + '%</small></button></li>';
  }).join('') + (rest ? '<li class="sfm-rest">' + n(tally.length - shown.length) + ' more · ' + n(rest) + ' entries</li>' : '') + '</ul></div>';
}
/** Received (by intake date) against encoded (by encoding date), month by month: the gap is the encoding backlog. */
function sfmMonths(data) {
  var m = {};
  data.entries.forEach(function (e) {
    if (e.intake) { var a = e.intake.slice(0, 7); (m[a] = m[a] || [0, 0])[0]++; }
    if (e.encoded) { var b = e.encoded.slice(0, 7); (m[b] = m[b] || [0, 0])[1]++; }
  });
  var keys = Object.keys(m).sort();
  if (!keys.length) return '';
  var max = keys.reduce(function (x, k) { return Math.max(x, m[k][0], m[k][1]); }, 1);
  return '<div class="sfm-card sfm-months-card"><h3>Received and encoded, by month</h3><div class="sfm-months" role="img" aria-label="Entries received and encoded per month">' + keys.map(function (k) {
    return '<div class="sfm-month"><div class="sfm-month-bars"><i class="sfm-in" style="height:' + Math.round(m[k][0] / max * 100) + '%" title="' + n(m[k][0]) + ' received in ' + sfmNiceMonth(k) + '"></i>' +
      '<i class="sfm-enc" style="height:' + Math.round(m[k][1] / max * 100) + '%" title="' + n(m[k][1]) + ' encoded in ' + sfmNiceMonth(k) + '"></i></div>' +
      '<span class="sfm-month-n"><b>' + n(m[k][0]) + '</b> / ' + n(m[k][1]) + '</span><small>' + esc(SFM_MONTHS[+k.slice(5, 7) - 1]) + '</small></div>';
  }).join('') + '</div><p class="sfm-legend"><span><i class="sfm-in"></i> Received (date of intake)</span><span><i class="sfm-enc"></i> Encoded</span></p></div>';
}
function sfmOverview(data) {
  return sfmTiles(data) + '<div class="sfm-cols">' + sfmAttention(data) +
    '<section class="sfm-side" aria-label="Breakdown">' + sfmMonths(data) + sfmBars(data, 'category', 7) + sfmBars(data, 'subject', 6) + sfmBars(data, 'designation', 6) +
    '<div class="sfm-pair">' + sfmBars(data, 'filing', 6) + sfmBars(data, 'form', 4) + sfmBars(data, 'sex', 3) + sfmBars(data, 'eodb', 3) + '</div></section></div>' +
    '<details class="pdm-help"><summary>How these figures are counted</summary><p class="tiny muted">Everything is counted from the SFM Masterlist as exported, as of ' + esc(sfmNiceDate(data.asOf)) + ' (the latest encoding date in the file). ' +
    'An entry is open when its status is not Resolved. Its age is counted in working days (Monday to Friday; holidays are not known to the tool) from the date of intake, against its own EODB classification: Simple 3, Complex 7, Highly Technical 20 working days. ' +
    'Rated satisfied counts Satisfied and Very Satisfied over the entries that carry a rating. A possible duplicate shares its municipality, barangay, intake date and narrative with another entry. ' +
    'The file shows what was encoded; feedback received in the field but not yet encoded is not in it.</p></details>';
}

function sfmChips(data) {
  var f = SFM_UI.f, chips = [];
  function chip(key, text) { chips.push('<button type="button" class="sfm-chip" data-act="sfm-unfilter" data-v="' + key + '" title="Remove this filter">' + esc(text) + ' <span aria-hidden="true">✕</span></button>'); }
  if (f.flag) chip('flag', SFM_CHECK[f.flag] ? SFM_CHECK[f.flag].label : f.flag === 'attention' ? 'Needs attention' : SFM_SEV[f.flag]);
  if (f.field) chip('field', SFM_FIELDS[f.field] + ': ' + (f.field === 'month' ? sfmNiceMonth(f.value) : f.value || 'Blank'));
  if (f.barangay) chip('barangay', 'Barangay: ' + ((data.entries.filter(function (e) { return 'b:' + normKey(e.barangay) === f.barangay; })[0] || {}).barangay || 'none'));
  return chips.join('');
}
function sfmEntriesBody(data) {
  var rows = sfmSort(sfmFilter(data, SFM_UI.f, SFM_UI.q), SFM_UI.sort), pages = Math.max(1, Math.ceil(rows.length / SFM_PAGE_SIZE));
  SFM_UI.page = Math.max(0, Math.min(SFM_UI.page, pages - 1));
  var slice = rows.slice(SFM_UI.page * SFM_PAGE_SIZE, (SFM_UI.page + 1) * SFM_PAGE_SIZE);
  var count = '<div class="sfm-count-line"><span><b>' + n(rows.length) + '</b> of ' + n(data.entries.length) + ' entries</span>' + sfmChips(data) +
    (rows.length !== data.entries.length ? '<button type="button" class="link" data-act="sfm-clear">Clear filters</button>' : '') + '</div>';
  if (!rows.length) return count + '<div class="msg info">No entries match these filters.</div>';
  var body = slice.map(function (e) {
    var flags = e.flags.slice().sort(function (a, b) { return SFM_CHECKS.indexOf(SFM_CHECK[a]) - SFM_CHECKS.indexOf(SFM_CHECK[b]); });
    return '<tr class="click sfm-row' + (e.open ? ' sfm-row-open' : '') + '" tabindex="0" data-act="sfm-open" data-v="' + e.i + '"><td class="sfm-ref">' + esc(e.ref) + '</td><td class="sfm-date">' + esc(sfmNiceDate(e.intake)) + '</td>' +
      '<td><b>' + esc(e.municipality || '—') + '</b><small>' + esc(e.barangay || e.level || '') + '</small></td>' +
      '<td>' + (e.type ? '<span class="sfm-type sfm-type-' + e.type.toLowerCase() + '">Type ' + e.type + '</span>' : '—') + '<small>' + esc(e.eodb) + '</small></td>' +
      '<td class="sfm-concern"><b>' + esc(e.category || 'No category') + '</b><small>' + esc(sfmText(e.narrative).slice(0, 120)) + (sfmText(e.narrative).length > 120 ? '…' : '') + '</small></td>' +
      '<td><span class="pill ' + (e.open ? (e.flags.indexOf('overdue') !== -1 ? 'bad' : 'warn') : 'good') + '">' + esc(e.status) + '</span>' + (e.open && e.age !== null ? '<small>' + n(e.age) + ' working days</small>' : '') + '</td>' +
      '<td class="sfm-flags">' + (flags.length ? flags.slice(0, 3).map(function (id) { return '<span class="sfm-flag sfm-sev-' + SFM_CHECK[id].sev + '">' + esc(SFM_CHECK[id].short) + '</span>'; }).join('') + (flags.length > 3 ? '<span class="sfm-flag sfm-more">+' + (flags.length - 3) + '</span>' : '') : '<span class="muted">—</span>') + '</td></tr>';
  }).join('');
  var pager = pages > 1 ? '<div class="sfm-pager"><button type="button" class="btn ghost btn-sm" data-act="sfm-page" data-v="-1"' + (SFM_UI.page ? '' : ' disabled') + '>← Previous</button><span class="tiny muted">Page ' + (SFM_UI.page + 1) + ' of ' + pages + '</span>' +
    '<button type="button" class="btn ghost btn-sm" data-act="sfm-page" data-v="1"' + (SFM_UI.page < pages - 1 ? '' : ' disabled') + '>Next →</button></div>' : '';
  return count + '<div class="table-wrap sfm-wrap"><table class="grid sfm-table"><thead><tr><th>Ref</th><th>Intake</th><th>Municipality · Barangay</th><th>Type · EODB</th><th>Concern</th><th>Status</th><th>Findings</th></tr></thead><tbody>' + body + '</tbody></table></div>' + pager;
}
function sfmSelect(key, label, options, value) {
  return '<label class="field"><span>' + esc(label) + '</span><select data-act="sfm-f" data-k="' + key + '">' + options.map(function (o) { return movOption(o[0], o[1], value === o[0]); }).join('') + '</select></label>';
}
function sfmEntries(data) {
  var f = SFM_UI.f, places = [['', 'All municipalities']];
  sfmGroups(data, 'municipality').forEach(function (g) { if (g.n) places.push([g.key, g.name + ' (' + n(g.n) + ')']); });
  var checks = [['', 'All entries'], ['attention', 'Needs attention (open or to fix)'], ['act', SFM_SEV.act], ['fix', SFM_SEV.fix], ['review', SFM_SEV.review]]
    .concat(data.checks.filter(function (c) { return c.count; }).map(function (c) { return [c.id, '  ' + c.label + ' (' + n(c.count) + ')']; }));
  return '<div class="sfm-filters">' + (data.home ? '' : sfmSelect('muni', 'Municipality', places, f.muni)) +
    sfmSelect('flag', 'Finding', checks, f.flag) +
    sfmSelect('status', 'Status', [['', 'Any status'], ['open', 'Open'], ['resolved', 'Resolved']], f.status) +
    sfmSelect('type', 'Type', [['', 'Any type'], ['A', 'Type A'], ['B', 'Type B'], ['C', 'Type C']], f.type) +
    sfmSelect('sort', 'Order', [['flags', 'Needs attention first'], ['new', 'Newest intake first'], ['old', 'Oldest intake first']], SFM_UI.sort) + '</div>' +
    '<div id="sfm-list">' + sfmEntriesBody(data) + '</div>';
}
function sfmPlaces(data) {
  var by = data.home ? 'barangay' : 'municipality', groups = sfmGroups(data, by), province = null, total = { n: 0, open: 0, bc: 0, noDate: 0, fix: 0, dup: 0 };
  var cell = function (v, cls) { return '<td class="num">' + (v ? '<span class="' + (cls || '') + '">' + n(v) + '</span>' : '<span class="muted">0</span>') + '</td>'; };
  var body = groups.map(function (g) {
    ['n', 'open', 'bc', 'noDate', 'fix', 'dup'].forEach(function (k) { total[k] += g[k]; });
    var head = '';
    var band = g.monitored ? g.province : '(off the list)';
    if (by === 'municipality' && band !== province) { province = band; head ='<tr class="sfm-prov"><th colspan="9">' + esc(g.monitored ? g.province : 'Not on the monitored list') + '</th></tr>'; }
    if (!g.n) return head + '<tr class="sfm-silent"><td class="sfm-name">' + esc(g.name) + '</td><td colspan="8"><span class="pill idle">No entries in this file</span></td></tr>';
    return head + '<tr class="click" tabindex="0" data-act="sfm-place" data-k="' + (by === 'barangay' ? 'barangay' : 'muni') + '" data-v="' + attr(g.key) + '"><td class="sfm-name">' + esc(g.name) + '</td>' +
      '<td class="num"><b>' + n(g.n) + '</b></td>' + (by === 'municipality' ? '<td class="num">' + n(g.barangayCount) + '</td>' : '') + cell(g.open, 'sfm-num-bad') + cell(g.bc, 'sfm-num-review') +
      '<td class="num">' + (g.noDate ? '<span class="sfm-num-warn">' + n(g.noDate) + '</span> <small class="muted">' + Math.round(g.noDate / g.n * 100) + '%</small>' : '<span class="muted">0</span>') + '</td>' +
      cell(g.fix, 'sfm-num-warn') + cell(g.dup, 'sfm-num-review') + '<td class="num">' + (g.medianLag === null ? '—' : n(g.medianLag)) + '</td><td class="sfm-date">' + esc(sfmNiceDate(g.latest)) + '</td></tr>';
  }).join('');
  return '<div class="table-wrap sfm-wrap"><table class="grid sfm-table sfm-places"><thead><tr><th>' + (by === 'barangay' ? 'Barangay' : 'Municipality') + '</th><th class="num">Entries</th>' + (by === 'municipality' ? '<th class="num" title="Barangays named in at least one entry">Barangays</th>' : '') +
    '<th class="num">Open</th><th class="num">Type B/C</th><th class="num" title="Resolved entries whose Date Addressed is blank or wrong">No date addressed</th><th class="num" title="Entries with at least one record gap">To fix</th><th class="num">Possible duplicates</th>' +
    '<th class="num" title="Median calendar days from date of intake to date encoded">Days to encode</th><th>Latest intake</th></tr></thead><tbody>' + body + '</tbody>' +
    '<tfoot><tr class="total"><td class="sfm-name">Total</td><td class="num">' + n(total.n) + '</td>' + (by === 'municipality' ? '<td></td>' : '') + '<td class="num">' + n(total.open) + '</td><td class="num">' + n(total.bc) + '</td><td class="num">' + n(total.noDate) + '</td><td class="num">' + n(total.fix) + '</td><td class="num">' + n(total.dup) + '</td><td class="num">' + (data.summary.medianLag === null ? '—' : n(data.summary.medianLag)) + '</td><td></td></tr></tfoot></table></div>' +
    '<p class="tiny muted">Select a row to list its entries. A place with no entries has none encoded in this file; that is not a report that no feedback was received.</p>';
}

function renderSfm() {
  var body = $('sfm-body');
  if (!body) return;
  sfmRestore();
  if (!LOADED.sfm || !TABS.Raw_SFM) {
    body.innerHTML = '<h1 class="sr-only">Stakeholders Feedback Mechanism</h1><div class="msg info sfm-empty">' + icon('info') + ' <div><strong>No SFM Masterlist loaded.</strong> Export the Stakeholders Feedback Mechanism Masterlist from KCIS and drop it in ' +
      '<button type="button" class="link" data-act="sfm-import">Settings &amp; Setup › Data Import</button>. It is read on this PC only.</div></div>';
    return;
  }
  if (isMunicipalUser() && !homeKey()) { body.innerHTML = '<div class="msg info">Choose your municipality in Settings &amp; Setup to see its SFM entries.</div>'; return; }
  var data = sfmData(), view = SFM_UI.view, placeLabel = data.home ? 'Barangays' : 'Municipalities';
  var tabs = [['overview', 'Overview', 'gauge'], ['entries', 'Entries', 'list-checks'], ['places', placeLabel, 'building-2']].map(function (t) {
    var on = view === t[0];
    return '<button type="button" role="tab" class="sub-nav-btn' + (on ? ' active' : '') + '" data-act="sfm-view" data-v="' + t[0] + '" aria-selected="' + on + '">' + icon(t[2]) + '<span>' + esc(t[1]) + (t[0] === 'entries' ? ' <b class="sfm-tab-n">' + n(data.entries.length) + '</b>' : '') + '</span></button>';
  }).join('');
  var search = view === 'entries' ? '<label class="field psearch"><span class="sr-only">Find an entry</span><input id="sfm-search" type="search" value="' + attr(SFM_UI.q) + '" placeholder="Find a reference, name, place or word…" aria-label="Find an entry"></label>' : '';
  body.innerHTML = '<h1 class="sr-only">Stakeholders Feedback Mechanism, ' + n(data.entries.length) + ' entries</h1>' +
    '<div class="profile-controls profile-tabbar pdir-tabbar sfm-tabbar"><div class="sub-nav-tabs" role="tablist" aria-label="SFM view">' + tabs + '</div><div class="row-actions">' + search +
    '<span class="tiny muted sfm-asof">' + esc(data.home ? homeLabel() + ' · ' : '') + 'as of ' + esc(sfmNiceDate(data.asOf)) + '</span><button type="button" class="btn ghost btn-sm" data-act="sfm-export">' + icon('download') + ' <span>Export</span></button></div></div>' +
    (view === 'entries' ? sfmEntries(data) : view === 'places' ? sfmPlaces(data) : sfmOverview(data));
  refreshIcons(body);
}

function sfmOpenEntry(index) {
  var data = sfmData(), e = data && data.entries.filter(function (x) { return x.i === index; })[0], dlg = $('sfm-dialog');
  if (!e || !dlg) return;
  var line = function (label, value) { return value === '' || value === null || value === undefined ? '' : '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>'; };
  var flags = e.flags.slice().sort(function (a, b) { return SFM_CHECKS.indexOf(SFM_CHECK[a]) - SFM_CHECKS.indexOf(SFM_CHECK[b]); });
  $('sfm-dialog-body').innerHTML = '<div class="dialog-head"><div><h2>Entry ' + esc(e.ref) + ' <span class="pill ' + (e.open ? 'warn' : 'good') + '">' + esc(e.status) + '</span></h2>' +
    '<div class="tiny">' + esc([e.nature, e.eodb, e.form].filter(Boolean).join(' · ')) + ' · row ' + n(e.row) + ' of the export</div></div>' +
    '<button class="btn ghost icon-btn" value="close" aria-label="Close dialog" title="Close (Esc)">' + icon('x') + '</button></div>' +
    '<div class="sfm-dialog-main">' + (flags.length ? '<ul class="sfm-todo">' + flags.map(function (id) { var c = SFM_CHECK[id]; return '<li class="sfm-sev-' + c.sev + '"><strong>' + esc(c.label) + '</strong><span>' + esc(c.todo) +
      (id === 'duplicate' ? ' Same as: ' + esc(e.dup.slice(0, 8).join(', ')) + (e.dup.length > 8 ? ' and ' + (e.dup.length - 8) + ' more' : '') + '.' : '') +
      (id === 'overdue' ? ' Open for ' + n(e.age) + ' working days; ' + esc(e.eodb) + ' allows ' + e.limit + '.' : '') + '</span></li>'; }).join('') + '</ul>' : '<p class="sfm-clear">' + icon('check-circle-2') + ' Nothing to fix on this entry.</p>') +
    '<div class="sfm-detail"><section><h3>Concern</h3><p class="sfm-prose">' + esc(e.narrative || '—') + '</p><h3>Resolution</h3><p class="sfm-prose">' + esc(e.resolution || '—') + '</p></section>' +
    '<dl class="sfm-facts">' + line('Date of intake', sfmNiceDate(e.intake)) + line('Date addressed', e.addressed ? sfmNiceDate(e.addressed) : e.addressedRaw || 'Blank') +
    line('Working days to resolve', e.days === null ? '' : e.days) + line('Place', [e.barangay, e.municipality, e.province].filter(Boolean).join(', ')) + line('Intake level', e.level) + line('Mode of filing', e.filing) +
    line('Category of concern', e.category) + line('Subject of complaint', e.subject) + line('Sender', [e.complainant, e.sex, e.senderType].filter(Boolean).join(' · ')) + line('Designation', [e.designation, e.organization].filter(Boolean).join(' · ')) +
    line('IP', e.ip ? 'Yes' + (e.ipGroup ? ' · ' + e.ipGroup : '') : '') + line('Feedback', e.feedback) + line('Intake officer', e.officer) + line('Encoded', [e.encodedRaw, e.encodedBy].filter(Boolean).join(' · ')) +
    line('Days from intake to encoding', e.lag === null ? '' : e.lag) + '</dl></div></div>';
  if (typeof openModalAnimated === 'function') openModalAnimated(dlg); else dlg.showModal();
}
function sfmExport() {
  var data = sfmData();
  if (!data) return;
  var sheets = sfmExportSheets(data), name = 'PCRP_SFM_' + (data.home ? data.home.split('|')[1].replace(/[^A-Za-z0-9]+/g, '_') + '_' : 'Regional_') + stamp() + '.xlsx';
  saveBlob(makeXlsx(sheets), name);
  toast('Saved ' + name + '. It holds names: keep it under the Data Privacy Act.');
}

document.addEventListener('click', function (event) {
  var el = event.target.closest && event.target.closest('[data-act^="sfm-"]');
  if (!el) return;
  var act = el.getAttribute('data-act'), v = el.getAttribute('data-v');
  if (act === 'sfm-view') { SFM_UI.view = v; SFM_UI.page = 0; sfmPersist(); renderSfm(); }
  else if (act === 'sfm-import') go('settings');
  else if (act === 'sfm-flag') sfmShow({ flag: v });
  else if (act === 'sfm-status') sfmShow({ status: v });
  else if (act === 'sfm-pick') sfmShow({ field: el.getAttribute('data-k'), value: v });
  else if (act === 'sfm-place') { var f = {}; f[el.getAttribute('data-k')] = v; sfmShow(f); }
  else if (act === 'sfm-unfilter') { if (v === 'field') { SFM_UI.f.field = ''; SFM_UI.f.value = ''; } else SFM_UI.f[v] = ''; SFM_UI.page = 0; renderSfm(); }
  else if (act === 'sfm-clear') { sfmClearFilters(); renderSfm(); }
  else if (act === 'sfm-page') { SFM_UI.page += Number(v); var list = $('sfm-list'); if (list) { list.innerHTML = sfmEntriesBody(sfmData()); refreshIcons(list); } window.scrollTo(0, 0); }
  else if (act === 'sfm-open') sfmOpenEntry(Number(v));
  else if (act === 'sfm-export') sfmExport();
});
document.addEventListener('keydown', function (event) {
  if (event.key !== 'Enter' || !event.target.matches || !event.target.matches('tr[data-act^="sfm-"]')) return;
  event.target.click();
});
document.addEventListener('change', function (event) {
  var el = event.target;
  if (!el.getAttribute || el.getAttribute('data-act') !== 'sfm-f') return;
  var k = el.getAttribute('data-k');
  if (k === 'sort') SFM_UI.sort = el.value; else SFM_UI.f[k] = el.value;
  SFM_UI.page = 0; renderSfm();
});
document.addEventListener('input', function (event) {
  if (event.target.id !== 'sfm-search') return;
  SFM_UI.q = event.target.value; SFM_UI.page = 0;
  var list = $('sfm-list');
  if (list) list.innerHTML = sfmEntriesBody(sfmData());
});
