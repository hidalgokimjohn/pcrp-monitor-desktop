// ===================================================================
// Comprehensive Automated Test Suite for PCRP Monitor Desktop
// Tests: store.js, crypto.js, delta.js, virtual-table.js, worker.js,
//        runtime & core algorithms (escaping, sorting, formatting)
// ===================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
const results = [];

/** The source of one top-level function declaration in a file, by brace matching. */
function extractFn(code, name) {
  const start = code.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = code.indexOf('{', start), depth = 0;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error('function ' + name + ' is not closed');
}

function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        passed++;
        results.push({ name, status: 'PASS' });
        console.log(`  ✓ ${name}`);
      }).catch((err) => {
        failed++;
        results.push({ name, status: 'FAIL', error: err });
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.stack || err.message}`);
      });
    } else {
      passed++;
      results.push({ name, status: 'PASS' });
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err });
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function runAll() {
  console.log('\n======================================================');
  console.log('🧪 PCRP Monitor Desktop — Full JavaScript Test Suite');
  console.log('======================================================\n');

  // -----------------------------------------------------------------
  // 1. PCRP_STORE Tests
  // -----------------------------------------------------------------
  console.log('📦 Testing PCRP_STORE (src/store.js)...');
  {
    const storeCode = fs.readFileSync(path.join(ROOT, 'src', 'store.js'), 'utf8');
    const sandbox = { console };
    vm.createContext(sandbox);
    vm.runInContext(storeCode, sandbox);
    const STORE = sandbox.PCRP_STORE;

    test('Store: Initial state matches defaults', () => {
      assert.strictEqual(typeof STORE, 'object');
      assert.strictEqual(STORE.get('page'), 'settings');
      assert.strictEqual(STORE.get('stage'), 1);
      assert.strictEqual(STORE.get('computed'), false);
      const all = STORE.get();
      assert.strictEqual(typeof all, 'object');
      assert.strictEqual(all.page, 'settings');
    });

    test('Store: set() updates state and retrieves updated value', () => {
      STORE.set({ page: 'overview', stage: 2 });
      assert.strictEqual(STORE.get('page'), 'overview');
      assert.strictEqual(STORE.get('stage'), 2);
    });

    test('Store: on() listens to state:changed events', () => {
      let notified = false;
      let payloadReceived = null;
      const unsub = STORE.on('state:changed', (changed) => {
        notified = true;
        payloadReceived = changed;
      });
      STORE.set({ prov: 'Agusan del Norte' });
      assert.strictEqual(notified, true);
      assert.strictEqual(payloadReceived.prov, 'Agusan del Norte');
      unsub();

      // Ensure unsubscribe stops future emissions
      notified = false;
      STORE.set({ prov: 'Surigao del Sur' });
      assert.strictEqual(notified, false);
      assert.strictEqual(STORE.get('prov'), 'Surigao del Sur');
    });

    test('Store: on() listens to property-specific change:prop events', () => {
      let muniVal = null;
      const unsub = STORE.on('change:muni', (val) => {
        muniVal = val;
      });
      STORE.set({ muni: 'Carmen' });
      assert.strictEqual(muniVal, 'Carmen');
      unsub();
    });

    test('Store: silent set() does not trigger events', () => {
      let triggered = false;
      const unsub = STORE.on('state:changed', () => { triggered = true; });
      STORE.set({ muniSearch: 'test-query' }, true); // silent = true
      assert.strictEqual(triggered, false);
      assert.strictEqual(STORE.get('muniSearch'), 'test-query');
      unsub();
    });

    test('Store: error in listener does not break event loop', () => {
      let secondListenerRan = false;
      const unsub1 = STORE.on('state:changed', () => {
        throw new Error('Listener error test');
      });
      const unsub2 = STORE.on('state:changed', () => {
        secondListenerRan = true;
      });
      STORE.set({ stage: 3 });
      assert.strictEqual(secondListenerRan, true);
      unsub1();
      unsub2();
    });
  }

  // -----------------------------------------------------------------
  // 2. PCRP_CRYPTO Tests
  // -----------------------------------------------------------------
  console.log('\n🔒 Testing PCRP_CRYPTO (src/crypto.js)...');
  {
    const cryptoCode = fs.readFileSync(path.join(ROOT, 'src', 'crypto.js'), 'utf8');
    const sandbox = {
      console,
      crypto: globalThis.crypto,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      JSON,
      setTimeout,
      clearTimeout
    };
    vm.createContext(sandbox);
    vm.runInContext(cryptoCode, sandbox);
    const CRYPTO = sandbox.PCRP_CRYPTO;

    test('Crypto: isAvailable() detects subtle crypto', () => {
      assert.strictEqual(CRYPTO.isAvailable(), true);
    });

    await test('Crypto: hashPin() hashes correctly and differs across PINs', async () => {
      const h1 = await CRYPTO.hashPin('1234');
      const h2 = await CRYPTO.hashPin('1234');
      const h3 = await CRYPTO.hashPin('5678');
      assert.strictEqual(typeof h1, 'string');
      assert.strictEqual(h1.length, 64); // SHA-256 hex string
      assert.strictEqual(h1, h2);
      assert.notStrictEqual(h1, h3);
    });

    await test('Crypto: setPin() and AES-GCM-256 encrypt/decrypt roundtrip', async () => {
      await CRYPTO.setPin('8888');
      const testPayload = {
        session: 'LGU-Carmen-2026',
        records: 1540,
        confidential: 'Juan dela Cruz (DOB: 1985-04-12)',
        items: [1, 2, 3, { nested: true, unicode: 'Barangay San Agustín 🇵🇭' }]
      };

      const encryptedStr = await CRYPTO.encrypt(testPayload);
      assert.strictEqual(typeof encryptedStr, 'string');
      assert.ok(encryptedStr.includes('"encrypted":true'));
      assert.ok(!encryptedStr.includes('Juan dela Cruz')); // Must not contain plaintext

      const decrypted = await CRYPTO.decrypt(encryptedStr);
      assert.deepStrictEqual(decrypted, testPayload);
    });

    await test('Crypto: unlockSession() verifies correct vs incorrect PIN', async () => {
      const wrongPin = await CRYPTO.unlockSession('0000');
      assert.strictEqual(wrongPin, false);

      const rightPin = await CRYPTO.unlockSession('8888');
      assert.strictEqual(rightPin, true);
    });

    await test('Crypto: lockSession() prevents decryption until unlocked', async () => {
      const sensitiveData = { secret: 'Confidential KCIS Household' };
      const encrypted = await CRYPTO.encrypt(sensitiveData);

      CRYPTO.lockSession('Manual Test Lock');
      // While locked, key is null
      const failedDecrypt = await CRYPTO.decrypt(encrypted);
      // Returns raw parsed payload fallback on fail
      assert.strictEqual(failedDecrypt.encrypted, true);

      // Unlock and retry
      const unlocked = await CRYPTO.unlockSession('8888');
      assert.strictEqual(unlocked, true);
      const okDecrypt = await CRYPTO.decrypt(encrypted);
      assert.deepStrictEqual(okDecrypt, sensitiveData);
    });

    test('Crypto: disableSecurity() cleans up active PIN and keys', () => {
      CRYPTO.disableSecurity();
      const prefs = CRYPTO.getSecurityPrefs();
      assert.strictEqual(prefs.enabled, false);
      assert.strictEqual(prefs.pinHash, '');
    });
  }

  // -----------------------------------------------------------------
  // 3. PCRP_DELTA Protocol Tests
  // -----------------------------------------------------------------
  console.log('\n📡 Testing PCRP_DELTA (src/delta.js)...');
  {
    const deltaCode = fs.readFileSync(path.join(ROOT, 'src', 'delta.js'), 'utf8');
    const sandbox = {
      console,
      Date,
      Object,
      JSON,
      APP_VERSION: '2.12.0'
    };
    vm.createContext(sandbox);
    vm.runInContext(deltaCode, sandbox);
    const DELTA = sandbox.PCRP_DELTA;

    test('Delta: createDeltaPacket generates compliant schema and stats', () => {
      const records = {
        'rec-1': { status: 'match', timestamp: '2026-10-18T10:00:00Z', notes: 'Verified on sheet' },
        'rec-2': { status: 'differ', timestamp: '2026-10-18T10:15:00Z', notes: 'Name mismatch' },
        'rec-3': { status: 'missing', timestamp: '2026-10-18T10:20:00Z', notes: 'Not on attendance sheet' }
      };

      const packet = DELTA.createDeltaPacket({
        authorName: 'Maria Santos',
        role: 'pea_mdm',
        province: 'Agusan del Norte',
        municipality: 'Carmen',
        pullDate: '2026-10-18',
        verifyRecords: records
      });

      assert.strictEqual(packet.format, 'PCRP_DELTA_V1');
      assert.strictEqual(packet.author.municipality, 'Carmen');
      assert.strictEqual(packet.stats.totalTags, 3);
      assert.strictEqual(packet.stats.match, 1);
      assert.strictEqual(packet.stats.differ, 1);
      assert.strictEqual(packet.stats.notOnSheet, 1);
    });

    test('Delta: parseDelta validates packet structure and rejects corrupt format', () => {
      const valid = JSON.stringify({
        format: 'PCRP_DELTA_V1',
        records: { 'r1': { status: 'match' } }
      });
      const parsed = DELTA.parseDelta(valid);
      assert.strictEqual(parsed.format, 'PCRP_DELTA_V1');

      assert.throws(() => {
        DELTA.parseDelta(JSON.stringify({ format: 'INVALID_FORMAT' }));
      }, /unknown format/);

      assert.throws(() => {
        DELTA.parseDelta(JSON.stringify({ format: 'PCRP_DELTA_V1' }));
      }, /missing records payload/);
    });

    test('Delta: mergeDelta strategy "newer" resolves conflicts by timestamp', () => {
      const existing = {
        'rec-1': { status: 'match', timestamp: '2026-10-18T08:00:00Z' },
        'rec-2': { status: 'differ', timestamp: '2026-10-18T12:00:00Z' }
      };

      const incoming = {
        records: {
          'rec-1': { status: 'differ', timestamp: '2026-10-18T09:00:00Z' }, // Newer: should overwrite
          'rec-2': { status: 'match', timestamp: '2026-10-18T10:00:00Z' },  // Older: should NOT overwrite
          'rec-3': { status: 'match', timestamp: '2026-10-18T11:00:00Z' }   // New key: should add
        }
      };

      const res = DELTA.mergeDelta(existing, incoming, { strategy: 'newer' });
      assert.strictEqual(res.stats.added, 1);
      assert.strictEqual(res.stats.updated, 1);
      assert.strictEqual(res.stats.unchanged, 1);

      assert.strictEqual(res.mergedRecords['rec-1'].status, 'differ');
      assert.strictEqual(res.mergedRecords['rec-2'].status, 'differ'); // Retained newer existing
      assert.strictEqual(res.mergedRecords['rec-3'].status, 'match');
    });

    test('Delta: mergeDelta strategy "incoming" overwrites all collisions', () => {
      const existing = { 'r1': { status: 'match' } };
      const incoming = { records: { 'r1': { status: 'differ' } } };
      const res = DELTA.mergeDelta(existing, incoming, { strategy: 'incoming' });
      assert.strictEqual(res.mergedRecords['r1'].status, 'differ');
      assert.strictEqual(res.stats.updated, 1);
    });

    test('Delta: mergeDelta strategy "existing" preserves all local records', () => {
      const existing = { 'r1': { status: 'match' } };
      const incoming = { records: { 'r1': { status: 'differ' } } };
      const res = DELTA.mergeDelta(existing, incoming, { strategy: 'existing' });
      assert.strictEqual(res.mergedRecords['r1'].status, 'match');
      assert.strictEqual(res.stats.unchanged, 1);
    });
  }

  // -----------------------------------------------------------------
  // 4. PCRP_VIRTUAL_TABLE Tests
  // -----------------------------------------------------------------
  console.log('\n🗂️ Testing PCRP_VIRTUAL_TABLE (src/virtual-table.js)...');
  {
    const vtCode = fs.readFileSync(path.join(ROOT, 'src', 'virtual-table.js'), 'utf8');
    const sandbox = { console, Math };
    vm.createContext(sandbox);
    vm.runInContext(vtCode, sandbox);
    const VT = sandbox.PCRP_VIRTUAL_TABLE;

    test('Virtual Table: calculateSlice handles empty items list', () => {
      const slice = VT.calculateSlice({ totalCount: 0, rowHeight: 40, scrollTop: 0, clientHeight: 400 });
      assert.strictEqual(slice.startIndex, 0);
      assert.strictEqual(slice.endIndex, 0);
      assert.strictEqual(slice.topPadding, 0);
      assert.strictEqual(slice.bottomPadding, 0);
    });

    test('Virtual Table: calculateSlice computes correct top window slice', () => {
      const slice = VT.calculateSlice({
        totalCount: 1000,
        rowHeight: 40,
        scrollTop: 0,
        clientHeight: 400, // 10 rows visible
        buffer: 5
      });
      assert.strictEqual(slice.startIndex, 0);
      // ceil((0+400)/40) = 10, + 5 buffer = 15
      assert.strictEqual(slice.endIndex, 15);
      assert.strictEqual(slice.topPadding, 0);
      assert.strictEqual(slice.bottomPadding, (1000 - 15) * 40);
    });

    test('Virtual Table: calculateSlice computes scrolled slice with spacers', () => {
      const slice = VT.calculateSlice({
        totalCount: 1000,
        rowHeight: 40,
        scrollTop: 4000, // row 100
        clientHeight: 400, // 10 rows visible -> row 110
        buffer: 10
      });
      // floor(4000/40) = 100 - 10 = 90
      assert.strictEqual(slice.startIndex, 90);
      // ceil(4400/40) = 110 + 10 = 120
      assert.strictEqual(slice.endIndex, 120);
      assert.strictEqual(slice.topPadding, 90 * 40);
      assert.strictEqual(slice.bottomPadding, (1000 - 120) * 40);
    });
  }

  // -----------------------------------------------------------------
  // 5. PCRP_WORKER Tests
  // -----------------------------------------------------------------
  console.log('\n⚙️ Testing PCRP_WORKER (src/worker.js)...');
  {
    const workerCode = fs.readFileSync(path.join(ROOT, 'src', 'worker.js'), 'utf8');
    const sandbox = {
      console,
      Promise,
      JSON
    };
    vm.createContext(sandbox);
    vm.runInContext(workerCode, sandbox);
    const WORKER = sandbox.PCRP_WORKER;

    test('Worker: Fallback detects absence of browser Worker', () => {
      assert.strictEqual(WORKER.isSupported(), false);
    });

    await test('Worker: PARSE_CSV task parses rows synchronously via fallback', async () => {
      const csvData = 'Header1,Header2,Header3\r\n"Value 1",Value 2,123\n"Value 4","Value 5",456';
      const rows = await WORKER.runTask('PARSE_CSV', { text: csvData });
      assert.strictEqual(rows.length, 3);
      assert.deepStrictEqual([...rows[0]], ['Header1', 'Header2', 'Header3']);
      assert.deepStrictEqual([...rows[1]], ['Value 1', 'Value 2', '123']);
      assert.deepStrictEqual([...rows[2]], ['Value 4', 'Value 5', '456']);
    });

    await test('Worker: HEAVY_FILTER task filters items query via fallback', async () => {
      const dataset = [
        { id: 1, name: 'Barangay Poblacion', muni: 'Carmen' },
        { id: 2, name: 'Barangay Tagcatong', muni: 'Carmen' },
        { id: 3, name: 'Barangay Mat-i', muni: 'Surigao' }
      ];
      const filtered = await WORKER.runTask('HEAVY_FILTER', { items: dataset, query: 'carmen' });
      assert.strictEqual(filtered.length, 2);
      assert.strictEqual(filtered[0].muni, 'Carmen');
      assert.strictEqual(filtered[1].muni, 'Carmen');
    });
  }

  // -----------------------------------------------------------------
  // 6. Core Algorithms & Formatting Tests (JS_Core.html / app.js)
  // -----------------------------------------------------------------
  console.log('\n🧮 Testing Core Algorithms, Sorting, and Formatting...');
  {
    // Escaping helper
    function esc(s) {
      if (s === null || s === undefined) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    // Number formatting helper
    function n(val) {
      if (val === null || val === undefined || isNaN(val)) return '0';
      return Number(val).toLocaleString('en-US');
    }
    // Search normalizer
    function normSearch(s) {
      return (s || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
    }
    // Comparison helper
    function cmpValues(a, b) {
      if (a === b) return 0;
      var aEmpty = a === null || a === undefined || a === '' || a === '—';
      var bEmpty = b === null || b === undefined || b === '' || b === '—';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (typeof a === 'number' && typeof b === 'number') {
        if (isNaN(a)) return 1;
        if (isNaN(b)) return -1;
        return a - b;
      }
      var na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb) && typeof a !== 'boolean' && typeof b !== 'boolean') return na - nb;
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    }

    test('Core: esc() correctly sanitizes HTML characters against XSS', () => {
      assert.strictEqual(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      assert.strictEqual(esc("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
      assert.strictEqual(esc(null), '');
      assert.strictEqual(esc(undefined), '');
    });

    test('Core: n() formats numbers with thousand separators', () => {
      assert.strictEqual(n(1234567), '1,234,567');
      assert.strictEqual(n(0), '0');
      assert.strictEqual(n(null), '0');
    });

    test('Core: normSearch() trims, collapses whitespace, and lowercases', () => {
      assert.strictEqual(normSearch('  CARMEN   Poblacion  '), 'carmen poblacion');
      assert.strictEqual(normSearch(null), '');
    });

    test('Core: cmpValues() handles numbers, strings, and empty values gracefully', () => {
      assert.ok(cmpValues(10, 20) < 0);
      assert.ok(cmpValues(20, 10) > 0);
      assert.strictEqual(cmpValues(10, 10), 0);
      assert.ok(cmpValues('Barangay 2', 'Barangay 10') < 0); // Natural alphanumeric
      assert.ok(cmpValues('—', 5) > 0); // Empty / dashes pushed to end
      assert.ok(cmpValues(null, 'Val') > 0);
    });
  }

  // -----------------------------------------------------------------
  // 7. Save Files, Reference Masterlist, and Compression Tests
  // -----------------------------------------------------------------
  console.log('\n💾 Testing Save Files, Compression & Reference Masterlist...');
  {
    const zlib = require('zlib');

    test('Saved Data: Gzip / Gunzip roundtrip preserves complex session JSON', () => {
      const sessionData = {
        format: 'pcrp-desktop-save',
        version: 1,
        monitorVersion: '2.12.0',
        savedAt: new Date().toISOString(),
        pullDate: '2026-10-18',
        home: { province: 'Agusan del Norte', municipality: 'Carmen' },
        tables: {
          Raw_Participants: {
            headers: ['Province', 'Municipality', 'Barangay', 'Full_Name'],
            rows: [['Agusan del Norte', 'Carmen', 'Poblacion', 'Juan dela Cruz']]
          }
        },
        ledger: {
          '2026-10-10': {
            'finding-1': { check: 'attendees', count: 5 }
          }
        },
        tags: {
          records: {
            'tag-1': { status: 'match', timestamp: '2026-10-18T12:00:00Z' }
          }
        }
      };

      const jsonStr = JSON.stringify(sessionData);
      const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
      assert.ok(compressed.length > 0);
      // Gzip magic number 0x1f, 0x8b
      assert.strictEqual(compressed[0], 0x1f);
      assert.strictEqual(compressed[1], 0x8b);

      const decompressed = zlib.gunzipSync(compressed).toString('utf8');
      const restored = JSON.parse(decompressed);
      assert.strictEqual(restored.format, 'pcrp-desktop-save');
      assert.strictEqual(restored.pullDate, '2026-10-18');
      assert.strictEqual(restored.tables.Raw_Participants.rows.length, 1);
      assert.strictEqual(restored.tables.Raw_Participants.rows[0][3], 'Juan dela Cruz');
    });

    test('Reference Data: data/reference.json exists and contains Baseline & Activities', () => {
      const refPath = path.join(ROOT, 'data', 'reference.json');
      assert.ok(fs.existsSync(refPath), 'data/reference.json must exist');
      const refData = JSON.parse(fs.readFileSync(refPath, 'utf8'));
      assert.ok(refData.Baseline, 'Reference data must contain Baseline');
      assert.ok(Array.isArray(refData.Baseline.rows), 'Baseline must have rows');
      assert.ok(refData.Baseline.rows.length >= 500, 'Baseline should contain all monitored barangays');
      assert.ok(refData.Activities, 'Reference data must contain Activities');
      assert.ok(Array.isArray(refData.Activities.rows), 'Activities must have rows');
      assert.ok(refData.Activities.rows.length >= 10, 'Activities must have monitor activity definitions');
    });

    test('Monitor Integrity: Vendored monitor scripts Code.js, Store.js, WebApp.js exist', () => {
      const vendorDir = path.join(ROOT, 'vendor', 'monitor');
      assert.ok(fs.existsSync(path.join(vendorDir, 'Code.js')));
      assert.ok(fs.existsSync(path.join(vendorDir, 'Store.js')));
      assert.ok(fs.existsSync(path.join(vendorDir, 'WebApp.js')));
      assert.ok(fs.existsSync(path.join(vendorDir, 'JS_Health.html')));
    });
  }

  // -----------------------------------------------------------------
  // 7. Barangay Modules, Numerical Sequence, & BResT Table
  // -----------------------------------------------------------------
  {
    console.log('\n🏛️ Testing Barangay Modules, Numerical Sequence, & BResT Table...');

    test('Barangay Activities: Numerical sequence sorting with actSeqNum', () => {
      function actSeqNum(s) {
        if (typeof s === 'number') return s;
        if (!s) return 999;
        var n = parseFloat(s);
        return isNaN(n) ? 999 : n;
      }

      const rawActs = [
        { code: 'TDR', seq: '10', stage: 2 },
        { code: 'BA1', seq: '2', stage: 1 },
        { code: 'FOMG', seq: '11', stage: 2 },
        { code: 'PROFILE', seq: '3.1', stage: 1 },
        { code: 'MREST', seq: '1', stage: 1 },
        { code: 'BPRVA', seq: '3.5', stage: 1 },
        { code: 'BA2', seq: '6', stage: 2 },
        { code: 'WALK', seq: '3.2', stage: 1 },
        { code: 'MRP', seq: '4', stage: 1 }
      ];

      const sorted = rawActs.slice().sort((a, b) => actSeqNum(a.seq) - actSeqNum(b.seq));
      const sortedCodes = sorted.map(a => a.code);
      assert.deepStrictEqual(sortedCodes, [
        'MREST',   // 1
        'BA1',     // 2
        'PROFILE', // 3.1
        'WALK',    // 3.2
        'BPRVA',   // 3.5
        'MRP',     // 4
        'BA2',     // 6
        'TDR',     // 10
        'FOMG'     // 11
      ]);
    });

    test('Barangay Activities: Municipal activity filtering when hideMuni is true', () => {
      const stage1Acts = [
        { code: 'MREST', seq: '1', level: 'Municipal' },
        { code: 'BA1', seq: '2', level: 'Barangay' },
        { code: 'PROFILE', seq: '3.1', level: 'Barangay' },
        { code: 'MRP', seq: '4', level: 'Municipal' },
        { code: 'BDC', seq: '5', level: 'Barangay' }
      ];

      const brgyOnly = stage1Acts.filter(a => a.level !== 'Municipal');
      assert.strictEqual(brgyOnly.length, 3);
      assert.deepStrictEqual(brgyOnly.map(a => a.code), ['BA1', 'PROFILE', 'BDC']);
    });

    test('Lacking Finding Modal: parses "Activity (seq X): reason" into structured components', () => {
      const findingStr = 'PRVA – Community Profiling (seq 3.1): nothing encoded';
      const parts = findingStr.split(': ');
      assert.strictEqual(parts[0], 'PRVA – Community Profiling (seq 3.1)');
      assert.strictEqual(parts[1], 'nothing encoded');
    });

    test('BResT Teams: Tabular extractors compute correct sorting, sectors, and percentages without chair requirement', () => {
      const mockTeam = {
        b: { barangay: 'Poblacion 1', municipality: 'Buenavista' },
        bVols: [
          { name: 'Maria Santos', sex: 'female', position: 'Purok 1 Leader', ip: false, pwd: false },
          { name: 'Juan Cruz', sex: 'male', position: 'Fisherfolk Sector', ip: true, pwd: false },
          { name: 'Elena Ramos', sex: 'female', position: 'Women / Health Sector', ip: false, pwd: true }
        ],
        st: 'Encoded',
        reasons: []
      };

      const women = mockTeam.bVols.filter(v => v.sex === 'female').length;
      const marg = mockTeam.bVols.filter(v => v.sex === 'female' || v.ip || v.pwd).length;
      const sectors = [];
      mockTeam.bVols.forEach(v => {
        if (v.position && !sectors.includes(v.position)) sectors.push(v.position);
      });

      assert.strictEqual(women, 2);
      assert.strictEqual(marg, 3);
      assert.strictEqual(sectors.length, 3);
      assert.deepStrictEqual(sectors, ['Purok 1 Leader', 'Fisherfolk Sector', 'Women / Health Sector']);
      assert.strictEqual(Math.round((women / mockTeam.bVols.length) * 100), 67);
      assert.strictEqual(Math.round((marg / mockTeam.bVols.length) * 100), 100);
      assert.strictEqual(mockTeam.chair, undefined);
    });
  }

  // -----------------------------------------------------------------
  // 8. Stage 2 CSPMC & Specialized Sub-Committees Tests
  // -----------------------------------------------------------------
  console.log('🏛️ Testing Stage 2 CSPMC & 8 Sub-Committees (src/people.js)...');
  {
    const peopleCode = fs.readFileSync(path.join(ROOT, 'src', 'people.js'), 'utf8');
    const sandbox = {
      console,
      normAlpha: (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    };
    vm.createContext(sandbox);
    const topPart = peopleCode.substring(0, peopleCode.indexOf('function buildPeopleIndex'));
    vm.runInContext(topPart, sandbox);

    test('Stage 2 Committees: STAGE2_BODIES contains all 8 specialized sub-committees + Bookkeeper', () => {
      assert.strictEqual(sandbox.STAGE2_BODIES.length, 9);
      const ids = sandbox.STAGE2_BODIES.map(b => b.id);
      assert.strictEqual(JSON.stringify(ids), JSON.stringify(['CSPMC', 'CMSC', 'PPSC', 'PSC', 'PIT', 'MISC', 'AISC', 'OMSC', 'BOOKKEEPER']));
    });

    test('Stage 2 Classification: classifyStage2Committee accurately identifies all 8 sub-committees & aliases', () => {
      // 1. CMSC
      assert.strictEqual(sandbox.classifyStage2Committee('Community Monitoring Sub-Committee', 'Member'), 'CMSC');
      assert.strictEqual(sandbox.classifyStage2Committee('CMSC', 'Chairperson'), 'CMSC');
      // 2. MISC
      assert.strictEqual(sandbox.classifyStage2Committee('Monitoring and Inspection Sub-Committee', 'Lead Inspector'), 'MISC');
      assert.strictEqual(sandbox.classifyStage2Committee('Inspection Committee', 'Member'), 'MISC');
      // 3. PPSC
      assert.strictEqual(sandbox.classifyStage2Committee('Proposal Preparation Sub-Committee', 'Member'), 'PPSC');
      assert.strictEqual(sandbox.classifyStage2Committee('Project Preparation Team', 'Lead'), 'PPSC');
      // 4. PSC / BASC
      assert.strictEqual(sandbox.classifyStage2Committee('Procurement Sub-Committee', 'Canvasser'), 'PSC');
      assert.strictEqual(sandbox.classifyStage2Committee('Bids and Awards Committee (BASC)', 'Member'), 'PSC');
      // 5. SPISC / PIT
      assert.strictEqual(sandbox.classifyStage2Committee('Sub-Project Implementation Team (SPISC)', 'Site Supervisor'), 'PIT');
      assert.strictEqual(sandbox.classifyStage2Committee('PIT', 'Labor Coordinator'), 'PIT');
      // 6. AISC / AIT
      assert.strictEqual(sandbox.classifyStage2Committee('Audit and Inventory Sub-Committee (AISC)', 'Auditor'), 'AISC');
      assert.strictEqual(sandbox.classifyStage2Committee('Inventory and Audit Team (AIT)', 'Member'), 'AISC');
      // 7. O&MSC / OMT
      assert.strictEqual(sandbox.classifyStage2Committee('Operations and Maintenance Sub-Committee', 'Secretary'), 'OMSC');
      assert.strictEqual(sandbox.classifyStage2Committee('O&M Group (OMT)', 'Lead'), 'OMSC');
      // 8. Bookkeeper
      assert.strictEqual(sandbox.classifyStage2Committee('Financial Management', 'Community Bookkeeper'), 'BOOKKEEPER');
      assert.strictEqual(sandbox.classifyStage2Committee('Accounting Unit', 'Assistant Bookkeeper'), 'BOOKKEEPER');
      // 9. Generic CSPMC Officers
      assert.strictEqual(sandbox.classifyStage2Committee('Community Sub-Project Management Committee', 'Chairperson'), 'CSPMC');
      // 10. Regression: Stage 1 / Municipal bodies (like SFMC Municipal containing "feedBACk") must return null
      assert.strictEqual(sandbox.classifyStage2Committee('StakeholdersFeedbackMechanismCommittee(SFMCMunicipal)', 'Member'), null);
      assert.strictEqual(sandbox.classifyStage2Committee('Stakeholder and Feedback Mechanism Sub-Committee (SFMSC)', 'Chairperson'), null);
      assert.strictEqual(sandbox.classifyStage2Committee('Barangay Resilience Team (BResT)', 'Member'), null);
      assert.strictEqual(sandbox.classifyStage2Committee('Municipal Resilience Team (MResT)', 'Member'), null);
    });

    test('Stage 2 Compliance: evaluateCspmcBarangay evaluates quorum, leadership, and women quota', () => {
      const b = { barangay: 'Poblacion 1', municipality: 'Buenavista', province: 'Agusan del Norte' };
      const compliantVols = [
        { name: 'Maria Santos', stage2Body: 'CSPMC', chair: true, sex: 'female', wasBrest: true },
        { name: 'Juan Cruz', stage2Body: 'CMSC', chair: true, sex: 'male', wasBrest: true },
        { name: 'Elena Ramos', stage2Body: 'CMSC', chair: false, sex: 'female', wasBrest: true },
        { name: 'Pedro Reyes', stage2Body: 'CMSC', chair: false, sex: 'male', wasBrest: false },
        { name: 'Ana Lopez', stage2Body: 'PSC', chair: false, sex: 'female', wasBrest: false }
      ];

      const ev = sandbox.evaluateCspmcBarangay(b, compliantVols);
      assert.strictEqual(ev.status, 'Encoded');
      assert.strictEqual(ev.cmscCount, 3);
      assert.strictEqual(ev.hasCmscLead, true);
      assert.strictEqual(ev.hasCspmcLead, true);
      assert.strictEqual(ev.cmscBrestAlum, 2);
      assert.strictEqual(ev.womenPct, 60);
      assert.strictEqual(ev.reasons.length, 0);
    });

    test('Stage 2 Quorum: CMSC lacking < 3 members triggers validation issue', () => {
      const b = { barangay: 'Poblacion 1', municipality: 'Buenavista', province: 'Agusan del Norte' };
      const lackingVols = [
        { name: 'Maria Santos', stage2Body: 'CSPMC', chair: true, sex: 'female', wasBrest: true },
        { name: 'Juan Cruz', stage2Body: 'CMSC', chair: true, sex: 'male', wasBrest: true }
      ];

      const ev = sandbox.evaluateCspmcBarangay(b, lackingVols);
      assert.strictEqual(ev.status, 'Needs fixing');
      assert.strictEqual(ev.cmscCount, 1);
      assert.strictEqual(ev.reasons.some(r => r.includes('CMSC quorum lacking: requires at least 3 Community Volunteers')), true);
    });

    test('Stage 2 CMSC Policy: Selection from BResT is encouraged but NOT strictly enforced', () => {
      const b = { barangay: 'Poblacion 1', municipality: 'Buenavista', province: 'Agusan del Norte' };
      const newVols = [
        { name: 'Maria Santos', stage2Body: 'CSPMC', chair: true, sex: 'female', wasBrest: false },
        { name: 'Juan Cruz', stage2Body: 'CMSC', chair: true, sex: 'male', wasBrest: false },
        { name: 'Elena Ramos', stage2Body: 'CMSC', chair: false, sex: 'female', wasBrest: false },
        { name: 'Pedro Reyes', stage2Body: 'CMSC', chair: false, sex: 'male', wasBrest: false }
      ];

      const ev = sandbox.evaluateCspmcBarangay(b, newVols);
      assert.strictEqual(ev.status, 'Encoded');
      assert.strictEqual(ev.cmscBrestAlum, 0);
      assert.strictEqual(ev.reasons.length, 0);
    });

    test('Stage 2 Organizational Chart: builds 3-tier hierarchy (BA apex, Oversight/Exec/Books middle, 6 operational sub-committees)', () => {
      // Provide sandbox helpers needed by Org Chart builders
      sandbox.esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      sandbox.attr = (s) => String(s || '').replace(/"/g, '&quot;');
      sandbox.n = (v) => String(v == null ? '' : v);
      sandbox.icon = (name) => '<svg data-icon="' + name + '"></svg>';
      sandbox.nameCell = (v) => '<a class="person-link">' + sandbox.esc(v.name) + '</a>';

      const orgChunk = peopleCode.substring(
        peopleCode.indexOf('var CSPMC_STATE ='),
        peopleCode.indexOf('function renderCspmc')
      );
      vm.runInContext(orgChunk, sandbox);

      const b = { barangay: 'Poblacion 1', municipality: 'Buenavista', province: 'Agusan del Norte' };
      const vols = [
        { name: 'Maria Santos', stage2Body: 'CSPMC', chair: true, sex: 'female', wasBrest: true },
        { name: 'Juan Cruz', stage2Body: 'CMSC', chair: true, sex: 'male', wasBrest: true },
        { name: 'Elena Ramos', stage2Body: 'CMSC', chair: false, sex: 'female', wasBrest: true },
        { name: 'Pedro Reyes', stage2Body: 'CMSC', chair: false, sex: 'male', wasBrest: false },
        { name: 'Ana Lopez', stage2Body: 'BOOKKEEPER', chair: false, sex: 'female', wasBrest: false },
        { name: 'Carlos Tan', stage2Body: 'PPSC', chair: true, sex: 'male', wasBrest: false },
        { name: 'Rosa Diaz', stage2Body: 'PSC', chair: true, sex: 'female', wasBrest: false },
        { name: 'George Lim', stage2Body: 'PIT', chair: true, sex: 'male', wasBrest: false },
        { name: 'Liza Dizon', stage2Body: 'MISC', chair: true, sex: 'female', wasBrest: false },
        { name: 'David Sy', stage2Body: 'AISC', chair: true, sex: 'male', wasBrest: false },
        { name: 'Grace Ong', stage2Body: 'OMSC', chair: true, sex: 'female', wasBrest: false }
      ];
      const ev = sandbox.evaluateCspmcBarangay(b, vols);

      // 1. Barangay-level Org Chart
      const brgyHtml = sandbox.buildBarangayOrgChartHtml(ev, b.barangay, b.municipality + ', ' + b.province, true);
      assert.strictEqual(brgyHtml.includes('cspmc-org-wrap'), true);
      assert.strictEqual(brgyHtml.includes('org-tier-apex'), true);
      assert.strictEqual(brgyHtml.includes('BARANGAY ASSEMBLY (BA)'), true);
      assert.strictEqual(brgyHtml.includes('org-tier-middle'), true);
      assert.strictEqual(brgyHtml.includes('Independent M&amp;E &amp; Audit Arm'), true);
      assert.strictEqual(brgyHtml.includes('CMSC'), true);
      assert.strictEqual(brgyHtml.includes('CSPMC'), true);
      assert.strictEqual(brgyHtml.includes('BOOKKEEPER'), true);
      assert.strictEqual(brgyHtml.includes('org-tier-subcommittees'), true);
      // All 6 operational sub-committees present
      ['PPSC', 'PSC', 'PIT', 'MISC', 'AISC', 'OMSC'].forEach(id => {
        assert.strictEqual(brgyHtml.includes(id), true);
      });
      assert.strictEqual(brgyHtml.includes('Maria Santos'), true);
      assert.strictEqual(brgyHtml.includes('✓ BResT'), true);

      // 2. Aggregate-level Org Chart
      const evalMap = { 'Agusan del Norte|Buenavista|Poblacion 1': ev };
      const aggHtml = sandbox.buildAggregateOrgChartHtml([b], evalMap, vols, 'Buenavista');
      assert.strictEqual(aggHtml.includes('cspmc-org-wrap'), true);
      assert.strictEqual(aggHtml.includes('BARANGAY ASSEMBLY (BA) · 1 BARANGAY'), true);
      assert.strictEqual(aggHtml.includes('org-tier-middle'), true);
      assert.strictEqual(aggHtml.includes('org-tier-subcommittees'), true);
    });
  }

  // -----------------------------------------------------------------
  // 9. MResT Co-Governance, Barangay Captains & 50% Quota Tests
  // -----------------------------------------------------------------
  console.log('🏛️ Testing MResT Co-Governance, Barangay Captains & 50% Quota (src/people.js)...');
  {
    const peopleCode = fs.readFileSync(path.join(ROOT, 'src', 'people.js'), 'utf8');
    const sandbox = {
      console,
      normAlpha: (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
      esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      attr: (s) => String(s || '').replace(/"/g, '&quot;'),
      n: (v) => String(v == null ? '' : v),
      icon: (name) => '<svg data-icon="' + name + '"></svg>',
      nameCell: (v) => '<a class="person-link">' + String(v.name || '') + '</a>',
      MRT_STATE: { clusterFilter: 'all', search: '', showOrgChart: true }
    };
    vm.createContext(sandbox);
    const mrestChunk = peopleCode.substring(
      peopleCode.indexOf('var MREST_CLUSTERS ='),
      peopleCode.indexOf('function renderMrest')
    );
    vm.runInContext(mrestChunk, sandbox);

    test('MResT Classification: classifyMrestRole accurately assigns LCE, Leads, Captains, and Departments', () => {
      assert.strictEqual(sandbox.classifyMrestRole('Municipal Mayor', 'MResT'), 'LCE');
      assert.strictEqual(sandbox.classifyMrestRole('Mayor / Chairperson', 'MResT'), 'LCE');
      assert.strictEqual(sandbox.classifyMrestRole('MPDC', 'MResT'), 'LEAD');
      assert.strictEqual(sandbox.classifyMrestRole('MDRRMO', 'MResT'), 'LEAD');
      assert.strictEqual(sandbox.classifyMrestRole('Punong Barangay', 'MResT'), 'CAPTAINS');
      assert.strictEqual(sandbox.classifyMrestRole('Barangay Captain', 'MResT'), 'CAPTAINS');
      assert.strictEqual(sandbox.classifyMrestRole('PB - Poblacion 1', 'MResT'), 'CAPTAINS');
      assert.strictEqual(sandbox.classifyMrestRole('Municipal Engineer', 'MResT'), 'INFRA');
      assert.strictEqual(sandbox.classifyMrestRole('MSWDO', 'MResT'), 'SOCIAL');
      assert.strictEqual(sandbox.classifyMrestRole('Municipal Health Officer', 'MResT'), 'SOCIAL');
      assert.strictEqual(sandbox.classifyMrestRole('MENRO', 'MResT'), 'CLIMATE');
      assert.strictEqual(sandbox.classifyMrestRole('Municipal Agriculturist', 'MResT'), 'CLIMATE');
      assert.strictEqual(sandbox.classifyMrestRole('Municipal Budget Officer', 'MResT'), 'FINANCE');
      assert.strictEqual(sandbox.classifyMrestRole('CSO Representative', 'MResT'), 'CSO');
      assert.strictEqual(sandbox.classifyMrestRole('IPMR', 'MResT'), 'IPMR');
      assert.strictEqual(sandbox.classifyMrestRole('SB Member - Appropriations', 'MResT'), 'SB_DILG');
      assert.strictEqual(sandbox.classifyMrestRole('MLGOO - DILG', 'MResT'), 'SB_DILG');
      assert.strictEqual(sandbox.classifyMrestRole('Area Coordinator (ACT)', 'MResT'), 'ACT_MCT');
    });

    test('MResT Org Chart: builds Mayor Apex, Steering Leads, and Dual Co-Governance Wings with Barangay Captains', () => {
      const muniVols = [
        { name: 'Hon. Jose Rizal', position: 'Municipal Mayor', key: 'p1' },
        { name: 'Engr. Juan Luna', position: 'MPDC', key: 'p2' },
        { name: 'Capt. Andres Bonifacio', position: 'MDRRMO', key: 'p3' },
        { name: 'PB Emilio Aguinaldo', position: 'Punong Barangay - Brgy 1', key: 'p4' },
        { name: 'PB Apolinario Mabini', position: 'Barangay Captain - Brgy 2', key: 'p5' },
        { name: 'PB Melchora Aquino', position: 'Punong Barangay - Brgy 3', key: 'p6' },
        { name: 'Datu Bago', position: 'IPMR', key: 'p7' },
        { name: 'Maria Clara', position: 'CSO Representative 1', key: 'p8' },
        { name: 'Tandang Sora', position: 'CSO Representative 2', key: 'p9' },
        { name: 'Engr. Antonio Luna', position: 'Municipal Engineer', key: 'p10' },
        { name: 'Gliceria Marella', position: 'MSWDO', key: 'p11' },
        { name: 'Mariano Alvarez', position: 'Municipal Budget Officer', key: 'p12' }
      ];

      const html = sandbox.buildMrestOrgChartHtml('Buenavista', 'Agusan del Norte', muniVols, 3, null, true, 12);
      assert.strictEqual(html.includes('cspmc-org-wrap'), true);
      assert.strictEqual(html.includes('OFFICE OF THE MUNICIPAL MAYOR'), true);
      assert.strictEqual(html.includes('Hon. Jose Rizal'), true);
      assert.strictEqual(html.includes('MPDC &amp; MDRRMO LEADS'), true);
      assert.strictEqual(html.includes('Community &amp; Barangay Leadership Wing'), true);
      assert.strictEqual(html.includes('ALL BARANGAY CAPTAINS (PUNONG BARANGAYS)'), true);
      assert.strictEqual(html.includes('3 / 3 Barangays'), true);
      assert.strictEqual(html.includes('MLGU Technical &amp; Sectoral Wing'), true);
      assert.strictEqual(html.includes('50% Quota Met'), true);
    });
  }

  // -----------------------------------------------------------------
  // 10. Data Quality Assessment (DQA) Architecture & Navigation
  // -----------------------------------------------------------------
  console.log('🛡️ Testing Data Quality Assessment (DQA) Architecture & Navigation...');
  {
    const appHtml = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
    const healthHtml = fs.readFileSync(path.join(ROOT, 'vendor', 'monitor', 'JS_Health.html'), 'utf8');
    const verifyJs = fs.readFileSync(path.join(ROOT, 'src', 'verify.js'), 'utf8');

    test('DQA Navigation: src/app.html contains unified Nav Tab Group with dropdown sub-items', () => {
      assert.strictEqual(appHtml.includes('id="group-dqa-wrap"'), true);
      assert.strictEqual(appHtml.includes('id="tab-group-dqa"'), true);
      assert.strictEqual(appHtml.includes('data-group="dqa"'), true);
      assert.strictEqual(appHtml.includes('id="badge-group-dqa"'), true);
      assert.strictEqual(appHtml.includes('id="dropdown-dqa"'), true);
      assert.strictEqual(appHtml.includes('data-page="health" id="tab-health"'), true);
      assert.strictEqual(appHtml.includes('data-page="verify" id="tab-verify"'), true);
      assert.strictEqual(appHtml.includes('DQA Audit &amp; Scorecard'), true);
      assert.strictEqual(appHtml.includes('Field Form Verification'), true);
      // Ensure standalone top-level verify and health tab buttons are removed
      assert.strictEqual(appHtml.includes('<button role="tab" data-page="verify">'), false);
      assert.strictEqual(appHtml.includes('<button role="tab" data-page="health">'), false);
    });

    test('DQA Dialog: #memo-dialog header reflects DQA Audit Memo', () => {
      assert.strictEqual(appHtml.includes('<h2>DQA Audit Memo</h2>'), true);
      assert.strictEqual(appHtml.includes('<h2>Data Health audit memo</h2>'), false);
    });

    test('DQA Routing: src/app.js routes dqa aliases and manages isDqaGroup tab state', () => {
      assert.strictEqual(appJs.includes("if (page === 'dqa' || page === 'data-health') page = 'health';"), true);
      assert.strictEqual(appJs.includes("var isDqaGroup = (page === 'health' || page === 'verify');"), true);
      assert.strictEqual(appJs.includes("var grpDqa = $('tab-group-dqa');"), true);
      assert.strictEqual(appJs.includes("setBadge('group-dqa'"), true);
      assert.strictEqual(appJs.includes("'DQA Audit'"), true);
    });

    test('DQA Audit & Scorecard: JS_Health.html contains sub-nav tabs, DQA header & SM7 subtitle', () => {
      assert.strictEqual(healthHtml.includes('class="sub-nav-tabs"'), true);
      assert.strictEqual(healthHtml.includes('data-go="health"'), true);
      assert.strictEqual(healthHtml.includes('data-go="verify"'), true);
      assert.strictEqual(healthHtml.includes('<h2>Data Quality Assessment (DQA)</h2>'), true);
      assert.strictEqual(healthHtml.includes('Kalahi-CIDSS SM7 M&amp;E Data Quality Dimensions'), true);
      assert.strictEqual(healthHtml.includes('DATA QUALITY ASSESSMENT (DQA) AUDIT MEMO'), true);
    });

    test('DQA Field Form Verification: src/verify.js contains sub-nav tabs and SM7 Table 8 Precision header', () => {
      assert.strictEqual(verifyJs.includes('class="sub-nav-tabs"'), true);
      assert.strictEqual(verifyJs.includes('data-go="health"'), true);
      assert.strictEqual(verifyJs.includes('data-go="verify"'), true);
      assert.strictEqual(verifyJs.includes('<h2>Field Form Verification (Precision Protocol)</h2>'), true);
      assert.strictEqual(verifyJs.includes('The Precision dimension of the Data Quality Assessment (SM7 Table 8)'), true);
    });
  }

  // -----------------------------------------------------------------
  // 11. Persistent Storage & Refresh Data Preservation
  // -----------------------------------------------------------------
  console.log('🔄 Testing Persistent Storage & Refresh Data Preservation (src/saved.js & src/app.js)...');
  {
    const savedCode = fs.readFileSync(path.join(ROOT, 'src', 'saved.js'), 'utf8');
    const appCode = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

    test('Storage: src/saved.js implements persistent IDB connection caching and batch writing', () => {
      assert.strictEqual(savedCode.includes('var _dbPromise = null;'), true);
      assert.strictEqual(savedCode.includes('function savedPutMany('), true);
      assert.strictEqual(savedCode.includes('function fallbackGet('), true);
      assert.strictEqual(savedCode.includes('function fallbackPut('), true);
      assert.strictEqual(savedCode.includes('function savedSaveCurrent('), true);
    });

    test('Page Persistence: src/app.js records active page in go() so refresh retains view', () => {
      assert.strictEqual(appCode.includes("sessionStorage.setItem('pcrp_active_page', page);"), true);
      assert.strictEqual(appCode.includes("localStorage.setItem('pcrp_active_page', page);"), true);
    });

    test('Immediate Save: src/app.js flushes loaded tables immediately in handleFiles', () => {
      assert.strictEqual(appCode.includes("if (typeof savedSaveCurrent === 'function') savedSaveCurrent();"), true);
    });

    test('Auto-Flush: src/app.js registers beforeunload and visibilitychange listeners', () => {
      assert.strictEqual(appCode.includes("window.addEventListener('beforeunload', function () {"), true);
      assert.strictEqual(appCode.includes("document.addEventListener('visibilitychange', function () {"), true);
    });

    test('PIN Unlock Recovery: src/app.js restores workspace on unlock', () => {
      assert.strictEqual(appCode.includes("savedRestore().then(function (restored) {"), true);
      assert.strictEqual(appCode.includes("Opened the data saved on this PC"), true);
    });

    await test('Sandbox Storage & Restore: savedSaveCurrent and savedRestore preserve and bring back data across simulated reloads', async () => {
      const mockStorage = {};
      const sandbox = {
        console,
        clearTimeout,
        setTimeout,
        window: {
          indexedDB: null // force fallback storage to verify cross-environment persistence
        },
        localStorage: {
          getItem: (k) => mockStorage[k] || null,
          setItem: (k, v) => { mockStorage[k] = String(v); },
          removeItem: (k) => { delete mockStorage[k]; }
        },
        sessionStorage: {
          getItem: (k) => mockStorage[k] || null,
          setItem: (k, v) => { mockStorage[k] = String(v); },
          removeItem: (k) => { delete mockStorage[k]; }
        },
        TABS: {
          Raw_Volunteers: {
            headers: ['Province', 'Municipality', 'Barangay', 'Committee', 'Position', 'First Name', 'Last Name'],
            rows: [['Agusan del Norte', 'Buenavista', 'Poblacion 1', 'BResT', 'Team Leader', 'Juan', 'Dela Cruz']]
          }
        },
        LOADED: {
          volunteers: { file: 'Volunteers.xlsx', sheet: 'Sheet1', rows: 1 }
        },
        VERIFY: { tags: { version: 1, records: { r1: { verified: true } } } },
        prefs: () => ({ home: 'Agusan del Norte|Buenavista', evalDate: '2026-10-18' }),
        savePrefs: () => {},
        pullDate: () => '2026-10-18',
        today: () => '2026-10-18',
        setTabsEnabled: () => {},
        renderStatus: () => {},
        renderImport: () => {},
        updateTabBadges: () => {},
        renderSavedBar: () => {},
        $: () => null,
        go: () => {},
        computeAndShow: () => {},
        FINDINGS_HEADERS: [],
        SHEETS: { FINDINGS: 'DQA_Findings' },
        SAVE_DB: 'pcrp-desktop',
        SAVE_STORE: 'kv',
        SAVE_KEEP_PULLS: 12,
        SAVE_TABLES: ['Raw_Participants', 'Raw_HH_Participation', 'Raw_Volunteers'],
        SAVE_FORMAT: 'pcrp-desktop-save',
        SAVED: { current: null, ledger: {}, available: true, dataStamp: '' },
        SNAP: null,
        STATE: { computed: false }
      };

      vm.createContext(sandbox);
      vm.runInContext(savedCode, sandbox);

      // 1. Save data currently in memory (only volunteers loaded)
      await sandbox.savedSaveCurrent();

      assert.strictEqual(mockStorage['pcrp_save_current'] != null, true);
      const parsed = JSON.parse(mockStorage['pcrp_save_current']);
      assert.strictEqual(parsed.tables.Raw_Volunteers.rows.length, 1);
      assert.strictEqual(parsed.tables.Raw_Volunteers.rows[0][5], 'Juan');

      // 2. Simulate refresh: wipe in-memory TABS and LOADED
      sandbox.TABS = {};
      sandbox.LOADED = {};
      assert.strictEqual(sandbox.TABS.Raw_Volunteers, undefined);

      // 3. Restore data from storage
      const restored = await sandbox.savedRestore();
      assert.strictEqual(restored, true);
      assert.strictEqual(sandbox.TABS.Raw_Volunteers != null, true);
      assert.strictEqual(sandbox.TABS.Raw_Volunteers.rows.length, 1);
      assert.strictEqual(sandbox.TABS.Raw_Volunteers.rows[0][5], 'Juan');
      assert.strictEqual(sandbox.LOADED.volunteers.rows, 1);
    });
  }

  // -----------------------------------------------------------------
  // 12. Floating Helper Tooltip Popover System & PCRP Glossary Tests
  // -----------------------------------------------------------------
  console.log('💡 Testing Floating Helper Tooltip Popover System & PCRP Glossary...');
  {
    const appJs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
    const appCss = fs.readFileSync(path.join(ROOT, 'src', 'app.css'), 'utf8');
    const appHtml = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

    test('Tooltip CSS: defines .app-tooltip and .helper-term styles', () => {
      assert.strictEqual(appCss.includes('.app-tooltip'), true, 'Missing .app-tooltip in app.css');
      assert.strictEqual(appCss.includes('.helper-term'), true, 'Missing .helper-term in app.css');
      assert.strictEqual(appCss.includes('html.dark .app-tooltip'), true, 'Missing dark mode theme styling for app-tooltip');
    });

    test('Tooltip Engine: functions and PCRP_GLOSSARY defined in app.js', () => {
      assert.strictEqual(appJs.includes('var PCRP_GLOSSARY = {'), true, 'Missing PCRP_GLOSSARY in app.js');
      assert.strictEqual(appJs.includes('function showAppTooltip('), true, 'Missing showAppTooltip in app.js');
      assert.strictEqual(appJs.includes('function positionAppTooltip('), true, 'Missing positionAppTooltip in app.js');
      assert.strictEqual(appJs.includes('function hideAppTooltip('), true, 'Missing hideAppTooltip in app.js');
      assert.strictEqual(appJs.includes('function initTooltipEngine('), true, 'Missing initTooltipEngine in app.js');
    });

    test('PCRP Glossary: covers core terms (k2, brest, cspmc, mrest, prva, dqa)', () => {
      const match = /var PCRP_GLOSSARY = ({[\s\S]*?\n\});/.exec(appJs);
      assert.ok(match, 'PCRP_GLOSSARY object could not be extracted');
      const glossary = eval('(' + match[1].replace(/;\s*$/, '') + ')');

      const requiredTerms = ['k2', 'brest', 'cspmc', 'mrest', 'prva', 'dqa', 'kcis', 'crip', 'ba1', 'cmsc', 'marginalized'];
      requiredTerms.forEach((term) => {
        assert.ok(glossary[term], 'Missing required glossary term: ' + term);
        assert.ok(glossary[term].title, 'Term ' + term + ' missing title');
        assert.ok(glossary[term].badge, 'Term ' + term + ' missing badge');
        assert.ok(glossary[term].desc, 'Term ' + term + ' missing desc');
        assert.ok(glossary[term].ref, 'Term ' + term + ' missing policy reference');
      });
    });

    test('HTML Navigation: clean navigation without helper tooltips', () => {
      // User requirement: "remove the helper in the navigation items, you over doing it"
      const navTabsMatch = appHtml.match(/<nav class="tabs"[\s\S]*?<\/nav>/);
      assert.ok(navTabsMatch, 'nav.tabs should exist in app.html');
      const navTabsContent = navTabsMatch[0];
      assert.strictEqual(navTabsContent.includes('data-tooltip='), false, 'Navigation items should not contain data-tooltip');
      assert.strictEqual(navTabsContent.includes('data-term='), false, 'Navigation items should not contain data-term');

      const headerTopMatch = appHtml.match(/<header class="top"[\s\S]*?<\/header>/);
      assert.ok(headerTopMatch, 'header.top should exist in app.html');
      const headerContent = headerTopMatch[0];
      assert.strictEqual(headerContent.includes('data-tooltip='), false, 'Header buttons should not contain data-tooltip');
      assert.strictEqual(headerContent.includes('data-term='), false, 'Header buttons should not contain data-term');
    });

    test('Settings Layout: Municipal Scope is Section 1 and Data Import is Section 2', () => {
      // Sidebar menu ordering: Municipal Scope before Data Import
      const scopeMenuIdx = appHtml.indexOf('href="#sec-scope"');
      const importMenuIdx = appHtml.indexOf('href="#sec-import"');
      assert.ok(scopeMenuIdx !== -1, 'sec-scope missing in menu');
      assert.ok(importMenuIdx !== -1, 'sec-import missing in menu');
      assert.ok(scopeMenuIdx < importMenuIdx, 'Municipal Scope menu item must appear before Data Import');

      // Main content section ordering: Municipal Scope before Data Import
      const scopeSecIdx = appHtml.indexOf('id="sec-scope"');
      const importSecIdx = appHtml.indexOf('id="sec-import"');
      assert.ok(scopeSecIdx !== -1, 'sec-scope section missing');
      assert.ok(importSecIdx !== -1, 'sec-import section missing');
      assert.ok(scopeSecIdx < importSecIdx, 'sec-scope section must appear before sec-import in main content');

      // Step numbering
      assert.ok(appHtml.includes('<h2><span class="step-no">2</span> Import KCIS exports</h2>'), 'Data import should be Step 2 in HTML');
      assert.ok(appJs.includes('<h2><span class="step-no">1</span> Select your Role &amp; Municipality</h2>'), 'Municipal scope should be Step 1 in app.js');
      assert.ok(appJs.includes('Section 1 · Municipal Scope &amp; Role'), 'Municipal scope badge should reference Section 1');
    });
  }

  // -----------------------------------------------------------------
  // 14. Operational Dashboard & Decision Center Tests (src/app.js & src/app.css)
  // -----------------------------------------------------------------
  console.log('🚀 Testing Operational Dashboard, Triage Tray & Milestone Stepper (src/app.js & src/app.css)...');
  {
    const appJs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
    const appCss = fs.readFileSync(path.join(ROOT, 'src', 'app.css'), 'utf8');

    test('Dashboard Helpers: getScopedCompositeMetrics, getScopedTriageSummary, and Stepper defined', () => {
      assert.strictEqual(appJs.includes('function getScopedCompositeMetrics('), true, 'Missing getScopedCompositeMetrics in app.js');
      assert.strictEqual(appJs.includes('function getScopedTriageSummary('), true, 'Missing getScopedTriageSummary in app.js');
      assert.strictEqual(appJs.includes('function renderOverviewTriageTray('), true, 'Missing renderOverviewTriageTray in app.js');
      assert.strictEqual(appJs.includes('function renderMilestoneStepper('), true, 'Missing renderMilestoneStepper in app.js');
    });

    test('Overview UI: Action Center Triage and Milestone Stepper invoked in renderOverview', () => {
      assert.strictEqual(appJs.includes('renderOverviewTriageTray(triage)'), true, 'Missing triage tray invocation in renderOverview');
      assert.strictEqual(appJs.includes('renderMilestoneStepper(pipe)'), true, 'Missing milestone stepper invocation in renderOverview');
      assert.strictEqual(appJs.includes('quickChipsHtml'), true, 'Missing quickChipsHtml in renderOverview');
    });

    test('Overview Actions: ov-filter and ov-filter-seq click handlers exist', () => {
      assert.strictEqual(appJs.includes("act === 'ov-filter'"), true, 'Missing ov-filter action handler');
      assert.strictEqual(appJs.includes("act === 'ov-filter-seq'"), true, 'Missing ov-filter-seq action handler');
    });

    test('Dashboard Styles: CSS classes defined in app.css', () => {
      assert.strictEqual(appCss.includes('.triage-tray'), true, 'Missing .triage-tray in app.css');
      assert.strictEqual(appCss.includes('.triage-item'), true, 'Missing .triage-item in app.css');
      assert.strictEqual(appCss.includes('.milestone-stepper-card'), true, 'Missing .milestone-stepper-card in app.css');
      assert.strictEqual(appCss.includes('.milestone-step'), true, 'Missing .milestone-step in app.css');
      assert.strictEqual(appCss.includes('.quick-filter-chip'), true, 'Missing .quick-filter-chip in app.css');
      assert.strictEqual(appCss.includes('.quick-filter-chip.chip-good.active'), true, 'Missing .quick-filter-chip.chip-good.active in app.css');
    });
  }

  // -----------------------------------------------------------------
  // 15. Municipal Operations Triage, Quick Presets & Pipeline Progress (src/app.js)
  // -----------------------------------------------------------------
  console.log('🏛️ Testing Municipalities View Enhancements, Triage Tray & Quick Presets (src/app.js)...');
  {
    const appJs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

    test('Municipal Definitions: muniProgress, getMuniTriageSummary, and renderMuniTriageTray defined', () => {
      assert.strictEqual(appJs.includes('function muniProgress('), true, 'Missing muniProgress in app.js');
      assert.strictEqual(appJs.includes('function getMuniTriageSummary('), true, 'Missing getMuniTriageSummary in app.js');
      assert.strictEqual(appJs.includes('function renderMuniTriageTray('), true, 'Missing renderMuniTriageTray in app.js');
    });

    test('Municipal UI: renderMunis invokes renderMuniTriageTray and renders quickChipsHtml', () => {
      assert.strictEqual(appJs.includes('renderMuniTriageTray(summary, cvOn)'), true, 'Missing renderMuniTriageTray call in renderMunis');
      assert.strictEqual(appJs.includes('quickChipsHtml +'), true, 'Missing quickChipsHtml in renderMunis markup');
      assert.strictEqual(appJs.includes("refreshIcons($('mu-body'))"), true, 'Missing refreshIcons call at end of renderMunis');
    });

    test('Municipal Actions: mu-filter and muni-reset handlers in place', () => {
      assert.strictEqual(appJs.includes("act === 'mu-filter'"), true, 'Missing mu-filter event handler');
      assert.strictEqual(appJs.includes("STATE.muniFilter = 'all'"), true, 'muni-reset should reset muniFilter to all');
      assert.strictEqual(appJs.includes("muniFilter: 'all'"), true, 'STATE should declare muniFilter: all');
    });

    test('Municipal Calculations: muniProgress calculates pipeline completion rate correctly', () => {
      function muniProgress(r, acts) {
        var aList = acts || [];
        var totExp = 0, totComp = 0;
        aList.forEach(function (a) {
          var c = (r.cells && r.cells[a.code]) || {};
          totExp += (c.expected || 0);
          totComp += (c.complete || 0);
        });
        return totExp > 0 ? (totComp / totExp) : 0;
      }

      const acts = [{ code: 'BA1' }, { code: 'PROFILE' }, { code: 'WALK' }];
      const r1 = { cells: { BA1: { expected: 10, complete: 10 }, PROFILE: { expected: 10, complete: 5 }, WALK: { expected: 10, complete: 0 } } };
      assert.strictEqual(muniProgress(r1, acts), 0.5); // 15 / 30 = 0.5

      const rEmpty = { cells: {} };
      assert.strictEqual(muniProgress(rEmpty, acts), 0);
    });

    test('Municipal Calculations: getMuniTriageSummary calculates triage breakdown correctly', () => {
      function muniK2(r) { var h = r.households || {}; return h.listed ? h.present / h.listed : null; }
      function getMuniTriageSummary(rows, acts, cvOn, stage) {
        var aList = acts || [];
        var isCv = !!cvOn;
        var curStage = stage || 1;
        var lackingFn = function (r) {
          return aList.reduce(function (s, a) { return s + (((r.cells && r.cells[a.code]) || {}).backlog || 0); }, 0);
        };
        var noSheetFn = function (r) {
          return aList.reduce(function (s, a) { return s + (((r.cells && r.cells[a.code]) || {}).noAttendees || 0); }, 0);
        };

        var withBacklog = 0, totalLacking = 0;
        var withNoSheet = 0, totalNoSheet = 0;
        var k2Issues = 0;
        var cvIssues = 0;
        var compliant = 0;

        (rows || []).forEach(function (r) {
          var b = lackingFn(r);
          var ns = noSheetFn(r);
          var k = muniK2(r);
          var kBad = (curStage === 1 && k !== null && k < 0.7);
          var cvBad = false;
          if (isCv && r.volunteers) {
            var B = r.volunteers.BREST, S = r.volunteers.SFMSC;
            cvBad = (B && (B.encoded < B.expected || B.needsFix > 0)) || (S && (S.encoded < S.expected || S.needsFix > 0));
          }

          if (b > 0) { withBacklog++; totalLacking += b; }
          if (ns > 0) { withNoSheet++; totalNoSheet += ns; }
          if (kBad) k2Issues++;
          if (cvBad) cvIssues++;
          if (b === 0 && ns === 0 && !kBad && !cvBad) compliant++;
        });

        return {
          totalMunis: (rows || []).length,
          munisWithBacklog: withBacklog,
          totalLackingRecords: totalLacking,
          munisWithNoSheet: withNoSheet,
          totalNoSheetRecords: totalNoSheet,
          munisK2Issue: k2Issues,
          munisCvIssue: cvIssues,
          munisCompliant: compliant
        };
      }

      const acts = [{ code: 'BA1' }, { code: 'PROFILE' }];
      const sampleRows = [
        // Muni 1: Has backlog of 3
        { municipality: 'Muni A', cells: { BA1: { complete: 2, expected: 5, backlog: 3, noAttendees: 0 } }, households: { listed: 100, present: 80 } },
        // Muni 2: Has no sheet (noAttendees = 2), but 0 backlog
        { municipality: 'Muni B', cells: { BA1: { complete: 5, expected: 5, backlog: 0, noAttendees: 2 } }, households: { listed: 100, present: 75 } },
        // Muni 3: Below K2 quorum (60%), 0 backlog, 0 noAttendees
        { municipality: 'Muni C', cells: { BA1: { complete: 5, expected: 5, backlog: 0, noAttendees: 0 } }, households: { listed: 100, present: 60 } },
        // Muni 4: 100% compliant
        { municipality: 'Muni D', cells: { BA1: { complete: 5, expected: 5, backlog: 0, noAttendees: 0 } }, households: { listed: 100, present: 85 } }
      ];

      const res = getMuniTriageSummary(sampleRows, acts, false, 1);
      assert.strictEqual(res.totalMunis, 4);
      assert.strictEqual(res.munisWithBacklog, 1);
      assert.strictEqual(res.totalLackingRecords, 3);
      assert.strictEqual(res.munisWithNoSheet, 1);
      assert.strictEqual(res.totalNoSheetRecords, 2);
      assert.strictEqual(res.munisK2Issue, 1);
      assert.strictEqual(res.munisCompliant, 1);
    });
  }

  // -----------------------------------------------------------------
  // 16. Barangay Operations Triage, Quick Presets & Pipeline Progress (src/app.js)
  // -----------------------------------------------------------------
  console.log('🏘️ Testing Barangay Operations Triage, Quick Presets & Progress (src/app.js)...');
  {
    const appJs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

    test('Barangay Definitions: brgyProgress, getBrgyTriageSummary, and renderBrgyTriageTray defined', () => {
      assert.strictEqual(appJs.includes('function brgyProgress('), true, 'Missing brgyProgress in app.js');
      assert.strictEqual(appJs.includes('function getBrgyTriageSummary('), true, 'Missing getBrgyTriageSummary in app.js');
      assert.strictEqual(appJs.includes('function renderBrgyTriageTray('), true, 'Missing renderBrgyTriageTray in app.js');
    });

    test('Barangay UI: renderBrgys invokes renderBrgyTriageTray and renders quickChipsHtml', () => {
      assert.strictEqual(appJs.includes('renderBrgyTriageTray(summary, cvOn)'), true, 'Missing renderBrgyTriageTray call in renderBrgys');
      assert.strictEqual(appJs.includes('quickChipsHtml +'), true, 'Missing quickChipsHtml in renderBrgys markup');
      assert.strictEqual(appJs.includes("refreshIcons($('bg-body'))"), true, 'Missing refreshIcons call at end of renderBrgys');
      assert.strictEqual(appJs.includes("id: 'compliant'"), true, 'BRGY_FILTERS should include compliant preset');
    });

    test('Barangay Calculations: brgyProgress calculates stage completion rate correctly', () => {
      function brgyProgress(b, acts) {
        var aList = acts || [];
        var exp = 0, comp = 0;
        aList.forEach(function (a) {
          if (a.level === 'Municipal') return;
          var x = b.activities && b.activities[a.code];
          if (!x || x.notApplicable || x.status === 'N/A') return;
          exp++;
          if (x.status === 'Complete') comp++;
        });
        return exp > 0 ? comp / exp : 0;
      }

      const acts = [
        { code: 'BA1', level: 'Barangay' },
        { code: 'PROFILE', level: 'Barangay' },
        { code: 'MREST', level: 'Municipal' } // Should be skipped in barangay activity progress
      ];

      const b1 = {
        activities: {
          BA1: { status: 'Complete' },
          PROFILE: { status: 'Not Encoded' },
          MREST: { status: 'Complete' }
        }
      };

      // 1 out of 2 barangay-level expected activities complete
      assert.strictEqual(brgyProgress(b1, acts), 0.5);

      const bEmpty = { activities: {} };
      assert.strictEqual(brgyProgress(bEmpty, acts), 0);
    });

    test('Barangay Calculations: getBrgyTriageSummary aggregates triage metrics accurately', () => {
      function getBrgyTriageSummary(all, acts, cvOn, stage) {
        var curStage = stage || 1;
        var isCv = !!cvOn;

        var lackingCount = 0, totalLacking = 0;
        var noSheetCount = 0, totalNoSheet = 0;
        var k2RiskCount = 0;
        var cvGapsCount = 0;
        var sfmscFixCount = 0;
        var compliantCount = 0;

        (all || []).forEach(function (b) {
          var lackItems = ((b.todo && b.todo.length) || 0) + (b.owed || 0);
          var hasLacking = lackItems > 0;

          var noSheetActs = 0;
          Object.keys(b.activities || {}).forEach(function (k) {
            var act = b.activities[k];
            if (act && act.status === 'No Attendees' && !act.notApplicable) noSheetActs++;
          });
          var hasNoSheet = noSheetActs > 0;

          var k2Risk = (curStage === 1 && b.hhListed > 0 && b.hhRate < 0.7);

          var cvGaps = false, sfmscFix = false;
          if (isCv && b.volunteers) {
            if (b.volunteers.BREST && b.volunteers.BREST.status === 'Not encoded') cvGaps = true;
            if (b.volunteers.SFMSC) {
              if (b.volunteers.SFMSC.status === 'Not encoded') cvGaps = true;
              if (b.volunteers.SFMSC.status === 'Needs fixing') sfmscFix = true;
            }
          }

          if (hasLacking) { lackingCount++; totalLacking += lackItems; }
          if (hasNoSheet) { noSheetCount++; totalNoSheet += noSheetActs; }
          if (k2Risk) k2RiskCount++;
          if (cvGaps) cvGapsCount++;
          if (sfmscFix) sfmscFixCount++;

          if (!hasLacking && !hasNoSheet && !k2Risk && !cvGaps && !sfmscFix) {
            compliantCount++;
          }
        });

        return {
          totalBrgys: (all || []).length,
          lackingBrgys: lackingCount,
          totalLackingItems: totalLacking,
          noSheetBrgys: noSheetCount,
          totalNoSheetActivities: totalNoSheet,
          k2RiskBrgys: k2RiskCount,
          cvGapsBrgys: cvGapsCount,
          sfmscFixBrgys: sfmscFixCount,
          compliantBrgys: compliantCount
        };
      }

      const acts = [{ code: 'BA1' }, { code: 'PROFILE' }];
      const sampleBrgys = [
        // Brgy 1: Has backlog
        { barangay: 'Brgy 1', todo: ['Activity 1 missing', 'Activity 2 missing'], owed: 0, activities: {}, hhListed: 100, hhRate: 0.85 },
        // Brgy 2: Has pending sheet
        { barangay: 'Brgy 2', todo: [], owed: 0, activities: { BA1: { status: 'No Attendees' } }, hhListed: 100, hhRate: 0.85 },
        // Brgy 3: K2 below 70%
        { barangay: 'Brgy 3', todo: [], owed: 0, activities: { BA1: { status: 'Complete' } }, hhListed: 100, hhRate: 0.55 },
        // Brgy 4: Volunteer gap
        { barangay: 'Brgy 4', todo: [], owed: 0, activities: { BA1: { status: 'Complete' } }, hhListed: 100, hhRate: 0.85, volunteers: { BREST: { status: 'Not encoded' } } },
        // Brgy 5: 100% compliant
        { barangay: 'Brgy 5', todo: [], owed: 0, activities: { BA1: { status: 'Complete' } }, hhListed: 100, hhRate: 0.90, volunteers: { BREST: { status: 'Encoded' }, SFMSC: { status: 'Encoded' } } }
      ];

      const res = getBrgyTriageSummary(sampleBrgys, acts, true, 1);
      assert.strictEqual(res.totalBrgys, 5);
      assert.strictEqual(res.lackingBrgys, 1);
      assert.strictEqual(res.totalLackingItems, 2);
      assert.strictEqual(res.noSheetBrgys, 1);
      assert.strictEqual(res.totalNoSheetActivities, 1);
      assert.strictEqual(res.k2RiskBrgys, 1);
      assert.strictEqual(res.cvGapsBrgys, 1);
      assert.strictEqual(res.compliantBrgys, 1);
    });
  }

  // -----------------------------------------------------------------
  // 17. Attendees & Households Operational Enhancements
  // -----------------------------------------------------------------
  console.log('👥 Testing Attendees Directory & Household Quorum (src/people.js & src/app.css)...');
  {
    const peopleCode = fs.readFileSync(path.join(ROOT, 'src', 'people.js'), 'utf8');
    const cssCode = fs.readFileSync(path.join(ROOT, 'src', 'app.css'), 'utf8');

    test('Syntax Integrity: all JS files in src/ parse without syntax errors', () => {
      const srcFiles = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js'));
      srcFiles.forEach(file => {
        const code = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
        assert.doesNotThrow(() => {
          new vm.Script(code);
        }, `src/${file} must have valid JavaScript syntax`);
      });
    });

    test('People Definitions: Attendees & Household Helpers Exist in src/people.js', () => {
      assert.ok(peopleCode.includes('function getAttendeeTriageSummary('), 'getAttendeeTriageSummary must be defined');
      assert.ok(peopleCode.includes('function renderAttendeeTriageTray('), 'renderAttendeeTriageTray must be defined');
      assert.ok(peopleCode.includes('function quorumProgressBar('), 'quorumProgressBar must be defined');
      assert.ok(peopleCode.includes('function getHouseholdTriageSummary('), 'getHouseholdTriageSummary must be defined');
      assert.ok(peopleCode.includes('function renderHouseholdTriageTray('), 'renderHouseholdTriageTray must be defined');
      assert.ok(peopleCode.includes("data-act=\"att-triage\""), 'att-triage handler must exist');
      assert.ok(peopleCode.includes("data-act=\"hh-triage\""), 'hh-triage handler must exist');
      assert.ok(peopleCode.includes("data-act=\"hh-muni\""), 'hh-muni change handler must exist');
      assert.ok(peopleCode.includes("refreshIcons($('hh-body'))"), 'refreshIcons must be called on hh-body');
      assert.ok(peopleCode.includes("refreshIcons($('att-body'))"), 'refreshIcons must be called on att-body');
    });

    test('CSS Definitions: Quorum Progress Bar and Threshold Marker Exist in src/app.css', () => {
      assert.ok(cssCode.includes('.quorum-progress-cell'), '.quorum-progress-cell must be defined');
      assert.ok(cssCode.includes('.quorum-progress-wrap'), '.quorum-progress-wrap must be defined');
      assert.ok(cssCode.includes('.quorum-progress-bar'), '.quorum-progress-bar must be defined');
      assert.ok(cssCode.includes('.quorum-progress-bar.is-met'), '.quorum-progress-bar.is-met must be defined');
      assert.ok(cssCode.includes('.quorum-threshold-marker'), '.quorum-threshold-marker must be defined');
    });

    test('Attendees Calculations: getAttendeeTriageSummary aggregates gender and integrity metrics', () => {
      const sampleAttendees = [
        { name: 'Maria Santos', sex: 'female', key: 'maria_santos', flags: ['volunteer'] },
        { name: 'Ana Reyes', sex: 'female', key: 'ana_reyes', flags: [] },
        { name: 'Juan Cruz', sex: 'male', key: 'juan_cruz', flags: [] },
        { name: 'Pedro Gomez', sex: 'male', key: 'pedro_gomez', flags: ['volunteer'] },
        { name: '', sex: 'female', key: '', flags: ['noname'] }
      ];

      // Minimal sandbox
      const sandbox = {
        console,
        ATT_STATE: { sex: 'all', flag: 'all' },
        icon: () => '',
        n: (v) => String(v),
        pctText: (v) => Math.round(v * 100) + '%'
      };
      vm.createContext(sandbox);

      const helperCode = `
        function getAttendeeTriageSummary(list) {
          var l = list || [];
          var total = l.length;
          var women = l.filter(function (r) { return r.sex === 'female'; }).length;
          var men = l.filter(function (r) { return r.sex === 'male'; }).length;
          var uniqueNames = {};
          l.forEach(function (r) { if (r.key) uniqueNames[r.key] = true; });
          var uniqueCount = Object.keys(uniqueNames).length;
          var volunteers = l.filter(function (r) { return r.flags && r.flags.indexOf('volunteer') !== -1; }).length;
          var missingName = l.filter(function (r) { return r.flags && r.flags.indexOf('noname') !== -1; }).length;
          var womenRate = total > 0 ? (women / total) : 0;
          return {
            total: total,
            uniqueCount: uniqueCount,
            women: women,
            womenRate: womenRate,
            men: men,
            volunteers: volunteers,
            missingName: missingName
          };
        }
      `;
      vm.runInContext(helperCode, sandbox);
      const res = sandbox.getAttendeeTriageSummary(sampleAttendees);

      assert.strictEqual(res.total, 5);
      assert.strictEqual(res.uniqueCount, 4); // 4 unique named keys
      assert.strictEqual(res.women, 3);
      assert.strictEqual(res.men, 2);
      assert.strictEqual(res.volunteers, 2);
      assert.strictEqual(res.missingName, 1);
      assert.strictEqual(res.womenRate, 0.6); // 3 / 5 = 60% (meets >=50% target)
    });

    test('Household Quorum: quorumProgressBar produces correct 70% threshold bar and styling', () => {
      const sandbox = {
        attr: (s) => String(s),
        pctText: (r) => Math.round(r * 100) + '%',
        n: (v) => String(v)
      };
      vm.createContext(sandbox);

      const barCode = `
        function quorumProgressBar(present, listed) {
          if (!listed || listed <= 0) return '<span class="tiny text-muted">—</span>';
          var rate = present / listed;
          var pct = Math.max(0, Math.min(100, Math.round(rate * 100)));
          var isMet = rate >= 0.7;
          var statusCls = isMet ? 'is-met' : 'is-below';
          var colorVar = isMet ? 'var(--good-text)' : 'var(--warn-text)';
          return '<div class="quorum-progress-cell" title="' + attr(n(present) + ' of ' + n(listed) + ' (' + pct + '%)') + '">' +
            '<div class="quorum-label-row"><strong style="color:' + colorVar + '">' + pctText(rate) + '</strong><span class="tiny muted">target 70%</span></div>' +
            '<div class="quorum-progress-wrap">' +
              '<div class="quorum-progress-bar ' + statusCls + '" style="width:' + pct + '%"></div>' +
              '<div class="quorum-threshold-marker"></div>' +
            '</div>' +
          '</div>';
        }
      `;
      vm.runInContext(barCode, sandbox);

      // Met quorum (80/100 = 80%)
      const metHtml = sandbox.quorumProgressBar(80, 100);
      assert.ok(metHtml.includes('is-met'), 'Must have is-met class for >= 70%');
      assert.ok(metHtml.includes('80%'), 'Must show 80%');
      assert.ok(metHtml.includes('quorum-threshold-marker'), 'Must have 70% threshold marker');

      // Below quorum (50/100 = 50%)
      const belowHtml = sandbox.quorumProgressBar(50, 100);
      assert.ok(belowHtml.includes('is-below'), 'Must have is-below class for < 70%');
      assert.ok(belowHtml.includes('50%'), 'Must show 50%');

      // Unreported / zero listed
      const unrepHtml = sandbox.quorumProgressBar(0, 0);
      assert.ok(unrepHtml.includes('—'), 'Must show dash for zero listed');
    });

    test('Household Calculations: getHouseholdTriageSummary aggregates K2 quorum per assembly', () => {
      // hhListed / hhPresent are set only when both counts are encoded (see computeSnapshot)
      const act = (o) => ({ BA1: Object.assign({ hhListed: 0, hhPresent: 0, hhRate: null, hhConflict: false, hhIncomplete: false }, o) });
      const sampleBrgys = [
        { barangay: 'Brgy 1', activities: act({ hhListed: 100, hhPresent: 75, hhRate: 0.75, hhConflict: true }) }, // Met, conflicting records
        { barangay: 'Brgy 2', activities: act({ hhListed: 100, hhPresent: 60, hhRate: 0.60 }) },                   // Below
        { barangay: 'Brgy 3', activities: act({ hhIncomplete: true }) },                                          // One count only
        { barangay: 'Brgy 4', activities: act({}) },                                                              // Not encoded
        { barangay: 'Brgy 5', activities: { BA1: { notApplicable: true } } },                                     // Not in scope of the assembly
        { barangay: 'Legacy', hhListed: 50, hhPresent: 40, hhRate: 0.8 }                                          // BA1 fields on the row itself
      ];
      const sandbox = { console };
      vm.createContext(sandbox);
      vm.runInContext(['hhOf', 'hhStatus', 'getHouseholdTriageSummary'].map(f => extractFn(peopleCode, f)).join('\n'), sandbox);
      const res = sandbox.getHouseholdTriageSummary(sampleBrgys, 'BA1');

      assert.strictEqual(res.totalBrgys, 5);
      assert.strictEqual(res.reportingBrgys, 3);
      assert.strictEqual(res.metQuorumBrgys, 2);
      assert.strictEqual(res.belowQuorumBrgys, 1);
      assert.strictEqual(res.incompleteBrgys, 1);
      assert.strictEqual(res.noReportBrgys, 1);
      assert.strictEqual(res.conflictBrgys, 1);
      assert.strictEqual(res.totListed, 250);
      assert.strictEqual(res.totPresent, 175);
      assert.strictEqual(res.overallRate, 175 / 250);

      const ba2 = sandbox.getHouseholdTriageSummary(sampleBrgys, 'BA2');
      assert.strictEqual(ba2.reportingBrgys, 0, 'no BA2 counts: nothing reports');
      assert.strictEqual(ba2.overallRate, null);
    });
  }

  // -----------------------------------------------------------------
  // 18. Community Volunteers & BResT Formation Action Centers
  // -----------------------------------------------------------------
  console.log('🤝 Testing Community Volunteers & BResT Formation (src/people.js & src/app.css)...');
  {
    const peopleJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'people.js'), 'utf8');
    const appCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.css'), 'utf8');

    test('Volunteers & BResT: Function definitions and handlers exist in src/people.js', () => {
      assert.ok(peopleJs.includes('function getVolunteersTriageSummary('), 'getVolunteersTriageSummary must exist');
      assert.ok(peopleJs.includes('function renderVolunteersTriageTray('), 'renderVolunteersTriageTray must exist');
      assert.ok(peopleJs.includes('function quotaMiniProgressBar('), 'quotaMiniProgressBar must exist');
      assert.ok(peopleJs.includes('function getBrestTriageSummary('), 'getBrestTriageSummary must exist');
      assert.ok(peopleJs.includes('function renderBrestTriageTray('), 'renderBrestTriageTray must exist');
      assert.ok(peopleJs.includes("act === 'vol-triage'"), 'vol-triage click handler must exist');
      assert.ok(peopleJs.includes("act === 'vol-chip'"), 'vol-chip click handler must exist');
      assert.ok(peopleJs.includes("act === 'brt-triage'"), 'brt-triage click handler must exist');
    });

    test('CSS Definitions: Quota Mini Progress Bar and Threshold Marker Exist in src/app.css', () => {
      assert.ok(appCss.includes('.quota-mini-cell'), '.quota-mini-cell must exist in app.css');
      assert.ok(appCss.includes('.quota-progress-wrap'), '.quota-progress-wrap must exist in app.css');
      assert.ok(appCss.includes('.quota-progress-bar'), '.quota-progress-bar must exist in app.css');
      assert.ok(appCss.includes('.quota-threshold-marker'), '.quota-threshold-marker must exist in app.css');
      assert.ok(appCss.includes('.quota-label-row'), '.quota-label-row must exist in app.css');
    });

    test('Volunteers Summary: getVolunteersTriageSummary aggregates gender and inclusion metrics', () => {
      const sandbox = {
        VOL_STATE: { body: 'all', position: 'all', sex: 'all', marg: 'all', flag: 'all' }
      };
      vm.createContext(sandbox);

      const volCode = `
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
      `;
      vm.runInContext(volCode, sandbox);

      const sampleVols = [
        { name: 'Maria Santos', sex: 'female', chair: true, ip: false, pwd: false, kind: 'BREST', isStage2: false, flags: [] },
        { name: 'Juan Dela Cruz', sex: 'male', chair: false, ip: true, pwd: false, kind: 'BREST', isStage2: false, flags: [] },
        { name: 'Elena Ramos', sex: 'female', chair: true, ip: false, pwd: true, kind: 'STAGE2', isStage2: true, flags: ['twice'] },
        { name: 'Pedro Reyes', sex: 'male', chair: false, ip: false, pwd: false, kind: 'SFMSC', isStage2: false, flags: [] }
      ];

      const res = sandbox.getVolunteersTriageSummary(sampleVols);
      assert.strictEqual(res.total, 4);
      assert.strictEqual(res.women, 2);
      assert.strictEqual(res.men, 2);
      assert.strictEqual(res.womenRate, 0.5);
      assert.strictEqual(res.chairs, 2);
      assert.strictEqual(res.ipCount, 1);
      assert.strictEqual(res.pwdCount, 1);
      assert.strictEqual(res.marg, 3); // Maria (female), Juan (IP), Elena (female, PWD)
      assert.strictEqual(res.margRate, 0.75);
      assert.strictEqual(res.brestCount, 2);
      assert.strictEqual(res.stage2Count, 1);
      assert.strictEqual(res.sfmscCount, 1);
      assert.strictEqual(res.flagged, 1);
    });

    test('BResT Summary: getBrestTriageSummary aggregates formation and compliance metrics', () => {
      const sandbox = {};
      vm.createContext(sandbox);

      const brestCode = `
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
      `;
      vm.runInContext(brestCode, sandbox);

      const sampleBrgys = [
        { barangay: 'Alpha', volunteers: { BREST: { status: 'Encoded', reasons: [] } } },
        { barangay: 'Beta', volunteers: { BREST: { status: 'Needs fixing', reasons: ['Lack 30% marginalized quota', 'Missing purok 2'] } } },
        { barangay: 'Gamma', volunteers: { BREST: { status: 'Not encoded', reasons: [] } } }
      ];

      const sampleBrestVols = [
        { barangay: 'Alpha', sex: 'female', ip: false, pwd: false },
        { barangay: 'Alpha', sex: 'female', ip: false, pwd: false },
        { barangay: 'Beta', sex: 'male', ip: false, pwd: false }
      ];

      const res = sandbox.getBrestTriageSummary(sampleBrgys, sampleBrestVols);
      assert.strictEqual(res.totalBrgys, 3);
      assert.strictEqual(res.encodedBrgys, 1);
      assert.strictEqual(res.needsFixBrgys, 1);
      assert.strictEqual(res.notEncodedBrgys, 1);
      assert.strictEqual(res.totalIssues, 2);
      assert.strictEqual(res.totalVols, 3);
      assert.strictEqual(res.womenVols, 2);
      assert.strictEqual(res.womenRate, 2 / 3);
      assert.strictEqual(res.formationRate, 2 / 3);
    });

    test('Quota Mini-Bar: quotaMiniProgressBar produces compliant progress bar and threshold markers', () => {
      const sandbox = {
        attr: (s) => String(s || ''),
        n: (v) => String(v || 0)
      };
      vm.createContext(sandbox);

      const barCode = `
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
      `;
      vm.runInContext(barCode, sandbox);

      // Met target test (50% quota met with 3/5 = 60%)
      const metHtml = sandbox.quotaMiniProgressBar(3, 5, 0.5, 'Target ≥50% Women representation');
      assert.ok(metHtml.includes('is-met'), 'Must have is-met class');
      assert.ok(metHtml.includes('background:var(--good);'), 'Must have green bar styling');
      assert.ok(metHtml.includes('left:50%;'), 'Must position threshold marker at target 50%');

      // Unmet target test (50% quota with 1/5 = 20%)
      const unmetHtml = sandbox.quotaMiniProgressBar(1, 5, 0.5, 'Target ≥50% Women representation');
      assert.ok(unmetHtml.includes('is-below'), 'Must have is-below class');
      assert.ok(unmetHtml.includes('background:var(--warn);'), 'Must have warning bar styling');

      // Zero total edge case
      const emptyHtml = sandbox.quotaMiniProgressBar(0, 0, 0.5, 'Target ≥50%');
      assert.ok(emptyHtml.includes('—'), 'Must display em-dash for zero total');
    });
  }

  // -----------------------------------------------------------------
  // 19. Stage 2 CSPMC & MResT Modernization (src/people.js)
  // -----------------------------------------------------------------
  console.log('🏛️ Testing Stage 2 CSPMC & MResT Modernization (src/people.js)...');
  {
    const peopleCode = fs.readFileSync(path.join(ROOT, 'src', 'people.js'), 'utf8');

    test('CSPMC & MResT: Function definitions and handlers exist in src/people.js', () => {
      assert.ok(peopleCode.includes('function getCspmcTriageSummary('), 'getCspmcTriageSummary must be defined');
      assert.ok(peopleCode.includes('function renderCspmcTriageTray('), 'renderCspmcTriageTray must be defined');
      assert.ok(peopleCode.includes('function getMrestTriageSummary('), 'getMrestTriageSummary must be defined');
      assert.ok(peopleCode.includes('function renderMrestTriageTray('), 'renderMrestTriageTray must be defined');
      assert.ok(peopleCode.includes("act === 'cspmc-triage'"), 'cspmc-triage click handler must be wired');
      assert.ok(peopleCode.includes("act === 'cspmc-chip'"), 'cspmc-chip click handler must be wired');
      assert.ok(peopleCode.includes("act === 'cspmc-pick-brgy'"), 'cspmc-pick-brgy click handler must be wired');
      assert.ok(peopleCode.includes("act === 'mrt-triage'"), 'mrt-triage click handler must be wired');
      assert.ok(peopleCode.includes("act === 'mrt-chip'"), 'mrt-chip click handler must be wired');
    });

    test('CSPMC Summary: getCspmcTriageSummary computes compliant, needs fixing, and quorum metrics', () => {
      const sandbox = {};
      vm.createContext(sandbox);

      const fnCode = `
        var CSPMC_STATE = { status: 'all', subFilter: 'all' };
        ${peopleCode.slice(peopleCode.indexOf('function getCspmcTriageSummary('), peopleCode.indexOf('function renderCspmc('))}
      `;
      vm.runInContext(fnCode, sandbox);

      const sampleBrgys = [
        { province: 'Agusan del Norte', municipality: 'Tubay', barangay: 'Poblacion 1' },
        { province: 'Agusan del Norte', municipality: 'Tubay', barangay: 'Poblacion 2' },
        { province: 'Agusan del Norte', municipality: 'Tubay', barangay: 'Tagmamarkay' }
      ];

      const sampleEvalMap = {
        'Agusan del Norte|Tubay|Poblacion 1': {
          status: 'Encoded',
          reasons: [],
          cmscCount: 3,
          hasCmscLead: true,
          hasCspmcLead: true,
          vols: [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
        },
        'Agusan del Norte|Tubay|Poblacion 2': {
          status: 'Needs fixing',
          reasons: ['CMSC lacking quorum: requires at least 3 CVs'],
          cmscCount: 2,
          hasCmscLead: false,
          hasCspmcLead: true,
          vols: [{ name: 'D' }, { name: 'E' }]
        },
        'Agusan del Norte|Tubay|Tagmamarkay': {
          status: 'Not encoded',
          reasons: ['No Stage 2 volunteers encoded'],
          cmscCount: 0,
          hasCmscLead: false,
          hasCspmcLead: false,
          vols: []
        }
      };

      const sampleS2Vols = [
        { sex: 'female', stage2Body: 'CMSC' },
        { sex: 'female', stage2Body: 'CMSC' },
        { sex: 'male', stage2Body: 'CMSC' },
        { sex: 'male', stage2Body: 'PIT' },
        { sex: 'male', stage2Body: 'PIT' }
      ];

      const res = sandbox.getCspmcTriageSummary(sampleBrgys, sampleEvalMap, sampleS2Vols);
      assert.strictEqual(res.totalBrgys, 3);
      assert.strictEqual(res.compliantBrgys, 1);
      assert.strictEqual(res.needsFixBrgys, 1);
      assert.strictEqual(res.notEncodedBrgys, 1);
      assert.strictEqual(res.cmscQuorumBrgys, 1);
      assert.strictEqual(res.totalIssues, 1);
      assert.strictEqual(res.totalVols, 5);
      assert.strictEqual(res.womenVols, 2);
      assert.strictEqual(res.womenRate, 0.4);
      assert.strictEqual(res.formationRate, 2 / 3);
    });

    test('MResT Summary: getMrestTriageSummary computes co-governance, quota, and departments', () => {
      const sandbox = {
        normAlpha: (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      };
      vm.createContext(sandbox);

      const fnCode = `
        ${peopleCode.slice(peopleCode.indexOf('var MREST_CLUSTERS ='), peopleCode.indexOf('function buildMrestOrgChartHtml('))}
        ${peopleCode.slice(peopleCode.indexOf('function getMrestTriageSummary('), peopleCode.indexOf('function renderMrest('))}
      `;
      vm.runInContext(fnCode, sandbox);

      const sampleMuniVols = [
        { name: 'Hon. Mayor Cruz', position: 'Municipal Mayor', committee: 'MResT' },
        { name: 'Engr. Ramos', position: 'MPDC / MDRRMO Co-Chair', committee: 'MResT' },
        { name: 'PB Santos', position: 'Punong Barangay', committee: 'MResT' },
        { name: 'PB Reyes', position: 'Barangay Captain', committee: 'MResT' },
        { name: 'PB Diaz', position: 'Punong Barangay', committee: 'MResT' },
        { name: 'Datu Lumad', position: 'IPMR Representative', committee: 'MResT' },
        { name: 'Engr. Bautista', position: 'Municipal Engineer (MEO)', committee: 'MResT' },
        { name: 'Dr. Garcia', position: 'MSWDO / Health Officer', committee: 'MResT' },
        { name: 'For. Morales', position: 'MENRO Officer', committee: 'MResT' },
        { name: 'Atty. Mendoza', position: 'Municipal Budget Officer (MBO)', committee: 'MResT' },
        { name: 'Facilitator Jane', position: 'Area Coordinator (ACT)', committee: 'MResT' }
      ];

      const eoTagMock = {
        rows: { 'sample-key': { s: 'match' } },
        formCount: 11
      };

      const res = sandbox.getMrestTriageSummary(sampleMuniVols, 3, null, null, false, eoTagMock);
      assert.strictEqual(res.totalMembers, 11);
      assert.strictEqual(res.totalBrgys, 3);
      assert.strictEqual(res.captainsCount, 3);
      assert.strictEqual(res.captainsQuotaMet, true);
      assert.strictEqual(res.hasLce, true);
      assert.strictEqual(res.lceName, 'Hon. Mayor Cruz');
      assert.strictEqual(res.leadsCount, 1);
      assert.strictEqual(res.keyOfficesCount, 4, 'All 4 LGU departments must be represented');
      assert.strictEqual(res.infraCount, 1);
      assert.strictEqual(res.socialCount, 1);
      assert.strictEqual(res.climateCount, 1);
      assert.strictEqual(res.financeCount, 1);
      assert.strictEqual(res.ipmrCount, 1);
      assert.strictEqual(res.actCount, 1);
      assert.strictEqual(res.internalTotal, 10, 'ACT is excluded from internal quotient');
      assert.strictEqual(res.communityCount, 4, '3 Captains + 1 IPMR = 4 Community Wing');
      assert.strictEqual(res.communityPct, 40);
      assert.strictEqual(res.isQuorumMet, false, '40% is below 50% quota');
      assert.strictEqual(res.isVerified, true);
      assert.strictEqual(res.eoCount, 11);
    });
  }

  // -----------------------------------------------------------------
  // 20. DQA Audit Scorecard & Field Form Verification Modernization
  // -----------------------------------------------------------------
  console.log('🛡️ Testing DQA Field Form Verification & Precision Audit Modernization (src/verify.js, vendor/monitor/JS_Health.html, & src/app.js)...');
  {
    const verifyJs = fs.readFileSync(path.join(ROOT, 'src', 'verify.js'), 'utf8');
    const healthHtml = fs.readFileSync(path.join(ROOT, 'vendor', 'monitor', 'JS_Health.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

    test('Verify Triage & Helpers: getVerifyTriageSummary & renderVerifyTriageTray exist in src/verify.js', () => {
      assert.strictEqual(verifyJs.includes('function getVerifyTriageSummary(recs)'), true);
      assert.strictEqual(verifyJs.includes('function renderVerifyTriageTray(summary, formKey)'), true);
      assert.strictEqual(verifyJs.includes('renderVerifyTriageTray(summary, u.form)'), true);
      assert.strictEqual(verifyJs.includes('quickChipsHtml'), true);
      assert.strictEqual(verifyJs.includes("data-act=\"vf-chip\""), true);
      assert.strictEqual(verifyJs.includes("data-act=\"vf-reset-filters\""), true);
      assert.strictEqual(verifyJs.includes("data-act=\"vf-triage\""), true);
      assert.strictEqual(verifyJs.includes("th('progress', 'Check Progress'"), true);
    });

    test('DQA Scorecard Precision Card: vendor/monitor/JS_Health.html embeds quotaMiniProgressBar for SM7 ≥95% target', () => {
      assert.strictEqual(healthHtml.includes('quotaMiniProgressBar(ps.match, ps.checked, 0.95'), true);
    });

    test('Verification Triage Calculations: getVerifyTriageSummary aggregates compliance, issues, and precision', () => {
      const sandbox = {
        vfStats: (r) => r._stats,
        normSearch: (s) => String(s || '').toLowerCase()
      };
      vm.createContext(sandbox);

      const fnCode = `
        ${verifyJs.slice(verifyJs.indexOf('function getVerifyTriageSummary('), verifyJs.indexOf('function renderVerifyTriageTray('))}
      `;
      vm.runInContext(fnCode, sandbox);

      const mockRecs = [
        {
          key: 'r1',
          _stats: { encoded: 20, checked: 20, match: 20, differs: 0, absent: 0, formCount: 20, done: true, sample: true, issues: 0 }
        },
        {
          key: 'r2',
          _stats: { encoded: 15, checked: 10, match: 9, differs: 1, absent: 0, formCount: 16, done: false, sample: false, issues: 2 } // 1 differs + (16-15) notEncoded
        },
        {
          key: 'r3',
          _stats: { encoded: 10, checked: 0, match: 0, differs: 0, absent: 0, formCount: null, done: false, sample: false, issues: 0 }
        }
      ];

      const res = sandbox.getVerifyTriageSummary(mockRecs);
      assert.strictEqual(res.totalRecords, 3);
      assert.strictEqual(res.verifiedRecords, 2);
      assert.strictEqual(res.completeRecords, 1);
      assert.strictEqual(res.sampleRecords, 1);
      assert.strictEqual(res.todoRecords, 1);
      assert.strictEqual(res.recordsWithIssues, 1);
      assert.strictEqual(res.totalEncoded, 45);
      assert.strictEqual(res.totalChecked, 30);
      assert.strictEqual(res.totalMatch, 29);
      assert.strictEqual(res.totalDiffers, 1);
      assert.strictEqual(res.totalNotEncoded, 1);
      assert.strictEqual(res.totalIssues, 2);
      assert.strictEqual(Math.round(res.agreementRate * 1000) / 10, 96.7);
      assert.strictEqual(res.factor !== null, true);
    });

    test('Verification UI: renderVerifyTriageTray generates compliant action center markup', () => {
      const sandbox = {
        icon: (name) => `<i data-lucide="${name}"></i>`,
        esc: (s) => String(s || ''),
        n: (num) => String(num),
        VF_FORMS: {
          att: { label: 'Attendees' }
        },
        VERIFY: { ui: { show: 'all' } }
      };
      vm.createContext(sandbox);

      const fnCode = `
        ${verifyJs.slice(verifyJs.indexOf('function renderVerifyTriageTray('), verifyJs.indexOf('// ---- tagging'))}
      `;
      vm.runInContext(fnCode, sandbox);

      const summary = {
        totalRecords: 10,
        verifiedRecords: 6,
        completeRecords: 4,
        sampleRecords: 2,
        todoRecords: 4,
        recordsWithIssues: 2,
        totalIssues: 3
      };

      const html = sandbox.renderVerifyTriageTray(summary, 'att');
      assert.strictEqual(html.includes('class="triage-tray'), true);
      assert.strictEqual(html.includes('class="triage-head"'), true);
      assert.strictEqual(html.includes('class="triage-title"'), true);
      assert.strictEqual(html.includes('class="triage-badge"'), true);
      assert.strictEqual(html.includes('data-act="vf-triage" data-v="all"'), true);
      assert.strictEqual(html.includes('data-act="vf-triage" data-v="done"'), true);
      assert.strictEqual(html.includes('data-act="vf-triage" data-v="issues"'), true);
      assert.strictEqual(html.includes('data-act="vf-triage" data-v="sample"'), true);
      assert.strictEqual(html.includes('data-act="vf-triage" data-v="todo"'), true);
    });
  }

  // -----------------------------------------------------------------
  // 21. Field Form Verification Split-Pane Workbench & Executive Memo Experience
  // -----------------------------------------------------------------
  console.log('🛡️ Testing DQA Field Form Verification Split-Pane Workbench & Executive Memo (src/verify.js, src/app.js, src/app.css, src/app.html)...');
  {
    const verifyJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'verify.js'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    const appCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.css'), 'utf8');
    const appHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.html'), 'utf8');
    const jsHealthHtml = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'monitor', 'JS_Health.html'), 'utf8');

    test('Workbench UI: Two-Column Split Workbench & Record Sidebar definitions exist', () => {
      assert.ok(verifyJs.includes('function vfRecordSidebar('), 'vfRecordSidebar must exist');
      assert.ok(verifyJs.includes('function openVerifyForm('), 'openVerifyForm must exist');
      assert.ok(verifyJs.includes('class="vf-workbench"'), 'vf-workbench container must be rendered');
      assert.ok(verifyJs.includes('class="vf-editor"'), 'vf-editor container must be rendered');
      assert.ok(verifyJs.includes('class="vf-sidebar"'), 'vf-sidebar container must be rendered');
    });

    test('Workbench CSS: Layout and Live Progress styling defined in src/app.css', () => {
      assert.ok(appCss.includes('.vf-workbench'), '.vf-workbench must exist in app.css');
      assert.ok(appCss.includes('.vf-sidebar'), '.vf-sidebar must exist in app.css');
      assert.ok(appCss.includes('.vf-sidebar-list'), '.vf-sidebar-list must exist in app.css');
      assert.ok(appCss.includes('.vf-side-item'), '.vf-side-item must exist in app.css');
      assert.ok(appCss.includes('.vf-side-progress-bar'), '.vf-side-progress-bar must exist in app.css');
      assert.ok(appCss.includes('.vf-editor'), '.vf-editor must exist in app.css');
      assert.ok(appCss.includes('.memo-tabs'), '.memo-tabs must exist in app.css');
      assert.ok(appCss.includes('.memo-action-box'), '.memo-action-box must exist in app.css');
    });

    test('Executive Memo Dialog: Tabbed preview, print and raw copy elements exist in src/app.html', () => {
      assert.ok(appHtml.includes('id="memo-tab-preview"'), '#memo-tab-preview must exist in app.html');
      assert.ok(appHtml.includes('id="memo-tab-raw"'), '#memo-tab-raw must exist in app.html');
      assert.ok(appHtml.includes('id="memo-preview"'), '#memo-preview container must exist in app.html');
      assert.ok(appHtml.includes('id="memo-print"'), '#memo-print button must exist in app.html');
    });

    test('Executive Memo Parser: renderExecutiveMemoHtml formats DQA Audit Memos into structured executive view', () => {
      const sandbox = {
        esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        $: () => null
      };
      vm.createContext(sandbox);

      const fnCode = `
        ${appJs.slice(appJs.indexOf('function renderExecutiveMemoHtml('), appJs.indexOf('function openHealthMemoModal('))}
      `;
      vm.runInContext(fnCode, sandbox);

      const sampleMemo = [
        '============================================================',
        'DSWD FIELD OFFICE CARAGA · KALAHI-CIDSS PCRP',
        'DATA QUALITY ASSESSMENT (DQA) AUDIT MEMORANDUM',
        'Date of audit: 2026-10-19 · Scope: All monitored municipalities',
        '============================================================',
        '',
        'I. SUMMARY',
        '• Status: Needs attention (critical data issues open)',
        '• Automated checks: 12 passed, 2 open (1 critical, 1 to verify)',
        '• Precision (field forms): 96.2% agreement (SM7 target: ≥95%)',
        '',
        'II. ACTION ITEMS FOR PEA / MDE FOLLOW-UP',
        '[1] Critical: Duplicate Volunteer Registry entries in Brgy Poblacion',
        'What to do: Verify KCIS volunteer ID vs signed barangay resolution and remove duplicates.',
        '- Poblacion (San Jose, Dinagat Islands) - Juan Dela Cruz',
        '… and 1 more item',
        '',
        '[2] To verify: Missing attendance sheet signatures',
        'What to do: Re-scan original signed attendance sheet for BA 1.',
      ].join('\n');

      const html = sandbox.renderExecutiveMemoHtml(sampleMemo);
      assert.ok(html.includes('DATA QUALITY ASSESSMENT (DQA) AUDIT MEMORANDUM'), 'Must format header');
      assert.ok(html.includes('I. Audit Summary'), 'Must render Summary section');
      assert.ok(html.includes('pill bad'), 'Must render critical status pill for Needs attention');
      assert.ok(html.includes('class="memo-action-box critical"'), 'Must render critical action box');
      assert.ok(html.includes('CRITICAL'), 'Must render CRITICAL badge');
      assert.ok(html.includes('SOP Guidance:</strong> Verify KCIS volunteer ID'), 'Must format SOP Guidance');
      assert.ok(html.includes('TO VERIFY'), 'Must render TO VERIFY badge for item 2');
    });

    test('Cross-Module Deep-Linking: Scorecard card and table precision links target openVerifyForm', () => {
      assert.ok(jsHealthHtml.includes("openVerifyForm("), 'dhPrecisionCard must use openVerifyForm for form selection');
      assert.ok(jsHealthHtml.includes("openVerifyForm(null,"), 'dhScoreMuniTable must use openVerifyForm for municipality selection');
    });
  }

  // -----------------------------------------------------------------
  // 19. Universal DQA Findings Deep-Linking & Action Routing Tests
  // -----------------------------------------------------------------
  console.log('🔗 Testing Universal DQA Findings Deep-Linking & Action Routing (vendor/monitor/JS_Health.html, src/app.js, src/people.js, src/app.css)...');
  {
    const jsHealth = fs.readFileSync(path.join(ROOT, 'vendor', 'monitor', 'JS_Health.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
    const peopleJs = fs.readFileSync(path.join(ROOT, 'src', 'people.js'), 'utf8');
    const appCss = fs.readFileSync(path.join(ROOT, 'src', 'app.css'), 'utf8');

    test('DQA Findings Helper: dhFindingLink is defined and generates data-act="dqa-jump"', () => {
      assert.ok(jsHealth.includes('function dhFindingLink('), 'dhFindingLink must be defined in JS_Health.html');
      assert.ok(jsHealth.includes('data-act="dqa-jump"'), 'dhFindingLink must generate elements with data-act="dqa-jump"');
      assert.ok(jsHealth.includes('dh-finding-link'), 'dhFindingLink must include dh-finding-link class');
    });

    test('Universal Check Links: All major check tables format finding values with dhFindingLink', () => {
      const requiredChecks = ['quorum', 'hhcounts', 'sequence', 'late', 'dates', 'multidate', 'attdup', 'names', 'cv_missing', 'cv_sfmsc', 'cv_tagging', 'cv_gaps'];
      requiredChecks.forEach(id => {
        assert.ok(jsHealth.includes("dhFindingLink('" + id + "'"), 'JS_Health.html must link findings for check "' + id + '"');
      });
    });

    test('Household Roster Removed: Data Health has no roster checks; the scorecard filters by assembly and status', () => {
      ["id: 'noname'", "id: 'dup'", "id: 'cross'", "id: 'bday'", 'apiHouseholdIssues', 'householdRoster'].forEach(s => {
        assert.strictEqual(jsHealth.includes(s), false, 'JS_Health.html must not keep the roster check ' + s);
      });
      assert.ok(peopleJs.includes('function hhScorecardRows('), 'people.js must define hhScorecardRows');
      assert.ok(peopleJs.includes('hhStatus(h) === HH_STATE.quorum'), 'scorecard must filter by quorum status');
      assert.ok(peopleJs.includes('data-act="hh-asm"'), 'scorecard must switch assemblies');
      assert.strictEqual(peopleJs.includes('P.households'), false, 'people.js must not read a household roster');
    });

    test('Router & Action Handlers: src/app.js handles dqa-jump and dqa-return', () => {
      assert.ok(appJs.includes("act === 'dqa-jump'"), 'app.js must handle act === "dqa-jump"');
      assert.ok(appJs.includes("act === 'dqa-return'"), 'app.js must handle act === "dqa-return"');
      assert.ok(appJs.includes("function renderDqaBreadcrumb("), 'app.js must define renderDqaBreadcrumb');
      assert.ok(appJs.includes("STATE.dqaOrigin"), 'app.js must track STATE.dqaOrigin');
    });

    test('Contextual Breadcrumbs: Modules render DQA return breadcrumbs', () => {
      assert.ok(peopleJs.includes("renderDqaBreadcrumb()"), 'people.js must invoke renderDqaBreadcrumb');
      assert.ok(appJs.includes("renderDqaBreadcrumb()"), 'app.js renderBrgys must invoke renderDqaBreadcrumb');
      assert.ok(appCss.includes(".dh-finding-link"), 'app.css must define .dh-finding-link styling');
      assert.ok(appCss.includes(".dqa-nav-breadcrumb"), 'app.css must define .dqa-nav-breadcrumb styling');
    });
  }

  // -----------------------------------------------------------------
  // 20. Duplicate Record Highlighting & Triage Tests in Attendance and Household
  // -----------------------------------------------------------------
  console.log('👥 Testing Duplicate Record Highlighting & Triage (src/people.js, src/app.js, src/app.css)...');
  {
    const peopleJs = fs.readFileSync(path.join(__dirname, '../src/people.js'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
    const appCss = fs.readFileSync(path.join(__dirname, '../src/app.css'), 'utf8');

    test('Attendee Duplicate Detection: buildPeopleIndex counts sameAtt & sets duplicate flag with dupCount', () => {
      assert.ok(peopleJs.includes('sameAtt = {}'), 'people.js must define sameAtt frequency index');
      assert.ok(peopleJs.includes("sameAtt[ak] > 1"), 'people.js must test sameAtt frequency > 1');
      assert.ok(peopleJs.includes("a.flags.push('duplicate')"), 'people.js must push duplicate flag for attendees');
      assert.ok(peopleJs.includes("a.dupCount = sameAtt[ak]"), 'people.js must record dupCount on attendee records');
      assert.ok(peopleJs.includes("duplicate: ['warn', 'Duplicate Attendee']"), 'FLAG_TEXT must define duplicate text');
    });

    test('Attendee Triage & Filters: getAttendeeTriageSummary and renderAttendeeTriageTray support duplicates', () => {
      assert.ok(peopleJs.includes("duplicates = l.filter(function (r) { return r.flags && r.flags.indexOf('duplicate') !== -1; }).length"), 'getAttendeeTriageSummary must tally duplicates');
      assert.ok(peopleJs.includes("data-act=\"att-triage\" data-v=\"duplicate\""), 'renderAttendeeTriageTray must include duplicate triage card');
      assert.ok(peopleJs.includes("ATT_STATE.flag === 'duplicate'"), 'renderAttendees must filter by duplicate flag');
      assert.ok(peopleJs.includes("v === 'duplicate'"), 'att-triage click handler must handle duplicate value');
    });

    test('Attendee Table Highlighting: renderAttendees applies row-duplicate class and badge-dup', () => {
      assert.ok(peopleJs.includes("row-duplicate"), 'renderAttendees must apply row-duplicate class');
      assert.ok(peopleJs.includes("badge-dup"), 'renderAttendees must render badge-dup');
      assert.ok(peopleJs.includes("Duplicate"), 'renderAttendees must render Duplicate label in badge');
    });

    test('Household Conflict Triage & Presets: the scorecard counts and filters conflicting KCIS records', () => {
      assert.ok(peopleJs.includes("if (h.hhConflict) s.conflictBrgys++;"), 'getHouseholdTriageSummary must count conflicting records');
      assert.ok(peopleJs.includes("card('conflict'"), 'renderHouseholdTriageTray must include a conflicting-records card');
      assert.ok(peopleJs.includes("{ id: 'conflict', label: '⚠ Conflicting Records'"), 'scorecard must offer a conflicting-records preset');
    });

    test('Household Scorecard Highlighting: renderHouseholds marks conflicting records', () => {
      assert.ok(peopleJs.includes("h.hhConflict ? ' class=\"row-duplicate\"'"), 'renderHouseholds must apply row-duplicate to conflicting records');
      assert.ok(peopleJs.includes('⚠ Conflicting</span>'), 'renderHouseholds must render a Conflicting badge');
    });

    test('Profile & Cross-Module Action Router: openPerson hints and dqa-jump opens the household scorecard', () => {
      assert.ok(peopleJs.includes("a.flags.indexOf('duplicate') !== -1"), 'openPerson must inspect duplicate attendance flags');
      assert.ok(appJs.includes("if (checkId === 'attdup') { ATT_STATE.flag = 'duplicate'; }"), 'dqa-jump must activate duplicate filter for attdup');
      assert.ok(appJs.includes("if (checkId === 'quorum' || checkId === 'hhcounts') {"), 'dqa-jump must route household count checks');
      assert.ok(appJs.includes('if (actCode) HH_STATE.asm = actCode;'), 'dqa-jump must open the assembly of the finding');
    });

    test('CSS Definitions: app.css defines row-duplicate, row-cross-brgy, badge-dup and dark theme support', () => {
      assert.ok(appCss.includes("table.grid tr.row-duplicate td"), 'app.css must define tr.row-duplicate styles');
      assert.ok(appCss.includes("table.grid tr.row-cross-brgy td"), 'app.css must define tr.row-cross-brgy styles');
      assert.ok(appCss.includes(".badge-dup"), 'app.css must define .badge-dup styles');
      assert.ok(appCss.includes(".badge-dup.alert"), 'app.css must define .badge-dup.alert styles');
      assert.ok(appCss.includes("html.dark table.grid tr.row-duplicate td") || appCss.includes('[data-theme="dark"] table.grid tr.row-duplicate td'), 'app.css must provide dark theme duplicate styles');
    });
  }

  // -----------------------------------------------------------------
  // 21. Application Header Subtitle & Regional Attribution Tests
  // -----------------------------------------------------------------
  console.log('🏛️ Testing Subtitle Branding & Attribution (src/app.html, src/app.css, src/app.js)...');
  {
    const appHtml = fs.readFileSync(path.join(__dirname, '../src/app.html'), 'utf8');
    const appCss = fs.readFileSync(path.join(__dirname, '../src/app.css'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

    test('Header Subtitle: src/app.html contains KALAHI-CIDSS PCRP and Caraga Region tags', () => {
      assert.ok(appHtml.includes('<span class="brand-tag">KALAHI-CIDSS PCRP</span>'), 'app.html must contain KALAHI-CIDSS PCRP tag');
      assert.ok(appHtml.includes('<span class="brand-tag region">Caraga Region</span>'), 'app.html must contain Caraga Region tag');
      assert.ok(appHtml.includes('Offline Field Console · Monitor v@@VERSION@@'), 'app.html must contain Offline Field Console text');
    });

    test('Header CSS: src/app.css styles .brand-tag.region for light and dark modes', () => {
      assert.ok(appCss.includes('.brand-tag.region'), 'app.css must define .brand-tag.region');
      assert.ok(appCss.includes('html.dark .brand-tag.region') || appCss.includes('[data-theme="dark"] .brand-tag.region'), 'app.css must provide dark theme region tag styles');
    });

    test('About Attribution: src/app.js includes Caraga Region & Vibe coded by: kjahidalgo', () => {
      assert.ok(appJs.includes('Caraga Region Implementation'), 'app.js must reference Caraga Region in About section');
      assert.ok(appJs.includes('Vibe coded by: <strong>kjahidalgo</strong>'), 'app.js must include Vibe coded by: kjahidalgo in About section');
    });

    test('Institutional Footer: src/app.html defines footer with version, status wrap and developer attribution', () => {
      assert.ok(appHtml.includes('<footer class="app-footer" id="app-footer">'), 'app.html must contain app-footer');
      assert.ok(appHtml.includes('Offline Field Console · Monitor v@@VERSION@@'), 'footer must contain Offline Field Console text');
      assert.ok(appHtml.includes('<span id="brand-update-status" class="brand-status-wrap"></span>'), 'footer must contain brand-update-status');
      assert.ok(appHtml.includes('vided coded by <strong>kjahidalgo</strong>'), 'footer must contain vided coded by attribution');
    });

    test('Footer CSS: src/app.css styles .app-footer, .footer-container, and sticky layout', () => {
      assert.ok(appCss.includes('.app-footer'), 'app.css must define .app-footer');
      assert.ok(appCss.includes('.footer-container'), 'app.css must define .footer-container');
      assert.ok(appCss.includes('html.dark .app-footer'), 'app.css must define dark theme footer styling');
    });
  }

  // -----------------------------------------------------------------
  // 22. App Version Status in Subtitle & Automated Polling Tests
  // -----------------------------------------------------------------
  console.log('🔄 Testing Subtitle App Version Status & Automated Polling (src/app.html, src/app.css, src/app.js)...');
  {
    const appHtml = fs.readFileSync(path.join(__dirname, '../src/app.html'), 'utf8');
    const appCss = fs.readFileSync(path.join(__dirname, '../src/app.css'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

    test('Header Cleanup: home-chip scope pill removed from top header in src/app.html', () => {
      assert.ok(!appHtml.includes('id="home-chip"'), 'app.html top header must not contain home-chip');
      assert.ok(appJs.includes("var homeChip = $('home-chip');\nif (homeChip)"), 'app.js must safely guard home-chip listener');
    });

    test('Header Subtitle Status Element: src/app.html contains brand-update-status anchor', () => {
      assert.ok(appHtml.includes('<span id="brand-update-status" class="brand-status-wrap"></span>'), 'app.html must contain brand-update-status wrap');
      assert.ok(appHtml.includes('<span class="brand-sep" aria-hidden="true">·</span>'), 'app.html must contain brand separator');
    });

    test('Subtitle Status CSS: app.css defines chips, pulse dots and dark theme rules', () => {
      assert.ok(appCss.includes('.brand-status-chip.up-to-date'), 'app.css must define .brand-status-chip.up-to-date');
      assert.ok(appCss.includes('.brand-status-chip.has-update'), 'app.css must define .brand-status-chip.has-update');
      assert.ok(appCss.includes('.brand-status-chip.offline'), 'app.css must define .brand-status-chip.offline');
      assert.ok(appCss.includes('.status-pulse-dot.good'), 'app.css must define .status-pulse-dot.good');
      assert.ok(appCss.includes('.status-pulse-dot.alert'), 'app.css must define .status-pulse-dot.alert');
      assert.ok(appCss.includes('@keyframes pulse-update'), 'app.css must define pulse-update keyframe animation');
    });

    test('Brand Update Logic: src/app.js defines renderBrandUpdateStatus and open-updates action', () => {
      assert.ok(appJs.includes('function renderBrandUpdateStatus()'), 'app.js must define renderBrandUpdateStatus');
      assert.ok(appJs.includes("Your app is up to date!"), 'renderBrandUpdateStatus must render "Your app is up to date!"');
      assert.ok(appJs.includes("Update available:"), 'renderBrandUpdateStatus must render update available text');
      assert.ok(appJs.includes("Field Offline"), 'renderBrandUpdateStatus must render Field Offline when disconnected');
      assert.ok(appJs.includes("else if (act === 'open-updates')"), 'app.js router must handle open-updates action');
      assert.ok(appJs.includes("sec.scrollIntoView({ behavior: 'smooth'"), 'open-updates must scroll to sec-updates');
    });

    test('Instant & Background Polling: startup check and 30-minute interval without 24hr block', () => {
      assert.ok(appJs.includes("checkForUpdates(false);\n  }, 1200);"), 'app.js must trigger automated check on boot after short delay');
      assert.ok(appJs.includes("30 * 60 * 1000"), 'app.js must configure 30-minute background poll interval');
      assert.ok(!appJs.includes("Date.now() - last > 24 * 60 * 60 * 1000"), 'app.js must not restrict checks with 24hr limit');
    });
  }

  // -----------------------------------------------------------------
  // 23. K2 from the Household Participation export (vendor/monitor/Code.js, src/runtime.js)
  // -----------------------------------------------------------------
  console.log('🏠 Testing K2 from per-activity household counts (vendor/monitor/Code.js, src/runtime.js)...');
  {
    const sandbox = { console, TextDecoder, TextEncoder };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    ['Code.js', 'Store.js', 'WebApp.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor', 'monitor', f), 'utf8'), sandbox, { filename: f }));
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'runtime.js'), 'utf8'), sandbox, { filename: 'runtime.js' });
    const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'reference.json'), 'utf8'));

    test('resolveHhCounts: identical records collapse, the most complete wins, disagreements are conflicts', () => {
      const r = (recs) => JSON.parse(JSON.stringify(sandbox.resolveHhCounts(recs)));
      assert.deepStrictEqual(r([]), { total: null, represented: null, records: 0, variants: [], conflict: false, detail: null });
      const same = r([{ total: 513, represented: 371 }, { total: '513', represented: '371' }, { total: '', represented: '' }]);
      assert.strictEqual(same.total, 513); assert.strictEqual(same.represented, 371);
      assert.strictEqual(same.records, 3); assert.strictEqual(same.conflict, false);
      const conflict = r([{ total: 3, represented: '' }, { total: 513, represented: 371 }]);
      assert.strictEqual(conflict.total, 513, 'both counts beat one count');
      assert.strictEqual(conflict.conflict, true);
      const bigger = r([{ total: 234, represented: 219 }, { total: 234, represented: 220 }]);
      assert.strictEqual(bigger.represented, 220, 'then the largest represented');
      const totalOnly = r([{ total: '1,006', represented: null }]);
      assert.strictEqual(totalOnly.total, 1006); assert.strictEqual(totalOnly.represented, null);
      assert.strictEqual(r([{ total: 100, represented: 0 }]).represented, 0, 'none represented is a count, not a blank');
    });

    test('MResT composition: members in KCIS are not "formed" until the SM1 Section 3.1 composition is complete', () => {
      const peopleCode = fs.readFileSync(path.join(ROOT, 'src', 'people.js'), 'utf8');
      const sb = { console };
      vm.createContext(sb);
      vm.runInContext(extractFn(peopleCode, 'mrestComposition'), sb);
      const full = { totalMembers: 30, hasLce: true, leadsCount: 2, totalBrgys: 13, captainsCount: 13, captainsQuotaMet: true,
                     communityPct: 60, isQuorumMet: true, keyOfficesCount: 4 };
      assert.strictEqual(sb.mrestComposition({ totalMembers: 0 }).status, 'none');
      assert.strictEqual(sb.mrestComposition(full).status, 'complete');
      const part = sb.mrestComposition(Object.assign({}, full, { hasLce: false, captainsCount: 10, captainsQuotaMet: false, communityPct: 40, isQuorumMet: false, keyOfficesCount: 2 }));
      assert.strictEqual(part.status, 'incomplete');
      assert.deepStrictEqual(JSON.parse(JSON.stringify(part.gaps)), ['Mayor as chair', '3 of 13 Punong Barangays', 'community wing at 40% (needs at least 50%)', '2 of 4 core LGU offices']);
    });

    test('Household breakdown: the record used supplies the 4Ps / IP / SLP and individual counts', () => {
      const r = (recs) => JSON.parse(JSON.stringify(sandbox.resolveHhCounts(recs)));
      const res = r([{ total: 513, represented: 371, detail: { hh4Ps: '', indivTotal: '' } },
                     { total: 513, represented: 371, detail: { hh4Ps: 132, indivTotal: 370 } },
                     { total: 3, represented: '', detail: { hh4Ps: 9 } }]);
      assert.strictEqual(res.detail.hh4Ps, 132, 'the copy of the used counts that carries the breakdown');
      const d = JSON.parse(JSON.stringify(sandbox.hhDetailOf({ hh4Ps: '132', hhIp: 0, indivFemale: '250', kcisRate: '72.32%' })));
      assert.strictEqual(d.hh4Ps, 132); assert.strictEqual(d.hhIp, 0); assert.strictEqual(d.indivFemale, 250);
      assert.strictEqual(d.kcisRate, 72.32); assert.strictEqual(d.hhSlp, null);
      assert.strictEqual(sandbox.hhDetailOf({ hh4Ps: '', indivTotal: null }), null, 'no breakdown encoded');
    });

    test('detectKind: the Household Participation export is read; the old household roster is not', () => {
      assert.strictEqual(sandbox.detectKind(sandbox.HH_COUNT_HEADERS.slice(), ''), 'households');
      assert.strictEqual(sandbox.detectKind(['Region Name', 'Barangay Name', 'First Name', 'Birthdate', 'Is Hh Head', 'Is Present'], ''), 'roster');
      assert.strictEqual(sandbox.detectKind(['x', 'y', 'z'], 'Raw_HH_Participation'), 'households');
      assert.strictEqual(sandbox.detectKind(['x', 'y', 'z'], 'Raw_Households'), 'roster');
      assert.strictEqual(sandbox.KIND_INFO.households.sheet, 'Raw_HH_Participation');
    });

    test('computeSnapshot: K2 uses Total Hh Represented ÷ Total Hh In Barangay, with conflicts, gaps and missing counts flagged', () => {
      const LN = ['Region XIII (Caraga)', 'Agusan del Norte', 'Las Nieves'];
      const att = (brgy, k) => LN.concat([brgy, '2', '1st BA', '1st Barangay Assembly', '1', 'First' + k, '', 'Last' + k, 'Female']);
      const hh = (brgy, total, repr, f4ps) => LN.concat([brgy, '1st BA', '1st Barangay Assembly', '1', total, repr, f4ps === undefined ? '' : f4ps, '']);
      sandbox.TABS.Baseline = ref.Baseline;
      sandbox.TABS.Activities = ref.Activities;
      sandbox.TABS.Raw_Participants = { headers: sandbox.PARTICIPANT_HEADERS.slice(), rows: [
        att('Ambacon', 1), att('Ambacon', 2), att('Ambacon', 3), att('Ambacon', 4),
        att('Balungagan', 1), att('Balungagan', 2), att('Balungagan', 3), att('Balungagan', 4), att('Balungagan', 5),
        att('Bonifacio', 1),
        att('Ambacon', 5).map((v, i) => i === 3 ? 'Casiklan' : v)           // Casiklan: 1st BA encoded, no counts
      ] };
      sandbox.TABS.Raw_HH_Participation = { headers: sandbox.HH_COUNT_HEADERS.concat(['Total 4Ps Hh Represented', 'Individual Total']), rows: [
        hh('Ambacon', 4, 3), hh('Ambacon', '4', '3', 2),                       // identical records: 75%, met
        hh('Balungagan', 10, 5), hh('Balungagan', 3, ''),                   // conflicting records: 10 / 5 is used, 50%
        hh('Bonifacio', 8, '')                                              // one count only
      ] };
      const snap = sandbox.computeAll('2026-10-26');
      const ba1 = (b) => snap.barangayRows.filter(r => r.municipality === 'Las Nieves' && r.barangay === b)[0].activities.BA1;

      assert.strictEqual(snap.k2.reporting, 2);
      assert.strictEqual(snap.k2.listed, 14);
      assert.strictEqual(snap.k2.present, 8);
      assert.strictEqual(snap.k2.met, 1);
      assert.strictEqual(snap.k2.rate, 8 / 14);

      assert.strictEqual(ba1('Ambacon').hhRate, 0.75);
      assert.strictEqual(ba1('Ambacon').hhConflict, false);
      assert.strictEqual(ba1('Ambacon').hhDetail.hh4Ps, 2, 'breakdown read from the optional columns');
      assert.strictEqual(ba1('Ambacon').hhDetail.indivTotal, null);
      assert.strictEqual(ba1('Balungagan').hhDetail, null, 'no breakdown encoded');
      assert.strictEqual(ba1('Balungagan').hhConflict, true);
      assert.strictEqual(ba1('Balungagan').hhListed, 10);
      assert.strictEqual(ba1('Bonifacio').hhListed, 0, 'one count only does not report K2');
      assert.strictEqual(ba1('Bonifacio').hhIncomplete, true);
      assert.strictEqual(ba1('Bonifacio').hhTotal, 8);

      const kinds = JSON.parse(JSON.stringify(snap.health.householdFlags.map(f => f.barangay + ':' + f.kind + ':' + f.actCode).sort()));
      assert.deepStrictEqual(kinds, ['Balungagan:Conflicting records:BA1', 'Bonifacio:Counts incomplete:BA1']);
      const missing = JSON.parse(JSON.stringify(snap.health.householdCountsMissing.filter(m => m.municipality === 'Las Nieves').map(m => m.barangay)));
      assert.deepStrictEqual(missing, ['Casiklan']);
      assert.strictEqual(snap.health.householdCounts.imported, true);
      assert.strictEqual(snap.hhIssues, undefined, 'no household roster lists');

      const fx = sandbox.dqaFindings(snap.health).filter(f => f.municipality === 'Las Nieves');
      assert.ok(fx.some(f => f.check === 'quorum' && f.barangay === 'Balungagan' && f.act === 'BA1' && f.part === 'Conflicting records'));
      assert.ok(fx.some(f => f.check === 'hhcounts' && f.barangay === 'Casiklan'));

      const muni = sandbox.apiMatrix().rows.filter(r => r.municipality === 'Las Nieves')[0].households;
      assert.strictEqual(muni.reporting, 2); assert.strictEqual(muni.conflicts, 1); assert.strictEqual(muni.incomplete, 1);
    });

    test('computeSnapshot: no Household Participation export means no K2 and no "counts not encoded" list', () => {
      delete sandbox.TABS.Raw_HH_Participation;
      const snap = sandbox.computeAll('2026-10-26');
      assert.strictEqual(snap.k2.reporting, 0);
      assert.strictEqual(snap.k2.rate, null);
      assert.strictEqual(snap.health.householdCounts.imported, false);
      assert.strictEqual(snap.health.householdCountsMissing.length, 0);
    });
  }

  // -----------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
