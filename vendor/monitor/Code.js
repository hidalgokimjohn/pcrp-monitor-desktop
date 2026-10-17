/**
 * Core.gs — every rule, and nothing else.
 *
 * This file contains NO SpreadsheetApp, DriveApp, HtmlService or any other
 * Google API call. That is deliberate: it is the only file that decides what a
 * number means, so it has to be testable outside Apps Script. The build was
 * verified by running exactly this file under Node against the real 19 August
 * 2026 KCIS exports and comparing every figure to the Excel template it replaces.
 *
 * If you change a rule, change it here, and nowhere else.
 */

// ===================================================================
// CONSTANTS
// ===================================================================

var STATUS = {
  COMPLETE: 'Complete',
  NO_ATTENDEES: 'No Attendees',
  NOT_ENCODED: 'Not Encoded'
};

var FIELD_CONDUCT = ['Not started', 'On-going', 'Completed'];

var K2_TARGET = 0.70;   // SM7 Annex D: households represented, every year

/**
 * Optional Baseline column: each barangay's total households from the community
 * profile. Not available yet, so K2 is measured against the households listed in
 * KCIS; once this column is filled the two are shown side by side for consistency.
 */
var CP_HH_HEADERS = ['Total HH (Community Profile)', 'Total HH', 'Total Households',
                     'Community Profile HH', 'CP Total HH'];

/**
 * RPMO appraisal of each municipality's Municipal Resilience Plan (SM1 para. 38):
 * the MRP is endorsed to the RPMO, the RTWG appraises it, and a compliant plan is
 * cleared before the Second Barangay Assembly. None of this is in the KCIS
 * exports, so the PEO sets it by hand (Import & Setup).
 */
var APPRAISAL_STATUSES = ['Not started', 'Endorsed to RPMO', 'Under appraisal', 'Cleared'];

/** Rows of the appraisal sheet -> [{province, municipality, status, date}]; blanks and unknown statuses are ignored. */
function appraisalList(rows) {
  var out = [];
  (rows || []).forEach(function (r) {
    var muni = r[1] === null || r[1] === undefined ? '' : String(r[1]).trim();
    var st = r[2] === null || r[2] === undefined ? '' : String(r[2]).trim();
    if (!muni || APPRAISAL_STATUSES.indexOf(st) === -1) return;
    out.push({ province: r[0] === null || r[0] === undefined ? '' : String(r[0]).trim(), municipality: muni,
               status: st, date: formatDateVal(r[3]) || '' });
  });
  return out;
}

/** The sheet rows after setting one municipality's status. Throws on a bad status or date. */
function upsertAppraisalRows(rows, province, municipality, status, dateIso) {
  var prov = String(province || '').trim(), muni = String(municipality || '').trim();
  if (!muni) throw new Error('Choose a municipality.');
  if (APPRAISAL_STATUSES.indexOf(status) === -1) throw new Error('Unknown appraisal status: ' + status);
  var date = String(dateIso || '').trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Give the date as YYYY-MM-DD.');
  var key = normAlpha(prov) + '|' + normAlpha(muni);
  var out = [], found = false;
  (rows || []).forEach(function (r) {
    if (!String(r[1] === null || r[1] === undefined ? '' : r[1]).trim()) return;
    if (normAlpha(r[0]) + '|' + normAlpha(r[1]) === key) {
      if (!found) out.push([prov, muni, status, date]);
      found = true;
    } else {
      out.push([r[0], r[1], r[2], r[3]]);
    }
  });
  if (!found) out.push([prov, muni, status, date]);
  return out;
}

/** A household count from a sheet cell: a positive number, or null when blank or unusable. */
function parseHhCount(v) {
  if (v === null || v === undefined || v === '') return null;
  var x = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  return (isFinite(x) && x > 0) ? Math.round(x) : null;
}

/**
 * Official Management Target Deadlines, as first issued. Only used to seed the
 * Target_Deadlines tab on first run (and the legacy Settings tab); after that the
 * tab is the source of truth.
 */
var DEFAULT_TARGET_DEADLINES = {
  PRVA_FIELD: '2026-09-15',      // Management target: all PRVAs conducted on the field by Sept 15
  PRVA_ENCODING: '2026-09-30',   // Management target: 100% encoded in KCIS by Sept 30
  STAGE1_ENCODING: '2026-09-30'  // Stage 1 overall completion deadline
};

// ===================================================================
// MANAGEMENT TARGET DEADLINES (one row per deadline)
// ===================================================================
//
// A deadline belongs to one stage and is either a FIELD CONDUCT deadline (the
// activities are marked Completed by the PEO) or a KCIS ENCODING deadline (every
// expected record has an attendance sheet). It covers the whole stage or a chosen
// set of activities.

var TARGET_HEADERS = ['ID', 'Stage', 'Type', 'Covers', 'Activity Codes', 'Label', 'Date',
                      'Original Date', 'Note', 'Updated By', 'Updated At'];
var TARGET_TYPE_LABEL = { field: 'Field conduct', encoding: 'KCIS encoding' };
var TARGET_SCOPE_LABEL = { stage: 'Whole stage', activities: 'Selected activities' };

/** The three issued deadlines, as rows. PRVA covers the 3.x activities of Stage 1. */
function legacyTargets(settings, activities) {
  var dl = settings || DEFAULT_TARGET_DEADLINES;
  var prva = (activities || []).filter(function (a) {
    return (a.stage || 1) === 1 && String(a.seq).indexOf('3.') === 0;
  }).map(function (a) { return a.code; });
  return [
    { id: 'PRVA_FIELD', stage: 1, type: 'field', scope: 'activities', codes: prva,
      label: 'PRVA field conduct', date: dl.PRVA_FIELD || '', originalDate: dl.PRVA_FIELD || '', note: '' },
    { id: 'PRVA_ENCODING', stage: 1, type: 'encoding', scope: 'activities', codes: prva,
      label: 'PRVA encoding in KCIS', date: dl.PRVA_ENCODING || '', originalDate: dl.PRVA_ENCODING || '', note: '' },
    { id: 'STAGE1_ENCODING', stage: 1, type: 'encoding', scope: 'stage', codes: [],
      label: 'Stage 1 encoding in KCIS', date: dl.STAGE1_ENCODING || '', originalDate: dl.STAGE1_ENCODING || '', note: '' }
  ].filter(function (t) { return t.date; });
}

/** Sheet rows -> deadline objects. Lenient about labels typed by hand in the sheet. */
function targetsFromRows(rows) {
  return (rows || []).filter(function (r) { return r && String(r[0] || '').trim(); }).map(function (r) {
    var type = String(r[2] || '').toLowerCase();
    var scope = String(r[3] || '').toLowerCase();
    return {
      id: String(r[0]).trim(),
      stage: parseInt(r[1], 10) || 1,
      type: type.indexOf('field') !== -1 ? 'field' : 'encoding',
      scope: scope.indexOf('select') !== -1 || scope.indexOf('activit') !== -1 ? 'activities' : 'stage',
      codes: String(r[4] || '').split(/[,;\s]+/).map(function (c) { return c.trim(); }).filter(String),
      label: String(r[5] || '').trim(),
      date: formatDateVal(r[6]) || '',
      originalDate: formatDateVal(r[7]) || formatDateVal(r[6]) || '',
      note: String(r[8] || '').trim(),
      updatedBy: String(r[9] || '').trim(),
      updatedAt: r[10] ? String(formatDateVal(r[10]) || r[10]) : ''
    };
  });
}

function targetsToRows(list) {
  return (list || []).map(function (t) {
    return [t.id, t.stage, TARGET_TYPE_LABEL[t.type] || t.type, TARGET_SCOPE_LABEL[t.scope] || t.scope,
            t.scope === 'activities' ? (t.codes || []).join(', ') : '', t.label, t.date,
            t.originalDate || t.date, t.note || '', t.updatedBy || '', t.updatedAt || ''];
  });
}

/** Activity codes a deadline covers. */
function targetCodes(t, activities) {
  if (t.scope === 'activities') return (t.codes || []).slice();
  return (activities || []).filter(function (a) { return (a.stage || 1) === t.stage; })
                           .map(function (a) { return a.code; });
}

/**
 * Problems that block a save, as plain sentences. The same rules run in the
 * browser before saving (JS_Admin), so the editor sees them without a round trip.
 */
