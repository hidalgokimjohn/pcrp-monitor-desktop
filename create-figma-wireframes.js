const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'figma-wireframes');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// Common SVG Header & Navigation Components
function renderHeader(activeScope = 'Not Selected', isReady = false) {
  return `
    <!-- Top Header -->
    <rect x="0" y="0" width="1440" height="70" fill="#0F172A" />
    <!-- Brand Mark & Logo -->
    <rect x="32" y="15" width="40" height="40" rx="8" fill="#0038A8" />
    <path d="M44 35 L49 40 L60 27" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    <text x="84" y="34" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">PCRP Encoding &amp; Data Quality Assessment Tool</text>
    <text x="84" y="50" font-family="Inter, sans-serif" font-size="12" fill="#94A3B8">KALAHI-CIDSS PCRP · Offline Field Console · Monitor v2.4</text>

    <!-- Scope Pill -->
    <rect x="520" y="18" width="300" height="34" rx="17" fill="#1E293B" stroke="#334155" stroke-width="1" />
    <circle cx="538" cy="35" r="5" fill="${isReady ? '#16A34A' : '#F59E0B'}" />
    <text x="552" y="40" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#F8FAFC">Scope: ${escapeXml(activeScope)}</text>
    <text x="790" y="39" font-family="Inter, sans-serif" font-size="11" fill="#64748B">Change ▾</text>

    <!-- Right Header Actions -->
    <rect x="1140" y="18" width="110" height="34" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1" />
    <text x="1195" y="40" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#F8FAFC" text-anchor="middle">⚙ Settings</text>

    <rect x="1265" y="18" width="145" height="34" rx="6" fill="${isReady ? '#0038A8' : '#334155'}" />
    <text x="1337" y="40" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="${isReady ? '#FFFFFF' : '#94A3B8'}" text-anchor="middle">↓ Export to Excel</text>
  `;
}

function renderNavBar(activeTab = 'overview') {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'kpisummary', label: 'KPI Summary' },
    { id: 'munis', label: 'Municipalities' },
    { id: 'brgys', label: 'Barangays' },
    { id: 'attendance', label: 'Attendance & Households ▾' },
    { id: 'volunteers', label: 'Volunteers & Committees ▾' },
    { id: 'mrest', label: 'MResT' },
    { id: 'dqa', label: 'DQA & Verification ▾' }
  ];

  let x = 32;
  const tabElements = tabs.map(t => {
    const isActive = t.id === activeTab;
    const width = t.label.length * 8 + 32;
    const elem = `
      <g transform="translate(${x}, 0)">
        ${isActive ? `<rect x="0" y="10" width="${width}" height="36" rx="6" fill="#EFF6FF" />` : ''}
        <text x="${width / 2}" y="32" font-family="Inter, sans-serif" font-size="13" font-weight="${isActive ? '700' : '500'}" fill="${isActive ? '#0038A8' : '#475569'}" text-anchor="middle">${escapeXml(t.label)}</text>
        ${isActive ? `<rect x="12" y="44" width="${width - 24}" height="3" rx="1.5" fill="#0038A8" />` : ''}
      </g>
    `;
    x += width + 8;
    return elem;
  }).join('');

  return `
    <rect x="0" y="70" width="1440" height="48" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" />
    ${tabElements}
  `;
}

