const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const ROOT = path.join(__dirname, '..');
function context() {
  const c = { console, TextDecoder, TextEncoder, Blob, Response, Date, DataView, Uint8Array, ArrayBuffer, setTimeout, clearTimeout,
    document: { addEventListener() {} }, navigator: {}, STATE: { computed: false, stage: 1 }, S: { overview: null }, LOADED: {}, IMPORT_ERRORS: [],
    n: v => v == null ? '—' : String(v), normSearch: v => String(v || '').trim().toLowerCase(),
    isMunicipalUser: () => false, homeKey: () => '', prefs: () => ({}), savePrefs() {}, today: () => '2026-11-04',
    $: () => null, toast() {}, go() {}, loadReferenceTables() {}, setTabsEnabled() {}, renderStatus() {}, renderImport() {}, updateTabBadges() {},
    BUILT_IN: { monitorVersion: 'test' }, PEOPLE: null };
  c.window = c; vm.createContext(c);
  ['vendor/monitor/Code.js', 'vendor/monitor/Store.js', 'vendor/monitor/WebApp.js', 'src/runtime.js', 'src/activity-tracker.js', 'src/mov-core.js', 'src/people.js', 'src/verify.js', 'src/saved.js', 'src/mov-ui.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), c, { filename: f }));
  c.zipText = async e => !e ? null : (e.method === 0 ? Buffer.from(e.data) : zlib.inflateRawSync(e.data)).toString('utf8');
  c.TABS.Baseline = { headers: ['Province', 'Municipality', 'Barangay', 'Monitored', 'Stage 2 Prioritized', 'lib_city.code_correspondence', 'lib_brgy.code_correspondence'],
    rows: [['Province A', 'Town A', 'Village A', 'Yes', 'Yes', '1000', '1001'], ['Province A', 'Town A', 'Village B', 'Yes', 'No', '1000', '1002'], ['Province B', 'Town B', 'Village C', 'Yes', 'Yes', '2000', '2001']] };
  c.TABS.Activities = { headers: ['Seq', 'Code', 'KCIS Name', 'Label', 'Level', 'Households', 'Field conduct', 'Stage', 'Prioritized'],
    rows: c.DEFAULT_ACTIVITIES.map(a => [a.seq, a.code, a.name, a.label, a.level, a.households ? 'Yes' : 'No', a.field, a.stage, a.prioOnly ? 'Yes' : 'No']) };
  return c;
}
function tracker(c, overrides = {}) {
  const values = { Region: 'Region', Province: 'Province A', 'City / Municipality': 'Town A', Barangay: 'Village A', Modality: 'PCRP',
    'CRIP/MC09 Activity': '1st BA', 'Activity Title': '1st BA', 'Actual Start': '2026-10-01', 'Actual End': '2026-10-02',
    'Participants - Male': 3, 'Participants - Female': 7, 'Participants - Unspecified': 0, 'Participants - Total': 10,
    'Person Volunteers - Male': 0, 'Person Volunteers - Female': 0, 'Person Volunteers - Unspecified': 0, 'Person Volunteers - Total': 0, ...overrides };
  return Array.from(c.ACTIVITY_TRACKER_HEADERS, h => values[h] ?? '');
}
function attachment(c, type = '29', overrides = {}) {
  const values = { 'Region Name': 'Region', 'Province Name': 'Province A', 'City Name': 'Town A', 'Barangay Name': 'Village A', Activity_ID: 2, Activity_Category: '1st BA',
    'Date Start': '2026-10-01', 'Date End': '2026-10-02', 'Display On (Tab)': 'attachments', Attachment_Type_ID: type,
    'File Type': 'application/pdf', 'File Name': c.MOV_TYPES[type] || 'PRVA Template', 'lib_city.code_correspondence': '1000', 'lib_brgy.code_correspondence': '1001',
    'File Path': 'attachments/file-' + type + '.pdf', ...overrides };
  return Array.from(c.MOV_HEADERS, h => values[h] ?? '');
}
function load(c, trs = [tracker(c)], movRows) {
  c.TABS.Raw_Activity_Tracker = { headers: Array.from(c.ACTIVITY_TRACKER_HEADERS), rows: trs };
  if (movRows !== undefined) c.TABS.Raw_MOVs = { headers: Array.from(c.MOV_HEADERS), rows: movRows };
  const snap = c.computeAll('2026-11-04'); c.STATE.computed = true; c.S.overview = c.apiOverview(''); return snap;
}
function group(s, code = 'BA1', barangay = 'Village A') { return s.movs.groups.find(g => g.actCode === code && g.barangay === barangay && g.municipality === 'Town A'); }
function status(s, code = 'BA1') { return s.barangayRows[0].activities[code].status; }
function plain(v) { return JSON.parse(JSON.stringify(v)); }
function csvFile(headers, rows) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const b = Buffer.from([headers, ...rows].map(r => r.map(q).join(',')).join('\n'));
  return { name: 'MOVs.csv', arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
}

test('MOV signature takes precedence over baseline; schema failure is atomic', async () => {
  const c = context(), baseline = c.TABS.Baseline;
  const found = await c.readDataFile(csvFile(c.MOV_HEADERS, [attachment(c)]));
  assert.equal(found[0].kind, 'movs'); assert.equal(c.KIND_INFO.movs.sheet, 'Raw_MOVs');
  await assert.rejects(c.readDataFile(csvFile(['Province Name', 'City Name', 'Barangay Name', 'File Path'], [['A', 'B', 'C', 'x']])), /missing required columns/);
  assert.equal(c.TABS.Baseline, baseline);
});
test('header reordering and PSGC matching preserve correct location and submission', () => {
  const c = context();
  c.TABS.Raw_MOVs = { headers: Array.from(c.MOV_HEADERS).reverse(), rows: [attachment(c, '29', { 'Barangay Name': 'wrong name' }).reverse()] };
  const s = load(c); assert.equal(group(s).submitted, 1); assert.equal(group(s).requirements.find(r => r.id === 'attendance').status, 'Submitted');
});
test('catalog is limited to Stage 1 and expands agreed shared PRVA requirements', () => {
  const c = context(); assert.equal(Object.values(c.MOV_CATALOG).flat().length, 40);
  assert.equal(c.MOV_CATALOG.BA2, undefined);
  for (const code of ['WALK', 'MAP', 'FGD', 'BPRVA']) assert.equal(c.MOV_CATALOG[code].filter(r => ['attendance', 'minutes'].includes(r.id)).length, 2);
  assert.ok(c.MOV_CATALOG.BPRVA.some(r => r.id === 'cause_effect'));
  assert.ok(!c.MOV_CATALOG.FGD.some(r => r.id === 'cause_effect'));
});
test('without MOV import attendance completion remains available in both stages', () => {
  const c = context(), a2 = c.DEFAULT_ACTIVITIES.find(a => a.code === 'BA2').name;
  const s = load(c, [tracker(c), tracker(c, { 'CRIP/MC09 Activity': a2 })]);
  assert.equal(status(s), 'Complete'); assert.equal(status(s, 'BA2'), 'Complete');
  assert.ok(s.region.stage1Pct > 0); assert.equal(s.movs.imported, false);
});
test('all clear BA1 requirements plus attendance complete the activity and reconcile tallies', () => {
  const c = context(), s = load(c, [tracker(c)], ['29', '30', '31', '37'].map(t => attachment(c, t)));
  assert.equal(status(s), 'Complete'); assert.equal(group(s).ready, true);
  const t = s.pipeline.find(p => p.code === 'BA1');
  assert.equal(t.expected, t.complete + t.noAttendees + t.notEncoded);
  const cell = c.apiMatrix().rows[0].cells.BA1; assert.equal(cell.attendanceEncoded, 1); assert.equal(cell.movsReady, 1); assert.equal(cell.encoded, 1);
});
test('due missing MOVs contribute only to MOV backlog', () => {
  const c = context(), s = load(c, [tracker(c)], [attachment(c)]);
  assert.equal(status(s), 'Complete'); assert.equal(group(s).lacking, true);
  assert.equal(s.pipeline.find(p => p.code === 'BA1').backlog, 0);
  assert.equal(s.pipeline.find(p => p.code === 'BA1').movBacklog, 1);
  assert.ok(!c.dqaFindings(s.health).some(f => /^mov_/.test(f.check)));
});

test('encoding, attendance and MOV readiness are independent and repeats count once', () => {
  const c = context(), evidence = ['29','30','31','37'].map(t => attachment(c,t));
  const count = s => s.pipeline.find(p => p.code === 'BA1');
  let s = load(c,[],evidence);
  assert.equal(count(s).encoded,0); assert.equal(count(s).complete,0); assert.equal(count(s).movsReady,1);
  s = load(c,[tracker(c,{'Participants - Total':0,'Participants - Male':0,'Participants - Female':0})],evidence);
  assert.equal(count(s).encoded,1); assert.equal(count(s).complete,0); assert.equal(count(s).movsReady,1);
  s = load(c,[tracker(c),tracker(c)],evidence.concat(evidence));
  assert.equal(count(s).encoded,1); assert.equal(count(s).complete,1); assert.equal(count(s).movsReady,1);
});

test('import and removal of MOVs never change attendance completion or backlog', () => {
  const c = context(), trs = [tracker(c),tracker(c, {Barangay:'Village B','Participants - Total':0,'Participants - Male':0,'Participants - Female':0})];
  const attendance = s => plain({region:s.region, rows:s.barangayRows.map(b=>({owed:b.owed,todo:b.todo,status:b.activities.BA1.status}))});
  const before = attendance(load(c,trs));
  function attendanceOnly(v) { delete v.region.movsReady; delete v.region.movBacklog; delete v.region.stage1MOVsReady; delete v.region.stage1MOVBacklog; return v; }
  const baseline = attendanceOnly(before);
  let s = load(c,trs,[attachment(c)]);
  assert.deepEqual(attendanceOnly(attendance(s)),baseline);
  assert.deepEqual(attendanceOnly(attendance(load(c,trs,[]))),baseline);
});

test('activity bars display independent assessment states and zero targets', () => {
  const c = context(), app = fs.readFileSync(path.join(ROOT,'src/app.js'),'utf8');
  c.attr = String;
  vm.runInContext(app.slice(app.indexOf('function activityProgressSum('), app.indexOf('function quotaMiniProgressBar(')),c);
  load(c,[tracker(c)]); c.LOADED.activityTracker = {};
  let html = c.activityProgressBars({expected:2,encoded:2,complete:1,movsReady:0},1);
  assert.ok(html.includes('2/2 · 100%')); assert.ok(html.includes('1/2 · 50%')); assert.ok(html.includes('Not assessed'));
  c.SNAP.movs.imported=true;
  html=c.activityProgressBars({expected:2,encoded:0,complete:0,movsReady:1},1);
  assert.ok(html.includes('MOVs ready: 1/2 · 50%'));
  assert.ok(c.activityProgressBars({expected:0},1).includes('0/0 · N/A'));
  assert.ok(c.activityProgressBars({expected:2},2).includes('Not assessed for this stage'));
  delete c.LOADED.activityTracker;
  assert.ok(c.activityProgressBars({expected:2,movsReady:1},1).includes('Encoded: Not assessed'));
});
test('future or missing actual end dates suppress MOV backlog without affecting attendance completion', () => {
  const c = context();
  for (const end of ['', '2026-12-01']) {
    const s = load(c, [tracker(c, { 'Actual End': end })], []);
    assert.equal(status(s), 'Complete'); assert.equal(group(s).due, false);
    assert.equal(group(s).lacking, false);
  }
});
test('empty attachment rows and repeats never inflate coverage', () => {
  const c = context(), a = attachment(c), empty = attachment(c, '', { 'File Path': '', 'File Name': '', 'File Type': '' });
  const s = load(c, [tracker(c)], [a, a.slice(), a.slice(), empty]);
  assert.equal(group(s).submitted, 1);
  assert.deepEqual(plain(s.movs.stats), { records: 4, attachmentRows: 3, emptyRows: 1, distinctPaths: 1, repeatedPaths: 1, repeatedOccurrences: 2 });
});
test('photos and training reports stay visible without uncertain requirement matches', () => {
  const c = context(), s = load(c, [tracker(c)], [attachment(c, '20', { 'File Name': 'Geotagged Photo' }), attachment(c, '14', { 'File Name': 'Activity Training Report' })]);
  assert.equal(group(s).submitted, 0); assert.equal(s.movs.attachments.length, 2);
  assert.ok(!group(s).requirements.some(r => r.status === 'Needs review'));
});
test('clear types retain credit when dates differ; conflicting IDs are credited as candidates', () => {
  const c = context(), s = load(c, [tracker(c)], [attachment(c, '29', { 'Date Start': '' }), attachment(c, '30', { Activity_ID: 16 })]);
  const minutes = group(s).requirements.find(r => r.id === 'minutes');
  assert.equal(group(s).requirements.find(r => r.id === 'attendance').status, 'Submitted');
  assert.equal(minutes.status, 'Submitted'); assert.equal(minutes.candidateKeys.length, 1);
  assert.ok(!s.movs.groups.some(g => g.requirements.some(r => r.status === 'Needs review')));
});
test('candidate matches credit every requirement a bundled document covers and survive reordering', () => {
  const c = context(), trs = [tracker(c, { 'CRIP/MC09 Activity': 'Municipal Resilience Planning and Prioritization of Programs, Projects, and Activities', Barangay: '' })];
  const a = attachment(c, '42', { Activity_ID: 4, Activity_Category: trs[0][5], 'Barangay Name': '', 'lib_brgy.code_correspondence': '' });
  let s = load(c, trs, [a]), g = group(s, 'MRP', '');
  assert.equal(g.requirements.find(r => r.id === 'ppas').status, 'Submitted');
  assert.equal(g.requirements.find(r => r.id === 'mrp').status, 'Submitted');
  s = load(c, trs, [a, a.slice()].reverse()); assert.equal(group(s, 'MRP', '').requirements.find(r => r.id === 'ppas').status, 'Submitted');
  s = load(c, trs, []); assert.notEqual(group(s, 'MRP', '').requirements.find(r => r.id === 'ppas').status, 'Submitted');
});
test('candidates outside the monitored baseline or supplementary files are never credited', () => {
  const c = context();
  let s = load(c, [tracker(c)], [attachment(c, '30', { Activity_ID: 16, 'Province Name': 'Elsewhere', 'City Name': 'Nowhere', 'Barangay Name': 'Village A', 'lib_city.code_correspondence': '9', 'lib_brgy.code_correspondence': '9' })]);
  assert.notEqual(group(s).requirements.find(r => r.id === 'minutes').status, 'Submitted');
  s = load(c, [tracker(c)], [attachment(c, '20', { 'File Name': 'Geotagged Photo', 'File Path': 'attachments/minutes-photo.pdf' })]);
  assert.equal(group(s).submitted, 0);
});
test('Stage 2 Prioritized decides the Year 2/3 requirement; BDC action plans cover non-prioritized barangays', () => {
  const c = context(), s = load(c, [], []), g = group(s, 'BDC', 'Village B'), r = g.requirements.find(r => r.conditional);
  assert.equal(g.pipelineApplicable, false); assert.ok(g.requirements.some(r => r.id === 'action_plan'));
  assert.equal(r.status, 'Not applicable');
  const prio = group(s, 'BDC', 'Village A').requirements.find(r => r.conditional);
  assert.equal(prio.status, 'Pending activity');
  assert.ok(!s.movs.groups.some(g => g.requirements.some(r => r.status === 'Needs applicability')));
  assert.equal(c.movSetApplicability, undefined); assert.equal(c.movApproveAssignment, undefined);
});
test('appraisal is lacking after MRP ends, blocks MOV readiness, and is not a fabricated pipeline activity', () => {
  const c = context(), name = c.DEFAULT_ACTIVITIES.find(a => a.code === 'MRP').name;
  const s = load(c, [tracker(c, { 'CRIP/MC09 Activity': name, Barangay: '' })], []);
  const g = group(s, 'APPRAISAL', ''); assert.equal(g.requirements.filter(r => r.status === 'Lacking').length, 4);
  assert.equal(s.movs.byMuni['province a|town a'].movsReady, false);
  assert.ok(!s.pipeline.some(p => p.code === 'APPRAISAL'));
  const future = load(c, [tracker(c, { 'CRIP/MC09 Activity': name, Barangay: '', 'Actual End': '2026-12-01' })], []);
  assert.equal(group(future, 'APPRAISAL', '').lacking, false);
});
test('MOV-only inspection and scoped exports do not fabricate conduct dates or expose other towns', () => {
  const c = context(); c.TABS.Raw_MOVs = { headers: Array.from(c.MOV_HEADERS), rows: [attachment(c)] };
  const data = c.movGetData(); assert.equal(data.trackerImported, false); assert.ok(!data.groups.some(g => g.due));
  c.isMunicipalUser = () => true; c.homeKey = () => 'Province A|Town A';
  const rows = c.movExportRows(data, c.movInScope); assert.ok(rows.slice(1).every(r => r[1] === 'Town A'));
});
test('uploaded evidence for every requirement makes the municipality MOV-ready, including the prioritized BDC resolution', () => {
  const c = context(); c.TABS.Baseline.rows = c.TABS.Baseline.rows.slice(0,1);
  const ids = Object.fromEntries(Object.entries(c.MOV_ACTIVITY_IDS).map(([id,code]) => [code,id]));
  const acts = c.DEFAULT_ACTIVITIES.filter(a => a.stage === 1);
  const trs = acts.map(a => tracker(c, { 'CRIP/MC09 Activity': a.name, Barangay: a.level === 'Municipal' ? '' : 'Village A' }));
  const movRows = [];
  Object.entries(c.MOV_CATALOG).forEach(([code, requirements]) => requirements.forEach(r => {
    const appraisal = code === 'APPRAISAL', a = appraisal ? null : acts.find(a => a.code === code), municipal = appraisal || a.level === 'Municipal';
    // Typed requirements get their own type; untyped ones a related type or a filename matching their pattern.
    const type = r.types[0] || r.candidateTypes[0] || '40';
    movRows.push(attachment(c, type, { Activity_ID: appraisal ? '' : ids[code], Activity_Category: appraisal ? 'RPMO Appraisal of Municipal Resilience Plan' : a.name,
      'Barangay Name': municipal ? '' : 'Village A', 'lib_brgy.code_correspondence': municipal ? '' : '1001', 'File Path': 'attachments/' + code + '-' + r.id + '.pdf' }));
  }));
  let s = load(c,trs,movRows);
  assert.ok(s.pipeline.filter(p => p.stage === 1).every(p => p.complete === p.expected));
  for (const g of s.movs.groups) assert.equal(g.ready, true, g.actCode);
  assert.equal(group(s, 'BDC').requirements.find(r => r.conditional).status, 'Submitted');
  assert.equal(s.movs.byMuni['province a|town a'].appraisalReady, true);
  assert.equal(s.movs.movsReady, true);
  // Without the Year 2/3 resolution the BDC checklist is incomplete, as long as the barangay is prioritized.
  const noResolution = movRows.filter(r => !String(r[c.MOV_HEADERS.indexOf('File Path')]).includes('BDC-committees'));
  s = load(c,trs,noResolution); assert.equal(group(s, 'BDC').ready, false); assert.equal(s.movs.movsReady, false);
  c.TABS.Baseline.rows[0][4] = 'No';
  s = load(c,trs,noResolution); assert.equal(group(s, 'BDC').requirements.find(r => r.conditional).status, 'Not applicable'); assert.equal(group(s, 'BDC').ready, true);
  s = load(c,[],movRows); assert.equal(s.region.stage1Complete,0);
});
test('municipal and province API rollups retain independent progress counts', () => {
  const c = context(); let s = load(c,[tracker(c)],[]);
  const result = c.apiMunicipality('Town A','Province A');
  assert.equal(result.summary.find(p => p.code === 'BA1').encoded,1);
  assert.equal(result.summary.find(p => p.code === 'BA1').movBacklog,1);
  const province = c.apiMunicipality('REGION','Province A');
  assert.equal(province.summary.find(p => p.code === 'BA1').movBacklog,1);
  assert.ok(province.municipalities.find(m => m.municipality === 'Town A').movBacklog>0);
  delete c.TABS.Raw_MOVs; s = load(c,[tracker(c)]);
  assert.equal(c.apiMunicipality('Town A','Province A').summary.find(p=>p.code==='BA1').pct,0.5);
  assert.equal(s.pipeline.find(p=>p.code==='BA1').attendanceEncoded,1);
});
test('version 3 saves keep MOV data and ignore old review decisions; version 2 opens unassessed and corrupt imports are atomic', async () => {
  const c = context(); load(c, [tracker(c)], [attachment(c)]);
  c.gunzipBuf = async b => Buffer.from(b).toString(); c.savedPutTags = () => Promise.resolve(); c.savedApplyLedger = () => {}; c.renderSavedBar = () => {}; c.computeAndShow = () => {};
  const file = data => { const b = Buffer.from(JSON.stringify(data)); return { name: 'test.pcrp', arrayBuffer: async () => b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) }; };
  const r = group(c.SNAP, 'BDC').requirements.find(r => r.conditional);
  // A session saved before the review was removed still carries its decisions.
  const oldDecisions = { referenceVersion: c.MOV_REFERENCE_VERSION, assignments: {}, applicability: { [r.key]: { state: 'notApplicable', reviewer: 'QA', note: 'Year 1' } } };
  const data = { version: 3, format: c.SAVE_FORMAT, sourceType: c.SAVE_SOURCE, tables: { Raw_MOVs: c.TABS.Raw_MOVs, Raw_Activity_Tracker: c.TABS.Raw_Activity_Tracker }, movState: oldDecisions };
  await c.savedFromFile(file(data)); assert.equal(c.TABS.Raw_MOVs.rows.length, 1);
  c.STATE.computed = false; c.MOV_CACHE = null;
  assert.equal(c.movGetData().byKey[r.groupKey].requirements.find(x => x.key === r.key).status, 'Pending activity');
  const before = c.TABS.Raw_MOVs;
  await assert.rejects(c.savedFromFile(file({ ...data, tables: { Raw_MOVs: { headers: [], rows: [] } } })), /MOV attachments/); assert.equal(c.TABS.Raw_MOVs, before);
  await c.savedFromFile(file({ version: 2, format: c.SAVE_FORMAT, sourceType: c.SAVE_SOURCE, tables: { Raw_Activity_Tracker: data.tables.Raw_Activity_Tracker } }));
  assert.equal(c.TABS.Raw_MOVs, undefined);
});
test('real export controls and baseline preservation', { skip: !process.env.KCIS_MOV_EXPORT }, async () => {
  const c = context(), bytes = fs.readFileSync(process.env.KCIS_MOV_EXPORT), before = c.TABS.Baseline;
  const found = await c.readDataFile({ name: 'MOVs.xlsx', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) });
  assert.equal(found[0].kind, 'movs'); assert.equal(found[0].table.rows.length, 13405); assert.equal(c.TABS.Baseline, before);
  const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reference.json'))); c.TABS.Baseline = ref.Baseline; c.TABS.Activities = ref.Activities;
  c.TABS.Raw_MOVs = found[0].table;
  const bl = c.readBaseline(), base = c.buildBaseline(bl.rows,bl.monitored), index = c.buildActivityIndex(c.readActivities());
  const data = c.movBuild(base,index,{},found[0].table,'2026-11-04',false);
  assert.deepEqual(plain(data.stats), { records: 13405, attachmentRows: 11072, emptyRows: 2333, distinctPaths: 10610, repeatedPaths: 447, repeatedOccurrences: 462 });
});
test('reviewer notes are not filename patterns; a bad pattern matches nothing instead of throwing', () => {
  const c = context(), concept = c.MOV_CATALOG.MRP.find(r => r.id === 'concept');
  assert.equal(concept.hint, ''); assert.match(concept.note, /90 days/);
  assert.equal(c.movHintMatches('mwfp|work.*financial', 'Town A MWFP 2026.pdf'), true);
  assert.equal(c.movHintMatches('(unclosed', 'anything.pdf'), false);
  assert.equal(c.movHintMatches('', 'anything.pdf'), false);
});
