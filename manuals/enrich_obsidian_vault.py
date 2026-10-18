import os
from pathlib import Path

VAULT_DIR = Path("/Users/kjah/Documents/PCRP Monitor DeskApp Tool/manuals/obsidian")

# 1. 00-README & Quickstart.md
readme_content = """---
title: "PCRP Manuals Knowledge Base — Quickstart & Overview"
created: "2026-10-18"
tags:
  - pcrp/knowledge-base
  - obsidian/index
---

# Philippine Community Resilience Project (PCRP / Pagkilos)
## Operations Manuals Knowledge Base & Semantic Graph

Welcome to the Obsidian Knowledge Vault for the **Philippine Community Resilience Project (PCRP / Pagkilos)** operations manuals, synthesized directly from:
1. **[[SM1 Social Mobilization Sub-Manual|Sub-Manual 1: Social Mobilization]]** (CRIP Process, Community Organizing, PRVA, Sub-Projects)
2. **[[SM7 Monitoring & Evaluation Sub-Manual|Sub-Manual 7: Monitoring & Evaluation]]** (Results Framework, KPIs, Community Monitoring Toolkit, DQA Protocols)

---

## 🧭 Visual Graph & Interactive Canvas
- **Interactive Canvas**: Open `PCRP-Manuals.canvas` in Obsidian to explore the visual workflow, community clusters, and structural relationships between teams, stages, and quality standards.
- **Graph View**: Press `Ctrl+G` / `Cmd+G` in Obsidian to see the interactive force-directed graph of all 38 nodes and 48 inter-manual connections.

---

## 📌 Critical Policy Clarification: BResT Composition
> [!IMPORTANT]
> **In BResT composition, NO CHAIRPERSON IS REQUIRED OR APPOINTED.**
> - **Source Policy**: SM1 Part 3, paragraphs 21–26 (pp. 16–18) & SM7 Section 1.5.1 (p. 15).
> - **Rationale**: The **Barangay Resilience Team (BResT)** is a broad-based, inclusive assembly of Community Volunteers (CVs) representing all puroks/sitios and major economic sectors, with $\ge 30\%$ representation from marginalized groups (women, IP, PWD, elderly, youth). It is **not** an executive officer committee.
> - **Committees that DO have Chairpersons**:
>   - [[Municipal Resilience Team (MResT)]]: Chaired by Municipal Mayor or designated MPDO/MDRRMO.
>   - [[Community Resilience Sub-Project Management Committee (CRSPMC  CSPMC)]]: Has elected Chairperson, Vice-Chair, Secretary, and Treasurer.
>   - [[Community Monitoring Sub-Committee (CMSC)]]: 3 CVs elected from BResT ranks in BA2; selects its own Chairperson.
>   - [[Stakeholder & Feedback Mechanism Sub-Committee (SFMSC)]]: Has elected Chairperson.
> - **Read full note**: [[BResT Composition Rule No Chairperson Needed]] and [[Barangay Resilience Team (BResT)]].

---

## 🗂️ Core Index & Navigation Hubs

### 1. Community Resilience Implementation Process (CRIP)
- [[Community Resilience Implementation Process (CRIP)]]
- [[CRIP Stage 1 Participatory Assessment & Resilience Planning]]
- [[CRIP Stage 2 Community Resilience Sub-Project Development]]
- [[CRIP Stage 3 Community-Managed Sub-Project Implementation]]
- [[CRIP Stage 4 Community-Based Monitoring & Review]]

### 2. Barangay Assemblies
- [[1st Barangay Assembly (BA1) Project Orientation & Team Selection]]
- [[2nd Barangay Assembly (BA2) PRVA Validation & Committee Formation]]
- [[3rd Barangay Assembly (BA3) Sub-Project Proposal Approval]]
- [[4th Barangay Assembly  Barangay Accountability Reporting (BAR)]]

### 3. Community Teams & Governance Bodies
- [[Barangay Resilience Team (BResT)]] (No chairperson required)
- [[Municipal Resilience Team (MResT)]] (Municipal EO, LGU leads)
- [[Community Resilience Sub-Project Management Committee (CRSPMC  CSPMC)]]
- [[Community Monitoring Sub-Committee (CMSC)]] (3 CVs from BResT)
- [[Stakeholder & Feedback Mechanism Sub-Committee (SFMSC)]]
- [[Project Implementation Team (PIT)]]
- [[Community Procurement Team (PT)]]
- [[Audit & Inventory Team (AIT)]]
- [[Operations & Maintenance Team (O&MT)]]

### 4. Methodologies & Quality Standards
- [[Participatory Risk & Vulnerability Assessment (PRVA)]]
- [[Risk & Vulnerability Walk-Through and Spot Mapping]]
- [[Focused Group Discussions (FGDs) with Sectors]]
- [[Household Quorum Standard (K2 Standard)]]
- [[Data Quality Assessment (DQA) & Verification Protocols]]
- [[Community Monitoring Toolkit (Annex L)]]
- [[KALAHI-CIDSS Comprehensive Information System (KCIS)]]
- [[Environmental and Social Management Plan (ESMP)]]
"""
(VAULT_DIR / "00-README & Quickstart.md").write_text(readme_content, encoding="utf-8")

