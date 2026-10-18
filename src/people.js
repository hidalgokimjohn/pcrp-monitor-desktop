// ===================================================================
// PEOPLE — who is behind the numbers: attendees, household roster,
// volunteers and committees, with a profile for any name.
//
// Rows are matched to barangays and activities with the monitor's own
// functions (buildColumnIndex, classify, buildBaseline, volunteerColumnIndex,
// cvCommitteeKind), so a person counted on the other pages is the person
// listed here. Names are compared after normAlpha (case, spacing,
// punctuation, accents). Everything stays on this computer.
// ===================================================================

var PEOPLE = null;      // the index, rebuilt after every computation
var PSTATE = { view: 'attendees', scope: 'home', brgy: '', act: '', body: '', flag: 'all', search: '', limit: 100, sortCol: 0, sortDir: 'asc' };
var PEOPLE_PAGE = 100;

function personName(first, middle, last) {
  return [first, middle, last].map(normText).filter(Boolean).join(' ');
}
function personKey(first, middle, last) {
  var f = normAlpha(first), l = normAlpha(last);
  return f || l ? f + ' ' + normAlpha(middle) + ' ' + l : '';
}
function looseKey(first, last) {
  var f = normAlpha(first), l = normAlpha(last);
  return f && l ? f + ' ' + l : '';
}

/** Index every named row of the three exports, matched to a monitored barangay. */
function buildPeopleIndex() {
  var acts = readActivities(), index = buildActivityIndex(acts), bl = readBaseline();
  var base = buildBaseline(bl.rows, bl.monitored);
  var actByCode = {};
  acts.forEach(function (a) { actByCode[a.code] = a; });
  var muniByKey = {}, muniNoProv = {};
  base.muniList.forEach(function (m) {
    var k = normKey(m.province) + '|' + normKey(m.municipality);
    muniByKey[k] = m;
    muniNoProv['|' + normKey(m.municipality)] = muniNoProv.hasOwnProperty('|' + normKey(m.municipality)) ? null : m;
  });

  function brgyOf(row, C) {
    var psgc = C.psgcBrgy !== undefined && hasValue(row[C.psgcBrgy]) ? normKey(row[C.psgcBrgy]) : '';
    if (psgc && base.psgcToBrgy[psgc]) return base.psgcToBrgy[psgc];
    var pk = normKey(row[C.province]), mk = normKey(row[C.muni]), bk = normKey(row[C.brgy]);
    return base.brgyRowByKey[pk + '|' + mk + '|' + bk] || base.brgyNoProv['|' + mk + '|' + bk] || null;
  }
  function muniOf(row, C) {
    var pc = C.psgcCity !== undefined && hasValue(row[C.psgcCity]) ? normKey(row[C.psgcCity]) : '';
    if (pc && base.psgcCityToMuni[pc]) return base.psgcCityToMuni[pc];
    var pk = normKey(row[C.province]), mk = normKey(row[C.muni]);
    return muniByKey[pk + '|' + mk] || muniNoProv['|' + mk] || null;
  }
  var dateMemo = {};
  function dateOf(v) {
    if (!hasValue(v)) return '';
    var k = typeof v + ':' + v;
    if (dateMemo[k] === undefined) dateMemo[k] = formatDateVal(v) || normText(v);
    return dateMemo[k];
  }
  function place(p, brgy) {
    return { province: p.province, municipality: p.municipality, barangay: brgy || '' };
  }

  var out = { attendees: [], households: [], volunteers: [], mrest: [], unmatched: { attendees: 0, households: 0, volunteers: 0 } };

  // ---- attendees (participants export) ----
  var P = readRawTable(SHEETS.PARTICIPANTS), CP = buildColumnIndex(P.headers, P_DEFAULT);
  P.rows.forEach(function (row) {
    if (!hasValue(row[0])) return;
    var rawAct = CP.activityId !== undefined ? row[CP.activityId] : null;
    if (isZeroActivityId(rawAct)) return;
    var code = classify(index, row[CP.seq], row[CP.name], CP.title !== undefined ? row[CP.title] : null);
    if (!code) return;
    var a = actByCode[code], municipal = a.level === 'Municipal';
    var p = municipal ? muniOf(row, CP) : brgyOf(row, CP);
    if (!p) { out.unmatched.attendees++; return; }
    var first = row[CP.first], middle = row[CP.middle], last = row[CP.last];
    var key = personKey(first, middle, last);
    var r = place(p, municipal ? '' : p.barangay);
    r.type = 'attendee'; r.act = code; r.seq = a.seq; r.actLabel = a.label; r.municipal = municipal;
    r.name = personName(first, middle, last); r.key = key; r.loose = looseKey(first, last);
    r.sex = normText(row[CP.sex]).toLowerCase();
    r.date = CP.dateEnd !== undefined ? dateOf(row[CP.dateEnd]) || dateOf(row[CP.dateStart]) : '';
    r.title = CP.title !== undefined ? normText(row[CP.title]) : '';
    out.attendees.push(r);
  });

  // ---- household roster ----
  var H = readRawTable(SHEETS.HOUSEHOLDS), CH = buildColumnIndex(H.headers, H_DEFAULT);
  H.rows.forEach(function (row) {
    if (!hasValue(row[0])) return;
    var rawAct = CH.activityId !== undefined ? row[CH.activityId] : null;
    if (isZeroActivityId(rawAct)) return;
    var code = classify(index, null, row[CH.name], CH.title !== undefined ? row[CH.title] : null);
    if (!code || !actByCode[code].households || !normKey(row[CH.brgy])) return;
    var p = brgyOf(row, CH);
    if (!p) { out.unmatched.households++; return; }
    var first = row[CH.first], middle = row[CH.middle], last = row[CH.last];
    var hasAny = hasValue(first) || hasValue(middle) || hasValue(last) || hasValue(row[CH.sex]) || hasValue(row[CH.present]);
    if (!hasAny) return;
    var r = place(p, p.barangay);
    r.type = 'household'; r.act = code; r.actLabel = actByCode[code].label;
    r.name = personName(first, middle, last); r.key = personKey(first, middle, last); r.loose = looseKey(first, last);
    r.sex = normText(row[CH.sex]).toLowerCase();
    r.birthdate = CH.birthdate !== undefined && hasValue(row[CH.birthdate]) ? (birthdateIso(row[CH.birthdate]) || normText(row[CH.birthdate])) : '';   // day numbers before 1954 too
    r.head = CH.isHead !== undefined && isTrue(row[CH.isHead]);
    r.present = isTrue(row[CH.present]);
    out.households.push(r);
  });

  // ---- volunteers ----
  var V = readRawTable(SHEETS.VOLUNTEERS);
  if (V.rows.length) {
    var CV = volunteerColumnIndex(V.headers);
    V.rows.forEach(function (row) {
      if (!row.some(function (v) { return hasValue(v); })) return;
      var p = brgyOf(row, CV);
      if (!p) { out.unmatched.volunteers++; return; }
      var first = row[CV.first], middle = row[CV.middle], last = row[CV.last];
      var kind = cvCommitteeKind(row[CV.committee]);
      var r = place(p, p.barangay);
      r.type = 'volunteer'; r.kind = kind;
      r.committee = normText(row[CV.committee]);
      r.body = kind === 'BREST' ? 'BResT' : kind === 'SFMSC' ? 'SFMSC' : '';
      r.position = normText(row[CV.position]);
      r.chair = /^chair/i.test(normAlpha(row[CV.position]));
      r.name = personName(first, middle, last); r.key = personKey(first, middle, last); r.loose = looseKey(first, last);
      r.sex = normText(row[CV.sex]).toLowerCase();
      r.ip = CV.ip !== undefined && isTrue(row[CV.ip]);
      r.pwd = CV.pwd.some(function (i) { return isTrue(row[i]); });
      r.fisher = CV.fisher !== undefined && (isTrue(row[CV.fisher]) || Number(row[CV.fisher]) > 0);
      r.start = CV.start !== undefined ? dateOf(row[CV.start]) : '';
      out.volunteers.push(r);
    });
  }

  // ---- mrest (Municipal Resilience Team) ----
  out.mrest = (typeof vfMrestRows === 'function' ? vfMrestRows() : []) || [];

  // ---- cross-references ------------------------------------------------------------
  var bk = function (r) { return r.province + '|' + r.municipality + '|' + (r.barangay || ''); };
  var ba1 = {};                       // barangay -> names among 1st BA attendees (full and first+last)
  out.attendees.forEach(function (a) {
    if (a.act !== 'BA1' || !a.key) return;
    var s = ba1[bk(a)] = ba1[bk(a)] || {};
    s[a.key] = true; if (a.loose) s['~' + a.loose] = true;
  });
  var inBa1 = function (r) { var s = ba1[bk(r)]; return !!s && (!!s[r.key] || (r.loose && !!s['~' + r.loose])); };
  var same = {}, heads = {}, vols = {};
  out.households.forEach(function (h) {
    if (!h.key) return;
    var k = bk(h) + '|' + h.act + '|' + h.key + '|' + h.birthdate;
    same[k] = (same[k] || 0) + 1;
    if (h.head) (heads[h.key] = heads[h.key] || {})[bk(h)] = true;
  });
  out.volunteers.forEach(function (v) { if (v.key) (vols[v.key] = vols[v.key] || []).push(v); });

  out.attendees.forEach(function (a) {
    a.flags = [];
    if (!a.key) a.flags.push('noname');
    if (a.key && vols[a.key] && vols[a.key].some(function (v) { return bk(v) === bk(a); })) a.flags.push('volunteer');
  });
  out.households.forEach(function (h) {
    h.flags = [];
    if (!h.key) { h.flags.push('noname'); return; }
    if (same[bk(h) + '|' + h.act + '|' + h.key + '|' + h.birthdate] > 1) h.flags.push('twice');
    if (h.head && heads[h.key] && Object.keys(heads[h.key]).length > 1) h.flags.push('otherbrgy');
    // The roster names the head; any member may have attended, so this is a note, not a problem.
    if (h.act === 'BA1' && h.present && !inBa1(h)) h.flags.push('headnotattendee');
  });
  out.volunteers.forEach(function (v) {
    v.flags = [];
    if (!v.key) { v.flags.push('noname'); return; }
    if (v.kind === 'NONE') v.flags.push('nocommittee');
    else if (v.kind !== 'BREST' && v.kind !== 'SFMSC') v.flags.push('otherbody');
    // Only a real check where the barangay's 1st BA attendance is encoded at all.
    if (!ba1[bk(v)]) v.flags.push('noba1');
    else if (!inBa1(v)) v.flags.push('notattendee');
    if (v.sex !== 'male' && v.sex !== 'female') v.flags.push('nosex');
  });
  out.mrest.forEach(function (m) {
    m.flags = [];
    if (!m.key) m.flags.push('noname');
    if (m.sex !== 'male' && m.sex !== 'female') m.flags.push('nosex');
  });

  // search text, computed once
  ['attendees', 'households', 'volunteers', 'mrest'].forEach(function (k) {
    (out[k] || []).forEach(function (r) {
      r.q = normSearch([r.name, r.barangay, r.municipality, r.actLabel, r.committee, r.position].filter(Boolean).join(' '));
    });
  });

  // name -> records, for profiles
  out.byKey = {}; out.byLoose = {};
  ['attendees', 'households', 'volunteers', 'mrest'].forEach(function (k) {
    (out[k] || []).forEach(function (r) {
      if (r.key) (out.byKey[r.key] = out.byKey[r.key] || []).push(r);
      if (r.loose) (out.byLoose[r.loose] = out.byLoose[r.loose] || []).push(r);
    });
  });
  return out;
}

function people() {
  if (!PEOPLE) {
    var t0 = Date.now();
    PEOPLE = buildPeopleIndex();
    PEOPLE.ms = Date.now() - t0;
  }
  return PEOPLE;
}

// ---- views --------------------------------------------------------------------------

// ---- views & flags ------------------------------------------------------------------