function validateTargets(list, activities) {
  var errors = [], ids = {};
  var actByCode = {};
  (activities || []).forEach(function (a) { actByCode[a.code] = a; });
  (list || []).forEach(function (t, i) {
    var name = '"' + (t.label || 'Deadline ' + (i + 1)) + '"';
    if (!t.id || !/^[A-Z0-9_]+$/.test(t.id)) errors.push(name + ' has an invalid ID.');
    else if (ids[t.id]) errors.push(name + ' repeats the ID ' + t.id + '.');
    ids[t.id] = true;
    if (!(t.stage >= 1 && t.stage <= 4)) errors.push(name + ' has no valid stage.');
    if (t.type !== 'field' && t.type !== 'encoding') errors.push(name + ' must be a field conduct or KCIS encoding deadline.');
    if (!t.label) errors.push('Deadline ' + (i + 1) + ' (Stage ' + t.stage + ') needs a name.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) errors.push(name + ' needs a date.');
    if (t.scope === 'activities') {
      if (!t.codes || !t.codes.length) errors.push(name + ' covers selected activities but none are ticked.');
      (t.codes || []).forEach(function (c) {
        var a = actByCode[c];
        if (!a) errors.push(name + ' covers an unknown activity (' + c + ').');
        else if ((a.stage || 1) !== t.stage) errors.push(name + ' is a Stage ' + t.stage + ' deadline but covers ' + a.label + ' (Stage ' + (a.stage || 1) + ').');
      });
    }
  });
  // An encoding deadline cannot fall before the field deadline for the same work:
  // records cannot be encoded before the activity is conducted.
  (list || []).forEach(function (enc) {
    if (enc.type !== 'encoding' || !enc.date) return;
    var encCodes = targetCodes(enc, activities);
    (list || []).forEach(function (fld) {
      if (fld.type !== 'field' || fld.stage !== enc.stage || !fld.date) return;
      var overlap = targetCodes(fld, activities).some(function (c) { return encCodes.indexOf(c) !== -1; });
      if (overlap && enc.date < fld.date) {
        errors.push('"' + enc.label + '" (' + enc.date + ') is earlier than "' + fld.label + '" (' + fld.date +
                    '), the field conduct deadline for the same activities.');
      }
    });
  });
  return errors;
}

/** Column order of the two KCIS exports. Import fails loudly if these move. */
var PARTICIPANT_HEADERS = [
  'Region Name', 'Province Name', 'City Name', 'Barangay Name', 'Sequence No',
  'Name', 'Activity Title', 'Is Copy Plan', 'First Name', 'Middle Name',
  'Last Name', 'Sex Description'
];
var HOUSEHOLD_HEADERS = [
  'Region Name', 'Province Name', 'City Name', 'Barangay Name', 'Name',
  'Activity Title', 'Is Copy Plan', 'First Name', 'Middle Name', 'Last Name',
  'Sex Description', 'Birthdate', 'Is Hh Head', 'Is Present',
  'Total 4Ps Families Present', 'Total Ip Families Present',
  'Total Non Ip 4Ps Slp Families Present', 'Total Slp Families Present'
];

/** Zero-based positions for backward compatibility. */
var P_DEFAULT = {
  province: 1, muni: 2, brgy: 3, seq: 4, name: 5, title: 6, first: 8, middle: 9, last: 10, sex: 11, activityId: 22
};
var H_DEFAULT = {
  province: 1, muni: 2, brgy: 3, name: 4, title: 5, first: 7, middle: 8, last: 9, sex: 10, present: 13, activityId: 22
};

var P = P_DEFAULT;
var H = H_DEFAULT;

function buildColumnIndex(headerRow, fallback) {
  var fb = fallback || P_DEFAULT;
  if (!headerRow || !headerRow.length) return fb;
  var map = {};
  headerRow.forEach(function (h, idx) {
    if (h !== null && h !== undefined) {
      map[normKey(h)] = idx;
    }
  });
  return {
    province: map[normKey('Province Name')] !== undefined ? map[normKey('Province Name')] : (map[normKey('Province')] !== undefined ? map[normKey('Province')] : fb.province),
    muni: map[normKey('City Name')] !== undefined ? map[normKey('City Name')] : (map[normKey('Municipality')] !== undefined ? map[normKey('Municipality')] : fb.muni),
    brgy: map[normKey('Barangay Name')] !== undefined ? map[normKey('Barangay Name')] : (map[normKey('Barangay')] !== undefined ? map[normKey('Barangay')] : fb.brgy),
    seq: map[normKey('Sequence No')] !== undefined ? map[normKey('Sequence No')] : fb.seq,
    name: map[normKey('Name')] !== undefined ? map[normKey('Name')] : fb.name,
    title: map[normKey('Activity Title')] !== undefined ? map[normKey('Activity Title')] : (map[normKey('Activity')] !== undefined ? map[normKey('Activity')] : (fb.title !== undefined ? fb.title : 6)),
    first: map[normKey('First Name')] !== undefined ? map[normKey('First Name')] : fb.first,
    middle: map[normKey('Middle Name')] !== undefined ? map[normKey('Middle Name')] : fb.middle,
    last: map[normKey('Last Name')] !== undefined ? map[normKey('Last Name')] : fb.last,
    sex: map[normKey('Sex Description')] !== undefined ? map[normKey('Sex Description')] : fb.sex,
    present: map[normKey('Is Present')] !== undefined ? map[normKey('Is Present')] : fb.present,
    birthdate: map[normKey('Birthdate')],
    isHead: map[normKey('Is Hh Head')],
    // Extended fields:
    psgcRegion: map[normKey('lib_region.code_correspondence')],
    psgcProvince: map[normKey('lib_province.code_correspondence')],
    psgcCity: map[normKey('lib_city.code_correspondence')],
    psgcBrgy: map[normKey('lib_brgy.code_correspondence')],
    dateStart: map[normKey('Date Start')],
    dateEnd: map[normKey('Date End')],
    activityId: (function () {
      for (var k in map) {
        var ka = normAlpha(k);
        if (ka === 'cripmc09activityid' || ka === 'cripmc9activityid' || ka === 'cripactivityid' || ka === 'activityid') {
          return map[k];
        }
      }
      if (map[normKey('Crip Mc09 Activity Id')] !== undefined) return map[normKey('Crip Mc09 Activity Id')];
      if (map[normKey('CRIP MC 09 Activity Id')] !== undefined) return map[normKey('CRIP MC 09 Activity Id')];
      if (map[normKey('Activity Id')] !== undefined) return map[normKey('Activity Id')];
      if (map[normKey('Activity ID')] !== undefined) return map[normKey('Activity ID')];
      if (fb.activityId !== undefined) return fb.activityId;
      return (headerRow && headerRow.length > 22) ? 22 : undefined;
    })()
  };
}

/**
 * The Stage 1 activity model. KCIS emits BOTH a Sequence No and a controlled
 * Name; the sequence is structural while the label is typed when the activity is
 * set up, so sequence is the primary key and name is the fallback.
 *
 * Never classify on 'Activity Title' — the 19 Aug 2026 export held 29 spellings
 * of the same assembly there against 4 clean values in 'Name'.
 */
var DEFAULT_ACTIVITIES = [
  // --- STAGE 1: ASSESSMENT & PLANNING ---
  { seq: '1',   code: 'MREST',   name: 'Organizational Meeting of the MRest',
    label: 'MResT Organizational Meeting', level: 'Municipal', households: false,
    field: 'On-going', stage: 1, prioOnly: false },
  { seq: '2',   code: 'BA1',     name: '1st BA',
    label: '1st Barangay Assembly (1st BA)', level: 'Barangay', households: true,
    field: 'On-going', stage: 1, prioOnly: false },
  { seq: '3.1', code: 'PROFILE', name: 'PRVA - Community Profiling',
    label: 'PRVA – Community Profiling', level: 'Barangay', households: false,
    field: 'On-going', stage: 1, prioOnly: false },
  { seq: '3.2', code: 'WALK',    name: 'PRVA - Community Walk-through',
    label: 'PRVA – Community Walk-through', level: 'Barangay', households: false,
    field: 'On-going', stage: 1, prioOnly: false },
  { seq: '3.3', code: 'MAP',     name: 'PRVA - Community Mapping',
    label: 'PRVA – Community Mapping', level: 'Barangay', households: false,
    field: 'On-going', stage: 1, prioOnly: false },
  { seq: '3.4', code: 'FGD',     name: 'PRVA - Focus Group Discussion (FGD)',
    label: 'PRVA – Sectoral FGDs', level: 'Barangay', households: false,
    field: 'On-going', stage: 1, prioOnly: false },
  { seq: '3.5', code: 'BPRVA',
    name: 'Barangay Participatory Risk and Vulnerabilities Assessment',
    label: 'Barangay BRVA Workshop', level: 'Barangay', households: false,
    field: 'On-going', stage: 1, prioOnly: false },
  { seq: '4',   code: 'MRP',
    name: 'Municipal Resilience Planning and Prioritization of Programs, ' +
          'Projects, and Activities',
    label: 'Municipal PRVA & Resilience Planning', level: 'Municipal',
    households: false, field: 'On-going', stage: 1, prioOnly: false },
  { seq: '5',   code: 'BDC',
    name: 'Barangay Development Council Meeting: Feedbacking of MRP Result, Resource Accessing and Selection of CSPMC, PPSC and O&MSC (year 2 & 3 Prioritized Barangays)',
    label: 'BDC Meeting (Feedbacking & Selection)', level: 'Barangay',
    households: false, field: 'On-going', stage: 1, prioOnly: true },

  // --- STAGE 2: SUB-PROJECT DEVELOPMENT ---
  { seq: '6',   code: 'BA2',
    name: '2nd BA: Selection of CSPMC, Planning for SP Implementation and Concept Note Development (For Prio Barangays)',
    label: '2nd Barangay Assembly (2nd BA)', level: 'Barangay',
    households: true, field: 'On-going', stage: 2, prioOnly: true },
  { seq: '7',   code: 'TR_CSPMC',
    name: 'Training for Community Sub-Project Management Committee (CSPMC)',
    label: 'Training for CSPMC', level: 'Municipal',
    households: false, field: 'On-going', stage: 2, prioOnly: false },
  { seq: '8',   code: 'SPDW',
    name: 'Sub-Project Development Workshop',
    label: 'Sub-Project Development Workshop', level: 'Municipal',
    households: false, field: 'On-going', stage: 2, prioOnly: false },
  { seq: '9',   code: 'BA3',
    name: '3rd BA: Presentation and Approval of Community Resilience Sub-Project Proposal',
    label: '3rd Barangay Assembly (3rd BA)', level: 'Barangay',
    households: true, field: 'On-going', stage: 2, prioOnly: true },
  { seq: '10',  code: 'TDR',
    name: 'MRest Technical Desk Review',
    label: 'MResT Technical Desk Review', level: 'Municipal',
    households: false, field: 'On-going', stage: 2, prioOnly: false },
  { seq: '11',  code: 'FOMG',
    name: 'Formation of Operation and Maintenance Groups',
    label: 'Formation of O&M Groups', level: 'Barangay',
    households: false, field: 'On-going', stage: 2, prioOnly: true }
];

// ===================================================================
// NORMALISATION
// ===================================================================

/**
 * The join key for every name comparison.
 *
 * The 19 Aug 2026 export carried trailing spaces on four barangay names —
 * "Balete ", "Zone II ", "Zone III Maharlika ", "La Casa " — which a plain
 * comparison treats as different barangays. With this normalisation the export
 * matched the PSA master on 100% of rows; without it, four barangays vanish
 * silently and their municipality under-reports.
 */
var NORM_KEY_CACHE = {};
function normKey(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    if (NORM_KEY_CACHE[v] !== undefined) return NORM_KEY_CACHE[v];
  }
  var res = String(v)
    .replace(/\u00a0/g, ' ')          // non-breaking space
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '')  // control characters
    .replace(/\s+/g, ' ')             // collapse runs of whitespace
    .trim()
    .toLowerCase()
    .replace(/ñ/g, 'n')               // normalize ñ to n for key lookup
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip diacritics
  if (typeof v === 'string' && v.length < 120) {
    NORM_KEY_CACHE[v] = res;
  }
  return res;
}

/** Normalized alphanumeric key with all whitespace, dashes, and punctuation stripped. */
var NORM_ALPHA_CACHE = {};
function normAlpha(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && NORM_ALPHA_CACHE[v] !== undefined) return NORM_ALPHA_CACHE[v];
  var res = normKey(v).replace(/[^a-z0-9]/g, '');
  if (typeof v === 'string' && v.length < 120) NORM_ALPHA_CACHE[v] = res;
  return res;
}