# 2. Enrich BResT Composition Rule No Chairperson Needed.md
brest_rule_content = """---
source_file: "manuals/SM1_ Social Mobilization.pdf"
type: "policy_rule"
community: "BResT Composition & PRVA Planning"
tags:
  - pcrp/policy
  - pcrp/brest
  - pcrp/governance
  - graphify/policy_rule
  - graphify/EXTRACTED
---

# BResT Composition Policy: No Chairperson Needed

> [!NOTE] Official Manual Reference
> - **Sub-Manual 1 (Social Mobilization)**: Part 3, Section 3.3 (Participatory Risk and Vulnerability Assessment), Paragraphs 21–22 (pp. 16–18).
> - **Sub-Manual 7 (Monitoring and Evaluation)**: Section 1.5.1 (Barangay/Community Level), p. 15 & Annex L (Community Monitoring Toolkit), pp. 108–109.

---

## 1. Authoritative Policy Rule

In the composition of the **Barangay Resilience Team (BResT)**, **NO CHAIRPERSON IS REQUIRED, ASSIGNED, OR EXPECTED**.

The BResT is formulated as a collective, participatory body of **Community Volunteers (CVs)** mobilized during the **[[1st Barangay Assembly (BA1) Project Orientation & Team Selection|1st Barangay Assembly (BA1)]]**. Its primary role is fieldwork and community consultation during Stage 1:
1. Conducting hands-on transect walk-throughs and hazard spot mapping ([[Risk & Vulnerability Walk-Through and Spot Mapping]]).
2. Mobilizing community members for sectoral consultations ([[Focused Group Discussions (FGDs) with Sectors]]).
3. Participating in the [[Barangay PRVA Workshop]] to synthesize risk priorities.

Because BResT is an open, zone-and-sector-based volunteer team rather than an executive decision-making body, it operates collectively under the technical facilitation of the Community Facilitator (CF) and the Area Coordinating Team (ACT).

---

## 2. Mandatory Composition Criteria for BResT

Under SM1 paragraph 22, the selection of BResT volunteers must adhere to three mandatory diversity and representation quotas:

| Criterion | Requirement | Verification Source |
| :--- | :--- | :--- |
| **Purok / Sitio Representation** | **100% of Puroks / Sitios** in the barangay must have at least one volunteer | Purok list vs BResT Directory |
| **Economic Sectors** | Must represent major livelihoods (farmers, fisherfolk, agricultural workers) | Sector tags in CV registry |
| **Marginalized Inclusion** | **At least 30%** of volunteers must represent marginalized groups: women, IP, PWD, elderly, youth | Sex, IP, PWD attributes in KCIS |
| **Individual Qualifications** | Barangay resident for $\ge 5$ years; broad community knowledge; physically fit for walk-through | Volunteer Profile Sheets |
| **Chairperson Designation** | **None** (Not required / Not applicable) | N/A |

---

## 3. Comparative Matrix: Committees With vs Without Chairpersons

A frequent source of data confusion is confounding the broad BResT team with executive sub-project committees formed later in the CRIP cycle:

| Body | Formed In | Chair Required? | Officers Structure | Purpose |
| :--- | :--- | :---: | :--- | :--- |
| **[[Barangay Resilience Team (BResT)]]** | **BA1** (Stage 1) | ❌ **NO** | Collective volunteer members (purok/sector leads) | PRVA mapping, walk-through, FGD mobilization |
| **[[Stakeholder & Feedback Mechanism Sub-Committee (SFMSC)]]** | **BA1** (Stage 1) | ✅ **YES** | Chairperson + Members | Grievance redress mechanism (GRM) & feedback |
| **[[Municipal Resilience Team (MResT)]]** | Pre-Stage 1 | ✅ **YES** | Chaired by Mayor / MPDO / MDRRMO | Inter-departmental municipal resilience coordination |
| **[[Community Resilience Sub-Project Management Committee (CRSPMC  CSPMC)]]** | **BA2** (Stage 2) | ✅ **YES** | Chairperson, Vice-Chair, Secretary, Treasurer | Sub-project execution, procurement, financial management |
| **[[Community Monitoring Sub-Committee (CMSC)]]** | **BA2** (Stage 2) | ✅ **YES** | 3 CVs from BResT ranks + Elected Chairperson | Independent sub-project & safeguards monitoring |

> [!IMPORTANT]
> **Sub-Committee Relationship to BResT**:
> As specified in SM7 p. 15 and p. 109, members of the **CMSC** are selected **from among the ranks of the BResT** during the 2nd Barangay Assembly (BA2). Once elected to CMSC, these 3 volunteers elect their own Chairperson for the CMSC. This further clarifies why BResT as a whole has no chairperson—it is the pool from which specialized sub-committees are drawn.

---

## 4. Software & System Validation Impact

Prior versions of data verification checklists incorrectly flagged BResT rosters as "Needs Fixing" if no row had `chair = true`. Under the verified manual specifications:

1. **Table View**: Replace "Lead Chairperson" column with **"Sectors / Purok Roles"** (`item.sectors`).
2. **Data Quality Assessment**: Remove any rule requiring a chairperson for BResT. Validation criteria for BResT must evaluate:
   - Sufficient volunteer quorum ($\ge 10$ volunteers or full purok coverage).
   - $\ge 30\%$ marginalized inclusion (women, IP, PWD).
   - All volunteers cross-referenced with BA1 attendance sheets.
3. **Export CSV**: BResT team export columns reflect:
   - `Barangay`, `Municipality`, `Province`, `Sectors / Purok Roles`, `Members Count`, `Women Count`, `Women Pct`, `Marginalized Count`, `Marginalized Pct`, `Compliance Status`, `Validation Issues`.

---

## Connections
- [[Barangay Resilience Team (BResT)]] - `governs_composition_of`
- [[BResT 30% Marginalized Quota Rule]] - `co_policy_standard`
- [[Community Monitoring Sub-Committee (CMSC)]] - `contrasts_with`
- [[SM1 Social Mobilization Sub-Manual]] - `extracted_from`
- [[SM7 Monitoring & Evaluation Sub-Manual]] - `extracted_from`
"""
(VAULT_DIR / "BResT Composition Rule No Chairperson Needed.md").write_text(brest_rule_content, encoding="utf-8")