var PEOPLE_FLAGS = {
  attendees: [
    { id: 'all', label: 'All Attendees' },
    { id: 'volunteer', label: 'Also a Volunteer here' },
    { id: 'noname', label: 'No name recorded' }
  ],
  households: [
    { id: 'all', label: 'All Roster' },
    { id: 'head', label: 'Household Heads', test: function (r) { return r.head; } },
    { id: 'present', label: 'Marked Present', test: function (r) { return r.present; } },
    { id: 'absent', label: 'Not Present', test: function (r) { return !r.present; } },
    { id: 'headnotattendee', label: 'Present, Head not in Attendees' },
    { id: 'twice', label: 'Listed twice' },
    { id: 'otherbrgy', label: 'Head in another barangay' },
    { id: 'noname', label: 'No name recorded' }
  ],
  volunteers: [
    { id: 'all', label: 'All Volunteers' },
    { id: 'BREST', label: 'BResT', test: function (r) { return r.kind === 'BREST'; } },
    { id: 'SFMSC', label: 'SFMSC', test: function (r) { return r.kind === 'SFMSC'; } },
    { id: 'chair', label: 'Chairpersons', test: function (r) { return r.chair; } },
    { id: 'women', label: 'Women', test: function (r) { return r.sex === 'female'; } },
    { id: 'ippwd', label: 'IP or PWD', test: function (r) { return r.ip || r.pwd; } },
    { id: 'notattendee', label: 'Not among 1st BA attendees' },
    { id: 'noba1', label: '1st BA attendance not encoded' },
    { id: 'nocommittee', label: 'No committee' },
    { id: 'otherbody', label: 'Other activity committee' },
    { id: 'nosex', label: 'Sex not recorded' }
  ]
};

var FLAG_TEXT = {
  noname: ['bad', 'No name'], volunteer: ['good', 'Volunteer'], twice: ['warn', 'Listed twice'],
  otherbrgy: ['warn', 'Head in another barangay'], notattendee: ['warn', 'Not among 1st BA attendees'],
  headnotattendee: ['idle', 'Head not among attendees'],
  noba1: ['idle', '1st BA attendance not encoded yet'],
  nocommittee: ['warn', 'No committee'], otherbody: ['warn', 'Other activity\'s committee'], nosex: ['idle', 'Sex not recorded']
};

function pScopeTest(overrideMuni) {
  if (typeof isMunicipalUser === 'function' && isMunicipalUser()) {
    var key = homeKey();
    return function (r) { return r && (r.province + '|' + r.municipality === key); };
  }
  var target = overrideMuni || '';
  if (target) return function (r) { return r && (r.province + '|' + r.municipality === target); };
  if (typeof STATE !== 'undefined' && STATE.prov) {
    return function (r) { return r && (r.province === STATE.prov); };
  }
  return function () { return true; };
}

function flagPills(r) {
  return (r.flags || []).map(function (f) { var t = FLAG_TEXT[f]; return t ? '<span class="pill ' + t[0] + '">' + esc(t[1]) + '</span>' : ''; }).join(' ');
}
function nameCell(r) {
  if (!r.key) return '<span class="tiny">(no name)</span>';
  return '<button class="link" data-act="person" data-v="' + attr(r.key) + '">' + esc(r.name) + '</button>';
}
function placeCell(r) {
  return esc(r.barangay || '— municipal —') + (isRegionalUser() ? '<div class="tiny">' + esc(r.municipality) + '</div>' : '');
}
function yesNo(v) { return v ? '<span class="pill good">Yes</span>' : '<span class="tiny">No</span>'; }

// Module state trackers
var ATT_STATE = { muni: '', brgy: '', act: '', sex: 'all', flag: 'all', search: '', limit: 100, sortCol: 'name', sortDir: 'asc' };
var HH_STATE = { tab: 'scorecard', muni: '', brgy: '', quorum: 'all', flag: 'all', search: '', limit: 100, sortCol: 'brgy', sortDir: 'asc' };
var VOL_STATE = { muni: '', brgy: '', body: 'all', position: 'all', sex: 'all', marg: 'all', flag: 'all', search: '', limit: 100, sortCol: 'name', sortDir: 'asc' };
var BRT_STATE = { muni: '', brgy: '', status: 'all', search: '', sortCol: 'brgy', sortDir: 'asc' };
var MRT_STATE = { muni: '', search: '', sortCol: 'name', sortDir: 'asc' };
var PSTATE = { view: 'attendees', scope: 'home', brgy: '', act: '', body: '', flag: 'all', search: '', limit: 100, sortCol: 0, sortDir: 'asc' };

// ===================================================================
// MODULE 1: ATTENDEES (Activity Attendance Tracking)
// ===================================================================

function renderAttendees() {
  var body = $('att-body');
  if (!body) return;
  if (!STATE.computed) { body.innerHTML = '<div class="card"><p class="muted">Load the participants export first.</p></div>'; return; }
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (ATT_STATE.muni || key || '');
  var inScope = pScopeTest(activeMuni);
  var list = P.attendees.filter(inScope);

  // Municipalities dropdown (for RPMO)
  var munis = baselineMunis();
  var mOpts = '<option value="">All Municipalities</option>';
  munis.forEach(function (m) {
    var v = m.province + '|' + m.municipality;
    mOpts += '<option value="' + attr(v) + '"' + (activeMuni === v ? ' selected' : '') + '>' + esc(m.municipality) + ' (' + esc(m.province) + ')</option>';
  });

  // Barangays in scope
  var brgys = (SNAP.barangayRows || []).filter(function (b) { return !activeMuni || b.province + '|' + b.municipality === activeMuni; })
    .sort(function (a, b) { return a.municipality.localeCompare(b.municipality) || a.barangay.localeCompare(b.barangay); });
  var bOpts = '<option value="">All Barangays</option>' + brgys.map(function (b) {
    var v = b.province + '|' + b.municipality + '|' + b.barangay;
    return '<option value="' + attr(v) + '"' + (ATT_STATE.brgy === v ? ' selected' : '') + '>' + esc(b.barangay) + (!activeMuni ? ' (' + esc(b.municipality) + ')' : '') + '</option>';
  }).join('');

  // Activities in scope
  var acts = (S.overview.activities || []).slice();
  var actOpts = '<option value="">All Activities</option>' + acts.map(function (a) {
    return '<option value="' + attr(a.code) + '"' + (ATT_STATE.act === a.code ? ' selected' : '') + '>Seq ' + esc(a.seq) + ' · ' + esc(a.label) + '</option>';
  }).join('');

  // Filtering
  var q = normSearch(ATT_STATE.search.trim());
  var filtered = list.filter(function (r) {
    if (ATT_STATE.brgy && (r.province + '|' + r.municipality + '|' + r.barangay !== ATT_STATE.brgy)) return false;
    if (ATT_STATE.act && r.act !== ATT_STATE.act) return false;
    if (ATT_STATE.sex !== 'all' && r.sex !== ATT_STATE.sex) return false;
    if (ATT_STATE.flag === 'volunteer' && r.flags.indexOf('volunteer') === -1) return false;
    if (ATT_STATE.flag === 'noname' && r.flags.indexOf('noname') === -1) return false;
    if (q && r.q.indexOf(q) === -1) return false;
    return true;
  });

  // KPIs
  var totalEncoded = list.length;
  var womenCount = list.filter(function (r) { return r.sex === 'female'; }).length;
  var uniqueNames = {};
  list.forEach(function (r) { if (r.key) uniqueNames[r.key] = true; });
  var uniqueCount = Object.keys(uniqueNames).length;
  var coveredActs = {};
  list.forEach(function (r) { coveredActs[r.act] = true; });

  // Sorting
  var curCol = ATT_STATE.sortCol || 'name';
  var curDir = ATT_STATE.sortDir || 'asc';
  var extractors = {
    name: function (r) { return r.name; },
    sex: function (r) { return r.sex; },
    brgy: function (r) { return r.barangay || 'Municipal level'; },
    muni: function (r) { return r.municipality; },
    act: function (r) { return r.seq || 0; },
    date: function (r) { return r.date || ''; },
    flags: function (r) { return (r.flags || []).join(' '); }
  };
  var sorted = tblSort(filtered, curCol, curDir, extractors);
  var shown = sorted.slice(0, ATT_STATE.limit);

  var rowsHtml = shown.map(function (r) {
    return '<tr>' +
      '<td>' + nameCell(r) + '</td>' +
      '<td>' + esc(r.sex || '—') + '</td>' +
      '<td>' + placeCell(r) + '</td>' +
      (!isMuni ? '<td>' + esc(r.municipality) + '</td>' : '') +
      '<td><span class="tiny">Seq ' + esc(r.seq) + '</span> <strong>' + esc(r.actLabel) + '</strong></td>' +
      '<td>' + esc(r.date || '—') + '</td>' +
      '<td>' + flagPills(r) + '</td>' +
    '</tr>';
  }).join('');

  var th = function (col, label, num) {
    return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, act: 'att-sort' });
  };

  var baseForSex = list.filter(function (r) {
    if (ATT_STATE.brgy && (r.province + '|' + r.municipality + '|' + r.barangay !== ATT_STATE.brgy)) return false;
    if (ATT_STATE.act && r.act !== ATT_STATE.act) return false;
    if (ATT_STATE.flag === 'volunteer' && r.flags.indexOf('volunteer') === -1) return false;
    if (ATT_STATE.flag === 'noname' && r.flags.indexOf('noname') === -1) return false;
    if (q && r.q.indexOf(q) === -1) return false;
    return true;
  });

  var sexCards = ['all', 'female', 'male'].map(function (s) {
    var cnt = s === 'all' ? baseForSex.length : baseForSex.filter(function (r) { return r.sex === s; }).length;
    var lbl = s === 'all' ? 'All Sexes' : (s === 'female' ? 'Women' : 'Men');
    return '<button type="button" class="filter-card' + (ATT_STATE.sex === s ? ' active' : '') + '" data-act="att-sex" data-v="' + s + '">' +
      '<span class="fc-label">' + esc(lbl) + '</span>' +
      '<span class="fc-count">' + n(cnt) + '</span>' +
    '</button>';
  }).join('');

  var baseForFlag = list.filter(function (r) {
    if (ATT_STATE.brgy && (r.province + '|' + r.municipality + '|' + r.barangay !== ATT_STATE.brgy)) return false;
    if (ATT_STATE.act && r.act !== ATT_STATE.act) return false;
    if (ATT_STATE.sex !== 'all' && r.sex !== ATT_STATE.sex) return false;
    if (q && r.q.indexOf(q) === -1) return false;
    return true;
  });

  var flagCards = PEOPLE_FLAGS.attendees.map(function (f) {
    var cnt = f.id === 'all' ? baseForFlag.length : baseForFlag.filter(function (r) { return r.flags.indexOf(f.id) !== -1; }).length;
    var col = f.id === 'volunteer' ? 'fc-good' : (f.id === 'noname' ? 'fc-warn' : '');
    return '<button type="button" class="filter-card' + (col ? ' ' + col : '') + (ATT_STATE.flag === f.id ? ' active' : '') + '" data-act="att-flag" data-v="' + f.id + '">' +
      '<span class="fc-label">' + esc(f.label) + '</span>' +
      '<span class="fc-count">' + n(cnt) + '</span>' +
    '</button>';
  }).join('');

  var scopeBanner = isMuni
    ? '<div class="static-val">' + icon('map-pin') + ' <span>Municipality: <strong>' + esc(home().municipality) + '</strong> (' + esc(home().province) + ')</span> <span class="role-badge field">PEA / MDM Scope</span></div>'
    : '<label class="field"><span>Municipality</span><select data-act="att-muni">' + mOpts + '</select></label>';

  var subNav = '<div class="sub-nav-tabs">' +
    '<button type="button" class="sub-nav-btn active">' + icon('calendar-check') + ' <span>Attendees Directory</span></button>' +
    '<button type="button" class="sub-nav-btn" data-go="households">' + icon('home') + ' <span>Household Participation</span></button>' +
  '</div>';

  body.innerHTML = subNav +
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>Activity Attendees Directory</h2>' +
          '<div class="muted">' + (isMuni ? 'Strict PEA / MDM municipal records for <strong>' + esc(home().municipality) + '</strong>.' : 'Region-wide activity attendance records.') + ' Click any name to view their profile across all exports.</div>' +
        '</div>' +
        '<div class="row-actions" style="margin:0"><button class="btn ghost btn-sm" data-act="att-export">' + icon('download') + ' <span>Export Attendees CSV</span></button></div>' +
      '</div>' +
      '<div class="grid-kpi">' +
        '<div class="kpi"><div class="kpi-label">Total Attendees Encoded</div><div class="kpi-value">' + n(totalEncoded) + '</div><div class="kpi-sub">' + n(uniqueCount) + ' unique individuals</div></div>' +
        '<div class="kpi accent-good"><div class="kpi-label">Women Attendees</div><div class="kpi-value">' + pctText(pctOf(womenCount, totalEncoded)) + '</div><div class="kpi-sub">' + n(womenCount) + ' female participants</div></div>' +
        '<div class="kpi"><div class="kpi-label">Activities Encoded</div><div class="kpi-value">' + Object.keys(coveredActs).length + ' <span class="tiny">/ ' + acts.length + '</span></div><div class="kpi-sub">with attendance encoded in KCIS</div></div>' +
      '</div>' +
      '<div class="toolbar-row"><div class="filters" style="margin:0">' +
        scopeBanner +
        '<label class="field"><span>Barangay</span><select data-act="att-brgy">' + bOpts + '</select></label>' +
        '<label class="field"><span>Activity</span><select data-act="att-act">' + actOpts + '</select></label>' +
        '<label class="field" style="flex:1"><span>Search</span><input type="search" id="att-search" value="' + attr(ATT_STATE.search) + '" placeholder="Search attendee name, barangay, activity…"></label>' +
        (ATT_STATE.brgy || ATT_STATE.act || ATT_STATE.sex !== 'all' || ATT_STATE.flag !== 'all' || ATT_STATE.search ? '<button type="button" class="btn ghost btn-sm" data-act="att-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
      '</div><span class="tiny">Showing <strong>' + n(shown.length) + '</strong> of <strong>' + n(sorted.length) + '</strong></span></div>' +
      '<div class="filter-cards">' + sexCards + '<span class="sep" style="margin:0 4px;color:var(--border-strong)">|</span>' + flagCards + '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('name', 'Attendee Name') +
        th('sex', 'Sex') +
        th('brgy', 'Barangay') +
        (!isMuni ? th('muni', 'Municipality') : '') +
        th('act', 'Activity') +
        th('date', 'Date Conducted') +
        th('flags', 'Cross-check Flags') +
      '</tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="10" class="empty-state">No attendee records match these filters.</td></tr>') + '</tbody></table></div>' +
      (shown.length < sorted.length ? '<div class="row-actions" style="margin-top:12px"><button class="btn ghost btn-sm" data-act="att-more">Show ' + Math.min(100, sorted.length - shown.length) + ' more</button><span class="tiny">Showing ' + n(shown.length) + ' of ' + n(sorted.length) + '</span></div>' : '') +
    '</div>';

  bindSearch('att-search', function (v) { ATT_STATE.search = v; ATT_STATE.limit = 100; renderAttendees(); });
}

