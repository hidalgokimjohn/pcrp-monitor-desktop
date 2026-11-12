# Caraga PCRP Progress Tracker Tool (v2.16.0)

**KALAHI-CIDSS PCRP · Caraga Region Offline Field Console**

One offline file, `dist/PCRP Encoding and Data Quality Assessment Tool.html`, that displays the Encoding Monitor's analytics, compliance scorecards, and findings for KCIS exports you drop into it. Double-click it to open it in Microsoft Edge, Google Chrome, or any modern browser; it requires zero internet and no installation. Files are processed entirely in-memory on the computer and never uploaded to any remote server.

---

## What's New in v2.16.0

- **SFM monitoring:** Import the KCIS Stakeholders Feedback Mechanism Masterlist (`Raw_SFM`; recognised by its `Date of Intake` and `Nature of Issue` columns) for the SFM page. It works without the Activity Tracker and is kept in saved sessions. The Overview lists what needs attention in three groups: act now (open entries, judged in working days against each entry's own EODB classification: Simple 3, Complex 7, Highly Technical 20), fix the record (no or invalid Date Addressed, empty resolution, missing place, category, sender, feedback, form or IP group) and worth a second look (Type B/C, possible duplicates, complainant recorded as intake officer, municipalities off the monitored list). Entries can be filtered by any finding and opened one by one; the Municipalities view shows every monitored municipality, including those with no entries; Export writes the findings to Excel. Findings are judged as of the latest encoding date in the file, and holidays are not counted.
- **Stage 1 MOV tracking:** Import KCIS attachments alongside Activity Tracker and Community Volunteer List. Activity completion uses positive reported attendance. Encoding, attendance, and MOV readiness have separate progress bars and backlogs. The tool only tracks MOV uploads; verifying the documents is done outside it. Attachments whose KCIS type ID and label match a requirement are credited, and so are candidate matches (a related type ID or a filename pattern) within the same monitored location and activity. The BDC Year 2/3 committee resolution applies only to barangays marked Stage 2 Prioritized in the baseline. Appraisal MOVs are included in MOV readiness. Version 3 sessions retain the attachments.
- **Activity Tracker migration:** One summary import now supplies attendance and household participation. Repeated records stay counted and appear in DQA. BA List fields are ignored. Attendance verification checks four figures. Community Volunteer List imports remain separate.
- 🏛️ **Institutional Civic Footer:** Added a BetterGov.ph civic editorial footer anchoring the console with live versioning (`Offline Field Console · Monitor v2.16.0`), real-time update status pill (`● Your app is up to date!`), active workspace scope pill (`PEA / MDM Scope` or `RPMO Regional`), and developer attribution (`vided coded by kjahidalgo`).
- 🎨 **BetterGov.ph Design System Alignment:** Implemented Republic of the Philippines civic design tokens: Figtree, Inter, and JetBrains Mono triad, exposed structural 1px borders, 2px top anchor rules, sharp geometric corners, and zero SaaS bloat.
- ✨ **Header Decluttering:** Simplified the brand header to cleanly present official KALAHI-CIDSS PCRP and Caraga Region tags.
- 🎯 **Standardized Scope Pills:** Refined PEA / MDM and Regional RPMO scope pills across all modules and banners with consistent monospace typography, civic royal blue accents, and full dark mode support.
- 🏠 **K2 from Household Participation Export:** Reads KCIS counts per activity (Total Hh Represented ÷ Total Hh In Barangay) directly without requiring obsolete roster exports.

---

## Using it

1. Open `dist/PCRP Encoding and Data Quality Assessment Tool.html`.
2. **Select your Workspace Role & Scope** (Section 1 in Settings & Setup):
   - **PEA / MDM (Municipal Field Workspace):** For Project Evaluation Assistants and Municipal Data Monitors. Select your assigned municipality once. The app strictly scopes the entire tool to your municipality:
     - The **Municipalities** regional comparison tab is removed from navigation.
     - **Municipality Profile:** Opens directly on your municipality; the municipality table and other municipalities are hidden.
     - **Barangay profiles:** Only your barangays are listed and printed.
     - **Verify & DQA:** Filters and precision samples are isolated strictly to your municipality.
     - **Excel Export:** Multi-municipality comparison sheets are excluded, producing a clean LGU-specific workbook.
     - No other municipality's data is displayed or leaked.
   - **Regional RPMO (Project Evaluation Officer - Region Level):** Full regional access to all monitored LGUs and barangays with multi-municipality comparison tables, provincial filter chips, and region-wide analytics.
   - Switch roles or municipalities at any time in **Settings & Setup -> Section 1: Municipal Scope & Role Assignment**.
3. **Drop in the KCIS exports** (Section 2 in Settings & Setup):
   - **Activity Tracker** (`Raw_Activity_Tracker`, required): summarized Participants and separate Person Volunteers counts, target/actual dates, and explicit household participation figures.
   - **Community Volunteer List** (`Raw_Volunteers`): named members, committees, and positions for BResT, SFMSC, MResT, and Stage 2 committees. Both KCIS layouts are read: the older one with three `Name` columns (activity, committee, position), and the newer one with a single `Name` (the activity) plus `volunteer_committee`, `volunteer_committee_position`, `vol_start_date`, `vol_end_date` and `brgy_psgc`. Barangays are matched by PSGC first. A person listed more than once for the same committee in the same barangay is counted once; the extra rows appear in DQA under Volunteer record gaps ("Listed more than once") and in the Volunteers module's flags.
   - **MOV attachments** (`Raw_MOVs`): KCIS attachment export, mapped by its 17 headers. This import is detected before Baseline and cannot silently replace the baseline.
   - Baseline and Activities reference tabs remain supported. The former Participants, Household Participation, and household roster exports are no longer accepted.

   Reimport replaces the active Tracker. Repeated activity rows remain included in attendance totals and are flagged in DQA with source rows, titles, dates, and counts. Household quorum uses the most complete count pair, then the largest total and represented count, once per assembly. BA List Total/Present columns are ignored.

   MOV reimport also replaces the previous dataset after complete validation. MOV-only and volunteer-only sessions can be inspected and saved; Tracker is required for attendance completion and MOV due-date evaluation.

4. **Read the findings across dedicated, sortable modules with live instant search:**
   - **Stage switch:** One Stage 1 / Stage 2 switch at the right end of the navy tab band, which stays pinned while you scroll, sets the activity stage for the Municipality Profile (its directory, activities, checklists and barangay profiles) and the KPI page. It replaces the separate stage buttons on those pages and is remembered between sessions. Opening a Stage 2 activity from a link also switches it. On pages that cover both stages (Volunteers & Committees, MResT, DQA, Settings) it is dimmed and inactive. In windows narrower than 900px, where the tab band scrolls away, it floats as a pill at the bottom of the screen and hides on pages it does not apply to.
   - **KPI:** Retains only manual-defined PCRP indicators from SM7: household participation in barangay assemblies and municipalities with institutionalized MResTs. Cards and CSV exports include manual references. Assembly rates require complete household denominators for the selected area; MResT institutionalization remains Not assessed until LDC membership evidence is available. Area controls preserve the assigned municipality restriction.
   - **Retired modules:** Overview, Municipalities, Barangays, Attendees and Household Participation were folded into the Municipality Profile. Old links and DQA findings that pointed to them now open the matching profile, barangay or activity panel. Legacy KPI Summary links now open KPI.
   - **Municipality Profile / My Municipality:** RPMO users start from the municipality directory, which has three tabs. **Activity & MOV checklist** opens first and is the manager overview: municipalities as rows grouped by province, an **Overall** column before seq. 1 (one percentage per municipality: the equal-weight average of its Encoded, With attendees and MOVs rates across all of the stage's activities, always shown as a percentage), and each activity of the stage as a column group of Encoded, With attendees and MOVs (required MOV forms submitted; Stage 2 has no MOV column). An x/y or % switch changes the figures, cells are shaded by rate, a region total sits at the foot, clicking a figure opens that activity in the municipality's profile, and Export gives counts and targets in separate columns. **Municipalities** is a sortable table of municipalities (click any column to sort) with a segmented Stage progress bar, Encoded / With attendees / MOVs submitted (required MOV forms uploaded) counts, and attendance and MOV backlogs. Opening a municipality shows its activities as a horizontal stepper. Each step shows three progress donuts: Encoded (blue), With attendees (purple) and MOV (green), the share of required MOV forms submitted, so each upload moves it. Encoded and With attendees count against the activity target. The header shows MOVs submitted (forms) and MOVs ready (activities with every required MOV). The municipality table keeps a segmented bar of the same states; the activity detail shows only the counts, since its step donuts already chart them. The independent counts sit beneath it. The profile opens on the first activity with outstanding work. Clicking a step lists every barangay below it in the Barangay Encoding Status view, with encoding, attendees on one line (Total: 100 (M: 50, F: 50, U: 0)), per-requirement MOV dots and follow-up flags; municipal activities show the target and actual dates first, then Participants and Person Volunteers on one line each, then the required MOVs as small file cards that open their evidence. A search box and quick-filter chips (Not encoded, No attendees, Attendance due, MOVs incomplete, MOV due, Outside target) show their counts. The compact header carries the overall bar and clickable backlog chips that open the first affected activity. PEA/MDM profiles are locked to their assigned municipality.
   - **Activity swimlane:** A third regional directory tab places activities across the top and municipalities in horizontal lanes grouped by province. Each swimmer marks the first unfinished activity, using valid Actual End dates from Activity Tracker. Counts show completed target locations; municipal activities target one municipality, and priority-only activities include only prioritized barangays. Later completions remain visible despite earlier gaps. All applicable activities completed moves the swimmer to Stage complete. Missing Tracker data stays Not assessed. Search and the global stage switch apply; clicking a cell opens its municipality and activity. The checklist remains the default, and the last selected directory tab is remembered. Attendance and MOV indicators elsewhere retain their existing rules.
   - **Barangay profile:** Click a barangay name in any list or checklist to open its own page. It shows the barangay's activities in sequence with progress state, encoding, attendees by sex, actual dates, a mark for each MOV document and follow-up flags. Previous/next buttons and a selector move between barangays.
   - **Volunteer checklist:** A profile tab beside the Activity & MOV checklist, with barangays as rows and the stage's committees as columns. Stage 1 shows BResT and SFMSC using the same status as DQA, and Stage 2 shows the CSPMC and its sub-committees against their Chairperson and minimum-member rules: at least 3 CVs each, per SM1 para. 43, except the Bookkeeper. Each committee has separate Chairperson and Member columns. Member covers everyone who is not a Chairperson, and the Member mark's tooltip counts those with no position. Each role is judged against the committee's own rule: SFMSC needs exactly one Chairperson and at least two Members, Stage 2 bodies need a Chairperson and at least 3 CVs. BResT has no Chairperson (SM1 paras 19–22), so its Chairperson column is never credited: an encoded Chairperson shows grey (–) with the count, never ✓. Clicking a role opens the Volunteers module filtered to that committee and position. The export gives a status, Chairperson and Member column per committee. Each mark shows the people encoded in that role, counting each person once: ✓ meets the rules, ! needs fixing, ✗ not encoded although the assembly is encoded, ○ not encoded and the assembly not yet encoded. Further columns give the named volunteers with no committee (Stage 1), total CVs, women's share and committees meeting the rules, with column totals at the foot. Stage 1 also shows the municipal MResT and SFMC. Click a mark to list its volunteers in the Volunteers module, which has a link back to the profile. Search, Show and Sort filters and a CSV export follow the MOV checklist.
   - **Print report:** Prints an A4 landscape monitoring report for the municipality. It includes summary counts, the activity sequence table, the MOV checklist in the on-screen orientation (activities and MOV forms as rows, barangays as columns, in blocks of up to 30 barangays so large municipalities fit the page, plus municipal-level MOVs), barangays needing follow-up, and the data caveats.
   - **Activity & MOV checklist:** One matrix shows Encoding and With attendees as status marks, followed by a divider and individual MOV forms, with barangays as columns. Every required MOV form stays visible below the activity checks, with its submission status per barangay. Click a status to open attendance or MOV evidence. A compact Show dropdown filters missing encoding, missing attendance, or MOV follow-up; Export stays at the top right. The export includes both activity checks and individual forms. Stage 2 keeps activity checks available when MOV requirements are not configured. Municipal activities and appraisal are separate; appraisal has no attendance target. MOV counts represent credited requirements, not attachment files. Outside-target obligations remain visible with dashed marks.
   - **Municipal summaries:** Operational progress, household quorum, BResT composition and MResT formation remain available in municipality comparisons and printable reports. The custom composite readiness index has been removed. MOV, verification and data-quality counters are not presented as PCRP KPIs.
   - **Attendance details:** Each activity's barangay list shows reported Participants by sex and actual dates; the attendance panel shows target/actual dates, Person Volunteers and every source row, with repeated records marked. These totals cannot identify unique people.
   - **Stage 1 MOVs:** There is no separate MOV review page under DQA, and the DQA audit has no MOV checks. MOV submission status is shown in the Municipality Profile's checklist and evidence panel. The reference is only Stage 1!D4:I38 of the Field Guide Submission File; spreadsheet submission establishes presence, not verified contents or signatures.
   - **Community Volunteers:** Volunteer registry with inclusion metrics (women 50% quota, marginalized/IP/PWD %, chairpersons), committee breakdown, and flag filters.
   - **Stage 2 CSPMC & MResT:** Complete tracking of all 8 specialized sub-committees, Bookkeeper, and Mayor-led co-governance org charts with 50% women quota.
   - **BResT (Barangay Resilience Team):** Executive team formation scorecard (Compliant vs Needs Fixing vs Not Encoded), member directory, and 30% marginalized quota progress bars.
   - **DQA Verification & Precision Audit:** SM7 Table 8 field verification against physical source forms (Attendance sheets, Household rosters, Volunteer profiles, and MResT Executive Orders) with random sample generator, split-pane review workbench, and tabbed executive audit memo dialog. Attendance verification compares male, female, unspecified, and total figures; changed figures require verification again.
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

Version 3 sessions store Activity Tracker, volunteer and MOV data. MOV review decisions in sessions saved before the review was removed are ignored. Version 2 Tracker/volunteer sessions still open with MOVs unassessed. Legacy version 1 `.pcrp` files are rejected before changing current data; import a new Tracker instead. On startup, old cached attendance and household tables are skipped while preferences and volunteer data are preserved. Old person verification tags do not count toward summary verification, and Tracker findings start a new comparison baseline.

Requirements without their own KCIS attachment type ID (for example the MResT SFM resolution, the validated community profile, the MRP PPAs list and the RPMO appraisal documents) are credited from candidate matches: a related type ID or a filename pattern, never a supplementary file or an attachment outside the monitored baseline. One bundled document may satisfy several requirements. Candidate credit shows presence only; the document may not be the one required. The BDC Year 2/3 committee resolution is required for Stage 2 Prioritized barangays and not applicable elsewhere; a baseline without that column treats every barangay as prioritized. Repeated paths never inflate completeness. Attachment dates differing from Tracker dates retain clear submission credit.

Activity progress uses three independent, vertically stacked bars against the existing activity target: **Encoded**, **With attendees**, and **MOVs ready**. Encoded counts Tracker records, including zero-attendance records; With attendees counts positive reported Participants attendance and determines completion. MOV-ready activities have every applicable required MOV submitted, independent of Tracker or attendance presence. Percentages are not added together. Before MOV import only MOV progress is unassessed; later stages show MOVs as not assessed for that stage. MOV-only sessions show MOV progress while Tracker measures are unassessed.

Attendance backlog retains its existing aging rules. **MOV backlog** separately counts due incomplete checklists after Tracker actual end reaches the selected pull date. The four RPMO appraisal requirements use MRP actual end as their follow-up trigger and are included in separate MOV readiness totals, without adding an attendance activity. Additional BDC checklist obligations also remain outside the pipeline target. No combined attendance-and-MOV readiness gate is used.

The loaded exports, verification tags, and findings of earlier pulls are persisted locally in the browser on that PC using IndexedDB, so refreshing or reopening the window restores your exact session without re-importing.

- **A newer pull:** Drop the new Activity Tracker (and the others), then set its **KCIS pull date** on the Import page. The previous pull's findings are kept (places and counts only, never personal rows), allowing the Fix list to compare what is new and what was resolved.
- **Save to a file (`.pcrp`):** Exports the entire workstation state (loaded data, verification samples, and settings) into a compressed `.pcrp` file to back up, transfer to another PC, or submit to the RPMO. Drop the `.pcrp` file onto the Import card to open it.
- **Forget saved data:** Removes all local caches and stored sessions from that browser. **Clear loaded files** clears only current memory, leaving saved tags intact.
- **Workstation Security:** Optional 4-to-8 digit PIN lock encrypts cached browser storage with AES-GCM-256 for unattended laptops in field workstations.

---

## Shared Monitor Rules

The file embeds the monitor's `Code.js`, `Store.js`, `WebApp.js`, and `JS_Health.html`. The desktop runtime uses the Activity Tracker header contract to feed attendance summaries and household figures into the shared pipeline and quorum rules. Person Volunteers remain separate from Participants; named volunteer membership still comes from the Community Volunteer List.

---

## Testing & Quality Assurance

The codebase includes an extensive automated test suite covering state management, cryptography, delta synchronization, virtual tables, people indexing, duplicate detection, DQA deep links, and UI rendering:

```bash
node tests/test-suite.js
node --test tests/activity-tracker.test.js
node --test tests/movs.test.js
node --test tests/profile.test.js
node --test tests/kpis.test.js
```

The Activity Tracker tests cover import mapping, repeats, ignored BA List columns, quorum selection, summary verification, session migration, and scope. Set `KCIS_ACTIVITY_TRACKER` to a local sample path to also check the 4 November 2026 export control totals. Source exports are never committed.

MOV tests cover atomic detection/import, exact and candidate matches, repeat handling, applicability, due dates, appraisal readiness, scope, and v2/v3 sessions. Set `KCIS_MOV_EXPORT` to the local KCIS attachment export to verify its 13,405 records, 11,072 attachment rows, 2,333 empty rows, 10,610 distinct paths, and 447 repeated-path groups with 462 extra occurrences.

Profile tests reconcile activity progress with the existing scoped pipeline and cover priority-only activities, all barangay rows, independent filters, filtered CSV exports, partial imports, checklist statuses, cache refreshes after a MOV reimport, scope restrictions and restored selections. Profile selections and filters stay in browser preferences; the version 3 session format remains unchanged. On narrow screens, the stepper scrolls sideways and the evidence panel uses the full screen width.

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

The default build uses the bundled monitor core so desktop-specific Tracker support is preserved. Refreshing from another monitor is explicit: set `PCRP_REFRESH_MONITOR=1` together with `PCRP_MONITOR_SRC`, and ensure that source includes the Tracker integration:

```bash
PCRP_REFRESH_MONITOR=1 PCRP_MONITOR_SRC="path/to/pcrp-encoding-status" node build.js
```

---

## Sharing & Data Privacy

### Vercel hosting

Production: [Caraga PCRP Progress Tracker Tool](https://caraga-pcrp-encoding.vercel.app/). Project: `pcrp-monitor-desktop`, under `hidalgokimjohns-projects`. The initial deployment uses the local working copy; automatic Git deployments are not configured. The original `pcrp-monitor-desktop.vercel.app` address remains accessible so sessions saved there can be exported and imported at the new address.

The app can also run as a static Vercel website. `vercel.json` uses the **Other** framework preset, runs `node build-vercel.js`, and publishes `web-dist/`. No dependencies, environment variables, database, or server functions are required. To check the web build locally, run `node build-vercel.js`.

The web build publishes only `index.html`, containing the same app as the offline distribution. `.vercelignore` limits CLI uploads to the build inputs and excludes KCIS exports and `.pcrp` sessions. For Git deployments, use the repository root as the project root.

Imported files continue to be processed in the browser and saved in that browser's IndexedDB; Vercel does not receive the imported records. Storage belongs to the website address and browser, so the hosted app does not automatically inherit a session from the offline HTML file, a preview URL, or another computer. Save a `.pcrp` session in the original app and import it at the new address to transfer it. The downloadable HTML remains available in `dist/` for offline use.

The built `.html` file contains only code and public barangay reference masterlists (names and PSGC codes) with zero personal data. It is completely safe to distribute to field staff, PEAs, and MDMs. KCIS export spreadsheets and `.pcrp` session files contain beneficiary personal data and must always be handled strictly in compliance with the **Data Privacy Act of 2012**.
