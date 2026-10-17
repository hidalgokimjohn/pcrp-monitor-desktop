# PCRP Monitor Desktop

One offline file, `dist/PCRP Monitor Desktop.html`, that shows the Encoding Monitor's findings for KCIS exports you drop into it. Double-click it to open it in Edge or Chrome; it needs no internet and no install. Files are read on the computer and never uploaded.

## Using it

1. Open `dist/PCRP Monitor Desktop.html`.
2. **Choose your municipality** (step 1). Import stays locked until you do. The app remembers it on that computer, and you can change it from the chip in the header or in Settings. RPMO staff can choose *All municipalities* for the regional view.
   - The Overview, Barangays, Data Health, the memo and the Excel export then open on that municipality.
   - The Municipalities page shows its province, with your row marked.
   - If the export has no records for your municipality, the app says so: check that it is the right file.
3. Drop in the KCIS exports, all at once or one by one:
   - the participants export (required)
   - the households export (for K2 and the household roster checks)
   - the Community Volunteer List (for the 1st BA BResT / SFMSC tracking)

   You can also drop the whole monitor workbook, with its `Raw_Participants`, `Raw_Households`, `Baseline` and `Activities` tabs. The app recognises each file from its column headers.
4. Read the findings:
   - **Overview:** Stage 1 / 2 activities, K2, volunteers, a Data Health summary; whole region or one province.
   - **Municipalities:** every LGU per activity; click one to see its barangays.
   - **Barangays:** each barangay's status per activity, K2, BResT / SFMSC, and what is lacking; with filters. Every cell opens the people behind it.
   - **People:** who is behind the numbers.
     - *Attendees* by activity.
     - The *household roster*: head, present, birthdate.
     - *Volunteers & committees*: committee, position, sex, IP/PWD, term. Choosing a barangay shows its BResT and SFMSC roster, Chairperson first, with the status and what to fix.
     - Search and investigation filters: listed twice, head in another barangay, volunteer not among the 1st BA attendees, no committee, a committee of another activity, sex not recorded.
     - Click any name for the **person profile**: every record of that name in the three exports, possible matches with a different middle name, and what to check.
     - **Export list** saves the filtered list to Excel.
   - **Verify:** the Precision part of the DQA (SM7 Table 8). The PEA or MDE checks what is encoded in KCIS against the paper form, row by row: *Matches*, *Differs* (and what: name spelling, sex, birthdate, position…), or *Not on the form*, and enters how many names the form has.
     - Four forms: the **attendance sheet** (any activity), the **household roster**, the **volunteers** (CV Profile Forms and the barangay resolution, BResT and SFMSC) and the **MResT** (the Executive Order).
     - **Suggest a sample** picks random records not yet verified (a tenth of them, at least three) for a formal DQA; any other record can be verified too.
     - The page shows the records verified, the rows matching the form, and the names on the form ÷ the rows encoded. **CSV of the results** saves every tag (it holds names).
     - Type your name in *Checked by* first: every tag keeps who checked it and when. Tags follow the name, not the row, so they survive a re-import.
   - **Data Health:** the web monitor's own page (checks, by-municipality view, memo, CSV), with:
     - the data quality checks: attendance not encoded within 7 days, activity dates that cannot be right, an activity encoded as two KCIS records, an attendee listed twice, mistyped names, and birthdates that cannot be right;
     - the **Scorecard**: the checks grouped by the six SM7 data quality dimensions (Table 8), with the checks passed in each. Precision shows the results of the Verify page;
     - the **Fix list**: every open item for the MDE/PEA, by barangay, with what to do and a CSV, marked New, Still open or Resolved against the previous pull saved on this PC.
   - **Export to Excel:** one workbook with Summary, Municipalities, Barangays and Data Health sheets.
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
| `dist/PCRP Monitor Desktop.html` | The built app, the file to share |

When `../PCRP-Stage-1-Encoding-Monitor` sits next to this folder, or `PCRP_MONITOR_SRC` names the monitor's folder (for example its clasp folder), the build refreshes `vendor/monitor/` from it:

```bash
PCRP_MONITOR_SRC="C:/Users/kimpo/apps-script-projects/pcrp-encoding-status" node build.js
```

 It also refreshes `data/reference.json` from that folder's `_PCRP Encoding Monitor.xlsx`; to use another workbook, pass it: `node build.js "path/to/workbook.xlsx"`. Without them, the build uses the copies already in the repo.

The build removes the web app's default editor passkey and Google Sheet ID, and stops if either is still in the output.

## Sharing

The built file contains the code and the barangay baseline (names and PSGC codes), but no personal data. It is safe to give to PEAs and MDMs. The KCIS exports and the Excel files it saves do hold personal data, so handle them under the Data Privacy Act.