# 3. Enrich Barangay Resilience Team (BResT).md
brest_content = """---
source_file: "manuals/SM1_ Social Mobilization.pdf"
type: "committee"
community: "BResT Composition & PRVA Planning"
tags:
  - pcrp/brest
  - pcrp/volunteers
  - pcrp/community
  - graphify/committee
  - graphify/EXTRACTED
---

# Barangay Resilience Team (BResT)

The **Barangay Resilience Team (BResT)** is the foundational community participatory structure established under the **Philippine Community Resilience Project (PCRP / Pagkilos)** during **[[1st Barangay Assembly (BA1) Project Orientation & Team Selection|Stage 1 (1st Barangay Assembly / BA1)]]**.

---

## 1. Mandate and Responsibilities

The BResT acts as the primary community working group to diagnose local vulnerabilities and articulate resilience priorities:

1. **[[Risk & Vulnerability Walk-Through and Spot Mapping]]**:
   Conducts field walk-throughs across all puroks and sitios with the Community Facilitator (CF) to map out hazard zones, life-line facilities, agricultural lands, and vulnerable households.
2. **Community Profiling**:
   Gathers and validates primary demographic, socio-economic, and hazard history data for the official [[Participatory Risk & Vulnerability Assessment (PRVA)|Community Profile]].
3. **Sectoral Mobilization**:
   Organizes community members to participate in [[Focused Group Discussions (FGDs) with Sectors]] (farmers, fisherfolk, indigenous peoples, women, youth, elderly).
4. **[[Barangay PRVA Workshop]]**:
   Synthesizes the findings of the mapping, profiling, and FGDs into the Barangay Risk & Vulnerability Matrix, forming the basis for sub-project identification.
5. **Cadre for Stage 2 Sub-Committees**:
   Serves as the volunteer pool from which the **[[Community Monitoring Sub-Committee (CMSC)]]** and other sub-project committees are selected at the 2nd Barangay Assembly.

---

## 2. Composition and Quota Rules

- **No Chairperson Required**: Governed by [[BResT Composition Rule No Chairperson Needed]]. BResT has no single lead or chair.
- **Marginalized Inclusion**: Governed by [[BResT 30% Marginalized Quota Rule]]. At least 30% of members must be women, IP, PWD, youth, or elderly.
- **Geographic Saturation**: Every purok and sitio in the barangay must have designated representation.
- **Economic Inclusion**: Direct representation of principal livelihood sectors (tenants, plantation workers, smallholder farmers, coastal fisherfolk).

---

## 3. Workflow Progression

```
[1st Barangay Assembly (BA1)]
          │
          ▼ (Selected by Community)
[Barangay Resilience Team (BResT)]
   ├── Walk-through & Spot Mapping
   ├── Household Profiling & Validation
   ├── Sectoral FGD Mobilization
   └── Barangay PRVA Workshop
          │
          ▼ (At 2nd Barangay Assembly / BA2)
[Elects 3 Members to Community Monitoring Sub-Committee (CMSC)]
```

---

## Connections
- [[BResT Composition Rule No Chairperson Needed]] - `governed_by` [EXTRACTED]
- [[BResT 30% Marginalized Quota Rule]] - `must_comply_with` [EXTRACTED]
- [[1st Barangay Assembly (BA1) Project Orientation & Team Selection]] - `formed_at` [EXTRACTED]
- [[Participatory Risk & Vulnerability Assessment (PRVA)]] - `executes` [EXTRACTED]
- [[Risk & Vulnerability Walk-Through and Spot Mapping]] - `conducts` [EXTRACTED]
- [[Focused Group Discussions (FGDs) with Sectors]] - `mobilizes` [EXTRACTED]
- [[Barangay PRVA Workshop]] - `participates_in` [EXTRACTED]
- [[Community Monitoring Sub-Committee (CMSC)]] - `provides_candidates_for` [EXTRACTED]
- [[Data Quality Assessment (DQA) & Verification Protocols]] - `audited_by` [EXTRACTED]
"""
(VAULT_DIR / "Barangay Resilience Team (BResT).md").write_text(brest_content, encoding="utf-8")

