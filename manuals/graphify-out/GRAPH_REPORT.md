# Graph Report - manuals  (2026-10-18)

## Corpus Check
- 2 files · ~37,403 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 38 nodes · 48 edges · 6 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 37,400 input · 12,800 output

## Community Hubs (Navigation)
- BResT Composition & PRVA Planning
- Monitoring, Evaluation & Data Quality
- BResT Composition & PRVA Planning
- Sub-Project Development & Implementation
- Sub-Project Development & Implementation
- Community Cluster 5

## God Nodes (most connected - your core abstractions)
1. `Barangay Resilience Team (BResT)` - 9 edges
2. `Community Resilience Sub-Project Management Committee (CRSPMC / CSPMC)` - 6 edges
3. `CRIP Stage 3: Community-Managed Sub-Project Implementation` - 6 edges
4. `Municipal Resilience Team (MResT)` - 5 edges
5. `Community Monitoring Sub-Committee (CMSC)` - 5 edges

## Surprising Connections (you probably didn't know these)
- `CRIP Stage 3: Community-Managed Sub-Project Implementation` --enforces--> `Environmental and Social Management Plan (ESMP)`  [EXTRACTED]
  manuals/SM1_ Social Mobilization.pdf → manuals/SM7_ Monitoring and Evaluation.pdf
- `1st Barangay Assembly (BA1): Project Orientation & Team Selection` --governed_by--> `Household Quorum Standard (K2 Standard)`  [EXTRACTED]
  manuals/SM1_ Social Mobilization.pdf → manuals/SM7_ Monitoring and Evaluation.pdf
- `Barangay Resilience Team (BResT)` --provides_candidates_for--> `Community Monitoring Sub-Committee (CMSC)`  [EXTRACTED]
  manuals/SM1_ Social Mobilization.pdf → manuals/SM7_ Monitoring and Evaluation.pdf
- `Area Coordinating Team (ACT)` --encodes_data_into--> `KALAHI-CIDSS Comprehensive Information System (KCIS)`  [EXTRACTED]
  manuals/SM1_ Social Mobilization.pdf → manuals/SM7_ Monitoring and Evaluation.pdf
- `CRIP Stage 3: Community-Managed Sub-Project Implementation` --precedes--> `CRIP Stage 4: Community-Based Monitoring & Review`  [EXTRACTED]
  manuals/SM1_ Social Mobilization.pdf → manuals/SM7_ Monitoring and Evaluation.pdf

## Communities (6 total, 0 thin omitted)

### Community 0 - "BResT Composition & PRVA Planning"
Cohesion: 0.29
Nodes (8): 2nd Barangay Assembly (BA2): PRVA Validation & Committee Formation, 4th Barangay Assembly / Barangay Accountability Reporting (BAR), SM7: Monitoring & Evaluation Sub-Manual, Community Monitoring Toolkit (Annex L), PCRP M&E Results Framework & Theory of Change, CRIP Stage 4: Community-Based Monitoring & Review, Community Monitoring Sub-Committee (CMSC), Operations & Maintenance Team (O&MT)

### Community 1 - "Monitoring, Evaluation & Data Quality"
Cohesion: 0.33
Nodes (7): Data Quality Assessment (DQA) & Verification Protocols, Barangay Development Council (BDC) Endorsement, Municipal Resilience Planning (MRP) Workshop, KALAHI-CIDSS Comprehensive Information System (KCIS), Area Coordinating Team (ACT), Municipal Coordinating Team (MCT), Municipal Resilience Team (MResT)

### Community 2 - "BResT Composition & PRVA Planning"
Cohesion: 0.29
Nodes (7): Barangay PRVA Workshop, Focused Group Discussions (FGDs) with Sectors, Participatory Risk & Vulnerability Assessment (PRVA), Risk & Vulnerability Walk-Through and Spot Mapping, BResT 30% Marginalized Quota Rule, BResT Composition Rule: No Chairperson Needed, Barangay Resilience Team (BResT)

### Community 3 - "Sub-Project Development & Implementation"
Cohesion: 0.33
Nodes (7): Sub-Project Development Workshop (SPDW), CRIP Stage 3: Community-Managed Sub-Project Implementation, Environmental and Social Management Plan (ESMP), Audit & Inventory Team (AIT), Community Resilience Sub-Project Management Committee (CRSPMC / CSPMC), Project Implementation Team (PIT), Community Procurement Team (PT)

### Community 4 - "Sub-Project Development & Implementation"
Cohesion: 0.40
Nodes (6): 3rd Barangay Assembly (BA3): Sub-Project Proposal Approval, SM1: Social Mobilization Sub-Manual, Technical Desk Review (TDR) & RPMO Appraisal, Community Resilience Implementation Process (CRIP), CRIP Stage 1: Participatory Assessment & Resilience Planning, CRIP Stage 2: Community Resilience Sub-Project Development

### Community 5 - "Community Cluster 5"
Cohesion: 0.67
Nodes (3): 1st Barangay Assembly (BA1): Project Orientation & Team Selection, Household Quorum Standard (K2 Standard), Stakeholder & Feedback Mechanism Sub-Committee (SFMSC)

## Knowledge Gaps
- **17 isolated node(s):** `BResT Composition Rule: No Chairperson Needed`, `BResT 30% Marginalized Quota Rule`, `Stakeholder & Feedback Mechanism Sub-Committee (SFMSC)`, `Audit & Inventory Team (AIT)`, `Municipal Coordinating Team (MCT)` (+12 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 17 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Barangay Resilience Team (BResT)` connect `BResT Composition & PRVA Planning` to `BResT Composition & PRVA Planning`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `BResT Composition Rule: No Chairperson Needed`, `BResT 30% Marginalized Quota Rule`, `Stakeholder & Feedback Mechanism Sub-Committee (SFMSC)` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `CRIP Stage 2: Community Resilience Sub-Project Development` connect `Sub-Project Development & Implementation` to `BResT Composition & PRVA Planning`, `Sub-Project Development & Implementation`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `2nd Barangay Assembly (BA2): PRVA Validation & Committee Formation` connect `BResT Composition & PRVA Planning` to `Sub-Project Development & Implementation`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._