/** Same normalisation, but preserving case for display. */
function normText(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/ /g, ' ')
    .replace(/[ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 'Is Present' arrives as a real boolean from some tools, the string "TRUE" from
 * others, and "1" from others again. Accept all of them.
 */
function isTrue(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  var s = normKey(v);
  return s === 'true' || s === '1' || s === 'yes';
}

function hasValue(v) {
  return !(v === null || v === undefined || String(v).trim() === '');
}

/**
 * Test whether an Activity ID in KCIS export represents a non-CRIP activity (ID = 0).
 * KCIS exports dump other modalities where Crip Mc09 Activity Id is 0.
 * Such rows are not part of CRIP and must be excluded from classification and Data Health unmapped tracking.
 */
function isZeroActivityId(v) {
  if (!hasValue(v) || typeof v === 'boolean') return false;
  var s = String(v).trim();
  if (s === '0' || s === '0.0') return true;
  var num = Number(s);
  return !isNaN(num) && num === 0;
}

// ===================================================================
// CLASSIFICATION
// ===================================================================

/**
 * Known KCIS aliases and naming variations for each Stage 1 activity code.
 * Ensures robust matching whether KCIS exports "Community Profiling",
 * "Community Profile" (output name), or standard sequence numbers.
 */
var ACTIVITY_ALIASES = {
  'MREST': [
    'organizational meeting of the mrest',
    'mrest organizational meeting',
    'mrest meeting',
    'municipal orientation',
    'organizational meeting of the municipal resilience team'
  ],
  'BA1': [
    '1st ba',
    '1st barangay assembly',
    'first barangay assembly',
    '1st barangay assembly (1st ba)',
    '1st barangay assembly (ba1)',
    'ba1'
  ],
  'PROFILE': [
    'prva - community profiling',
    'prva - community profile',
    'prva – community profiling',
    'prva – community profile',
    'prva community profiling',
    'prva community profile',
    'community profiling',
    'community profile',
    'barangay community profiling',
    'barangay community profile',
    'profiling',
    'profile'
  ],
  'WALK': [
    'prva - community walk-through',
    'prva - community walkthrough',
    'prva – community walk-through',
    'prva – community walkthrough',
    'prva community walk-through',
    'prva community walkthrough',
    'community walk-through',
    'community walkthrough',
    'walk-through',
    'walkthrough'
  ],
  'MAP': [
    'prva - community mapping',
    'prva – community mapping',
    'prva community mapping',
    'community mapping',
    'mapping',
    'brvm',
    'barangay risk and vulnerability mapping'
  ],
  'FGD': [
    'prva - focus group discussion (fgd)',
    'prva - focus group discussion',
    'prva - focus group discussions',
    'prva – focus group discussion (fgd)',
    'prva – focus group discussion',
    'prva – focus group discussions',
    'focus group discussion (fgd)',
    'focus group discussion',
    'focus group discussions',
    'sectoral fgd',
    'sectoral fgds',
    'fgd'
  ],
  'BPRVA': [
    'barangay participatory risk and vulnerabilities assessment',
    'barangay participatory risk and vulnerability assessment',
    'prva assessment',
    'prva synthesis',
    'bprva',
    'brva workshop',
    'barangay brva workshop'
  ],
  'MRP': [
    'municipal resilience planning and prioritization of programs, projects, and activities',
    'municipal resilience planning and prioritization of programs projects and activities',
    'municipal resilience planning',
    'mrp workshop',
    'mrp'
  ],
  'BDC': [
    'barangay development council meeting: feedbacking of mrp result, resource accessing and selection of cspmc, ppsc and o&msc (year 2 & 3 prioritized barangays)',
    'barangay development council meeting: feedbacking of mrp result',
    'barangay development council meeting',
    'bdc meeting',
    'feedbacking of mrp result',
    'selection of cspmc',
    'bdc'
  ],
  'BA2': [
    '2nd ba: selection of cspmc, planning for sp implementation and concept note development (for prio barangays)',
    '2nd ba: selection of cspmc',
    '2nd ba',
    '2nd barangay assembly',
    'second barangay assembly',
    'second ba',
    'ba2'
  ],
  'TR_CSPMC': [
    'training for community sub-project management committee (cspmc)',
    'training for community sub-project management committee',
    'training for cspmc',
    'cspmc training',
    'tr_cspmc',
    'tr-cspmc'
  ],
  'SPDW': [
    'sub-project development workshop',
    'sub project development workshop',
    'sub-project development',
    'sp development workshop',
    'spdw'
  ],
  'BA3': [
    '3rd ba: presentation and approval of community resilience sub-project proposal',
    '3rd ba: presentation and approval',
    '3rd ba',
    '3rd barangay assembly',
    'third barangay assembly',
    'third ba',
    'ba3'
  ],
  'TDR': [
    'mrest technical desk review',
    'technical desk review',
    'mrest desk review',
    'tdr'
  ],
  'FOMG': [
    'formation of operation and maintenance groups',
    'formation of operation and maintenance group',
    'formation of o&m groups',
    'formation of om groups',
    'o&m groups',
    'operation and maintenance groups',
    'fomg'
  ]
};

/**
 * Build the lookup used to turn a row into an activity code.
 * Sequence first, name/alias second, keyword fallback third.
 */
function buildActivityIndex(activities) {
  var bySeq = {}, byName = {}, byCode = {};
  activities.forEach(function (a) {
    if (a.seq !== '' && a.seq !== null && a.seq !== undefined) {
      bySeq[normKey(a.seq)] = a.code;
      var sClean = normKey(a.seq).replace(/\.+$/, '');
      if (sClean) bySeq[sClean] = a.code;
    }
    if (a.name) {
      byName[normKey(a.name)] = a.code;
      byName[normAlpha(a.name)] = a.code;
    }
    if (a.label) {
      byName[normKey(a.label)] = a.code;
      byName[normAlpha(a.label)] = a.code;
    }
    // Pre-populate all known aliases
    var aliases = ACTIVITY_ALIASES[a.code] || [];
    aliases.forEach(function (al) {
      byName[normKey(al)] = a.code;
      byName[normAlpha(al)] = a.code;
    });
    byCode[a.code] = a;
  });
  return { bySeq: bySeq, byName: byName, byCode: byCode, list: activities };
}

/**
 * Returns the activity code for a row, or '' when neither key matches.
 * Checks sequence first, then KCIS Name, then Activity Title, then keyword heuristics.
 */
function classify(index, seqVal, nameVal, titleVal) {
  var cacheKey = (seqVal || '') + '\u2502' + (nameVal || '') + '\u2502' + (titleVal || '');
  if (index && index._classifyCache && index._classifyCache[cacheKey] !== undefined) {
    return index._classifyCache[cacheKey];
  }

  function _calcClassify() {
    // 1. Primary check: KCIS Name (Column F) matched against Activities tab (Column C)
    var n = normKey(nameVal);
    if (n) {
      if (index.byName[n]) return index.byName[n];
      var na = normAlpha(nameVal);
      if (na && index.byName[na]) return index.byName[na];
    }

    // 2. Secondary check: Sequence Number (Column E, e.g. '1', '2', '3.1', '3.2')
    var s = normKey(seqVal);
    if (s) {
      var sClean = s.replace(/\.+$/, '');
      if (index.bySeq[sClean]) return index.bySeq[sClean];
      if (index.bySeq[s]) return index.bySeq[s];
    }

    // 3. Fallback to Activity Title
    var t = normKey(titleVal);
    if (t) {
      if (index.byName[t]) return index.byName[t];
      var ta = normAlpha(titleVal);
      if (ta && index.byName[ta]) return index.byName[ta];
    }

    // 4. Keyword / substring matching across Name and Title
    var candidates = [n, t].filter(Boolean);
    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      // Seq 3.1: Community Profiling / Community Profile
      if (cand.indexOf('profil') !== -1 || cand.indexOf('community profile') !== -1) return 'PROFILE';
      // Seq 3.2: Community Walk-through
      if (cand.indexOf('walk') !== -1) return 'WALK';
      // Seq 3.3: Community Mapping
      if (cand.indexOf('mapping') !== -1 || cand.indexOf('brvm') !== -1) return 'MAP';
      // Seq 3.4: FGD
      if (cand.indexOf('fgd') !== -1 || cand.indexOf('focus group') !== -1) return 'FGD';
      // Seq 3.5: BRVA / BPRVA
      if (cand.indexOf('bprva') !== -1 || cand.indexOf('brva') !== -1 || cand.indexOf('vulnerabilit') !== -1) return 'BPRVA';
      // Seq 5: BDC Meeting
      if (cand.indexOf('bdc') !== -1 || cand.indexOf('feedbacking') !== -1 || (cand.indexOf('selection of') !== -1 && cand.indexOf('cspmc') !== -1)) return 'BDC';
      // Seq 6: 2nd BA (Check before BA1 / generic barangay assembly!)
      if (cand.indexOf('2nd ba') !== -1 || cand.indexOf('second ba') !== -1 || cand.indexOf('second barangay assembly') !== -1 || cand.indexOf('2nd barangay assembly') !== -1) return 'BA2';
      // Seq 9: 3rd BA (Check before BA1 / generic barangay assembly!)
      if (cand.indexOf('3rd ba') !== -1 || cand.indexOf('third ba') !== -1 || cand.indexOf('third barangay assembly') !== -1 || cand.indexOf('3rd barangay assembly') !== -1) return 'BA3';
      // Seq 7: Training for CSPMC
      if (cand.indexOf('training') !== -1 && cand.indexOf('cspmc') !== -1) return 'TR_CSPMC';
      // Seq 8: Sub-Project Development Workshop
      if (cand.indexOf('sub-project development') !== -1 || cand.indexOf('sub project development') !== -1 || cand.indexOf('spdw') !== -1) return 'SPDW';
      // Seq 10: Technical Desk Review
      if (cand.indexOf('desk review') !== -1 || cand.indexOf('tdr') !== -1) return 'TDR';
      // Seq 11: Formation of O&M Groups
      if (cand.indexOf('operation and maintenance') !== -1 || cand.indexOf('o&m') !== -1 || cand.indexOf('fomg') !== -1) return 'FOMG';
      // Seq 1: MResT
      if (cand.indexOf('mrest') !== -1) return 'MREST';
      // Seq 2: 1st BA
      if (cand.indexOf('1st ba') !== -1 || cand.indexOf('first ba') !== -1 || cand.indexOf('first barangay assembly') !== -1 || cand.indexOf('barangay assembly') !== -1) return 'BA1';
      // Seq 4: MRP
      if (cand.indexOf('resilience plan') !== -1 || cand.indexOf('mrp') !== -1) return 'MRP';
    }

    return '';
  }

  var res = _calcClassify();
  if (index) {
    if (!index._classifyCache) index._classifyCache = {};
    index._classifyCache[cacheKey] = res;
  }
  return res;
}

/**
 * Stage 1 is a strict sequence: each activity is conducted and encoded in order.
 * Returns the codes of activities that are NOT encoded although a LATER one in
 * the sequence is. That cannot have happened in that order, so the earlier
 * record is missing from KCIS (conducted but never encoded).
 *
 *   orderedActs: the activity definitions that apply (any order; sorted by seq here)
 *   activityMap: code -> { status }
 */
function sequenceGaps(orderedActs, activityMap) {
  var acts = orderedActs.slice().sort(function (a, b) {
    var x = parseFloat(a.seq), y = parseFloat(b.seq);
    return (isNaN(x) || isNaN(y)) ? 0 : x - y;
  });
  function encoded(a) {
    var x = activityMap[a.code];
    return !!x && x.status !== STATUS.NOT_ENCODED;
  }
  var last = -1;
  acts.forEach(function (a, i) { if (encoded(a)) last = i; });
  var gaps = [];
  acts.forEach(function (a, i) { if (i < last && !encoded(a)) gaps.push(a.code); });
  return gaps;
}

// ===================================================================
// THE BASELINE
// ===================================================================

/**
 * baselineRows: [{province, municipality, barangay, batch, focalArea, psgcBrgy, psgcCity, psgcProvince, psgcRegion}]
 * monitored:    [municipality] or [{province, municipality}] — only these are reported on
 */
function buildBaseline(baselineRows, monitored) {
  var onKey = {};
  monitored.forEach(function (m) {
    if (typeof m === 'object' && m !== null) {
      onKey[normKey(m.province) + '|' + normKey(m.municipality)] = true;
      onKey[normAlpha(m.province) + '|' + normAlpha(m.municipality)] = true;
      onKey[normKey(m.municipality)] = true;
      onKey[normAlpha(m.municipality)] = true;
    } else {
      var s = String(m);
      onKey[normKey(s)] = true;
      onKey[normAlpha(s)] = true;
      if (s.indexOf('|') !== -1) {
        var parts = s.split('|');
        onKey[normKey(parts[0]) + '|' + normKey(parts[1])] = true;
        onKey[normAlpha(parts[0]) + '|' + normAlpha(parts[1])] = true;
      }
    }
  });

  var barangays = [];        // monitored only
  var byMuni = {};           // "prov|muni" -> {province, batch, focalArea, municipality, barangays:[], psgcCity, psgcProvince}
  var brgyKeySet = {};       // "prov|muni|brgy" -> true
  var psgcKeySet = {};       // psgcCode -> true
  var psgcToBrgy = {};       // psgcCode -> r
  var muniKeySet = {};       // "prov|muni" -> true
  var psgcCityKeySet = {};   // psgcCityCode -> true
  var psgcCityToMuni = {};   // psgcCityCode -> { province: r.province, municipality: r.municipality }
  var brgyRowByKey = {};     // "prov|muni|brgy" (normKey) -> baseline row, for display names
  var brgyNoProv = {};       // "|muni|brgy" -> baseline row, or null when ambiguous
  var muniNoProv = {};       // "|muni" -> { province, municipality }, or null when ambiguous
  var seenMuniCompound = {};
  var allBrgyCount = 0;

  baselineRows.forEach(function (r) {
    allBrgyCount++;
    var pk = normKey(r.province);
    var mk = normKey(r.municipality);
    var mCompound = pk + '|' + mk;
    var mAlpha = normAlpha(r.province) + '|' + normAlpha(r.municipality);

    // Check if monitored by compound key, city psgc, or plain municipality name
    var isMonitored = onKey[mCompound] || onKey[mAlpha] || onKey[mk] || onKey[normAlpha(r.municipality)] || (r.psgcCity && onKey[normKey(r.psgcCity)]);
    if (!isMonitored) return;

    if (!byMuni[mCompound]) {
      byMuni[mCompound] = {
        province: r.province, batch: r.batch, focalArea: r.focalArea || '',
        municipality: r.municipality,
        psgcCity: r.psgcCity || '',
        psgcProvince: r.psgcProvince || '',
        barangays: [],
        prioBarangays: []
      };
    }
    var isStage2Prio = r.stage2Prio !== undefined ? isTrue(r.stage2Prio) : true;
    r.stage2Prio = isStage2Prio;
    byMuni[mCompound].barangays.push(r.barangay);
    if (isStage2Prio) byMuni[mCompound].prioBarangays.push(r.barangay);
    barangays.push(r);

    brgyKeySet[pk + '|' + mk + '|' + normKey(r.barangay)] = true;
    brgyRowByKey[pk + '|' + mk + '|' + normKey(r.barangay)] = r;
    brgyKeySet[normAlpha(r.province) + '|' + normAlpha(r.municipality) + '|' + normAlpha(r.barangay)] = true;
    // Fallback when the export's province is blank or spelled differently. It
    // points at the baseline row so the record is filed under the baseline's
    // names; null when the same municipality + barangay exists in two provinces.
    var nk = '|' + mk + '|' + normKey(r.barangay);
    var prevB = brgyNoProv[nk];
    brgyNoProv[nk] = !brgyNoProv.hasOwnProperty(nk) ? r
      : (prevB && normKey(prevB.province) === pk ? prevB : null);

    if (r.psgcBrgy) {
      var pbk = normKey(r.psgcBrgy);
      psgcKeySet[pbk] = true;
      psgcToBrgy[pbk] = r;
    }
    if (r.psgcCity) {
      var pck = normKey(r.psgcCity);
      psgcCityKeySet[pck] = true;
      psgcCityToMuni[pck] = { province: r.province, municipality: r.municipality };
    }
    muniKeySet[mCompound] = true;
    muniKeySet[mAlpha] = true;
    if (!seenMuniCompound[mCompound]) {
      seenMuniCompound[mCompound] = true;
      muniNoProv['|' + mk] = muniNoProv.hasOwnProperty('|' + mk) ? null
        : { province: r.province, municipality: r.municipality };
    }
  });

  var muniKeys = Object.keys(byMuni);
  var muniList = muniKeys.map(function (k) { return byMuni[k]; });
  var totalPrio = barangays.filter(function (b) { return b.stage2Prio; }).length;

  return {
    rows: barangays,
    byMuni: byMuni,
    muniList: muniList,
    brgyKeySet: brgyKeySet,
    brgyRowByKey: brgyRowByKey,
    brgyNoProv: brgyNoProv,
    muniNoProv: muniNoProv,
    psgcKeySet: psgcKeySet,
    psgcToBrgy: psgcToBrgy,
    muniKeySet: muniKeySet,
    psgcCityKeySet: psgcCityKeySet,
    psgcCityToMuni: psgcCityToMuni,
    totalBarangays: barangays.length,
    totalPrioBarangays: totalPrio,
    totalMunicipalities: muniList.length,
    barangaysNotMonitored: allBrgyCount - barangays.length
  };
}

// ===================================================================
// THE COMPUTATION
// ===================================================================

function formatDateVal(v) {
  if (!v && v !== 0) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return null;
    try {
      return Utilities.formatDate(v, 'Asia/Manila', 'yyyy-MM-dd');
    } catch (e) {
      return v.toISOString().slice(0, 10);
    }
  }

  // Handle numeric serial dates (e.g. from Excel / Google Sheets API UNFORMATTED_VALUE)
  if (typeof v === 'number' || (typeof v === 'string' && /^\d{4,6}(\.\d+)?$/.test(String(v).trim()))) {
    var num = Number(v);
    if (!isNaN(num) && num >= 20000 && num <= 80000) {
      // Excel 1899-12-30 UTC epoch
      var excelEpoch = -2209161600000; // Date.UTC(1899, 11, 30)
      var dSerial = new Date(excelEpoch + Math.round(num) * 86400000);
      try {
        return Utilities.formatDate(dSerial, 'Asia/Manila', 'yyyy-MM-dd');
      } catch (e) {
        return dSerial.toISOString().slice(0, 10);
      }
    }
  }

  var s = String(v).trim();
  if (!s) return null;

  // Handle legacy 5-digit year if previously formatted as e.g. "46267-01-01"
  var bogusYear = /^(\d{5})(-\d{2}-\d{2})?/.exec(s);
  if (bogusYear) {
    var numYr = Number(bogusYear[1]);
    if (numYr >= 20000 && numYr <= 80000) {
      var dSerial2 = new Date(-2209161600000 + Math.round(numYr) * 86400000);
      try {
        return Utilities.formatDate(dSerial2, 'Asia/Manila', 'yyyy-MM-dd');
      } catch (e) {
        return dSerial2.toISOString().slice(0, 10);
      }
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  
  // Format: M/D/YYYY or MM/DD/YYYY or DD/MM/YYYY
  var mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mdy) {
    var p1 = parseInt(mdy[1], 10);
    var p2 = parseInt(mdy[2], 10);
    var yr = mdy[3];
    if (p1 > 12) {
      var mm = ('0' + p2).slice(-2);
      var dd = ('0' + p1).slice(-2);
      return yr + '-' + mm + '-' + dd;
    } else {
      var mm = ('0' + p1).slice(-2);
      var dd = ('0' + p2).slice(-2);
      return yr + '-' + mm + '-' + dd;
    }
  }

  // Format: YYYY/MM/DD
  var ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    var mm = ('0' + ymd[2]).slice(-2);
    var dd = ('0' + ymd[3]).slice(-2);
    return ymd[1] + '-' + mm + '-' + dd;
  }

  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    var fullYear = d.getFullYear();
    if (fullYear >= 1970 && fullYear <= 2099) {
      try {
        return Utilities.formatDate(d, 'Asia/Manila', 'yyyy-MM-dd');
      } catch (e) {
        return d.toISOString().slice(0, 10);
      }
    }
  }
  return s.length >= 10 ? s.slice(0, 10) : null;
}