# 4. Enrich Community Monitoring Sub-Committee (CMSC).md
cmsc_content = """---
source_file: "manuals/SM7_ Monitoring and Evaluation.pdf"
type: "committee"
community: "BResT Composition & PRVA Planning"
tags:
  - pcrp/monitoring
  - pcrp/cmsc
  - pcrp/accountability
  - graphify/committee
  - graphify/EXTRACTED
---

# Community Monitoring Sub-Committee (CMSC)

The **Community Monitoring Sub-Committee (CMSC)** is the community-based oversight arm of the **Philippine Community Resilience Project (PCRP / Pagkilos)**, detailed in **Sub-Manual 7 (M&E)** Section 1.5.1 (p. 15) and Annex L (Community Monitoring Toolkit, pp. 104–111).

---

## 1. Composition and Leadership

- **Size**: Composed of **at least three (3) Community Volunteers (CVs)**.
- **Selection**: Elected by the community during the **[[2nd Barangay Assembly (BA2) PRVA Validation & Committee Formation|2nd Barangay Assembly (BA2)]]**.
- **Eligibility**: Selected **specifically from among the ranks of the [[Barangay Resilience Team (BResT)]]**.
- **Leadership**: **HAS AN ELECTED CHAIRPERSON**. Unlike BResT (which has no chair), CMSC selects its own Chairperson to coordinate monitoring schedules and sign inspection reports.

---

## 2. Core Functions and Powers

1. **Sub-Project Implementation Oversight**:
   Monitors execution of civil works and livelihood projects to ensure compliance with the approved Program of Works (POW) and timeline.
2. **Safeguards & ESMP Compliance**:
   Oversees adherence to the [[Environmental and Social Management Plan (ESMP)]], verifying worker safety, environmental mitigation, and fair community labor practices.
3. **KPI Tracking**:
   Tracks barangay-level Key Performance Indicators (attendance, volunteer diversity, completion percentages).
4. **Toolkits & Documentation**:
   Utilizes the [[Community Monitoring Toolkit (Annex L)]] to prepare:
   - Community Monitoring Plan
   - Monthly Field Work Plan
   - Data Gathering & Site Observation Guides
5. **Barangay Accountability Reporting (BAR)**:
   Presents formal independent findings and verification audits during the **[[4th Barangay Assembly  Barangay Accountability Reporting (BAR)|4th Barangay Assembly (BAR)]]**.

---

## Connections
- [[Barangay Resilience Team (BResT)]] - `sourced_from_ranks_of` [EXTRACTED]
- [[2nd Barangay Assembly (BA2) PRVA Validation & Committee Formation]] - `elected_at` [EXTRACTED]
- [[Community Monitoring Toolkit (Annex L)]] - `utilizes` [EXTRACTED]
- [[CRIP Stage 4 Community-Based Monitoring & Review]] - `conducts_monitoring_in` [EXTRACTED]
- [[4th Barangay Assembly  Barangay Accountability Reporting (BAR)]] - `presents_findings_at` [EXTRACTED]
- [[Environmental and Social Management Plan (ESMP)]] - `monitors_safeguards_of` [EXTRACTED]
"""
(VAULT_DIR / "Community Monitoring Sub-Committee (CMSC).md").write_text(cmsc_content, encoding="utf-8")

