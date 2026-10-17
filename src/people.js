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
var PSTATE = { view: 'attendees', scope: 'home', brgy: '', act: '', body: '', flag: 'all', search: '', limit: 100 };
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

  var out = { attendees: [], households: [], volunteers: [], unmatched: { attendees: 0, households: 0, volunteers: 0 } };

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
    r.birthdate = CH.birthdate !== undefined ? dateOf(row[CH.birthdate]) : '';
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

  // ---- cross-references ------------------------------------------------------------
  var bk = function (r) { return r.province + '|' + r.municipality + '|' + r.barangay; };
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

  // search text, computed once
  ['attendees', 'households', 'volunteers'].forEach(function (k) {
    out[k].forEach(function (r) {
      r.q = normSearch([r.name, r.barangay, r.municipality, r.actLabel, r.committee, r.position].filter(Boolean).join(' '));
    });
  });

  // name -> records, for profiles
  out.byKey = {}; out.byLoose = {};
  ['attendees', 'households', 'volunteers'].forEach(function (k) {
    out[k].forEach(function (r) {
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

var PEOPLE_FLAGS = {
  attendees: [
    { id: 'all', label: 'All' },
    { id: 'volunteer', label: 'Also a volunteer here' },
    { id: 'noname', label: 'No name' }
  ],
  households: [
    { id: 'all', label: 'All' },
    { id: 'head', label: 'Household heads', test: function (r) { return r.head; } },
    { id: 'present', label: 'Marked present', test: function (r) { return r.present; } },
    { id: 'absent', label: 'Not present', test: function (r) { return !r.present; } },
    { id: 'headnotattendee', label: 'Present, head not among attendees' },
    { id: 'twice', label: 'Listed twice' },
    { id: 'otherbrgy', label: 'Head in another barangay too' },
    { id: 'noname', label: 'No name' }
  ],
  volunteers: [
    { id: 'all', label: 'All' },
    { id: 'BREST', label: 'BResT', test: function (r) { return r.kind === 'BREST'; } },
    { id: 'SFMSC', label: 'SFMSC', test: function (r) { return r.kind === 'SFMSC'; } },
    { id: 'chair', label: 'Chairpersons', test: function (r) { return r.chair; } },
    { id: 'women', label: 'Women', test: function (r) { return r.sex === 'female'; } },
    { id: 'ippwd', label: 'IP or PWD', test: function (r) { return r.ip || r.pwd; } },
    { id: 'notattendee', label: 'Not among 1st BA attendees' },
    { id: 'noba1', label: '1st BA attendance not encoded' },
    { id: 'nocommittee', label: 'No committee' },
    { id: 'otherbody', label: 'Committee of another activity' },
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

function pScopeTest() {
  var key = homeKey();
  if (PSTATE.scope === 'home' && key) return function (r) { return r.province + '|' + r.municipality === key; };
  if (PSTATE.scope === 'home' && STATE.prov) return function (r) { return r.province === STATE.prov; };
  return function () { return true; };
}

function pRows() {
  var P = people(), list = P[PSTATE.view], inScope = pScopeTest();
  var q = normSearch(PSTATE.search.trim());
  var flag = (PEOPLE_FLAGS[PSTATE.view].filter(function (f) { return f.id === PSTATE.flag; })[0]) || PEOPLE_FLAGS[PSTATE.view][0];
  return list.filter(function (r) {
    if (!inScope(r)) return false;
    if (PSTATE.brgy && r.province + '|' + r.municipality + '|' + r.barangay !== PSTATE.brgy) return false;
    if (PSTATE.act && r.act !== PSTATE.act) return false;
    if (q && r.q.indexOf(q) === -1) return false;
    if (flag.id === 'all') return true;
    return flag.test ? flag.test(r) : r.flags.indexOf(flag.id) !== -1;
  });
}

function flagPills(r) {
  return (r.flags || []).map(function (f) { var t = FLAG_TEXT[f]; return t ? '<span class="pill ' + t[0] + '">' + esc(t[1]) + '</span>' : ''; }).join(' ');
}
function nameCell(r) {
  if (!r.key) return '<span class="tiny">(no name)</span>';
  return '<button class="link" data-act="person" data-v="' + attr(r.key) + '">' + esc(r.name) + '</button>';
}
function placeCell(r) {
  return esc(r.barangay || '— municipal —') + '<div class="tiny">' + esc(r.municipality) + '</div>';
}
function yesNo(v) { return v ? '<span class="pill good">Yes</span>' : '<span class="tiny">No</span>'; }

var PEOPLE_COLS = {
  attendees: [
    ['Name', nameCell, function (r) { return r.name; }],
    ['Sex', function (r) { return esc(r.sex || '—'); }, function (r) { return r.sex; }],
    ['Barangay', placeCell, function (r) { return r.barangay; }],
    ['Municipality', null, function (r) { return r.municipality; }],
    ['Activity', function (r) { return '<span class="tiny">Seq ' + esc(r.seq) + '</span> ' + esc(r.actLabel); }, function (r) { return r.actLabel; }],
    ['Date', function (r) { return esc(r.date || '—'); }, function (r) { return r.date; }],
    ['Flags', flagPills, function (r) { return (r.flags || []).map(function (f) { return FLAG_TEXT[f] ? FLAG_TEXT[f][1] : f; }).join('; '); }]
  ],
  households: [
    ['Name', nameCell, function (r) { return r.name; }],
    ['Birthdate', function (r) { return esc(r.birthdate || '—'); }, function (r) { return r.birthdate; }],
    ['Sex', function (r) { return esc(r.sex || '—'); }, function (r) { return r.sex; }],
    ['HH head', function (r) { return yesNo(r.head); }, function (r) { return r.head ? 'Yes' : 'No'; }],
    ['Present', function (r) { return yesNo(r.present); }, function (r) { return r.present ? 'Yes' : 'No'; }],
    ['Barangay', placeCell, function (r) { return r.barangay; }],
    ['Municipality', null, function (r) { return r.municipality; }],
    ['Assembly', function (r) { return '<span class="tiny">' + esc(r.actLabel) + '</span>'; }, function (r) { return r.actLabel; }],
    ['Flags', flagPills, function (r) { return (r.flags || []).map(function (f) { return FLAG_TEXT[f] ? FLAG_TEXT[f][1] : f; }).join('; '); }]
  ],
  volunteers: [
    ['Name', nameCell, function (r) { return r.name; }],
    ['Sex', function (r) { return esc(r.sex || '—'); }, function (r) { return r.sex; }],
    ['IP / PWD', function (r) { return (r.ip ? '<span class="pill idle">IP</span> ' : '') + (r.pwd ? '<span class="pill idle">PWD</span>' : ''); }, function (r) { return [r.ip ? 'IP' : '', r.pwd ? 'PWD' : ''].filter(Boolean).join(', '); }],
    ['Committee', function (r) { return r.body ? '<strong>' + esc(r.body) + '</strong>' : esc(r.committee || '—'); }, function (r) { return r.committee; }],
    ['Position', function (r) { return r.chair ? '<span class="pill good">' + esc(r.position) + '</span>' : esc(r.position || '—'); }, function (r) { return r.position; }],
    ['Barangay', placeCell, function (r) { return r.barangay; }],
    ['Municipality', null, function (r) { return r.municipality; }],
    ['Term start', function (r) { return esc(r.start || '—'); }, function (r) { return r.start; }],
    ['Flags', flagPills, function (r) { return (r.flags || []).map(function (f) { return FLAG_TEXT[f] ? FLAG_TEXT[f][1] : f; }).join('; '); }]
  ]
};

function renderPeople() {
  var P = people(), inScope = pScopeTest();
  var key = homeKey();
  var views = [
    ['attendees', 'Attendees', P.attendees], ['households', 'Household roster', P.households], ['volunteers', 'Volunteers & committees', P.volunteers]
  ];
  var counts = {};
  views.forEach(function (v) { counts[v[0]] = v[2].filter(inScope).length; });

  // barangays in scope, from the baseline (so a barangay with nobody encoded still shows)
  var brgys = (SNAP.barangayRows || []).filter(function (b) { return inScope(b); })
    .sort(function (a, b) { return a.municipality.localeCompare(b.municipality) || a.barangay.localeCompare(b.barangay); });
  var bOpts = '<option value="">All barangays</option>' + brgys.map(function (b) {
    var v = b.province + '|' + b.municipality + '|' + b.barangay;
    return '<option value="' + attr(v) + '"' + (PSTATE.brgy === v ? ' selected' : '') + '>' + esc(b.barangay) + (key ? '' : ' · ' + esc(b.municipality)) + '</option>';
  }).join('');
  var actOpts = '';
  if (PSTATE.view !== 'volunteers') {
    var acts = (S.overview.activities || []).filter(function (a) { return PSTATE.view === 'attendees' || a.households; });
    actOpts = '<label class="field"><span>' + (PSTATE.view === 'attendees' ? 'Activity' : 'Assembly') + '</span><select data-act="p-act"><option value="">All</option>' +
      acts.map(function (a) { return '<option value="' + attr(a.code) + '"' + (PSTATE.act === a.code ? ' selected' : '') + '>Seq ' + esc(a.seq) + ' · ' + esc(a.label) + '</option>'; }).join('') + '</select></label>';
  }
  var rows = pRows();
  var flags = PEOPLE_FLAGS[PSTATE.view].map(function (f) {
    var save = PSTATE.flag; PSTATE.flag = f.id; var c = pRows().length; PSTATE.flag = save;
    return '<button class="filter-chip' + (PSTATE.flag === f.id ? ' active' : '') + '" data-act="p-flag" data-v="' + f.id + '">' + esc(f.label) + ' <span class="chip-count">' + n(c) + '</span></button>';
  }).join('');
  var cols = PEOPLE_COLS[PSTATE.view].filter(function (c) { return c[1]; });
  var shown = rows.slice(0, PSTATE.limit);
  var body = shown.map(function (r) {
    return '<tr>' + cols.map(function (c) { return '<td>' + c[1](r) + '</td>'; }).join('') + '</tr>';
  }).join('');
  var unm = P.unmatched[PSTATE.view];
  var noVol = PSTATE.view === 'volunteers' && !P.volunteers.length;

  $('pp-body').innerHTML =
    '<div class="card"><div class="card-head"><div><h2>People · ' + esc(PSTATE.scope === 'home' ? (key ? homeLabel() : (STATE.prov || 'Caraga Region')) : 'Whole region') + '</h2>' +
      '<div class="muted">Who is behind the numbers. Click a name to see everywhere it appears in the three exports.</div></div>' +
      '<div class="row-actions" style="margin:0"><button class="btn ghost" data-act="p-export">Export list</button></div></div>' +
      '<div class="filters" role="tablist">' + views.map(function (v) {
        return '<button class="filter-chip' + (PSTATE.view === v[0] ? ' active' : '') + '" data-act="p-view" data-v="' + v[0] + '">' + v[1] + ' <span class="chip-count">' + n(counts[v[0]]) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="filters">' +
        (key || STATE.prov ? '<label class="field"><span>Area</span><select data-act="p-scope"><option value="home"' + (PSTATE.scope === 'home' ? ' selected' : '') + '>' + esc(key ? homeLabel() : STATE.prov) + '</option><option value="region"' + (PSTATE.scope === 'region' ? ' selected' : '') + '>Whole region</option></select></label>' : '') +
        '<label class="field"><span>Barangay</span><select data-act="p-brgy">' + bOpts + '</select></label>' + actOpts +
        '<label class="field"><span>Search</span><input type="search" id="pp-search" value="' + attr(PSTATE.search) + '" placeholder="Name, barangay, committee…"></label>' +
      '</div>' +
      '<div class="filters">' + flags + '</div>' +
      (PSTATE.view === 'volunteers' && PSTATE.brgy && !noVol ? committeeCards(PSTATE.brgy) : '') +
      (noVol ? '<div class="empty-state">Load the Community Volunteer List to see the volunteers and committees.</div>'
        : '<div class="table-wrap"><table class="grid"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead>' +
          '<tbody>' + (body || '<tr><td colspan="12" class="empty-state">Nobody matches these filters.</td></tr>') + '</tbody></table></div>' +
          '<div class="row-actions"><span class="tiny">Showing ' + n(shown.length) + ' of ' + n(rows.length) + '.' + (unm ? ' ' + n(unm) + ' rows of this export are not in a monitored barangay and are not listed.' : '') + '</span>' +
          (shown.length < rows.length ? '<button class="btn ghost" data-act="p-more">Show ' + Math.min(PEOPLE_PAGE, rows.length - shown.length) + ' more</button>' +
            (rows.length <= 3000 ? '<button class="link" data-act="p-all">Show all</button>' : '<span class="tiny">Narrow it with a barangay, an activity or a search, or use Export list for everything.</span>') : '') + '</div>') +
      '<p class="tiny">"Not among 1st BA attendees" compares names with the 1st BA attendance encoded for the same barangay (first and last name are enough). It points to records to check, not to errors. ' +
        'For households it is only a note: the roster names the head, and any household member may have attended.</p>' +
    '</div>';
  bindSearch('pp-search', function (v) { PSTATE.search = v; PSTATE.limit = PEOPLE_PAGE; renderPeople(); });
}

/** BResT and SFMSC of one barangay: chair first, with the status the monitor gives it. */
function committeeCards(bkey) {
  var parts = bkey.split('|'), P = people();
  var b = (SNAP.barangayRows || []).filter(function (x) { return x.province === parts[0] && x.municipality === parts[1] && x.barangay === parts[2]; })[0];
  var list = P.volunteers.filter(function (v) { return v.province + '|' + v.municipality + '|' + v.barangay === bkey; });
  var card = function (code, short, label) {
    var m = list.filter(function (v) { return v.kind === code; }).sort(function (a, c) { return (c.chair - a.chair) || a.name.localeCompare(c.name); });
    var st = b && b.volunteers ? b.volunteers[code] : null;
    var cls = !st ? 'idle' : st.status === 'Encoded' ? 'good' : st.status === 'Needs fixing' ? 'warn' : 'bad';
    var women = m.filter(function (v) { return v.sex === 'female'; }).length, marg = m.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;
    return '<div class="kpi"><div class="card-head" style="margin:0 0 6px"><strong>' + esc(label) + '</strong><span class="pill ' + cls + '">' + esc(st ? st.status : '—') + '</span></div>' +
      (st && st.reasons && st.reasons.length ? '<div class="tiny" style="color:var(--warn-text);font-weight:700">⚠ ' + esc(st.reasons.join(' · ')) + '</div>' : '') +
      (m.length
        ? '<div class="tiny">' + n(m.length) + (m.length === 1 ? ' volunteer · ' : ' volunteers · ') + n(women) + (women === 1 ? ' woman' : ' women') + ' · marginalized (women, IP, PWD) ' + Math.round(marg / m.length * 100) + '%</div>' +
          '<ol style="margin:6px 0 0;padding-left:18px">' + m.map(function (v) {
            return '<li>' + nameCell(v) + (v.chair ? ' <span class="pill good">' + esc(v.position) + '</span>' : (v.position ? ' <span class="tiny">' + esc(v.position) + '</span>' : ' <span class="tiny">no position</span>')) +
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
    return '<h3 style="margin-top:14px">' + esc(title) + ' <span class="tiny">(' + list.length + ')</span></h3><div class="table-wrap" style="max-height:none"><table class="grid"><thead><tr>' +
      cols.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      list.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td>' + c[1](r) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  };
  var plc = function (r) { return esc(r.barangay || '— municipal —') + ', ' + esc(r.municipality); };
  $('person-body').innerHTML =
    '<h2>' + esc(name) + '</h2>' +
    '<div class="muted">' + n(recs.length) + ' record' + (recs.length === 1 ? '' : 's') + ' · ' + (Object.keys(places).join(' · ') || 'municipal level only') + '</div>' +
    (hint.length ? '<div class="msg warn" style="margin-top:10px"><strong>To check</strong><ul style="margin:4px 0 0;padding-left:18px">' + hint.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul></div>' : '') +
    table('Attendance', att, [['Activity', function (r) { return 'Seq ' + esc(r.seq) + ' · ' + esc(r.actLabel); }], ['Where', plc], ['Date', function (r) { return esc(r.date || '—'); }], ['Sex', function (r) { return esc(r.sex || '—'); }]]) +
    table('Household roster', hh, [['Assembly', function (r) { return esc(r.actLabel); }], ['Where', plc], ['HH head', function (r) { return yesNo(r.head); }], ['Present', function (r) { return yesNo(r.present); }], ['Birthdate', function (r) { return esc(r.birthdate || '—'); }]]) +
    table('Volunteer roles', vol, [['Committee', function (r) { return esc(r.committee || '(none)'); }], ['Position', function (r) { return esc(r.position || '—'); }], ['Where', plc], ['Term start', function (r) { return esc(r.start || '—'); }], ['IP / PWD', function (r) { return [r.ip ? 'IP' : '', r.pwd ? 'PWD' : ''].filter(Boolean).join(', ') || '—'; }]]) +
    (looseOnly.length ? '<h3 style="margin-top:14px">Same first and last name, different middle name <span class="tiny">(' + looseOnly.length + ')</span></h3>' +
      '<p class="tiny">Possibly the same person encoded with a different or missing middle name.</p><ul>' +
      Object.keys(looseOnly.reduce(function (m, r) { m[r.key] = r.name; return m; }, {})).map(function (k) {
        var r = looseOnly.filter(function (x) { return x.key === k; });
        return '<li><button class="link" data-act="person" data-v="' + attr(k) + '">' + esc(r[0].name) + '</button> <span class="tiny">' + r.length + ' record' + (r.length === 1 ? '' : 's') + ' · ' + esc(r.map(function (x) { return x.barangay || x.municipality; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ')) + '</span></li>';
      }).join('') + '</ul>' : '');
  var dlg = $('person-dialog');
  if (!dlg.open) dlg.showModal();
  $('person-body').scrollTop = 0;
}

function exportPeople() {
  var cols = PEOPLE_COLS[PSTATE.view];
  var rows = pRows();
  var title = { attendees: 'Attendees', households: 'Household roster', volunteers: 'Volunteers' }[PSTATE.view];
  var sheet = [cols.map(function (c) { return c[0]; })].concat(rows.map(function (r) { return cols.map(function (c) { return c[2](r) === undefined ? '' : c[2](r); }); }));
  var where = PSTATE.brgy ? PSTATE.brgy.split('|')[2] : (homeKey() && PSTATE.scope === 'home' ? home().municipality : 'region');
  var fname = 'PCRP_' + title.replace(/\s+/g, '_') + '_' + where.replace(/[^A-Za-z0-9]+/g, '_') + '_' + stamp() + '.xlsx';
  saveBlob(makeXlsx([{ name: title, rows: sheet }]), fname);
  toast('Saved ' + fname + ' (' + n(rows.length) + ' rows). It contains names: handle it under the Data Privacy Act.');
}

/** Open People on one barangay (and activity or body), from the Barangays page. */
function openPeople(view, bkey, extra) {
  PSTATE.view = view; PSTATE.brgy = bkey || ''; PSTATE.act = ''; PSTATE.flag = 'all'; PSTATE.search = ''; PSTATE.limit = PEOPLE_PAGE;
  PSTATE.scope = 'home';
  if (extra && extra.act) PSTATE.act = extra.act;
  if (extra && extra.flag) PSTATE.flag = extra.flag;
  go('people');
}

document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-act]');
  if (!t || t.tagName === 'SELECT') return;
  var act = t.getAttribute('data-act'), v = t.getAttribute('data-v');
  if (act === 'person') { ev.preventDefault(); openPerson(v); }
  else if (act === 'p-view') { PSTATE.view = v; PSTATE.flag = 'all'; PSTATE.act = ''; PSTATE.limit = PEOPLE_PAGE; renderPeople(); }
  else if (act === 'p-flag') { PSTATE.flag = v; PSTATE.limit = PEOPLE_PAGE; renderPeople(); }
  else if (act === 'p-more') { PSTATE.limit += PEOPLE_PAGE; renderPeople(); }
  else if (act === 'p-all') { PSTATE.limit = 1e9; renderPeople(); }
  else if (act === 'p-export') exportPeople();
  else if (act === 'p-open') {
    var parts = v.split('#');           // view#barangay key#activity or flag
    var extra = {};
    if (parts[2]) { if (parts[0] === 'volunteers') extra.flag = parts[2]; else extra.act = parts[2]; }
    openPeople(parts[0], parts[1], extra);
  }
});
document.addEventListener('change', function (ev) {
  var t = ev.target, act = t.getAttribute && t.getAttribute('data-act');
  if (act === 'p-brgy') { PSTATE.brgy = t.value; PSTATE.limit = PEOPLE_PAGE; renderPeople(); }
  else if (act === 'p-act') { PSTATE.act = t.value; PSTATE.limit = PEOPLE_PAGE; renderPeople(); }
  else if (act === 'p-scope') { PSTATE.scope = t.value; PSTATE.brgy = ''; PSTATE.limit = PEOPLE_PAGE; renderPeople(); }
});
