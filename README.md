# PCRP Encoding and Data Quality Assessment Tool

One offline file, `dist/PCRP Encoding and Data Quality Assessment Tool.html`, that shows the Encoding Monitor's findings for KCIS exports you drop into it. Double-click it to open it in Edge or Chrome; it needs no internet and no install. Files are read on the computer and never uploaded.

## Using it

1. Open `dist/PCRP Encoding and Data Quality Assessment Tool.html`.
2. **Select your Workspace Role & Scope** (step 1):
   - **PEA / MDM (Municipal Field Workspace):** For Project Evaluation Assistants and Municipal Data Monitors. Select your municipality once. The app strictly scopes the entire tool to your municipality:
     - The **Municipalities** tab is removed from navigation.
     - **Overview:** Provincial filter chips are removed; municipal KPI matrix shows only your municipality.
     - **Barangays:** Municipality selector is replaced with a locked badge; displays only your barangays.
     - **Verify & DQA:** Filters and precision samples are isolated strictly to your municipality.
     - **Excel Export:** Multi-municipality comparison sheets are excluded, producing a clean LGU-specific workbook.
     - No other municipality's data is displayed or leaked.
   - **Regional RPMO (Project Evaluation Officer - Region Level):** Full regional access to all 26 monitored LGUs and 516 barangays with multi-municipality comparison tables, provincial filter chips, and region-wide analytics.
   - Click the **Role & Scope Chip** in the header or on the Home card at any time to switch roles or municipalities via the Scope Dialog modal.
3. Drop in the KCIS exports, all at once or one by one:
   - the participants export (required)
   - the households export (for K2 and the household roster checks)
   - the Community Volunteer List (for the 1st BA BResT / SFMSC tracking)

   You can also drop the whole monitor workbook, with its `Raw_Participants`, `Raw_Households`, `Baseline` and `Activities` tabs. The app recognises each file from its column headers.
4. Read the findings across dedicated, sortable modules with live instant search:
   - **Overview:** Stage 1 / 2 pipeline activities, K2, volunteers, and Data Health summary; locked to municipal scope for PEA/MDM, or switchable across provinces for RPMO.
   - **Municipalities (RPMO only):** Region-wide matrix comparing progress across every LGU.
   - **Barangays:** Detailed status per activity, K2 quorum, and volunteer teams; live search and sorting across all columns. Click any cell to jump directly into the corresponding records.
   - **Attendees (Dedicated Module):** Complete activity attendance tracker. KPIs for total attendance, unique attendees, female ratio, and activities. Live search, bidirectional column sorting, data health flags filter, and CSV export.
   - **Household Participation (Dedicated Module):**
     - *Barangay Quorum Scorecard:* Tracks household targets, registered households, attendees, participation rate, and 70% Quorum compliance status.
     - *Household Roster Directory:* Full roster of household heads and representatives with attendance counts. All tables support live search, sorting, and CSV export.
   - **Community Volunteers (Dedicated Module):** Dedicated volunteer registry with inclusion metrics (women %, marginalized/IP/PWD %, chairpersons). Filter by committee/body, position, and data health flags. Searchable and sortable.
   - **BResT (Barangay Resilience Team Module):** Executive team formation scorecard (Compliant vs Needs Fixing vs Not Encoded). Visual Barangay Team Status cards and member directory table with full search, sorting, and CSV export.
   - **MResT (Municipal Resilience Team Module):** Executive Order (EO) tracking hero banner, precision EO checklist, RPMO Regional LGU Comparison Matrix, and complete MResT member roster with live search and sorting.
   - **Person Profile Dialog:** Click any individual in any module to view their complete history across all 3 KCIS exports, matching identities, and integrity flags.
   - **Verify (DQA Precision):** SM7 Table 8 field verification against physical source forms (Attendance sheets, Household rosters, Volunteer profiles, and MResT Executive Orders) with random sample generator and audit tags.
   - **Data Health:** In-depth quality checks (7-day rule, date sanity, duplicate entries, name typos, age validation) and auto-generated findings memo.
   - **Export to Excel:** Role-tailored offline Excel workbook with summary, barangay breakdowns, and data health logs.
5. **Settings:**
   - the KCIS pull date (for the 3-day attendance window; also on the Import page once the exports are loaded)
   - field conduct per activity (which unencoded records count as lacking)
   - loading a newer Baseline

## Saved data ("as of" a pull date)

The loaded exports, the verification tags and the findings of earlier pulls are kept in the browser on that PC, so a refresh or a reopened window opens the same data again without re-importing. The bar at the top of the Import page says what is saved and as of which pull date.

- **A newer pull:** drop the new participants export (and the others), then set its **KCIS pull date** on the Import page. The previous pull's findings are kept (places and counts only, never the rows), so the Fix list can say what is new and what was resolved. The last 12 pulls are kept.
- **Save to a file** writes everything to one `.pcrp` file: to keep a copy, move to another PC, or send the verification to the RPMO. Drop the file on the Import page to open it.
- **Forget saved data** removes it all from that browser. **Clear loaded files** removes only the exports; the tags and earlier pulls stay.
- The saved data and the `.pcrp` file hold names and birthdates: anyone using that browser can open them. Handle them under the Data Privacy Act, and use *Forget saved data* on a shared PC.
- Where the browser blocks storage, the Import page says so; use *Save to a file* instead.

The settings are remembered in that browser.

## Same numbers as the web monitor

The file contains the monitor's own `Code.js`, `Store.js`, `WebApp.js` and `JS_Health.html`, unchanged. A small runtime (`src/runtime.js`) stands in for the Google Sheet and the Apps Script services. On the same files, every figure matches the web app.

## Rebuilding

After the monitor's code or its Baseline changes, run this (Node.js 18 or later):

```bash
node build.js
```

| Path | What it is |
|---|---|
| `src/` | The desktop app: `app.html` (shell), `app.css`, `runtime.js` (in-memory Sheet, file reading, Excel writer), `app.js` (pages), `people.js` (People page and profiles), `verify.js` (Verify page), `saved.js` (saved data and .pcrp files) |
| `vendor/monitor/` | The Encoding Monitor files the app runs, copied by the build with the web app's passkey and Sheet ID removed |
| `data/reference.json` | Built-in Baseline and Activities (barangay names and PSGC codes, no personal data) |
| `dist/PCRP Encoding and Data Quality Assessment Tool.html` | The built app, the file to share |

When `../PCRP-Stage-1-Encoding-Monitor` sits next to this folder, or `PCRP_MONITOR_SRC` names the monitor's folder (for example its clasp folder), the build refreshes `vendor/monitor/` from it:

```bash
PCRP_MONITOR_SRC="C:/Users/kimpo/apps-script-projects/pcrp-encoding-status" node build.js
```

 It also refreshes `data/reference.json` from that folder's `_PCRP Encoding Monitor.xlsx`; to use another workbook, pass it: `node build.js "path/to/workbook.xlsx"`. Without them, the build uses the copies already in the repo.

The build removes the web app's default editor passkey and Google Sheet ID, and stops if either is still in the output.

## Sharing

The built file contains the code and the barangay baseline (names and PSGC codes), but no personal data. It is safe to give to PEAs and MDMs. The KCIS exports and the Excel files it saves do hold personal data, so handle them under the Data Privacy Act.
