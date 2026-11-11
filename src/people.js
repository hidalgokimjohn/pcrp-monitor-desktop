// ===================================================================
// PEOPLE — who is behind the numbers: attendees, volunteers and
// committees, with a profile for any name; and the household participation
// (K2) scorecard, read from the counts in the snapshot.
//
// Rows are matched to barangays and activities with the monitor's own
// functions (buildColumnIndex, classify, buildBaseline, volunteerColumnIndex,
// cvCommitteeKind), so a person counted on the other pages is the person
// listed here. Names are compared after normAlpha (case, spacing,
// punctuation, accents). Everything stays on this computer.
// ===================================================================

var PEOPLE = null;      // the index, rebuilt after every computation
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

// ===================================================================
// STAGE 2 COMMITTEES SPECIFICATION (2nd Barangay Assembly / BA2)
// Per SM1 Section 4.2 (pp. 20-25 & Annex 4) & SM7 Section 1.5.1 (p. 15)
// ===================================================================

var STAGE2_BODIES = [
  // minMembers: SM1 para. 43, "the CSPMC and each sub-committee will be composed of at least three CVs". The Bookkeeper is one person.
  { id: 'CSPMC', short: 'CSPMC', name: 'Community Sub-Project Management Committee', label: 'CSPMC Officers', desc: 'Overarching executive officers (Chairperson, Vice-Chair, Secretary, Treasurer)', chairRequired: true, minMembers: 3 },
  { id: 'CMSC', short: 'CMSC', name: 'Community Monitoring Sub-Committee', label: 'CMSC (Monitoring)', desc: 'Independent community monitoring & safeguards (min. 3 CVs, BResT provenance encouraged)', chairRequired: true, minMembers: 3 },
  { id: 'PPSC', short: 'PPSC', name: 'Proposal Preparation Sub-Committee', label: 'PPSC (Proposal)', desc: 'Prepares detailed sub-project proposal, engineering & cost estimates', chairRequired: true, minMembers: 3 },
  { id: 'PSC', short: 'PSC / BASC', name: 'Procurement & Bids/Awards Sub-Committee', label: 'PSC / BASC (Procurement)', desc: 'Community procurement, canvassing & contracting', chairRequired: true, minMembers: 3 },
  { id: 'PIT', short: 'SPISC / PIT', name: 'Sub-Project Implementation Team', label: 'SPISC / PIT (Implementation)', desc: 'Supervises civil works, materials and community labor', chairRequired: true, minMembers: 3 },
  { id: 'MISC', short: 'MISC', name: 'Monitoring & Inspection Sub-Committee', label: 'MISC (Inspection)', desc: 'Quality inspection of delivered materials & construction', chairRequired: true, minMembers: 3 },
  { id: 'AISC', short: 'AISC / AIT', name: 'Audit & Inventory Sub-Committee', label: 'AISC / AIT (Audit)', desc: 'Audits vouchers, books, disbursements and warehouse inventory', chairRequired: true, minMembers: 3 },
  { id: 'OMSC', short: 'O&MSC / OMT', name: 'Operations & Maintenance Sub-Committee', label: 'O&MSC / OMT (O&M)', desc: 'Formulates O&M Plan & organizes community user group', chairRequired: true, minMembers: 3 },
  { id: 'BOOKKEEPER', short: 'Bookkeeper', name: 'Community Bookkeeper / Assistant', label: 'Community Bookkeeper', desc: 'Custody of financial journals and books of accounts', chairRequired: false }
];

var STAGE2_BODY_MAP = {};
STAGE2_BODIES.forEach(function (b) { STAGE2_BODY_MAP[b.id] = b; });

function classifyStage2Committee(committee, position) {
  var c = normAlpha(committee || '');
  var p = normAlpha(position || '');
  var text = (c + ' ' + p).trim();
  if (!text) return null;

  // Exclude Stage 1 & Municipal bodies (BResT, SFMSC, SFMC Municipal, MResT)
  if (
    c.indexOf('barangayresilienceteam') !== -1 || c === 'brest' ||
    c.indexOf('municipalresilienceteam') !== -1 || c.indexOf('mrest') !== -1 ||
    c.indexOf('sfmsc') !== -1 || c.indexOf('sfmc') !== -1 ||
    c.indexOf('feedbackmechanism') !== -1
  ) {
    return null;
  }

  // Tokenize preserving CamelCase and punctuation word boundaries so short acronyms
  // like 'bac' never match inside words like 'feedback'
  var raw = String(committee || '') + ' ' + String(position || '');
  var words = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/);
  var hasWord = function (w) { return words.indexOf(w) !== -1; };
  var hasAnyWord = function (arr) { return arr.some(hasWord); };

  // 1. CMSC: Community Monitoring Sub-Committee
  if (hasWord('cmsc') || text.indexOf('communitymonitoring') !== -1 || (text.indexOf('monitoring') !== -1 && text.indexOf('inspection') === -1)) return 'CMSC';

  // 2. MISC: Monitoring and Inspection Sub-Committee
  if (hasWord('misc') || (text.indexOf('monitoring') !== -1 && text.indexOf('inspection') !== -1) || text.indexOf('inspection') !== -1) return 'MISC';

  // 3. PPSC: Proposal Preparation Sub-Committee
  if (hasWord('ppsc') || text.indexOf('proposalpreparation') !== -1 || text.indexOf('projectpreparation') !== -1 || text.indexOf('proposal') !== -1) return 'PPSC';

  // 4. PSC / BASC: Procurement & Bids/Awards Sub-Committee
  if (hasAnyWord(['psc', 'basc', 'bac']) || text.indexOf('procurement') !== -1 || text.indexOf('bidsandawards') !== -1 || text.indexOf('canvass') !== -1) return 'PSC';

  // 5. SPISC / PIT: Sub-Project Implementation Sub-Committee / Project Implementation Team
  if (hasAnyWord(['spisc', 'pit']) || text.indexOf('subprojectimplementation') !== -1 || text.indexOf('projectimplementation') !== -1 || text.indexOf('implementation') !== -1) return 'PIT';

  // 6. AISC / AIT: Audit and Inventory Sub-Committee
  if (hasAnyWord(['aisc', 'ait']) || text.indexOf('auditandinventory') !== -1 || text.indexOf('inventory') !== -1 || text.indexOf('audit') !== -1) return 'AISC';

  // 7. O&MSC / OMT: Operations and Maintenance Sub-Committee / Group
  if (hasAnyWord(['omsc', 'omg', 'omt']) || (hasWord('o') && hasWord('m')) || text.indexOf('operationandmaintenance') !== -1 || text.indexOf('operationsandmaintenance') !== -1 || text.indexOf('maintenance') !== -1) return 'OMSC';

  // 8. Bookkeeper: Community Bookkeeper / Assistant Bookkeeper
  if (text.indexOf('bookkeeper') !== -1 || text.indexOf('bookkeeping') !== -1) return 'BOOKKEEPER';

  // 9. Generic CSPMC / Officers
  if (hasWord('cspmc') || text.indexOf('subprojectmanagement') !== -1 || text.indexOf('communitysubproject') !== -1) return 'CSPMC';

  return null;
}

function evaluateCspmcBarangay(b, s2Vols) {
  var vols = s2Vols || [];
  var bodies = {};
  STAGE2_BODIES.forEach(function (body) { bodies[body.id] = []; });
  vols.forEach(function (v) {
    if (v.stage2Body && bodies[v.stage2Body]) {
      bodies[v.stage2Body].push(v);
    }
  });

  var cmscVols = bodies.CMSC || [];
  var cmscCount = cmscVols.length;
  var hasCmscLead = cmscVols.some(function (v) { return v.chair; });
  var cmscBrestAlum = cmscVols.filter(function (v) { return v.wasBrest; }).length;

  var cspmcVols = bodies.CSPMC || [];
  var hasCspmcLead = cspmcVols.some(function (v) { return v.chair; }) || vols.some(function (v) { return v.chair; });

  var women = vols.filter(function (v) { return v.sex === 'female'; }).length;
  var marg = vols.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;
  var womenPct = vols.length ? Math.round(women / vols.length * 100) : 0;
  var margPct = vols.length ? Math.round(marg / vols.length * 100) : 0;

  var activeBodies = STAGE2_BODIES.filter(function (body) {
    return bodies[body.id] && bodies[body.id].length > 0;
  });

  var reasons = [];
  if (vols.length === 0) {
    reasons.push('No Stage 2 (CSPMC & Sub-Committees) volunteers encoded in KCIS');
  } else {
    // 1. CMSC quorum check: min 3 CVs (SM7 Section 1.5.1 p. 15)
    if (cmscCount < 3) {
      reasons.push('CMSC quorum lacking: requires at least 3 Community Volunteers (currently has ' + cmscCount + ')');
    }
    // 2. CMSC leadership check: elected Chairperson/Lead
    if (cmscCount > 0 && !hasCmscLead) {
      reasons.push('CMSC has no designated Chairperson / Lead');
    }
    // 3. CSPMC leadership check: Chairperson/Lead (SM1 Section 4.2)
    if (!hasCspmcLead) {
      reasons.push('CSPMC has no designated Chairperson / Lead');
    }
    // 4. Women quota check: min 30%
    if (womenPct < 30) {
      reasons.push('Women representation is ' + womenPct + '% (minimum 30% required across Stage 2)');
    }
  }

  var status = vols.length === 0 ? 'Not encoded' : (reasons.length === 0 ? 'Encoded' : 'Needs fixing');

  return {
    b: b,
    vols: vols,
    bodies: bodies,
    activeBodies: activeBodies,
    cmscCount: cmscCount,
    hasCmscLead: hasCmscLead,
    cmscBrestAlum: cmscBrestAlum,
    hasCspmcLead: hasCspmcLead,
    women: women,
    womenPct: womenPct,
    marg: marg,
    margPct: margPct,
    reasons: reasons,
    status: status
  };
}

