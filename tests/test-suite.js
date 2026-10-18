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
        SAVE_TABLES: ['Raw_Participants', 'Raw_Households', 'Raw_Volunteers'],
        SAVE_FORMAT: 'pcrp-desktop-save',
        SAVED: { current: null, ledger: {}, available: true, dataStamp: '' },
        SNAP: null,
        HH_LISTS: null,
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