// -------------------------------------------------------------
// Screen 1: Settings & Data Import
// -------------------------------------------------------------
function generateScreen1() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 960" width="1440" height="960">
  <defs>
    <filter id="shadow-card" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.06"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect x="0" y="0" width="1440" height="960" fill="#F8FAFC" />

  ${renderHeader('San Jose (PEA / MDM)', false)}
  ${renderNavBar('settings')}

  <!-- Main Container: Sidebar + Content -->
  <!-- Left Sidebar (Settings Navigation) -->
  <g transform="translate(32, 138)">
    <rect x="0" y="0" width="280" height="780" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
    
    <!-- Sidebar Header -->
    <text x="24" y="36" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#0F172A">Settings &amp; Setup</text>
    <text x="24" y="54" font-family="Inter, sans-serif" font-size="12" fill="#64748B">Workspace Configuration</text>
    <rect x="180" y="24" width="76" height="22" rx="11" fill="#DCFCE7" />
    <text x="218" y="39" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#15803D" text-anchor="middle">100% Offline</text>
    <line x1="20" y1="70" x2="260" y2="70" stroke="#F1F5F9" stroke-width="1" />

    <!-- Menu Items -->
    <!-- Item 1 (Active) -->
    <rect x="16" y="86" width="248" height="48" rx="8" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="1" />
    <circle cx="40" cy="110" r="12" fill="#DBEAFE" />
    <text x="40" y="114" font-family="Inter, sans-serif" font-size="12" fill="#1D4ED8" text-anchor="middle">↑</text>
    <text x="64" y="106" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#1D4ED8">Data Import</text>
    <text x="64" y="122" font-family="Inter, sans-serif" font-size="11" fill="#60A5FA">KCIS exports &amp; status</text>

    <!-- Item 2 -->
    <text x="64" y="160" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#334155">Municipal Scope</text>
    <text x="64" y="176" font-family="Inter, sans-serif" font-size="11" fill="#94A3B8">PEA / MDM or RPMO</text>

    <!-- Item 3 -->
    <text x="64" y="214" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#334155">Baseline Reference</text>
    <text x="64" y="230" font-family="Inter, sans-serif" font-size="11" fill="#94A3B8">Barangay masterlist</text>

    <!-- Item 4 -->
    <text x="64" y="268" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#334155">Field Conduct</text>
    <text x="64" y="284" font-family="Inter, sans-serif" font-size="11" fill="#94A3B8">Per-activity status</text>

    <!-- Item 5 -->
    <text x="64" y="322" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#334155">KCIS Pull Date</text>
    <text x="64" y="338" font-family="Inter, sans-serif" font-size="11" fill="#94A3B8">Attendance window</text>

    <!-- Item 6 -->
    <text x="64" y="376" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#334155">App Updates &amp; Rules</text>
    <text x="64" y="392" font-family="Inter, sans-serif" font-size="11" fill="#94A3B8">Release &amp; audit rules</text>

    <!-- Bottom Button -->
    <rect x="20" y="710" width="240" height="44" rx="8" fill="#CBD5E1" />
    <text x="140" y="737" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#64748B" text-anchor="middle">Show Findings (Load files)</text>
  </g>

  <!-- Right Content Area -->
  <g transform="translate(332, 138)">
    <!-- Session Status Bar -->
    <rect x="0" y="0" width="1076" height="52" rx="10" fill="#F1F5F9" stroke="#E2E8F0" stroke-width="1" />
    <circle cx="28" cy="26" r="6" fill="#3B82F6" />
    <text x="44" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#1E293B">Session Status: Waiting for raw KCIS data files · Encrypted client-side storage active</text>
    <rect x="910" y="12" width="146" height="28" rx="6" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />
    <text x="983" y="30" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#475569" text-anchor="middle">📁 Open Saved Session</text>

    <!-- Step 1: Import Card -->
    <g transform="translate(0, 68)">
      <rect x="0" y="0" width="1076" height="420" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
      
      <circle cx="36" cy="38" r="16" fill="#0038A8" />
      <text x="36" y="43" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle">1</text>
      <text x="64" y="36" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0F172A">Import KCIS Data Exports</text>
      <text x="64" y="56" font-family="Inter, sans-serif" font-size="13" fill="#64748B">Drop files here all at once or one by one. Files are processed locally in your browser memory.</text>
      
      <!-- Big Drag and Drop Target -->
      <g transform="translate(32, 80)">
        <rect x="0" y="0" width="1012" height="230" rx="12" fill="#F8FAFC" stroke="#94A3B8" stroke-width="2" stroke-dasharray="8 8" />
        <circle cx="506" cy="70" r="32" fill="#EFF6FF" />
        <path d="M494 70 L506 58 L518 70 M506 60 L506 82" fill="none" stroke="#0038A8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <text x="506" y="130" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#1E293B" text-anchor="middle">Drop .xlsx, .csv, or .pcrp session files here, or browse computer</text>
        <text x="506" y="154" font-family="Inter, sans-serif" font-size="13" fill="#64748B" text-anchor="middle">Supports Participants Export · Household Roster · Community Volunteer List</text>
        
        <!-- File type badges -->
        <rect x="360" y="176" width="90" height="26" rx="13" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="1" />
        <text x="405" y="193" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#1D4ED8" text-anchor="middle">.xlsx Excel</text>
        
        <rect x="462" y="176" width="90" height="26" rx="13" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1" />
        <text x="507" y="193" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#B45309" text-anchor="middle">.csv Exports</text>

        <rect x="564" y="176" width="116" height="26" rx="13" fill="#DCFCE7" stroke="#BBF7D0" stroke-width="1" />
        <text x="622" y="193" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#15803D" text-anchor="middle">.pcrp Encrypted</text>
      </g>

      <!-- Action buttons -->
      <g transform="translate(32, 336)">
        <rect x="0" y="0" width="180" height="48" rx="8" fill="#0038A8" />
        <text x="90" y="29" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle">▶ Show Findings</text>

        <rect x="196" y="0" width="140" height="48" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />
        <text x="266" y="29" font-family="Inter, sans-serif" font-size="14" font-weight="600" fill="#64748B" text-anchor="middle">Clear files</text>

        <text x="980" y="28" font-family="Inter, sans-serif" font-size="12" fill="#94A3B8" text-anchor="end">Protected under RA 10173 (Data Privacy Act)</text>
      </g>
    </g>

    <!-- Step 2: Role & Municipal Scope Card -->
    <g transform="translate(0, 508)">
      <rect x="0" y="0" width="1076" height="250" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
      
      <circle cx="36" cy="38" r="16" fill="#0038A8" />
      <text x="36" y="43" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle">2</text>
      <text x="64" y="36" font-family="Inter, sans-serif" font-size="18" font-weight="700" fill="#0F172A">Select Workspace Role &amp; Geographic Scope</text>
      <text x="64" y="56" font-family="Inter, sans-serif" font-size="13" fill="#64748B">Strict data isolation ensures municipal field evaluators only access their designated LGU.</text>

      <!-- Role Option A (PEA / MDM) -->
      <g transform="translate(32, 80)">
        <rect x="0" y="0" width="490" height="130" rx="10" fill="#EFF6FF" stroke="#0038A8" stroke-width="2" />
        <circle cx="28" cy="28" r="10" fill="#0038A8" />
        <circle cx="28" cy="28" r="4" fill="#FFFFFF" />
        <text x="48" y="32" font-family="Inter, sans-serif" font-size="15" font-weight="700" fill="#0F172A">PEA / MDM (Municipal Field Workspace)</text>
        <text x="48" y="54" font-family="Inter, sans-serif" font-size="12" fill="#475569">Strictly isolates navigation, verification, and Excel reports to 1 LGU.</text>
        
        <!-- Municipality Selector Dropdown Mock -->
        <rect x="48" y="70" width="410" height="38" rx="6" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1" />
        <text x="64" y="94" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0038A8">Municipality: San Jose, Dinagat Islands (12 Barangays)</text>
        <text x="440" y="93" font-family="Inter, sans-serif" font-size="12" fill="#64748B">▾</text>
      </g>

      <!-- Role Option B (RPMO Regional) -->
      <g transform="translate(554, 80)">
        <rect x="0" y="0" width="490" height="130" rx="10" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5" />
        <circle cx="28" cy="28" r="10" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2" />
        <text x="48" y="32" font-family="Inter, sans-serif" font-size="15" font-weight="700" fill="#0F172A">Regional RPMO (Executive Oversight)</text>
        <text x="48" y="54" font-family="Inter, sans-serif" font-size="12" fill="#475569">Access to all 26 monitored LGUs, regional matrices, and cross-LGU audits.</text>
        <rect x="48" y="76" width="130" height="26" rx="6" fill="#F1F5F9" />
        <text x="113" y="93" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#64748B" text-anchor="middle">26 LGUs · 516 Brgys</text>
      </g>
    </g>
  </g>
