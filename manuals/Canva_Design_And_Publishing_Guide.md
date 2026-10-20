# Master Canva Design & Publishing Blueprint
## How to Design, Layout, and Produce the PCRP User Manual in Canva

This guide provides step-by-step instructions for creating a world-class, print-ready, and interactive digital **User Manual** for the **PCRP Encoding and Data Quality Assessment Tool** using [Canva](https://www.canva.com/).

---

## 1. Project Setup in Canva

### Step 1: Choose Document Format & Dimensions
Depending on how your team plans to distribute the manual:
* **Option A: Official Printed Manual / PDF Booklet (Recommended)**
  * In Canva, click **Create a design** > Select **Document (A4)** (`210 × 297 mm`) or **US Letter Document** (`8.5 × 11 inches`).
  * Enable Bleed & Margins: Go to **File** > **View settings** > Check **Show margins** and **Show print bleed**.
* **Option B: Digital Presentation / Interactive Slide Deck**
  * In Canva, select **Presentation (16:9)** (`1920 × 1080 px`).
  * Ideal for projector presentations during ACT municipal training sessions.

### Step 2: Establish the Brand Color Palette
Create a custom Brand Kit or color palette in Canva with the official KALAHI-CIDSS / PCRP hex codes:

| Color Name | Hex Code | Canva Role |
| :--- | :--- | :--- |
| **DSWD Cobalt Blue** | `#0038A8` | Primary Brand Color: Headers, main action buttons, cover title |
| **Deep Slate Navy** | `#0F172A` | Background for dark cards, high-contrast title bars, text |
| **Dark Slate Gray** | `#1E293B` | Secondary dark elements, pill scopes, table header backgrounds |
| **Sky Tech Cyan** | `#38BDF8` | Accent highlight, callouts, active indicators, borders |
| **Canvas Background** | `#F8FAFC` | Light page background, table row alternating tint |
| **Quorum Met Green** | `#15803D` | Success status badges, compliance pills (`#DCFCE7` background) |
| **Action Amber** | `#D97706` | Warning badges, pending submissions (`#FEF3C7` background) |
| **Alert Red** | `#DC2626` | Quorum not met, critical errors (`#FEE2E2` background) |

### Step 3: Typography Hierarchy
Set up the following font pairings in Canva (all freely available in Canva Free & Pro):
* **Main Titles & Cover:** `Montserrat` (Bold / Extra Bold) or `Inter` (Black)
* **Section Headings (H1/H2):** `Inter` (Bold, 18–24 pt)
* **Body Text:** `Inter` (Regular, 10–11 pt, 1.4 line spacing) or `Open Sans`
* **Data, Codes & File Extensions:** `Space Mono` or `Courier Prime` (9–10 pt)

---

## 2. Page-by-Page Layout Blueprint

Here is the exact page breakdown for a 12-page professional manual:

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│     PAGE 1      │ │     PAGE 2      │ │     PAGE 3      │ │     PAGE 4      │
│  Cover Design   │ │ Executive Sum.  │ │ 100% Offline    │ │ Roles & Scope   │
│  (Hero Mockup)  │ │ & Contents      │ │ Architecture    │ │ (PEA vs RPMO)   │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│     PAGE 5      │ │     PAGE 6      │ │     PAGE 7      │ │     PAGE 8      │
│ KCIS Data Drag  │ │ Overview Dash   │ │ 70% Quorum &    │ │ Volunteer Teams │
│ & Drop Ingest   │ │ & KPIs          │ │ Household Score │ │ (BResT / MResT) │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│     PAGE 9      │ │     PAGE 10     │ │     PAGE 11     │ │     PAGE 12     │
│ SM7 Table 8 DQA │ │ Data Health &   │ │ Session Save,   │ │ Back Cover,     │
│ Verification    │ │ 7-Day Rule      │ │ Delta & Excel   │ │ Support & DPA   │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Page 1: Cover Page
* **Layout:** Full-bleed visual layout.
* **Image Asset to Use:** `manuals/assets/pcrp_manual_cover_1792498002508.jpg`.
* **Canva Steps:**
  1. Drag the image into Canva and set it as page background, or place it inside an A4 frame with a subtle dark drop shadow.
  2. Overlay the institutional text at the top: `DEPARTMENT OF SOCIAL WELFARE AND DEVELOPMENT · KALAHI-CIDSS PCRP`.
  3. Add a subtitle badge at the bottom: `Offline Field Console · Version 2.4 · Official Field Operations Guide`.

### Page 2: Executive Summary & Table of Contents
* **Layout:** Clean 2-column layout.
* **Left Column:** Executive summary, system purpose, RA 10173 data privacy declaration.
* **Right Column:** Modern hyperlinked Table of Contents with page number pills and horizontal separator lines.
* **Canva Elements to Search:** `minimal table of contents`, `index line`, `privacy shield icon`.

### Page 3: 100% Offline Architecture & Security
* **Layout:** Technical architecture highlight page.
* **Image Asset to Use:** `manuals/assets/pcrp_workflow_infographic_1792498025344.jpg`.
* **Key Visual Elements:**
  1. Insert the 4-step workflow infographic into the center of the page.
  2. Underneath, add 3 feature callout boxes:
     * *No Cloud Ingestion* (Icon: `cloud slash`)
     * *RA 10173 Compliant* (Icon: `law book` or `padlock`)
     * *Works Anywhere* (Icon: `offline wifi`)

### Page 4: Role & Municipal Scope Isolation
* **Layout:** Side-by-side comparison cards (PEA/MDM Field Workspace vs. Regional RPMO Oversight).
* **Wireframe to Use:** Drag `manuals/assets/01-settings-import-wireframe.svg` into Canva.
* **Visual Styling:**
  * Left Card (PEA/MDM): Cobalt Blue border (`#0038A8`), badge `100% Locked Municipal Workspace`.
  * Right Card (RPMO): Neutral Slate border (`#CBD5E1`), badge `Executive Oversight · 26 LGUs`.

### Page 5: KCIS Data Ingestion & Drag-and-Drop
* **Layout:** Step-by-step visual workflow (Numbered 1, 2, 3 circles).
* **Canva Steps:**
  1. Insert a drag-and-drop file target graphic (search `file dropzone` or use the dropzone from wireframe 01).
  2. Add 3 badges for the supported file types:
     * `.xlsx` (Green Excel badge)
     * `.csv` (Amber text badge)
     * `.pcrp` (Encrypted secure session badge)
  3. Include a warning callout box: *"Do not alter original column headers in Excel prior to loading."*

### Page 6: Overview Dashboard & Stage 1 Milestones
* **Layout:** Top half: Dashboard preview; Bottom half: 4 Milestone cards.
* **Image Asset to Use:** `manuals/assets/pcrp_dashboard_interface_1792498043704.jpg` or `manuals/assets/02-overview-dashboard-wireframe.svg`.
* **Visual Breakdown:**
  * Annotate the 5 KPI Cards: *Total Attendance*, *Unique Attendees*, *70% Quorum*, *Volunteers*, *DQA Score*.
  * Milestone pipeline breakdown: BA1 -> BResT Formation -> PRVA Action Plan -> BA2.

### Page 7: 70% Quorum Compliance Scorecard
* **Layout:** Table layout showcasing barangay calculation metrics.
* **Key Elements:**
  * Highlight the formula box in a light blue callout card:
    $$\text{Quorum \%} = \frac{\text{Unique Households Present}}{\text{Total Barangay Households}} \times 100$$
  * Create a mock table in Canva showing compliant vs non-compliant rows (with green `✓ Quorum Met` and red `⚠ Quorum Not Met` tags).
  * Add the **Field Reseating Protocol** step-by-step box.

### Page 8: Volunteer Governance (BResT & MResT Tracking)
* **Layout:** 2-column card split.
* **Left Card (BResT):** Team composition rules, 30% marginalized quota breakdown (Women, IPs, PWDs, 4Ps), collegiate leadership structure.
* **Right Card (MResT):** Executive Order (EO) checklist, MDRRMO, MSWDO, MPDC, and CSO validation checks.

### Page 9: SM7 Table 8 Field Verification Engine
* **Layout:** Audit workbench workflow.
* **Wireframe Asset to Use:** `manuals/assets/03-dqa-verification-wireframe.svg`.
* **Visual Callouts:**
  * Add circular numbered callouts pointing to:
    1. *Random 10% Sample Generator*
    2. *Digital vs. Physical Sheet Matching*
    3. *Audit Tags: VERIFIED / DISCREPANCY / UNCHECKED*
    4. *DQA Audit Memorandum Generator*

### Page 10: Data Health & Diagnostic Rules
* **Layout:** 4-quadrant grid for the 4 SM7 Core Dimensions:
  1. *Completeness* (Missing mandatory fields)
  2. *Timeliness* (The strict 7-Day Encoding Rule)
  3. *Validity* (Birthdate & sequence logic)
  4. *Integrity* (Zero duplicate records)

### Page 11: Session Management, Delta Sync & Excel Export
* **Layout:** Action guide with screenshot buttons.
* **Instructions & Visuals:**
  * How to save an encrypted `.pcrp` snapshot file.
  * How to sync delta updates (`.pcrpd`) without losing manual audit tags.
  * How to export the final role-scoped Excel workbook (`.xlsx`).
  * Shared PC hygiene: Highlight the red **"Forget Saved Data"** button.

### Page 12: Back Cover & Support Emergency Contacts
* **Layout:** Minimalist dark navy layout (`#0F172A`).
* **Content:**
  * DSWD & KALAHI-CIDSS official seals / logos.
  * National M&E Helpdesk and Regional Project Management Office contact information.
  * Data Privacy Act (RA 10173) statutory warning.
  * Version stamp: `Document Ref: PCRP-DOC-MAN-2026-V2.4`.

---

## 3. Recommended Canva Elements & Search Prompts

When styling pages in Canva, use these exact keywords in the **Elements** tab:

| Element Type | Exact Search Keywords in Canva | Recommended Style |
| :--- | :--- | :--- |
| **Device Mockup** | `laptop mockup isolated`, `macbook mockup clean` | Flat, borderless, neutral workspace |
| **Data Badges** | `pill badge`, `status tag`, `rounded rectangle` | Soft background (`10% opacity`), solid text |
| **Security & Privacy** | `cyber security shield`, `padlock line icon`, `data privacy` | Thin line vector, sky blue `#38BDF8` |
| **Audit & Verification** | `checklist icon`, `verified checkmark`, `magnifying glass audit` | Two-tone minimalist |
| **Flowchart Arrows** | `curved gradient arrow`, `dashed workflow connector` | Modern subtle cyan or cobalt |
| **Callout Boxes** | `quote card`, `info note container`, `gradient banner` | Rounded corners (8–12 px), light gray border |

---

## 4. How to Use the Prepared Visual Assets in Canva

All visual assets have been organized in your project workspace inside `manuals/assets/`:

1. **Direct Drag-and-Drop Image Import:**
   * Open your Canva project in your browser.
   * Open your computer file explorer to:  
     `c:\Users\kimpo\Documents\PCRP POM and SMs\PCRP-Monitor-Desktop\manuals\assets\`
   * Select `pcrp_manual_cover_1792498002508.jpg`, `pcrp_workflow_infographic_1792498025344.jpg`, and `pcrp_dashboard_interface_1792498043704.jpg`.
   * Drag them directly into Canva’s **Uploads** panel.
2. **Native SVG Wireframe Import (Infinite Resolution):**
   * Canva supports native SVG file uploads!
   * Drag `01-settings-import-wireframe.svg`, `02-overview-dashboard-wireframe.svg`, and `03-dqa-verification-wireframe.svg` directly onto any Canva page.
   * *Pro-Tip:* In Canva, you can click individual vector elements inside the uploaded SVGs to change their colors or hide specific labels!

---

## 5. Exporting and Publishing Your Finished Manual

Once you have arranged the pages in Canva:

### Export Option 1: Print-Ready Distribution Booklet
1. In Canva, click **Share** (top right) > **Download**.
2. File Type: Select **PDF Print**.
3. Settings:
   * Check **Crop marks and bleed** (if sending to an official government press or commercial print shop).
   * Color Profile: Select **CMYK (best for professional printing)** if you have Canva Pro; otherwise **RGB** for desktop office color laser printers.
4. Click **Download**.

### Export Option 2: Interactive Digital PDF for Field Staff
1. In Canva, click **Share** > **Download**.
2. File Type: Select **PDF Standard**.
3. In Canva, ensure you hyperlinked the Table of Contents items (select text > press `Ctrl + K` > link to internal page number).
4. Click **Download**. This produces a lightweight, clickable PDF suitable for emailing or sharing via USB flash drives.

### Export Option 3: Live Online Web Handbook
1. In Canva, click **Share** > **More** > **Website**.
2. Web style: Select **Navigation** or **Scrolling**.
3. Canva generates a live, mobile-responsive web link that field teams can open on their mobile phones or tablets in the field.

---

*Blueprint prepared for KALAHI-CIDSS PCRP Field Implementation Units.*