// ===================================================================
// COMMUNITY VOLUNTEERS — 1st BA: BResT and SFMSC
// ===================================================================
//
// Source: the KCIS "Community Volunteer List" export, one row per volunteer.
// The 1st BA selects two bodies (SM1 paras. 19–22):
//   BResT  the Community Volunteers for the PRVA. Encoded once it has a named
//          member; no size or Chairperson rule.
//   SFMSC  exactly one Chairperson and at least two Members (RPMO rule).
// Volunteers tagged to another activity's body are not counted here: MResT and
// the municipal SFMC belong to Seq 1 (SM1 para. 14), the CSPMC and its
// sub-committees to the 2nd BA. A volunteer counts whatever the term End Date.
// "Not encoded" means not in KCIS, never "not organized".

var CV_BODIES = [
  { code: 'BREST', short: 'BResT', label: 'Barangay Resilience Team (BResT)', rules: false },
  { code: 'SFMSC', short: 'SFMSC', label: 'Stakeholder and Feedback Mechanism Sub-Committee (SFMSC)', rules: true }
];
var CV_HISTORY_PREFIX = 'CV_';
var CV_SFMSC_MIN_MEMBERS = 2;
var CV_MARGINAL_TARGET = 0.3;          // SM1 para. 22: at least 30% from marginalized groups
var CV_TERM_YEARS = [2025, 2027];      // a term start outside these years is a typo
var CV_KIND_HOME = {
  SEQ1: 'Seq 1 · MResT Organizational Meeting',
  BA2: 'Seq 6 · 2nd Barangay Assembly',
  UNKNOWN: 'not a recognised committee'
};

/** Columns the volunteer import needs, after the three "Name" columns are renamed. */
var VOLUNTEER_HEADERS = [
  'Province Name', 'City Name', 'Barangay Name', 'Activity', 'Committee', 'Position',
  'First Name', 'Middle Name', 'Last Name', 'Sex Description'
];

/**
 * KCIS heads three columns "Name": the activity, the committee and the
 * position, in that order (their positions move between exports). Renamed so
 * each is found by header; an already-renamed sheet passes through unchanged.
 */
function volunteerHeaders(headers) {
  var names = ['Activity', 'Committee', 'Position'], seen = 0;
  return (headers || []).map(function (h) {
    if (normKey(h) === 'name' && seen < names.length) return names[seen++];
    return h;
  });
}

/** 'BREST' | 'SFMSC' | 'SEQ1' | 'BA2' | 'NONE' | 'UNKNOWN' */
function cvCommitteeKind(v) {
  var a = normAlpha(v);
  if (!a) return 'NONE';
  if (a.indexOf('barangayresilienceteam') !== -1 || a === 'brest') return 'BREST';
  if (a.indexOf('sfmsc') !== -1) return 'SFMSC';
  if (a.indexOf('municipalresilienceteam') !== -1 || a.indexOf('mrest') !== -1 || a.indexOf('sfmc') !== -1) return 'SEQ1';
  if (a.indexOf('feedbackmechanism') !== -1) {
    if (a.indexOf('municipal') !== -1) return 'SEQ1';
    if (a.indexOf('sub') !== -1) return 'SFMSC';
  }
  if (['cspmc', 'cmsc', 'subprojectmanagement', 'monitoringsubcommittee', 'procurement',
       'operationandmaintenance', 'omsc', 'ppsc'].some(function (k) { return a.indexOf(k) !== -1; })) return 'BA2';
  return 'UNKNOWN';
}

function volunteerColumnIndex(headers) {
  var hs = volunteerHeaders(headers), map = {}, pwd = [];
  hs.forEach(function (h, i) {
    var k = normKey(h);
    if (map[k] === undefined) map[k] = i;
    var a = normAlpha(h);
    if (a === 'pwd' || a === 'ispwd' || a === 'personswithdisability') pwd.push(i);
  });
  function col() {
    for (var i = 0; i < arguments.length; i++) { var k = normKey(arguments[i]); if (map[k] !== undefined) return map[k]; }
    return undefined;
  }
  return {
    province: col('Province Name', 'Province'), muni: col('City Name', 'Municipality'), brgy: col('Barangay Name', 'Barangay'),
    psgcBrgy: col('lib_brgy.code_correspondence'), seq: col('Sequence No'),
    activity: col('Activity'), committee: col('Committee'), position: col('Position'),
    first: col('First Name'), middle: col('Middle Name'), last: col('Last Name'), sex: col('Sex Description', 'Sex'),
    ip: col('Is Ip', 'IP'), pwd: pwd, fisher: col('Fisherfolks', 'Fisherfolk', 'Is Fisherfolk'),
    start: col('Start Date')
  };
}

function cvTally() {
  return { members: 0, chairs: 0, memberRole: 0, noPosition: 0, female: 0, sexKnown: 0, marginal: 0, fisher: 0 };
}

/** Encoded / Needs fixing / Not encoded, with the reasons an SFMSC needs fixing. */
function cvStatus(body, t) {
  if (!t || !t.members) return { status: 'Not encoded', reasons: [] };
  if (!body.rules) return { status: 'Encoded', reasons: [] };
  var reasons = [];
  if (t.chairs !== 1) reasons.push(t.chairs === 0 ? 'no Chairperson' : t.chairs + ' Chairpersons (should be 1)');
  if (t.memberRole < CV_SFMSC_MIN_MEMBERS) reasons.push(t.memberRole === 1 ? 'only 1 Member' : 'no Members');
  return { status: reasons.length ? 'Needs fixing' : 'Encoded', reasons: reasons };
}

function cvBlankRollup() {
  var o = {};
  CV_BODIES.forEach(function (b) {
    o[b.code] = { expected: 0, encoded: 0, needsFix: 0, notEncoded: 0, pending: 0, members: 0,
                  sexKnown: 0, female: 0, marginal: 0, fisher: 0, meetsMarginal: 0 };
  });
  return o;
}

/**
 * Volunteers per monitored barangay. Attaches row.volunteers to each barangay
 * row and returns the region and municipality roll-ups plus the Data Health
 * lists. Lists hold places and counts only, never names.
 */
function volunteerSnapshot(vRows, vHeaders, base, index, barangayRows) {
  var C = volunteerColumnIndex(vHeaders);
  var tallies = {};              // "prov|muni|brgy" (normKey) -> { BREST: tally, SFMSC: tally }
  var issues = { noCommittee: {}, otherBody: {}, noName: {}, noSex: {}, noPosition: {}, badTerm: {} };
  var notInBaseline = 0, notInBaseSamples = [], otherActivityRows = 0, rows = 0;

  function bump(map, key, place, extra) {
    if (!map[key]) {
      map[key] = { province: place.province, municipality: place.municipality, barangay: place.barangay, rows: 0 };
      if (extra) for (var k in extra) map[key][k] = extra[k];
    }
    map[key].rows++;
  }

  (vRows || []).forEach(function (row) {
    if (!row || !row.some(function (v) { return hasValue(v); })) return;
    // Only 1st BA volunteers: a list exported for another activity is left out.
    if (C.activity !== undefined && hasValue(row[C.activity])) {
      var act = classify(index, C.seq !== undefined ? row[C.seq] : null, row[C.activity], null);
      if (act && act !== 'BA1') { otherActivityRows++; return; }
    }
    rows++;
    var psgc = C.psgcBrgy !== undefined && hasValue(row[C.psgcBrgy]) ? normKey(row[C.psgcBrgy]) : '';
    var pk = normKey(row[C.province]), mk = normKey(row[C.muni]), bk = normKey(row[C.brgy]);
    var b = (psgc && base.psgcToBrgy[psgc]) || base.brgyRowByKey[pk + '|' + mk + '|' + bk] || base.brgyNoProv['|' + mk + '|' + bk] || null;
    if (!b) {
      notInBaseline++;
      if (notInBaseSamples.length < 5) notInBaseSamples.push({ province: normText(row[C.province]), municipality: normText(row[C.muni]), barangay: normText(row[C.brgy]) });
      return;
    }
    var key = normKey(b.province) + '|' + normKey(b.municipality) + '|' + normKey(b.barangay);
    var place = { province: b.province, municipality: b.municipality, barangay: b.barangay };

    var named = normAlpha(row[C.first]) || normAlpha(row[C.last]);
    if (!named) { bump(issues.noName, key, place); return; }

    var kind = cvCommitteeKind(row[C.committee]);
    if (kind === 'NONE') { bump(issues.noCommittee, key, place); return; }
    if (kind !== 'BREST' && kind !== 'SFMSC') {
      var committee = normText(row[C.committee]);
      bump(issues.otherBody, key + '|' + committee, place, { committee: committee, belongsTo: CV_KIND_HOME[kind] });
      return;
    }

    var t = (tallies[key] = tallies[key] || { BREST: cvTally(), SFMSC: cvTally() })[kind];
    t.members++;
    var pos = normAlpha(row[C.position]);
    if (!pos) { t.noPosition++; bump(issues.noPosition, key + '|' + kind, place, { body: kind }); }
    else if (pos.indexOf('chair') === 0 || pos === 'chairman' || pos === 'chairwoman') t.chairs++;
    else t.memberRole++;

    var sex = normKey(row[C.sex]);
    var female = sex === 'female';
    if (sex === 'female' || sex === 'male') { t.sexKnown++; if (female) t.female++; }
    else bump(issues.noSex, key, place);
    var pwd = C.pwd.some(function (i) { return isTrue(row[i]); });
    var ip = C.ip !== undefined && isTrue(row[C.ip]);
    if (female || ip || pwd) t.marginal++;
    if (C.fisher !== undefined && (isTrue(row[C.fisher]) || Number(row[C.fisher]) > 0)) t.fisher++;

    if (C.start !== undefined && hasValue(row[C.start])) {
      var d = formatDateVal(row[C.start]);
      var yr = d ? Number(String(d).slice(0, 4)) : NaN;
      if (isNaN(yr) || yr < CV_TERM_YEARS[0] || yr > CV_TERM_YEARS[1]) bump(issues.badTerm, key, place);
    }
  });

  var imported = (vRows || []).length > 0;
  var region = cvBlankRollup(), byMuni = {};
  var missing = [], sfmscFix = [];

  barangayRows.forEach(function (r) {
    var key = normKey(r.province) + '|' + normKey(r.municipality) + '|' + normKey(r.barangay);
    var mKey = r.province + '|' + r.municipality;
    var mu = byMuni[mKey] = byMuni[mKey] || cvBlankRollup();
    var ba1 = r.activities && r.activities.BA1;
    var ba1Encoded = !!ba1 && ba1.status !== STATUS.NOT_ENCODED && ba1.status !== 'N/A';
    var vol = {};
    var lacking = [];
    CV_BODIES.forEach(function (body) {
      var t = (tallies[key] && tallies[key][body.code]) || cvTally();
      var s = cvStatus(body, t);
      vol[body.code] = {
        status: s.status, reasons: s.reasons, members: t.members, chairs: t.chairs, memberRole: t.memberRole,
        female: t.female, sexKnown: t.sexKnown, marginal: t.marginal, fisher: t.fisher
      };
      [region[body.code], mu[body.code]].forEach(function (x) {
        x.expected++;
        if (s.status === 'Encoded') x.encoded++;
        else if (s.status === 'Needs fixing') x.needsFix++;
        else { x.notEncoded++; if (ba1Encoded) x.pending++; }
        x.members += t.members; x.sexKnown += t.sexKnown; x.female += t.female; x.marginal += t.marginal; x.fisher += t.fisher;
        if (t.members && t.marginal / t.members >= CV_MARGINAL_TARGET) x.meetsMarginal++;
      });
      if (s.status === 'Not encoded') lacking.push(body.short);
      if (s.status === 'Needs fixing') {
        sfmscFix.push({ province: r.province, municipality: r.municipality, barangay: r.barangay,
                        body: body.code, reasons: s.reasons, chairs: t.chairs, members: t.memberRole });
      }
    });
    r.volunteers = imported ? vol : null;
    if (imported && ba1Encoded && lacking.length) {
      missing.push({ province: r.province, municipality: r.municipality, barangay: r.barangay,
                     missing: lacking, ba1Status: ba1.status });
    }
  });

  function list(map) {
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return (a.province + a.municipality + a.barangay).localeCompare(b.province + b.municipality + b.barangay);
    });
  }
  return {
    imported: imported,
    rows: rows,
    bodies: CV_BODIES,
    rules: { sfmscMinMembers: CV_SFMSC_MIN_MEMBERS, marginalTarget: CV_MARGINAL_TARGET },
    pipeline: region,
    byMuni: byMuni,
    otherActivityRows: otherActivityRows,
    notInBaseline: notInBaseline,
    notInBaselineSamples: notInBaseSamples,
    issues: imported ? {
      missing: missing, sfmscFix: sfmscFix,
      noCommittee: list(issues.noCommittee), otherBody: list(issues.otherBody), noName: list(issues.noName),
      noSex: list(issues.noSex), noPosition: list(issues.noPosition), badTerm: list(issues.badTerm)
    } : null
  };
}