</svg>
  `;
}

// -------------------------------------------------------------
// Screen 2: Overview Dashboard (Active Monitor Findings)
// -------------------------------------------------------------
function generateScreen2() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 960" width="1440" height="960">
  <defs>
    <filter id="shadow-card" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.06"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="1440" height="960" fill="#F8FAFC" />

  ${renderHeader('San Jose, Dinagat Islands · 12 Barangays', true)}
  ${renderNavBar('overview')}

  <!-- Page Main Content Area -->
  <g transform="translate(32, 138)">
    
    <!-- Top Filter & Context Bar -->
    <rect x="0" y="0" width="1376" height="52" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
    <text x="24" y="32" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="#0F172A">Stage 1: Community Empowerment &amp; Social Mobilization Status</text>
    <rect x="520" y="12" width="100" height="28" rx="14" fill="#0038A8" />
    <text x="570" y="30" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF" text-anchor="middle">Stage 1 Active</text>
    <rect x="630" y="12" width="90" height="28" rx="14" fill="#F1F5F9" />
    <text x="675" y="30" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#64748B" text-anchor="middle">Stage 2</text>
    <text x="1352" y="31" font-family="Inter, sans-serif" font-size="12" fill="#64748B" text-anchor="end">Data as of: Oct 18, 2026 (KCIS Pull)</text>

    <!-- KPI Metric Cards Grid -->
    <g transform="translate(0, 68)">
      <!-- KPI 1 -->
      <g transform="translate(0, 0)">
        <rect x="0" y="0" width="260" height="106" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
        <text x="20" y="28" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#64748B">TOTAL ATTENDANCE</text>
        <text x="20" y="66" font-family="Inter, sans-serif" font-size="28" font-weight="800" fill="#0F172A">4,821</text>
        <rect x="180" y="18" width="64" height="22" rx="11" fill="#DCFCE7" />
        <text x="212" y="33" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#15803D" text-anchor="middle">+12.4%</text>
        <text x="20" y="90" font-family="Inter, sans-serif" font-size="11" fill="#475569">62.8% Female Participation</text>
      </g>

      <!-- KPI 2 -->
      <g transform="translate(278, 0)">
        <rect x="0" y="0" width="260" height="106" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
        <text x="20" y="28" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#64748B">UNIQUE ATTENDEES</text>
        <text x="20" y="66" font-family="Inter, sans-serif" font-size="28" font-weight="800" fill="#0F172A">2,145</text>
        <text x="20" y="90" font-family="Inter, sans-serif" font-size="11" fill="#475569">Across 12 Barangays</text>
      </g>

      <!-- KPI 3 -->
      <g transform="translate(556, 0)">
        <rect x="0" y="0" width="260" height="106" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
        <text x="20" y="28" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#64748B">70% QUORUM COMPLIANCE</text>
        <text x="20" y="66" font-family="Inter, sans-serif" font-size="28" font-weight="800" fill="#15803D">10 / 12</text>
        <rect x="180" y="18" width="64" height="22" rx="11" fill="#DCFCE7" />
        <text x="212" y="33" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#15803D" text-anchor="middle">83.3%</text>
        <text x="20" y="90" font-family="Inter, sans-serif" font-size="11" fill="#15803D">2 Lacking Quorum</text>
      </g>

      <!-- KPI 4 -->
      <g transform="translate(834, 0)">
        <rect x="0" y="0" width="260" height="106" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
        <text x="20" y="28" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#64748B">COMMUNITY VOLUNTEERS</text>
        <text x="20" y="66" font-family="Inter, sans-serif" font-size="28" font-weight="800" fill="#0F172A">384</text>
        <text x="20" y="90" font-family="Inter, sans-serif" font-size="11" fill="#475569">58.3% Women · 12 BResT Teams</text>
      </g>

      <!-- KPI 5 -->
      <g transform="translate(1112, 0)">
        <rect x="0" y="0" width="264" height="106" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
        <text x="20" y="28" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#64748B">DQA INTEGRITY SCORE</text>
        <text x="20" y="66" font-family="Inter, sans-serif" font-size="28" font-weight="800" fill="#0038A8">96.8%</text>
        <rect x="184" y="18" width="64" height="22" rx="11" fill="#EFF6FF" />
        <text x="216" y="33" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#0038A8" text-anchor="middle">Grade A</text>
        <text x="20" y="90" font-family="Inter, sans-serif" font-size="11" fill="#475569">Zero Duplicate Violations</text>
      </g>
    </g>

    <!-- Pipeline Milestone Cards -->
    <g transform="translate(0, 190)">
      <rect x="0" y="0" width="1376" height="130" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
      <text x="24" y="32" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="#0F172A">Stage 1 Milestones Pipeline Progress (San Jose)</text>

      <!-- Activity 1 -->
      <g transform="translate(24, 52)">
        <text x="0" y="16" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#1E293B">1. 1st Barangay Assembly</text>
        <text x="270" y="16" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#15803D" text-anchor="end">100% Conducted</text>
        <rect x="0" y="24" width="270" height="10" rx="5" fill="#E2E8F0" />
        <rect x="0" y="24" width="270" height="10" rx="5" fill="#16A34A" />
        <text x="0" y="50" font-family="Inter, sans-serif" font-size="11" fill="#64748B">12/12 Encoded · 70% Quorum Met</text>
      </g>

      <!-- Activity 2 -->
      <g transform="translate(364, 52)">
        <text x="0" y="16" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#1E293B">2. BResT Formation &amp; Valid.</text>
        <text x="270" y="16" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#15803D" text-anchor="end">100% Completed</text>
        <rect x="0" y="24" width="270" height="10" rx="5" fill="#E2E8F0" />
        <rect x="0" y="24" width="270" height="10" rx="5" fill="#16A34A" />
        <text x="0" y="50" font-family="Inter, sans-serif" font-size="11" fill="#64748B">12 Teams · 184 Volunteers</text>
      </g>

      <!-- Activity 3 -->
      <g transform="translate(704, 52)">
        <text x="0" y="16" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#1E293B">3. PSA &amp; Action Planning</text>
        <text x="270" y="16" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#D97706" text-anchor="end">83.3% Encoded</text>
        <rect x="0" y="24" width="270" height="10" rx="5" fill="#E2E8F0" />
        <rect x="0" y="24" width="225" height="10" rx="5" fill="#F59E0B" />
        <text x="0" y="50" font-family="Inter, sans-serif" font-size="11" fill="#64748B">10/12 Encoded · 2 In-Progress</text>
      </g>

      <!-- Activity 4 -->
      <g transform="translate(1044, 52)">
        <text x="0" y="16" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#1E293B">4. 2nd Barangay Assembly</text>
        <text x="270" y="16" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#DC2626" text-anchor="end">58.3% Encoded</text>
        <rect x="0" y="24" width="270" height="10" rx="5" fill="#E2E8F0" />
        <rect x="0" y="24" width="157" height="10" rx="5" fill="#EF4444" />
        <text x="0" y="50" font-family="Inter, sans-serif" font-size="11" fill="#64748B">7/12 Encoded · 5 Pending Upload</text>
      </g>
    </g>

    <!-- Barangay Data Table Mockup -->
    <g transform="translate(0, 336)">
      <rect x="0" y="0" width="1376" height="450" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
      
      <!-- Table Search & Toolbar -->
      <text x="24" y="36" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#0F172A">Barangay Progress &amp; Quorum Scorecard</text>
      <rect x="940" y="16" width="260" height="34" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1" />
      <text x="960" y="38" font-family="Inter, sans-serif" font-size="12" fill="#94A3B8">🔍 Search barangay name...</text>
      
      <rect x="1212" y="16" width="140" height="34" rx="6" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="1" />
      <text x="1282" y="38" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#0038A8" text-anchor="middle">↓ CSV Download</text>

      <!-- Table Header Row -->
      <g transform="translate(0, 64)">
        <rect x="0" y="0" width="1376" height="40" fill="#F1F5F9" />
        <text x="24" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">BARANGAY</text>
        <text x="240" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">HOUSEHOLD POP.</text>
        <text x="400" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">1ST BA ATTENDEES</text>
        <text x="590" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">PARTICIPATION RATE</text>
        <text x="790" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">70% QUORUM STATUS</text>
        <text x="1020" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">BREST TEAM</text>
        <text x="1230" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">ACTIONS</text>
      </g>

      <!-- Table Rows Mockup -->
      <!-- Row 1 -->
      <g transform="translate(0, 104)">
        <rect x="0" y="0" width="1376" height="48" fill="#FFFFFF" stroke="#F1F5F9" stroke-width="1" />
        <text x="24" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Aurelio (Poblacion)</text>
        <text x="240" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">342 HH</text>
        <text x="400" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">288 HH</text>
        <text x="590" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#15803D">84.2%</text>
        <rect x="790" y="12" width="110" height="24" rx="12" fill="#DCFCE7" />
        <text x="845" y="28" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#15803D" text-anchor="middle">✓ Quorum Met</text>
        <text x="1020" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">16 Members (Compliant)</text>
        <text x="1230" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0038A8">View Details →</text>
      </g>

      <!-- Row 2 -->
      <g transform="translate(0, 152)">
        <rect x="0" y="0" width="1376" height="48" fill="#F8FAFC" stroke="#F1F5F9" stroke-width="1" />
        <text x="24" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Cuarinta</text>
        <text x="240" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">218 HH</text>
        <text x="400" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">178 HH</text>
        <text x="590" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#15803D">81.7%</text>
        <rect x="790" y="12" width="110" height="24" rx="12" fill="#DCFCE7" />
        <text x="845" y="28" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#15803D" text-anchor="middle">✓ Quorum Met</text>
        <text x="1020" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">14 Members (Compliant)</text>
        <text x="1230" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0038A8">View Details →</text>
      </g>

      <!-- Row 3 (Lacking Quorum) -->
      <g transform="translate(0, 200)">
        <rect x="0" y="0" width="1376" height="48" fill="#FEF2F2" stroke="#FEE2E2" stroke-width="1" />
        <text x="24" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#991B1B">Don Ruben Ecleo</text>
        <text x="240" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">450 HH</text>
        <text x="400" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">292 HH</text>
        <text x="590" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#DC2626">64.9%</text>
        <rect x="790" y="12" width="126" height="24" rx="12" fill="#FEE2E2" />
        <text x="853" y="28" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#991B1B" text-anchor="middle">⚠ Quorum Not Met</text>
        <text x="1020" y="30" font-family="Inter, sans-serif" font-size="13" fill="#991B1B">Needs Reseating</text>
        <text x="1230" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#DC2626">Resolve Issue →</text>
      </g>

      <!-- Row 4 -->
      <g transform="translate(0, 248)">
        <rect x="0" y="0" width="1376" height="48" fill="#FFFFFF" stroke="#F1F5F9" stroke-width="1" />
        <text x="24" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Jacquez</text>
        <text x="240" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">186 HH</text>
        <text x="400" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">148 HH</text>
        <text x="590" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#15803D">79.6%</text>
        <rect x="790" y="12" width="110" height="24" rx="12" fill="#DCFCE7" />
        <text x="845" y="28" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#15803D" text-anchor="middle">✓ Quorum Met</text>
        <text x="1020" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">15 Members (Compliant)</text>
        <text x="1230" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0038A8">View Details →</text>
      </g>

      <!-- Row 5 -->
      <g transform="translate(0, 296)">
        <rect x="0" y="0" width="1376" height="48" fill="#F8FAFC" stroke="#F1F5F9" stroke-width="1" />
        <text x="24" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Magsaysay</text>
        <text x="240" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">274 HH</text>
        <text x="400" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">210 HH</text>
        <text x="590" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#15803D">76.6%</text>
        <rect x="790" y="12" width="110" height="24" rx="12" fill="#DCFCE7" />
        <text x="845" y="28" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#15803D" text-anchor="middle">✓ Quorum Met</text>
        <text x="1020" y="30" font-family="Inter, sans-serif" font-size="13" fill="#334155">15 Members (Compliant)</text>
        <text x="1230" y="30" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0038A8">View Details →</text>
      </g>
    </g>
  </g>
</svg>
  `;
}

