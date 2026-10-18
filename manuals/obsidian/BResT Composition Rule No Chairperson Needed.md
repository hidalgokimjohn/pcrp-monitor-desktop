---
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
