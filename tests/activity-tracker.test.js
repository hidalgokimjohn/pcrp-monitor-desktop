const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const ROOT = path.join(__dirname, '..');

function context() {
  const c = { console, TextDecoder, TextEncoder, Blob, Response, DataView, Uint8Array, ArrayBuffer, Date, setTimeout, clearTimeout,
    document: { addEventListener() {} }, n: v => v == null ? '—' : String(v),
    prefs: () => ({}), savePrefs() {}, STATE: { computed: false }, IMPORT_ERRORS: [], LOADED: {},
    S: { overview: null }, PEOPLE: null, BUILT_IN: { monitorVersion: 'test' },
    setTabsEnabled() {}, renderStatus() {}, renderImport() {}, updateTabBadges() {},
    $: () => null, go() {}, toast() {}, loadReferenceTables() {}, homeLabel: () => 'Test', today: () => '2026-11-04' };
  c.window = c;
  vm.createContext(c);
  ['vendor/monitor/Code.js', 'vendor/monitor/Store.js', 'vendor/monitor/WebApp.js', 'src/runtime.js', 'src/activity-tracker.js', 'src/verify.js', 'src/saved.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), c, { filename: f }));
  c.zipText = async e => !e ? null : (e.method === 0 ? Buffer.from(e.data) : zlib.inflateRawSync(e.data)).toString('utf8');
  c.TABS.Baseline = { headers: ['Province', 'Municipality', 'Barangay', 'Monitored', 'Stage 2 Prioritized'],
    rows: [['Province A', 'Town A', 'Village A', 'Yes', 'Yes'], ['Province A', 'Town A', 'Buena Gracia', 'Yes', 'Yes'], ['Province B', 'Town B', 'Village B', 'Yes', 'Yes']] };
  c.TABS.Activities = { headers: ['Seq', 'Code', 'KCIS Name', 'Label', 'Level', 'Households', 'Field conduct', 'Stage', 'Prioritized'],
    rows: c.DEFAULT_ACTIVITIES.map(a => [a.seq, a.code, a.name, a.label, a.level, a.households ? 'Yes' : 'No', a.field, a.stage, a.prioOnly ? 'Yes' : 'No']) };
  return c;
}
function record(c, overrides = {}) {
  const v = { Region: 'Region', Province: 'Province A', 'City / Municipality': 'Town A', Barangay: 'Village A', Modality: 'PCRP',
    'CRIP/MC09 Activity': '1st BA', 'Activity Title': 'Custom title', 'Target Start': '2026-10-01', 'Target End': '2026-10-01',
    'Actual Start': '2026-10-02', 'Actual End': '2026-10-02', 'Participants - Male': 2, 'Participants - Female': 7,
    'Participants - Unspecified': 1, 'Participants - Total': 10, 'Person Volunteers - Male': 1, 'Person Volunteers - Female': 2,
    'Person Volunteers - Unspecified': 0, 'Person Volunteers - Total': 3, 'BA Participation - Total HH in Barangay': 10,
    'BA Participation - Total HH Represented': 7, 'BA Participation - % HH Participation': 70, ...overrides };
  return Array.from(c.ACTIVITY_TRACKER_HEADERS, h => v[h] ?? '');
}
function load(c, rows) {
  c.TABS.Raw_Activity_Tracker = { headers: Array.from(c.ACTIVITY_TRACKER_HEADERS), rows };
  const s = c.computeAll('2026-11-04');
  c.S.overview = c.apiOverview('');
  return s;
}
function plain(v) { return JSON.parse(JSON.stringify(v)); }
function csvFile(c, headers, rows) {
  const quote = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const text = [headers, ...rows].map(r => r.map(quote).join(',')).join('\n');
  const b = Buffer.from(text);
  return { name: 'Tracker.csv', arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
}

test('header mapping survives column reordering; old positional IDs and custom titles are not used', () => {
  const c = context(), row = record(c, { 'BA Participation - 4Ps HH Represented': 0, 'Activity Title': '2nd BA' });
  c.TABS.Raw_Activity_Tracker = { headers: Array.from(c.ACTIVITY_TRACKER_HEADERS).reverse(), rows: [row.slice().reverse()] };
  const s = c.computeAll('2026-11-04');
  assert.equal(s.attendanceRows[0].act, 'BA1');
  assert.equal(s.attendanceRows[0].participants.total, 10);
  assert.equal(s.health.excludedNonCrip, 0);
});
test('repeated rows stay in attendance totals but household denominators are selected once', () => {
  const c = context(), r = record(c), s = load(c, [r, r.slice(), record(c, { 'BA Participation - Total HH Represented': 8, 'BA Participation - % HH Participation': 80 })]);
  assert.equal(s.attendanceRows[0].participants.total, 30);
  assert.equal(s.attendanceRows[0].personVolunteers.total, 9);
  assert.equal(s.k2.listed, 10); assert.equal(s.k2.present, 8);
  assert.equal(s.repeatedActivities.length, 1);
  assert.deepEqual(plain(s.repeatedActivities[0].kinds), ['Identical records', 'Conflicting counts']);
  assert.equal(s.repeatedActivities[0].sourceRows.length, 3);
  assert.ok(c.dqaFindings(s.health).some(f => f.check === 'activityrepeat' && f.count === 3));
});
test('repeated activities on distinct actual dates are flagged as different sittings', () => {
  const c = context(), s = load(c, [record(c), record(c, { 'Actual Start': '2026-10-03', 'Actual End': '2026-10-03' })]);
  assert.ok(s.repeatedActivities[0].kinds.includes('Different dates'));
  assert.equal(s.attendanceRows[0].participants.total, 20);
});
test('ignored BA List columns do not change snapshots or import retention', async () => {
  const c = context(), hs = [...c.ACTIVITY_TRACKER_HEADERS, 'BA Participation - BA List Total', 'BA Participation - BA List Present'];
  const one = await c.readDataFile(csvFile(c, hs, [[...record(c), 999, 888]]));
  const two = await c.readDataFile(csvFile(c, hs, [[...record(c), -1, 'bad']]));
  assert.deepEqual(plain(one[0].table), plain(two[0].table));
  assert.equal(one[0].table.headers.length, 28);
  await c.readDataFile(csvFile(c, [...hs, 'BA Participation - BA List Total'], [[...record(c), 'invalid', -123, 'duplicate ignored header']]));
});
test('missing and zero household counts differ; incomplete pairs do not report quorum', () => {
  const c = context(), missing = load(c, [record(c, { 'BA Participation - Total HH Represented': '', 'BA Participation - % HH Participation': 0 })]);
  const b = missing.barangayRows.find(b => b.barangay === 'Village A').activities.BA1;
  assert.equal(b.hhIncomplete, true); assert.equal(b.hhRate, null); assert.equal(missing.k2.reporting, 0);
  const zero = load(c, [record(c, { 'BA Participation - Total HH Represented': 0, 'BA Participation - % HH Participation': 0 })]);
  assert.equal(zero.k2.reporting, 1); assert.equal(zero.k2.rate, 0);
});
test('household selection uses completeness then total then represented, keeping selected breakdown', () => {
  const c = context(), s = load(c, [record(c, { 'BA Participation - Total HH in Barangay': 100, 'BA Participation - Total HH Represented': '', 'BA Participation - 4Ps HH Represented': 99 }),
    record(c, { 'BA Participation - 4Ps HH Represented': 2 }),
    record(c, { 'BA Participation - Total HH Represented': 8, 'BA Participation - 4Ps HH Represented': 3 })]);
  const b = s.barangayRows.find(b => b.barangay === 'Village A').activities.BA1;
  assert.equal(b.hhTotal, 10); assert.equal(b.hhPresent, 8); assert.equal(b.hhDetail.hh4Ps, 3);
});
test('arithmetic, invalid counts and KCIS percentage discrepancies are visible in DQA', () => {
  const c = context(), s = load(c, [record(c, { 'Participants - Male': -2, 'Person Volunteers - Total': 9, 'BA Participation - % HH Participation': 90, 'BA Participation - 4Ps HH Represented': 1.2 })]);
  assert.ok(s.trackerIssues.some(x => x.problem.includes('invalid nonnegative')));
  assert.ok(s.trackerIssues.some(x => x.problem.includes('differs from total')));
  assert.ok(s.trackerIssues.some(x => x.problem.includes('percentage differs')));
  assert.ok(s.trackerIssues.some(x => x.problem.includes('Invalid household')));
  assert.ok(c.dqaFindings(s.health).some(x => x.check === 'summaryfigures'));
});
test('municipal blank barangays are valid, barangay blanks are flagged, and BuenaGracia matches', () => {
  const c = context(), s = load(c, [record(c, { Barangay: '', 'CRIP/MC09 Activity': 'Organizational Meeting of the MRest' }),
    record(c, { Barangay: ' BuenaGracia ' }), record(c, { Barangay: '' })]);
  assert.equal(s.attendanceRows.length, 2);
  assert.ok(s.attendanceRows.some(r => r.barangay === 'Buena Gracia'));
  assert.equal(s.trackerIssues.filter(x => x.problem.includes('Barangay is missing')).length, 1);
});
test('actual dates drive aging; target dates and missing conduct dates stay separate', () => {
  const c = context(), s = load(c, [record(c, { 'Participants - Male': 0, 'Participants - Female': 0, 'Participants - Unspecified': 0, 'Participants - Total': 0,
    'Target End': '2026-11-03', 'Actual End': '2026-10-02' }), record(c, { Barangay: 'Buena Gracia', 'Actual End': '' })]);
  assert.ok(s.health.dqa.lateAttendance.some(r => r.barangay === 'Village A' && r.days === 33));
  assert.ok(s.trackerIssues.some(x => x.problem.includes('missing actual')));
  assert.equal(s.attendanceRows[0].targetEnd, '2026-11-03');
});
test('invalid calendar dates are flagged even when they resemble ISO dates', () => {
  const c = context(), s = load(c, [record(c, { 'Target Start': '2026-02-30', 'Actual End': '2026-13-01' })]);
  assert.ok(s.trackerIssues.some(x => x.problem === 'Unreadable targetStart date'));
  assert.ok(s.trackerIssues.some(x => x.problem === 'Unreadable dateEnd date'));
});
test('each assembly keeps its own quorum numerator and denominator', () => {
  const c = context();
  const a2 = c.DEFAULT_ACTIVITIES.find(a => a.code === 'BA2').name, a3 = c.DEFAULT_ACTIVITIES.find(a => a.code === 'BA3').name;
  const s = load(c, [record(c), record(c, { 'CRIP/MC09 Activity': a2, 'BA Participation - Total HH Represented': 8 }), record(c, { 'CRIP/MC09 Activity': a3, 'BA Participation - Total HH Represented': 9 })]);
  assert.equal(s.k2.rate, 0.7); assert.equal(s.k2_ba2.rate, 0.8); assert.equal(s.k2_ba3.rate, 0.9);
});
test('verification has four summary figures, survives reordering, and resets changed figures', () => {
  const c = context(), a = record(c), b = record(c, { Barangay: 'Buena Gracia' });
  load(c, [a, b]);
  let rec = c.vfRecords('att').find(r => r.barangay === 'Village A');
  assert.equal(rec.rows.length, 4); assert.ok(rec.key.startsWith('att|summary-v2|'));
  c.VERIFY.tags.records[rec.key] = { rows: Object.fromEntries(rec.rows.map(r => [r.rk, { s: 'match', value: r.value }])) };
  load(c, [b, a]); rec = c.vfRecords('att').find(r => r.key === rec.key);
  assert.equal(c.vfStats(rec).checked, 4);
  load(c, [b, record(c, { 'Participants - Total': 11, 'Participants - Male': 3 })]);
  rec = c.vfRecords('att').find(r => r.key === rec.key);
  assert.equal(c.vfStats(rec).checked, 2);
  assert.ok(c.VERIFY.tags.records[rec.key].staleRows.total);
});
test('legacy imports and incomplete Tracker imports fail without replacing active data', async () => {
  const c = context(); load(c, [record(c)]); const before = c.TABS.Raw_Activity_Tracker;
  await assert.rejects(c.readDataFile(csvFile(c, c.PARTICIPANT_HEADERS, [])), /legacy.*Activity Tracker/);
  await assert.rejects(c.readDataFile(csvFile(c, c.HH_COUNT_HEADERS, [])), /legacy.*Activity Tracker/);
  await assert.rejects(c.readDataFile(csvFile(c, ['CRIP/MC09 Activity', 'Participants - Total', 'Barangay'], [['1st BA', 1, 'Village A']])), /missing required columns/);
  assert.equal(c.TABS.Raw_Activity_Tracker, before);
});
test('invalid source figures cannot be marked verified as a healthy zero', () => {
  const c = context(); const s = load(c, [record(c, { Province: '', 'Participants - Male': -1 })]);
  assert.equal(s.trackerIssues[0].province, 'Province A', 'DQA uses the same recovered location as the summary');
  const rec = c.vfRecords('att')[0];
  assert.equal(rec.rows.find(r => r.rk === 'male').value, null);
  c.vfVerifier = () => 'QA'; c.vfSetRow(rec.key, 'male', 'match');
  assert.equal(c.VERIFY.tags.records[rec.key], undefined);
});
test('physical XLSX row numbers remain correct across omitted blank rows', () => {
  const c = context(), matrix = c.parseSheetXml('<sheetData><row r="3"><c r="A3" t="inlineStr"><is><t>One</t></is></c><c r="B3" t="inlineStr"><is><t>Two</t></is></c><c r="C3" t="inlineStr"><is><t>Three</t></is></c></row><row r="8"><c r="A8"><v>1</v></c></row></sheetData>', []);
  assert.deepEqual(plain(c.toTable(matrix).rowNumbers), [8]);
});
test('household/attendance discrepancies are review findings rather than arithmetic errors', () => {
  const c = context(), s = load(c, [record(c, { 'BA Participation - Total HH in Barangay': 30, 'BA Participation - Total HH Represented': 22, 'BA Participation - % HH Participation': 73.33 })]);
  const f = c.dqaFindings(s.health).find(f => f.check === 'hhattendance'); assert.ok(f);
  const col = (label, html, csv) => ({ label, html, csv });
  const check = c.trackerDqaChecks({ health: s.health }, col, {}, {}, {}, {}, r => [r]).find(x => x.id === 'hhattendance');
  assert.equal(check.severity, 'verify');
});
test('legacy session rejection is atomic, and new Tracker / volunteer-only saves round-trip', async () => {
  const c = context(); load(c, [record(c)]); let captured;
  c.gunzipBuf = async b => Buffer.from(b).toString();
  c.gzipText = async text => { captured = JSON.parse(text); return new Blob([text]); };
  c.saveBlob = () => {}; c.setProgress = () => {}; c.savedPutTags = () => Promise.resolve(); c.savedApplyLedger = () => {};
  c.renderSavedBar = () => {}; c.computeAndShow = () => {};
  c.LOADED.activityTracker = { file: 'Tracker.xlsx', rows: 1 };
  c.savedToFile(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(captured.version, 3); assert.ok(captured.tables.Raw_Activity_Tracker);
  const file = data => { const b = Buffer.from(JSON.stringify(data)); return { name: 'Session.pcrp', arrayBuffer: async () => b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) }; };
  const before = c.TABS.Raw_Activity_Tracker;
  await assert.rejects(c.savedFromFile(file({ format: c.SAVE_FORMAT, version: 1, tables: { Raw_Participants: {} } })), /legacy/);
  assert.equal(c.TABS.Raw_Activity_Tracker, before);
  await c.savedFromFile(file(captured)); assert.equal(c.TABS.Raw_Activity_Tracker.rows.length, 1);
  const h = Array.from(c.VOLUNTEER_HEADERS);
  await c.savedFromFile(file({ format: c.SAVE_FORMAT, version: 2, sourceType: c.SAVE_SOURCE, tables: { Raw_Volunteers: { headers: h, rows: [] } } }));
  assert.equal(c.TABS.Raw_Activity_Tracker, undefined); assert.ok(c.TABS.Raw_Volunteers); assert.equal(c.STATE.computed, false);
});
test('legacy cache skips old tables and findings but preserves volunteer data and tags', () => {
  const c = context(); c.renderSavedBar = () => {}; c.savedApplyLedger = () => {};
  c.SAVED.ledger = { old: {} }; const tags = c.VERIFY.tags;
  c.savedLoadCurrent({ tables: { Raw_Participants: { rows: [[]] }, Raw_HH_Participation: { rows: [[]] }, Raw_Volunteers: { headers: [], rows: [] } }, loaded: { participants: {}, households: {}, volunteers: {} } });
  assert.equal(c.TABS.Raw_Participants, undefined); assert.equal(c.TABS.Raw_HH_Participation, undefined);
  assert.ok(c.TABS.Raw_Volunteers); assert.equal(c.VERIFY.tags, tags); assert.deepEqual(plain(c.SAVED.ledger), {});
});
test('optional real KCIS export matches row and raw count controls', { skip: !process.env.KCIS_ACTIVITY_TRACKER }, async () => {
  const c = context(), b = fs.readFileSync(process.env.KCIS_ACTIVITY_TRACKER);
  const found = await c.readDataFile({ name: 'Activity Tracker.xlsx', arrayBuffer: async () => b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) });
  assert.equal(found.length, 1); assert.equal(found[0].kind, 'activityTracker'); assert.equal(found[0].table.rows.length, 3432);
  const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reference.json')));
  c.TABS.Baseline = ref.Baseline; c.TABS.Activities = ref.Activities; c.TABS.Raw_Activity_Tracker = found[0].table;
  const s = c.computeAll('2026-11-04');
  assert.equal(s.importTotals.participants, 136701); assert.equal(s.importTotals.personVolunteers, 7015);
  assert.equal(s.health.unmapped, 0);
});
test('household counts follow the controlled activity alone; a 4th BA never lands in the 1st BA', () => {
  const c = context(), s = load(c, [
    record(c),                                                                            // 1st BA: 7 of 10
    record(c, { 'CRIP/MC09 Activity': '4th Barangay Assembly', 'Activity Title': '1st Barangay Assembly',
      'BA Participation - Total HH in Barangay': 100, 'BA Participation - Total HH Represented': 100, 'BA Participation - % HH Participation': 100 }),
    record(c, { 'CRIP/MC09 Activity': 'PRVA - Community Walk-through', 'Activity Title': '1st Barangay Assembly',
      'BA Participation - Total HH in Barangay': 9, 'BA Participation - Total HH Represented': 9, 'BA Participation - % HH Participation': 100 })
  ]);
  const ba1 = s.barangayRows.find(b => b.barangay === 'Village A').activities.BA1;
  assert.equal(s.k2.listed, 10); assert.equal(s.k2.present, 7);
  assert.equal(ba1.hhConflict, false, 'the 4th BA and PRVA counts are not BA1 records');
  assert.ok(s.trackerIssues.some(x => x.problem === 'Unrecognized controlled activity: 4th Barangay Assembly'));
});
test('classify never returns a code the activity model does not carry', () => {
  const c = context(), index = c.buildActivityIndex(c.DEFAULT_ACTIVITIES.filter(a => a.code !== 'BA2'));
  assert.equal(c.classify(index, null, '2nd BA', null), '', 'keyword match on a missing activity');
  assert.equal(c.classify(index, null, '4th Barangay Assembly', null), '', 'BA4 is not in the model yet');
  assert.equal(c.classify(c.buildActivityIndex(c.DEFAULT_ACTIVITIES), null, '2nd BA', null), 'BA2');
});
test('rows of another modality are counted but not checked', () => {
  const c = context(), s = load(c, [record(c), record(c, { Modality: 'KC-NCDDP', 'Participants - Male': -1, 'Actual End': 'not a date' })]);
  assert.equal(s.importTotals.otherModality, 1);
  assert.equal(s.importTotals.invalidFigures, 0);
  assert.deepEqual(plain(s.trackerIssues), []);
});
test('a legacy or incomplete sheet beside a complete Activity Tracker is skipped, not fatal', async () => {
  const c = context();
  c.readXlsx = async () => ({
    Raw_Activity_Tracker: [Array.from(c.ACTIVITY_TRACKER_HEADERS), record(c)],
    Raw_Participants: [Array.from(c.PARTICIPANT_HEADERS), Array.from(c.PARTICIPANT_HEADERS, () => 'x')]
  });
  const file = { name: 'Monitor.xlsx', arrayBuffer: async () => new ArrayBuffer(0) };
  const found = await c.readDataFile(file);
  assert.deepEqual(plain(found.map(f => f.kind)), ['activityTracker']);
  assert.ok(c.IMPORT_ERRORS.some(e => e.file === 'Monitor.xlsx' && /legacy/.test(e.error)));
  c.readXlsx = async () => ({ Raw_Participants: [Array.from(c.PARTICIPANT_HEADERS)] });
  await assert.rejects(c.readDataFile(file), /legacy.*Activity Tracker/, 'a legacy-only workbook is still rejected');
});