// -------------------------------------------------------------
// Screen 3: DQA & Field Form Verification
// -------------------------------------------------------------
function generateScreen3() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 960" width="1440" height="960">
  <defs>
    <filter id="shadow-card" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.06"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="1440" height="960" fill="#F8FAFC" />

  ${renderHeader('San Jose, Dinagat Islands · 12 Barangays', true)}
  ${renderNavBar('dqa')}

  <!-- Main Verification Workspace -->
  <g transform="translate(32, 138)">
    
    <!-- Top DQA Banner & Controls -->
    <rect x="0" y="0" width="1376" height="74" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
    <text x="24" y="32" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="#0F172A">Field Verification against Physical Source Documents (SM7 Table 8)</text>
    <text x="24" y="54" font-family="Inter, sans-serif" font-size="12" fill="#64748B">Audit KCIS digital records against physical Attendance Sheets, Household Rosters, and Volunteer Oath forms.</text>
    
    <!-- DQA Actions -->
    <rect x="850" y="18" width="180" height="38" rx="6" fill="#0038A8" />
    <text x="940" y="42" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF" text-anchor="middle">🎲 Generate Random 10% Sample</text>

    <rect x="1042" y="18" width="150" height="38" rx="6" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="1" />
    <text x="1117" y="42" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#0038A8" text-anchor="middle">📄 DQA Audit Memo</text>

    <rect x="1204" y="18" width="150" height="38" rx="6" fill="#F1F5F9" stroke="#CBD5E1" stroke-width="1" />
    <text x="1279" y="42" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#334155" text-anchor="middle">⚡ Sync Delta (.pcrpd)</text>

    <!-- 4 SM7 Core Dimension Scorecards -->
    <g transform="translate(0, 90)">
      <!-- Dimension 1: Completeness -->
      <g transform="translate(0, 0)">
        <rect x="0" y="0" width="326" height="94" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
        <text x="20" y="28" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#64748B">COMPLETENESS</text>
        <text x="20" y="60" font-family="Inter, sans-serif" font-size="24" font-weight="800" fill="#15803D">98.4%</text>
        <text x="20" y="80" font-family="Inter, sans-serif" font-size="11" fill="#475569">Mandatory fields complete</text>
        <circle cx="280" cy="47" r="18" fill="#DCFCE7" />
        <text x="280" y="52" font-family="Inter, sans-serif" font-size="14" fill="#15803D" text-anchor="middle">✓</text>
      </g>

      <!-- Dimension 2: Timeliness (7-Day Rule) -->
      <g transform="translate(350, 0)">
        <rect x="0" y="0" width="326" height="94" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
        <text x="20" y="28" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#64748B">TIMELINESS (7-DAY RULE)</text>
        <text x="20" y="60" font-family="Inter, sans-serif" font-size="24" font-weight="800" fill="#15803D">91.8%</text>
        <text x="20" y="80" font-family="Inter, sans-serif" font-size="11" fill="#475569">Encoded within 7 days of conduct</text>
        <circle cx="280" cy="47" r="18" fill="#DCFCE7" />
        <text x="280" y="52" font-family="Inter, sans-serif" font-size="14" fill="#15803D" text-anchor="middle">✓</text>
      </g>

      <!-- Dimension 3: Validity & Consistency -->
      <g transform="translate(700, 0)">
        <rect x="0" y="0" width="326" height="94" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
        <text x="20" y="28" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#64748B">VALIDITY &amp; LOGIC</text>
        <text x="20" y="60" font-family="Inter, sans-serif" font-size="24" font-weight="800" fill="#D97706">89.2%</text>
        <text x="20" y="80" font-family="Inter, sans-serif" font-size="11" fill="#B45309">14 Age / Date warnings</text>
        <circle cx="280" cy="47" r="18" fill="#FEF3C7" />
        <text x="280" y="52" font-family="Inter, sans-serif" font-size="14" fill="#B45309" text-anchor="middle">!</text>
      </g>

      <!-- Dimension 4: Integrity & Uniqueness -->
      <g transform="translate(1050, 0)">
        <rect x="0" y="0" width="326" height="94" rx="10" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
        <text x="20" y="28" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#64748B">INTEGRITY &amp; ACCURACY</text>
        <text x="20" y="60" font-family="Inter, sans-serif" font-size="24" font-weight="800" fill="#15803D">100.0%</text>
        <text x="20" y="80" font-family="Inter, sans-serif" font-size="11" fill="#15803D">0 Duplicate / Ghost Records</text>
        <circle cx="280" cy="47" r="18" fill="#DCFCE7" />
        <text x="280" y="52" font-family="Inter, sans-serif" font-size="14" fill="#15803D" text-anchor="middle">★</text>
      </g>
    </g>

    <!-- Field Verification Table -->
    <g transform="translate(0, 204)">
      <rect x="0" y="0" width="1376" height="580" rx="12" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#shadow-card)" />
      
      <!-- Table Filters -->
      <g transform="translate(24, 18)">
        <text x="0" y="22" font-family="Inter, sans-serif" font-size="15" font-weight="700" fill="#0F172A">Sampled Verification Records (Random 10% Protocol)</text>
        
        <rect x="680" y="2" width="220" height="32" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1" />
        <text x="700" y="22" font-family="Inter, sans-serif" font-size="12" fill="#64748B">Filter: All Source Forms ▾</text>

        <rect x="912" y="2" width="200" height="32" rx="6" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1" />
        <text x="932" y="22" font-family="Inter, sans-serif" font-size="12" fill="#64748B">Audit Status: Pending ▾</text>

        <rect x="1124" y="2" width="200" height="32" rx="6" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="1" />
        <text x="1224" y="22" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#0038A8" text-anchor="middle">Save Verification Tags</text>
      </g>

      <!-- Table Header -->
      <g transform="translate(0, 64)">
        <rect x="0" y="0" width="1376" height="40" fill="#F1F5F9" />
        <text x="24" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">SAMPLE ID</text>
        <text x="140" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">BARANGAY</text>
        <text x="290" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">ACTIVITY / SOURCE FORM</text>
        <text x="520" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">PARTICIPANT / REPRESENTATIVE</text>
        <text x="800" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">KCIS DATE</text>
        <text x="920" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">PHYSICAL MATCH</text>
        <text x="1150" y="25" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#475569">VERIFICATION TAG</text>
      </g>

      <!-- Row 1 (Verified Match) -->
      <g transform="translate(0, 104)">
        <rect x="0" y="0" width="1376" height="52" fill="#FFFFFF" stroke="#F1F5F9" stroke-width="1" />
        <text x="24" y="31" font-family="Inter, sans-serif" font-size="12" font-family="monospace" fill="#64748B">#SMP-041</text>
        <text x="140" y="31" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Aurelio</text>
        <text x="290" y="31" font-family="Inter, sans-serif" font-size="13" fill="#334155">1st BA Attendance Sheet (Form 1)</text>
        <text x="520" y="31" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0038A8">Dela Cruz, Maria Santos</text>
        <text x="800" y="31" font-family="Inter, sans-serif" font-size="12" fill="#64748B">2026-05-12</text>
        <text x="920" y="31" font-family="Inter, sans-serif" font-size="13" fill="#15803D">✓ Signature matches sheet</text>
        <rect x="1150" y="14" width="94" height="24" rx="12" fill="#DCFCE7" />
        <text x="1197" y="30" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#15803D" text-anchor="middle">VERIFIED</text>
      </g>

      <!-- Row 2 (Verified Match) -->
      <g transform="translate(0, 156)">
        <rect x="0" y="0" width="1376" height="52" fill="#F8FAFC" stroke="#F1F5F9" stroke-width="1" />
        <text x="24" y="31" font-family="Inter, sans-serif" font-size="12" font-family="monospace" fill="#64748B">#SMP-042</text>
        <text x="140" y="31" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Cuarinta</text>
        <text x="290" y="31" font-family="Inter, sans-serif" font-size="13" fill="#334155">Household Roster (K2 Form)</text>
        <text x="520" y="31" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0038A8">Macapagal, Rodrigo B.</text>
        <text x="800" y="31" font-family="Inter, sans-serif" font-size="12" fill="#64748B">2026-05-14</text>
        <text x="920" y="31" font-family="Inter, sans-serif" font-size="13" fill="#15803D">✓ Listed in Household Masterlist</text>
        <rect x="1150" y="14" width="94" height="24" rx="12" fill="#DCFCE7" />
        <text x="1197" y="30" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#15803D" text-anchor="middle">VERIFIED</text>
      </g>

      <!-- Row 3 (Discrepancy Tagged) -->
      <g transform="translate(0, 208)">
        <rect x="0" y="0" width="1376" height="52" fill="#FFFBEB" stroke="#FEF3C7" stroke-width="1" />
        <text x="24" y="31" font-family="Inter, sans-serif" font-size="12" font-family="monospace" fill="#B45309">#SMP-043</text>
        <text x="140" y="31" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Don Ruben</text>
        <text x="290" y="31" font-family="Inter, sans-serif" font-size="13" fill="#334155">BResT Volunteer Profile</text>
        <text x="520" y="31" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0038A8">Villanueva, Elena G.</text>
        <text x="800" y="31" font-family="Inter, sans-serif" font-size="12" fill="#64748B">2026-05-20</text>
        <text x="920" y="31" font-family="Inter, sans-serif" font-size="13" fill="#B45309">⚠ Birthdate mismatch (1988 vs 1989)</text>
        <rect x="1150" y="14" width="120" height="24" rx="12" fill="#FEF3C7" />
        <text x="1210" y="30" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#B45309" text-anchor="middle">DISCREPANCY</text>
      </g>

      <!-- Row 4 (Pending) -->
      <g transform="translate(0, 260)">
        <rect x="0" y="0" width="1376" height="52" fill="#FFFFFF" stroke="#F1F5F9" stroke-width="1" />
        <text x="24" y="31" font-family="Inter, sans-serif" font-size="12" font-family="monospace" fill="#64748B">#SMP-044</text>
        <text x="140" y="31" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0F172A">Jacquez</text>
        <text x="290" y="31" font-family="Inter, sans-serif" font-size="13" fill="#334155">1st BA Attendance Sheet (Form 1)</text>
        <text x="520" y="31" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="#0038A8">Alcantara, Jun Perez</text>
        <text x="800" y="31" font-family="Inter, sans-serif" font-size="12" fill="#64748B">2026-05-15</text>
        <text x="920" y="31" font-family="Inter, sans-serif" font-size="13" fill="#94A3B8">Pending physical sheet check...</text>
        <rect x="1150" y="14" width="94" height="24" rx="12" fill="#F1F5F9" />
        <text x="1197" y="30" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#64748B" text-anchor="middle">UNCHECKED</text>
      </g>
    </g>
  </g>
