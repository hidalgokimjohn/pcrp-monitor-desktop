import React, { useState } from 'react';

/**
 * MagicPath Interactive Showcase Component
 * PCRP Encoding and Data Quality Assessment Tool
 * Target Audience: M&E Officers, Community Workers, Municipal Staff, Local Mayors.
 * Language: 100% Non-Technical Community & KALAHI-CIDSS PCRP Terminology.
 * Guidelines: Fluid responsive, centered, zero device mockups, fully interactive state machine.
 */

export type DqaDimension =
  | 'overview'
  | 'accuracy'
  | 'reliability'
  | 'completeness'
  | 'precision'
  | 'timeliness'
  | 'integrity'
  | 'scorecard';

interface PrecisionAuditRow {
  id: string;
  paperName: string;
  paperSex: string;
  paperDob: string;
  kcisName: string;
  kcisSex: string;
  kcisDob: string;
  status: 'match' | 'typo' | 'date_swap' | 'purged';
  note: string;
}

const INITIAL_AUDIT_ROWS: PrecisionAuditRow[] = [
  {
    id: 'AR-01',
    paperName: 'Maria L. Santos',
    paperSex: 'F',
    paperDob: '03/12/1984',
    kcisName: 'MARIA L. SANTOS',
    kcisSex: 'F',
    kcisDob: '1984-03-12',
    status: 'match',
    note: 'Exact match with physical ink signature on paper sheet'
  },
  {
    id: 'AR-02',
    paperName: 'Jose R. Bautista',
    paperSex: 'M',
    paperDob: '11/02/1979',
    kcisName: 'JOSE R. BAUTISTA',
    kcisSex: 'M',
    kcisDob: '1979-11-02',
    status: 'match',
    note: 'Exact match with physical ink signature on paper sheet'
  },
  {
    id: 'AR-03',
    paperName: 'Rowena D. Villanueva',
    paperSex: 'F',
    paperDob: '05/30/1991',
    kcisName: 'ROWENA D. VILLANUENA',
    kcisSex: 'F',
    kcisDob: '1991-05-30',
    status: 'typo',
    note: 'Typo in KCIS: Surname typed with N instead of V'
  },
  {
    id: 'AR-04',
    paperName: 'Danilo P. Reyes',
    paperSex: 'M',
    paperDob: '07/21/1990',
    kcisName: 'DANILO P. REYES',
    kcisSex: 'M',
    kcisDob: '1990-21-07',
    status: 'date_swap',
    note: 'Date error: Day and month were swapped during typing'
  },
  {
    id: 'AR-05',
    paperName: '— (No physical signature on paper form) —',
    paperSex: '—',
    paperDob: '—',
    kcisName: 'ARNEL T. RAMOS',
    kcisSex: 'M',
    kcisDob: '1975-08-14',
    status: 'purged',
    note: 'Not on paper form: Typed in KCIS without verified attendance signature'
  }
];