/** Index named volunteer and committee records, matched to a monitored location. */
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

  var out = { attendees: [], volunteers: [], mrest: [], unmatched: { attendees: 0, volunteers: 0 } };

  // Attendance is summarized in SNAP.attendanceRows; named records come only from volunteers.
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
      var s2Body = (kind === 'BREST' || kind === 'SFMSC' || kind === 'SEQ1') ? null : classifyStage2Committee(row[CV.committee], row[CV.position]);
      var r = place(p, p.barangay);
      r.type = 'volunteer'; r.kind = kind;
      r.committee = normText(row[CV.committee]);
      r.position = normText(row[CV.position]);
      r.chair = /^chair/i.test(normAlpha(row[CV.position])) || /lead/i.test(normAlpha(row[CV.position]));
      if (s2Body) {
        r.isStage2 = true;
        r.stage2Body = s2Body;
        r.stage2BodyLabel = STAGE2_BODY_MAP[s2Body] ? STAGE2_BODY_MAP[s2Body].label : s2Body;
        r.body = r.stage2BodyLabel;
      } else {
        r.isStage2 = false;
        r.stage2Body = '';
        r.stage2BodyLabel = '';
        r.body = kind === 'BREST' ? 'BResT' : kind === 'SFMSC' ? 'SFMSC' : '';
      }
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
  // Map BResT volunteers to check BResT provenance of Stage 2 volunteers (SM7 p. 15 recommendation)
  var brestKeys = {};
  out.volunteers.forEach(function (v) {
    if (v.kind === 'BREST' && v.key) {
      brestKeys[bk(v) + '|' + v.key] = true;
      if (v.loose) brestKeys[bk(v) + '|~' + v.loose] = true;
    }
  });

  out.volunteers.forEach(function (v) {
    if (v.isStage2) {
      var k = bk(v) + '|' + v.key;
      var lk = bk(v) + '|~' + v.loose;
      v.wasBrest = !!(brestKeys[k] || (v.loose && brestKeys[lk]));
    }
  });

  var seenVolunteer = {};
  out.volunteers.forEach(function (v) {
    v.flags = [];
    if (!v.key) { v.flags.push('noname'); return; }
    // The same person for the same committee in the same barangay: the export repeated the row.
    var at = bk(v) + '|' + v.key + '|' + normAlpha(v.committee);
    if (seenVolunteer[at]) v.flags.push('duplicate');
    seenVolunteer[at] = true;
    if (v.kind === 'NONE') v.flags.push('nocommittee');
    else if (v.kind !== 'BREST' && v.kind !== 'SFMSC' && !v.isStage2) v.flags.push('otherbody');
    if (v.wasBrest) v.flags.push('frombrest');
    // Summary counts cannot establish whether this named volunteer attended.
    v.attendanceCheck = 'Unavailable: Activity Tracker contains totals, not attendee names';
    if (v.sex !== 'male' && v.sex !== 'female') v.flags.push('nosex');
  });
  out.mrest.forEach(function (m) {
    m.flags = [];
    if (!m.key) m.flags.push('noname');
    if (m.sex !== 'male' && m.sex !== 'female') m.flags.push('nosex');
  });

  // search text, computed once
  ['volunteers', 'mrest'].forEach(function (k) {
    (out[k] || []).forEach(function (r) {
      r.q = normSearch([r.name, r.barangay, r.municipality, r.actLabel, r.committee, r.position].filter(Boolean).join(' '));
    });
  });

  // name -> records, for profiles
  out.byKey = {}; out.byLoose = {};
  ['volunteers', 'mrest'].forEach(function (k) {
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
  volunteers: [
    { id: 'all', label: 'All Volunteers' },
    { id: 'BREST', label: 'BResT (Stage 1)', test: function (r) { return r.kind === 'BREST'; } },
    { id: 'SFMSC', label: 'SFMSC (Stage 1/2)', test: function (r) { return r.kind === 'SFMSC'; } },
    { id: 'STAGE2', label: 'All Stage 2 (CSPMC & Sub-Committees)', test: function (r) { return r.isStage2; } },
    { id: 'CMSC', label: 'CMSC (Community Monitoring)', test: function (r) { return r.stage2Body === 'CMSC'; } },
    { id: 'CSPMC', label: 'CSPMC Officers', test: function (r) { return r.stage2Body === 'CSPMC'; } },
    { id: 'PSC', label: 'Procurement (PSC / BASC)', test: function (r) { return r.stage2Body === 'PSC'; } },
    { id: 'PIT', label: 'Implementation (SPISC / PIT)', test: function (r) { return r.stage2Body === 'PIT'; } },
    { id: 'AISC', label: 'Audit & Inventory (AISC)', test: function (r) { return r.stage2Body === 'AISC'; } },
    { id: 'MISC', label: 'Inspection (MISC)', test: function (r) { return r.stage2Body === 'MISC'; } },
    { id: 'PPSC', label: 'Proposal Prep (PPSC)', test: function (r) { return r.stage2Body === 'PPSC'; } },
    { id: 'OMSC', label: 'O&M (O&MSC / OMT)', test: function (r) { return r.stage2Body === 'OMSC'; } },
    { id: 'chair', label: 'Chairpersons / Leads', test: function (r) { return r.chair; } },
    { id: 'frombrest', label: 'From BResT (Alum)', test: function (r) { return r.wasBrest; } },
    { id: 'women', label: 'Women', test: function (r) { return r.sex === 'female'; } },
    { id: 'ippwd', label: 'IP or PWD', test: function (r) { return r.ip || r.pwd; } },
    { id: 'nocommittee', label: 'No committee' },
    { id: 'otherbody', label: 'Other activity committee' },
    { id: 'nosex', label: 'Sex not recorded' },
    { id: 'duplicate', label: 'Listed more than once' }
  ]
};

var FLAG_TEXT = {
  noname: ['bad', 'No name'],
  nocommittee: ['warn', 'No committee'], otherbody: ['warn', 'Other activity\'s committee'],
  frombrest: ['good', '✓ From BResT'], nosex: ['idle', 'Sex not recorded'], duplicate: ['warn', 'Listed more than once']
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

var VOL_STATE = { muni: '', brgy: '', body: 'all', position: 'all', sex: 'all', marg: 'all', flag: 'all', search: '', limit: 100, sortCol: 'name', sortDir: 'asc' };
var BRT_STATE = { muni: '', brgy: '', status: 'all', search: '', sortCol: 'brgy', sortDir: 'asc', teamSortCol: 'brgy', teamSortDir: 'asc' };
var MRT_STATE = { muni: '', search: '', clusterFilter: 'all', showOrgChart: true, viewMode: 'org', sortCol: 'name', sortDir: 'asc', matrixFilter: 'all' };
// ===================================================================
// Household counts per assembly (used by the Municipality Profile and DQA)
// ===================================================================

/** The household counts of one assembly in a barangay row (the BA1 copy on the row itself for older rows). */
function hhOf(b, asm) {
  var a = b && b.activities && b.activities[asm || 'BA1'];
  return a || ((asm || 'BA1') === 'BA1' ? b || {} : {});
}

/** met | below | incomplete | noreport, for one assembly in a barangay. */
function hhStatus(h) {
  if (h.hhListed > 0) return h.hhRate >= 0.7 ? 'met' : 'below';
  return h.hhIncomplete ? 'incomplete' : 'noreport';
}

/** 4Ps / IP / SLP households represented, from the optional breakdown columns. */
function hhSectorCell(d) {
  if (!d || (d.hh4Ps === null && d.hhIp === null && d.hhSlp === null)) return '<span class="tiny text-muted">—</span>';
  var v = function (x) { return x === null ? '—' : n(x); };
  return '<span class="tiny" title="' + attr('4Ps families ' + v(d.fam4Ps) + ' · SLP families ' + v(d.famSlp)) + '">' +
    '4Ps <strong>' + v(d.hh4Ps) + '</strong> · IP <strong>' + v(d.hhIp) + '</strong> · SLP <strong>' + v(d.hhSlp) + '</strong></span>';
}

/** Individuals present by sex, from the optional breakdown columns. */
function hhIndividualsCell(d) {
  if (!d || (d.indivTotal === null && d.indivFemale === null && d.indivMale === null)) return '<span class="tiny text-muted">—</span>';
  var v = function (x) { return x === null ? '—' : n(x); };
  return '<span class="tiny"><strong>' + v(d.indivTotal) + '</strong> · ' + v(d.indivFemale) + ' F · ' + v(d.indivMale) + ' M</span>';
}

/** The assemblies that carry household counts (BA1, BA2, BA3). */
function hhAssemblies() {
  var list = ((typeof SNAP !== 'undefined' && SNAP && SNAP.pipeline) || []).filter(function (p) { return p.households; });
  return list.length ? list.map(function (p) { return { code: p.code, label: p.label }; }) : [{ code: 'BA1', label: '1st Barangay Assembly' }];
}

// ===================================================================
// MODULE 3: COMMUNITY VOLUNTEERS
// ===================================================================

function getVolunteersTriageSummary(list) {
  var l = list || [];
  var total = l.length;
  var women = l.filter(function (v) { return v.sex === 'female'; }).length;
  var men = l.filter(function (v) { return v.sex === 'male'; }).length;
  var chairs = l.filter(function (v) { return v.chair; }).length;
  var ipCount = l.filter(function (v) { return v.ip; }).length;
  var pwdCount = l.filter(function (v) { return v.pwd; }).length;
  var marg = l.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;
  var brestCount = l.filter(function (v) { return v.kind === 'BREST'; }).length;
  var stage2Count = l.filter(function (v) { return v.isStage2; }).length;
  var sfmscCount = l.filter(function (v) { return v.kind === 'SFMSC'; }).length;
  var flagged = l.filter(function (v) { return v.flags && v.flags.length > 0; }).length;
  var womenRate = total > 0 ? (women / total) : 0;
  var margRate = total > 0 ? (marg / total) : 0;

  return {
    total: total,
    women: women,
    men: men,
    womenRate: womenRate,
    chairs: chairs,
    ipCount: ipCount,
    pwdCount: pwdCount,
    marg: marg,
    margRate: margRate,
    brestCount: brestCount,
    stage2Count: stage2Count,
    sfmscCount: sfmscCount,
    flagged: flagged
  };
}

function renderVolunteersTriageTray(summary) {
  var isAllGood = summary.womenRate >= 0.5 && summary.flagged === 0;
  var items = [];

  // 1. All Volunteers
  items.push(
    '<button type="button" class="triage-item' + (VOL_STATE.body === 'all' && VOL_STATE.position === 'all' && VOL_STATE.sex === 'all' && VOL_STATE.marg === 'all' && VOL_STATE.flag === 'all' ? ' active-triage' : '') + '" data-act="vol-triage" data-v="all" title="View all encoded community volunteers">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.total) + '</span>' +
        '<span class="triage-item-label">Total Encoded Volunteers</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 2. Women Representation (>=50%)
  var womenGood = summary.womenRate >= 0.5;
  items.push(
    '<button type="button" class="triage-item ' + (womenGood ? 'triage-good' : 'triage-warn') + (VOL_STATE.sex === 'female' || VOL_STATE.marg === 'women' ? ' active-triage' : '') + '" data-act="vol-triage" data-v="women" title="Filter female volunteers (GSI Target ≥50%)">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + pctText(summary.womenRate) + ' <span class="tiny">(' + n(summary.women) + ')</span></span>' +
        '<span class="triage-item-label">Women (≥50% Target)</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 3. Committee Chairs & Leads
  items.push(
    '<button type="button" class="triage-item triage-good' + (VOL_STATE.position === 'chair' ? ' active-triage' : '') + '" data-act="vol-triage" data-v="chair" title="Filter committee chairpersons and sub-committee team leads">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.chairs) + '</span>' +
        '<span class="triage-item-label">Chairs &amp; Team Leads</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 4. Marginalized Volunteers (Women, IP, PWD)
  items.push(
    '<button type="button" class="triage-item triage-good' + (VOL_STATE.marg === 'ippwd' ? ' active-triage' : '') + '" data-act="vol-triage" data-v="marginalized" title="Filter IP or PWD community volunteers">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.ipCount + summary.pwdCount) + '</span>' +
        '<span class="triage-item-label">IP &amp; PWD Volunteers</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 5. Cross-check Flags / Review
  if (summary.flagged > 0) {
    items.push(
      '<button type="button" class="triage-item triage-bad' + (VOL_STATE.flag === 'has_flags' ? ' active-triage' : '') + '" data-act="vol-triage" data-v="flagged" title="Filter volunteers with data anomalies or policy flags">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.flagged) + '</span>' +
          '<span class="triage-item-label">Cross-check Flags</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  return (
    '<div class="triage-tray">' +
      '<div class="triage-header">' +
        '<div class="triage-title">' +
          icon('users') + ' <span>Community Volunteers Action Center</span>' +
        '</div>' +
        '<div class="triage-status ' + (isAllGood ? 'status-good' : 'status-warn') + '">' +
          icon(isAllGood ? 'check-circle-2' : 'alert-circle') +
          '<span>' + (isAllGood ? 'Inclusive Quorum Met (≥50% Women)' : (summary.womenRate < 0.5 ? 'Women quota under 50% target' : 'Review ' + summary.flagged + ' flagged records')) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="triage-grid">' +
        items.join('') +
      '</div>' +
    '</div>'
  );
}

function renderVolunteers() {
  var body = $('vol-body');
  if (!body) return;
  if (!LOADED.volunteers) { body.innerHTML = '<div class="card"><p class="muted">Load the Community Volunteer List first.</p></div>'; return; }
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
  var brgys = ((SNAP && SNAP.barangayRows) || readBaseline().rows).filter(function (b) { return !activeMuni || b.province + '|' + b.municipality === activeMuni; })
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
    if (VOL_STATE.body === 'STAGE2' && !v.isStage2) return false;
    if (VOL_STATE.body === 'CMSC' && v.stage2Body !== 'CMSC') return false;
    if (VOL_STATE.body === 'CSPMC' && v.stage2Body !== 'CSPMC') return false;
    if (VOL_STATE.body === 'OTHER' && (v.kind === 'BREST' || v.kind === 'SFMSC' || v.isStage2)) return false;
    if (VOL_STATE.position === 'chair' && !v.chair) return false;
    if (VOL_STATE.position === 'member' && v.chair) return false;
    if (VOL_STATE.sex !== 'all' && v.sex !== VOL_STATE.sex) return false;
    if (VOL_STATE.marg === 'women' && v.sex !== 'female') return false;
    if (VOL_STATE.marg === 'ip' && !v.ip) return false;
    if (VOL_STATE.marg === 'pwd' && !v.pwd) return false;
    if (VOL_STATE.marg === 'ippwd' && !v.ip && !v.pwd) return false;
    if (VOL_STATE.flag === 'has_flags') {
      if (!v.flags || v.flags.length === 0) return false;
    } else if (VOL_STATE.flag && VOL_STATE.flag !== 'all') {
      var fDef = PEOPLE_FLAGS.volunteers.filter(function (f) { return f.id === VOL_STATE.flag; })[0];
      if (fDef) {
        if (typeof fDef.test === 'function') {
          if (!fDef.test(v)) return false;
        } else if ((v.flags || []).indexOf(VOL_STATE.flag) === -1) {
          return false;
        }
      }
    }
    if (q && v.q.indexOf(q) === -1) return false;
    return true;
  });

  // KPIs & Summary
  var summary = getVolunteersTriageSummary(list);
  var totalVol = list.length;
  var womenCount = summary.women;
  var margCount = summary.marg;
  var chairCount = summary.chairs;
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
      '<td class="sticky"><strong>' + nameCell(v) + '</strong></td>' +
      '<td>' + esc(v.sex || '—') + '</td>' +
      '<td>' + (v.ip ? '<span class="pill idle">IP</span> ' : '') + (v.pwd ? '<span class="pill idle">PWD</span>' : (!v.ip ? '—' : '')) + '</td>' +
      '<td>' + (v.body ? '<strong>' + esc(v.body) + '</strong>' : esc(v.committee || '—')) + '</td>' +
      '<td>' + (v.chair ? '<span class="pill good">👑 ' + esc(v.position) + '</span>' : esc(v.position || '—')) + '</td>' +
      '<td>' + placeCell(v) + '</td>' +
      (!isMuni ? '<td>' + esc(v.municipality) + '</td>' : '') +
      '<td>' + esc(v.start || '—') + '</td>' +
      '<td>' + flagPills(v) + '</td>' +
    '</tr>';
  }).join('');

  var th = function (col, label, num, sub, title, sticky, extraClass, term, tooltip) {
    return sortTh({
      col: col,
      curCol: curCol,
      dir: curDir,
      label: label,
      num: num,
      sub: sub,
      title: title,
      sticky: sticky,
      act: 'vol-sort',
      extraClass: extraClass,
      term: term,
      tooltip: tooltip
    });
  };

  var vq = normSearch(VOL_STATE.search.trim());
  var baseVols = list.filter(function (r) {
    if (VOL_STATE.brgy && (r.province + '|' + r.municipality + '|' + r.barangay !== VOL_STATE.brgy)) return false;
    if (vq && r.q.indexOf(vq) === -1) return false;
    return true;
  });

  var bodyMatches = function (r, code) {
    if (code === 'all') return true;
    if (code === 'BREST') return r.kind === 'BREST';
    if (code === 'SFMSC') return r.kind === 'SFMSC';
    if (code === 'STAGE2') return !!r.isStage2;
    if (code === 'CMSC') return r.stage2Body === 'CMSC';
    if (code === 'OTHER') return r.kind !== 'BREST' && r.kind !== 'SFMSC' && !r.isStage2;
    return true;
  };

  var bodyCards = [
    ['all', 'All Committees'],
    ['BREST', 'BResT (Stage 1)'],
    ['STAGE2', 'CSPMC & Sub-Comms'],
    ['CMSC', 'CMSC (Monitoring)'],
    ['SFMSC', 'SFMSC'],
    ['OTHER', 'Other Bodies']
  ].map(function (b) {
    var cnt = baseVols.filter(function (r) {
      if (!bodyMatches(r, b[0])) return false;
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
    ['chair', 'Chairpersons / Leads'],
    ['member', 'Members']
  ].map(function (p) {
    var cnt = baseVols.filter(function (r) {
      if (!bodyMatches(r, VOL_STATE.body)) return false;
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

  var quickVolunteerChips = '<div class="quick-filter-bar">' +
    '<span class="tiny text-muted" style="font-weight:700;margin-right:4px;">Quick Presets:</span>' +
    '<button type="button" class="quick-filter-chip' + (VOL_STATE.body === 'all' && VOL_STATE.position === 'all' && VOL_STATE.sex === 'all' && VOL_STATE.marg === 'all' && VOL_STATE.flag === 'all' ? ' active' : '') + '" data-act="vol-chip" data-type="body" data-v="all">' +
      '<span>All Volunteers</span> <span class="tiny" style="opacity:0.85">(' + n(baseVols.length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (VOL_STATE.body === 'BREST' ? ' active' : '') + '" data-act="vol-chip" data-type="body" data-v="BREST">' +
      '<span>BResT (Stage 1)</span> <span class="tiny" style="opacity:0.85">(' + n(baseVols.filter(function (r) { return r.kind === 'BREST'; }).length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (VOL_STATE.body === 'STAGE2' ? ' active' : '') + '" data-act="vol-chip" data-type="body" data-v="STAGE2">' +
      '<span>CSPMC &amp; Sub-Comms</span> <span class="tiny" style="opacity:0.85">(' + n(baseVols.filter(function (r) { return r.isStage2; }).length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (VOL_STATE.body === 'SFMSC' ? ' active' : '') + '" data-act="vol-chip" data-type="body" data-v="SFMSC">' +
      '<span>SFMSC</span> <span class="tiny" style="opacity:0.85">(' + n(baseVols.filter(function (r) { return r.kind === 'SFMSC'; }).length) + ')</span>' +
    '</button>' +
    '<span style="color:var(--border-strong);margin:0 2px">|</span>' +
    '<button type="button" class="quick-filter-chip chip-good' + (VOL_STATE.position === 'chair' ? ' active' : '') + '" data-act="vol-chip" data-type="pos" data-v="chair">' +
      '<span>👑 Chairs / Leads</span> <span class="tiny" style="opacity:0.85">(' + n(baseVols.filter(function (r) { return r.chair; }).length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-good' + (VOL_STATE.sex === 'female' ? ' active' : '') + '" data-act="vol-chip" data-type="sex" data-v="female">' +
      '<span>👩 Women</span> <span class="tiny" style="opacity:0.85">(' + n(baseVols.filter(function (r) { return r.sex === 'female'; }).length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (VOL_STATE.marg === 'ippwd' ? ' active' : '') + '" data-act="vol-chip" data-type="marg" data-v="ippwd">' +
      '<span>👥 IP / PWD</span> <span class="tiny" style="opacity:0.85">(' + n(baseVols.filter(function (r) { return r.ip || r.pwd; }).length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-warn' + (VOL_STATE.flag === 'has_flags' ? ' active' : '') + '" data-act="vol-chip" data-type="flag" data-v="has_flags">' +
      '<span>⚠️ Flags</span> <span class="tiny" style="opacity:0.85">(' + n(baseVols.filter(function (r) { return r.flags && r.flags.length > 0; }).length) + ')</span>' +
    '</button>' +
  '</div>';

  var scopeBanner = isMuni
    ? '<div class="static-val">' + icon('map-pin') + ' <span>Municipality: <strong>' + esc(home().municipality) + '</strong> (' + esc(home().province) + ')</span></div>'
    : '<label class="field"><span>Municipality</span><select data-act="vol-muni">' + mOpts + '</select></label>';

  var subNav = '<div class="sub-nav-tabs">' +
    '<button type="button" class="sub-nav-btn active">' + icon('users') + ' <span>Community Volunteers</span></button>' +
    '<button type="button" class="sub-nav-btn" data-go="brest">' + icon('shield') + ' <span>BResT Teams</span></button>' +
    '<button type="button" class="sub-nav-btn" data-go="cspmc">' + icon('layers') + ' <span>CSPMC &amp; Sub-Committees (Stage 2)</span></button>' +
  '</div>';

  body.innerHTML = subNav + (typeof renderDqaBreadcrumb === 'function' ? renderDqaBreadcrumb() : '') +
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>Community Volunteers &amp; Committees</h2><p class="tiny">Individual attendance cross-checks are unavailable from Activity Tracker summaries.</p>' +
          '<div class="muted">' + (isMuni ? 'Dedicated volunteer directory for <strong>' + esc(home().municipality) + '</strong>.' : 'Region-wide community volunteer rosters.') + ' Tracks BResT, SFMSC, Stage 2 committees, GSI inclusion metrics (≥50% women), and committee chairpersons.</div>' +
        '</div>' +
        '<div class="row-actions" style="margin:0"><button class="btn ghost btn-sm" data-act="vol-export">' + icon('download') + ' <span>Export Volunteers CSV</span></button></div>' +
      '</div>' +
      kpiPageLink('volunteers', activeMuni) +
      '<div class="toolbar-row"><div class="filters" style="margin:0;flex:1">' +
        scopeBanner +
        '<label class="field"><span>Barangay</span><select data-act="vol-brgy">' + bOpts + '</select></label>' +
        '<label class="field" style="flex:1"><span>Search</span><input type="search" id="vol-search" value="' + attr(VOL_STATE.search) + '" placeholder="Volunteer name, committee, position…"></label>' +
        (VOL_STATE.muni || VOL_STATE.brgy || VOL_STATE.body !== 'all' || VOL_STATE.position !== 'all' || VOL_STATE.sex !== 'all' || VOL_STATE.marg !== 'all' || VOL_STATE.flag !== 'all' || VOL_STATE.search ? '<button type="button" class="btn ghost btn-sm" data-act="vol-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
      '</div><span class="tiny">Showing <strong>' + n(shown.length) + '</strong> of <strong>' + n(sorted.length) + '</strong></span></div>' +
      quickVolunteerChips +
      '<div class="filter-cards" style="margin-top:10px;margin-bottom:12px">' + bodyCards + '<span class="sep" style="margin:0 4px;color:var(--border-strong)">|</span>' + posCards + '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('name', 'Volunteer Name', false, null, 'Official volunteer name in KCIS Community Volunteers list', true) +
        th('sex', 'Sex', false, null, null, false, '', 'femaleratio', 'Gender / Sex. GSI policy targets at least 50% female participation') +
        th('ippwd', 'IP / PWD', false, null, null, false, '', 'marginalized', 'Sectoral tags: Indigenous Peoples or Persons with Disability') +
        th('committee', 'Committee', false, null, 'Designated community body or sub-committee') +
        th('position', 'Position', false, null, 'Elected or designated role within committee') +
        th('brgy', 'Barangay', false, null, 'Barangay of volunteer service') +
        (!isMuni ? th('muni', 'Municipality', false, null, 'Local Government Unit') : '') +
        th('start', 'Term Start', false, null, 'Start date or election date recorded') +
        th('flags', 'Cross-check Flags', false, null, 'Volunteer profile and committee checks; individual attendance is unavailable') +
      '</tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="10" class="empty-state">No volunteers match these filters.</td></tr>') + '</tbody></table></div>' +
      (shown.length < sorted.length ? '<div class="row-actions" style="margin-top:12px"><button class="btn ghost btn-sm" data-act="vol-more">Show ' + Math.min(100, sorted.length - shown.length) + ' more</button><span class="tiny">Showing ' + n(shown.length) + ' of ' + n(sorted.length) + '</span></div>' : '') +
    '</div>';

  bindSearch('vol-search', function (v) { VOL_STATE.search = v; VOL_STATE.limit = 100; renderVolunteers(); });
  refreshIcons($('vol-body'));
}

// ===================================================================
// MODULE 4: BResT (Barangay Resilience Team Dedicated Module)
// ===================================================================

function quotaMiniProgressBar(count, total, targetRate, targetLabel) {
  if (!total || total <= 0) {
    return '<span class="tiny text-muted">—</span>';
  }
  var rate = count / total;
  var pct = Math.max(0, Math.min(100, Math.round(rate * 100)));
  var isMet = rate >= targetRate;
  var statusCls = isMet ? 'is-met' : 'is-below';
  var colorVar = isMet ? 'var(--good-text)' : 'var(--warn-text)';
  var targetPct = Math.round(targetRate * 100);

  return (
    '<div class="quota-mini-cell" title="' + attr(n(count) + ' of ' + n(total) + ' (' + pct + '%). ' + targetLabel) + '">' +
      '<div class="quota-label-row">' +
        '<strong style="color:' + colorVar + '">' + n(count) + ' <span class="tiny" style="font-size:10.5px">(' + pct + '%)</span></strong>' +
        '<span class="tiny muted" style="font-size:9.5px">' + targetPct + '% req</span>' +
      '</div>' +
      '<div class="quota-progress-wrap">' +
        '<div class="quota-progress-bar ' + statusCls + '" style="width:' + pct + '%;' + (isMet ? 'background:var(--good);' : 'background:var(--warn);') + '"></div>' +
        '<div class="quota-threshold-marker" style="left:' + targetPct + '%;" title="Target: ' + targetPct + '%"></div>' +
      '</div>' +
    '</div>'
  );
}

function getBrestTriageSummary(brgys, brestVols) {
  var bList = brgys || [];
  var vList = brestVols || [];
  var totalBrgys = bList.length;
  var encodedBrgys = 0;
  var needsFixBrgys = 0;
  var notEncodedBrgys = 0;
  var totalVols = vList.length;
  var womenVols = vList.filter(function (v) { return v.sex === 'female'; }).length;
  var margVols = vList.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;
  var totalIssues = 0;

  bList.forEach(function (b) {
    var st = b.volunteers && b.volunteers.BREST ? b.volunteers.BREST.status : 'Not encoded';
    if (st === 'Encoded') {
      encodedBrgys++;
    } else if (st === 'Needs fixing') {
      needsFixBrgys++;
      var reasons = (b.volunteers && b.volunteers.BREST && b.volunteers.BREST.reasons) || [];
      totalIssues += reasons.length;
    } else {
      notEncodedBrgys++;
    }
  });

  var womenRate = totalVols > 0 ? (womenVols / totalVols) : 0;
  var margRate = totalVols > 0 ? (margVols / totalVols) : 0;
  var formationRate = totalBrgys > 0 ? ((encodedBrgys + needsFixBrgys) / totalBrgys) : 0;

  return {
    totalBrgys: totalBrgys,
    encodedBrgys: encodedBrgys,
    needsFixBrgys: needsFixBrgys,
    notEncodedBrgys: notEncodedBrgys,
    totalVols: totalVols,
    womenVols: womenVols,
    margVols: margVols,
    womenRate: womenRate,
    margRate: margRate,
    formationRate: formationRate,
    totalIssues: totalIssues
  };
}

function renderBrestTriageTray(summary) {
  var isAllGood = summary.encodedBrgys === summary.totalBrgys && summary.totalBrgys > 0;
  var items = [];

  // 1. All Barangays
  items.push(
    '<button type="button" class="triage-item' + (BRT_STATE.status === 'all' ? ' active-triage' : '') + '" data-act="brt-triage" data-v="all" title="View all monitored barangay teams">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.totalBrgys) + '</span>' +
        '<span class="triage-item-label">Monitored Barangays</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 2. Fully Compliant Teams
  items.push(
    '<button type="button" class="triage-item triage-good' + (BRT_STATE.status === 'encoded' ? ' active-triage' : '') + '" data-act="brt-triage" data-v="encoded" title="Filter fully compliant BResT teams">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.encodedBrgys) + '</span>' +
        '<span class="triage-item-label">Compliant Teams</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 3. Needs Attention / Validation Gaps
  if (summary.needsFixBrgys > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn' + (BRT_STATE.status === 'needs_fixing' ? ' active-triage' : '') + '" data-act="brt-triage" data-v="needs_fixing" title="Filter teams requiring corrections or missing members">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.needsFixBrgys) + '</span>' +
          '<span class="triage-item-label">Needs Attention</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 4. Not Yet Encoded
  if (summary.notEncodedBrgys > 0) {
    items.push(
      '<button type="button" class="triage-item triage-bad' + (BRT_STATE.status === 'not_encoded' ? ' active-triage' : '') + '" data-act="brt-triage" data-v="not_encoded" title="Filter barangays with pending BResT formation">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.notEncodedBrgys) + '</span>' +
          '<span class="triage-item-label">Not Yet Encoded</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 5. Marginalized Inclusion Rate (Women, IP, PWD)
  var margGood = summary.margRate >= 0.3;
  items.push(
    '<button type="button" class="triage-item ' + (margGood ? 'triage-good' : 'triage-warn') + '" data-act="brt-triage" data-v="all" title="Marginalized volunteer inclusion rate across BResT (Target ≥30%)">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + pctText(summary.margRate) + ' <span class="tiny">(' + n(summary.margVols) + ')</span></span>' +
        '<span class="triage-item-label">Marginalized (≥30% Target)</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  return (
    '<div class="triage-tray">' +
      '<div class="triage-header">' +
        '<div class="triage-title">' +
          icon('shield') + ' <span>BResT Formation Action Center</span>' +
        '</div>' +
        '<div class="triage-status ' + (isAllGood ? 'status-good' : 'status-warn') + '">' +
          icon(isAllGood ? 'check-circle-2' : 'alert-circle') +
          '<span>' + (isAllGood ? 'All Teams Fully Organized &amp; Compliant' : (summary.needsFixBrgys + ' teams need attention · ' + summary.notEncodedBrgys + ' pending')) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="triage-grid">' +
        items.join('') +
      '</div>' +
    '</div>'
  );
}

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

  // KPIs & Triage Summary
  var summary = getBrestTriageSummary(brgys, brestVols);
  var totalBrgys = summary.totalBrgys;
  var encodedBrgys = summary.encodedBrgys;
  var needsFixBrgys = summary.needsFixBrgys;
  var notEncodedBrgys = summary.notEncodedBrgys;

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

  // Section 1: Barangay Teams Tabular Matrix
  var curTeamCol = BRT_STATE.teamSortCol || 'brgy';
  var curTeamDir = BRT_STATE.teamSortDir || 'asc';
  var selectedBkey = BRT_STATE.brgy;

  var teamItems = filteredBrgys.map(function (b) {
    var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
    var bVols = brestVols.filter(function (v) { return v.barangay === b.barangay && v.municipality === b.municipality; });
    var st = b.volunteers && b.volunteers.BREST ? b.volunteers.BREST.status : 'Not encoded';
    var reasons = (b.volunteers && b.volunteers.BREST && b.volunteers.BREST.reasons) || [];
    var women = bVols.filter(function (v) { return v.sex === 'female'; }).length;
    var marg = bVols.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;
    var sectors = [];
    bVols.forEach(function (v) {
      var p = v.position ? v.position.trim() : '';
      if (p && sectors.indexOf(p) === -1) sectors.push(p);
    });
    return {
      b: b,
      bkey: bkey,
      bVols: bVols,
      st: st,
      reasons: reasons,
      women: women,
      marg: marg,
      sectors: sectors,
      womenPct: bVols.length ? Math.round(women / bVols.length * 100) : 0,
      margPct: bVols.length ? Math.round(marg / bVols.length * 100) : 0
    };
  });

  var teamExt = {
    brgy: function (t) { return t.b.barangay; },
    muni: function (t) { return t.b.municipality; },
    members: function (t) { return t.bVols.length; },
    women: function (t) { return t.women; },
    womenPct: function (t) { return t.bVols.length ? t.women / t.bVols.length : -1; },
    marg: function (t) { return t.bVols.length ? t.marg / t.bVols.length : -1; },
    sectors: function (t) { return t.sectors.length; },
    status: function (t) { return t.st === 'Encoded' ? 2 : (t.st === 'Needs fixing' ? 1 : 0); },
    issues: function (t) { return t.reasons.length; }
  };

  var sortedTeams = tblSort(teamItems, curTeamCol, curTeamDir, teamExt);

  var teamTh = function (col, label, num, sub, title, sticky, extraClass, term, tooltip) {
    return sortTh({
      col: col,
      curCol: curTeamCol,
      dir: curTeamDir,
      label: label,
      num: num,
      sub: sub,
      title: title,
      sticky: sticky,
      act: 'brt-team-sort',
      extraClass: extraClass,
      term: term,
      tooltip: tooltip
    });
  };

  var teamRowsHtml = sortedTeams.map(function (item) {
    var b = item.b;
    var bkey = item.bkey;
    var bVols = item.bVols;
    var st = item.st;
    var reasons = item.reasons;
    var isSelected = selectedBkey === bkey;

    var statusPill = st === 'Encoded'
      ? '<span class="pill good">✓ Compliant</span>'
      : (st === 'Needs fixing' ? '<span class="pill warn">⚠ Needs Attention</span>' : '<span class="pill bad">○ Not Encoded</span>');

    var issuesCell = reasons.length > 0
      ? '<button type="button" class="btn bad btn-xs lacking-btn" data-act="open-brest-issues" data-brgy="' + attr(bkey) + '" title="Click to view all ' + reasons.length + ' validation issues">' +
          icon('alert-circle') + ' <span>' + n(reasons.length) + ' lacking</span>' +
        '</button>'
      : '<span class="pill good tiny" title="No validation issues">✓ None</span>';

    var sectorsHtml = item.sectors.length
      ? '<span title="' + attr(item.sectors.join(', ')) + '">' + esc(item.sectors.slice(0, 2).join(', ')) + (item.sectors.length > 2 ? ' <span class="tiny muted">+' + (item.sectors.length - 2) + ' more</span>' : '') + '</span>'
      : '<span class="tiny muted">No roles tagged</span>';

    var womenMini = quotaMiniProgressBar(item.women, item.bVols.length, 0.5, 'Target ≥50% Women representation');
    var margMini = quotaMiniProgressBar(item.marg, item.bVols.length, 0.3, 'Target ≥30% Marginalized representation (Women, IP, PWD)');

    return '<tr class="' + (isSelected ? 'active-row ' : '') + (st === 'Needs fixing' ? 'row-warn' : '') + '">' +
      '<td class="sticky"><strong>' + esc(b.barangay) + '</strong>' +
        (isSelected ? ' <span class="pill good tiny">Viewing</span>' : '') +
      '</td>' +
      (!isMuni ? '<td>' + esc(b.municipality) + '</td>' : '') +
      '<td class="num"><strong>' + n(bVols.length) + '</strong></td>' +
      '<td class="num">' + womenMini + '</td>' +
      '<td class="num">' + margMini + '</td>' +
      '<td>' + sectorsHtml + '</td>' +
      '<td>' + statusPill + '</td>' +
      '<td>' + issuesCell + '</td>' +
      '<td><button type="button" class="btn ghost btn-xs" data-act="brt-pick-brgy" data-v="' + attr(bkey) + '" title="Filter members directory below to ' + esc(b.barangay) + '">' +
        icon('users') + ' <span>' + (isSelected ? 'Selected' : 'Inspect (' + n(bVols.length) + ')') + '</span>' +
      '</button></td>' +
    '</tr>';
  }).join('');

  // Section 2: Members Directory Table
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
      '<td>' + (v.chair ? '<span class="pill good">👑 ' + esc(v.position) + '</span>' : esc(v.position || 'Member')) + '</td>' +
      '<td>' + esc(v.sex || '—') + '</td>' +
      '<td>' + (v.ip ? '<span class="pill idle">IP</span> ' : '') + (v.pwd ? '<span class="pill idle">PWD</span>' : (!v.ip ? '—' : '')) + '</td>' +
      '<td>' + esc(v.start || '—') + '</td>' +
      '<td>' + flagPills(v) + '</td>' +
    '</tr>';
  }).join('');

  var th = function (col, label, num, sub, title, sticky, extraClass, term, tooltip) {
    return sortTh({
      col: col,
      curCol: curCol,
      dir: curDir,
      label: label,
      num: num,
      sub: sub,
      title: title,
      sticky: sticky,
      act: 'brt-sort',
      extraClass: extraClass,
      term: term,
      tooltip: tooltip
    });
  };

  var bq = normSearch(BRT_STATE.search.trim());
  var baseBrgys = bq ? brgys.filter(function (b) {
    return normSearch(b.barangay + ' ' + b.municipality).indexOf(bq) !== -1;
  }) : brgys;
  var cTotal = baseBrgys.length;
  var cEnc = baseBrgys.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Encoded'; }).length;
  var cFix = baseBrgys.filter(function (b) { return b.volunteers && b.volunteers.BREST && b.volunteers.BREST.status === 'Needs fixing'; }).length;
  var cNot = cTotal - cEnc - cFix;

  var quickBrestChips = '<div class="quick-filter-bar">' +
    '<span class="tiny text-muted" style="font-weight:700;margin-right:4px;">BResT Presets:</span>' +
    '<button type="button" class="quick-filter-chip' + (BRT_STATE.status === 'all' ? ' active' : '') + '" data-act="brt-status" data-v="all">' +
      '<span>All Teams</span> <span class="tiny" style="opacity:0.85">(' + n(cTotal) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-good' + (BRT_STATE.status === 'encoded' ? ' active' : '') + '" data-act="brt-status" data-v="encoded">' +
      '<span>✓ Compliant</span> <span class="tiny" style="opacity:0.85">(' + n(cEnc) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-warn' + (BRT_STATE.status === 'needs_fixing' ? ' active' : '') + '" data-act="brt-status" data-v="needs_fixing">' +
      '<span>⚠️ Needs Attention</span> <span class="tiny" style="opacity:0.85">(' + n(cFix) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-bad' + (BRT_STATE.status === 'not_encoded' ? ' active' : '') + '" data-act="brt-status" data-v="not_encoded">' +
      '<span>○ Not Encoded</span> <span class="tiny" style="opacity:0.85">(' + n(cNot) + ')</span>' +
    '</button>' +
    (selectedBkey ? '<button type="button" class="quick-filter-chip active chip-good" data-act="brt-pick-brgy" data-v="" title="Clear barangay selection and show all teams">' +
      '<span>Selected: ' + esc(selectedBkey.split('|')[2] || selectedBkey) + '</span> <span class="tiny">✕ Clear</span>' +
    '</button>' : '') +
  '</div>';

  var bOpts = '<option value="">All Barangays</option>' + brgys.map(function (b) {
    var v = b.province + '|' + b.municipality + '|' + b.barangay;
    return '<option value="' + attr(v) + '"' + (selectedBkey === v ? ' selected' : '') + '>' + esc(b.barangay) + '</option>';
  }).join('');

  var subNav = '<div class="sub-nav-tabs">' +
    '<button type="button" class="sub-nav-btn" data-go="volunteers">' + icon('users') + ' <span>Community Volunteers</span></button>' +
    '<button type="button" class="sub-nav-btn active">' + icon('shield') + ' <span>BResT Teams</span></button>' +
    '<button type="button" class="sub-nav-btn" data-go="cspmc">' + icon('layers') + ' <span>CSPMC &amp; Sub-Committees (Stage 2)</span></button>' +
  '</div>';

  body.innerHTML = subNav + (typeof renderDqaBreadcrumb === 'function' ? renderDqaBreadcrumb() : '') +
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>Barangay Resilience Team (BResT) Management</h2>' +
          '<div class="muted">' + (isMuni ? 'Monitoring BResT formation for <strong>' + esc(home().municipality) + '</strong>.' : 'Region-wide BResT compliance monitor.') + ' Evaluates volunteer team formation, sectoral purok coverage, and marginalized representation (&ge;30%) under Stage 1.</div>' +
        '</div>' +
        '<div class="row-actions" style="margin:0">' +
          '<button class="btn ghost btn-sm" data-act="brt-teams-export">' + icon('download') + ' <span>Export Teams CSV</span></button>' +
          '<button class="btn ghost btn-sm" data-act="brt-export">' + icon('download') + ' <span>Export Members CSV</span></button>' +
        '</div>' +
      '</div>' +
      kpiPageLink('brest', activeMuni) +
      '<div class="toolbar-row" style="margin-top:14px;margin-bottom:8px">' +
        quickBrestChips +
        '<label class="field" style="min-width:240px"><span>Search Barangay / Volunteer</span><input type="search" id="brt-search" value="' + attr(BRT_STATE.search) + '" placeholder="Search…"></label>' +
        (BRT_STATE.status !== 'all' || BRT_STATE.brgy || BRT_STATE.search ? '<button type="button" class="btn ghost btn-sm" data-act="brt-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
      '</div>' +
      '<div class="table-wrap" style="margin-top:12px"><table class="grid"><thead><tr>' +
        teamTh('brgy', 'Barangay (' + sortedTeams.length + ')', false, null, 'Barangay of team jurisdiction', true) +
        (!isMuni ? teamTh('muni', 'Municipality', false, null, 'Local Government Unit') : '') +
        teamTh('members', 'Members', true, null, null, false, '', null, 'Total community volunteers encoded in BResT') +
        teamTh('women', 'Women Rep.', true, 'Quota ≥50%', null, false, '', 'femaleratio', 'Women representation quota (GSI target ≥50%)') +
        teamTh('marg', 'Marginalized', true, 'Quota ≥30%', null, false, '', 'marginalized', 'Marginalized representation quota (Women, IP, PWD; Stage 1 target ≥30%)') +
        teamTh('sectors', 'Sectors / Purok Roles', false, 'Sitios & Groups', null, false, '', null, 'Coverage across sectoral representatives and sitios/puroks') +
        teamTh('status', 'Compliance', false, null, null, false, '', 'brest', 'BResT formation compliance per SM1/SM7 criteria') +
        teamTh('issues', 'Lacking / Issues', false, null, null, false, '', null, 'Validation warnings against BResT formation policy (minimum size, 30% marginalized quota, chairperson rule)') +
        '<th>Actions</th>' +
      '</tr></thead><tbody>' + (teamRowsHtml || '<tr><td colspan="9" class="empty-state">No barangays match this status filter.</td></tr>') + '</tbody></table></div>' +
      '<hr style="border:0;border-top:1px solid var(--border-subtle);margin:24px 0 16px">' +
      '<div class="card-head" style="margin-bottom:8px">' +
        '<div><h3>BResT Member Directory</h3><div class="tiny">' + (selectedBkey ? 'Showing members for selected barangay: <strong>' + esc(selectedBkey.split('|')[2] || selectedBkey) + '</strong>' : 'All encoded BResT members across monitored barangays') + '</div></div>' +
        '<div class="filters" style="margin:0"><label class="field"><span>Barangay</span><select data-act="brt-brgy">' + bOpts + '</select></label></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        th('brgy', 'Barangay', false, null, 'Barangay of residence') +
        (!isMuni ? th('muni', 'Municipality', false, null, 'Local Government Unit') : '') +
        th('name', 'Member Name', false, null, 'Volunteer name recorded in KCIS') +
        th('position', 'Position', false, null, 'Role or committee designation') +
        th('sex', 'Sex', false, null, null, false, '', 'femaleratio', 'Gender / Sex') +
        th('ippwd', 'IP / PWD', false, null, null, false, '', 'marginalized', 'Sectoral tagging') +
        th('start', 'Term Start', false, null, 'Election or start date') +
        '<th>Cross-check</th>' +
      '</tr></thead><tbody>' + (memberRows || '<tr><td colspan="8" class="empty-state">No BResT members encoded for this selection.</td></tr>') + '</tbody></table></div>' +
    '</div>';

  bindSearch('brt-search', function (v) { BRT_STATE.search = v; renderBrest(); });
  refreshIcons($('brt-body'));
}

// ===================================================================
// MODULE 5: CSPMC & Sub-Committees (Stage 2 Dedicated Module)
// Per SM1 Section 4.2 (pp. 20-25 & Annex 4) & SM7 Section 1.5.1 (p. 15)
// Tracks: CSPMC, CMSC, PPSC, PSC, PIT, MISC, AISC, OMSC, Bookkeeper
// ===================================================================

var CSPMC_STATE = {
  muni: '',
  brgy: '',
  search: '',
  status: 'all',        // 'all' | 'encoded' | 'needs_fixing' | 'not_encoded'
  subFilter: 'all',     // 'all' | 'CSPMC' | 'CMSC' | 'PPSC' | 'PSC' | 'PIT' | 'MISC' | 'AISC' | 'OMSC' | 'BOOKKEEPER'
  showOrgChart: true,   // toggle interactive org chart on main CSPMC page
  modalView: 'org',     // 'org' | 'cards' inside the barangay detail modal
  modalBkey: '',
  teamSortCol: 'brgy',
  teamSortDir: 'asc',
  volSortCol: 'brgy',
  volSortDir: 'asc',
  limit: 100
};

function buildBarangayOrgNodeHtml(bodyId, ev, interactive) {
  var body = STAGE2_BODY_MAP[bodyId];
  if (!body) return '';
  var members = (ev && ev.bodies && ev.bodies[bodyId]) || [];
  var isFormed = members.length > 0;
  var leads = members.filter(function (v) { return v.chair; });
  var others = members.filter(function (v) { return !v.chair; });
  var hasLead = leads.length > 0;
  var isCmsc = bodyId === 'CMSC';
  var isExec = bodyId === 'CSPMC';
  var isCmscLacking = isCmsc && (members.length < 3 || !hasLead);
  var isLeadLacking = body.chairRequired && isFormed && !hasLead;

  var accent = !isFormed ? 'accent-idle' : (isCmscLacking || isLeadLacking ? 'accent-warn' : (isExec ? 'accent-exec' : 'accent-good'));
  var isActiveFilter = interactive && CSPMC_STATE.subFilter === bodyId;
  var clickAttrs = interactive
    ? ' data-act="cspmc-sub" data-v="' + attr(CSPMC_STATE.subFilter === bodyId ? 'all' : bodyId) + '" title="Click to filter Volunteer Directory by ' + attr(body.name) + '"'
    : '';

  var statusBadge = !isFormed
    ? '<span class="pill idle tiny">Pending BA2</span>'
    : (isCmscLacking || isLeadLacking
        ? '<span class="pill warn tiny">⚠ ' + n(members.length) + ' CV' + (members.length === 1 ? '' : 's') + '</span>'
        : '<span class="pill good tiny">✓ ' + n(members.length) + ' CV' + (members.length === 1 ? '' : 's') + '</span>');

  var leadHtml = '';
  if (body.chairRequired) {
    if (hasLead) {
      leadHtml = '<div class="org-lead-box">' +
        '<span class="org-lead-label">' + (isExec ? 'CSPMC Chairperson / Lead' : 'Sub-Committee Chair / Lead') + '</span>' +
        leads.map(function (v) {
          var alum = (isCmsc && v.wasBrest) ? ' <span class="pill good tiny" title="Served in Stage 1 BResT">✓ BResT</span>' : '';
          return '<div style="margin-top:2px">' + nameCell(v) + ' <span class="pill good tiny">' + esc(v.position || 'Chair') + '</span>' + alum + '</div>';
        }).join('') +
      '</div>';
    } else if (isFormed) {
      leadHtml = '<div class="org-lead-box" style="border-color:var(--warn)"><span class="org-lead-label" style="color:var(--warn-text)">⚠ No Chair / Lead Designated</span></div>';
    } else {
      leadHtml = '<div class="org-lead-box"><span class="org-lead-label">Chair / Lead</span><span class="tiny muted">Not yet elected</span></div>';
    }
  }

  var rosterList = body.chairRequired ? others : members;
  var membersHtml = '';
  if (rosterList.length > 0) {
    membersHtml = '<div class="org-member-stack">' +
      rosterList.map(function (v) {
        var posLabel = v.position ? esc(v.position) : 'Member';
        var alum = (isCmsc && v.wasBrest) ? '<span class="pill good tiny" title="Served in Stage 1 BResT">✓ BResT</span>' : '';
        return '<div class="org-member-row">' +
          '<span>' + nameCell(v) + '</span>' +
          '<span><span class="tiny muted">' + posLabel + '</span> ' + alum + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  } else if (!isFormed) {
    membersHtml = '<div class="tiny muted" style="margin-top:2px">No volunteers encoded</div>';
  }

  var warnNote = '';
  if (isCmsc && isFormed && members.length < 3) {
    warnNote = '<div class="tiny" style="color:var(--warn-text);font-weight:700">⚠ Min. 3 CVs required (SM7 p. 15)</div>';
  }

  return '<div class="org-node ' + accent + (interactive ? ' clickable' : '') + (isActiveFilter ? ' active-filter' : '') + '"' + clickAttrs + '>' +
    '<div class="org-node-top">' +
      '<span class="org-node-code">' + esc(body.short) + '</span>' +
      statusBadge +
    '</div>' +
    '<div class="org-node-name">' + esc(body.name) + '</div>' +
    '<div class="org-node-mandate">' + esc(body.desc) + '</div>' +
    leadHtml +
    membersHtml +
    warnNote +
  '</div>';
}

function buildBarangayOrgChartHtml(ev, brgyName, muniLoc, interactive) {
  var operationalIds = ['PPSC', 'PSC', 'PIT', 'MISC', 'AISC', 'OMSC'];
  var subColsHtml = operationalIds.map(function (id) {
    return '<div class="org-sub-col">' + buildBarangayOrgNodeHtml(id, ev, interactive) + '</div>';
  }).join('');

  return '<div class="cspmc-org-wrap">' +
    '<div class="cspmc-org-legend">' +
      '<div><strong>' + esc(brgyName) + ' · Stage 2 Community Organizational Chart</strong> <span class="muted">(' + esc(muniLoc) + ' · Formed at 2nd Barangay Assembly per SM1 Annex 4 &amp; SM7 Sec. 1.5.1)</span></div>' +
      '<div class="cspmc-org-legend-items">' +
        '<span><span class="org-legend-dot" style="background:var(--primary)"></span>Executive Core</span>' +
        '<span><span class="org-legend-dot" style="background:var(--good)"></span>Formed &amp; Compliant</span>' +
        '<span><span class="org-legend-dot" style="background:var(--warn)"></span>Needs Lead / Quorum</span>' +
        '<span><span class="org-legend-dot" style="background:var(--border-strong)"></span>Pending BA2</span>' +
      '</div>' +
    '</div>' +
    '<div class="cspmc-org-inner">' +
      '<div class="org-tier-apex">' +
        '<div class="org-node-apex">' +
          '<div class="org-node-apex-title">' + icon('users') + ' <span>BARANGAY ASSEMBLY (BA)</span></div>' +
          '<div class="org-node-apex-sub">Highest Decision-Making Body of the Community · Elects CSPMC &amp; 8 Specialized Sub-Committees during BA2</div>' +
        '</div>' +
      '</div>' +
      '<div class="org-stem-down"></div>' +
      '<div class="org-tier-middle">' +
        '<div class="org-mid-col side-left">' +
          '<div class="org-connector-tag">Independent M&amp;E &amp; Audit Arm (Reports to BA)</div>' +
          buildBarangayOrgNodeHtml('CMSC', ev, interactive) +
        '</div>' +
        '<div class="org-mid-col center-core">' +
          '<div class="org-connector-tag">Executive Management Body</div>' +
          buildBarangayOrgNodeHtml('CSPMC', ev, interactive) +
        '</div>' +
        '<div class="org-mid-col side-right">' +
          '<div class="org-connector-tag">Financial Records &amp; Books Support</div>' +
          buildBarangayOrgNodeHtml('BOOKKEEPER', ev, interactive) +
        '</div>' +
      '</div>' +
      '<div class="org-stem-down"></div>' +
      '<div class="org-connector-tag" style="margin-bottom:4px">6 Specialized Operational Sub-Committees under CSPMC Supervision</div>' +
      '<div class="org-tier-subcommittees">' +
        subColsHtml +
      '</div>' +
    '</div>' +
  '</div>';
}

function buildAggregateOrgNodeHtml(bodyId, brgys, evalMap, s2Vols) {
  var body = STAGE2_BODY_MAP[bodyId];
  if (!body) return '';
  var totalBrgys = brgys.length;
  var formedBrgys = 0;
  var compliantLeadBrgys = 0;
  var cmscQuorumBrgys = 0;
  var brestAlumCount = 0;

  brgys.forEach(function (b) {
    var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
    var ev = evalMap[bkey];
    if (!ev) return;
    var members = ev.bodies[bodyId] || [];
    if (members.length > 0) {
      formedBrgys++;
      if (members.some(function (v) { return v.chair; })) compliantLeadBrgys++;
    }
    if (bodyId === 'CMSC' && members.length >= 3 && members.some(function (v) { return v.chair; })) {
      cmscQuorumBrgys++;
    }
  });

  var bodyVols = s2Vols.filter(function (v) { return v.stage2Body === bodyId; });
  if (bodyId === 'CMSC') {
    brestAlumCount = bodyVols.filter(function (v) { return v.wasBrest; }).length;
  }
  var pct = totalBrgys > 0 ? Math.round(formedBrgys / totalBrgys * 100) : 0;
  var isExec = bodyId === 'CSPMC';
  var accent = formedBrgys === 0 ? 'accent-idle' : (formedBrgys === totalBrgys ? (isExec ? 'accent-exec' : 'accent-good') : 'accent-warn');
  var isActiveFilter = CSPMC_STATE.subFilter === bodyId;
  var nextFilter = isActiveFilter ? 'all' : bodyId;

  var extraMeta = '';
  if (bodyId === 'CMSC') {
    extraMeta = '<div class="tiny" style="display:flex;justify-content:space-between"><span>Quorum (&ge;3 + Lead):</span><strong>' + n(cmscQuorumBrgys) + '/' + n(totalBrgys) + '</strong></div>' +
      (brestAlumCount > 0 ? '<div class="tiny" style="color:var(--good-text)">✓ ' + n(brestAlumCount) + ' BResT alum(s)</div>' : '');
  } else if (body.chairRequired) {
    extraMeta = '<div class="tiny" style="display:flex;justify-content:space-between"><span>With Elected Lead:</span><strong>' + n(compliantLeadBrgys) + '/' + n(formedBrgys) + '</strong></div>';
  }

  return '<div class="org-node clickable ' + accent + (isActiveFilter ? ' active-filter' : '') + '" data-act="cspmc-sub" data-v="' + attr(nextFilter) + '" title="Click to filter table &amp; volunteers by ' + attr(body.name) + '">' +
    '<div class="org-node-top">' +
      '<span class="org-node-code">' + esc(body.short) + '</span>' +
      '<span class="pill ' + (formedBrgys > 0 ? 'good' : 'idle') + ' tiny">' + n(bodyVols.length) + ' CVs</span>' +
    '</div>' +
    '<div class="org-node-name">' + esc(body.name) + '</div>' +
    '<div class="org-node-mandate">' + esc(body.desc) + '</div>' +
    '<div class="org-agg-stats">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><span>Brgys Formed:</span><strong>' + n(formedBrgys) + ' / ' + n(totalBrgys) + ' (' + pct + '%)</strong></div>' +
      '<div class="org-agg-bar"><span style="width:' + pct + '%"></span></div>' +
      extraMeta +
    '</div>' +
  '</div>';
}

function buildAggregateOrgChartHtml(brgys, evalMap, s2Vols, scopeTitle) {
  var operationalIds = ['PPSC', 'PSC', 'PIT', 'MISC', 'AISC', 'OMSC'];
  var subColsHtml = operationalIds.map(function (id) {
    return '<div class="org-sub-col">' + buildAggregateOrgNodeHtml(id, brgys, evalMap, s2Vols) + '</div>';
  }).join('');

  return '<div class="cspmc-org-wrap">' +
    '<div class="cspmc-org-legend">' +
      '<div><strong>Stage 2 Organizational Structure (' + esc(scopeTitle) + ')</strong> <span class="muted">· Click any committee box to filter barangays &amp; volunteers below, or select a Barangay to view its live personnel chart.</span></div>' +
      '<div class="cspmc-org-legend-items">' +
        (CSPMC_STATE.subFilter !== 'all' ? '<button type="button" class="btn ghost btn-xs" data-act="cspmc-sub" data-v="all">' + icon('x') + ' Clear Filter (' + esc(CSPMC_STATE.subFilter) + ')</button>' : '') +
        '<span><span class="org-legend-dot" style="background:var(--primary)"></span>Executive Core</span>' +
        '<span><span class="org-legend-dot" style="background:var(--good)"></span>100% Barangays Formed</span>' +
        '<span><span class="org-legend-dot" style="background:var(--warn)"></span>Partial Formation</span>' +
      '</div>' +
    '</div>' +
    '<div class="cspmc-org-inner">' +
      '<div class="org-tier-apex">' +
        '<div class="org-node-apex">' +
          '<div class="org-node-apex-title">' + icon('users') + ' <span>BARANGAY ASSEMBLY (BA) · ' + n(brgys.length) + ' BARANGAY' + (brgys.length === 1 ? '' : 'S') + '</span></div>' +
          '<div class="org-node-apex-sub">Sovereign Community Body · Approves Sub-Project Proposals &amp; Elects CSPMC + 8 Specialized Sub-Committees during 2nd BA</div>' +
        '</div>' +
      '</div>' +
      '<div class="org-stem-down"></div>' +
      '<div class="org-tier-middle">' +
        '<div class="org-mid-col side-left">' +
          '<div class="org-connector-tag">Independent M&amp;E &amp; Audit Arm (Reports to BA)</div>' +
          buildAggregateOrgNodeHtml('CMSC', brgys, evalMap, s2Vols) +
        '</div>' +
        '<div class="org-mid-col center-core">' +
          '<div class="org-connector-tag">Executive Management Body</div>' +
          buildAggregateOrgNodeHtml('CSPMC', brgys, evalMap, s2Vols) +
        '</div>' +
        '<div class="org-mid-col side-right">' +
          '<div class="org-connector-tag">Financial Records &amp; Books Support</div>' +
          buildAggregateOrgNodeHtml('BOOKKEEPER', brgys, evalMap, s2Vols) +
        '</div>' +
      '</div>' +
      '<div class="org-stem-down"></div>' +
      '<div class="org-connector-tag" style="margin-bottom:4px">6 Specialized Operational Sub-Committees under CSPMC Supervision</div>' +
      '<div class="org-tier-subcommittees">' +
        subColsHtml +
      '</div>' +
    '</div>' +
  '</div>';
}

// ===================================================================
// STAGE 2 CSPMC & 8 SUB-COMMITTEES HELPERS
// ===================================================================

function getCspmcTriageSummary(brgys, evalMap, s2Vols) {
  var bList = brgys || [];
  var vList = s2Vols || [];
  var totalBrgys = bList.length;
  var compliantBrgys = 0;
  var needsFixBrgys = 0;
  var notEncodedBrgys = 0;
  var cmscQuorumBrgys = 0;
  var leadMissingBrgys = 0;
  var totalIssues = 0;

  bList.forEach(function (b) {
    var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
    var ev = evalMap ? evalMap[bkey] : null;
    var st = ev ? ev.status : 'Not encoded';
    if (st === 'Encoded') {
      compliantBrgys++;
    } else if (st === 'Needs fixing') {
      needsFixBrgys++;
      if (ev && ev.reasons) totalIssues += ev.reasons.length;
    } else {
      notEncodedBrgys++;
    }

    if (ev && ev.cmscCount >= 3 && ev.hasCmscLead) {
      cmscQuorumBrgys++;
    }
    if (ev && ev.vols.length > 0 && (!ev.hasCspmcLead || !ev.hasCmscLead)) {
      leadMissingBrgys++;
    }
  });

  var totalVols = vList.length;
  var womenVols = vList.filter(function (v) { return v.sex === 'female'; }).length;
  var womenRate = totalVols > 0 ? (womenVols / totalVols) : 0;
  var formationRate = totalBrgys > 0 ? ((compliantBrgys + needsFixBrgys) / totalBrgys) : 0;

  return {
    totalBrgys: totalBrgys,
    compliantBrgys: compliantBrgys,
    needsFixBrgys: needsFixBrgys,
    notEncodedBrgys: notEncodedBrgys,
    cmscQuorumBrgys: cmscQuorumBrgys,
    leadMissingBrgys: leadMissingBrgys,
    totalVols: totalVols,
    womenVols: womenVols,
    womenRate: womenRate,
    formationRate: formationRate,
    totalIssues: totalIssues
  };
}

function renderCspmcTriageTray(summary) {
  var isAllGood = summary.compliantBrgys === summary.totalBrgys && summary.totalBrgys > 0;
  var items = [];

  // 1. All Barangays
  items.push(
    '<button type="button" class="triage-item' + (CSPMC_STATE.status === 'all' && CSPMC_STATE.subFilter === 'all' ? ' active-triage' : '') + '" data-act="cspmc-triage" data-v="all" title="View all monitored Stage 2 barangays">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.totalBrgys) + '</span>' +
        '<span class="triage-item-label">Stage 2 Barangays</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 2. Compliant Teams
  items.push(
    '<button type="button" class="triage-item triage-good' + (CSPMC_STATE.status === 'encoded' ? ' active-triage' : '') + '" data-act="cspmc-triage" data-v="encoded" title="Filter fully compliant Stage 2 teams (CMSC quorum & elected leads)">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.compliantBrgys) + '</span>' +
        '<span class="triage-item-label">Compliant Teams</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 3. Needs Attention
  if (summary.needsFixBrgys > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn' + (CSPMC_STATE.status === 'needs_fixing' ? ' active-triage' : '') + '" data-act="cspmc-triage" data-v="needs_fixing" title="Filter teams with missing leads, lacking CMSC quorum, or quota warnings">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.needsFixBrgys) + '</span>' +
          '<span class="triage-item-label">Needs Attention</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 4. CMSC Quorum Gaps (<3 members or no lead)
  var cmscGaps = summary.totalBrgys - summary.cmscQuorumBrgys;
  if (cmscGaps > 0) {
    items.push(
      '<button type="button" class="triage-item triage-warn' + (CSPMC_STATE.subFilter === 'CMSC' ? ' active-triage' : '') + '" data-act="cspmc-triage" data-v="cmsc_filter" title="Filter CMSC Independent Monitoring Teams (SM7 requires ≥3 CVs + Lead)">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.cmscQuorumBrgys) + ' <span class="tiny">(' + cmscGaps + ' gap)</span></span>' +
          '<span class="triage-item-label">CMSC Quorum (≥3 CVs)</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  // 5. Pending BA2 / Not Encoded
  if (summary.notEncodedBrgys > 0) {
    items.push(
      '<button type="button" class="triage-item triage-bad' + (CSPMC_STATE.status === 'not_encoded' ? ' active-triage' : '') + '" data-act="cspmc-triage" data-v="not_encoded" title="Filter barangays pending 2nd Barangay Assembly (BA2) committee organization">' +
        '<div class="triage-item-info">' +
          '<span class="triage-item-count">' + n(summary.notEncodedBrgys) + '</span>' +
          '<span class="triage-item-label">Pending BA2 Formation</span>' +
        '</div>' +
        '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
      '</button>'
    );
  }

  return (
    '<div class="triage-tray">' +
      '<div class="triage-header">' +
        '<div class="triage-title">' +
          icon('layers') + ' <span>Stage 2 CSPMC &amp; Sub-Committees Action Center</span>' +
        '</div>' +
        '<div class="triage-status ' + (isAllGood ? 'status-good' : 'status-warn') + '">' +
          icon(isAllGood ? 'check-circle-2' : 'alert-circle') +
          '<span>' + (isAllGood ? 'All Stage 2 Sub-Committees Fully Organized &amp; Compliant' : (summary.needsFixBrgys + ' barangays require attention · ' + summary.notEncodedBrgys + ' pending BA2')) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="triage-grid">' +
        items.join('') +
      '</div>' +
    '</div>'
  );
}

function renderCspmc() {
  var body = $('cspmc-body');
  if (!body) return;
  if (!STATE.computed) { body.innerHTML = '<div class="card"><p class="muted">Load the Community Volunteer List first.</p></div>'; return; }
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (CSPMC_STATE.muni || key || '');
  var brgys = (SNAP.barangayRows || []).filter(function (b) { return !activeMuni || b.province + '|' + b.municipality === activeMuni; });
  var s2Vols = P.volunteers.filter(function (v) {
    if (!v.isStage2) return false;
    return !activeMuni || (v.province + '|' + v.municipality === activeMuni);
  });

  // Evaluate each barangay in scope
  var evalMap = {};
  brgys.forEach(function (b) {
    var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
    var bv = s2Vols.filter(function (v) { return v.barangay === b.barangay && v.municipality === b.municipality; });
    evalMap[bkey] = evaluateCspmcBarangay(b, bv);
  });

  // Triage Summary
  var summary = getCspmcTriageSummary(brgys, evalMap, s2Vols);
  var totalBrgys = summary.totalBrgys;
  var compliantBrgys = summary.compliantBrgys;
  var needsFixBrgys = summary.needsFixBrgys;
  var notEncodedBrgys = summary.notEncodedBrgys;
  var formedBrgys = compliantBrgys + needsFixBrgys;
  var cmscCompliant = summary.cmscQuorumBrgys;
  var totalBrestAlums = s2Vols.filter(function (v) { return v.stage2Body === 'CMSC' && v.wasBrest; }).length;
  var totalWomen = summary.womenVols;
  var womenPct = Math.round(summary.womenRate * 100);

  // Filter barangays
  var selectedBkey = CSPMC_STATE.brgy;
  var filteredBrgys = brgys.filter(function (b) {
    var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
    var ev = evalMap[bkey];
    var st = ev ? ev.status : 'Not encoded';
    if (CSPMC_STATE.status === 'encoded' && st !== 'Encoded') return false;
    if (CSPMC_STATE.status === 'needs_fixing' && st !== 'Needs fixing') return false;
    if (CSPMC_STATE.status === 'not_encoded' && st !== 'Not encoded') return false;
    if (CSPMC_STATE.subFilter !== 'all') {
      var hasSub = ev && ev.bodies[CSPMC_STATE.subFilter] && ev.bodies[CSPMC_STATE.subFilter].length > 0;
      if (!hasSub) return false;
    }
    if (CSPMC_STATE.search) {
      var q = normSearch(CSPMC_STATE.search);
      var text = b.barangay + ' ' + b.municipality + ' ' + (ev ? ev.vols.map(function (v) { return v.name + ' ' + (v.body || ''); }).join(' ') : '');
      if (normSearch(text).indexOf(q) === -1) return false;
    }
    return true;
  });

  // Section 1: Barangay Teams Tabular Matrix
  var curTeamCol = CSPMC_STATE.teamSortCol || 'brgy';
  var curTeamDir = CSPMC_STATE.teamSortDir || 'asc';

  var teamItems = filteredBrgys.map(function (b) {
    var bkey = b.province + '|' + b.municipality + '|' + b.barangay;
    var ev = evalMap[bkey];
    var cspmcLead = (ev.bodies.CSPMC || []).filter(function (v) { return v.chair; })[0] || ev.vols.filter(function (v) { return v.chair; })[0] || null;
    var cmscLead = (ev.bodies.CMSC || []).filter(function (v) { return v.chair; })[0] || null;
    return {
      b: b,
      bkey: bkey,
      ev: ev,
      cspmcLead: cspmcLead ? cspmcLead.name : '',
      cmscLead: cmscLead ? cmscLead.name : '',
      cmscCount: ev.cmscCount,
      cmscBrestAlum: ev.cmscBrestAlum,
      activeBodiesCount: ev.activeBodies.length,
      membersCount: ev.vols.length,
      womenPct: ev.womenPct,
      status: ev.status,
      reasons: ev.reasons
    };
  });

  var teamExt = {
    brgy: function (t) { return t.b.barangay; },
    muni: function (t) { return t.b.municipality; },
    cspmcLead: function (t) { return t.cspmcLead; },
    cmsc: function (t) { return t.cmscCount; },
    activeBodies: function (t) { return t.activeBodiesCount; },
    members: function (t) { return t.membersCount; },
    womenPct: function (t) { return t.membersCount ? t.womenPct : -1; },
    status: function (t) { return t.status === 'Encoded' ? 2 : (t.status === 'Needs fixing' ? 1 : 0); },
    issues: function (t) { return t.reasons.length; }
  };

  var sortedTeams = tblSort(teamItems, curTeamCol, curTeamDir, teamExt);

  var teamTh = function (col, label, num, sub, title, sticky, extraClass, term, tooltip) {
    return sortTh({
      col: col,
      curCol: curTeamCol,
      dir: curTeamDir,
      label: label,
      num: num,
      sub: sub,
      title: title,
      sticky: sticky,
      act: 'cspmc-team-sort',
      extraClass: extraClass,
      term: term,
      tooltip: tooltip
    });
  };

  var teamRowsHtml = sortedTeams.map(function (item) {
    var b = item.b;
    var bkey = item.bkey;
    var ev = item.ev;
    var isSelected = selectedBkey === bkey;

    var statusPill = ev.status === 'Encoded'
      ? '<span class="pill good">✓ Compliant</span>'
      : (ev.status === 'Needs fixing' ? '<span class="pill warn">⚠ Needs Attention</span>' : '<span class="pill bad">○ Not Encoded</span>');

    var issuesCell = ev.reasons.length > 0
      ? '<button type="button" class="btn bad btn-xs lacking-btn" data-act="open-cspmc-issues" data-brgy="' + attr(bkey) + '" title="Click to view all ' + ev.reasons.length + ' validation issues">' +
          icon('alert-circle') + ' <span>' + n(ev.reasons.length) + ' lacking</span>' +
        '</button>'
      : '<span class="pill good tiny" title="All Stage 2 requirements met">✓ None</span>';

    var leadCell = item.cspmcLead
      ? '<strong>' + esc(item.cspmcLead) + '</strong> <span class="pill good tiny">Lead</span>'
      : (ev.vols.length ? '<span class="tiny warn-text">⚠ No Lead designated</span>' : '<span class="tiny muted">—</span>');

    var cmscQuota = quotaMiniProgressBar(ev.cmscCount, 3, 1.0, 'Mandatory ≥3 Independent Monitors (SM7 p. 15)');
    var alumBadge = item.cmscBrestAlum ? ' <span class="pill good tiny" title="' + item.cmscBrestAlum + ' member(s) previously served in BResT (encouraged by SM7 p. 15)">✓ ' + item.cmscBrestAlum + ' from BResT</span>' : '';
    var leadInfo = item.cmscLead ? '<div class="tiny muted">Lead: ' + esc(item.cmscLead) + '</div>' : '<div class="tiny warn-text">⚠ No Chair/Lead</div>';
    var cmscCell = '<div>' + cmscQuota + (alumBadge ? '<div style="margin-top:2px">' + alumBadge + '</div>' : '') + leadInfo + '</div>';

    var activeBadges = ev.activeBodies.length
      ? ev.activeBodies.map(function (body) {
          var cnt = (ev.bodies[body.id] || []).length;
          var isFiltered = CSPMC_STATE.subFilter === body.id;
          return '<span class="pill ' + (isFiltered ? 'good' : 'idle') + ' tiny" style="margin:1px 2px" title="' + attr(body.name) + ': ' + cnt + ' member(s)">' + esc(body.short) + ' (' + cnt + ')</span>';
        }).join('')
      : '<span class="tiny muted">No sub-committees encoded</span>';

    var womenMini = quotaMiniProgressBar(ev.women, ev.vols.length, 0.5, 'Target ≥50% Women representation');

    return '<tr class="' + (isSelected ? 'active-row ' : '') + (ev.status === 'Needs fixing' ? 'row-warn' : '') + '">' +
      '<td class="sticky"><strong>' + esc(b.barangay) + '</strong>' +
        (isSelected ? ' <span class="pill good tiny">Viewing</span>' : '') +
      '</td>' +
      (!isMuni ? '<td>' + esc(b.municipality) + '</td>' : '') +
      '<td>' + leadCell + '</td>' +
      '<td>' + cmscCell + '</td>' +
      '<td>' + activeBadges + '</td>' +
      '<td class="num">' + womenMini + '</td>' +
      '<td>' + statusPill + '</td>' +
      '<td>' + issuesCell + '</td>' +
      '<td><div class="row-actions" style="margin:0;gap:4px">' +
        '<button type="button" class="btn ghost btn-xs" data-act="cspmc-pick-brgy" data-v="' + attr(bkey) + '" title="Filter volunteer directory below to ' + esc(b.barangay) + '">' +
          icon('users') + ' <span>' + (isSelected ? 'Selected' : 'CVs (' + n(ev.vols.length) + ')') + '</span>' +
        '</button>' +
        '<button type="button" class="btn ghost btn-xs" data-act="open-cspmc-detail" data-brgy="' + attr(bkey) + '" title="Open Stage 2 Organizational Chart &amp; 8 Sub-Committees">' +
          icon('layers') + ' <span>Org Chart ›</span>' +
        '</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  // Section 2: Volunteer Directory for Stage 2
  var displayVols = s2Vols.filter(function (v) {
    if (selectedBkey && (v.province + '|' + v.municipality + '|' + v.barangay !== selectedBkey)) return false;
    if (CSPMC_STATE.subFilter !== 'all' && v.stage2Body !== CSPMC_STATE.subFilter) return false;
    if (CSPMC_STATE.search) {
      var q = normSearch(CSPMC_STATE.search);
      if (v.q.indexOf(q) === -1) return false;
    }
    return true;
  });

  var curVolCol = CSPMC_STATE.volSortCol || 'brgy';
  var curVolDir = CSPMC_STATE.volSortDir || 'asc';
  var s2VolExt = {
    brgy: function (v) { return v.barangay; },
    muni: function (v) { return v.municipality; },
    name: function (v) { return v.name; },
    sub: function (v) { return v.stage2Body || ''; },
    position: function (v) { return v.chair ? 2 : (v.position ? 1 : 0); },
    sex: function (v) { return v.sex; },
    ippwd: function (v) { return [v.ip ? 'IP' : '', v.pwd ? 'PWD' : ''].filter(Boolean).join(', '); },
    frombrest: function (v) { return v.wasBrest ? 1 : 0; },
    start: function (v) { return v.start || ''; }
  };
  var sortedVols = tblSort(displayVols, curVolCol, curVolDir, s2VolExt);
  var shownVols = sortedVols.slice(0, CSPMC_STATE.limit);

  var volRowsHtml = shownVols.map(function (v) {
    var bodyObj = STAGE2_BODY_MAP[v.stage2Body] || null;
    var bodyLabel = bodyObj ? bodyObj.label : (v.body || v.committee);
    var alumBadge = v.wasBrest
      ? '<span class="pill good tiny" title="Volunteer previously served in Barangay Resilience Team (BResT) in Stage 1">✓ From BResT</span>'
      : '<span class="tiny muted">—</span>';

    return '<tr>' +
      '<td class="sticky"><strong>' + esc(v.barangay) + '</strong></td>' +
      (!isMuni ? '<td>' + esc(v.municipality) + '</td>' : '') +
      '<td>' + nameCell(v) + '</td>' +
      '<td><span class="pill idle tiny"><strong>' + esc(v.stage2Body || 'CSPMC') + '</strong></span> <span class="tiny">' + esc(bodyLabel) + '</span></td>' +
      '<td>' + (v.chair ? '<span class="pill good">👑 ' + esc(v.position) + '</span>' : esc(v.position || 'Member')) + '</td>' +
      '<td>' + esc(v.sex || '—') + '</td>' +
      '<td>' + (v.ip ? '<span class="pill idle">IP</span> ' : '') + (v.pwd ? '<span class="pill idle">PWD</span>' : (!v.ip ? '—' : '')) + '</td>' +
      '<td>' + alumBadge + '</td>' +
      '<td>' + esc(v.start || '—') + '</td>' +
      '<td>' + flagPills(v) + '</td>' +
    '</tr>';
  }).join('');

  var volTh = function (col, label, num, sub, title, sticky, extraClass, term, tooltip) {
    return sortTh({
      col: col,
      curCol: curVolCol,
      dir: curVolDir,
      label: label,
      num: num,
      sub: sub,
      title: title,
      sticky: sticky,
      act: 'cspmc-vol-sort',
      extraClass: extraClass,
      term: term,
      tooltip: tooltip
    });
  };

  // Status Filter Cards counts
  var cTotal = brgys.length;
  var cEnc = compliantBrgys;
  var cFix = needsFixBrgys;
  var cNot = notEncodedBrgys;

  var quickCspmcChips = '<div class="quick-filter-bar">' +
    '<span class="tiny text-muted" style="font-weight:700;margin-right:4px;">Governance Presets:</span>' +
    '<button type="button" class="quick-filter-chip' + (CSPMC_STATE.status === 'all' && CSPMC_STATE.subFilter === 'all' ? ' active' : '') + '" data-act="cspmc-chip" data-type="status" data-v="all">' +
      '<span>All Teams</span> <span class="tiny" style="opacity:0.85">(' + n(cTotal) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-good' + (CSPMC_STATE.status === 'encoded' ? ' active' : '') + '" data-act="cspmc-chip" data-type="status" data-v="encoded">' +
      '<span>✓ Compliant</span> <span class="tiny" style="opacity:0.85">(' + n(cEnc) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-warn' + (CSPMC_STATE.status === 'needs_fixing' ? ' active' : '') + '" data-act="cspmc-chip" data-type="status" data-v="needs_fixing">' +
      '<span>⚠️ Needs Attention</span> <span class="tiny" style="opacity:0.85">(' + n(cFix) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-bad' + (CSPMC_STATE.status === 'not_encoded' ? ' active' : '') + '" data-act="cspmc-chip" data-type="status" data-v="not_encoded">' +
      '<span>○ Pending BA2</span> <span class="tiny" style="opacity:0.85">(' + n(cNot) + ')</span>' +
    '</button>' +
    '<span style="color:var(--border-strong);margin:0 2px">|</span>' +
    '<button type="button" class="quick-filter-chip' + (CSPMC_STATE.subFilter === 'CMSC' ? ' active chip-good' : '') + '" data-act="cspmc-chip" data-type="sub" data-v="CMSC">' +
      '<span>CMSC (Monitor)</span> <span class="tiny" style="opacity:0.85">(' + n(s2Vols.filter(function (v) { return v.stage2Body === 'CMSC'; }).length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (CSPMC_STATE.subFilter === 'CSPMC' ? ' active chip-good' : '') + '" data-act="cspmc-chip" data-type="sub" data-v="CSPMC">' +
      '<span>CSPMC Officers</span> <span class="tiny" style="opacity:0.85">(' + n(s2Vols.filter(function (v) { return v.stage2Body === 'CSPMC'; }).length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (CSPMC_STATE.subFilter === 'PIT' ? ' active chip-good' : '') + '" data-act="cspmc-chip" data-type="sub" data-v="PIT">' +
      '<span>SPISC / PIT</span> <span class="tiny" style="opacity:0.85">(' + n(s2Vols.filter(function (v) { return v.stage2Body === 'PIT'; }).length) + ')</span>' +
    '</button>' +
    (selectedBkey ? '<button type="button" class="quick-filter-chip active chip-good" data-act="cspmc-pick-brgy" data-v="" title="Clear barangay selection and show all teams">' +
      '<span>Selected: ' + esc(selectedBkey.split('|')[2] || selectedBkey) + '</span> <span class="tiny">✕ Clear</span>' +
    '</button>' : '') +
  '</div>';

  // Sub-committee quick filters
  var subCards = [['all', 'All Bodies', s2Vols.length]].concat(
    STAGE2_BODIES.map(function (body) {
      var cnt = s2Vols.filter(function (v) { return v.stage2Body === body.id; }).length;
      return [body.id, body.short, cnt];
    })
  ).map(function (sb) {
    return '<button type="button" class="filter-card' + (CSPMC_STATE.subFilter === sb[0] ? ' active' : '') + '" data-act="cspmc-sub" data-v="' + sb[0] + '">' +
      '<span class="fc-label">' + esc(sb[1]) + '</span>' +
      '<span class="fc-count">' + n(sb[2]) + '</span>' +
    '</button>';
  }).join('');

  // Municipalities dropdown (for RPMO)
  var munis = baselineMunis();
  var mOpts = '<option value="">All Municipalities</option>';
  munis.forEach(function (m) {
    var v = m.province + '|' + m.municipality;
    mOpts += '<option value="' + attr(v) + '"' + (activeMuni === v ? ' selected' : '') + '>' + esc(m.municipality) + ' (' + esc(m.province) + ')</option>';
  });

  var bOpts = '<option value="">All Barangays</option>' + brgys.map(function (b) {
    var v = b.province + '|' + b.municipality + '|' + b.barangay;
    return '<option value="' + attr(v) + '"' + (selectedBkey === v ? ' selected' : '') + '>' + esc(b.barangay) + '</option>';
  }).join('');

  var subNav = '<div class="sub-nav-tabs">' +
    '<button type="button" class="sub-nav-btn" data-go="volunteers">' + icon('users') + ' <span>Community Volunteers</span></button>' +
    '<button type="button" class="sub-nav-btn" data-go="brest">' + icon('shield') + ' <span>BResT Teams</span></button>' +
    '<button type="button" class="sub-nav-btn active">' + icon('layers') + ' <span>CSPMC &amp; Sub-Committees (Stage 2)</span></button>' +
  '</div>';

  var scopeBanner = isMuni
    ? '<div class="static-val">' + icon('map-pin') + ' <span>Municipality: <strong>' + esc(home().municipality) + '</strong> (' + esc(home().province) + ')</span></div>'
    : '<label class="field"><span>Municipality</span><select data-act="cspmc-muni">' + mOpts + '</select></label>';

  // Build Organizational Chart visualization
  var orgChartSectionHtml = '';
  if (CSPMC_STATE.showOrgChart) {
    if (selectedBkey && evalMap[selectedBkey]) {
      var selParts = selectedBkey.split('|');
      orgChartSectionHtml = buildBarangayOrgChartHtml(evalMap[selectedBkey], selParts[2], selParts[1] + ', ' + selParts[0], true);
    } else {
      var scopeTitle = activeMuni ? activeMuni.split('|')[1] : 'All Monitored Municipalities';
      orgChartSectionHtml = buildAggregateOrgChartHtml(brgys, evalMap, s2Vols, scopeTitle);
    }
  }

  body.innerHTML = subNav + (typeof renderDqaBreadcrumb === 'function' ? renderDqaBreadcrumb() : '') +
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>CSPMC &amp; Specialized Sub-Committees (Stage 2)</h2>' +
          '<div class="muted">' + (isMuni ? 'Stage 2 committee management for <strong>' + esc(home().municipality) + '</strong>.' : 'Region-wide Stage 2 committee monitoring.') + ' Tracks all 8 specialized sub-committees formed during the 2nd Barangay Assembly (BA2) per Project Manuals (SM1 &amp; SM7).</div>' +
        '</div>' +
        '<div class="row-actions" style="margin:0">' +
          '<button type="button" class="btn ' + (CSPMC_STATE.showOrgChart ? 'primary' : 'ghost') + ' btn-sm" data-act="cspmc-toggle-org">' + icon('layers') + ' <span>' + (CSPMC_STATE.showOrgChart ? 'Hide Org Chart' : 'Show Org Chart') + '</span></button>' +
          '<button class="btn ghost btn-sm" data-act="cspmc-teams-export">' + icon('download') + ' <span>Export Teams CSV</span></button>' +
          '<button class="btn ghost btn-sm" data-act="cspmc-vols-export">' + icon('download') + ' <span>Export Volunteers CSV</span></button>' +
        '</div>' +
      '</div>' +
      kpiPageLink('cspmc', activeMuni) +
      orgChartSectionHtml +
      '<div class="card-head" style="margin-top:14px;margin-bottom:6px">' +
        '<div><h3 style="margin:0;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted)">Filter by Sub-Committee</h3></div>' +
      '</div>' +
      '<div class="filter-cards" style="margin-bottom:14px">' + subCards + '</div>' +
      '<div class="toolbar-row"><div class="filters" style="margin:0;flex:1">' +
        scopeBanner +
        '<label class="field"><span>Barangay</span><select data-act="cspmc-brgy">' + bOpts + '</select></label>' +
        '<label class="field" style="min-width:240px;flex:1"><span>Search Barangay / Volunteer / Sub-Committee</span><input type="search" id="cspmc-search" value="' + attr(CSPMC_STATE.search) + '" placeholder="Search…"></label>' +
        (CSPMC_STATE.status !== 'all' || CSPMC_STATE.subFilter !== 'all' || CSPMC_STATE.brgy || CSPMC_STATE.search ? '<button type="button" class="btn ghost btn-sm" data-act="cspmc-reset">' + icon('rotate-ccw') + ' <span>Reset</span></button>' : '') +
      '</div></div>' +
      quickCspmcChips +
      '<div class="table-wrap" style="margin-top:12px"><table class="grid"><thead><tr>' +
        teamTh('brgy', 'Barangay (' + sortedTeams.length + ')', false, null, 'Barangay of sub-project implementation', true) +
        (!isMuni ? teamTh('muni', 'Municipality', false, null, 'Local Government Unit') : '') +
        teamTh('cspmcLead', 'CSPMC Lead', false, null, 'Elected head of Community Sub-Project Management Committee') +
        teamTh('cmsc', 'CMSC (Monitoring)', true, 'Min. 3 CVs + Lead', 'Community Monitoring Sub-Committee: independent oversight body reporting to BA') +
        teamTh('activeBodies', 'Active Sub-Committees', true, 'Formed Bodies', 'Number of 8 specialized sub-committees with encoded CVs') +
        teamTh('members', 'Total Members', true, 'Quota ≥50%', 'Total Stage 2 community volunteers and GSI gender balance') +
        teamTh('status', 'Compliance', false, null, 'Stage 2 governance compliance under SM1 §4.2 & SM7 §1.5.1') +
        teamTh('issues', 'Lacking / Issues', false, null, 'Validation warnings for missing leads, quorum deficit, or quotas') +
        '<th>Actions</th>' +
      '</tr></thead><tbody>' + (teamRowsHtml || '<tr><td colspan="9" class="empty-state">No barangays match this filter.</td></tr>') + '</tbody></table></div>' +
      '<hr style="border:0;border-top:1px solid var(--border-subtle);margin:24px 0 16px">' +
      '<div class="card-head" style="margin-bottom:8px">' +
        '<div><h3>Stage 2 Volunteer Directory</h3><div class="tiny">' + (selectedBkey ? 'Showing volunteers for selected barangay: <strong>' + esc(selectedBkey.split('|')[2] || selectedBkey) + '</strong>' : 'All encoded Stage 2 volunteers across monitored barangays') + '</div></div>' +
        '<div class="filters" style="margin:0"><span class="tiny">Showing <strong>' + n(shownVols.length) + '</strong> of <strong>' + n(sortedVols.length) + '</strong></span></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        volTh('brgy', 'Barangay', false, null, 'Barangay of residence', true) +
        (!isMuni ? volTh('muni', 'Municipality', false, null, 'Local Government Unit') : '') +
        volTh('name', 'Volunteer Name', false, null, 'Volunteer name recorded in KCIS') +
        volTh('sub', 'Sub-Committee', false, null, 'Assigned Stage 2 Sub-Committee') +
        volTh('position', 'Position', false, null, 'Elected role (Chairperson, Vice-Chair, Member)') +
        volTh('sex', 'Sex', false, null, null, false, '', 'femaleratio', 'Gender / Sex') +
        volTh('ippwd', 'IP / PWD', false, null, null, false, '', 'marginalized', 'Sectoral tags') +
        volTh('frombrest', 'BResT Alum', false, null, 'Whether volunteer transitioned from Stage 1 BResT') +
        volTh('start', 'Term Start', false, null, 'Election or start date') +
        '<th>Cross-check</th>' +
      '</tr></thead><tbody>' + (volRowsHtml || '<tr><td colspan="10" class="empty-state">No Stage 2 volunteers encoded for this selection.</td></tr>') + '</tbody></table></div>' +
      (shownVols.length < sortedVols.length ? '<div class="row-actions" style="margin-top:12px"><button class="btn ghost btn-sm" data-act="cspmc-more">Show ' + Math.min(100, sortedVols.length - shownVols.length) + ' more</button></div>' : '') +
    '</div>';

  bindSearch('cspmc-search', function (v) { CSPMC_STATE.search = v; renderCspmc(); });
  refreshIcons($('cspmc-body'));
}


function openCspmcDetail(bkey) {
  CSPMC_STATE.modalBkey = bkey;
  var parts = bkey.split('|'), P = people();
  var b = (SNAP.barangayRows || []).filter(function (x) { return x.province === parts[0] && x.municipality === parts[1] && x.barangay === parts[2]; })[0];
  var s2Vols = P.volunteers.filter(function (v) { return v.isStage2 && v.province + '|' + v.municipality + '|' + v.barangay === bkey; });
  var ev = evaluateCspmcBarangay(b, s2Vols);

  var statusPill = ev.status === 'Encoded'
    ? '<span class="pill good">✓ Compliant</span>'
    : (ev.status === 'Needs fixing' ? '<span class="pill warn">⚠ Needs Fixing</span>' : '<span class="pill bad">○ Not Encoded</span>');

  var cardsHtml = STAGE2_BODIES.map(function (body) {
    var members = ev.bodies[body.id] || [];
    var isFormed = members.length > 0;
    var hasLead = members.some(function (v) { return v.chair; });
    var isCmsc = body.id === 'CMSC';
    var isCmscLacking = isCmsc && (members.length < 3 || !hasLead);
    var isLeadLacking = body.chairRequired && isFormed && !hasLead;

    var cardAccent = !isFormed ? 'accent-idle' : (isCmscLacking || isLeadLacking ? 'accent-warn' : 'accent-good');
    var badge = isFormed
      ? '<span class="pill good tiny">✓ Formed (' + n(members.length) + ')</span>'
      : '<span class="pill idle tiny">Pending BA2</span>';

    var membersList = members.length
      ? '<ol class="cspmc-member-list">' + members.map(function (v) {
          var alumBadge = (isCmsc && v.wasBrest)
            ? ' <span class="pill good tiny" title="Volunteer previously served in BResT (Stage 1)">✓ From BResT</span>'
            : '';
          return '<li class="cspmc-member-item">' +
            nameCell(v) +
            (v.chair ? ' <span class="pill good tiny">' + esc(v.position) + '</span>' : (v.position ? ' <span class="tiny">' + esc(v.position) + '</span>' : ' <span class="tiny muted">Member</span>')) +
            alumBadge +
          '</li>';
        }).join('') + '</ol>'
      : '<div class="tiny muted" style="margin-top:6px">No volunteer encoded for this sub-committee yet.</div>';

    var warnMsg = '';
    if (isCmsc && isFormed && members.length < 3) {
      warnMsg += '<div class="tiny" style="color:var(--warn-text);font-weight:700;margin-top:4px">⚠ Quorum lacking: SM7 Section 1.5.1 mandates at least 3 CVs (currently has ' + members.length + ').</div>';
    }
    if (body.chairRequired && isFormed && !hasLead) {
      warnMsg += '<div class="tiny" style="color:var(--warn-text);font-weight:700;margin-top:4px">⚠ No designated Chairperson / Lead tagged.</div>';
    }

    return '<div class="cspmc-card ' + (isFormed ? 'formed ' : '') + cardAccent + '">' +
      '<div class="cspmc-card-head">' +
        '<div>' +
          '<div class="cspmc-card-title">' + esc(body.short) + ' · ' + esc(body.name) + '</div>' +
          '<div class="cspmc-card-desc">' + esc(body.desc) + '</div>' +
        '</div>' +
        '<div>' + badge + '</div>' +
      '</div>' +
      warnMsg +
      membersList +
    '</div>';
  }).join('');

  var isOrgView = CSPMC_STATE.modalView !== 'cards';
  var viewContent = isOrgView
    ? buildBarangayOrgChartHtml(ev, parts[2], parts[1] + ', ' + parts[0], false)
    : '<div class="cspmc-grid">' + cardsHtml + '</div>';

  var dlgBody = $('cspmc-dialog-body');
  if (!dlgBody) return;

  dlgBody.innerHTML =
    '<div class="dialog-head">' +
      '<div>' +
        '<h2>' + esc(parts[2]) + ' · Stage 2 CSPMC &amp; Sub-Committees</h2>' +
        '<div class="muted">' + esc(parts[1]) + ', ' + esc(parts[0]) + ' · Kalahi-CIDSS PCRP Stage 2 Organization</div>' +
      '</div>' +
      '<div class="row-actions" style="margin:0">' +
        '<button type="button" class="btn ' + (isOrgView ? 'primary' : 'ghost') + ' btn-xs" data-act="cspmc-modal-view" data-v="org">' + icon('layers') + ' <span>Org Chart</span></button>' +
        '<button type="button" class="btn ' + (!isOrgView ? 'primary' : 'ghost') + ' btn-xs" data-act="cspmc-modal-view" data-v="cards">' + icon('grid') + ' <span>Grid Cards</span></button>' +
        statusPill +
        '<button class="btn ghost icon-btn" value="close" aria-label="Close dialog" title="Close (Esc)">' + icon('x') + '</button>' +
      '</div>' +
    '</div>' +
    (ev.reasons.length ? '<div class="msg warn" style="margin-top:12px">' + icon('alert-triangle') + ' <div><strong>Stage 2 Validation Items</strong><ul style="margin:4px 0 0;padding-left:18px">' + ev.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div></div>' : '') +
    viewContent +
    '<div class="row-actions dialog-foot">' +
      '<button class="btn ghost" value="close">Close</button>' +
    '</div>';

  var dlg = $('cspmc-dialog');
  if (dlg && !dlg.open) {
    if (typeof openModalAnimated === 'function') openModalAnimated(dlg);
    else dlg.showModal();
  }
}

// ===================================================================
// MODULE 6: MResT (Municipal Resilience Team Dedicated Module)
// Per SM1 Section 3.1 (pp. 13-15) & SM7 Section 1.5.1
// Mandates: Mayor Chair, MPDC/MDRRMO Leads, All Barangay Captains
// with Community Wing comprising not less than 50% of membership.
// ===================================================================

var MREST_CLUSTERS = [
  { id: 'CAPTAINS', name: 'Barangay Captains (Punong Barangays)', short: 'Punong Barangays', desc: 'All Barangay Captains in the municipality (mandated ≥50% of MResT quorum per SM1 Para 13)', wing: 'community', isCommunity: true },
  { id: 'IPMR', name: 'Indigenous Peoples Mandatory Rep', short: 'IPMR', desc: 'Mandatory representation for ancestral domains & IP communities', wing: 'community', isCommunity: true },
  { id: 'CSO', name: 'Civil Society & NGOs', short: 'CSO / NGO', desc: 'Accredited CSOs, NGOs, and Peoples Organizations (min. 2 reps)', wing: 'community', isCommunity: true },
  { id: 'INFRA', name: 'Engineering & Infrastructure', short: 'Engineering (MEO)', desc: 'Municipal Engineering Office, technical inspections, & sub-project design review', wing: 'technical', isCommunity: false },
  { id: 'SOCIAL', name: 'Social Protection & Health', short: 'Social & Health', desc: 'MSWDO & Municipal Health Office (MHO) ensuring community safeguards', wing: 'technical', isCommunity: false },
  { id: 'CLIMATE', name: 'Environment & Agriculture', short: 'Climate & Agri', desc: 'MENRO (climate action/forestry) and MAO (agriculture & food resilience)', wing: 'technical', isCommunity: false },
  { id: 'FINANCE', name: 'Finance, Budget & Enterprise', short: 'Finance & Budget', desc: 'MBO, Municipal Accountant, MTO, MEEDO, and PESO for LCC counterparting', wing: 'technical', isCommunity: false }
];
var MREST_CLUSTER_MAP = {};
MREST_CLUSTERS.forEach(function (c) { MREST_CLUSTER_MAP[c.id] = c; });

function classifyMrestRole(pos, com) {
  var p = normAlpha(pos || '');
  var c = normAlpha(com || '');

  // 1. Local Chief Executive / Mayor
  if (p.indexOf('mayor') !== -1 || p.indexOf('lce') !== -1 || p.indexOf('localchiefexecutive') !== -1) {
    if (p.indexOf('vice') === -1) return 'LCE';
  }
  if ((p === 'chair' || p === 'chairperson' || p === 'chairman' || p === 'head') && p.indexOf('vice') === -1 && p.indexOf('co') === -1) {
    return 'LCE';
  }

  // 2. Planning & Operational Lead (Co-Chair)
  if (p.indexOf('mpdc') !== -1 || p.indexOf('mpdo') !== -1 || p.indexOf('planninganddevelopment') !== -1 || p.indexOf('planningcoordinator') !== -1 || p.indexOf('cochair') !== -1 || p.indexOf('vicechair') !== -1) {
    return 'LEAD';
  }
  if (p.indexOf('mdrrm') !== -1 || p.indexOf('disaster') !== -1) {
    return 'LEAD';
  }

  // 3. Barangay Captains (Punong Barangays)
  if (p.indexOf('captain') !== -1 || p.indexOf('punongbarangay') !== -1 || p.indexOf('pb') !== -1 || p.indexOf('brgycaptain') !== -1 || p.indexOf('barangaychair') !== -1 || p.indexOf('liga') !== -1 || p.indexOf('lnb') !== -1 || p.indexOf('abc') !== -1) {
    return 'CAPTAINS';
  }

  // 4. Legislative & DILG Oversight
  if (p.indexOf('sangguniangbayan') !== -1 || p.indexOf('sbmember') !== -1 || p.indexOf('sb') !== -1 || p.indexOf('councilor') !== -1 || p.indexOf('mlgoo') !== -1 || p.indexOf('dilg') !== -1) {
    return 'SB_DILG';
  }

  // 5. Indigenous Peoples Mandatory Representative
  if (p.indexOf('ipmr') !== -1 || p.indexOf('indigenous') !== -1 || p.indexOf('tribal') !== -1) {
    return 'IPMR';
  }

  // 6. Engineering & Infrastructure
  if (p.indexOf('engineer') !== -1 || p.indexOf('meo') !== -1 || p.indexOf('building') !== -1 || p.indexOf('infra') !== -1 || p === 'me') {
    return 'INFRA';
  }

  // 7. Social Protection & Health
  if (p.indexOf('mswdo') !== -1 || p.indexOf('socialwelfare') !== -1 || p.indexOf('socialworker') !== -1 || p.indexOf('health') !== -1 || p.indexOf('mho') !== -1 || p.indexOf('doctor') !== -1 || p.indexOf('nurse') !== -1 || p.indexOf('rhu') !== -1) {
    return 'SOCIAL';
  }

  // 8. Environment & Agriculture
  if (p.indexOf('menro') !== -1 || p.indexOf('environment') !== -1 || p.indexOf('naturalresource') !== -1 || p.indexOf('mao') !== -1 || p.indexOf('agricultur') !== -1 || p.indexOf('fisher') !== -1) {
    return 'CLIMATE';
  }

  // 9. Finance, Budget, Accounting & Enterprise
  if (p.indexOf('budget') !== -1 || p.indexOf('mbo') !== -1 || p.indexOf('account') !== -1 || p.indexOf('treasur') !== -1 || p.indexOf('mto') !== -1 || p.indexOf('meedo') !== -1 || p.indexOf('enterprise') !== -1 || p.indexOf('peso') !== -1 || p.indexOf('employment') !== -1) {
    return 'FINANCE';
  }

  // 10. Civil Society & Non-Government Organizations
  if (p.indexOf('cso') !== -1 || p.indexOf('ngo') !== -1 || p.indexOf('civilsociety') !== -1 || p.indexOf('po') !== -1 || p.indexOf('peoplesorg') !== -1 || p.indexOf('private') !== -1 || p.indexOf('sector') !== -1) {
    return 'CSO';
  }

  // 11. External Technical Linkage (ACT / MCT)
  if (p.indexOf('act') !== -1 || p.indexOf('mct') !== -1 || p.indexOf('areacoordinator') !== -1 || p.indexOf('communityfacilitator') !== -1 || p.indexOf('facilitator') !== -1) {
    return 'ACT_MCT';
  }

  return 'OTHER';
}

function buildMrestOrgChartHtml(muniName, provName, muniVols, totalBarangays, eoTag, isVerified, eoCount) {
  var byRole = {
    LCE: [], LEAD: [], SB_DILG: [], ACT_MCT: [],
    CAPTAINS: [], IPMR: [], CSO: [],
    INFRA: [], SOCIAL: [], CLIMATE: [], FINANCE: [], OTHER: []
  };

  muniVols.forEach(function (v) {
    var r = classifyMrestRole(v.position, v.committee);
    if (!byRole[r]) byRole[r] = [];
    byRole[r].push(v);
  });

  var communityVols = byRole.CAPTAINS.concat(byRole.IPMR).concat(byRole.CSO);
  var technicalVols = byRole.INFRA.concat(byRole.SOCIAL).concat(byRole.CLIMATE).concat(byRole.FINANCE);
  var internalTotal = muniVols.filter(function (v) { return classifyMrestRole(v.position, v.committee) !== 'ACT_MCT'; }).length;
  var communityPct = internalTotal > 0 ? Math.round(communityVols.length / internalTotal * 100) : 0;
  var isQuorumMet = communityPct >= 50;

  var mayorVols = byRole.LCE;
  var leadVols = byRole.LEAD;
  var sbVols = byRole.SB_DILG;
  var actVols = byRole.ACT_MCT;
  var captains = byRole.CAPTAINS;

  function renderMemberStack(list) {
    if (!list || !list.length) return '<div class="tiny muted" style="margin-top:2px">No members encoded</div>';
    return '<div class="org-member-stack">' + list.map(function (v) {
      var rowTag = (eoTag && eoTag.rows && eoTag.rows[v.key]) || null;
      var tagPill = !rowTag ? '' : (rowTag.s === 'match' ? ' <span class="pill good tiny" title="Verified against Mayor\'s EO">✓ EO</span>' : ' <span class="pill warn tiny" title="Differs from Mayor\'s EO">⚠ EO</span>');
      return '<div class="org-member-row">' +
        '<span>' + nameCell(v) + tagPill + '</span>' +
        '<span class="tiny muted">' + esc(v.position || 'Member') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderClusterBox(clusterId, title, desc, vols, req) {
    var isFilterActive = MRT_STATE.clusterFilter === clusterId;
    var count = vols.length;
    var ok = req ? count >= req : count > 0;
    var accent = count === 0 ? 'accent-idle' : (ok ? 'accent-good' : 'accent-warn');
    return '<div class="org-node clickable ' + accent + (isFilterActive ? ' active-filter' : '') + '" data-act="mrt-cluster" data-v="' + attr(isFilterActive ? 'all' : clusterId) + '" title="Click to filter member roster by ' + attr(title) + '">' +
      '<div class="org-node-top">' +
        '<span class="org-node-code">' + esc(title) + '</span>' +
        '<span class="pill ' + (ok ? 'good' : (count > 0 ? 'warn' : 'idle')) + ' tiny">' + n(count) + ' in KCIS</span>' +
      '</div>' +
      '<div class="org-node-mandate">' + esc(desc) + '</div>' +
      renderMemberStack(vols) +
    '</div>';
  }

  // Punong Barangays Stack
  var captainsRosterHtml = '';
  if (captains.length > 0) {
    captainsRosterHtml = '<div class="mrest-captains-roster">' +
      captains.map(function (v) {
        var rowTag = (eoTag && eoTag.rows && eoTag.rows[v.key]) || null;
        var tagPill = !rowTag ? '' : (rowTag.s === 'match' ? ' <span class="pill good tiny">✓ EO</span>' : ' <span class="pill warn tiny">⚠ EO</span>');
        var posLabel = v.position ? esc(v.position) : 'Punong Barangay';
        return '<div class="mrest-captain-card">' +
          '<div>' + nameCell(v) + tagPill + '</div>' +
          '<div class="tiny"><span class="mrest-pb-badge">PB</span> <span class="muted">' + posLabel + '</span></div>' +
        '</div>';
      }).join('') +
    '</div>';
  } else {
    captainsRosterHtml = '<div class="tiny warn-text" style="margin-top:6px;line-height:1.4">' +
      '⚠ No Punong Barangays encoded in KCIS yet. SM1 Section 3.1 mandates that all Barangay Captains (or cluster reps if &gt;30 brgys) must participate and comprise ≥50% of MResT.' +
    '</div>';
  }

  var isCaptainsFilter = MRT_STATE.clusterFilter === 'CAPTAINS';
  var captainsNode = '<div class="org-node clickable ' + (captains.length > 0 ? 'accent-good' : 'accent-warn') + (isCaptainsFilter ? ' active-filter' : '') + '" data-act="mrt-cluster" data-v="' + attr(isCaptainsFilter ? 'all' : 'CAPTAINS') + '" title="Click to filter roster for Barangay Captains">' +
    '<div class="org-node-top">' +
      '<span class="org-node-code">ALL BARANGAY CAPTAINS (PUNONG BARANGAYS)</span>' +
      '<span class="pill ' + (captains.length >= totalBarangays && totalBarangays > 0 ? 'good' : (captains.length > 0 ? 'warn' : 'bad')) + ' tiny">' +
        n(captains.length) + ' / ' + n(totalBarangays) + ' Barangays' +
      '</span>' +
    '</div>' +
    '<div class="org-node-name">Direct Barangay &amp; Community Executive Representation</div>' +
    '<div class="org-node-mandate">Mandated by SM1 Section 3.1: All Punong Barangays represent their communities in municipal risk profiling, PRVA integration, and LCC prioritization.' + (totalBarangays > 30 ? ' (Eligible for ecosystem clustering per SM1 Para 12).' : '') + '</div>' +
    captainsRosterHtml +
  '</div>';

  var mayorContent = mayorVols.length > 0
    ? renderMemberStack(mayorVols)
    : '<div class="org-lead-box"><span class="org-lead-label">Municipal Mayor / LCE</span><span class="tiny warn-text">⚠ No Mayor designated in KCIS</span></div>';

  var leadContent = leadVols.length > 0
    ? renderMemberStack(leadVols)
    : '<div class="org-lead-box"><span class="org-lead-label">MPDC &amp; MDRRMO Leads</span><span class="tiny warn-text">⚠ No Planning / DRRM lead tagged</span></div>';

  var sbContent = sbVols.length > 0
    ? renderMemberStack(sbVols)
    : '<div class="tiny muted" style="margin-top:4px">Sangguniang Bayan &amp; MLGOO (DILG)</div>';

  var actContent = actVols.length > 0
    ? renderMemberStack(actVols)
    : '<div class="tiny muted" style="margin-top:4px">DSWD Kalahi-CIDSS Area Coordinating Team (ACT) &amp; Municipal Coordinating Team (MCT) Operations Support</div>';

  var communityQuotaBadge = isQuorumMet
    ? '<span class="pill good">✓ 50% Quota Met (' + communityPct + '% Community Voice)</span>'
    : '<span class="pill warn">⚠ Below 50% Quota (' + communityPct + '% Community Voice)</span>';

  return '<div class="cspmc-org-wrap">' +
    '<div class="cspmc-org-legend">' +
      '<div><strong>' + esc(muniName) + ' · Municipal Resilience Team (MResT) Co-Governance Chart</strong> <span class="muted">(Province of ' + esc(provName) + ' · Organized via Mayor\'s Executive Order per SM1 Section 3.1)</span></div>' +
      '<div class="cspmc-org-legend-items">' +
        (MRT_STATE.clusterFilter !== 'all' ? '<button type="button" class="btn ghost btn-xs" data-act="mrt-cluster" data-v="all">' + icon('x') + ' Clear Filter (' + esc(MRT_STATE.clusterFilter) + ')</button>' : '') +
        '<span><span class="org-legend-dot" style="background:var(--primary)"></span>Executive Core</span>' +
        '<span><span class="org-legend-dot" style="background:var(--good)"></span>Community Wing (≥50% Mandate)</span>' +
        '<span><span class="org-legend-dot" style="background:#6366f1"></span>MLGU Technical Wing</span>' +
      '</div>' +
    '</div>' +
    '<div class="cspmc-org-inner">' +
      '<!-- Tier 1 Apex: Office of the Municipal Mayor -->' +
      '<div class="org-tier-apex">' +
        '<div class="org-node-apex">' +
          '<div class="org-node-apex-title">' + icon('award') + ' <span>OFFICE OF THE MUNICIPAL MAYOR (CHAIRPERSON)</span></div>' +
          '<div class="org-node-apex-sub">Local Chief Executive · Legally Convenes MResT via Executive Order (EO)</div>' +
          mayorContent +
        '</div>' +
      '</div>' +
      '<div class="org-stem-down"></div>' +
      '<!-- Tier 2 Middle: Legislative Oversight, Operational Steering, Technical Link -->' +
      '<div class="org-tier-middle">' +
        '<div class="org-mid-col side-left">' +
          '<div class="org-connector-tag">Legislative &amp; DILG Oversight (Reports to SB/Mayor)</div>' +
          '<div class="org-node accent-idle" data-act="mrt-cluster" data-v="' + attr(MRT_STATE.clusterFilter === 'SB_DILG' ? 'all' : 'SB_DILG') + '" style="cursor:pointer">' +
            '<div class="org-node-top"><span class="org-node-code">SB &amp; MLGOO (DILG)</span><span class="pill ' + (sbVols.length >= 2 ? 'good' : 'idle') + ' tiny">' + n(sbVols.length) + ' in KCIS</span></div>' +
            '<div class="org-node-mandate">SB Committee on Appropriations &amp; Social Welfare; MLGOO ensuring local policy alignment</div>' +
            sbContent +
          '</div>' +
        '</div>' +
        '<div class="org-mid-col center-core">' +
          '<div class="org-connector-tag">Operational Steering &amp; Secretariat</div>' +
          '<div class="org-node accent-exec" data-act="mrt-cluster" data-v="' + attr(MRT_STATE.clusterFilter === 'LEAD' ? 'all' : 'LEAD') + '" style="cursor:pointer">' +
            '<div class="org-node-top"><span class="org-node-code">MPDC &amp; MDRRMO LEADS</span><span class="pill ' + (leadVols.length > 0 ? 'good' : 'warn') + ' tiny">' + (leadVols.length > 0 ? '✓ Designated' : 'Pending') + '</span></div>' +
            '<div class="org-node-mandate">Designated Co-Chairpersons · Steers CRIP, MRP Workshop, and Inter-Departmental Work</div>' +
            leadContent +
          '</div>' +
        '</div>' +
        '<div class="org-mid-col side-right">' +
          '<div class="org-connector-tag">Field Technical Guidance &amp; Coaching</div>' +
          '<div class="org-node accent-idle">' +
            '<div class="org-node-top"><span class="org-node-code">DSWD KALAHI-CIDSS</span><span class="pill idle tiny">Field Support</span></div>' +
            '<div class="org-node-mandate">Area Coordinating Team (ACT) &amp; Municipal Coordinating Team (MCT) technical facilitators</div>' +
            actContent +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="org-stem-down"></div>' +
      '<div class="org-connector-tag" style="margin-bottom:6px">Balanced Co-Governance Architecture: Community Voice &amp; MLGU Technical Operations</div>' +
      '<!-- Tier 3 Dual Wings: Community (≥50%) vs MLGU Technical Departments -->' +
      '<div class="mrest-dual-wings">' +
        '<!-- Left Wing: Community & Barangay Leadership Wing -->' +
        '<div class="mrest-wing-box community-wing">' +
          '<div class="mrest-wing-head">' +
            '<div>' +
              '<div class="mrest-wing-title">' + icon('users') + ' <span>Community &amp; Barangay Leadership Wing</span></div>' +
              '<div class="mrest-wing-sub">Mandated by SM1 Section 3.1 Para 13 to comprise not less than 50% of MResT membership</div>' +
            '</div>' +
            '<div>' + communityQuotaBadge + '</div>' +
          '</div>' +
          captainsNode +
          '<div class="mrest-sub-grid">' +
            renderClusterBox('IPMR', 'IP MANDATORY REP (IPMR)', 'Representation for Ancestral Domains and Indigenous Communities per IPRA', byRole.IPMR, 0) +
            renderClusterBox('CSO', 'ACCREDITED CSOS / NGOS', 'Civil Society, NGOs, &amp; Sectoral PO Leaders (min. 2 reps per SM1 Para 11)', byRole.CSO, 2) +
          '</div>' +
        '</div>' +
        '<!-- Right Wing: MLGU Technical & Sectoral Wing -->' +
        '<div class="mrest-wing-box technical-wing">' +
          '<div class="mrest-wing-head">' +
            '<div>' +
              '<div class="mrest-wing-title">' + icon('building-2') + ' <span>MLGU Technical &amp; Sectoral Wing</span></div>' +
              '<div class="mrest-wing-sub">Hazard integration, technical review, engineering verification, &amp; LCC budgeting</div>' +
            '</div>' +
            '<div><span class="pill idle tiny">' + n(technicalVols.length) + ' in KCIS</span></div>' +
          '</div>' +
          '<div class="mrest-sub-grid">' +
            renderClusterBox('INFRA', 'ENGINEERING (MEO)', 'Municipal Engineering Office, technical inspections, &amp; sub-project feasibility', byRole.INFRA, 1) +
            renderClusterBox('SOCIAL', 'SOCIAL WELFARE &amp; HEALTH', 'MSWDO &amp; Municipal Health Office (MHO) ensuring community safeguards', byRole.SOCIAL, 1) +
            renderClusterBox('CLIMATE', 'ENVIRONMENT &amp; AGRI', 'MENRO (climate resilience) &amp; MAO (food security/fisherfolk)', byRole.CLIMATE, 1) +
            renderClusterBox('FINANCE', 'FINANCE &amp; ENTERPRISE', 'Budget (MBO), Accountant, Treasury (MTO), MEEDO, &amp; PESO for LCC counterparting', byRole.FINANCE, 1) +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ===================================================================
// MREST CO-GOVERNANCE TRIAGE & SUMMARY HELPERS
// ===================================================================

function getMrestTriageSummary(muniVols, totalBarangays, allMrest, munis, isMuni, eoTag) {
  var list = muniVols || [];
  var totalMembers = list.length;
  var totalBrgys = totalBarangays || 0;

  var captainsCount = 0;
  var ipmrCount = 0;
  var csoCount = 0;
  var infraCount = 0;
  var socialCount = 0;
  var climateCount = 0;
  var financeCount = 0;
  var leadsCount = 0;
  var sbCount = 0;
  var actCount = 0;
  var otherCount = 0;
  var lceVols = [];

  list.forEach(function (v) {
    var role = classifyMrestRole(v.position, v.committee);
    if (role === 'LCE') lceVols.push(v);
    else if (role === 'LEAD') leadsCount++;
    else if (role === 'CAPTAINS') captainsCount++;
    else if (role === 'IPMR') ipmrCount++;
    else if (role === 'CSO') csoCount++;
    else if (role === 'INFRA') infraCount++;
    else if (role === 'SOCIAL') socialCount++;
    else if (role === 'CLIMATE') climateCount++;
    else if (role === 'FINANCE') financeCount++;
    else if (role === 'SB_DILG') sbCount++;
    else if (role === 'ACT_MCT') actCount++;
    else otherCount++;
  });

  var hasLce = lceVols.length > 0;
  var lceName = hasLce ? lceVols[0].name : '';

  // Community Wing: Captains, IPMR, CSO (SM1 Section 3.1 Para 13)
  var communityCount = captainsCount + ipmrCount + csoCount;
  // Internal total excludes external technical linkages like ACT/MCT
  var internalTotal = totalMembers - actCount;
  var communityPct = internalTotal > 0 ? Math.round(communityCount / internalTotal * 100) : 0;
  var isQuorumMet = communityPct >= 50;

  var captainsQuotaMet = totalBrgys > 0 ? (captainsCount >= totalBrgys) : false;

  // 4 Core Technical Departments (MEO, MSWDO/MHO, MENRO/MAO, MBO/MTO)
  var keyOfficesCount = (infraCount > 0 ? 1 : 0) + (socialCount > 0 ? 1 : 0) + (climateCount > 0 ? 1 : 0) + (financeCount > 0 ? 1 : 0);

  // EO Verification
  var isVerified = eoTag && eoTag.rows && Object.keys(eoTag.rows).length > 0;
  var eoCount = eoTag && typeof eoTag.formCount === 'number' ? eoTag.formCount : null;

  return {
    totalMembers: totalMembers,
    totalBrgys: totalBrgys,
    captainsCount: captainsCount,
    captainsQuotaMet: captainsQuotaMet,
    communityCount: communityCount,
    internalTotal: internalTotal,
    communityPct: communityPct,
    isQuorumMet: isQuorumMet,
    hasLce: hasLce,
    lceName: lceName,
    leadsCount: leadsCount,
    infraCount: infraCount,
    socialCount: socialCount,
    climateCount: climateCount,
    financeCount: financeCount,
    keyOfficesCount: keyOfficesCount,
    csoCount: csoCount,
    ipmrCount: ipmrCount,
    sbCount: sbCount,
    actCount: actCount,
    otherCount: otherCount,
    isVerified: isVerified,
    eoCount: eoCount
  };
}

/**
 * Whether an MResT is formed per its composition (SM1 Section 3.1): the Mayor
 * as chair, an MPDC / MDRRMO co-lead, all Punong Barangays, a community wing of
 * at least 50%, and the 4 core LGU offices. Members in KCIS alone do not make
 * it formed. summary: getMrestTriageSummary(). Returns
 *   { status: 'none' (no member in KCIS) | 'incomplete' | 'complete', gaps: [what is missing], members }
 */
function mrestComposition(summary) {
  var s = summary || {};
  if (!s.totalMembers) return { status: 'none', gaps: [], members: 0 };
  var gaps = [];
  if (!s.hasLce) gaps.push('Mayor as chair');
  if (!s.leadsCount) gaps.push('MPDC / MDRRMO co-lead');
  if (s.totalBrgys > 0 && !s.captainsQuotaMet) gaps.push((s.totalBrgys - s.captainsCount) + ' of ' + s.totalBrgys + ' Punong Barangays');
  if (!s.isQuorumMet) gaps.push('community wing at ' + s.communityPct + '% (needs at least 50%)');
  if (s.keyOfficesCount < 4) gaps.push((4 - s.keyOfficesCount) + ' of 4 core LGU offices');
  return { status: gaps.length ? 'incomplete' : 'complete', gaps: gaps, members: s.totalMembers };
}

/** mrestComposition() of one municipality, from the MResT rows of the people index. */
function mrestStatusOf(province, municipality) {
  var vols = (people().mrest || []).filter(function (r) { return r.province === province && r.municipality === municipality; });
  var m = baselineMunis().filter(function (x) { return x.province === province && x.municipality === municipality; })[0];
  return mrestComposition(getMrestTriageSummary(vols, m ? m.barangays : 0));
}

/** A status pill: Formed / Incomplete (what is missing in its tooltip) / Not in KCIS. */
function mrestStatusPill(c) {
  if (c.status === 'complete') return '<span class="pill good" title="Formed per SM1 Section 3.1 composition">✓ Formed (' + n(c.members) + ')</span>';
  if (c.status === 'incomplete') {
    return '<span class="pill warn" title="' + attr('Missing: ' + c.gaps.join('; ')) + '">⚠ Incomplete (' + n(c.members) + ' in KCIS)</span>';
  }
  return '<span class="pill bad">○ Not in KCIS</span>';
}

function renderMrestTriageTray(summary) {
  var isAllGood = summary.totalMembers > 0 && summary.isQuorumMet && summary.hasLce && summary.leadsCount > 0 && summary.keyOfficesCount === 4;
  var items = [];

  // 1. Total Roster
  items.push(
    '<button type="button" class="triage-item' + (MRT_STATE.clusterFilter === 'all' ? ' active-triage' : '') + '" data-act="mrt-triage" data-v="all" title="View all encoded MResT roster members">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.totalMembers) + '</span>' +
        '<span class="triage-item-label">Total MResT Roster</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 2. Community Wing Quota (≥50%)
  var commClass = summary.isQuorumMet ? 'triage-good' : 'triage-warn';
  items.push(
    '<button type="button" class="triage-item ' + commClass + (MRT_STATE.clusterFilter === 'COMMUNITY_WING' ? ' active-triage' : '') + '" data-act="mrt-triage" data-v="COMMUNITY_WING" title="SM1 Section 3.1: Community representation quota (≥50% mandate)">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + summary.communityPct + '% <span class="tiny">(' + n(summary.communityCount) + ' CVs)</span></span>' +
        '<span class="triage-item-label">Community Wing (&ge;50%)</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 3. Barangay Captains
  var pbStatusClass = summary.captainsQuotaMet ? 'triage-good' : (summary.captainsCount > 0 ? 'triage-warn' : 'triage-bad');
  items.push(
    '<button type="button" class="triage-item ' + pbStatusClass + (MRT_STATE.clusterFilter === 'CAPTAINS' ? ' active-triage' : '') + '" data-act="mrt-triage" data-v="CAPTAINS" title="All Punong Barangays must participate in MResT per SM1 Section 3.1">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + n(summary.captainsCount) + ' <span class="tiny">/ ' + n(summary.totalBrgys) + ' PBs</span></span>' +
        '<span class="triage-item-label">Barangay Captains</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 4. Executive Steering (Mayor & Leads)
  var steerOk = summary.hasLce && summary.leadsCount > 0;
  items.push(
    '<button type="button" class="triage-item ' + (steerOk ? 'triage-good' : 'triage-warn') + (MRT_STATE.clusterFilter === 'STEERING' ? ' active-triage' : '') + '" data-act="mrt-triage" data-v="STEERING" title="Executive Steering: Municipal Mayor (LCE) + MPDC & MDRRMO operational co-leads">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + (summary.hasLce ? '✓ Mayor' : '⚠ No Mayor') + '</span>' +
        '<span class="triage-item-label">' + (summary.leadsCount ? n(summary.leadsCount) + ' Co-Lead(s)' : 'Pending Leads') + '</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  // 5. Core LGU Offices (4 Depts: Engineering, Social/Health, Environment/Agri, Finance/Budget)
  var lguOk = summary.keyOfficesCount === 4;
  items.push(
    '<button type="button" class="triage-item ' + (lguOk ? 'triage-good' : 'triage-warn') + (MRT_STATE.clusterFilter === 'TECHNICAL_WING' ? ' active-triage' : '') + '" data-act="mrt-triage" data-v="TECHNICAL_WING" title="Core Technical LGU Offices: MEO, MSWDO/MHO, MENRO/MAO, MBO/MTO">' +
      '<div class="triage-item-info">' +
        '<span class="triage-item-count">' + summary.keyOfficesCount + ' / 4 <span class="tiny">Depts</span></span>' +
        '<span class="triage-item-label">Core LGU Offices</span>' +
      '</div>' +
      '<span class="triage-item-arrow">' + icon('arrow-right') + '</span>' +
    '</button>'
  );

  return (
    '<div class="triage-tray">' +
      '<div class="triage-header">' +
        '<div class="triage-title">' +
          icon('award') + ' <span>Municipal Resilience Team (MResT) Co-Governance Action Center</span>' +
        '</div>' +
        '<div class="triage-status ' + (isAllGood ? 'status-good' : 'status-warn') + '">' +
          icon(isAllGood ? 'check-circle-2' : 'alert-circle') +
          '<span>' + (isAllGood ? 'MResT Roster Fully Formed &amp; Quota Compliant' : (summary.communityPct < 50 ? 'Community Wing below 50% quota' : (summary.captainsCount < summary.totalBrgys ? 'Missing Punong Barangays in roster' : 'Steering or LGU departments pending'))) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="triage-grid">' +
        items.join('') +
      '</div>' +
    '</div>'
  );
}

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

  var muniBase = munis.filter(function (m) { return m.province === provName && m.municipality === muniName; })[0];
  var totalBarangays = muniBase ? muniBase.barangays : 0;

  var muniVols = allMrest.filter(function (r) {
    return r.province === provName && r.municipality === muniName;
  });

  // Verification against Mayor's Executive Order
  var recKey = 'mrest|' + provName + '|' + muniName + '||MREST';
  var eoTag = (typeof vfTag === 'function') ? vfTag(recKey) : null;
  var isVerified = eoTag && eoTag.rows && Object.keys(eoTag.rows).length > 0;
  var eoCount = eoTag && typeof eoTag.formCount === 'number' ? eoTag.formCount : null;

  // Triage & summary metrics
  var summary = getMrestTriageSummary(muniVols, totalBarangays, allMrest, munis, isMuni, eoTag);
  var communityCount = summary.communityCount;
  var internalTotal = summary.internalTotal;
  var communityPct = summary.communityPct;
  var isQuorumMet = summary.isQuorumMet;
  var captainsCount = summary.captainsCount;

  // Filter volunteers by cluster
  var communityVols = muniVols.filter(function (v) {
    var r = classifyMrestRole(v.position, v.committee);
    return r === 'CAPTAINS' || r === 'IPMR' || r === 'CSO';
  });
  var captainsVols = muniVols.filter(function (v) {
    return classifyMrestRole(v.position, v.committee) === 'CAPTAINS';
  });

  // KPIs: formed only when the composition is complete, not when members are merely in KCIS
  var comp = mrestComposition(summary);
  var chair = muniVols.filter(function (r) { return classifyMrestRole(r.position, r.committee) === 'LCE'; })[0];
  var leads = muniVols.filter(function (r) { return classifyMrestRole(r.position, r.committee) === 'LEAD'; });

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
    var compOf = {};   // municipality -> mrestComposition()
    baseMunis.forEach(function (m) { compOf[m.province + '|' + m.municipality] = mrestStatusOf(m.province, m.municipality); });
    var cMuniFormed = baseMunis.filter(function (m) { return compOf[m.province + '|' + m.municipality].status === 'complete'; }).length;
    var cMuniIncomplete = baseMunis.filter(function (m) { return compOf[m.province + '|' + m.municipality].status === 'incomplete'; }).length;
    var cMuniVer = baseMunis.filter(function (m) {
      var mRecKey = 'mrest|' + m.province + '|' + m.municipality + '||MREST';
      var mTag = (typeof vfTag === 'function') ? vfTag(mRecKey) : null;
      return mTag && mTag.rows && Object.keys(mTag.rows).length > 0;
    }).length;
    var cMuniPend = cMuniAll - cMuniVer;

    var matrixCards = [
      ['all', 'All Municipalities', cMuniAll, ''],
      ['formed', 'Formed (composition complete)', cMuniFormed, 'fc-good'],
      ['incomplete', 'Composition incomplete', cMuniIncomplete, 'fc-warn'],
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
      var mStatus = compOf[m.province + '|' + m.municipality].status;
      if (mFilter === 'formed' && mStatus !== 'complete') return false;
      if (mFilter === 'incomplete' && mStatus !== 'incomplete') return false;
      if (mFilter === 'verified' && !mVer) return false;
      if (mFilter === 'pending' && mVer) return false;
      return true;
    });

    var matrixRowsHtml = filteredMunis.map(function (m) {
      var mKey = m.province + '|' + m.municipality;
      var mVols = allMrest.filter(function (r) { return r.province === m.province && r.municipality === m.municipality; });
      var mChair = mVols.filter(function (r) { return classifyMrestRole(r.position, r.committee) === 'LCE'; })[0];
      var mCaptains = mVols.filter(function (r) { return classifyMrestRole(r.position, r.committee) === 'CAPTAINS'; });
      var mRecKey = 'mrest|' + m.province + '|' + m.municipality + '||MREST';
      var mTag = (typeof vfTag === 'function') ? vfTag(mRecKey) : null;
      var mVer = mTag && mTag.rows && Object.keys(mTag.rows).length > 0;
      var mPbBar = quotaMiniProgressBar(mCaptains.length, m.barangays, 1.0, 'Mandatory: All Punong Barangays');

      return '<tr class="' + (activeMuni === mKey ? 'active' : '') + '">' +
        '<td><strong>' + esc(m.municipality) + '</strong></td>' +
        '<td>' + esc(m.province) + '</td>' +
        '<td>' + mrestStatusPill(compOf[mKey]) + '</td>' +
        '<td>' + (mChair ? esc(mChair.name) : '<span class="tiny text-dim">No lead tagged</span>') + '</td>' +
        '<td>' + mPbBar + '</td>' +
        '<td>' + (mVer ? '<span class="pill good">✓ EO Verified</span>' : '<span class="pill idle">Pending EO</span>') + '</td>' +
        '<td><button type="button" class="btn ghost btn-sm" data-act="mrt-pick-muni" data-v="' + attr(mKey) + '">' + icon('award') + ' <span>View Org Chart ›</span></button></td>' +
      '</tr>';
    }).join('');

    matrixHtml = '<div class="card" style="margin-top:16px">' +
      '<div class="card-head"><div><h3>Regional MResT Compliance Matrix</h3><div class="tiny">Cross-municipality comparison of Executive Order &amp; MResT formation across Caraga Region</div></div></div>' +
      '<div class="filter-cards" style="margin-bottom:12px">' + matrixCards + '</div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
        '<th>Municipality</th><th>Province</th><th>MResT Status</th><th>Designated Lead</th><th>Barangay Captains</th><th>EO Verification</th><th>Action</th>' +
      '</tr></thead><tbody>' + (matrixRowsHtml || '<tr><td colspan="7" class="empty-state">No municipalities match these filters.</td></tr>') + '</tbody></table></div></div>';
  }

  // Filter Roster by search and cluster
  var q = normSearch(MRT_STATE.search.trim());
  var filteredRoster = muniVols.filter(function (r) {
    if (MRT_STATE.clusterFilter !== 'all') {
      var role = classifyMrestRole(r.position, r.committee);
      if (MRT_STATE.clusterFilter === 'COMMUNITY_WING') {
        if (role !== 'CAPTAINS' && role !== 'IPMR' && role !== 'CSO') return false;
      } else if (MRT_STATE.clusterFilter === 'TECHNICAL_WING') {
        if (role !== 'INFRA' && role !== 'SOCIAL' && role !== 'CLIMATE' && role !== 'FINANCE') return false;
      } else if (MRT_STATE.clusterFilter === 'STEERING') {
        if (role !== 'LCE' && role !== 'LEAD') return false;
      } else if (role !== MRT_STATE.clusterFilter) {
        return false;
      }
    }
    if (q && normSearch(r.name + ' ' + r.position + ' ' + (r.committee || '')).indexOf(q) === -1) return false;
    return true;
  });

  var curCol = MRT_STATE.sortCol || 'name';
  var curDir = MRT_STATE.sortDir || 'asc';
  var mExt = {
    name: function (r) { return r.name; },
    sex: function (r) { return r.sex; },
    position: function (r) { return r.position || ''; },
    cluster: function (r) { return classifyMrestRole(r.position, r.committee); },
    committee: function (r) { return r.committee || ''; },
    eo: function (r) {
      var rowTag = (eoTag && eoTag.rows && eoTag.rows[r.key]) || null;
      return !rowTag ? 0 : (rowTag.s === 'match' ? 2 : 1);
    }
  };
  var sortedRoster = tblSort(filteredRoster, curCol, curDir, mExt);

  var rosterRows = sortedRoster.map(function (r) {
    var role = classifyMrestRole(r.position, r.committee);
    var clusterObj = MREST_CLUSTER_MAP[role] || null;
    var clusterName = clusterObj ? clusterObj.short : (role === 'LCE' ? 'Municipal Mayor' : (role === 'LEAD' ? 'Operational Lead' : (role === 'SB_DILG' ? 'SB & DILG' : 'Other Member')));
    var rowTag = (eoTag && eoTag.rows && eoTag.rows[r.key]) || null;
    var tagPill = !rowTag ? '<span class="tiny muted">Not verified</span>' : (rowTag.s === 'match' ? '<span class="pill good">✓ Matches EO</span>' : '<span class="pill warn">⚠ Differs from EO</span>');
    var isPB = role === 'CAPTAINS';

    return '<tr>' +
      '<td>' + nameCell(r) + (isPB ? ' <span class="mrest-pb-badge">Punong Barangay</span>' : '') + '</td>' +
      '<td>' + esc(r.sex || '—') + '</td>' +
      '<td><strong>' + esc(r.position || 'Member') + '</strong></td>' +
      '<td><span class="pill idle tiny">' + esc(clusterName) + '</span></td>' +
      '<td><span class="tiny">' + esc(r.committee || 'MResT') + '</span></td>' +
      '<td>' + tagPill + '</td>' +
    '</tr>';
  }).join('');

  var th = function (col, label, num, sub, title, sticky, extraClass, term, tooltip) {
    return sortTh({
      col: col,
      curCol: curCol,
      dir: curDir,
      label: label,
      num: num,
      sub: sub,
      title: title,
      sticky: sticky,
      act: 'mrt-sort',
      extraClass: extraClass,
      term: term,
      tooltip: tooltip
    });
  };

  // Municipalities dropdown (for RPMO)
  var mOpts = '<option value="">Select Municipality</option>';
  munis.forEach(function (m) {
    var v = m.province + '|' + m.municipality;
    mOpts += '<option value="' + attr(v) + '"' + (activeMuni === v ? ' selected' : '') + '>' + esc(m.municipality) + ' (' + esc(m.province) + ' · ' + m.barangays + ' brgys)</option>';
  });

  var scopeBanner = isMuni
    ? '<div class="static-val">' + icon('map-pin') + ' <span>Municipality: <strong>' + esc(muniName) + '</strong> (' + esc(provName) + ') · <strong>' + n(totalBarangays) + ' Barangays</strong></span></div>'
    : '<label class="field" style="margin:0"><span>Active Municipality</span><select data-act="mrt-muni">' + mOpts + '</select></label>';

  // Build Org Chart section if enabled
  var orgChartHtml = '';
  if (MRT_STATE.showOrgChart) {
    orgChartHtml = buildMrestOrgChartHtml(muniName, provName, muniVols, totalBarangays, eoTag, isVerified, eoCount);
  }

  // Quick Cluster Filter Buttons
  var clusterPills = [
    ['all', 'All Members', muniVols.length],
    ['CAPTAINS', 'Punong Barangays', captainsVols.length],
    ['LEAD', 'MPDC & MDRRMO Leads', leads.length],
    ['INFRA', 'Engineering (MEO)', summary.infraCount],
    ['SOCIAL', 'Social & Health', summary.socialCount],
    ['CLIMATE', 'Climate & Agri', summary.climateCount],
    ['FINANCE', 'Finance & Budget', summary.financeCount],
    ['CSO', 'CSOs & NGOs', summary.csoCount],
    ['SB_DILG', 'SB & DILG', summary.sbCount]
  ].map(function (c) {
    var isActive = MRT_STATE.clusterFilter === c[0];
    return '<button type="button" class="filter-card' + (isActive ? ' active' : '') + '" data-act="mrt-cluster" data-v="' + c[0] + '">' +
      '<span class="fc-label">' + esc(c[1]) + '</span>' +
      '<span class="fc-count">' + n(c[2]) + '</span>' +
    '</button>';
  }).join('');

  var quickMrestChips = '<div class="quick-filter-bar">' +
    '<span class="tiny text-muted" style="font-weight:700;margin-right:4px;">Co-Governance Presets:</span>' +
    '<button type="button" class="quick-filter-chip' + (MRT_STATE.clusterFilter === 'all' ? ' active' : '') + '" data-act="mrt-chip" data-v="all">' +
      '<span>All Members</span> <span class="tiny" style="opacity:0.85">(' + n(muniVols.length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-good' + (MRT_STATE.clusterFilter === 'CAPTAINS' ? ' active' : '') + '" data-act="mrt-chip" data-v="CAPTAINS">' +
      '<span>👑 Punong Barangays</span> <span class="tiny" style="opacity:0.85">(' + n(captainsVols.length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip chip-good' + (MRT_STATE.clusterFilter === 'STEERING' ? ' active' : '') + '" data-act="mrt-chip" data-v="STEERING">' +
      '<span>⭐ Steering (Mayor &amp; Leads)</span> <span class="tiny" style="opacity:0.85">(' + n((chair ? 1 : 0) + leads.length) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (MRT_STATE.clusterFilter === 'INFRA' ? ' active chip-good' : '') + '" data-act="mrt-chip" data-v="INFRA">' +
      '<span>🔧 Engineering (MEO)</span> <span class="tiny" style="opacity:0.85">(' + n(summary.infraCount) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (MRT_STATE.clusterFilter === 'SOCIAL' ? ' active chip-good' : '') + '" data-act="mrt-chip" data-v="SOCIAL">' +
      '<span>🩺 Social &amp; Health</span> <span class="tiny" style="opacity:0.85">(' + n(summary.socialCount) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (MRT_STATE.clusterFilter === 'CLIMATE' ? ' active chip-good' : '') + '" data-act="mrt-chip" data-v="CLIMATE">' +
      '<span>🌱 Climate &amp; Agri</span> <span class="tiny" style="opacity:0.85">(' + n(summary.climateCount) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (MRT_STATE.clusterFilter === 'FINANCE' ? ' active chip-good' : '') + '" data-act="mrt-chip" data-v="FINANCE">' +
      '<span>💼 Finance &amp; Budget</span> <span class="tiny" style="opacity:0.85">(' + n(summary.financeCount) + ')</span>' +
    '</button>' +
    '<button type="button" class="quick-filter-chip' + (MRT_STATE.clusterFilter === 'CSO' ? ' active chip-good' : '') + '" data-act="mrt-chip" data-v="CSO">' +
      '<span>🤝 CSOs &amp; NGOs</span> <span class="tiny" style="opacity:0.85">(' + n(summary.csoCount) + ')</span>' +
    '</button>' +
    (MRT_STATE.clusterFilter !== 'all' ? '<button type="button" class="quick-filter-chip active chip-warn" data-act="mrt-chip" data-v="all" title="Clear filter">' +
      '<span>Filter: ' + esc(MRT_STATE.clusterFilter) + '</span> <span class="tiny">✕ Clear</span>' +
    '</button>' : '') +
  '</div>';

  var commQuotaBar = quotaMiniProgressBar(communityVols.length, internalTotal, 0.5, 'SM1 Para 13: ≥50% Community Voice');
  var pbQuotaBar = quotaMiniProgressBar(captainsVols.length, totalBarangays, 1.0, 'SM1 Section 3.1: All Punong Barangays');

  body.innerHTML =
    '<div class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h2>Municipal Resilience Team (MResT)</h2>' +
          '<div class="muted">Tracks the multi-sectoral LGU and community co-governance team organized under the Mayor\'s Executive Order for <strong>' + esc(muniName) + ' (' + esc(provName) + ')</strong> per SM1 Section 3.1.</div>' +
        '</div>' +
        '<div class="row-actions" style="margin:0">' +
          '<button type="button" class="btn ' + (MRT_STATE.showOrgChart ? 'primary' : 'ghost') + ' btn-sm" data-act="mrt-toggle-org">' + icon('layers') + ' <span>' + (MRT_STATE.showOrgChart ? 'Hide Org Chart' : 'Show Org Chart') + '</span></button>' +
          '<button class="btn ghost btn-sm" data-act="mrt-export">' + icon('download') + ' <span>Export MResT Roster CSV</span></button>' +
        '</div>' +
      '</div>' +
      kpiPageLink('mrest', activeMuni) +
      '<div class="mrest-hero" style="margin-top:16px">' +
        '<div class="mrest-hero-info">' +
          '<h3>' + esc(muniName) + ' Municipal Resilience Team</h3>' +
          '<div class="muted">Province of ' + esc(provName) + ' · ' + n(totalBarangays) + ' Participating Barangays · Kalahi-CIDSS PCRP LGU Operations</div>' +
        '</div>' +
        '<div class="mrest-hero-badges">' +
          (comp.status === 'complete' ? '<span class="pill good" style="font-size:13px;padding:4px 10px">✓ Formed · ' + n(muniVols.length) + ' Members</span>'
            : (comp.status === 'incomplete' ? '<span class="pill warn" style="font-size:13px;padding:4px 10px" title="' + attr('Missing: ' + comp.gaps.join('; ')) + '">⚠ Composition Incomplete · ' + n(muniVols.length) + ' in KCIS</span>'
            : '<span class="pill bad" style="font-size:13px;padding:4px 10px">○ Not Encoded in KCIS</span>')) +
          (isQuorumMet ? '<span class="pill good" style="font-size:13px;padding:4px 10px">✓ ' + communityPct + '% Community Quota</span>' : '<span class="pill warn" style="font-size:13px;padding:4px 10px">⚠ ' + communityPct + '% Community Voice (&lt;50%)</span>') +
          (isVerified ? '<span class="pill good" style="font-size:13px;padding:4px 10px">✓ EO Verified (' + (eoCount !== null ? eoCount + ' on paper' : 'verified') + ')</span>' : '<span class="pill idle" style="font-size:13px;padding:4px 10px">Pending EO Verification</span>') +
        '</div>' +
      '</div>' +
      orgChartHtml +
      '<div class="card-head" style="margin-top:20px;margin-bottom:6px">' +
        '<div><h3 style="margin:0;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted)">Filter by Functional Cluster</h3></div>' +
      '</div>' +
      quickMrestChips +
      '<div class="filter-cards" style="margin-bottom:14px;margin-top:10px">' + clusterPills + '</div>' +
      '<div class="toolbar-row"><div class="filters" style="margin:0">' +
        scopeBanner +
        '<label class="field" style="min-width:260px;flex:1"><span>Search Member / Office / Committee</span><input type="search" id="mrt-search" value="' + attr(MRT_STATE.search) + '" placeholder="Search…"></label>' +
        (MRT_STATE.clusterFilter !== 'all' || MRT_STATE.search ? '<button type="button" class="btn ghost btn-sm" data-act="mrt-reset">' + icon('rotate-ccw') + ' <span>Reset Filter</span></button>' : '') +
      '</div></div>' +
      '<div class="table-wrap" style="margin-top:12px"><table class="grid"><thead><tr>' +
        th('name', 'Name (' + sortedRoster.length + ')', false, null, null, false, '', null, 'Full name and profile link of MResT member') +
        th('sex', 'Sex', false, null, null, false, '', null, 'Sex / Gender representation') +
        th('position', 'Position / Office in LGU', false, null, null, false, '', null, 'Designated office or role in MLGU or community') +
        th('cluster', 'Functional Cluster', false, null, null, false, '', 'mrest', 'Assigned co-governance cluster per SM1 Section 3.1') +
        th('committee', 'Committee Tag', false, null, null, false, '', null, 'KCIS committee tag') +
        th('eo', 'EO Verification', false, null, null, false, '', null, 'Validation status against physical Executive Order signed by Mayor') +
      '</tr></thead><tbody>' + (rosterRows || '<tr><td colspan="6" class="empty-state">No MResT members match this filter for ' + esc(muniName) + '.</td></tr>') + '</tbody></table></div>' +
      matrixHtml +
    '</div>';

  bindSearch('mrt-search', function (v) { MRT_STATE.search = v; renderMrest(); });
  refreshIcons($('mrt-body'));
}


// ===================================================================
// BACKWARD COMPATIBILITY & SHARED PEOPLE VIEW
// ===================================================================

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
    return '<div class="committee-detail ' + accent + '"><div class="card-head" style="margin:0 0 6px"><strong>' + esc(label) + '</strong><span class="pill ' + cls + '">' + esc(st ? st.status : '—') + '</span></div>' +
      (st && st.reasons && st.reasons.length ? '<div class="tiny" style="color:var(--warn-text);font-weight:700;margin-bottom:4px">⚠ ' + esc(st.reasons.join(' · ')) + '</div>' : '') +
      (m.length
        ? '<div class="tiny">' + n(m.length) + (m.length === 1 ? ' volunteer · ' : ' volunteers · ') + n(women) + (women === 1 ? ' woman' : ' women') + ' · marginalized (women, IP, PWD) <strong>' + Math.round(marg / m.length * 100) + '%</strong></div>' +
          '<ol style="margin:8px 0 0;padding-left:18px">' + m.map(function (v) {
            return '<li style="margin:3px 0">' + nameCell(v) + (v.chair ? ' <span class="pill good">' + esc(v.position) + '</span>' : (v.position ? ' <span class="tiny">' + esc(v.position) + '</span>' : ' <span class="tiny">no position</span>')) +
              ' <span class="tiny">Individual attendance check unavailable</span></li>';
          }).join('') + '</ol>'
        : '<div class="tiny">No volunteer in KCIS for this body yet. This does not mean it was not organized.</div>') +
    '</div>';
  };
  var s2Vols = list.filter(function (v) { return v.isStage2; });
  var s2Card = '';
  if (s2Vols.length) {
    var s2Ev = evaluateCspmcBarangay(b, s2Vols);
    var s2Cls = s2Ev.status === 'Encoded' ? 'good' : (s2Ev.status === 'Needs fixing' ? 'warn' : 'bad');
    var s2Accent = s2Cls === 'good' ? 'accent-good' : (s2Cls === 'warn' ? 'accent-warn' : 'accent-bad');
    var s2Badges = s2Ev.activeBodies.map(function (body) {
      return '<span class="pill idle tiny" style="margin:2px">' + esc(body.short) + ' (' + s2Ev.bodies[body.id].length + ')</span>';
    }).join(' ');
    s2Card = '<div class="committee-detail ' + s2Accent + '"><div class="card-head" style="margin:0 0 6px"><strong>Stage 2: CSPMC &amp; Sub-Committees</strong><span class="pill ' + s2Cls + '">' + esc(s2Ev.status) + '</span></div>' +
      (s2Ev.reasons.length ? '<div class="tiny" style="color:var(--warn-text);font-weight:700;margin-bottom:4px">⚠ ' + esc(s2Ev.reasons.join(' · ')) + '</div>' : '') +
      '<div class="tiny">' + n(s2Vols.length) + ' volunteers in ' + s2Ev.activeBodies.length + ' sub-committees · women: <strong>' + s2Ev.womenPct + '%</strong>' +
      (s2Ev.cmscBrestAlum ? ' · <strong>' + s2Ev.cmscBrestAlum + ' from BResT</strong>' : '') + '</div>' +
      '<div style="margin:8px 0 6px">' + s2Badges + '</div>' +
      '<button type="button" class="btn ghost btn-xs" data-act="open-cspmc-detail" data-brgy="' + attr(bkey) + '">' + icon('layers') + ' <span>View All 8 Sub-Committees ›</span></button>' +
      '</div>';
  }
  var others = list.filter(function (v) { return v.kind !== 'BREST' && v.kind !== 'SFMSC' && !v.isStage2; });
  return '<h3 style="margin-top:6px">Committees of ' + esc(parts[2]) + '</h3><div class="committee-detail-grid">' +
    card('BREST', 'BResT', 'Barangay Resilience Team (BResT)') + card('SFMSC', 'SFMSC', 'Stakeholder and Feedback Mechanism Sub-Committee (SFMSC)') + s2Card + '</div>' +
    (others.length ? '<p class="tiny">' + n(others.length) + ' more volunteer row' + (others.length === 1 ? '' : 's') + ' in this barangay with no committee, or a committee of another activity (listed below).</p>' : '');
}

// ---- profile ---------------------------------------------------------------------------

function openPerson(key) {
  var P = people(), recs = P.byKey[key] || [];
  if (!recs.length) return;
  var name = recs[0].name, loose = recs[0].loose;
  var initials = name.split(/\s+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase(); }).slice(0, 2).join('') || 'P';
  var looseOnly = loose ? (P.byLoose[loose] || []).filter(function (r) { return r.key !== key; }) : [];
  var att = recs.filter(function (r) { return r.type === 'attendee'; }), vol = recs.filter(function (r) { return r.type === 'volunteer'; });
  var places = {};
  recs.forEach(function (r) { if (r.barangay) places[r.barangay + ', ' + r.municipality] = true; });
  var hint = [];
  var bodies = {}; vol.forEach(function (v) { if (v.body) bodies[v.body + ' · ' + v.barangay] = true; });
  if (Object.keys(bodies).length > 1) hint.push('Sits in ' + Object.keys(bodies).join(' and ') + ' (allowed).');
  att.forEach(function (a) { if (a.flags.indexOf('duplicate') !== -1) hint.push('Listed more than once on the ' + a.actLabel + ' attendance sheet of ' + a.barangay + ' for the same date (' + (a.date || 'unspecified date') + ').'); });
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
        '<span class="pill idle">Individual attendance unavailable</span>' +
        '<span class="pill ' + (vol.length ? 'good' : 'idle') + '">' + n(vol.length) + ' Volunteer ' + (vol.length === 1 ? 'role' : 'roles') + '</span>' +
        '<button class="btn ghost icon-btn" value="close" aria-label="Close profile" title="Close (Esc)">' + icon('x') + '</button>' +
      '</div>' +
    '</div>' +
    (hint.length ? '<div class="msg warn" style="margin-top:10px">' + icon('alert-triangle') + ' <div><strong>Items to check</strong><ul style="margin:4px 0 0;padding-left:18px">' + hint.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul></div></div>' : '') +
    '<p class="tiny">Activity Tracker contains attendance totals. Named attendance cross-checks are unavailable.</p>' +
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

function exportBrestTeamsCsv() {
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (BRT_STATE.muni || key || '');
  var brgys = (SNAP.barangayRows || []).filter(function (b) { return !activeMuni || b.province + '|' + b.municipality === activeMuni; });
  var brestVols = P.volunteers.filter(function (v) {
    if (v.kind !== 'BREST') return false;
    return !activeMuni || (v.province + '|' + v.municipality === activeMuni);
  });
  var head = ['Barangay', 'Municipality', 'Province', 'Sectors / Purok Roles', 'Members Count', 'Women Count', 'Women Pct', 'Marginalized Count', 'Marginalized Pct', 'Compliance Status', 'Validation Issues'];
  var rows = brgys.map(function (b) {
    var bVols = brestVols.filter(function (v) { return v.barangay === b.barangay && v.municipality === b.municipality; });
    var sectors = [];
    bVols.forEach(function (v) {
      var p = v.position ? v.position.trim() : '';
      if (p && sectors.indexOf(p) === -1) sectors.push(p);
    });
    var st = b.volunteers && b.volunteers.BREST ? b.volunteers.BREST.status : 'Not encoded';
    var reasons = (b.volunteers && b.volunteers.BREST && b.volunteers.BREST.reasons) || [];
    var women = bVols.filter(function (v) { return v.sex === 'female'; }).length;
    var marg = bVols.filter(function (v) { return v.sex === 'female' || v.ip || v.pwd; }).length;
    var womenPct = bVols.length ? Math.round(women / bVols.length * 100) + '%' : '0%';
    var margPct = bVols.length ? Math.round(marg / bVols.length * 100) + '%' : '0%';
    return [
      b.barangay,
      b.municipality,
      b.province,
      sectors.length ? sectors.join('; ') : 'No roles tagged',
      bVols.length,
      women,
      womenPct,
      marg,
      margPct,
      st,
      reasons.join('; ')
    ];
  });
  downloadCsv('PCRP_BResT_teams_' + (activeMuni ? activeMuni.replace(/[^A-Za-z0-9]+/g, '_') : 'region') + '_' + stamp() + '.csv', csvOf([head].concat(rows)));
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

function exportCspmcTeamsCsv() {
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (CSPMC_STATE.muni || key || '');
  var brgys = (SNAP.barangayRows || []).filter(function (b) { return !activeMuni || b.province + '|' + b.municipality === activeMuni; });
  var s2Vols = P.volunteers.filter(function (v) {
    if (!v.isStage2) return false;
    return !activeMuni || (v.province + '|' + v.municipality === activeMuni);
  });
  var head = ['Barangay', 'Municipality', 'Province', 'CSPMC Lead', 'CMSC Members', 'CMSC Lead', 'CMSC Quorum Status', 'CMSC BResT Alums', 'Active Sub-Committees', 'Total Members', 'Women Count', 'Women Pct', 'Marginalized Count', 'Marginalized Pct', 'Compliance Status', 'Validation Issues'];
  var rows = brgys.map(function (b) {
    var bv = s2Vols.filter(function (v) { return v.barangay === b.barangay && v.municipality === b.municipality; });
    var ev = evaluateCspmcBarangay(b, bv);
    var cspmcLead = (ev.bodies.CSPMC || []).filter(function (v) { return v.chair; })[0] || ev.vols.filter(function (v) { return v.chair; })[0] || null;
    var cmscLead = (ev.bodies.CMSC || []).filter(function (v) { return v.chair; })[0] || null;
    var activeBodiesStr = ev.activeBodies.map(function (body) { return body.short + ' (' + ev.bodies[body.id].length + ')'; }).join('; ');
    return [
      b.barangay,
      b.municipality,
      b.province,
      cspmcLead ? cspmcLead.name : 'No lead',
      ev.cmscCount,
      cmscLead ? cmscLead.name : 'No lead',
      ev.cmscCount >= 3 ? 'Quorum Met' : 'Lacking (<3)',
      ev.cmscBrestAlum,
      activeBodiesStr || 'None',
      ev.vols.length,
      ev.women,
      ev.womenPct + '%',
      ev.marg,
      ev.margPct + '%',
      ev.status,
      ev.reasons.join('; ')
    ];
  });
  downloadCsv('PCRP_Stage2_CSPMC_teams_' + (activeMuni ? activeMuni.replace(/[^A-Za-z0-9]+/g, '_') : 'region') + '_' + stamp() + '.csv', csvOf([head].concat(rows)));
}

function exportCspmcVolunteersCsv() {
  var P = people(), isMuni = isMunicipalUser(), key = homeKey();
  var activeMuni = isMuni ? key : (CSPMC_STATE.muni || key || '');
  var list = P.volunteers.filter(function (v) {
    if (!v.isStage2) return false;
    return !activeMuni || (v.province + '|' + v.municipality === activeMuni);
  });
  var head = ['Barangay', 'Municipality', 'Province', 'Volunteer Name', 'Sub-Committee Code', 'Sub-Committee Name', 'Position', 'Is Chair', 'Sex', 'IP', 'PWD', 'From BResT Alum', 'Term Start', 'Cross-check Flags'];
  var rows = list.map(function (v) {
    var bodyObj = STAGE2_BODY_MAP[v.stage2Body] || null;
    return [
      v.barangay,
      v.municipality,
      v.province,
      v.name,
      v.stage2Body,
      bodyObj ? bodyObj.name : v.committee,
      v.position,
      v.chair ? 'Yes' : 'No',
      v.sex,
      v.ip ? 'Yes' : 'No',
      v.pwd ? 'Yes' : 'No',
      v.wasBrest ? 'Yes' : 'No',
      v.start,
      (v.flags || []).join('; ')
    ];
  });
  downloadCsv('PCRP_Stage2_CSPMC_volunteers_' + (activeMuni ? activeMuni.replace(/[^A-Za-z0-9]+/g, '_') : 'region') + '_' + stamp() + '.csv', csvOf([head].concat(rows)));
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

// Global click & change delegates for the 6 modules
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-act]');
  if (!t || t.tagName === 'SELECT') return;
  var act = t.getAttribute('data-act'), v = t.getAttribute('data-v');

  // Person modal
  if (act === 'person') { ev.preventDefault(); openPerson(v); }

  // Volunteers
  else if (act === 'vol-triage') {
    if (v === 'all') {
      VOL_STATE.body = 'all'; VOL_STATE.position = 'all'; VOL_STATE.sex = 'all'; VOL_STATE.marg = 'all'; VOL_STATE.flag = 'all'; VOL_STATE.search = '';
    } else if (v === 'women') {
      VOL_STATE.sex = 'female'; VOL_STATE.position = 'all'; VOL_STATE.marg = 'all'; VOL_STATE.flag = 'all';
    } else if (v === 'chair') {
      VOL_STATE.position = 'chair'; VOL_STATE.sex = 'all'; VOL_STATE.marg = 'all'; VOL_STATE.flag = 'all';
    } else if (v === 'marginalized') {
      VOL_STATE.marg = 'ippwd'; VOL_STATE.sex = 'all'; VOL_STATE.position = 'all'; VOL_STATE.flag = 'all';
    } else if (v === 'flagged') {
      VOL_STATE.flag = 'has_flags'; VOL_STATE.sex = 'all'; VOL_STATE.position = 'all'; VOL_STATE.marg = 'all';
    }
    VOL_STATE.limit = 100;
    renderVolunteers();
  }
  else if (act === 'vol-chip') {
    var cType = t.getAttribute('data-type');
    if (cType === 'body') { VOL_STATE.body = v; }
    else if (cType === 'pos') { VOL_STATE.position = (VOL_STATE.position === v ? 'all' : v); }
    else if (cType === 'sex') { VOL_STATE.sex = (VOL_STATE.sex === v ? 'all' : v); }
    else if (cType === 'marg') { VOL_STATE.marg = (VOL_STATE.marg === v ? 'all' : v); }
    else if (cType === 'flag') { VOL_STATE.flag = (VOL_STATE.flag === v ? 'all' : v); }
    VOL_STATE.limit = 100;
    renderVolunteers();
  }
  else if (act === 'vol-body') { VOL_STATE.body = v; VOL_STATE.limit = 100; renderVolunteers(); }
  else if (act === 'vol-pos') { VOL_STATE.position = v; VOL_STATE.limit = 100; renderVolunteers(); }
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
  else if (act === 'brt-triage') {
    BRT_STATE.status = v;
    renderBrest();
  }
  else if (act === 'brt-status') { BRT_STATE.status = v; renderBrest(); }
  else if (act === 'brt-reset') { BRT_STATE.status = 'all'; BRT_STATE.brgy = ''; BRT_STATE.search = ''; renderBrest(); }
  else if (act === 'brt-pick-brgy') {
    BRT_STATE.brgy = (BRT_STATE.brgy === v ? '' : v);
    renderBrest();
  }
  else if (act === 'brt-team-sort') {
    var bCol = t.getAttribute('data-col');
    if (BRT_STATE.teamSortCol === bCol) BRT_STATE.teamSortDir = BRT_STATE.teamSortDir === 'asc' ? 'desc' : 'asc';
    else { BRT_STATE.teamSortCol = bCol; BRT_STATE.teamSortDir = (bCol === 'brgy' || bCol === 'muni') ? 'asc' : 'desc'; }
    renderBrest();
  }
  else if (act === 'open-brest-issues') {
    var bkey = t.getAttribute('data-brgy') || (t.closest('[data-brgy]') && t.closest('[data-brgy]').getAttribute('data-brgy'));
    var b = (SNAP.barangayRows || []).filter(function (x) { return (x.province + '|' + x.municipality + '|' + x.barangay) === bkey; })[0];
    var issues = (b && b.volunteers && b.volunteers.BREST && b.volunteers.BREST.reasons) || [];
    var brgyName = b ? b.barangay : 'Barangay';
    var muniLoc = b ? (b.municipality + ', ' + b.province) : '';
    openLackingModal(bkey, issues, brgyName + ' · BResT Validation Issues', muniLoc + ' · ' + issues.length + ' validation issue' + (issues.length === 1 ? '' : 's'));
  }
  else if (act === 'brt-sort') {
    var bCol = t.getAttribute('data-col');
    if (BRT_STATE.sortCol === bCol) BRT_STATE.sortDir = BRT_STATE.sortDir === 'asc' ? 'desc' : 'asc';
    else { BRT_STATE.sortCol = bCol; BRT_STATE.sortDir = 'asc'; }
    renderBrest();
  }
  else if (act === 'brt-teams-export') exportBrestTeamsCsv();
  else if (act === 'brt-export') exportBrestCsv();

  // CSPMC (Stage 2)
  else if (act === 'cspmc-triage') {
    if (v === 'all') { CSPMC_STATE.status = 'all'; CSPMC_STATE.subFilter = 'all'; CSPMC_STATE.brgy = ''; }
    else if (v === 'encoded' || v === 'needs_fixing' || v === 'not_encoded') { CSPMC_STATE.status = v; CSPMC_STATE.subFilter = 'all'; }
    else if (v === 'cmsc_filter') { CSPMC_STATE.subFilter = 'CMSC'; CSPMC_STATE.status = 'all'; }
    renderCspmc();
  }
  else if (act === 'cspmc-chip') {
    var cType = t.getAttribute('data-type');
    if (cType === 'status') { CSPMC_STATE.status = (CSPMC_STATE.status === v && v !== 'all' ? 'all' : v); }
    else if (cType === 'sub') { CSPMC_STATE.subFilter = (CSPMC_STATE.subFilter === v && v !== 'all' ? 'all' : v); }
    renderCspmc();
  }
  else if (act === 'cspmc-pick-brgy') {
    CSPMC_STATE.brgy = (CSPMC_STATE.brgy === v ? '' : v);
    renderCspmc();
  }
  else if (act === 'cspmc-status') { CSPMC_STATE.status = v; renderCspmc(); }
  else if (act === 'cspmc-sub') { CSPMC_STATE.subFilter = v; renderCspmc(); }
  else if (act === 'cspmc-toggle-org') { CSPMC_STATE.showOrgChart = !CSPMC_STATE.showOrgChart; renderCspmc(); }
  else if (act === 'cspmc-modal-view') {
    CSPMC_STATE.modalView = v || 'org';
    if (CSPMC_STATE.modalBkey) openCspmcDetail(CSPMC_STATE.modalBkey);
  }
  else if (act === 'cspmc-reset') { CSPMC_STATE.status = 'all'; CSPMC_STATE.subFilter = 'all'; CSPMC_STATE.brgy = ''; CSPMC_STATE.search = ''; renderCspmc(); }
  else if (act === 'cspmc-team-sort') {
    var cCol = t.getAttribute('data-col');
    if (CSPMC_STATE.teamSortCol === cCol) CSPMC_STATE.teamSortDir = CSPMC_STATE.teamSortDir === 'asc' ? 'desc' : 'asc';
    else { CSPMC_STATE.teamSortCol = cCol; CSPMC_STATE.teamSortDir = (cCol === 'brgy' || cCol === 'muni') ? 'asc' : 'desc'; }
    renderCspmc();
  }
  else if (act === 'cspmc-vol-sort') {
    var vCol = t.getAttribute('data-col');
    if (CSPMC_STATE.volSortCol === vCol) CSPMC_STATE.volSortDir = CSPMC_STATE.volSortDir === 'asc' ? 'desc' : 'asc';
    else { CSPMC_STATE.volSortCol = vCol; CSPMC_STATE.volSortDir = 'asc'; }
    renderCspmc();
  }
  else if (act === 'cspmc-more') { CSPMC_STATE.limit += 100; renderCspmc(); }
  else if (act === 'open-cspmc-detail') {
    var bkey = t.getAttribute('data-brgy') || (t.closest('[data-brgy]') && t.closest('[data-brgy]').getAttribute('data-brgy'));
    if (bkey) openCspmcDetail(bkey);
  }
  else if (act === 'open-cspmc-issues') {
    var bkey = t.getAttribute('data-brgy') || (t.closest('[data-brgy]') && t.closest('[data-brgy]').getAttribute('data-brgy'));
    var b = (SNAP.barangayRows || []).filter(function (x) { return (x.province + '|' + x.municipality + '|' + x.barangay) === bkey; })[0];
    var P = people();
    var bv = P.volunteers.filter(function (v) { return v.isStage2 && (v.province + '|' + v.municipality + '|' + v.barangay === bkey); });
    var evObj = evaluateCspmcBarangay(b, bv);
    var issues = evObj.reasons;
    var brgyName = b ? b.barangay : 'Barangay';
    var muniLoc = b ? (b.municipality + ', ' + b.province) : '';
    openLackingModal(bkey, issues, brgyName + ' · CSPMC & Sub-Committees Issues', muniLoc + ' · ' + issues.length + ' validation issue' + (issues.length === 1 ? '' : 's'));
  }
  else if (act === 'cspmc-teams-export') exportCspmcTeamsCsv();
  else if (act === 'cspmc-vols-export') exportCspmcVolunteersCsv();

  // MResT
  else if (act === 'mrt-triage') {
    MRT_STATE.clusterFilter = v;
    renderMrest();
  }
  else if (act === 'mrt-chip') {
    MRT_STATE.clusterFilter = (MRT_STATE.clusterFilter === v ? 'all' : v);
    renderMrest();
  }
  else if (act === 'mrt-matrix-filter') { MRT_STATE.matrixFilter = v; renderMrest(); }
  else if (act === 'mrt-pick-muni') { MRT_STATE.muni = v; renderMrest(); }
  else if (act === 'mrt-toggle-org') { MRT_STATE.showOrgChart = !MRT_STATE.showOrgChart; renderMrest(); }
  else if (act === 'mrt-cluster') { MRT_STATE.clusterFilter = v; renderMrest(); }
  else if (act === 'mrt-reset') { MRT_STATE.clusterFilter = 'all'; MRT_STATE.search = ''; renderMrest(); }
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
  if (act === 'vol-muni') { VOL_STATE.muni = t.value; VOL_STATE.brgy = ''; renderVolunteers(); }
  else if (act === 'vol-brgy') { VOL_STATE.brgy = t.value; renderVolunteers(); }
  else if (act === 'brt-brgy') { BRT_STATE.brgy = t.value; renderBrest(); }
  else if (act === 'cspmc-muni') { CSPMC_STATE.muni = t.value; CSPMC_STATE.brgy = ''; renderCspmc(); }
  else if (act === 'cspmc-brgy') { CSPMC_STATE.brgy = t.value; renderCspmc(); }
  else if (act === 'mrt-muni') { MRT_STATE.muni = t.value; renderMrest(); }
});