</svg>
  `;
}

// -------------------------------------------------------------
// Combined Multi-Board Canvas for Figma (All 3 Views Side-by-Side)
// -------------------------------------------------------------
function generateAllScreensCanvas() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4600 1150" width="4600" height="1150">
  <defs>
    <filter id="shadow-card" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.06"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="4600" height="1150" fill="#090E1A" />

  <!-- Canvas Header -->
  <text x="60" y="60" font-family="Inter, sans-serif" font-size="28" font-weight="800" fill="#FFFFFF">PCRP Monitor Desktop — Figma Master UI Wireframe System</text>
  <text x="60" y="90" font-family="Inter, sans-serif" font-size="16" fill="#94A3B8">KALAHI-CIDSS PCRP Offline Field Console · 1440x960 Desktop Frames · Production Wireframe Specification</text>

  <!-- Frame 1 -->
  <g transform="translate(60, 130)">
    <rect x="-4" y="-36" width="220" height="28" rx="6" fill="#1E293B" />
    <text x="10" y="-18" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#38BDF8">01 · Settings &amp; Data Import</text>
    <rect x="0" y="0" width="1440" height="960" rx="8" fill="#FFFFFF" />
    <g transform="translate(0, 0)">
      ${generateScreen1().replace(/<\/?svg[^>]*>/g, '')}
    </g>
  </g>

  <!-- Frame 2 -->
  <g transform="translate(1560, 130)">
    <rect x="-4" y="-36" width="220" height="28" rx="6" fill="#1E293B" />
    <text x="10" y="-18" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#38BDF8">02 · Overview Dashboard</text>
    <rect x="0" y="0" width="1440" height="960" rx="8" fill="#FFFFFF" />
    <g transform="translate(0, 0)">
      ${generateScreen2().replace(/<\/?svg[^>]*>/g, '')}
    </g>
  </g>

  <!-- Frame 3 -->
  <g transform="translate(3060, 130)">
    <rect x="-4" y="-36" width="220" height="28" rx="6" fill="#1E293B" />
    <text x="10" y="-18" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#38BDF8">03 · DQA &amp; Verification</text>
    <rect x="0" y="0" width="1440" height="960" rx="8" fill="#FFFFFF" />
    <g transform="translate(0, 0)">
      ${generateScreen3().replace(/<\/?svg[^>]*>/g, '')}
    </g>
  </g>
</svg>
  `;
}

// Write the files
fs.writeFileSync(path.join(OUT_DIR, '01-settings-import-wireframe.svg'), generateScreen1().trim());
fs.writeFileSync(path.join(OUT_DIR, '02-overview-dashboard-wireframe.svg'), generateScreen2().trim());
fs.writeFileSync(path.join(OUT_DIR, '03-dqa-verification-wireframe.svg'), generateScreen3().trim());
fs.writeFileSync(path.join(OUT_DIR, 'pcrp-monitor-figma-master-canvas.svg'), generateAllScreensCanvas().trim());

console.log('Successfully generated Figma-ready SVG wireframe files in:', OUT_DIR);