export default function PCRPConsoleShowcase() {
  const [activeTab, setActiveTab] = useState<DqaDimension>('overview');
  const [municipality] = useState('San Isidro, Leyte (19 Barangays)');

  // Interactive Live Fix Toggles
  const [fixAccuracyFutureDate, setFixAccuracyFutureDate] = useState(false);
  const [fixAccuracyBirthyear, setFixAccuracyBirthyear] = useState(false);
  const [fixReliabilitySplit, setFixReliabilitySplit] = useState(false);
  const [fixCompletenessOrder, setFixCompletenessOrder] = useState(false);
  const [fixIntegrityCollision, setFixIntegrityCollision] = useState(false);
  const [timelinessDelayDays, setTimelinessDelayDays] = useState(8);

  // Precision Filter Tab
  const [precisionFilter, setPrecisionFilter] = useState<'all' | 'match' | 'anomalies'>('all');

  // Compute Live Composite DQA Health Score
  const computeScore = () => {
    let score = 76.5;
    if (fixAccuracyFutureDate) score += 4.5;
    if (fixAccuracyBirthyear) score += 3.5;
    if (fixReliabilitySplit) score += 5.5;
    if (fixCompletenessOrder) score += 3.0;
    if (fixIntegrityCollision) score += 4.0;
    if (timelinessDelayDays <= 0) score += 2.8;
    return Math.min(99.8, score);
  };

  const compositeScore = computeScore();

  const filteredAuditRows = INITIAL_AUDIT_ROWS.filter(row => {
    if (precisionFilter === 'match') return row.status === 'match';
    if (precisionFilter === 'anomalies') return row.status !== 'match';
    return true;
  });

  return (
    <div className="w-full min-h-screen bg-[#05070c] text-white font-sans flex flex-col justify-between selection:bg-blue-500/30">
      {/* Top Swiss Architectural Header */}
      <header className="w-full border-b border-white/10 bg-[#090d16]/80 backdrop-blur-xl px-8 py-5 flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500" />
            <span className="font-mono text-xs font-bold tracking-[0.2em] uppercase text-blue-400">
              DSWD · KALAHI-CIDSS PCRP · MONITORING &amp; EVALUATION
            </span>
            <span className="font-mono text-xs text-zinc-500">|</span>
            <span className="font-mono text-xs text-emerald-400 font-semibold">100% OFFLINE</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white mt-1">
            PCRP Encoding and Data Quality Assessment Tool
          </h1>
        </div>

        {/* Real-time Health Dial Metric */}
        <div className="flex items-center gap-6">
          <div className="border-l border-white/10 pl-5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">Municipality</div>
            <div className="font-mono text-sm font-semibold text-zinc-200">{municipality}</div>
          </div>
          <div className="border-l border-white/10 pl-5 text-right">
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">Overall Data Quality</div>
            <div className="font-mono text-2xl font-black text-emerald-400">
              {compositeScore.toFixed(1)}%
            </div>
          </div>
        </div>
      </header>

      {/* Non-Technical Dimension Tabs */}
      <nav className="w-full border-b border-white/10 bg-[#070a12] px-8 overflow-x-auto">
        <div className="flex gap-2 min-w-max py-2">
          {[
            { id: 'overview', num: '00', label: 'Community Overview' },
            { id: 'accuracy', num: 'D1', label: '1. Accuracy (Katumpakan)' },
            { id: 'reliability', num: 'D2', label: '2. Reliability (Tiyak na Quorum)' },
            { id: 'completeness', num: 'D3', label: '3. Completeness (Ganap na Hakbang)' },
            { id: 'precision', num: 'D4', label: '4. Precision (Paper vs KCIS)' },
            { id: 'timeliness', num: 'D5', label: '5. Timeliness (7-Day Rule)' },
            { id: 'integrity', num: 'D6', label: '6. Integrity (Walang Pagdoble)' },
            { id: 'scorecard', num: '11', label: 'Scorecard & Excel Report' }
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as DqaDimension)}
                className={`px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition flex items-center gap-2.5 ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-bold">
                  {tab.num}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Dimension Canvas */}
      <main className="w-full max-w-7xl mx-auto flex-1 p-8">
        {/* ============================================================== */}
        {/* OVERVIEW TAB                                                   */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="font-mono text-xs font-bold tracking-[0.24em] text-blue-400 uppercase">
                  COMMUNITY FIELD REALITIES
                </span>
                <h2 className="text-4xl font-black tracking-tight text-white mt-2 leading-none">
                  747 BARANGAYS.<br />
                  34,390 ATTENDANCE SIGNATURES.<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                    HONEST, ACCURATE REPORTS.
                  </span>
                </h2>
                <p className="text-zinc-400 text-base mt-4 leading-relaxed">
                  The PCRP Encoding and Data Quality Assessment Tool helps Monitoring and Evaluation officers and community staff ensure field records are completely honest and error-free. It runs safely on your laptop without the internet, checking attendance sheets, household quorums, and volunteer rosters in seconds.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
                  <div className="border-l-2 border-blue-500 pl-3">
                    <div className="font-mono text-3xl font-black text-white">747</div>
                    <div className="font-mono text-[10px] text-zinc-500 uppercase">Barangays</div>
                  </div>
                  <div className="border-l-2 border-emerald-500 pl-3">
                    <div className="font-mono text-3xl font-black text-white">34,390</div>
                    <div className="font-mono text-[10px] text-zinc-500 uppercase">Signatures Checked</div>
                  </div>
                  <div className="border-l-2 border-purple-500 pl-3">
                    <div className="font-mono text-3xl font-black text-white">6</div>
                    <div className="font-mono text-[10px] text-zinc-500 uppercase">DQA Dimensions</div>
                  </div>
                  <div className="border-l-2 border-amber-500 pl-3">
                    <div className="font-mono text-3xl font-black text-white">18</div>
                    <div className="font-mono text-[10px] text-zinc-500 uppercase">Audit Checks</div>
                  </div>
                </div>
              </div>

              {/* Architectural Tri-Stream Stack */}
              <div className="space-y-4">
                <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs font-bold text-blue-400">FILE 01 // PARTICIPANTS</div>
                    <div className="text-lg font-bold text-white mt-1">Participant Attendance List</div>
                    <div className="text-xs text-zinc-400">34,390 attendance rows across 14 community assemblies.</div>
                  </div>
                  <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
                    CHECKED (0.4s)
                  </span>
                </div>

                <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs font-bold text-purple-400">FILE 02 // HOUSEHOLDS</div>
                    <div className="text-lg font-bold text-white mt-1">Household Masterlist</div>
                    <div className="text-xs text-zinc-400">12,450 household heads used to compute official meeting quorum.</div>
                  </div>
                  <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    QUORUM READY
                  </span>
                </div>

                <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs font-bold text-emerald-400">FILE 03 // VOLUNTEERS</div>
                    <div className="text-lg font-bold text-white mt-1">Community Volunteers</div>
                    <div className="text-xs text-zinc-400">1,820 elected officers in BResT and SFMSC project committees.</div>
                  </div>
                  <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    OFFICERS LINKED
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* D1: ACCURACY                                                   */}
        {/* ============================================================== */}
        {activeTab === 'accuracy' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <span className="font-mono text-xs font-bold tracking-[0.2em] text-red-400 uppercase">
                DIMENSION 01 // ACCURACY (KATUMPAKAN)
              </span>
              <h2 className="text-3xl font-black text-white mt-1">Catching Advance Dates &amp; Fixing Names</h2>
              <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
                Catches meetings encoded ahead in the future, strips typing noise like extra slashes, and fixes impossible birth years.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Future Date Intercept */}
              <div className="p-6 rounded-xl border border-red-500/30 bg-red-950/10 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-red-400">BRGY. SAN ROQUE // 1ST BA</span>
                    <span className={`font-mono text-xs px-2 py-0.5 rounded font-bold ${fixAccuracyFutureDate ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                      {fixAccuracyFutureDate ? '✓ CORRECTED' : '⚠ ENCODED IN FUTURE'}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-white mt-3">
                    {fixAccuracyFutureDate ? 'Meeting Date: Sep 24, 2026 (Actual Paper Date)' : 'Meeting Date: Nov 24, 2026 (+40 Days Ahead)'}
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">
                    Month and day were accidentally swapped during typing, putting a September meeting into November.
                  </p>
                </div>
                <button
                  onClick={() => setFixAccuracyFutureDate(!fixAccuracyFutureDate)}
                  className="mt-6 w-full py-2.5 rounded-lg font-mono text-xs font-bold tracking-wider bg-white/10 hover:bg-white/20 text-white transition"
                >
                  {fixAccuracyFutureDate ? 'REVERT TO WRONG DATE' : 'FIX AND RE-ANCHOR TO ACTUAL DATE'}
                </button>
              </div>

              {/* Orthographic Noise & Birthyear Rectifier */}
              <div className="p-6 rounded-xl border border-amber-500/30 bg-amber-950/10 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-400">BRGY. LIBAS // ROW #11,209</span>
                    <span className={`font-mono text-xs px-2 py-0.5 rounded font-bold ${fixAccuracyBirthyear ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {fixAccuracyBirthyear ? '✓ FIXED' : '⚠ TYPOS &amp; WRONG AGE'}
                    </span>
                  </div>
                  <div className="font-mono text-lg font-bold text-white mt-3">
                    {fixAccuracyBirthyear ? 'JUAN DELA CRUZ · Age: 44 (Born: 1982-05-14)' : 'DELA CRUZZ , JUAAN /// · Age: 134 (Born: 1892-05-14)'}
                  </div>
                  <p className="text-xs text-zinc-400 mt-2">
                    Extra slashes and an inverted century digit make the resident show up as 134 years old in official records.
                  </p>
                </div>
                <button
                  onClick={() => setFixAccuracyBirthyear(!fixAccuracyBirthyear)}
                  className="mt-6 w-full py-2.5 rounded-lg font-mono text-xs font-bold tracking-wider bg-white/10 hover:bg-white/20 text-white transition"
                >
                  {fixAccuracyBirthyear ? 'REVERT TO TYPO' : 'CLEAN TYPOS AND FIX BIRTH YEAR'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* D2: RELIABILITY                                                */}
        {/* ============================================================== */}
        {activeTab === 'reliability' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <span className="font-mono text-xs font-bold tracking-[0.2em] text-amber-400 uppercase">
                DIMENSION 02 // RELIABILITY (TIYAK NA QUORUM)
              </span>
              <h2 className="text-3xl font-black text-white mt-1">Combining Split Dates for Honest Quorum</h2>
              <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
                Combines assembly sessions held over multiple dates into one certified meeting, preventing attendance from exceeding 100% of households.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="p-8 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col items-center text-center">
                <div className="font-mono text-xs uppercase tracking-widest text-zinc-400">Meeting Quorum Percentage</div>
                <div className={`font-mono text-6xl font-black mt-2 ${fixReliabilitySplit ? 'text-emerald-400' : 'text-red-500'}`}>
                  {fixReliabilitySplit ? '88.2%' : '167.3%'}
                </div>
                <div className="font-mono text-xs text-zinc-400 mt-2">
                  {fixReliabilitySplit
                    ? '97 Verified Unique Households ÷ 110 Total Barangay Households'
                    : '184 Total Split Claims ÷ 110 Total Barangay Households'}
                </div>
                <div className={`font-mono text-[11px] px-3 py-1 rounded-full mt-4 font-bold ${fixReliabilitySplit ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                  {fixReliabilitySplit ? '✓ CERTIFIED MEETING QUORUM' : '⚠ IMPOSSIBLE PARTICIPATION OVER-CLAIM'}
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
                  <div className="font-mono text-xs text-zinc-400">FIRST SESSION · APR 05, 2026</div>
                  <div className="text-base font-bold text-white mt-1">Brgy. Mabini 1st BA (First Session)</div>
                  <div className="font-mono text-xs text-zinc-400">98 Attendees Recorded</div>
                </div>

                <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
                  <div className="font-mono text-xs text-zinc-400">SECOND SESSION · APR 12, 2026</div>
                  <div className="text-base font-bold text-white mt-1">Brgy. Mabini 1st BA (Continued Session)</div>
                  <div className="font-mono text-xs text-zinc-400">86 Attendees Recorded</div>
                </div>

                <button
                  onClick={() => setFixReliabilitySplit(!fixReliabilitySplit)}
                  className="w-full py-3 rounded-lg font-mono text-xs font-bold tracking-wider bg-blue-600 hover:bg-blue-500 text-white transition shadow-lg shadow-blue-600/30"
                >
                  {fixReliabilitySplit ? 'UNLINK SPLIT SESSIONS' : 'COMBINE UNDER BARANGAY RESOLUTION #14'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* D3: COMPLETENESS                                              */}
        {/* ============================================================== */}
        {activeTab === 'completeness' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <span className="font-mono text-xs font-bold tracking-[0.2em] text-blue-400 uppercase">
                DIMENSION 03 // COMPLETENESS (GANAP NA HAKBANG)
              </span>
              <h2 className="text-3xl font-black text-white mt-1">Checking Steps in Proper Order &amp; GAD Reports</h2>
              <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
                Makes sure community steps happen in proper sequence and ensures all attendees have their sex recorded for Gender and Development (GAD) reporting.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs font-bold text-blue-400 uppercase">14 Statutory Steps in Sequence</span>
                <span className={`font-mono text-xs font-bold ${fixCompletenessOrder ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {fixCompletenessOrder ? '✓ ALL STEPS IN PROPER ORDER' : '⚠ OUT-OF-ORDER STEP DETECTED'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 font-mono text-xs text-center">
                {['01 1BA', '02 PRA', '03 2BA', '04 PSA', '05 MIBF', '06 3BA', '07 BResT', '08 SFMSC', '09 M&E', '10 PO', '11 4BA', '12 IMPL', '13 5BA', '14 AUD'].map((m, idx) => {
                  const isBlocked = !fixCompletenessOrder && idx === 2;
                  return (
                    <div
                      key={m}
                      className={`p-3 rounded-lg border ${
                        isBlocked
                          ? 'bg-red-500/20 border-red-500 text-red-300 font-bold animate-pulse'
                          : 'bg-white/5 border-white/10 text-zinc-300'
                      }`}
                    >
                      {m}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10">
                <div className="text-xs text-zinc-400">
                  {fixCompletenessOrder
                    ? '1st Barangay Assembly is finalized before 2nd BA is encoded.'
                    : 'Stage 03 (2nd BA) was encoded before Stage 01 (1st BA) attendance was finalized.'}
                </div>
                <button
                  onClick={() => setFixCompletenessOrder(!fixCompletenessOrder)}
                  className="px-4 py-2 rounded-lg font-mono text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition"
                >
                  {fixCompletenessOrder ? 'SIMULATE STEP GAP' : 'ENFORCE PROPER STEP SEQUENCE'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* D4: PRECISION (SM7 TABLE 8)                                    */}
        {/* ============================================================== */}
        {activeTab === 'precision' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="font-mono text-xs font-bold tracking-[0.2em] text-emerald-400 uppercase">
                  DIMENSION 04 // PRECISION (SM7 TABLE 8)
                </span>
                <h2 className="text-3xl font-black text-white mt-1">Comparing Signed Paper Sheets vs KCIS</h2>
                <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
                  Audits a 10% sample of original paper attendance sheets against KCIS computer records to find exact matches, spelling typos, or names encoded without signatures.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {(['all', 'match', 'anomalies'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setPrecisionFilter(f)}
                    className={`font-mono text-xs px-3 py-1.5 rounded-lg font-semibold uppercase ${
                      precisionFilter === f
                        ? 'bg-emerald-500 text-black font-bold'
                        : 'bg-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.01]">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-white/5 text-zinc-400 border-b border-white/10">
                  <tr>
                    <th className="p-3.5">SAMPLE #</th>
                    <th className="p-3.5">ORIGINAL SIGNED FORM (PAPER)</th>
                    <th className="p-3.5">KCIS COMPUTER RECORDS</th>
                    <th className="p-3.5">AUDIT RESULT</th>
                    <th className="p-3.5">EXPLANATION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAuditRows.map(row => (
                    <tr key={row.id} className="hover:bg-white/[0.02] transition">
                      <td className="p-3.5 text-zinc-500 font-bold">{row.id}</td>
                      <td className="p-3.5">
                        <div className="font-semibold text-zinc-200">{row.paperName}</div>
                        <div className="text-[10px] text-zinc-500">
                          {row.paperSex} · {row.paperDob}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-white">{row.kcisName}</div>
                        <div className="text-[10px] text-zinc-400">
                          {row.kcisSex} · {row.kcisDob}
                        </div>
                      </td>
                      <td className="p-3.5">
                        {row.status === 'match' && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                            ✓ EXACT MATCH
                          </span>
                        )}
                        {row.status === 'typo' && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                            ▲ SPELLING TYPO
                          </span>
                        )}
                        {row.status === 'date_swap' && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                            ▲ DAY/MONTH SWAPPED
                          </span>
                        )}
                        {row.status === 'purged' && (
                          <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">
                            ✕ NOT ON PAPER FORM
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-zinc-400 text-[11px]">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* D5: TIMELINESS                                                 */}
        {/* ============================================================== */}
        {activeTab === 'timeliness' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <span className="font-mono text-xs font-bold tracking-[0.2em] text-amber-400 uppercase">
                DIMENSION 05 // TIMELINESS (TAKDANG PANAHON)
              </span>
              <h2 className="text-3xl font-black text-white mt-1">The 7-Day Encoding Rule</h2>
              <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
                Assemblies must be encoded within 7 days of being held in the barangay to prevent late reporting flags.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="p-8 rounded-xl border border-white/10 bg-white/[0.02] text-center">
                <div className="font-mono text-xs uppercase tracking-widest text-zinc-400">Days to Encode</div>
                <div className={`font-mono text-5xl font-black mt-2 ${timelinessDelayDays <= 0 ? 'text-emerald-400' : 'text-red-500'}`}>
                  {timelinessDelayDays <= 0 ? 'ON-TIME (WITHIN 7 DAYS)' : `+${timelinessDelayDays} DAYS OVERDUE`}
                </div>
                <div className="font-mono text-xs text-zinc-400 mt-2">
                  7-Day Rule: Meeting Held Oct 01 ⟶ Encoded Oct 16 (15 Days Total)
                </div>
              </div>

              <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02] space-y-4">
                <label className="block font-mono text-xs text-zinc-300">
                  Simulate Encoding Delay (Days past 7-day rule):
                </label>
                <input
                  type="range"
                  min="0"
                  max="14"
                  value={timelinessDelayDays}
                  onChange={e => setTimelinessDelayDays(Number(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between font-mono text-xs text-zinc-500">
                  <span>0 Days (On-Time)</span>
                  <span>7 Days Late</span>
                  <span>14 Days Late</span>
                </div>
                <button
                  onClick={() => setTimelinessDelayDays(0)}
                  className="w-full py-2.5 rounded-lg font-mono text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition mt-2"
                >
                  MARK AS ON-TIME AND CLEAR OVERDUE FLAG
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* D6: INTEGRITY                                                  */}
        {/* ============================================================== */}
        {activeTab === 'integrity' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <span className="font-mono text-xs font-bold tracking-[0.2em] text-purple-400 uppercase">
                DIMENSION 06 // INTEGRITY (WALANG PAGDOBLE)
              </span>
              <h2 className="text-3xl font-black text-white mt-1">Preventing Double Counting Across Barangays</h2>
              <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
                Detects when the same family head is listed in two different barangays at the same time, preventing duplicate counts.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-purple-500/30 bg-purple-950/10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-purple-400">DUPLICATE FAMILY HEAD AUDIT</span>
                  <span className={`font-mono text-xs px-2 py-0.5 rounded font-bold ${fixIntegrityCollision ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                    {fixIntegrityCollision ? '✓ RESOLVED TO PRIMARY RESIDENCE' : '⚠ REGISTERED IN TWO BARANGAYS'}
                  </span>
                </div>
                <div className="text-2xl font-bold text-white mt-2">Ramon Gutierrez (HH #042 &amp; #118)</div>
                <div className="text-xs text-zinc-400 mt-1">
                  Registered as household head in Barangay Maligaya and Barangay San Pedro at the same time.
                </div>
              </div>

              <button
                onClick={() => setFixIntegrityCollision(!fixIntegrityCollision)}
                className="px-6 py-3 rounded-lg font-mono text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition shadow-lg shadow-purple-600/30 shrink-0"
              >
                {fixIntegrityCollision ? 'RESTORE DUPLICATE' : 'KEEP ONLY IN PRIMARY RESIDENCE'}
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SCORECARD & 4-SHEET EXPORT                                     */}
        {/* ============================================================== */}
        {activeTab === 'scorecard' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <span className="font-mono text-xs font-bold tracking-[0.2em] text-emerald-400 uppercase">
                THE REPORT // READY FOR YOUR MAYOR &amp; REGIONAL DIRECTORS
              </span>
              <h2 className="text-3xl font-black text-white mt-1">Clean 4-Sheet Excel Report Ready in Seconds</h2>
              <p className="text-zinc-400 text-sm mt-1 max-w-3xl">
                Exports all findings into a formatted Excel file (.xlsx) and a safe .pcrp file ready for executive presentation.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                <div className="font-mono text-[10px] text-blue-400 font-bold uppercase">SHEET 01 // SUMMARY</div>
                <div className="text-base font-bold text-white mt-1">Municipal Progress Summary</div>
                <div className="text-xs text-zinc-400 mt-2">14 milestone steps and municipal readiness indicators.</div>
              </div>

              <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                <div className="font-mono text-[10px] text-purple-400 font-bold uppercase">SHEET 02 // BENCHMARKS</div>
                <div className="text-base font-bold text-white mt-1">Comparing Barangays</div>
                <div className="text-xs text-zinc-400 mt-2">San Isidro performance indexed against provincial and regional averages.</div>
              </div>

              <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                <div className="font-mono text-[10px] text-emerald-400 font-bold uppercase">SHEET 03 // REGISTER</div>
                <div className="text-base font-bold text-white mt-1">19 Barangay Quorums</div>
                <div className="text-xs text-zinc-400 mt-2">Certified attendance totals and meeting resolutions.</div>
              </div>

              <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                <div className="font-mono text-[10px] text-amber-400 font-bold uppercase">SHEET 04 // AUDIT</div>
                <div className="text-base font-bold text-white mt-1">SM7 Table 8 Fix List</div>
                <div className="text-xs text-zinc-400 mt-2">Actionable list of items to fix before regional review.</div>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-950/10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-mono text-xs font-bold text-emerald-400">ONE-CLICK EXPORT</div>
                <div className="text-lg font-bold text-white mt-1">Ready for Municipal Mayor &amp; Regional Meetings</div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => alert('Exporting PCRP_Findings_San_Isidro.xlsx...')}
                  className="px-5 py-2.5 rounded-lg font-mono text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/30"
                >
                  DOWNLOAD 4-SHEET EXCEL REPORT
                </button>
                <button
                  onClick={() => alert('Saving San_Isidro_2026-10-15.pcrp file...')}
                  className="px-5 py-2.5 rounded-lg font-mono text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition"
                >
                  SAVE .PCRP BACKUP
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Swiss Bottom Institutional Footer */}
      <footer className="w-full border-t border-white/10 bg-[#06080e] px-8 py-4 flex flex-wrap items-center justify-between text-xs text-zinc-500 font-mono">
        <div>DSWD · KALAHI-CIDSS PCRP · REPUBLIC ACT 10173 DATA PRIVACY COMPLIANT</div>
        <div className="flex items-center gap-4">
          <span>SM7 TABLE 8 DQA STANDARD</span>
          <span>·</span>
          <span className="text-zinc-300">100% OFFLINE ON YOUR COMPUTER</span>
        </div>
      </footer>
    </div>
  );
}
