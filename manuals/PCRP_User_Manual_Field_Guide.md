# PCRP Encoding and Data Quality Assessment Tool
## Official User Manual & Field Operations Guide
**Document Version:** 2.4.0  
**Target Audience:** Project Evaluation Assistants (PEA), Municipal Data Monitors (MDM), Area Coordinating Teams (ACT), and Regional Project Management Office (RPMO / PEO)  
**Security Classification:** Restricted / Official Use Only (Compliant with RA 10173 — Philippine Data Privacy Act)

---

## Table of Contents
1. [Executive Summary & Purpose](#1-executive-summary--purpose)
2. [Security & 100% Offline Architecture](#2-security--100-offline-architecture)
3. [User Roles & Geographic Scope Isolation](#3-user-roles--geographic-scope-isolation)
4. [Getting Started & System Launch](#4-getting-started--system-launch)
5. [KCIS Data Export & Ingestion Guide](#5-kcis-data-export--ingestion-guide)
6. [Module Walkthrough: Executive Overview Dashboard](#6-module-walkthrough-executive-overview-dashboard)
7. [Module Walkthrough: 70% Quorum & Household Participation](#7-module-walkthrough-70-quorum--household-participation)
8. [Module Walkthrough: Community Volunteers & BResT/MResT](#8-module-walkthrough-community-volunteers--brestmrest)
9. [Module Walkthrough: SM7 Table 8 Field Verification Engine](#9-module-walkthrough-sm7-table-8-field-verification-engine)
10. [Module Walkthrough: Data Health & Automated Audit Memo](#10-module-walkthrough-data-health--automated-audit-memo)
11. [Session Persistence, Delta Sync, and Excel Export](#11-session-persistence-delta-sync-and-excel-export)
12. [Troubleshooting & Frequently Asked Questions (FAQ)](#12-troubleshooting--frequently-asked-questions-faq)

---

## 1. Executive Summary & Purpose

The **PCRP Encoding and Data Quality Assessment Tool** (Offline Field Console Monitor v2.4) is a mission-critical utility developed for the **KALAHI-CIDSS Philippine Community Resilience Project (PCRP)**. 

### Core Objectives
* **Rapid Field Auditing:** Allows field monitors (PEAs and MDMs) to audit raw KALAHI-CIDSS Comprehensive Information System (KCIS) data directly in the field without internet dependency.
* **SM1 & SM7 Operational Compliance:** Evaluates milestones in Stage 1 (Community Empowerment & Social Mobilization) and Stage 2 against the Social Mobilization Sub-Manual (SM1) and Monitoring & Evaluation Sub-Manual (SM7).
* **Quorum Integrity Enforcement:** Automatically calculates the mandatory **70% Household Quorum threshold** per barangay assembly.
* **Paper-to-Digital Reconciliation:** Powers random sampling and audit tracking to verify digital KCIS records against physical paper attendance sheets and rosters.
* **Single-Workbook Reporting:** Generates clean, role-tailored Excel reports for LGU teams and regional executives.

---

## 2. Security & 100% Offline Architecture

Field operations frequently take place in geographically isolated and disadvantaged areas (GIDA) with zero cellular reception.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          LOCAL WORKSTATION                              │
│                                                                        │
│   [ KCIS Raw Exports ] ──> (Drag & Drop) ──> [ Browser Memory (RAM) ]   │
│      (.xlsx / .csv)                                │                   │
│                                                    ▼                   │
│                                            [ In-Memory Runtime ]        │
│                                            • Quorum Calculation         │
│                                            • 7-Day Timeliness Rule     │
│                                            • SM7 Table 8 Verification  │
│                                                    │                   │
│                                                    ▼                   │
│   [ Role-Scoped Excel ] <── (Export) <── [ IndexedDB Encrypted Cache ]  │
│      (.xlsx / .pcrp)                         (Zero Cloud Uploads)       │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Security Safeguards
1. **100% Zero-Upload Client Execution:**
   The entire application runs as a self-contained HTML bundle (`dist/PCRP Encoding and Data Quality Assessment Tool.html`). When you drag and drop files, they are read inside your local browser's JavaScript memory. **No data is ever transmitted over the internet or uploaded to remote servers.**
2. **Compliance with Republic Act No. 10173 (Data Privacy Act of 2012):**
   KCIS exports contain sensitive personal information (PII) including citizen names, sex, dates of birth, and household identification. All data remains strictly confined to the monitor's local computer.
3. **Encrypted Client-Side Cache:**
   Session state, verification tags, and historical pull trends are cached locally in the browser’s sandboxed storage. On shared computers, users can execute **"Forget Saved Data"** to immediately erase all cached records.

---

## 3. User Roles & Geographic Scope Isolation

The tool enforces strict geographic data isolation to prevent data spillover and maintain field focus.

| Role Feature | PEA / MDM (Municipal Field Workspace) | Regional RPMO (Executive Oversight) |
| :--- | :--- | :--- |
| **Target User** | Municipal Data Monitors & Field Evaluation Assistants | Regional M&E Officers, PEOs, and Cluster Leads |
| **Geographic Scope** | **Strictly locked to 1 Municipality** | **All 26 LGUs & 516 Monitored Barangays** |
| **Municipalities Tab** | Hidden from navigation bar | Visible with cross-LGU comparative matrix |
| **Barangay Scorecard** | Shows only barangays belonging to the selected LGU | Multi-LGU searchable table with provincial chips |
| **DQA Verification** | Isolated strictly to the assigned municipality's records | Regional random sampling across all clusters |
| **Excel Export** | Single LGU workbook; multi-muni sheets stripped | Comprehensive regional consolidation workbook |

---

## 4. Getting Started & System Launch

### System Requirements
* **Operating System:** Windows 10/11, macOS, or Linux.
* **Browser:** Microsoft Edge, Google Chrome, or Mozilla Firefox (latest versions recommended).
* **Dependencies:** None. No installation, administrator privileges, or internet connection required.

### Launch Procedure
1. Locate the file: `dist/PCRP Encoding and Data Quality Assessment Tool.html` (or your desktop shortcut).
2. Double-click the file to open it in Microsoft Edge or Google Chrome.
3. Upon first launch, the **Settings & Data Import** screen will display.
4. Click **Select Workspace Role & Geographic Scope**:
   * Select **PEA / MDM** and choose your designated Municipality (e.g., *San Jose, Dinagat Islands*).
   * Or select **Regional RPMO** for region-wide analysis.
5. The header badge will update to show: `Scope: [Your Municipality Name]` with a green readiness indicator.

---

## 5. KCIS Data Export & Ingestion Guide

The tool accepts raw export files directly downloaded from the KCIS Web Portal. You do not need to rename or format them.

### Required Source Files
1. **KCIS Participants Export (`.xlsx` or `.csv`):**
   * *Purpose:* Activity attendance records, participant demographics (sex, age, IP status), dates of conduct, and encoding timestamps.
   * *Critical for:* Calculating total attendance, unique participants, and 7-day encoding timeliness.
2. **KCIS Household Export / K2 Roster (`.xlsx` or `.csv`):**
   * *Purpose:* Masterlist of barangay households, household IDs, and designated heads/representatives.
   * *Critical for:* 70% Quorum compliance testing and household penetration rates.
3. **KCIS Community Volunteer List (`.xlsx` or `.csv`):**
   * *Purpose:* Volunteer registrations, committee designations (BResT, PIT, PT, CMSC, SFMSC), and leadership roles.
   * *Critical for:* BResT composition audit and 30% marginalized/vulnerable representation quotas.
4. *Alternative:* **Consolidated Monitor Workbook (`.xlsx`):**
   * If you maintain an existing workbook with sheets named `Raw_Participants`, `Raw_Households`, `Baseline`, and `Activities`, drop the single workbook directly.

### Step-by-Step Loading
1. Open the **Settings & Setup** sidebar in the app.
2. Drag and drop the downloaded KCIS files directly into the dashed dropzone card.
3. The file recognizer will automatically detect the file types from internal headers.
4. Specify the **KCIS Pull Date** (the date the raw data was extracted from the server). This sets the baseline for the 3-day and 7-day timeliness rules.
5. Click **"Show Findings"** to generate the active monitor dashboard.

---

## 6. Module Walkthrough: Executive Overview Dashboard

The **Overview Dashboard** provides an executive summary of field accomplishments and data health.

```
┌───────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ TOTAL ATTENDANCE  │ UNIQUE ATTENDEES  │ 70% QUORUM STATUS │ DQA INTEGRITY     │
│      4,821        │      2,145        │   10 / 12 (83%)   │      96.8%        │
│ 62.8% Female Part.│ 12 Barangays      │  2 Lacking Quorum │   Grade A Health  │
└───────────────────┴───────────────────┴───────────────────┴───────────────────┘
```

### Key Components
* **Stage 1 Milestone Pipeline:** Visual progress bars tracking the 4 key community milestones:
  1. *1st Barangay Assembly (BA1):* Project Orientation & Team Selection
  2. *BResT Formation & Validation:* Volunteer onboarding & executive approval
  3. *PRVA & Community Action Planning:* Risk assessments & priority identification
  4. *2nd Barangay Assembly (BA2):* Validation & Committee Formation
* **KPI Scorecards:** Instant figures for total attendees, unique persons, quorum compliance percentage, and volunteer roster health.
* **Barangay Progress & Quorum Scorecard:** Interactive table listing every barangay with search, sorting, and drill-down buttons.

---

## 7. Module Walkthrough: 70% Quorum & Household Participation

Under **KALAHI-CIDSS SM1**, a Barangay Assembly is only valid if at least **70% of registered households** are represented.

### Quorum Compliance Logic
$$\text{Participation Rate (\%)} = \frac{\text{Unique Households Present at Assembly}}{\text{Total Barangay Household Population}} \times 100$$

* If $\text{Participation Rate} \ge 70.0\%$: Tagged with a green **"✓ Quorum Met"** badge.
* If $\text{Participation Rate} < 70.0\%$: Tagged with a red **"⚠ Quorum Not Met"** badge.

### Field Action Protocol for Quorum Deficits
1. In the **Household Participation** module, sort by *Participation Rate (Ascending)*.
2. Identify barangays highlighted in red (e.g., *Don Ruben Ecleo at 64.9%*).
3. Click **"Resolve Issue"** to open the unrepresented household list.
4. **Corrective Measures:**
   * Verify if late-arriving attendance sheets were omitted during KCIS data entry.
   * If physical attendance was genuinely under 70%, the ACT/MCT must convene a **Re-seating / Reconvened Assembly** before sub-project validation can proceed.

---

## 8. Module Walkthrough: Community Volunteers & BResT/MResT

Resilience teams are the community backbone of the PCRP framework.

### Barangay Resilience Team (BResT) Audit Rules
* **Minimum Membership:** Standard team size (12 to 16 volunteers per barangay).
* **30% Marginalized Quota:** At least 30% of volunteer members must represent marginalized sectors (Women, Senior Citizens, Indigenous Peoples, PWDs, 4Ps beneficiaries, or Youth).
* **Gender Equality Target:** Minimum 50% women participation across committees.
* **Team Structure:** No single chairperson required; operates as a collegiate body.

### Municipal Resilience Team (MResT) Audit Rules
* **Executive Order (EO) Verification:** Tracks whether the Local Chief Executive (Mayor) has issued a signed Executive Order organizing the MResT.
* **Composition Check:** Validates inclusion of Municipal Planning and Development Coordinator (MPDC), Municipal Disaster Risk Reduction and Management Officer (MDRRMO), Municipal Social Welfare and Development Officer (MSWDO), Municipal Engineer, and Civil Society Organization (CSO) representatives.

---

## 9. Module Walkthrough: SM7 Table 8 Field Verification Engine

To ensure digital records correspond to reality, monitors must conduct physical cross-verifications.

```
┌────────────────────────────────────────────────────────────────────────┐
│               SM7 TABLE 8 FIELD VERIFICATION PROTOCOL                 │
│                                                                        │
│   [ 10% Random Sampling ] ──> Generates representative sample          │
│                                   │                                    │
│                                   ▼                                    │
│   [ Physical Cross-Check ] ──> Compare digital KCIS record with:       │
│                                • Original Form 1 (Attendance Sheet)    │
│                                • K2 Household Profile Form             │
│                                • Volunteer Oath & Sector ID            │
│                                   │                                    │
│                                   ▼                                    │
│   [ Tag Verification ]     ──> Assign Status:                          │
│                                [ VERIFIED ]       (Green check)        │
│                                [ DISCREPANCY ]    (Amber warning)      │
│                                [ UNCHECKED ]      (Grey pending)       │
└────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Verification Procedure
1. Open the **Verify (DQA Precision)** tab.
2. Click **"🎲 Generate Random 10% Sample"**. The system selects a statistically sound, randomized subset of encoded records across all barangays.
3. Bring the physical source documents (stored in the ACT municipal document archive).
4. For each sampled row:
   * Verify participant name, sex, and birthdate against physical signature on the attendance sheet.
   * If matched: Click **Tag: Verified**.
   * If mismatch found (e.g., encoded birthdate differs from signed form): Click **Tag: Discrepancy** and enter a note.
5. Click **"Save Verification Tags"** to store your audit trail in the encrypted local database.
6. Click **"📄 DQA Audit Memo"** to print or export the official field verification findings memorandum.

---

## 10. Module Walkthrough: Data Health & Automated Audit Memo

The tool performs background diagnostic scans across four core data quality dimensions:

1. **Completeness:** Flags missing mandatory values (birthdates, sex, barangay codes, household numbers).
2. **Timeliness (The 7-Day Rule):** Evaluates if records were encoded into KCIS within 7 calendar days from the actual field activity conduct date.
3. **Validity & Logical Consistency:** Detects invalid birth years, future dates, unrealistic participant ages, or inverted assembly sequences.
4. **Integrity & Uniqueness:** Identifies duplicate participant IDs, duplicate household head entries, and ghost attendance rows.

---

## 11. Session Persistence, Delta Sync, and Excel Export

### Saving and Resuming Work
* **Browser Persistence:** The browser automatically saves your active session, scope settings, and verification tags. Reopening the browser tab reloads your exact findings.
* **Encrypted `.pcrp` File Export:** Click **"Save Session to File"** to export an encrypted snapshot. This allows you to transfer your work to another laptop or submit it to the regional office.
* **Delta Sync (`.pcrpd`):** If an updated KCIS pull is performed, apply a delta file to sync new records without overwriting your manual verification tags.
* **Export to Excel (`.xlsx`):** Click **"↓ Export to Excel"** in the top header. The exported workbook is automatically scoped:
  * For PEA/MDM: Contains municipal summary, barangay scorecards, unrepresented household lists, and DQA audit logs.
  * For RPMO: Includes multi-LGU regional matrices and cross-provincial comparisons.

---

## 12. Troubleshooting & Frequently Asked Questions (FAQ)

### Q1: The dropzone shows "File not recognized". What should I do?
**Answer:** Ensure the export was downloaded directly from KCIS without modifying column headers. If columns were added or deleted manually in Excel, the tool’s automated parser cannot identify the table structure. Re-download the fresh export from the KCIS portal.

### Q2: Why is the "Municipalities" tab missing from my navigation bar?
**Answer:** You are currently in the **PEA / MDM (Municipal Field Workspace)** role. This is by design to ensure complete municipal data isolation. If you require region-wide access across all 26 LGUs, click the **Scope Pill** in the top header and switch your role to **Regional RPMO**.

### Q3: My computer was restarted and my files are gone. Can I recover them?
**Answer:** The tool remembers your session via browser cache. When you reopen the tool, check the top bar on the Import page: if it says *"Session Saved"*, click **"Show Findings"**. If storage was cleared, simply drag and drop your `.pcrp` backup file or your raw KCIS exports again.

### Q4: How do I clear sensitive data before handing my laptop to another staff member?
**Answer:** Click **Settings**, then click the red button: **"Forget Saved Data"**. This completely wipes all cached personal data, participant records, and verification tags from the browser.

---

*Manual maintained by the PCRP M&E and Data Systems Unit.*  
*Republic of the Philippines · Department of Social Welfare and Development (DSWD) · KALAHI-CIDSS PCRP*
