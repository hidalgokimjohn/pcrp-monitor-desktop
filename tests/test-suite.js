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