/** Today in Manila as YYYY-MM-DD. */
function todayIso() {
  try {
    return Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyy-MM-dd');
  } catch (e) {
    return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  }
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD string, NaN otherwise. Time zone free. */
function isoDayNumber(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return NaN;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

/**
 * Household roster checks for Data Health. Three lists, flags only — K2 is not
 * changed by them:
 *   blank          rows with no first and no last name, per barangay + assembly
 *   duplicates     the same name + birthdate listed more than once in the same
 *                  barangay for the same assembly
 *   crossBarangay  the same household head (Is Hh Head = TRUE) in more than one
 *                  barangay. "Likely" when the birthdates match; "Possible" when
 *                  the name matches but a birthdate is missing. Two different
 *                  birthdates are two different people and are not flagged.
 * Names are compared after normAlpha (case, spacing, punctuation, accents).
 */
function householdRosterIssues(blankMap, sameMap, headsMap) {
  var byPlace = function (a, b) {
    return (a.province + '|' + a.municipality + '|' + a.barangay)
      .localeCompare(b.province + '|' + b.municipality + '|' + b.barangay);
  };

  var blank = Object.keys(blankMap).map(function (k) { return blankMap[k]; }).sort(byPlace);

  var duplicates = [], dupExtraRows = 0, dupExtraPresent = 0;
  Object.keys(sameMap).forEach(function (k) {
    var list = sameMap[k];
    if (list.length < 2) return;
    var presentCount = list.filter(function (e) { return e.present; }).length;
    dupExtraRows += list.length - 1;
    dupExtraPresent += Math.max(0, presentCount - 1);
    duplicates.push({
      province: list[0].province, municipality: list[0].municipality, barangay: list[0].barangay,
      actCode: list[0].actCode, name: list[0].name, birthdate: list[0].birthdate,
      times: list.length, presentCount: presentCount
    });
  });
  duplicates.sort(function (a, b) { return byPlace(a, b) || a.name.localeCompare(b.name); });

  function places(entries) {
    var out = {}, order = [];
    entries.forEach(function (e) {
      var pk = e.brgyKey + '|' + e.actCode;
      if (!out[pk]) {
        out[pk] = { province: e.province, municipality: e.municipality, barangay: e.barangay,
                    actCode: e.actCode, birthdate: e.birthdate, present: false, times: 0, brgyKey: e.brgyKey };
        order.push(pk);
      }
      out[pk].times++;
      if (e.present) out[pk].present = true;
      if (!out[pk].birthdate && e.birthdate) out[pk].birthdate = e.birthdate;
    });
    return order.map(function (pk) { return out[pk]; });
  }
  function distinct(list, f) {
    var s = {};
    list.forEach(function (x) { s[f(x)] = true; });
    return Object.keys(s).length;
  }

  var crossBarangay = [];
  Object.keys(headsMap).forEach(function (person) {
    var entries = headsMap[person];
    if (distinct(entries, function (e) { return e.brgyKey; }) < 2) return;
    var bdays = {};
    entries.forEach(function (e) { if (e.birthdate) bdays[e.birthdate] = true; });
    var bdList = Object.keys(bdays);
    var groups = [];
    if (!bdList.length) {
      groups.push({ confidence: 'Possible', birthdate: '', entries: entries });
    } else if (bdList.length === 1) {
      var withB = entries.filter(function (e) { return e.birthdate === bdList[0]; });
      groups.push({
        confidence: distinct(withB, function (e) { return e.brgyKey; }) > 1 ? 'Likely' : 'Possible',
        birthdate: bdList[0], entries: entries
      });
    } else {
      bdList.forEach(function (bd) {
        var same = entries.filter(function (e) { return e.birthdate === bd; });
        if (distinct(same, function (e) { return e.brgyKey; }) > 1) {
          groups.push({ confidence: 'Likely', birthdate: bd, entries: same });
        }
      });
    }
    groups.forEach(function (g) {
      var pl = places(g.entries);
      crossBarangay.push({
        name: g.entries[0].name, birthdate: g.birthdate, confidence: g.confidence,
        acrossMunicipalities: distinct(pl, function (p) { return p.province + '|' + p.municipality; }) > 1,
        barangays: pl.map(function (p) {
          return { province: p.province, municipality: p.municipality, barangay: p.barangay,
                   actCode: p.actCode, birthdate: p.birthdate, present: p.present, times: p.times };
        })
      });
    });
  });
  crossBarangay.sort(function (a, b) {
    if (a.acrossMunicipalities !== b.acrossMunicipalities) return a.acrossMunicipalities ? -1 : 1;
    if (a.confidence !== b.confidence) return a.confidence === 'Likely' ? -1 : 1;
    return byPlace(a.barangays[0], b.barangays[0]) || a.name.localeCompare(b.name);
  });

  var blankBrgys = {};
  blank.forEach(function (b) { blankBrgys[b.province + '|' + b.municipality + '|' + b.barangay] = true; });
  return {
    blank: blank,
    duplicates: duplicates,
    crossBarangay: crossBarangay,
    summary: {
      blankRows: blank.reduce(function (s, b) { return s + b.rows; }, 0),
      blankPresent: blank.reduce(function (s, b) { return s + b.present; }, 0),
      blankBarangays: Object.keys(blankBrgys).length,
      dupGroups: duplicates.length,
      dupExtraRows: dupExtraRows,
      dupExtraPresent: dupExtraPresent,
      crossLikely: crossBarangay.filter(function (c) { return c.confidence === 'Likely'; }).length,
      crossPossible: crossBarangay.filter(function (c) { return c.confidence === 'Possible'; }).length,
      crossAcrossMunicipalities: crossBarangay.filter(function (c) { return c.acrossMunicipalities; }).length
    }
  };
}

// ---- data quality (DQA) helpers, for Data Health. Flags only. -------------

/** Activities dated before this cannot be PCRP Stage 1 (the volunteer term check uses the same start). */
var DQA_EARLIEST = '2025-01-01';
/** Typed into a name field when the name was not known. Compared after normAlpha. */
var DQA_PLACEHOLDER_NAMES = { na: 1, none: 1, unknown: 1, test: 1, sample: 1, noname: 1, null: 1, undefined: 1, xx: 1, xxx: 1 };

/**
 * A first and last name (normAlpha'd) that look mistyped: a digit, a
 * placeholder, or a single letter. A blank name is a different check.
 */
function isOddName_(firstA, lastA) {
  if (!firstA && !lastA) return false;
  return [firstA, lastA].some(function (x) {
    return /[0-9]/.test(x) || DQA_PLACEHOLDER_NAMES[x] === 1 || x.length === 1;
  });
}

/** Display names for a "prov|muni|brgy" key (normKey parts); brgy '' for a municipal activity. */
function dqaPlace_(base, prov, muni, brgy) {
  var b = brgy ? base.brgyRowByKey[prov + '|' + muni + '|' + brgy] : null;
  var m = base.byMuni[prov + '|' + muni];
  return {
    province: b ? b.province : (m ? m.province : prov),
    municipality: b ? b.municipality : (m ? m.municipality : muni),
    barangay: b ? b.barangay : (brgy || '')
  };
}

/** Whole years between two YYYY-MM-DD dates, NaN if either is not one. */
function ageOn_(birthIso, onIso) {
  var b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthIso || ''));
  var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(onIso || ''));
  if (!b || !d) return NaN;
  var age = +d[1] - +b[1];
  if (+d[2] < +b[2] || (+d[2] === +b[2] && +d[3] < +b[3])) age--;
  return age;
}

/**
 * Every open Data Health item that belongs to a place, one per check, place,
 * activity and kind of problem, for the Fix list and the DQA_Findings ledger.
 * Places and counts only, never names. The region-level checks (unclassified
 * rows, barangays not in the baseline, sex not recorded) have no place and are
 * left out. health: snapshot.health; hh: the household roster lists.
 *
 * The check ids are the ones in JS_Health.html dhChecks(), which owns the
 * names, explanations and steps.
 */
function dqaFindings(health, hh) {
  var out = [];
  var h = health || {}, dq = h.dqa || {}, v = h.volunteerIssues || null;
  hh = hh || {};
  function add(check, r, act, part, count) {
    if (!r || !r.municipality) return;
    out.push({ check: check, province: r.province || '', municipality: r.municipality, barangay: r.barangay || '',
               act: act || '', part: part || '', count: count === undefined ? 1 : count });
  }
  (dq.lateAttendance || []).forEach(function (r) { add('late', r, r.actCode, '', 1); });
  (h.householdFlags || []).forEach(function (r) { add('quorum', r, 'BA1', '', 1); });
  (h.outOfSequenceRows || []).forEach(function (r) { add('sequence', r, '', '', 1); });
  (hh.blank || []).forEach(function (r) { add('noname', r, r.actCode, '', r.rows); });
  // The roster lists hold one entry per person; the ledger keeps one line per barangay.
  var agg = {};
  function addAgg(check, r, act) {
    var k = check + '|' + r.province + '|' + r.municipality + '|' + r.barangay + '|' + (act || '');
    if (agg[k]) agg[k].count++;
    else { add(check, r, act, '', 1); agg[k] = out[out.length - 1]; }
  }
  (hh.duplicates || []).forEach(function (r) { addAgg('dup', r, r.actCode); });
  (hh.crossBarangay || []).forEach(function (c) { (c.barangays || []).forEach(function (b) { addAgg('cross', b, b.actCode); }); });
  (dq.dateIssues || []).forEach(function (r) { add('dates', r, r.actCode, r.problems.join('; '), 1); });
  (dq.twiceEncoded || []).forEach(function (r) { add('twice', r, r.actCode, '', r.ids.length - 1); });
  (dq.attendeeDuplicates || []).forEach(function (r) { add('attdup', r, r.actCode, '', r.rows); });
  (dq.nameIssues || []).forEach(function (r) { add('names', r, r.actCode, r.source, r.rows); });
  (dq.birthdateIssues || []).forEach(function (r) { add('bday', r, r.actCode, r.problem, r.rows); });
  if (v) {
    (v.missing || []).forEach(function (r) { add('cv_missing', r, 'BA1', r.missing.join(' and '), 1); });
    (v.sfmscFix || []).forEach(function (r) { add('cv_sfmsc', r, 'BA1', '', 1); });
    (v.noCommittee || []).forEach(function (r) { add('cv_tagging', r, 'BA1', 'No committee', r.rows); });
    (v.otherBody || []).forEach(function (r) { add('cv_tagging', r, 'BA1', 'Tagged to ' + r.committee, r.rows); });
    (v.noName || []).forEach(function (r) { add('cv_gaps', r, 'BA1', 'No name', r.rows); });
    (v.noSex || []).forEach(function (r) { add('cv_gaps', r, 'BA1', 'Sex not recorded', r.rows); });
    (v.noPosition || []).forEach(function (r) { add('cv_gaps', r, 'BA1', 'No position', r.rows); });
    (v.badTerm || []).forEach(function (r) { add('cv_gaps', r, 'BA1', 'Term start date', r.rows); });
  }
  return out;
}

/** The ledger key of a finding: the same problem in the same place keeps its key from pull to pull. */
function dqaFindingKey(f) {
  return [f.check, normKey(f.province), normKey(f.municipality), normKey(f.barangay), f.act || '', normKey(f.part)].join('|');
}

/**
 * Status of each current finding against the ledger of earlier pulls.
 * current: dqaFindings(); ledger: {date: {key: finding}} for pulls BEFORE the
 * current data (the caller leaves the current pull out). Returns
 *   items     current findings + status ('new' | 'open' | 'better' | 'worse'),
 *             since (first pull of the run it has been open through), before (count then)
 *   resolved  findings of the latest earlier pull that are gone now
 *   previous  that pull's date, or '' when there is none to compare with
 */
function dqaCompare(current, ledger) {
  var dates = Object.keys(ledger || {}).sort();
  var prev = dates.length ? dates[dates.length - 1] : '';
  var prevMap = prev ? ledger[prev] : {};
  var seen = {};
  var items = current.map(function (f) {
    var key = dqaFindingKey(f);
    seen[key] = true;
    var it = Object.assign({ key: key }, f);
    if (!prev) { it.status = 'open'; it.since = ''; it.before = null; return it; }
    if (prevMap[key] === undefined) { it.status = 'new'; it.since = ''; it.before = null; return it; }
    it.before = prevMap[key].count;
    it.status = f.count < it.before ? 'better' : (f.count > it.before ? 'worse' : 'open');
    var since = prev;
    for (var i = dates.length - 2; i >= 0 && ledger[dates[i]][key] !== undefined; i--) since = dates[i];
    it.since = since;
    return it;
  });
  var resolved = [];
  Object.keys(prevMap).forEach(function (key) {
    if (seen[key]) return;
    var p = prevMap[key];
    resolved.push({ key: key, check: p.check, province: p.province, municipality: p.municipality, barangay: p.barangay,
                    act: p.act, part: p.part, before: p.count, status: 'resolved' });
  });
  return { items: items, resolved: resolved, previous: prev };
}

/**
 * Turn the two raw exports into every figure the app shows.
 *
 * participants / households: arrays of arrays, WITHOUT the header row.
 * Returns a snapshot object; nothing else in the app recomputes anything.
 */