// ===================================================================
// MODULE 2: HOUSEHOLD PARTICIPATION (K2 Quorum & Roster)
// ===================================================================

function renderHouseholds() {
  var body = $('hh-body');
  if (!body) return;
  if (!STATE.computed) { body.innerHTML = '<div class="card"><p class="muted">Load the households export first.</p></div>'; return; }
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (HH_STATE.muni || key || '');
  var inScope = pScopeTest(activeMuni);
  var brgys = (SNAP.barangayRows || []).filter(function (b) { return !activeMuni || b.province + '|' + b.municipality === activeMuni; });

  // Overall K2 Quorum numbers
  var totListed = 0, totPresent = 0, metCount = 0, reportingCount = 0;
  brgys.forEach(function (b) {
    if (b.hhListed > 0) {
      reportingCount++;
      totListed += b.hhListed;
      totPresent += b.hhPresent;
      if (b.hhRate >= 0.7) metCount++;
    }
  });
  var overallRate = totListed > 0 ? totPresent / totListed : null;

  // View toggle
  var tabsHtml = '<div class="seg-control" role="tablist">' +
    '<button type="button" class="seg-btn' + (HH_STATE.tab === 'scorecard' ? ' active' : '') + '" data-act="hh-tab" data-v="scorecard">' +
      icon('list-checks') + ' <span>Barangay Quorum Scorecard</span> <span class="chip-count">' + brgys.length + '</span></button>' +
    '<button type="button" class="seg-btn' + (HH_STATE.tab === 'roster' ? ' active' : '') + '" data-act="hh-tab" data-v="roster">' +
      icon('users') + ' <span>Household Roster Directory</span> <span class="chip-count">' + P.households.filter(inScope).length + '</span></button>' +
  '</div>';

  var contentHtml = '';
  if (HH_STATE.tab === 'scorecard') {
    // ---- SCORECARD VIEW ----
    var q = normSearch(HH_STATE.search.trim());
    var filteredBrgys = brgys.filter(function (b) {
      if (HH_STATE.quorum === 'met' && (b.hhListed === 0 || b.hhRate < 0.7)) return false;
      if (HH_STATE.quorum === 'below' && (b.hhListed === 0 || b.hhRate >= 0.7)) return false;
      if (HH_STATE.quorum === 'noreport' && b.hhListed > 0) return false;
      if (q && normSearch(b.barangay + ' ' + b.municipality).indexOf(q) === -1) return false;
      return true;
    });

    var curCol = HH_STATE.sortCol || 'brgy';
    var curDir = HH_STATE.sortDir || 'asc';
    var bgExt = {
      brgy: function (b) { return b.barangay; },
      muni: function (b) { return b.municipality; },
      listed: function (b) { return b.hhListed || 0; },
      present: function (b) { return b.hhPresent || 0; },
      rate: function (b) { return b.hhListed ? b.hhRate : -1; },
      status: function (b) { return (b.hhListed && b.hhRate >= 0.7) ? 2 : (b.hhListed ? 1 : 0); }
    };
    var sortedBrgys = tblSort(filteredBrgys, curCol, curDir, bgExt);

    var rows = sortedBrgys.map(function (b) {
      var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
      var hasRpt = b.hhListed > 0;
      var isMet = hasRpt && b.hhRate >= 0.7;
      var pill = !hasRpt ? '<span class="pill idle">Not reported</span>' : (isMet ? '<span class="pill good">✓ Met Quorum (≥70%)</span>' : '<span class="pill warn">⚠ Below 70%</span>');
      return '<tr>' +
        '<td><strong>' + esc(b.barangay) + '</strong></td>' +
        (!isMuni ? '<td>' + esc(b.municipality) + '</td>' : '') +
        '<td class="num">' + (hasRpt ? n(b.hhListed) : '—') + '</td>' +
        '<td class="num">' + (hasRpt ? n(b.hhPresent) : '—') + '</td>' +
        '<td class="num"><strong style="color:' + (isMet ? 'var(--good-text)' : (hasRpt ? 'var(--warn-text)' : 'inherit')) + '">' + (hasRpt ? pctText(b.hhRate) : '—') + '</strong></td>' +
        '<td>' + pill + '</td>' +
        '<td><button type="button" class="btn ghost btn-sm" data-act="hh-open-roster" data-v="' + attr(bkey) + '">' + icon('users') + ' <span>Inspect Roster</span></button></td>' +
      '</tr>';
    }).join('');

    var th = function (col, label, num) {
      return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, act: 'hh-sort' });
    };

    var baseBrgys = q ? brgys.filter(function (b) { return normSearch(b.barangay + ' ' + b.municipality).indexOf(q) !== -1; }) : brgys;
    var cAll = baseBrgys.length;
    var cMet = baseBrgys.filter(function (b) { return b.hhListed > 0 && b.hhRate >= 0.7; }).length;
    var cBelow = baseBrgys.filter(function (b) { return b.hhListed > 0 && b.hhRate < 0.7; }).length;
    var cNoReport = baseBrgys.filter(function (b) { return !b.hhListed; }).length;

    var quorumCards = [
      ['all', 'All Barangays', cAll, ''],
      ['met', 'Meeting Quorum (≥70%)', cMet, 'fc-good'],
      ['below', 'Below Quorum (<70%)', cBelow, 'fc-warn'],
      ['noreport', 'Not Reported', cNoReport, '']
    ].map(function (x) {
      return '<button type="button" class="filter-card' + (x[3] ? ' ' + x[3] : '') + (HH_STATE.quorum === x[0] ? ' active' : '') + '" data-act="hh-quorum" data-v="' + x[0] + '">' +
        '<span class="fc-label">' + esc(x[1]) + '</span>' +
        '<span class="fc-count">' + n(x[2]) + '</span>' +
      '</button>';
    }).join('');

    contentHtml = '<div class="toolbar-row"><div class="filters" style="margin:0;flex:1">' +
        '<label class="field" style="flex:1"><span>Search Barangay</span><input type="search" id="hh-search" value="' + attr(HH_STATE.search) + '" placeholder="Barangay name…"></label>' +
        (HH_STATE.quorum !== 'all' || HH_STATE.search ? '<button type="button" class="btn ghost btn-sm" data-act="hh-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
      '</div><span class="tiny">Showing <strong>' + n(sortedBrgys.length) + '</strong> of <strong>' + n(brgys.length) + '</strong></span></div>' +
      '<div class="filter-cards" style="margin:8px 0">' + quorumCards + '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('brgy', 'Barangay') +
        (!isMuni ? th('muni', 'Municipality') : '') +
        th('listed', 'Households Listed', true) +
        th('present', 'Households Present', true) +
        th('rate', 'Participation Rate', true) +
        th('status', 'Quorum Status') +
        '<th>Action</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="7" class="empty-state">No barangays match these filters.</td></tr>') + '</tbody></table></div>';
  } else {
    // ---- ROSTER VIEW ----
    var roster = P.households.filter(inScope);
    var q2 = normSearch(HH_STATE.search.trim());
    var flagObj = (PEOPLE_FLAGS.households.filter(function (f) { return f.id === HH_STATE.flag; })[0]) || PEOPLE_FLAGS.households[0];

    var filteredRoster = roster.filter(function (r) {
      if (HH_STATE.brgy && (r.province + '|' + r.municipality + '|' + r.barangay !== HH_STATE.brgy)) return false;
      if (flagObj.id !== 'all') {
        if (flagObj.test ? !flagObj.test(r) : r.flags.indexOf(flagObj.id) === -1) return false;
      }
      if (q2 && r.q.indexOf(q2) === -1) return false;
      return true;
    });

    var curCol2 = HH_STATE.sortCol || 'name';
    var curDir2 = HH_STATE.sortDir || 'asc';
    var rExt = {
      name: function (r) { return r.name; },
      birthdate: function (r) { return r.birthdate || ''; },
      sex: function (r) { return r.sex || ''; },
      head: function (r) { return r.head ? 1 : 0; },
      present: function (r) { return r.present ? 1 : 0; },
      brgy: function (r) { return r.barangay; },
      muni: function (r) { return r.municipality; },
      act: function (r) { return r.actLabel; }
    };
    var sortedRoster = tblSort(filteredRoster, curCol2, curDir2, rExt);
    var shownRoster = sortedRoster.slice(0, HH_STATE.limit);

    var rows2 = shownRoster.map(function (r) {
      return '<tr>' +
        '<td>' + nameCell(r) + '</td>' +
        '<td>' + esc(r.birthdate || '—') + '</td>' +
        '<td>' + esc(r.sex || '—') + '</td>' +
        '<td>' + yesNo(r.head) + '</td>' +
        '<td>' + yesNo(r.present) + '</td>' +
        '<td>' + placeCell(r) + '</td>' +
        (!isMuni ? '<td>' + esc(r.municipality) + '</td>' : '') +
        '<td><span class="tiny">' + esc(r.actLabel) + '</span></td>' +
        '<td>' + flagPills(r) + '</td>' +
      '</tr>';
    }).join('');

    var th2 = function (col, label, num) {
      return sortTh({ col: col, curCol: curCol2, dir: curDir2, label: label, num: num, act: 'hh-sort' });
    };

    var bOpts2 = '<option value="">All Barangays</option>' + brgys.map(function (b) {
      var v = b.province + '|' + b.municipality + '|' + b.barangay;
      return '<option value="' + attr(v) + '"' + (HH_STATE.brgy === v ? ' selected' : '') + '>' + esc(b.barangay) + '</option>';
    }).join('');

    var baseRoster = roster.filter(function (r) {
      if (HH_STATE.brgy && (r.province + '|' + r.municipality + '|' + r.barangay !== HH_STATE.brgy)) return false;
      if (q2 && r.q.indexOf(q2) === -1) return false;
      return true;
    });

    var flagCards2 = PEOPLE_FLAGS.households.map(function (f) {
      var cnt = f.id === 'all' ? baseRoster.length : baseRoster.filter(function (r) { return f.test ? f.test(r) : r.flags.indexOf(f.id) !== -1; }).length;
      var col = f.id === 'all' ? '' : (f.id === 'present' ? 'fc-good' : (f.id === 'absent' || f.id === 'noname' ? 'fc-warn' : ''));
      return '<button type="button" class="filter-card' + (col ? ' ' + col : '') + (HH_STATE.flag === f.id ? ' active' : '') + '" data-act="hh-flag" data-v="' + f.id + '">' +
        '<span class="fc-label">' + esc(f.label) + '</span>' +
        '<span class="fc-count">' + n(cnt) + '</span>' +
      '</button>';
    }).join('');

    contentHtml = '<div class="toolbar-row"><div class="filters" style="margin:0;flex:1">' +
        '<label class="field"><span>Barangay</span><select data-act="hh-brgy">' + bOpts2 + '</select></label>' +
        '<label class="field" style="flex:1"><span>Search</span><input type="search" id="hh-search" value="' + attr(HH_STATE.search) + '" placeholder="Household member name, barangay…"></label>' +
        (HH_STATE.brgy || HH_STATE.flag !== 'all' || HH_STATE.search ? '<button type="button" class="btn ghost btn-sm" data-act="hh-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
      '</div><span class="tiny">Showing <strong>' + n(shownRoster.length) + '</strong> of <strong>' + n(sortedRoster.length) + '</strong></span></div>' +
      '<div class="filter-cards">' + flagCards2 + '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th2('name', 'Name') +
        th2('birthdate', 'Birthdate') +
        th2('sex', 'Sex') +
        th2('head', 'HH Head') +
        th2('present', 'Present') +
        th2('brgy', 'Barangay') +
        (!isMuni ? th2('muni', 'Municipality') : '') +
        th2('act', 'Assembly') +
        '<th>Flags</th>' +
      '</tr></thead><tbody>' + (rows2 || '<tr><td colspan="9" class="empty-state">No household records match these filters.</td></tr>') + '</tbody></table></div>' +
      (shownRoster.length < sortedRoster.length ? '<div class="row-actions" style="margin-top:12px"><button class="btn ghost btn-sm" data-act="hh-more">Show ' + Math.min(100, sortedRoster.length - shownRoster.length) + ' more</button><span class="tiny">Showing ' + n(shownRoster.length) + ' of ' + n(sortedRoster.length) + '</span></div>' : '');
  }

  var subNav = '<div class="sub-nav-tabs">' +
    '<button type="button" class="sub-nav-btn" data-go="attendees">' + icon('calendar-check') + ' <span>Attendees Directory</span></button>' +
    '<button type="button" class="sub-nav-btn active">' + icon('home') + ' <span>Household Participation</span></button>' +
  '</div>';

  body.innerHTML = subNav +
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>Household Participation (K2 Quorum)</h2>' +
          '<div class="muted">' + (isMuni ? 'Scoped strictly to <strong>' + esc(home().municipality) + '</strong>.' : 'Regional household participation monitoring.') + ' Tracks 1st Barangay Assembly K2 quorum (70% statutory threshold) and roster verification.</div>' +
        '</div>' +
        '<div class="row-actions" style="margin:0"><button class="btn ghost btn-sm" data-act="hh-export">' + icon('download') + ' <span>Export Household CSV</span></button></div>' +
      '</div>' +
      '<div class="grid-kpi">' +
        '<div class="kpi ' + (overallRate === null ? 'accent-idle' : (overallRate >= 0.7 ? 'accent-good' : 'accent-warn')) + '">' +
          '<div class="kpi-label">K2 Overall Participation Rate</div>' +
          '<div class="kpi-value">' + pctText(overallRate) + '</div>' +
          '<div class="kpi-sub">' + (overallRate >= 0.7 ? '✓ Met target quorum (≥70%)' : '⚠ Below target quorum (70%)') + '</div>' +
        '</div>' +
        '<div class="kpi ' + (metCount === reportingCount && reportingCount > 0 ? 'accent-good' : 'accent-warn') + '">' +
          '<div class="kpi-label">Barangays Meeting 70% Quorum</div>' +
          '<div class="kpi-value">' + n(metCount) + ' <span class="tiny">of ' + n(reportingCount) + '</span></div>' +
          '<div class="kpi-sub">' + (reportingCount ? Math.round(metCount / reportingCount * 100) + '% compliance rate' : 'No data yet') + '</div>' +
        '</div>' +
        '<div class="kpi"><div class="kpi-label">Total Households Listed</div><div class="kpi-value">' + n(totListed) + '</div><div class="kpi-sub">across ' + n(reportingCount) + ' reporting barangays</div></div>' +
        '<div class="kpi"><div class="kpi-label">Total Households Present</div><div class="kpi-value">' + n(totPresent) + '</div><div class="kpi-sub">present at the 1st Barangay Assembly</div></div>' +
      '</div>' +
      '<div class="filters" style="margin:14px 0">' + tabsHtml + '</div>' +
      contentHtml +
    '</div>';

  bindSearch('hh-search', function (v) { HH_STATE.search = v; HH_STATE.limit = 100; renderHouseholds(); });
}