# 5. Enrich Municipal Resilience Team (MResT).md
mrest_content = """---
source_file: "manuals/SM1_ Social Mobilization.pdf"
type: "committee"
community: "Monitoring, Evaluation & Data Quality"
tags:
  - pcrp/mrest
  - pcrp/lgu
  - pcrp/governance
  - graphify/committee
  - graphify/EXTRACTED
---

# Municipal Resilience Team (MResT)

The **Municipal Resilience Team (MResT)** is the inter-departmental coordinating structure organized by the Municipal Local Government Unit (MLGU) to steer PCRP implementation across all participating barangays.

---

## 1. Legal Basis & Composition

- **Legal Instrument**: Formed through an **Executive Order (EO)** issued by the Municipal Mayor.
- **Leadership**: Chaired by the **Municipal Mayor**, or co-chaired by the Municipal Planning and Development Coordinator (MPDC) / Municipal Disaster Risk Reduction and Management Officer (MDRRMO).
- **Core Membership**:
  - Municipal Planning and Development Office (MPDO)
  - Municipal Disaster Risk Reduction and Management Office (MDRRMO)
  - Municipal Social Welfare and Development Office (MSWDO)
  - Municipal Engineering Office (MEO)
  - Municipal Agriculture Office (MAO)
  - Municipal Environment and Natural Resources Office (MENRO)
  - Municipal Economic Enterprise Development Office (MEEDO)
  - Accredited Civil Society Organizations (CSOs) / Non-Government Organizations (NGOs)

---

## 2. Key Responsibilities in CRIP

1. **Pre-CRIP Harmonization**:
   Reviews existing municipal plans (CLUP, CDP, LDRRMP, CDRA) to identify priority climate and hazard areas prior to barangay entry.
2. **[[Municipal Resilience Planning (MRP) Workshop]]**:
   Convenes and facilitates the municipal workshop where barangay PRVA priorities are synthesized into multi-barangay or municipal resilience investment concept notes.
3. **Local Counterpart Contribution (LCC)**:
   Ensures municipal budgeting and timely release of cash and in-kind counterparts.
4. **Technical Support & LGU Integration**:
   Provides engineering and social facilitation support in partnership with the [[Area Coordinating Team (ACT)]] and [[Municipal Coordinating Team (MCT)]].

---

## Connections
- [[Municipal Resilience Planning (MRP) Workshop]] - `leads` [EXTRACTED]
- [[Barangay Development Council (BDC) Endorsement]] - `coordinates_with` [EXTRACTED]
- [[Area Coordinating Team (ACT)]] - `partners_with` [EXTRACTED]
- [[Municipal Coordinating Team (MCT)]] - `oversees` [EXTRACTED]
- [[Data Quality Assessment (DQA) & Verification Protocols]] - `executive_order_verified_by` [EXTRACTED]
"""
(VAULT_DIR / "Municipal Resilience Team (MResT).md").write_text(mrest_content, encoding="utf-8")

print("Successfully enriched core Obsidian knowledge notes!")