function computeSnapshot(participants, households, baselineRows, monitored,
                         activities, pHeaders, hHeaders, evalDateIso, vRows, vHeaders) {
  var index = buildActivityIndex(activities);
  var base = buildBaseline(baselineRows, monitored);
  var colP = buildColumnIndex(pHeaders, P_DEFAULT);
  var colH = buildColumnIndex(hHeaders, H_DEFAULT);

  // ---- tally the participant export ------------------------------
  // key: "prov|muni|brgy|CODE" for barangay activities, "prov|muni||CODE" for municipal
  var rec = {};                 // key -> {rows, attendees, male, female, unset, dateStart, dateEnd, activityIds, psgcBrgy}
  var unmapped = 0, unmappedBlank = 0, notInBaseline = 0;
  var unmappedSamples = [], notInBaseSamples = [], outOfSequenceSamples = [], outOfSequenceRows = [];
  var nonCripExcluded = 0;

  function slot(key) {
    if (!rec[key]) {
      rec[key] = {
        rows: 0, att: 0, m: 0, f: 0, u: 0,
        dateStart: null, dateEnd: null, activityIds: {}, psgcBrgy: null,
        // data quality flags (Data Health only)
        people: {}, dupRows: 0, dupPeople: 0, oddNames: 0, badDate: false, endBeforeStart: false
      };
    }
    return rec[key];
  }

  participants.forEach(function (row) {
    if (!hasValue(row[0])) return;                       // trailing blank row

    // Column W (Crip Mc09 Activity Id): exclude non-CRIP activity export rows (Activity Id = 0 is not part of CRIP)
    var rawActId = colP.activityId !== undefined ? row[colP.activityId] : (row.length > 22 ? row[22] : null);
    if (isZeroActivityId(rawActId)) {
      nonCripExcluded++;
      return;
    }

    var code = classify(index, row[colP.seq], row[colP.name], colP.title !== undefined ? row[colP.title] : null);
    if (!code) {
      if (isZeroActivityId(rawActId)) return;
      unmapped++;
      if (!hasValue(row[colP.seq]) && !hasValue(row[colP.name])) unmappedBlank++;
      if (unmappedSamples.length < 5) {
        unmappedSamples.push({
          province: normText(row[colP.province]),
          municipality: normText(row[colP.muni]), barangay: normText(row[colP.brgy]),
          seq: normText(row[colP.seq]), name: normText(row[colP.name])
        });
      }
      return;
    }
    var provRaw = colP.province !== undefined ? normKey(row[colP.province]) : '';
    var mk = normKey(row[colP.muni]), bk = normKey(row[colP.brgy]);
    var municipal = index.byCode[code].level === 'Municipal';
    var psgcRaw = colP.psgcBrgy !== undefined && hasValue(row[colP.psgcBrgy]) ? normKey(row[colP.psgcBrgy]) : '';
    var psgcCityRaw = colP.psgcCity !== undefined && hasValue(row[colP.psgcCity]) ? normKey(row[colP.psgcCity]) : '';

    var known = false;
    var finalProv = provRaw, finalMuni = mk, finalBrgy = bk;

    if (psgcRaw && base.psgcKeySet[psgcRaw]) {
      // 1. Matched by Barangay PSGC code
      known = true;
      var bMatch = base.psgcToBrgy[psgcRaw];
      if (bMatch) {
        finalProv = normKey(bMatch.province);
        finalMuni = normKey(bMatch.municipality);
        finalBrgy = normKey(bMatch.barangay);
      }
    } else if (municipal && psgcCityRaw && base.psgcCityKeySet[psgcCityRaw]) {
      // 2. Municipal activity matched by City PSGC code
      known = true;
      var cMatch = base.psgcCityToMuni[psgcCityRaw];
      if (cMatch) {
        finalProv = normKey(cMatch.province);
        finalMuni = normKey(cMatch.municipality);
      }
    } else if (municipal) {
      // 3. Municipal activity matched by (prov + muni) or muni
      if (provRaw && base.muniKeySet[provRaw + '|' + mk]) {
        known = true;
        finalProv = provRaw;
        finalMuni = mk;
      } else if (base.muniNoProv['|' + mk]) {
        // Province blank or spelled differently: file it under the baseline's
        // province, or the tally is stored where no municipality row reads it.
        known = true;
        finalProv = normKey(base.muniNoProv['|' + mk].province);
        finalMuni = mk;
      }
    } else {
      // 4. Barangay activity matched by (prov + muni + brgy) or (muni + brgy)
      if (provRaw && base.brgyKeySet[provRaw + '|' + mk + '|' + bk]) {
        known = true;
        finalProv = provRaw;
        finalMuni = mk;
        finalBrgy = bk;
      } else if (base.brgyNoProv['|' + mk + '|' + bk]) {
        var bOnly = base.brgyNoProv['|' + mk + '|' + bk];
        known = true;
        finalProv = normKey(bOnly.province);
        finalMuni = normKey(bOnly.municipality);
        finalBrgy = normKey(bOnly.barangay);
      }
    }

    if (!known) {
      notInBaseline++;
      if (notInBaseSamples.length < 5) {
        notInBaseSamples.push({
          province: normText(row[colP.province]),
          municipality: normText(row[colP.muni]), barangay: normText(row[colP.brgy]),
          activity: code
        });
      }
      return;
    }

    var slotKey = finalProv + '|' + finalMuni + '|' + (municipal ? '' : finalBrgy) + '|' + code;
    var s = slot(slotKey);
    s.rows++;
    if (hasValue(row[colP.first]) || hasValue(row[colP.last])) {
      s.att++;
      var sex = normKey(row[colP.sex]);
      if (sex === 'male') s.m++;
      else if (sex === 'female') s.f++;
      else s.u++;

      // ---- data quality, for Data Health. Flags only: the tallies above are unchanged.
      var pf = normAlpha(row[colP.first]), pl = normAlpha(row[colP.last]);
      if (isOddName_(pf, pl)) s.oddNames++;
      var who = pf + ' ' + normAlpha(row[colP.middle]) + ' ' + pl;
      s.people[who] = (s.people[who] || 0) + 1;
      if (s.people[who] > 1) { s.dupRows++; if (s.people[who] === 2) s.dupPeople++; }
    }

    // Extended fields (Date Start, Date End, Crip Mc09 Activity Id, PSGC code)
    var ds = null, de = null;
    if (colP.dateStart !== undefined && hasValue(row[colP.dateStart])) {
      ds = formatDateVal(row[colP.dateStart]);
      if (ds && (!s.dateStart || ds < s.dateStart)) s.dateStart = ds;
      if (!ds || isNaN(isoDayNumber(ds))) s.badDate = true;
    }
    if (colP.dateEnd !== undefined && hasValue(row[colP.dateEnd])) {
      de = formatDateVal(row[colP.dateEnd]);
      if (de && (!s.dateEnd || de > s.dateEnd)) s.dateEnd = de;
      if (!de || isNaN(isoDayNumber(de))) s.badDate = true;
    }
    if (ds && de && de < ds) s.endBeforeStart = true;
    if (colP.activityId !== undefined && hasValue(row[colP.activityId])) {
      var actId = String(row[colP.activityId]).trim();
      if (actId) s.activityIds[actId] = true;
    }
    if (colP.psgcBrgy !== undefined && hasValue(row[colP.psgcBrgy])) {
      var pCode = String(row[colP.psgcBrgy]).trim();
      if (pCode) s.psgcBrgy = pCode;
    }
  });

  // ---- tally the household export --------------------------------
  // Households attach to Assemblies: BA1 (Seq 2), BA2 (Seq 6), BA3 (Seq 9)
  var hh = {};                  // "prov|muni|brgy|CODE" -> {listed, present}
  var hhUnmapped = 0, hhNotInBaseline = 0;
  var hhActsMap = {};
  activities.forEach(function (a) { if (a.households) hhActsMap[a.code] = true; });
  var hhBlank = {};             // "prov|muni|brgy|CODE" -> rows with no first and no last name
  var hhSame = {};              // "prov|muni|brgy|CODE|person|birthdate" -> [entry]
  var hhHeads = {};             // "first middle last" (household heads) -> [entry]
  var bdayMemo = {};
  var hhQuality = {};           // "prov|muni|brgy|CODE" -> data quality counts (Data Health only)
  var dqaDate = evalDateIso || todayIso();

  households.forEach(function (row) {
    if (!hasValue(row[0])) return;
    var rawActIdH = colH.activityId !== undefined ? row[colH.activityId] : (row.length > 22 ? row[22] : null);
    if (isZeroActivityId(rawActIdH)) return;
    var code = classify(index, null, row[colH.name], colH.title !== undefined ? row[colH.title] : null);
    if (!code) { hhUnmapped++; return; }
    if (!hhActsMap[code]) return;                 // only assemblies carry household rosters
    var provRaw = colH.province !== undefined ? normKey(row[colH.province]) : '';
    var mk = normKey(row[colH.muni]), bk = normKey(row[colH.brgy]);
    if (!bk) return;                             // municipal placeholder row
    var psgcH = colH.psgcBrgy !== undefined && hasValue(row[colH.psgcBrgy]) ? normKey(row[colH.psgcBrgy]) : '';

    var hKnown = false;
    var finalProv = provRaw, finalMuni = mk, finalBrgy = bk;

    if (psgcH && base.psgcKeySet[psgcH]) {
      hKnown = true;
      var hMatch = base.psgcToBrgy[psgcH];
      if (hMatch) {
        finalProv = normKey(hMatch.province);
        finalMuni = normKey(hMatch.municipality);
        finalBrgy = normKey(hMatch.barangay);
      }
    } else if (provRaw && base.brgyKeySet[provRaw + '|' + mk + '|' + bk]) {
      hKnown = true;
      finalProv = provRaw;
      finalMuni = mk;
      finalBrgy = bk;
    } else if (base.brgyNoProv['|' + mk + '|' + bk]) {
      var hOnly = base.brgyNoProv['|' + mk + '|' + bk];
      hKnown = true;
      finalProv = normKey(hOnly.province);
      finalMuni = normKey(hOnly.municipality);
      finalBrgy = normKey(hOnly.barangay);
    }

    if (!hKnown) { hhNotInBaseline++; return; }

    var isRecord = hasValue(row[colH.first]) || hasValue(row[colH.middle]) ||
                   hasValue(row[colH.last]) || hasValue(row[colH.sex]) ||
                   hasValue(row[colH.present]);
    if (!isRecord) return;

    var k = finalProv + '|' + finalMuni + '|' + finalBrgy + '|' + code;
    if (!hh[k]) hh[k] = { listed: 0, present: 0 };
    hh[k].listed++;
    var isPresent = isTrue(row[colH.present]);
    if (isPresent) hh[k].present++;

    // ---- roster integrity, for Data Health. Flags only: K2 above is unchanged.
    var brgyKey = finalProv + '|' + finalMuni + '|' + finalBrgy;
    var bRow = base.brgyRowByKey[brgyKey] || {
      province: normText(row[colH.province]), municipality: normText(row[colH.muni]), barangay: normText(row[colH.brgy])
    };
    var firstA = normAlpha(row[colH.first]), lastA = normAlpha(row[colH.last]);
    if (!firstA && !lastA) {
      if (!hhBlank[k]) {
        hhBlank[k] = { province: bRow.province, municipality: bRow.municipality, barangay: bRow.barangay,
                       actCode: code, rows: 0, present: 0 };
      }
      hhBlank[k].rows++;
      if (isPresent) hhBlank[k].present++;
      return;
    }
    var person = firstA + ' ' + normAlpha(row[colH.middle]) + ' ' + lastA;
    var rawBday = colH.birthdate !== undefined ? row[colH.birthdate] : '';
    var bday = '';
    if (hasValue(rawBday)) {
      // ~100k rows; formatDateVal goes through Utilities.formatDate, so memoise.
      var bdKey = typeof rawBday + ':' + String(rawBday);
      if (bdayMemo[bdKey] === undefined) bdayMemo[bdKey] = formatDateVal(rawBday) || normText(rawBday);
      bday = bdayMemo[bdKey];
    }
    var entry = {
      province: bRow.province, municipality: bRow.municipality, barangay: bRow.barangay, brgyKey: brgyKey,
      actCode: code, birthdate: bday, present: isPresent,
      name: [row[colH.first], row[colH.middle], row[colH.last]].map(normText).filter(Boolean).join(' ')
    };
    // Names and birthdates that cannot be right. A blank birthdate is not
    // flagged: the export does not tell whether KCIS requires it. The age test
    // applies to household heads only, as the roster may list other members.
    var isHead = colH.isHead !== undefined && isTrue(row[colH.isHead]);
    var oddName = isOddName_(firstA, lastA);
    var bdProblem = '';
    if (bday) {
      var age = ageOn_(bday, dqaDate);
      if (isNaN(age)) bdProblem = 'unreadable';
      else if (bday > dqaDate) bdProblem = 'future';
      else if (age > 110) bdProblem = 'old';
      else if (isHead && age < 15) bdProblem = 'young';
    }
    if (oddName || bdProblem) {
      var q = hhQuality[k] || (hhQuality[k] = { province: bRow.province, municipality: bRow.municipality, barangay: bRow.barangay,
                                                 actCode: code, oddNames: 0, unreadable: 0, future: 0, old: 0, young: 0 });
      if (oddName) q.oddNames++;
      if (bdProblem) q[bdProblem]++;
    }

    var sameKey = k + '|' + person + '|' + bday;
    (hhSame[sameKey] = hhSame[sameKey] || []).push(entry);
    if (firstA && lastA && isHead) {
      (hhHeads[person] = hhHeads[person] || []).push(entry);
    }
  });
  var hhIssues = householdRosterIssues(hhBlank, hhSame, hhHeads);

  // ---- status per record -----------------------------------------
  function statusOf(key) {
    var s = rec[key];
    if (!s || s.rows === 0) return STATUS.NOT_ENCODED;
    if (s.att === 0) return STATUS.NO_ATTENDEES;
    return STATUS.COMPLETE;
  }
  function attOf(key) { return rec[key] ? rec[key].att : 0; }

  var brgyActs = activities.filter(function (a) { return a.level === 'Barangay'; });
  var muniActs = activities.filter(function (a) { return a.level === 'Municipal'; });

  // The day the backlog is judged on. A saved snapshot passes the date the
  // export was PULLED, so the 3-day attendance window is measured from the
  // data's own date and not from whenever the snapshot happened to be saved.
  var evalDate = evalDateIso || todayIso();
  var evalDay = isoDayNumber(evalDate);

  function isMilestoneLacking_(st, field, dateEnd) {
    if (st === STATUS.COMPLETE) return false;
    if (st === STATUS.NO_ATTENDEES) {
      var endDay = dateEnd ? isoDayNumber(formatDateVal(dateEnd)) : NaN;
      if (!isNaN(endDay) && !isNaN(evalDay)) {
        return evalDay - endDay >= 3; // Lacking from the 3rd day after conduct without rosters
      }
      return true; // Missing dateEnd with 0 attendees defaults to lacking
    }
    if (st === STATUS.NOT_ENCODED) {
      if (field === 'Completed') return true;
    }
    return false;
  }

  // ---- barangay-level detail --------------------------------------
  var barangayRows = [];
  var outOfSequence = 0;
  var hhFlags = [];
  var noAttendeesRecords = [];

  base.rows.forEach(function (r) {
    var pk = normKey(r.province), mk = normKey(r.municipality), bk = normKey(r.barangay);
    var row = {
      province: r.province, municipality: r.municipality, barangay: r.barangay,
      batch: r.batch, focalArea: r.focalArea || '', activities: {}, furthest: 'none',
      owed: 0, todo: [], psgcBrgy: r.psgcBrgy || null,
      cpHh: r.cpHh === undefined ? null : r.cpHh,
      stage2Prio: r.stage2Prio === true
    };
    brgyActs.forEach(function (a) {
      var key = pk + '|' + mk + '|' + bk + '|' + a.code;
      var st = statusOf(key);
      var actSlot = rec[key];
      var ids = actSlot ? Object.keys(actSlot.activityIds) : [];
      var isApplicable = !a.prioOnly || r.stage2Prio;

      var actObj = {
        status: isApplicable ? st : (st !== STATUS.NOT_ENCODED ? st : 'N/A'),
        notApplicable: !isApplicable,
        attendees: attOf(key),
        dateStart: actSlot ? actSlot.dateStart : null,
        dateEnd: actSlot ? actSlot.dateEnd : null,
        activityIds: ids,
        psgcBrgy: actSlot ? actSlot.psgcBrgy : (r.psgcBrgy || null)
      };

      if (a.households) {
        var hObj = hh[pk + '|' + mk + '|' + bk + '|' + a.code] || { listed: 0, present: 0 };
        actObj.hhListed = hObj.listed;
        actObj.hhPresent = hObj.present;
        actObj.hhRate = hObj.listed ? hObj.present / hObj.listed : null;
      }
      row.activities[a.code] = actObj;

      if (st === STATUS.NO_ATTENDEES && isApplicable) {
        noAttendeesRecords.push({
          province: r.province,
          municipality: r.municipality,
          barangay: r.barangay,
          actCode: a.code,
          seq: a.seq,
          actLabel: a.label,
          level: 'Barangay',
          dateStart: actSlot ? actSlot.dateStart : null,
          dateEnd: actSlot ? actSlot.dateEnd : null,
          fieldDate: actSlot ? (actSlot.dateEnd || actSlot.dateStart) : null
        });
      }
      if (actSlot && actSlot.psgcBrgy && !row.psgcBrgy) {
        row.psgcBrgy = actSlot.psgcBrgy;
      }
      if (st !== STATUS.NOT_ENCODED) {
        row.furthest = a.seq;
      }
      var isOwed = isApplicable && isMilestoneLacking_(st, a.field, actSlot ? actSlot.dateEnd : null);
      if (isOwed) {
        row.owed++;
        row.todo.push(a.label + ' (seq ' + a.seq + '): ' +
          (st === STATUS.NO_ATTENDEES ? 'attendance sheet missing past 3-day window'
                                      : 'nothing encoded'));
      }
    });

    // BA1 legacy fields for backwards compatibility
    var ba1Hh = hh[pk + '|' + mk + '|' + bk + '|BA1'];
    row.hhListed = ba1Hh ? ba1Hh.listed : 0;
    row.hhPresent = ba1Hh ? ba1Hh.present : 0;
    row.hhRate = row.hhListed ? row.hhPresent / row.hhListed : null;

    // Sequence gaps evaluated per stage
    var stage1BrgyActs = brgyActs.filter(function (a) { return (a.stage || 1) === 1 && (!a.prioOnly || r.stage2Prio); });
    var stage2BrgyActs = brgyActs.filter(function (a) { return (a.stage || 1) === 2 && (!a.prioOnly || r.stage2Prio); });
    var gaps1 = sequenceGaps(stage1BrgyActs, row.activities);
    var gaps2 = sequenceGaps(stage2BrgyActs, row.activities);
    var gaps = gaps1.concat(gaps2);
    row.sequenceGaps = gaps;
    if (gaps.length) {
      row.outOfSequence = true;
      outOfSequence++;
      // Every barangay, not a sample: Data Health pages and counts it per
      // municipality. At most one entry per monitored barangay.
      outOfSequenceRows.push({
        province: r.province,
        municipality: r.municipality,
        barangay: r.barangay,
        issue: gaps.map(function (c) { return index.byCode[c].label; }).join(', ') +
               ' not encoded while a later milestone is active'
      });
      if (outOfSequenceSamples.length < 15) outOfSequenceSamples.push(outOfSequenceRows[outOfSequenceRows.length - 1]);
    }

    var ba = row.activities['BA1'];
    if (row.hhListed > 0 && row.hhPresent === 0) {
      hhFlags.push({ province: r.province, municipality: r.municipality, barangay: r.barangay,
        issue: row.hhListed + ' households listed, none flagged present' });
    } else if (ba && row.hhPresent > ba.attendees && ba.attendees > 0) {
      hhFlags.push({ province: r.province, municipality: r.municipality, barangay: r.barangay,
        issue: 'households present (' + row.hhPresent +
               ') exceeds attendees encoded (' + ba.attendees + ')' });
    }
    barangayRows.push(row);
  });

  // ---- 1st BA community volunteers (BResT, SFMSC) -------------------
  var volunteers = volunteerSnapshot(vRows || [], vHeaders || [], base, index, barangayRows);

  // ---- municipal-level detail -------------------------------------
  var municipalRows = [];
  base.muniList.forEach(function (m) {
    var pk = normKey(m.province), mk = normKey(m.municipality);
    var row = { province: m.province, municipality: m.municipality,
                batch: m.batch, focalArea: m.focalArea || '', activities: {} };
    muniActs.forEach(function (a) {
      var key = pk + '|' + mk + '||' + a.code;
      var actSlot = rec[key];
      var mSt = statusOf(key);
      row.activities[a.code] = {
        status: mSt,
        attendees: attOf(key),
        dateStart: actSlot ? actSlot.dateStart : null,
        dateEnd: actSlot ? actSlot.dateEnd : null
      };
      if (mSt === STATUS.NO_ATTENDEES) {
        noAttendeesRecords.push({
          province: m.province,
          municipality: m.municipality,
          barangay: '— (Municipal Level)',
          actCode: a.code,
          seq: a.seq,
          actLabel: a.label,
          level: 'Municipal',
          dateStart: actSlot ? actSlot.dateStart : null,
          dateEnd: actSlot ? actSlot.dateEnd : null,
          fieldDate: actSlot ? (actSlot.dateEnd || actSlot.dateStart) : null
        });
      }
    });
    municipalRows.push(row);
  });

  // ---- the Pipeline ---------------------------------------
  function blankTally() {
    return { expected: 0, complete: 0, noAttendees: 0, notEncoded: 0,
             attendees: 0, backlog: 0 };
  }
  function addStatus(t, st, att, field, dateEnd) {
    t.expected++;
    if (st === STATUS.COMPLETE) t.complete++;
    else if (st === STATUS.NO_ATTENDEES) t.noAttendees++;
    else t.notEncoded++;
    t.attendees += att;
    if (isMilestoneLacking_(st, field, dateEnd)) t.backlog++;
  }

  var pipeline = [];
  var byMuniActivity = {};      // "prov|muni" -> code -> tally, and "muni" -> code -> tally (if unique)

  // PCRP has Loreto, Carmen and San Francisco in two provinces each. A key on
  // the municipality name alone would add the pair together, so bare-name keys
  // are written only for names that occur once. The list is de-duplicated: for
  // a one-word name normKey and normAlpha give the same key, which used to be
  // tallied twice.
  var provsByMuniName = {};
  base.muniList.forEach(function (m) {
    var nk = normAlpha(m.municipality);
    (provsByMuniName[nk] = provsByMuniName[nk] || {})[normAlpha(m.province)] = true;
  });
  var muniKeysMemo = {};
  function muniKeys(province, municipality) {
    var memoKey = province + '|' + municipality;
    if (muniKeysMemo[memoKey]) return muniKeysMemo[memoKey];
    var keys = [province + '|' + municipality,
                normAlpha(province) + '|' + normAlpha(municipality),
                normKey(province) + '|' + normKey(municipality)];
    if (Object.keys(provsByMuniName[normAlpha(municipality)] || {}).length <= 1) {
      keys.push(municipality, normAlpha(municipality), normKey(municipality));
    }
    var seen = {};
    muniKeysMemo[memoKey] = keys.filter(function (k) { if (seen[k]) return false; seen[k] = true; return true; });
    return muniKeysMemo[memoKey];
  }

  activities.forEach(function (a) {
    var t = blankTally();
    if (a.level === 'Barangay') {
      barangayRows.forEach(function (r) {
        if (a.prioOnly && !r.stage2Prio) return;
        var x = r.activities[a.code];
        addStatus(t, x.status, x.attendees, a.field, x.dateEnd);
        muniKeys(r.province, r.municipality).forEach(function (k) {
          if (!byMuniActivity[k]) byMuniActivity[k] = {};
          if (!byMuniActivity[k][a.code]) byMuniActivity[k][a.code] = blankTally();
          addStatus(byMuniActivity[k][a.code], x.status, x.attendees, a.field, x.dateEnd);
        });
      });
    } else {
      municipalRows.forEach(function (r) {
        var x = r.activities[a.code];
        addStatus(t, x.status, x.attendees, a.field, x.dateEnd);
        muniKeys(r.province, r.municipality).forEach(function (k) {
          if (!byMuniActivity[k]) byMuniActivity[k] = {};
          if (!byMuniActivity[k][a.code]) byMuniActivity[k][a.code] = blankTally();
          addStatus(byMuniActivity[k][a.code], x.status, x.attendees, a.field, x.dateEnd);
        });
      });
    }
    pipeline.push({
      seq: a.seq, code: a.code, label: a.label, level: a.level, field: a.field,
      stage: a.stage || (Number(a.seq) >= 6 ? 2 : 1), prioOnly: !!a.prioOnly,
      households: !!a.households,
      expected: t.expected, complete: t.complete, noAttendees: t.noAttendees,
      notEncoded: t.notEncoded, attendees: t.attendees, backlog: t.backlog,
      pct: t.expected ? t.complete / t.expected : null
    });
  });

  // ---- K2 Quorums (BA1, BA2, BA3) -----------------------------------
  function computeK2(code) {
    var res = { reporting: 0, listed: 0, present: 0, met: 0, target: K2_TARGET };
    barangayRows.forEach(function (r) {
      var act = r.activities[code];
      if (act && act.hhListed > 0) {
        res.reporting++;
        res.listed += act.hhListed;
        res.present += act.hhPresent;
        if (act.hhRate >= K2_TARGET) res.met++;
      }
    });
    res.rate = res.listed ? res.present / res.listed : null;
    return res;
  }
  var k2 = computeK2('BA1');
  var k2_ba2 = computeK2('BA2');
  var k2_ba3 = computeK2('BA3');

  // ---- region-wide headline & stage breakdowns ---------------------
  var ba1 = null;
  pipeline.forEach(function (p) { if (p.code === 'BA1') ba1 = p; });
  var totals = blankTally();
  var totalsStage1 = blankTally();
  var totalsStage2 = blankTally();

  pipeline.forEach(function (p) {
    totals.expected += p.expected;
    totals.complete += p.complete;
    totals.noAttendees += p.noAttendees;
    totals.notEncoded += p.notEncoded;
    totals.attendees += p.attendees;
    totals.backlog += p.backlog;

    if (p.stage === 1) {
      totalsStage1.expected += p.expected;
      totalsStage1.complete += p.complete;
      totalsStage1.noAttendees += p.noAttendees;
      totalsStage1.notEncoded += p.notEncoded;
      totalsStage1.attendees += p.attendees;
      totalsStage1.backlog += p.backlog;
    } else {
      totalsStage2.expected += p.expected;
      totalsStage2.complete += p.complete;
      totalsStage2.noAttendees += p.noAttendees;
      totalsStage2.notEncoded += p.notEncoded;
      totalsStage2.attendees += p.attendees;
      totalsStage2.backlog += p.backlog;
    }
  });

  // ---- data quality lists, for Data Health (places and counts, never names) --
  var dqa = { dateIssues: [], twiceEncoded: [], attendeeDuplicates: [], nameIssues: [], birthdateIssues: [], lateAttendance: [] };
  var muniRows = {};            // "Province|Municipality" -> participant rows: a municipality with none has nothing to test
  Object.keys(rec).forEach(function (key) {
    var s = rec[key], parts = key.split('|'), code = parts[3];
    var place = dqaPlace_(base, parts[0], parts[1], parts[2]);
    muniRows[place.province + '|' + place.municipality] = (muniRows[place.province + '|' + place.municipality] || 0) + s.rows;
    var at = function (extra) { return Object.assign({ province: place.province, municipality: place.municipality, barangay: place.barangay, actCode: code }, extra); };
    var probs = [];
    if (s.badDate) probs.push('Date not readable');
    if (s.endBeforeStart) probs.push('Date End before Date Start');
    var isDay = function (v) { return !!v && !isNaN(isoDayNumber(v)); };   // an unreadable date is reported once, above
    if (isDay(s.dateStart) && s.dateStart < DQA_EARLIEST) probs.push('Dated before 2025');
    if ((isDay(s.dateStart) && s.dateStart > evalDate) || (isDay(s.dateEnd) && s.dateEnd > evalDate)) probs.push('Dated after the KCIS pull date');   // no date in the label: the Fix list keys on it from pull to pull
    if (probs.length) dqa.dateIssues.push(at({ problems: probs, dateStart: s.dateStart, dateEnd: s.dateEnd }));
    var ids = Object.keys(s.activityIds);
    if (ids.length > 1) dqa.twiceEncoded.push(at({ ids: ids.sort(), attendees: s.att }));
    if (s.dupRows) dqa.attendeeDuplicates.push(at({ people: s.dupPeople, rows: s.dupRows }));
    if (s.oddNames) dqa.nameIssues.push(at({ source: 'Attendance', rows: s.oddNames }));
  });
  var BDAY_PROBLEMS = { unreadable: 'Birthdate not readable', future: 'Birthdate after the KCIS pull date',
                        old: 'Older than 110', young: 'Household head younger than 15' };
  Object.keys(hhQuality).forEach(function (k) {
    var q = hhQuality[k];
    var at = function (extra) { return Object.assign({ province: q.province, municipality: q.municipality, barangay: q.barangay, actCode: q.actCode }, extra); };
    if (q.oddNames) dqa.nameIssues.push(at({ source: 'Household roster', rows: q.oddNames }));
    Object.keys(BDAY_PROBLEMS).forEach(function (p) {
      if (q[p]) dqa.birthdateIssues.push(at({ problem: BDAY_PROBLEMS[p], rows: q[p] }));
    });
  });
  // SM7 Annex F: encoded into the MIS within seven days after the activity.
  // Only records with an activity date can be aged; those without are counted.
  var lateUndated = 0;
  noAttendeesRecords.forEach(function (r) {
    var day = r.fieldDate ? isoDayNumber(formatDateVal(r.fieldDate)) : NaN;
    if (isNaN(day) || isNaN(evalDay)) { lateUndated++; return; }
    var days = evalDay - day;
    if (days >= 7) {
      dqa.lateAttendance.push({ province: r.province, municipality: r.municipality,
        barangay: r.level === 'Municipal' ? '' : r.barangay, actCode: r.actCode, fieldDate: formatDateVal(r.fieldDate), days: days });
    }
  });
  var byPlaceDqa = function (a, b) {
    return (a.province + '|' + a.municipality + '|' + a.barangay + '|' + a.actCode)
      .localeCompare(b.province + '|' + b.municipality + '|' + b.barangay + '|' + b.actCode);
  };
  Object.keys(dqa).forEach(function (k) { dqa[k].sort(byPlaceDqa); });
  dqa.lateUndated = lateUndated;
  dqa.muniRows = muniRows;

  var sexTally = { male: 0, female: 0, unset: 0 };
  Object.keys(rec).forEach(function (k) {
    if (k.split('|')[3] === 'BA1' || k.split('|')[2] === 'BA1') {
      sexTally.male += rec[k].m;
      sexTally.female += rec[k].f;
      sexTally.unset += rec[k].u;
    }
  });

  return {
    evalDate: evalDate,
    baseline: {
      barangays: base.totalBarangays,
      prioBarangays: base.totalPrioBarangays,
      municipalities: base.totalMunicipalities,
      barangaysNotMonitored: base.barangaysNotMonitored,
      activities: activities.length
    },
    region: {
      expected: totals.expected,
      complete: totals.complete,
      noAttendees: totals.noAttendees,
      notEncoded: totals.notEncoded,
      attendees: totals.attendees,
      backlog: totals.backlog,
      overallPct: totals.expected ? totals.complete / totals.expected : 0,
      stage1Expected: totalsStage1.expected,
      stage1Complete: totalsStage1.complete,
      stage1Backlog: totalsStage1.backlog,
      stage1Pct: totalsStage1.expected ? totalsStage1.complete / totalsStage1.expected : 0,
      stage2Expected: totalsStage2.expected,
      stage2Complete: totalsStage2.complete,
      stage2Backlog: totalsStage2.backlog,
      stage2Pct: totalsStage2.expected ? totalsStage2.complete / totalsStage2.expected : 0,
      ba1Pct: (ba1 && ba1.expected) ? ba1.complete / ba1.expected : 0,
      ba1Attendees: ba1 ? ba1.attendees : 0,
      ba1Male: sexTally.male,
      ba1Female: sexTally.female
    },
    noAttendeesRecords: noAttendeesRecords,
    // Names and birthdates. Never sent by apiOverview; apiHouseholdIssues hands
    // them out, and only to editors.
    hhIssues: { blank: hhIssues.blank, duplicates: hhIssues.duplicates, crossBarangay: hhIssues.crossBarangay },
    pipeline: pipeline,
    k2: k2,
    k2_ba2: k2_ba2,
    k2_ba3: k2_ba3,
    volunteers: {
      imported: volunteers.imported, rows: volunteers.rows, bodies: volunteers.bodies, rules: volunteers.rules,
      pipeline: volunteers.pipeline, byMuni: volunteers.byMuni, otherActivityRows: volunteers.otherActivityRows,
      notInBaseline: volunteers.notInBaseline, notInBaselineSamples: volunteers.notInBaselineSamples
    },
    barangayRows: barangayRows,
    municipalRows: municipalRows,
    byMuniActivity: byMuniActivity,
    health: {
      participantRows: participants ? participants.length : 0,
      householdRows: households ? households.length : 0,
      unmapped: unmapped,
      unmappedRows: unmapped,
      unmappedBlank: unmappedBlank,
      unmappedSamples: unmappedSamples,
      excludedNonCrip: nonCripExcluded,
      notInBaseline: notInBaseline + hhNotInBaseline,
      notInBaselineSamples: notInBaseSamples,
      outOfSequence: outOfSequence,
      outOfSequenceSamples: outOfSequenceSamples,
      outOfSequenceRows: outOfSequenceRows,
      householdFlags: hhFlags,
      householdRoster: hhIssues.summary,   // counts only; the named lists are in hhIssues
      volunteerIssues: volunteers.issues,  // places and counts only; null until the volunteer list is imported
      sexNotRecorded: sexTally.unset,
      dqa: dqa,                            // date, record, name, birthdate and timeliness checks; places and counts only
      activitiesWithoutField: activities.filter(function (a) {
        return FIELD_CONDUCT.indexOf(a.field) === -1;
      }).length
    }
  };
}