// ===================================================================
// MODULE 3: COMMUNITY VOLUNTEERS
// ===================================================================

function renderVolunteers() {
  var body = $('vol-body');
  if (!body) return;
  if (!STATE.computed) { body.innerHTML = '<div class="card"><p class="muted">Load the volunteers export first.</p></div>'; return; }
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (VOL_STATE.muni || key || '');
  var inScope = pScopeTest(activeMuni);
  var list = P.volunteers.filter(inScope);

  // Municipalities dropdown (for RPMO)
  var munis = baselineMunis();
  var mOpts = '<option value="">All Municipalities</option>';
  munis.forEach(function (m) {
    var v = m.province + '|' + m.municipality;
    mOpts += '<option value="' + attr(v) + '"' + (activeMuni === v ? ' selected' : '') + '>' + esc(m.municipality) + ' (' + esc(m.province) + ')</option>';
  });

  // Barangays in scope
  var brgys = (SNAP.barangayRows || []).filter(function (b) { return !activeMuni || b.province + '|' + b.municipality === activeMuni; })
    .sort(function (a, b) { return a.municipality.localeCompare(b.municipality) || a.barangay.localeCompare(b.barangay); });
  var bOpts = '<option value="">All Barangays</option>' + brgys.map(function (b) {
    var v = b.province + '|' + b.municipality + '|' + b.barangay;
    return '<option value="' + attr(v) + '"' + (VOL_STATE.brgy === v ? ' selected' : '') + '>' + esc(b.barangay) + '</option>';
  }).join('');

  // Filtering
  var q = normSearch(VOL_STATE.search.trim());
  var filtered = list.filter(function (v) {
    if (VOL_STATE.brgy && (v.province + '|' + v.municipality + '|' + v.barangay !== VOL_STATE.brgy)) return false;
    if (VOL_STATE.body === 'BREST' && v.kind !== 'BREST') return false;
    if (VOL_STATE.body === 'SFMSC' && v.kind !== 'SFMSC') return false;
    if (VOL_STATE.body === 'OTHER' && (v.kind === 'BREST' || v.kind === 'SFMSC')) return false;
    if (VOL_STATE.position === 'chair' && !v.chair) return false;
    if (VOL_STATE.position === 'member' && v.chair) return false;
    if (VOL_STATE.sex !== 'all' && v.sex !== VOL_STATE.sex) return false;
    if (VOL_STATE.marg === 'women' && v.sex !== 'female') return false;
    if (VOL_STATE.marg === 'ip' && !v.ip) return false;
    if (VOL_STATE.marg === 'pwd' && !v.pwd) return false;
    if (VOL_STATE.flag === 'notattendee' && v.flags.indexOf('notattendee') === -1) return false;
    if (VOL_STATE.flag === 'nocommittee' && v.flags.indexOf('nocommittee') === -1) return false;
    if (VOL_STATE.flag === 'nosex' && v.flags.indexOf('nosex') === -1) return false;
    if (q && v.q.indexOf(q) === -1) return false;
    return true;
  });

  // KPIs
  var totalVol = list.length;
  var womenCount = list.filter(function (v) { return v.sex === 'female'; }).length;
  var margCount = list.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;
  var chairCount = list.filter(function (v) { return v.chair; }).length;
  var brgysWithVol = {};
  list.forEach(function (v) { brgysWithVol[v.province + '|' + v.municipality + '|' + v.barangay] = true; });

  // Sorting
  var curCol = VOL_STATE.sortCol || 'name';
  var curDir = VOL_STATE.sortDir || 'asc';
  var vExt = {
    name: function (v) { return v.name; },
    sex: function (v) { return v.sex; },
    ippwd: function (v) { return [v.ip ? 'IP' : '', v.pwd ? 'PWD' : ''].filter(Boolean).join(', '); },
    committee: function (v) { return v.body || v.committee; },
    position: function (v) { return v.chair ? 2 : (v.position ? 1 : 0); },
    brgy: function (v) { return v.barangay; },
    muni: function (v) { return v.municipality; },
    start: function (v) { return v.start || ''; },
    flags: function (v) { return (v.flags || []).join(' '); }
  };
  var sorted = tblSort(filtered, curCol, curDir, vExt);
  var shown = sorted.slice(0, VOL_STATE.limit);

  var rowsHtml = shown.map(function (v) {
    return '<tr>' +
      '<td>' + nameCell(v) + '</td>' +
      '<td>' + esc(v.sex || '—') + '</td>' +
      '<td>' + (v.ip ? '<span class="pill idle">IP</span> ' : '') + (v.pwd ? '<span class="pill idle">PWD</span>' : (!v.ip ? '—' : '')) + '</td>' +
      '<td>' + (v.body ? '<strong>' + esc(v.body) + '</strong>' : esc(v.committee || '—')) + '</td>' +
      '<td>' + (v.chair ? '<span class="pill good">' + esc(v.position) + '</span>' : esc(v.position || '—')) + '</td>' +
      '<td>' + placeCell(v) + '</td>' +
      (!isMuni ? '<td>' + esc(v.municipality) + '</td>' : '') +
      '<td>' + esc(v.start || '—') + '</td>' +
      '<td>' + flagPills(v) + '</td>' +
    '</tr>';
  }).join('');

  var th = function (col, label, num) {
    return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, act: 'vol-sort' });
  };

  var vq = normSearch(VOL_STATE.search.trim());
  var baseVols = list.filter(function (r) {
    if (VOL_STATE.brgy && (r.province + '|' + r.municipality + '|' + r.barangay !== VOL_STATE.brgy)) return false;
    if (vq && r.q.indexOf(vq) === -1) return false;
    return true;
  });

  var bodyCards = [
    ['all', 'All Committees'],
    ['BREST', 'BResT'],
    ['SFMSC', 'SFMSC'],
    ['OTHER', 'Other Bodies']
  ].map(function (b) {
    var cnt = baseVols.filter(function (r) {
      if (b[0] !== 'all' && r.kind !== b[0]) return false;
      if (VOL_STATE.position === 'chair' && !r.chair) return false;
      if (VOL_STATE.position === 'member' && r.chair) return false;
      return true;
    }).length;
    return '<button type="button" class="filter-card' + (VOL_STATE.body === b[0] ? ' active' : '') + '" data-act="vol-body" data-v="' + b[0] + '">' +
      '<span class="fc-label">' + esc(b[1]) + '</span>' +
      '<span class="fc-count">' + n(cnt) + '</span>' +
    '</button>';
  }).join('');

  var posCards = [
    ['all', 'All Roles'],
    ['chair', 'Chairpersons'],
    ['member', 'Members']
  ].map(function (p) {
    var cnt = baseVols.filter(function (r) {
      if (VOL_STATE.body !== 'all' && r.kind !== VOL_STATE.body) return false;
      if (p[0] === 'chair' && !r.chair) return false;
      if (p[0] === 'member' && r.chair) return false;
      return true;
    }).length;
    var col = p[0] === 'chair' ? 'fc-good' : '';
    return '<button type="button" class="filter-card' + (col ? ' ' + col : '') + (VOL_STATE.position === p[0] ? ' active' : '') + '" data-act="vol-pos" data-v="' + p[0] + '">' +
      '<span class="fc-label">' + esc(p[1]) + '</span>' +
      '<span class="fc-count">' + n(cnt) + '</span>' +
    '</button>';
  }).join('');

  var scopeBanner = isMuni
    ? '<div class="static-val">' + icon('map-pin') + ' <span>Municipality: <strong>' + esc(home().municipality) + '</strong> (' + esc(home().province) + ')</span> <span class="role-badge field">PEA / MDM Scope</span></div>'
    : '<label class="field"><span>Municipality</span><select data-act="vol-muni">' + mOpts + '</select></label>';

  var subNav = '<div class="sub-nav-tabs">' +
    '<button type="button" class="sub-nav-btn active">' + icon('users') + ' <span>Community Volunteers</span></button>' +
    '<button type="button" class="sub-nav-btn" data-go="brest">' + icon('shield') + ' <span>BResT Teams</span></button>' +
  '</div>';

  body.innerHTML = subNav +
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>Community Volunteers &amp; Committees</h2>' +
          '<div class="muted">' + (isMuni ? 'Dedicated volunteer directory for <strong>' + esc(home().municipality) + '</strong>.' : 'Region-wide community volunteer rosters.') + ' Tracks BResT, SFMSC, inclusion metrics, and committee chairpersons.</div>' +
        '</div>' +
        '<div class="row-actions" style="margin:0"><button class="btn ghost btn-sm" data-act="vol-export">' + icon('download') + ' <span>Export Volunteers CSV</span></button></div>' +
      '</div>' +
      '<div class="grid-kpi">' +
        '<div class="kpi"><div class="kpi-label">Total Volunteers Encoded</div><div class="kpi-value">' + n(totalVol) + '</div><div class="kpi-sub">in ' + Object.keys(brgysWithVol).length + ' barangays</div></div>' +
        '<div class="kpi accent-good"><div class="kpi-label">Women Representation</div><div class="kpi-value">' + pctText(pctOf(womenCount, totalVol)) + '</div><div class="kpi-sub">' + n(womenCount) + ' female volunteers</div></div>' +
        '<div class="kpi accent-good"><div class="kpi-label">Marginalized Inclusion (Women, IP, PWD)</div><div class="kpi-value">' + pctText(pctOf(margCount, totalVol)) + '</div><div class="kpi-sub">' + n(margCount) + ' marginalized individuals</div></div>' +
        '<div class="kpi"><div class="kpi-label">Committee Chairpersons</div><div class="kpi-value">' + n(chairCount) + '</div><div class="kpi-sub">designated committee leaders</div></div>' +
      '</div>' +
      '<div class="toolbar-row"><div class="filters" style="margin:0">' +
        scopeBanner +
        '<label class="field"><span>Barangay</span><select data-act="vol-brgy">' + bOpts + '</select></label>' +
        '<label class="field" style="flex:1"><span>Search</span><input type="search" id="vol-search" value="' + attr(VOL_STATE.search) + '" placeholder="Volunteer name, committee, position…"></label>' +
        (VOL_STATE.brgy || VOL_STATE.body !== 'all' || VOL_STATE.position !== 'all' || VOL_STATE.search ? '<button type="button" class="btn ghost btn-sm" data-act="vol-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
      '</div><span class="tiny">Showing <strong>' + n(shown.length) + '</strong> of <strong>' + n(sorted.length) + '</strong></span></div>' +
      '<div class="filter-cards">' + bodyCards + '<span class="sep" style="margin:0 4px;color:var(--border-strong)">|</span>' + posCards + '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('name', 'Volunteer Name') +
        th('sex', 'Sex') +
        th('ippwd', 'IP / PWD') +
        th('committee', 'Committee') +
        th('position', 'Position') +
        th('brgy', 'Barangay') +
        (!isMuni ? th('muni', 'Municipality') : '') +
        th('start', 'Term Start') +
        th('flags', 'Cross-check Flags') +
      '</tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="10" class="empty-state">No volunteers match these filters.</td></tr>') + '</tbody></table></div>' +
      (shown.length < sorted.length ? '<div class="row-actions" style="margin-top:12px"><button class="btn ghost btn-sm" data-act="vol-more">Show ' + Math.min(100, sorted.length - shown.length) + ' more</button><span class="tiny">Showing ' + n(shown.length) + ' of ' + n(sorted.length) + '</span></div>' : '') +
    '</div>';

  bindSearch('vol-search', function (v) { VOL_STATE.search = v; VOL_STATE.limit = 100; renderVolunteers(); });
}

