# PCRP Encoding and Data Quality Assessment Tool (v2.14.0)

**KALAHI-CIDSS PCRP · Caraga Region Offline Field Console**

One offline file, `dist/PCRP Encoding and Data Quality Assessment Tool.html`, that displays the Encoding Monitor's analytics, compliance scorecards, and findings for KCIS exports you drop into it. Double-click it to open it in Microsoft Edge, Google Chrome, or any modern browser; it requires zero internet and no installation. Files are processed entirely in-memory on the computer and never uploaded to any remote server.

---

## What's New in v2.14.0

- 🔗 **Universal DQA Finding Deep Links:** Every finding across the Data Quality Assessment audit tables (missing names, attendance duplicates, roster duplicates, cross-barangay household heads, unmapped activities, volunteer tagging gaps, date sanity, and sequence violations) is now an interactive one-click link (`dhFindingLink`) that immediately navigates to the exact record and filter in its parent module, complete with a contextual "Return to DQA" breadcrumb.
- 👥 **Duplicate Record Highlighting & Triage:** Attendance sittings and Household roster duplicates feature high-visibility row tinting (amber `#f59e0b` stripe for duplicates; red-orange `#ef4444` for cross-barangay heads), inline count badges (`👥 Duplicate (2×)`, `📍 Cross-Brgy`), and dedicated 1-click filter chips (`👥 Duplicate Attendees`, `👥 Listed twice`, `📍 Head in another barangay`, `👥 All Duplicates`).
- 🔄 **Header Subtitle Live Update Status & Auto-Polling:** The persistent header subtitle displays real-time status chips (`● Your app is up to date!`, `● 🎉 Update available: vX.X.X ↗`, `● Field Offline`, or `◌ Checking…`). Automatic update checks occur on startup (1.2s delay), on internet reconnect, and on a 30-minute background poll without 24-hour rate limits.
- ⚙️ **Streamlined Settings Navigation:** Re-ordered settings so **Section 1: Municipal Scope & Role Assignment** comes first, followed by **Section 2: Data Import**. The top header has been decluttered by removing the title scope pill.
- 🏛️ **Caraga Region Branding & Attribution:** Persistent header badge displays `Caraga Region`, and the About & Privacy Notice credits the Caraga Region Implementation (`Vibe coded by: kjahidalgo`).

---

## Using it

1. Open `dist/PCRP Encoding and Data Quality Assessment Tool.html`.
2. **Select your Workspace Role & Scope** (Section 1 in Settings & Setup):
   - **PEA / MDM (Municipal Field Workspace):** For Project Evaluation Assistants and Municipal Data Monitors. Select your assigned municipality once. The app strictly scopes the entire tool to your municipality:
     - The **Municipalities** regional comparison tab is removed from navigation.
     - **Overview:** Provincial filter chips are removed; municipal KPI matrix shows only your municipality.
     - **Barangays:** Municipality selector is locked to your municipality; displays only your barangays.
     - **Verify & DQA:** Filters and precision samples are isolated strictly to your municipality.
     - **Excel Export:** Multi-municipality comparison sheets are excluded, producing a clean LGU-specific workbook.
     - No other municipality's data is displayed or leaked.
   - **Regional RPMO (Project Evaluation Officer - Region Level):** Full regional access to all monitored LGUs and barangays with multi-municipality comparison tables, provincial filter chips, and region-wide analytics.
   - Switch roles or municipalities at any time in **Settings & Setup -> Section 1: Municipal Scope & Role Assignment**.
3. **Drop in the KCIS exports** (Section 2 in Settings & Setup), all at once or one by one:
   - **Participants export** (`Raw_Participants`, required for activity pipeline & attendance)
   - **Households export** (`Raw_Households`, required for K2 quorum scorecards and roster integrity checks)
   - **Community Volunteer List** (`Raw_Volunteers`, required for BResT, SFMSC, and Stage 2 committees)

   You can also drop the complete monitor workbook with its `Raw_Participants`, `Raw_Households`, `Baseline` and `Activities` tabs. The app automatically recognizes each file from its column headers.