/** Validate an export's header row before a single number is computed. */
function checkHeaders(actual, expected) {
  var problems = [];
  var actualMap = {};
  for (var j = 0; j < actual.length; j++) {
    actualMap[normKey(actual[j])] = j;
  }
  for (var i = 0; i < expected.length; i++) {
    var expKey = normKey(expected[i]);
    if (actualMap[expKey] === undefined) {
      problems.push('Missing required column: "' + expected[i] + '"');
    }
  }
  return problems;
}

/**
 * Flatten a snapshot into history rows — one per municipality PER ACTIVITY,
 * plus a REGION line per activity.
 */
function snapshotToHistory(snap, dateISO) {
  var rows = [];
  snap.pipeline.forEach(function (p) {
    var k2Obj = p.code === 'BA1' ? snap.k2 : (p.code === 'BA2' ? snap.k2_ba2 : (p.code === 'BA3' ? snap.k2_ba3 : null));
    rows.push([dateISO, 'ALL', 'REGION', p.seq, p.code, p.expected, p.complete,
               p.noAttendees, p.notEncoded, p.attendees,
               k2Obj ? k2Obj.listed : '',
               k2Obj ? k2Obj.present : '', p.backlog]);
  });
  var hhByMuni = {};
  snap.barangayRows.forEach(function (r) {
    var mKey = r.province + '|' + r.municipality;
    if (!hhByMuni[mKey]) hhByMuni[mKey] = {};
    ['BA1', 'BA2', 'BA3'].forEach(function (code) {
      if (!hhByMuni[mKey][code]) hhByMuni[mKey][code] = { l: 0, p: 0 };
      var act = r.activities[code];
      if (act && act.hhListed) {
        hhByMuni[mKey][code].l += act.hhListed;
        hhByMuni[mKey][code].p += act.hhPresent;
      }
    });
  });
  snap.municipalRows.forEach(function (m) {
    var mKey = m.province + '|' + m.municipality;
    snap.pipeline.forEach(function (p) {
      var t = (snap.byMuniActivity[mKey] || snap.byMuniActivity[m.municipality] || {})[p.code] ||
              { expected: 0, complete: 0, noAttendees: 0, notEncoded: 0,
                attendees: 0, backlog: 0 };
      var hData = (hhByMuni[mKey] && hhByMuni[mKey][p.code]) || (hhByMuni[m.municipality] && hhByMuni[m.municipality][p.code]) || { l: 0, p: 0 };
      var isHh = p.code === 'BA1' || p.code === 'BA2' || p.code === 'BA3';
      rows.push([dateISO, m.province, m.municipality, p.seq, p.code, t.expected,
                 t.complete, t.noAttendees, t.notEncoded, t.attendees,
                 isHh ? (hData.l || '') : '', isHh ? (hData.p || '') : '',
                 t.backlog]);
    });
  });

  // 1st BA volunteers, as activity "CV_BREST" / "CV_SFMSC" with the same columns:
  // Expected = barangays, Fully encoded = Encoded, Attendees missing = Needs fixing,
  // Not encoded, Attendees encoded = volunteers counted, Backlog = 1st BA encoded
  // but this body not encoded. readHistory keeps these rows out of every
  // activity total unless one of them is asked for.
  var cv = snap.volunteers;
  if (cv && cv.imported) {
    var cvRow = function (prov, muni, code, x) {
      return [dateISO, prov, muni, '2', CV_HISTORY_PREFIX + code, x.expected, x.encoded, x.needsFix,
              x.notEncoded, x.members, '', '', x.pending];
    };
    (cv.bodies || CV_BODIES).forEach(function (b) {
      rows.push(cvRow('ALL', 'REGION', b.code, cv.pipeline[b.code]));
    });
    snap.municipalRows.forEach(function (m) {
      var mu = cv.byMuni[m.province + '|' + m.municipality];
      if (!mu) return;
      (cv.bodies || CV_BODIES).forEach(function (b) { rows.push(cvRow(m.province, m.municipality, b.code, mu[b.code])); });
    });
  }
  return rows;
}