// ===================================================================
// MODULE 4: BResT (Barangay Resilience Team Dedicated Module)
// ===================================================================

function renderBrest() {
  var body = $('brt-body');
  if (!body) return;
  if (!STATE.computed) { body.innerHTML = '<div class="card"><p class="muted">Load the Community Volunteer List first.</p></div>'; return; }
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (BRT_STATE.muni || key || '');
  var brgys = (SNAP.barangayRows || []).filter(function (b) { return !activeMuni || b.province + '|' + b.municipality === activeMuni; });
  var brestVols = P.volunteers.filter(function (v) {
    if (v.kind !== 'BREST') return false;
    return !activeMuni || (v.province + '|' + v.municipality === activeMuni);
  });

  // KPIs
  var totalBrgys = brgys.length;
  var encodedBrgys = brgys.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Encoded'; }).length;
  var needsFixBrgys = brgys.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Needs fixing'; }).length;
  var notEncodedBrgys = totalBrgys - encodedBrgys - needsFixBrgys;

  // Filter cards by status
  var filteredBrgys = brgys.filter(function (b) {
    var st = b.volunteers && b.volunteers.BREST ? b.volunteers.BREST.status : 'Not encoded';
    if (BRT_STATE.status === 'encoded' && st !== 'Encoded') return false;
    if (BRT_STATE.status === 'needs_fixing' && st !== 'Needs fixing') return false;
    if (BRT_STATE.status === 'not_encoded' && st !== 'Not encoded') return false;
    if (BRT_STATE.search) {
      var q = normSearch(BRT_STATE.search);
      if (normSearch(b.barangay + ' ' + b.municipality).indexOf(q) === -1) return false;
    }
    return true;
  });

  // Render Barangay Cards Grid
  var cardsHtml = filteredBrgys.map(function (b) {
    var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
    var bVols = brestVols.filter(function (v) { return v.barangay === b.barangay && v.municipality === b.municipality; });
    var chair = bVols.filter(function (v) { return v.chair; })[0];
    var st = b.volunteers && b.volunteers.BREST ? b.volunteers.BREST.status : 'Not encoded';
    var reasons = (b.volunteers && b.volunteers.BREST && b.volunteers.BREST.reasons) || [];
    var cardCls = st === 'Encoded' ? 'good' : (st === 'Needs fixing' ? 'warn' : 'bad');
    var statusPill = st === 'Encoded' ? '<span class="pill good">✓ Compliant</span>' : (st === 'Needs fixing' ? '<span class="pill warn">⚠ Needs Fixing</span>' : '<span class="pill bad">○ Not Encoded</span>');
    var women = bVols.filter(function (v) { return v.sex === 'female'; }).length;
    var marg = bVols.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;

    return '<div class="brest-card ' + cardCls + '">' +
      '<div class="brest-head">' +
        '<div><div class="brest-title">' + esc(b.barangay) + '</div>' + (isRegionalUser() ? '<div class="tiny">' + esc(b.municipality) + '</div>' : '') + '</div>' +
        statusPill +
      '</div>' +
      (chair ?
        '<div class="brest-chair"><strong>' + esc(chair.name) + '</strong><span class="tiny">' + esc(chair.position || 'Chairperson') + '</span></div>'
        : '<div class="brest-chair" style="color:var(--warn-text)"><strong>⚠ No Chairperson Tagged</strong><span class="tiny">Chairperson required under Stage 1</span></div>') +
      '<div class="brest-stats">' +
        '<span class="pill idle">' + n(bVols.length) + ' members</span>' +
        '<span class="pill idle">' + n(women) + ' women (' + pctText(pctOf(women, bVols.length)) + ')</span>' +
        (bVols.length ? '<span class="pill idle">Marginalized ' + Math.round(marg / bVols.length * 100) + '%</span>' : '') +
      '</div>' +
      (reasons.length ? '<div class="brest-issues">' + icon('alert-triangle') + ' <span>' + esc(reasons.join(' · ')) + '</span></div>' : '') +
      '<div style="margin-top:auto;display:flex;justify-content:flex-end">' +
        '<button type="button" class="link tiny" data-act="brt-pick-brgy" data-v="' + attr(bkey) + '">Inspect ' + n(bVols.length) + ' Members ›</button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Section 2: Members Directory Table
  var selectedBkey = BRT_STATE.brgy;
  var displayVols = brestVols.filter(function (v) {
    if (selectedBkey && (v.province + '|' + v.municipality + '|' + v.barangay !== selectedBkey)) return false;
    if (BRT_STATE.search) {
      var q = normSearch(BRT_STATE.search);
      if (v.q.indexOf(q) === -1) return false;
    }
    return true;
  });

  var curCol = BRT_STATE.sortCol || 'brgy';
  var curDir = BRT_STATE.sortDir || 'asc';
  var brtExt = {
    brgy: function (v) { return v.barangay; },
    muni: function (v) { return v.municipality; },
    name: function (v) { return v.name; },
    position: function (v) { return v.chair ? 2 : (v.position ? 1 : 0); },
    sex: function (v) { return v.sex; },
    ippwd: function (v) { return [v.ip ? 'IP' : '', v.pwd ? 'PWD' : ''].filter(Boolean).join(', '); },
    start: function (v) { return v.start || ''; }
  };
  var sortedVols = tblSort(displayVols, curCol, curDir, brtExt);

  var memberRows = sortedVols.map(function (v) {
    return '<tr>' +
      '<td><strong>' + esc(v.barangay) + '</strong></td>' +
      (!isMuni ? '<td>' + esc(v.municipality) + '</td>' : '') +
      '<td>' + nameCell(v) + '</td>' +
      '<td>' + (v.chair ? '<span class="pill good">' + esc(v.position) + '</span>' : esc(v.position || 'Member')) + '</td>' +
      '<td>' + esc(v.sex || '—') + '</td>' +
      '<td>' + (v.ip ? '<span class="pill idle">IP</span> ' : '') + (v.pwd ? '<span class="pill idle">PWD</span>' : (!v.ip ? '—' : '')) + '</td>' +
      '<td>' + esc(v.start || '—') + '</td>' +
      '<td>' + flagPills(v) + '</td>' +
    '</tr>';
  }).join('');

  var th = function (col, label, num) {
    return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, act: 'brt-sort' });
  };

  var bq = normSearch(BRT_STATE.search.trim());
  var baseBrgys = bq ? brgys.filter(function (b) {
    return normSearch(b.barangay + ' ' + b.municipality).indexOf(bq) !== -1;
  }) : brgys;
  var cTotal = baseBrgys.length;
  var cEnc = baseBrgys.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Encoded'; }).length;
  var cFix = baseBrgys.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Needs fixing'; }).length;
  var cNot = cTotal - cEnc - cFix;

  var statusCards = [
    ['all', 'All Teams', cTotal, ''],
    ['encoded', 'Compliant', cEnc, 'fc-good'],
    ['needs_fixing', 'Needs Fixing', cFix, 'fc-warn'],
    ['not_encoded', 'Not Encoded', cNot, 'fc-bad']
  ].map(function (s) {
    return '<button type="button" class="filter-card' + (s[3] ? ' ' + s[3] : '') + (BRT_STATE.status === s[0] ? ' active' : '') + '" data-act="brt-status" data-v="' + s[0] + '">' +
      '<span class="fc-label">' + esc(s[1]) + '</span>' +
      '<span class="fc-count">' + n(s[2]) + '</span>' +
    '</button>';
  }).join('');

  var bOpts = '<option value="">All Barangays</option>' + brgys.map(function (b) {
    var v = b.province + '|' + b.municipality + '|' + b.barangay;
    return '<option value="' + attr(v) + '"' + (selectedBkey === v ? ' selected' : '') + '>' + esc(b.barangay) + '</option>';
  }).join('');

  var subNav = '<div class="sub-nav-tabs">' +
    '<button type="button" class="sub-nav-btn" data-go="volunteers">' + icon('users') + ' <span>Community Volunteers</span></button>' +
    '<button type="button" class="sub-nav-btn active">' + icon('shield') + ' <span>BResT Teams</span></button>' +
  '</div>';

  body.innerHTML = subNav +
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>Barangay Resilience Team (BResT) Management</h2>' +
          '<div class="muted">' + (isMuni ? 'Monitoring BResT formation for <strong>' + esc(home().municipality) + '</strong>.' : 'Region-wide BResT compliance monitor.') + ' Evaluates team formation, Chairperson designation, and marginalized representation under Stage 1.</div>' +
        '</div>' +
        '<div class="row-actions" style="margin:0"><button class="btn ghost btn-sm" data-act="brt-export">' + icon('download') + ' <span>Export BResT Directory CSV</span></button></div>' +
      '</div>' +
      '<div class="grid-kpi">' +
        '<div class="kpi ' + (encodedBrgys === totalBrgys && totalBrgys > 0 ? 'accent-good' : 'accent-warn') + '">' +
          '<div class="kpi-label">BResT Formation Rate</div>' +
          '<div class="kpi-value">' + n(encodedBrgys + needsFixBrgys) + ' <span class="tiny">of ' + n(totalBrgys) + '</span></div>' +
          '<div class="kpi-sub">' + (totalBrgys ? Math.round((encodedBrgys + needsFixBrgys) / totalBrgys * 100) + '% teams organized in KCIS' : '') + '</div>' +
        '</div>' +
        '<div class="kpi accent-good"><div class="kpi-label">Compliant Teams</div><div class="kpi-value">' + n(encodedBrgys) + '</div><div class="kpi-sub">valid chairperson &amp; active quorum</div></div>' +
        '<div class="kpi ' + (needsFixBrgys > 0 ? 'accent-warn' : 'accent-good') + '"><div class="kpi-label">Teams Needing Attention</div><div class="kpi-value">' + n(needsFixBrgys) + '</div><div class="kpi-sub">missing chairperson or validation issues</div></div>' +
        '<div class="kpi ' + (notEncodedBrgys > 0 ? 'accent-bad' : 'accent-good') + '"><div class="kpi-label">Not Yet Encoded</div><div class="kpi-value">' + n(notEncodedBrgys) + '</div><div class="kpi-sub">pending volunteer encoding in KCIS</div></div>' +
      '</div>' +
      '<div class="toolbar-row" style="margin-top:14px;margin-bottom:8px">' +
        '<div class="filter-cards" style="margin:0;flex:1">' + statusCards + '</div>' +
        '<label class="field" style="min-width:240px"><span>Search Barangay / Volunteer</span><input type="search" id="brt-search" value="' + attr(BRT_STATE.search) + '" placeholder="Search…"></label>' +
        (BRT_STATE.status !== 'all' || BRT_STATE.search ? '<button type="button" class="btn ghost btn-sm" data-act="brt-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
      '</div>' +
      '<h3 style="margin-top:16px">Barangay Team Status Cards (' + filteredBrgys.length + ')</h3>' +
      '<div class="brest-grid">' + (cardsHtml || '<div class="empty-state">No barangays match this status filter.</div>') + '</div>' +
      '<hr style="border:0;border-top:1px solid var(--border-subtle);margin:24px 0 16px">' +
      '<div class="card-head" style="margin-bottom:8px">' +
        '<div><h3>BResT Member Directory</h3><div class="tiny">' + (selectedBkey ? 'Showing members for selected barangay' : 'All encoded BResT members across monitored barangays') + '</div></div>' +
        '<div class="filters" style="margin:0"><label class="field"><span>Barangay</span><select data-act="brt-brgy">' + bOpts + '</select></label></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('brgy', 'Barangay') +
        (!isMuni ? th('muni', 'Municipality') : '') +
        th('name', 'Member Name') +
        th('position', 'Position') +
        th('sex', 'Sex') +
        th('ippwd', 'IP / PWD') +
        th('start', 'Term Start') +
        '<th>Cross-check</th>' +
      '</tr></thead><tbody>' + (memberRows || '<tr><td colspan="8" class="empty-state">No BResT members encoded for this selection.</td></tr>') + '</tbody></table></div>' +
    '</div>';

  bindSearch('brt-search', function (v) { BRT_STATE.search = v; renderBrest(); });
}

// ===================================================================
// MODULE 5: MResT (Municipal Resilience Team Dedicated Module)
// ===================================================================

function renderMrest() {
  var body = $('mrt-body');
  if (!body) return;
  if (!STATE.computed) { body.innerHTML = '<div class="card"><p class="muted">Load the Community Volunteer List first.</p></div>'; return; }
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var allMrest = P.mrest || [];
  var munis = baselineMunis();

  var activeMuni = isMuni ? key : (MRT_STATE.muni || key || (munis.length ? munis[0].province + '|' + munis[0].municipality : ''));
  var parts = activeMuni ? activeMuni.split('|') : ['', ''];
  var provName = parts[0], muniName = parts[1];

  var muniVols = allMrest.filter(function (r) {
    return r.province === provName && r.municipality === muniName;
  });

  // Verification against Mayor's Executive Order
  var recKey = 'mrest|' + provName + '|' + muniName + '||MREST';
  var eoTag = (typeof vfTag === 'function') ? vfTag(recKey) : null;
  var isVerified = eoTag && eoTag.rows && Object.keys(eoTag.rows).length > 0;
  var eoCount = eoTag && typeof eoTag.formCount === 'number' ? eoTag.formCount : null;

  // KPIs
  var isEncoded = muniVols.length > 0;
  var femaleCount = muniVols.filter(function (r) { return r.sex === 'female'; }).length;
  var chair = muniVols.filter(function (r) { return /^chair/i.test(r.position) || /head/i.test(r.position) || /lead/i.test(r.position); })[0];

  // Offices / Sectors represented
  var offices = {};
  muniVols.forEach(function (r) { if (r.position) offices[r.position] = true; });

  // RPMO Regional Comparison Matrix
  var matrixHtml = '';
  if (!isMuni) {
    var mq = normSearch(MRT_STATE.search.trim());
    var baseMunis = munis.filter(function (m) {
      if (mq && normSearch(m.municipality + ' ' + m.province).indexOf(mq) === -1) return false;
      return true;
    });

    var mFilter = MRT_STATE.matrixFilter || 'all';
    var cMuniAll = baseMunis.length;
    var cMuniEnc = baseMunis.filter(function (m) {
      return allMrest.some(function (r) { return r.province === m.province && r.municipality === m.municipality; });
    }).length;
    var cMuniVer = baseMunis.filter(function (m) {
      var mRecKey = 'mrest|' + m.province + '|' + m.municipality + '||MREST';
      var mTag = (typeof vfTag === 'function') ? vfTag(mRecKey) : null;
      return mTag && mTag.rows && Object.keys(mTag.rows).length > 0;
    }).length;
    var cMuniPend = cMuniAll - cMuniVer;

    var matrixCards = [
      ['all', 'All Municipalities', cMuniAll, ''],
      ['encoded', 'Encoded in KCIS', cMuniEnc, 'fc-good'],
      ['verified', 'EO Verified', cMuniVer, 'fc-good'],
      ['pending', 'Pending EO', cMuniPend, 'fc-warn']
    ].map(function (x) {
      return '<button type="button" class="filter-card' + (x[3] ? ' ' + x[3] : '') + (mFilter === x[0] ? ' active' : '') + '" data-act="mrt-matrix-filter" data-v="' + x[0] + '">' +
        '<span class="fc-label">' + esc(x[1]) + '</span>' +
        '<span class="fc-count">' + n(x[2]) + '</span>' +
      '</button>';
    }).join('');

    var filteredMunis = baseMunis.filter(function (m) {
      var mVols = allMrest.filter(function (r) { return r.province === m.province && r.municipality === m.municipality; });
      var mRecKey = 'mrest|' + m.province + '|' + m.municipality + '||MREST';
      var mTag = (typeof vfTag === 'function') ? vfTag(mRecKey) : null;
      var mVer = mTag && mTag.rows && Object.keys(mTag.rows).length > 0;
      if (mFilter === 'encoded' && !mVols.length) return false;
      if (mFilter === 'verified' && !mVer) return false;
      if (mFilter === 'pending' && mVer) return false;
      return true;
    });

    var matrixRowsHtml = filteredMunis.map(function (m) {
      var mKey = m.province + '|' + m.municipality;
      var mVols = allMrest.filter(function (r) { return r.province === m.province && r.municipality === m.municipality; });
      var mChair = mVols.filter(function (r) { return /^chair/i.test(r.position) || /lead/i.test(r.position); })[0];
      var mRecKey = 'mrest|' + m.province + '|' + m.municipality + '||MREST';
      var mTag = (typeof vfTag === 'function') ? vfTag(mRecKey) : null;
      var mVer = mTag && mTag.rows && Object.keys(mTag.rows).length > 0;

      return '<tr class="' + (activeMuni === mKey ? 'active' : '') + '">' +
        '<td><strong>' + esc(m.municipality) + '</strong></td>' +
        '<td>' + esc(m.province) + '</td>' +
        '<td>' + (mVols.length ? '<span class="pill good">✓ ' + mVols.length + ' encoded</span>' : '<span class="pill bad">○ Not in KCIS</span>') + '</td>' +
        '<td>' + (mChair ? esc(mChair.name) : '<span class="tiny text-dim">No lead tagged</span>') + '</td>' +
        '<td>' + (mVer ? '<span class="pill good">✓ EO Verified</span>' : '<span class="pill idle">Pending EO</span>') + '</td>' +
        '<td><button type="button" class="btn ghost btn-sm" data-act="mrt-pick-muni" data-v="' + attr(mKey) + '">' + icon('award') + ' <span>View Roster</span></button></td>' +
      '</tr>';
    }).join('');

    matrixHtml = '<div class="card" style="margin-top:16px">' +
      '<div class="card-head"><div><h3>Regional MResT Compliance Matrix</h3><div class="tiny">Cross-municipality comparison of Executive Order &amp; MResT formation across Caraga Region</div></div></div>' +
      '<div class="filter-cards" style="margin-bottom:12px">' + matrixCards + '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        '<th>Municipality</th><th>Province</th><th>MResT Status</th><th>Designated Lead</th><th>EO Verification</th><th>Action</th>' +
      '</tr></thead><tbody>' + (matrixRowsHtml || '<tr><td colspan="6" class="empty-state">No municipalities match these filters.</td></tr>') + '</tbody></table></div></div>';
  }

  // Filter Roster
  var q = normSearch(MRT_STATE.search.trim());
  var filteredRoster = muniVols.filter(function (r) {
    if (q && normSearch(r.name + ' ' + r.position + ' ' + (r.committee || '')).indexOf(q) === -1) return false;
    return true;
  });

  var curCol = MRT_STATE.sortCol || 'name';
  var curDir = MRT_STATE.sortDir || 'asc';
  var mExt = {
    name: function (r) { return r.name; },
    sex: function (r) { return r.sex; },
    position: function (r) { return r.position || ''; },
    committee: function (r) { return r.committee || ''; }
  };
  var sortedRoster = tblSort(filteredRoster, curCol, curDir, mExt);

  var rosterRows = sortedRoster.map(function (r) {
    var rowTag = (eoTag && eoTag.rows && eoTag.rows[r.key]) || null;
    var tagPill = !rowTag ? '<span class="tiny">Not verified</span>' : (rowTag.s === 'match' ? '<span class="pill good">✓ Matches EO</span>' : '<span class="pill warn">⚠ Differs from EO</span>');
    return '<tr>' +
      '<td>' + nameCell(r) + '</td>' +
      '<td>' + esc(r.sex || '—') + '</td>' +
      '<td><strong>' + esc(r.position || 'Member') + '</strong></td>' +
      '<td><span class="tiny">' + esc(r.committee || 'MResT') + '</span></td>' +
      '<td>' + tagPill + '</td>' +
    '</tr>';
  }).join('');

  var th = function (col, label, num) {
    return sortTh({ col: col, curCol: curCol, dir: curDir, label: label, num: num, act: 'mrt-sort' });
  };

  body.innerHTML =
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>Municipal Resilience Team (MResT)</h2>' +
          '<div class="muted">Tracks the multi-sectoral LGU team organized under the Mayor\'s Executive Order for <strong>' + esc(muniName) + ' (' + esc(provName) + ')</strong>.</div>' +
        '</div>' +
        '<div class="row-actions" style="margin:0"><button class="btn ghost btn-sm" data-act="mrt-export">' + icon('download') + ' <span>Export MResT Roster CSV</span></button></div>' +
      '</div>' +
      '<div class="mrest-hero">' +
        '<div class="mrest-hero-info">' +
          '<h3>' + esc(muniName) + ' Municipal Resilience Team</h3>' +
          '<div class="muted">Province of ' + esc(provName) + ' · Kalahi-CIDSS PCRP LGU Operations</div>' +
        '</div>' +
        '<div class="mrest-hero-badges">' +
          (isEncoded ? '<span class="pill good" style="font-size:13px;padding:4px 10px">✓ ' + n(muniVols.length) + ' Members Encoded</span>' : '<span class="pill bad">○ Not Encoded in KCIS</span>') +
          (isVerified ? '<span class="pill good" style="font-size:13px;padding:4px 10px">✓ EO Verified (' + (eoCount !== null ? eoCount + ' on paper' : 'verified') + ')</span>' : '<span class="pill idle" style="font-size:13px;padding:4px 10px">Pending EO Verification</span>') +
        '</div>' +
      '</div>' +
      '<div class="grid-kpi">' +
        '<div class="kpi ' + (isEncoded ? 'accent-good' : 'accent-bad') + '">' +
          '<div class="kpi-label">MResT Formation Status</div>' +
          '<div class="kpi-value">' + (isEncoded ? '✓ Encoded' : '○ Pending') + '</div>' +
          '<div class="kpi-sub">' + (isEncoded ? n(muniVols.length) + ' members listed in KCIS' : 'No volunteer records with MResT committee') + '</div>' +
        '</div>' +
        '<div class="kpi ' + (isVerified ? 'accent-good' : 'accent-idle') + '">' +
          '<div class="kpi-label">Executive Order (EO) Precision</div>' +
          '<div class="kpi-value">' + (isVerified ? 'Verified' : 'Unchecked') + '</div>' +
          '<div class="kpi-sub">' + (isVerified ? 'Checked against signed Mayor\'s Executive Order' : 'Tag on the Verify page (MResT form)') + '</div>' +
        '</div>' +
        '<div class="kpi accent-good"><div class="kpi-label">Gender Balance</div><div class="kpi-value">' + pctText(pctOf(femaleCount, muniVols.length)) + '</div><div class="kpi-sub">' + n(femaleCount) + ' female members</div></div>' +
        '<div class="kpi"><div class="kpi-label">Offices Represented</div><div class="kpi-value">' + Object.keys(offices).length + '</div><div class="kpi-sub">LGU departments &amp; stakeholders</div></div>' +
      '</div>' +
      '<div class="card-head" style="margin-top:20px;margin-bottom:8px">' +
        '<div><h3>MResT Member Roster</h3><div class="tiny">Officers and department representatives designated in the Executive Order</div></div>' +
        '<div class="filters" style="margin:0"><label class="field" style="min-width:240px"><span>Search Member / Office</span><input type="search" id="mrt-search" value="' + attr(MRT_STATE.search) + '" placeholder="Search…"></label></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('name', 'Name') +
        th('sex', 'Sex') +
        th('position', 'Position / Office in LGU') +
        th('committee', 'Committee') +
        '<th>EO Verification</th>' +
      '</tr></thead><tbody>' + (rosterRows || '<tr><td colspan="5" class="empty-state">No MResT members encoded for ' + esc(muniName) + '. Volunteer export Seq 1 committee rows for MResT are tracked here.</td></tr>') + '</tbody></table></div>' +
      matrixHtml +
    '</div>';

  bindSearch('mrt-search', function (v) { MRT_STATE.search = v; renderMrest(); });
}

// ===================================================================
// BACKWARD COMPATIBILITY & SHARED PEOPLE VIEW
// ===================================================================

function renderPeople() {
  var body = $('pp-body');
  if (!body) return;
  body.innerHTML = '<div class="card">' +
    '<h2>People &amp; Roster Hub</h2>' +
    '<p class="muted">The People module has been separated into dedicated, specialized modules with comprehensive metrics and validation:</p>' +
    '<div class="grid-kpi" style="margin-top:16px">' +
      '<button type="button" class="kpi clickable" data-act="go" data-v="attendees"><div class="kpi-label">Attendees</div><div class="kpi-value">' + icon('calendar-check') + '</div><div class="kpi-sub">Open Attendees Module ›</div></button>' +
      '<button type="button" class="kpi clickable" data-act="go" data-v="households"><div class="kpi-label">Household Participation</div><div class="kpi-value">' + icon('home') + '</div><div class="kpi-sub">Open K2 Quorum &amp; Roster ›</div></button>' +
      '<button type="button" class="kpi clickable" data-act="go" data-v="volunteers"><div class="kpi-label">Community Volunteers</div><div class="kpi-value">' + icon('users') + '</div><div class="kpi-sub">Open Volunteers Module ›</div></button>' +
      '<button type="button" class="kpi clickable" data-act="go" data-v="brest"><div class="kpi-label">BResT</div><div class="kpi-value">' + icon('shield') + '</div><div class="kpi-sub">Open BResT Module ›</div></button>' +
      '<button type="button" class="kpi clickable" data-act="go" data-v="mrest"><div class="kpi-label">MResT</div><div class="kpi-value">' + icon('award') + '</div><div class="kpi-sub">Open MResT Module ›</div></button>' +
    '</div>' +
  '</div>';
}

function committeeCards(bkey) {
  var parts = bkey.split('|'), P = people();
  var b = (SNAP.barangayRows || []).filter(function (x) { return x.province === parts[0] && x.municipality === parts[1] && x.barangay === parts[2]; })[0];
  var list = P.volunteers.filter(function (v) { return v.province + '|' + v.municipality + '|' + v.barangay === bkey; });
  var card = function (code, short, label) {
    var m = list.filter(function (v) { return v.kind === code; }).sort(function (a, c) { return (c.chair - a.chair) || a.name.localeCompare(c.name); });
    var st = b && b.volunteers ? b.volunteers[code] : null;
    var cls = !st ? 'idle' : st.status === 'Encoded' ? 'good' : st.status === 'Needs fixing' ? 'warn' : 'bad';
    var accent = cls === 'good' ? 'accent-good' : (cls === 'warn' ? 'accent-warn' : (cls === 'bad' ? 'accent-bad' : 'accent-idle'));
    var women = m.filter(function (v) { return v.sex === 'female'; }).length, marg = m.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;
    return '<div class="kpi ' + accent + '"><div class="card-head" style="margin:0 0 6px"><strong>' + esc(label) + '</strong><span class="pill ' + cls + '">' + esc(st ? st.status : '—') + '</span></div>' +
      (st && st.reasons && st.reasons.length ? '<div class="tiny" style="color:var(--warn-text);font-weight:700;margin-bottom:4px">⚠ ' + esc(st.reasons.join(' · ')) + '</div>' : '') +
      (m.length
        ? '<div class="tiny">' + n(m.length) + (m.length === 1 ? ' volunteer · ' : ' volunteers · ') + n(women) + (women === 1 ? ' woman' : ' women') + ' · marginalized (women, IP, PWD) <strong>' + Math.round(marg / m.length * 100) + '%</strong></div>' +
          '<ol style="margin:8px 0 0;padding-left:18px">' + m.map(function (v) {
            return '<li style="margin:3px 0">' + nameCell(v) + (v.chair ? ' <span class="pill good">' + esc(v.position) + '</span>' : (v.position ? ' <span class="tiny">' + esc(v.position) + '</span>' : ' <span class="tiny">no position</span>')) +
              (v.flags.indexOf('notattendee') !== -1 ? ' <span class="pill warn">Not among 1st BA attendees</span>' : '') + '</li>';
          }).join('') + '</ol>'
        : '<div class="tiny">No volunteer in KCIS for this body yet. This does not mean it was not organized.</div>') +
    '</div>';
  };
  var others = list.filter(function (v) { return v.kind !== 'BREST' && v.kind !== 'SFMSC'; });
  return '<h3 style="margin-top:6px">Committees of ' + esc(parts[2]) + '</h3><div class="grid-kpi">' +
    card('BREST', 'BResT', 'Barangay Resilience Team (BResT)') + card('SFMSC', 'SFMSC', 'Stakeholder and Feedback Mechanism Sub-Committee (SFMSC)') + '</div>' +
    (others.length ? '<p class="tiny">' + n(others.length) + ' more volunteer row' + (others.length === 1 ? '' : 's') + ' in this barangay with no committee, or a committee of another activity (listed below).</p>' : '');
}

// ---- profile ---------------------------------------------------------------------------

function openPerson(key) {
  var P = people(), recs = P.byKey[key] || [];
  if (!recs.length) return;
  var name = recs[0].name, loose = recs[0].loose;
  var initials = name.split(/\s+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase(); }).slice(0, 2).join('') || 'P';
  var looseOnly = loose ? (P.byLoose[loose] || []).filter(function (r) { return r.key !== key; }) : [];
  var att = recs.filter(function (r) { return r.type === 'attendee'; }), hh = recs.filter(function (r) { return r.type === 'household'; }), vol = recs.filter(function (r) { return r.type === 'volunteer'; });
  var places = {};
  recs.forEach(function (r) { if (r.barangay) places[r.barangay + ', ' + r.municipality] = true; });
  var hint = [];
  var headPlaces = {};
  hh.forEach(function (h) { if (h.head) headPlaces[h.barangay + ', ' + h.municipality] = true; });
  if (Object.keys(headPlaces).length > 1) hint.push('Listed as a household head in ' + Object.keys(headPlaces).length + ' barangays: ' + Object.keys(headPlaces).join(' and ') + '. A household belongs to one barangay.');
  var bdays = {}; hh.forEach(function (h) { if (h.birthdate) bdays[h.birthdate] = true; });
  if (Object.keys(bdays).length > 1) hint.push('Different birthdates on the roster (' + Object.keys(bdays).join(', ') + '): these may be different people with the same name.');
  vol.forEach(function (v) { if (v.flags.indexOf('notattendee') !== -1) hint.push('Volunteer in ' + (v.body || v.committee || 'no committee') + ' (' + v.barangay + ') but not among the 1st BA attendees encoded there.'); });
  hh.forEach(function (h) { if (h.flags.indexOf('headnotattendee') !== -1) hint.push('Household marked present at the 1st BA of ' + h.barangay + ', but this name is not among the attendees encoded there. Another household member may have attended; check the attendance sheet if the household count looks high.'); });
  var bodies = {}; vol.forEach(function (v) { if (v.body) bodies[v.body + ' · ' + v.barangay] = true; });
  if (Object.keys(bodies).length > 1) hint.push('Sits in ' + Object.keys(bodies).join(' and ') + ' (allowed).');
  hh.forEach(function (h) { if (h.flags.indexOf('twice') !== -1) hint.push('Listed more than once on the ' + h.actLabel + ' roster of ' + h.barangay + '.'); });
  hint = hint.filter(function (h, i) { return hint.indexOf(h) === i; });

  var table = function (title, list, cols) {
    if (!list.length) return '';
    return '<h3 style="margin-top:16px">' + esc(title) + ' <span class="pill idle">' + list.length + '</span></h3><div class="table-wrap" style="max-height:none"><table class="grid"><thead><tr>' +
      cols.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      list.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td>' + c[1](r) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  };
  var plc = function (r) { return esc(r.barangay || '— municipal —') + ', ' + esc(r.municipality); };
  $('person-body').innerHTML =
    '<div class="dialog-head">' +
      '<div class="person-id">' +
        '<div class="person-avatar" aria-hidden="true">' + esc(initials) + '</div>' +
        '<div><h2 style="margin:0">' + esc(name) + '</h2>' +
          '<div class="muted">' + (Object.keys(places).join(' · ') || 'Municipal level only') + '</div></div>' +
      '</div>' +
      '<div class="person-badges">' +
        '<span class="pill ' + (att.length ? 'good' : 'idle') + '">' + n(att.length) + ' Attendance</span>' +
        '<span class="pill ' + (hh.length ? 'good' : 'idle') + '">' + n(hh.length) + ' Household roster</span>' +
        '<span class="pill ' + (vol.length ? 'good' : 'idle') + '">' + n(vol.length) + ' Volunteer ' + (vol.length === 1 ? 'role' : 'roles') + '</span>' +
        '<button class="btn ghost icon-btn" value="close" aria-label="Close profile" title="Close (Esc)">' + icon('x') + '</button>' +
      '</div>' +
    '</div>' +
    (hint.length ? '<div class="msg warn" style="margin-top:10px">' + icon('alert-triangle') + ' <div><strong>Items to check</strong><ul style="margin:4px 0 0;padding-left:18px">' + hint.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul></div></div>' : '') +
    table('Attendance', att, [['Activity', function (r) { return 'Seq ' + esc(r.seq) + ' · ' + esc(r.actLabel); }], ['Where', plc], ['Date', function (r) { return esc(r.date || '—'); }], ['Sex', function (r) { return esc(r.sex || '—'); }]]) +
    table('Household roster', hh, [['Assembly', function (r) { return esc(r.actLabel); }], ['Where', plc], ['HH head', function (r) { return yesNo(r.head); }], ['Present', function (r) { return yesNo(r.present); }], ['Birthdate', function (r) { return esc(r.birthdate || '—'); }]]) +
    table('Volunteer roles', vol, [['Committee', function (r) { return esc(r.committee || '(none)'); }], ['Position', function (r) { return esc(r.position || '—'); }], ['Where', plc], ['Term start', function (r) { return esc(r.start || '—'); }], ['IP / PWD', function (r) { return [r.ip ? 'IP' : '', r.pwd ? 'PWD' : ''].filter(Boolean).join(', ') || '—'; }]]) +
    (looseOnly.length ? '<h3 style="margin-top:16px">Same first and last name, different middle name <span class="pill warn">' + looseOnly.length + '</span></h3>' +
      '<p class="tiny">Possibly the same person encoded with a different or missing middle name.</p><ul style="margin:6px 0 0;padding-left:18px">' +
      Object.keys(looseOnly.reduce(function (m, r) { m[r.key] = r.name; return m; }, {})).map(function (k) {
        var r = looseOnly.filter(function (x) { return x.key === k; });
        return '<li style="margin:4px 0"><button class="link" data-act="person" data-v="' + attr(k) + '">' + esc(r[0].name) + '</button> <span class="tiny">' + r.length + ' record' + (r.length === 1 ? '' : 's') + ' · ' + esc(r.map(function (x) { return x.barangay || x.municipality; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ')) + '</span></li>';
      }).join('') + '</ul>' : '');
  var dlg = $('person-dialog');
  if (!dlg.open) {
    if (typeof openModalAnimated === 'function') openModalAnimated(dlg);
    else dlg.showModal();
  }
  $('person-body').scrollTop = 0;
}

// Exports
function exportAttendeesCsv() {
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (ATT_STATE.muni || key || '');
  var list = P.attendees.filter(pScopeTest(activeMuni));
  var head = ['Name', 'Sex', 'Barangay', 'Municipality', 'Province', 'Activity Seq', 'Activity Name', 'Date', 'Flags'];
  var rows = list.map(function (r) {
    return [r.name, r.sex, r.barangay, r.municipality, r.province, r.seq, r.actLabel, r.date, (r.flags || []).join('; ')];
  });
  downloadCsv('PCRP_attendees_' + (activeMuni ? activeMuni.replace(/[^A-Za-z0-9]+/g, '_') : 'region') + '_' + stamp() + '.csv', csvOf([head].concat(rows)));
}

function exportHouseholdsCsv() {
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (HH_STATE.muni || key || '');
  var list = P.households.filter(pScopeTest(activeMuni));
  var head = ['Name', 'Birthdate', 'Sex', 'Is HH Head', 'Is Present at 1st BA', 'Barangay', 'Municipality', 'Province', 'Assembly', 'Flags'];
  var rows = list.map(function (r) {
    return [r.name, r.birthdate, r.sex, r.head ? 'Yes' : 'No', r.present ? 'Yes' : 'No', r.barangay, r.municipality, r.province, r.actLabel, (r.flags || []).join('; ')];
  });
  downloadCsv('PCRP_household_roster_' + (activeMuni ? activeMuni.replace(/[^A-Za-z0-9]+/g, '_') : 'region') + '_' + stamp() + '.csv', csvOf([head].concat(rows)));
}

function exportVolunteersCsv() {
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (VOL_STATE.muni || key || '');
  var list = P.volunteers.filter(pScopeTest(activeMuni));
  var head = ['Name', 'Sex', 'IP', 'PWD', 'Committee Body', 'Committee Full', 'Position', 'Is Chair', 'Barangay', 'Municipality', 'Province', 'Term Start', 'Flags'];
  var rows = list.map(function (v) {
    return [v.name, v.sex, v.ip ? 'Yes' : 'No', v.pwd ? 'Yes' : 'No', v.body, v.committee, v.position, v.chair ? 'Yes' : 'No', v.barangay, v.municipality, v.province, v.start, (v.flags || []).join('; ')];
  });
  downloadCsv('PCRP_volunteers_' + (activeMuni ? activeMuni.replace(/[^A-Za-z0-9]+/g, '_') : 'region') + '_' + stamp() + '.csv', csvOf([head].concat(rows)));
}

function exportBrestCsv() {
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (BRT_STATE.muni || key || '');
  var list = P.volunteers.filter(function (v) {
    if (v.kind !== 'BREST') return false;
    return !activeMuni || (v.province + '|' + v.municipality === activeMuni);
  });
  var head = ['Barangay', 'Municipality', 'Province', 'Volunteer Name', 'Position', 'Is Chair', 'Sex', 'IP', 'PWD', 'Term Start', 'Cross-check Flags'];
  var rows = list.map(function (v) {
    return [v.barangay, v.municipality, v.province, v.name, v.position, v.chair ? 'Yes' : 'No', v.sex, v.ip ? 'Yes' : 'No', v.pwd ? 'Yes' : 'No', v.start, (v.flags || []).join('; ')];
  });
  downloadCsv('PCRP_BResT_directory_' + (activeMuni ? activeMuni.replace(/[^A-Za-z0-9]+/g, '_') : 'region') + '_' + stamp() + '.csv', csvOf([head].concat(rows)));
}

function exportMrestCsv() {
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (MRT_STATE.muni || key || '');
  var parts = activeMuni ? activeMuni.split('|') : ['', ''];
  var list = (P.mrest || []).filter(function (r) {
    return !activeMuni || (r.province === parts[0] && r.municipality === parts[1]);
  });
  var head = ['Municipality', 'Province', 'Member Name', 'Sex', 'Position / Office in LGU', 'Committee'];
  var rows = list.map(function (r) {
    return [r.municipality, r.province, r.name, r.sex, r.position, r.committee];
  });
  downloadCsv('PCRP_MResT_roster_' + (activeMuni ? activeMuni.replace(/[^A-Za-z0-9]+/g, '_') : 'region') + '_' + stamp() + '.csv', csvOf([head].concat(rows)));
}

// Global click & change delegates for the 5 modules
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-act]');
  if (!t || t.tagName === 'SELECT') return;
  var act = t.getAttribute('data-act'), v = t.getAttribute('data-v');

  // Person modal
  if (act === 'person') { ev.preventDefault(); openPerson(v); }

  // Attendees
  else if (act === 'att-sex') { ATT_STATE.sex = v; ATT_STATE.limit = 100; renderAttendees(); }
  else if (act === 'att-flag') { ATT_STATE.flag = v; ATT_STATE.limit = 100; renderAttendees(); }
  else if (act === 'att-sort') {
    var col = t.getAttribute('data-col');
    if (ATT_STATE.sortCol === col) ATT_STATE.sortDir = ATT_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    else { ATT_STATE.sortCol = col; ATT_STATE.sortDir = (col === 'act' || col === 'date') ? 'desc' : 'asc'; }
    renderAttendees();
  }
  else if (act === 'att-reset') { ATT_STATE.brgy = ''; ATT_STATE.act = ''; ATT_STATE.sex = 'all'; ATT_STATE.flag = 'all'; ATT_STATE.search = ''; renderAttendees(); }
  else if (act === 'att-more') { ATT_STATE.limit += 100; renderAttendees(); }
  else if (act === 'att-export') exportAttendeesCsv();

  // Households
  else if (act === 'hh-tab') { HH_STATE.tab = v; renderHouseholds(); }
  else if (act === 'hh-quorum') { HH_STATE.quorum = v; renderHouseholds(); }
  else if (act === 'hh-flag') { HH_STATE.flag = v; HH_STATE.limit = 100; renderHouseholds(); }
  else if (act === 'hh-open-roster') { HH_STATE.tab = 'roster'; HH_STATE.brgy = v; renderHouseholds(); }
  else if (act === 'hh-sort') {
    var hCol = t.getAttribute('data-col');
    if (HH_STATE.sortCol === hCol) HH_STATE.sortDir = HH_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    else { HH_STATE.sortCol = hCol; HH_STATE.sortDir = 'asc'; }
    renderHouseholds();
  }
  else if (act === 'hh-reset') { HH_STATE.brgy = ''; HH_STATE.quorum = 'all'; HH_STATE.flag = 'all'; HH_STATE.search = ''; renderHouseholds(); }
  else if (act === 'hh-more') { HH_STATE.limit += 100; renderHouseholds(); }
  else if (act === 'hh-export') exportHouseholdsCsv();

  // Volunteers
  else if (act === 'vol-body') { VOL_STATE.body = v; renderVolunteers(); }
  else if (act === 'vol-pos') { VOL_STATE.position = v; renderVolunteers(); }
  else if (act === 'vol-sort') {
    var vCol = t.getAttribute('data-col');
    if (VOL_STATE.sortCol === vCol) VOL_STATE.sortDir = VOL_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    else { VOL_STATE.sortCol = vCol; VOL_STATE.sortDir = 'asc'; }
    renderVolunteers();
  }
  else if (act === 'vol-reset') { VOL_STATE.brgy = ''; VOL_STATE.body = 'all'; VOL_STATE.position = 'all'; VOL_STATE.sex = 'all'; VOL_STATE.marg = 'all'; VOL_STATE.flag = 'all'; VOL_STATE.search = ''; renderVolunteers(); }
  else if (act === 'vol-more') { VOL_STATE.limit += 100; renderVolunteers(); }
  else if (act === 'vol-export') exportVolunteersCsv();

  // BResT
  else if (act === 'brt-status') { BRT_STATE.status = v; renderBrest(); }
  else if (act === 'brt-reset') { BRT_STATE.status = 'all'; BRT_STATE.search = ''; renderBrest(); }
  else if (act === 'brt-pick-brgy') { BRT_STATE.brgy = v; renderBrest(); }
  else if (act === 'brt-sort') {
    var bCol = t.getAttribute('data-col');
    if (BRT_STATE.sortCol === bCol) BRT_STATE.sortDir = BRT_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    else { BRT_STATE.sortCol = bCol; BRT_STATE.sortDir = 'asc'; }
    renderBrest();
  }
  else if (act === 'brt-export') exportBrestCsv();

  // MResT
  else if (act === 'mrt-matrix-filter') { MRT_STATE.matrixFilter = v; renderMrest(); }
  else if (act === 'mrt-pick-muni') { MRT_STATE.muni = v; renderMrest(); }
  else if (act === 'mrt-sort') {
    var mCol = t.getAttribute('data-col');
    if (MRT_STATE.sortCol === mCol) MRT_STATE.sortDir = MRT_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    else { MRT_STATE.sortCol = mCol; MRT_STATE.sortDir = 'asc'; }
    renderMrest();
  }
  else if (act === 'mrt-export') exportMrestCsv();
});

document.addEventListener('change', function (ev) {
  var t = ev.target, act = t.getAttribute && t.getAttribute('data-act');
  if (act === 'att-muni') { ATT_STATE.muni = t.value; ATT_STATE.brgy = ''; renderAttendees(); }
  else if (act === 'att-brgy') { ATT_STATE.brgy = t.value; renderAttendees(); }
  else if (act === 'att-act') { ATT_STATE.act = t.value; renderAttendees(); }
  else if (act === 'hh-brgy') { HH_STATE.brgy = t.value; renderHouseholds(); }
  else if (act === 'vol-muni') { VOL_STATE.muni = t.value; VOL_STATE.brgy = ''; renderVolunteers(); }
  else if (act === 'vol-brgy') { VOL_STATE.brgy = t.value; renderVolunteers(); }
  else if (act === 'brt-brgy') { BRT_STATE.brgy = t.value; renderBrest(); }
});