4. **Read the findings across dedicated, sortable modules with live instant search:**
   - **Overview:** Stage 1 / 2 pipeline activities, K2, volunteers, and Data Health summary; locked to municipal scope for PEA/MDM, or switchable across provinces for RPMO.
   - **Municipalities (RPMO only):** Region-wide matrix comparing progress across every LGU.
   - **Barangays:** Detailed status per activity, K2 quorum, and volunteer teams; live search and sorting across all columns.
   - **Attendees:** Complete activity attendance tracker with duplicate detection, triage action trays, gender breakdown, and CSV export.
   - **Household Participation:**
     - *Barangay Quorum Scorecard:* Tracks household targets, registered households, attendees, participation rate, and 70% Quorum compliance status with visual threshold mini-bars.
     - *Household Roster Directory:* Full roster of household heads and representatives with attendance counts, duplicate detection, cross-barangay flags, and quick triage chips.
   - **Community Volunteers:** Volunteer registry with inclusion metrics (women 50% quota, marginalized/IP/PWD %, chairpersons), committee breakdown, and flag filters.
   - **Stage 2 CSPMC & MResT:** Complete tracking of all 8 specialized sub-committees, Bookkeeper, and Mayor-led co-governance org charts with 50% women quota.
   - **BResT (Barangay Resilience Team):** Executive team formation scorecard (Compliant vs Needs Fixing vs Not Encoded), member directory, and 30% marginalized quota progress bars.
   - **DQA Verification & Precision Audit:** SM7 Table 8 field verification against physical source forms (Attendance sheets, Household rosters, Volunteer profiles, and MResT Executive Orders) with random sample generator, split-pane review workbench, and tabbed executive audit memo dialog.
   - **Data Health:** In-depth quality checks (7-day rule, date sanity, duplicate entries, name typos, age validation) with universal deep links that jump directly to problematic records.
   - **Export to Excel:** Role-tailored offline Excel workbook with summary, barangay breakdowns, and data health logs.
5. **Settings & Setup:**
   - **Section 1:** Municipal Scope & Role Assignment
   - **Section 2:** KCIS Data Import & Byte Counter
   - **Section 3:** Baseline Reference Masterlist
   - **Section 4:** Field Conduct & Activity Requirements
   - **Section 5:** Workstation Security (PIN Lock & AES-GCM-256 Encryption)
   - **Section 6:** Updates & Versioning (Live Feed & Release Notes)
   - **Section 7:** About & Data Privacy Notice

---

## Saved Data ("as of" a pull date)

The loaded exports, verification tags, and findings of earlier pulls are persisted locally in the browser on that PC using IndexedDB, so refreshing or reopening the window restores your exact session without re-importing.

- **A newer pull:** Drop the new participants export (and the others), then set its **KCIS pull date** on the Import page. The previous pull's findings are kept (places and counts only, never personal rows), allowing the Fix list to compare what is new and what was resolved.
- **Save to a file (`.pcrp`):** Exports the entire workstation state (loaded data, verification samples, and settings) into a compressed `.pcrp` file to back up, transfer to another PC, or submit to the RPMO. Drop the `.pcrp` file onto the Import card to open it.
- **Forget saved data:** Removes all local caches and stored sessions from that browser. **Clear loaded files** clears only current memory, leaving saved tags intact.
- **Workstation Security:** Optional 4-to-8 digit PIN lock encrypts cached browser storage with AES-GCM-256 for unattended laptops in field workstations.

---

## Same Numbers as the Web Monitor

The file embeds the monitor's own `Code.js`, `Store.js`, `WebApp.js`, and `JS_Health.html`. A lightweight in-memory runtime (`src/runtime.js`) replicates Google Sheets and Apps Script APIs. On the same source files, every calculation, lacking record tally, and percentage matches the official web app exactly.

---

## Testing & Quality Assurance

The codebase includes an extensive automated test suite covering state management, cryptography, delta synchronization, virtual tables, people indexing, duplicate detection, DQA deep links, and UI rendering:

```bash
node tests/test-suite.js
```

**114 tests passing** with 0 failures across 22 test suites.

---

## Rebuilding

After modifying source files in `src/` or `vendor/`, recompile the single-file distribution (requires Node.js 18+):

```bash
node build.js
```

| Path | What it is |
|---|---|
| `src/` | The desktop app: `app.html` (shell), `app.css`, `runtime.js` (in-memory Sheet, file reading, Excel writer), `app.js` (pages), `people.js` (People page and profiles), `verify.js` (Verify page), `saved.js` (saved data and .pcrp files) |
| `vendor/monitor/` | The Encoding Monitor files the app runs, copied by the build with the web app's passkey and Sheet ID removed |
| `data/reference.json` | Built-in Baseline and Activities (barangay names and PSGC codes, no personal data) |
| `dist/PCRP Encoding and Data Quality Assessment Tool.html` | The built app, the single offline file to share |

When `../PCRP-Stage-1-Encoding-Monitor` sits next to this folder, or `PCRP_MONITOR_SRC` names the monitor's folder, the build refreshes `vendor/monitor/` from it:

```bash
PCRP_MONITOR_SRC="path/to/pcrp-encoding-status" node build.js
```

---

## Sharing & Data Privacy

The built `.html` file contains only code and public barangay reference masterlists (names and PSGC codes) with zero personal data. It is completely safe to distribute to field staff, PEAs, and MDMs. KCIS export spreadsheets and `.pcrp` session files contain beneficiary personal data and must always be handled strictly in compliance with the **Data Privacy Act of 2012**.