function isVolunteerHistoryCode(code) { return String(code || '').indexOf(CV_HISTORY_PREFIX) === 0; }

// Node test harness only — Apps Script ignores this.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STATUS: STATUS, FIELD_CONDUCT: FIELD_CONDUCT, K2_TARGET: K2_TARGET,
    CP_HH_HEADERS: CP_HH_HEADERS, parseHhCount: parseHhCount, sequenceGaps: sequenceGaps,
    APPRAISAL_STATUSES: APPRAISAL_STATUSES, appraisalList: appraisalList, upsertAppraisalRows: upsertAppraisalRows,
    DEFAULT_TARGET_DEADLINES: DEFAULT_TARGET_DEADLINES,
    legacyTargets: legacyTargets, targetsFromRows: targetsFromRows, targetsToRows: targetsToRows,
    targetCodes: targetCodes, validateTargets: validateTargets,
    PARTICIPANT_HEADERS: PARTICIPANT_HEADERS, HOUSEHOLD_HEADERS: HOUSEHOLD_HEADERS,
    DEFAULT_ACTIVITIES: DEFAULT_ACTIVITIES,
    normKey: normKey, normText: normText, isTrue: isTrue, hasValue: hasValue,
    isZeroActivityId: isZeroActivityId,
    buildActivityIndex: buildActivityIndex, classify: classify,
    buildBaseline: buildBaseline, computeSnapshot: computeSnapshot,
    householdRosterIssues: householdRosterIssues, todayIso: todayIso, isoDayNumber: isoDayNumber,
    VOLUNTEER_HEADERS: VOLUNTEER_HEADERS, CV_BODIES: CV_BODIES, volunteerHeaders: volunteerHeaders,
    cvCommitteeKind: cvCommitteeKind, cvStatus: cvStatus, volunteerSnapshot: volunteerSnapshot,
    isVolunteerHistoryCode: isVolunteerHistoryCode,
    checkHeaders: checkHeaders, snapshotToHistory: snapshotToHistory
  };
}
