import json, os, sys
from pathlib import Path
import networkx as nx

# Import graphify internals
from graphify import build, cluster, analyze, report, export

ROOT = Path("/Users/kjah/Documents/PCRP Monitor DeskApp Tool")
MANUALS_DIR = ROOT / "manuals"
OUT_DIR = MANUALS_DIR / "graphify-out"
VAULT_DIR = MANUALS_DIR / "obsidian"

OUT_DIR.mkdir(parents=True, exist_ok=True)
VAULT_DIR.mkdir(parents=True, exist_ok=True)

# Build Comprehensive Semantic Graph for SM1 and SM7
nodes = [
    # Document Level Nodes
    {
        "id": "Doc:SM1_Social_Mobilization",
        "label": "SM1: Social Mobilization Sub-Manual",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "document",
        "description": "DSWD Sub-Manual 1 detailing the Community Resilience Implementation Process (CRIP), stages 1 to 4, participatory risk assessments, BResT selection, and sub-project development."
    },
    {
        "id": "Doc:SM7_Monitoring_Evaluation",
        "label": "SM7: Monitoring & Evaluation Sub-Manual",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "document",
        "description": "DSWD Sub-Manual 7 detailing the M&E framework, Theory of Change, Results Matrix, Key Performance Indicators (KPIs), Community Monitoring Toolkit, and Data Quality Assessment protocols."
    },

    # Core Teams & Committees
    {
        "id": "Team:BResT",
        "label": "Barangay Resilience Team (BResT)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "committee",
        "description": "Community volunteers formed at the 1st Barangay Assembly (BA1) representing all puroks/sitios, major economic sectors, and at least 30% marginalized groups. MANDATE: Conduct PRVA walk-through mapping, mobilize FGDs, and attend BPRVA workshops. GOVERNANCE RULE: NO CHAIRPERSON IS REQUIRED OR APPOINTED (SM1, Part 3, pp. 16-18; SM7, p. 15)."
    },
    {
        "id": "Rule:BResT_No_Chairperson",
        "label": "BResT Composition Rule: No Chairperson Needed",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "policy_rule",
        "description": "Explicit structural policy under PCRP SM1 & SM7: The BResT is a collective broad-based assembly of community volunteers representing geographic zones and sectors. Unlike executive committees (CSPMC, CMSC, SFMSC), BResT does NOT require or designate a chairperson. Validation systems must not penalize teams lacking a chairperson."
    },
    {
        "id": "Rule:BResT_Marginalized_Quota",
        "label": "BResT 30% Marginalized Quota Rule",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "policy_rule",
        "description": "SM1 Part 3, paragraph 22: At least 30% of BResT Community Volunteers must represent marginalized sectors (women, IP, PWD, elderly, youth), with full geographic representation of all puroks/sitios and economic sectors (farmers/fishers)."
    },
    {
        "id": "Team:MResT",
        "label": "Municipal Resilience Team (MResT)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "committee",
        "description": "Inter-departmental municipal committee created via Executive Order, chaired by the Municipal Mayor or MPDO/MDRRMO, comprising MPDO, MEEDO, MENRO, MSWDO, MAO, MEO, and CSO representatives."
    },
    {
        "id": "Team:CRSPMC",
        "label": "Community Resilience Sub-Project Management Committee (CRSPMC / CSPMC)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "committee",
        "description": "Elected at 2nd Barangay Assembly (BA2) to lead community sub-project implementation. Has designated Chairperson, Vice-Chair, Secretary, and Treasurer."
    },
    {
        "id": "Team:CMSC",
        "label": "Community Monitoring Sub-Committee (CMSC)",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "committee",
        "description": "Formed at 2nd Barangay Assembly (BA2). Composed of at least three (3) Community Volunteers selected specifically from among BResT ranks. Has its own elected Chairperson to oversee sub-project monitoring, ESMP safeguards, and BAR reporting (SM7, p. 15 & pp. 108-109)."
    },
    {
        "id": "Team:SFMSC",
        "label": "Stakeholder & Feedback Mechanism Sub-Committee (SFMSC)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "committee",
        "description": "Grievance and accountability committee selected during 1st Barangay Assembly (BA1) to manage the Grievance Redress Mechanism (GRM), logs community queries, and ensure transparency. Has an elected Chairperson."
    },
    {
        "id": "Team:PIT",
        "label": "Project Implementation Team (PIT)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "committee",
        "description": "CRSPMC technical sub-committee responsible for physical construction, day-to-day site supervision, and work scheduling."
    },
    {
        "id": "Team:Procurement_Team",
        "label": "Community Procurement Team (PT)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "committee",
        "description": "Sub-committee managing community shopping, canvassing, bidding, and supplier contracting following World Bank and DSWD procurement guidelines."
    },
    {
        "id": "Team:AIT",
        "label": "Audit & Inventory Team (AIT)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "committee",
        "description": "Independent committee checking materials received, inventory storage, and auditing financial vouchers before liquidation."
    },
    {
        "id": "Team:OMT",
        "label": "Operations & Maintenance Team (O&MT)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "committee",
        "description": "Community committee trained during Stage 3 to manage, operate, and maintain completed sub-project infrastructure and livelihood assets."
    },
    {
        "id": "Team:ACT",
        "label": "Area Coordinating Team (ACT)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "institutional",
        "description": "DSWD field deployment team: Area Coordinator (AC), Community Facilitators (CF), Technical Facilitator Engineers (TFA), and Monitoring & Evaluation Assistants (MEA)."
    },
    {
        "id": "Team:MCT",
        "label": "Municipal Coordinating Team (MCT)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "institutional",
        "description": "LGU counterpart staff designated to partner with ACT, facilitate PRVA, and co-monitor community resilience operations."
    },

    # CRIP Stages
    {
        "id": "Stage:CRIP_Overview",
        "label": "Community Resilience Implementation Process (CRIP)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "process",
        "description": "The four-stage community-driven development operational cycle of PCRP: 1. Assessment & Planning, 2. Sub-Project Development, 3. Implementation, 4. Monitoring & Review."
    },
    {
        "id": "Stage:Stage1_Assessment_Planning",
        "label": "CRIP Stage 1: Participatory Assessment & Resilience Planning",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "stage",
        "description": "Stage 1 activities: MResT meeting, 1st Barangay Assembly (BA1), PRVA profiling/walk-through/mapping, FGDs, BPRVA workshop, MRP workshop, and BDC plan endorsement."
    },
    {
        "id": "Stage:Stage2_SubProject_Development",
        "label": "CRIP Stage 2: Community Resilience Sub-Project Development",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "stage",
        "description": "Stage 2 activities: 2nd Barangay Assembly (BA2), CRSPMC & CMSC formation, Sub-Project Development Workshop (SPDW), 3rd Barangay Assembly (BA3), Technical Desk Review (TDR), and fund allocation."
    },
    {
        "id": "Stage:Stage3_Implementation",
        "label": "CRIP Stage 3: Community-Managed Sub-Project Implementation",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "stage",
        "description": "Stage 3 activities: Sub-project execution, community procurement, community labor engagement, ESMP safeguards enforcement, and progress liquidation."
    },
    {
        "id": "Stage:Stage4_Monitoring_Review",
        "label": "CRIP Stage 4: Community-Based Monitoring & Review",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "stage",
        "description": "Stage 4 activities: Community Monitoring Sub-Committee (CMSC) inspections, Barangay Accountability Reporting (BAR / BA4), physical completion inspection, and O&M turnover."
    },

    # Assemblies
    {
        "id": "Assembly:BA1",
        "label": "1st Barangay Assembly (BA1): Project Orientation & Team Selection",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "assembly",
        "description": "Community orientation on PCRP, presentation of preliminary hazard data, selection of BResT volunteers (no chairperson) and SFMSC members, and scheduling of PRVA walk-throughs and FGDs."
    },
    {
        "id": "Assembly:BA2",
        "label": "2nd Barangay Assembly (BA2): PRVA Validation & Committee Formation",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "assembly",
        "description": "Presentation of BPRVA and MRP results, selection of CRSPMC officers (Chair, Vice-Chair, Sec, Treas) and election of 3 CMSC monitors from among BResT ranks."
    },
    {
        "id": "Assembly:BA3",
        "label": "3rd Barangay Assembly (BA3): Sub-Project Proposal Approval",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "assembly",
        "description": "Review and community voting/approval of the final sub-project technical design, budget, procurement plan, and LGU local counterpart contribution."
    },
    {
        "id": "Assembly:BA4_BAR",
        "label": "4th Barangay Assembly / Barangay Accountability Reporting (BAR)",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "assembly",
        "description": "Public accountability meeting presenting physical completion, financial liquidation, CMSC monitoring findings, audit report, and asset turnover to O&MT."
    },

    # Key Processes & Workflows
    {
        "id": "Process:PRVA",
        "label": "Participatory Risk & Vulnerability Assessment (PRVA)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "process",
        "description": "Multi-step community diagnosis: risk mapping, walk-through observations, demographic profiling, economic/marginalized FGDs, and vulnerability matrix generation."
    },
    {
        "id": "Process:Walkthrough_Mapping",
        "label": "Risk & Vulnerability Walk-Through and Spot Mapping",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "process",
        "description": "Hands-on transect walk across all sitios/puroks conducted by BResT volunteers and Community Facilitators to identify hazard-prone areas and lifeline infrastructure."
    },
    {
        "id": "Process:FGD_Series",
        "label": "Focused Group Discussions (FGDs) with Sectors",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "process",
        "description": "Targeted consultations facilitated by CFs with economic groups (farmers, fishers), indigenous peoples (IPs), and women to assess differential risk burdens."
    },
    {
        "id": "Process:BPRVA_Workshop",
        "label": "Barangay PRVA Workshop",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "process",
        "description": "Participatory analysis workshop where BResT synthesizes mapping and FGD data to prioritize climate-resilience sub-project concepts."
    },
    {
        "id": "Process:MRP_Workshop",
        "label": "Municipal Resilience Planning (MRP) Workshop",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "process",
        "description": "Municipal workshop led by MResT integrating barangay concept notes into the municipal resilience investment pipeline and aligning with CDRA/CLUP."
    },
    {
        "id": "Process:BDC_Endorsement",
        "label": "Barangay Development Council (BDC) Endorsement",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "process",
        "description": "BLGU session adopting the BPRVA resilience plan and incorporating PCRP priorities into the Annual Investment Plan (AIP) and Barangay Development Plan (BDP)."
    },
    {
        "id": "Process:SPDW",
        "label": "Sub-Project Development Workshop (SPDW)",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "process",
        "description": "Technical planning sessions with CRSPMC, TFA engineers, and municipal engineers to finalize Program of Works (POW), DED, and procurement packaging."
    },
    {
        "id": "Process:TDR_Appraisal",
        "label": "Technical Desk Review (TDR) & RPMO Appraisal",
        "source_file": "manuals/SM1_ Social Mobilization.pdf",
        "node_type": "process",
        "description": "Multi-disciplinary review by Regional Project Management Office (RPMO) evaluating engineering soundness, cost-efficiency, and ESMP safeguards compliance."
    },

    # M&E Framework, Toolkits, & Standards
    {
        "id": "ME:Results_Framework",
        "label": "PCRP M&E Results Framework & Theory of Change",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "framework",
        "description": "SM7 logical framework linking inputs and activities (social mobilization, CapBuild, civil works) to intermediate outputs and ultimate resilience outcomes."
    },
    {
        "id": "ME:Community_Monitoring_Toolkit",
        "label": "Community Monitoring Toolkit (Annex L)",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "toolkit",
        "description": "Participatory toolkit providing CMSC with Community Monitoring Plan templates, Work Plan guides, Data Gathering checklists, and BAR reporting guidelines."
    },
    {
        "id": "ME:DQA_Protocols",
        "label": "Data Quality Assessment (DQA) & Verification Protocols",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "protocol",
        "description": "Systematic protocols cross-referencing physical hardcopy evidence (attendance sheets, minutes, resolutions, photos, executive orders) against digital records in KCIS."
    },
    {
        "id": "System:KCIS",
        "label": "KALAHI-CIDSS Comprehensive Information System (KCIS)",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "software_system",
        "description": "Central digital repository tracking participant attendance, volunteer registries, sub-project milestones, and liquidation reports across municipalities."
    },
    {
        "id": "Standard:K2_Quorum",
        "label": "Household Quorum Standard (K2 Standard)",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "standard",
        "description": "Mandatory attendance benchmark requiring presence of household representatives at assemblies: minimum 50% (regular) or 80% (high-density/special criteria) of rostered households."
    },
    {
        "id": "Standard:ESMP",
        "label": "Environmental and Social Management Plan (ESMP)",
        "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf",
        "node_type": "standard",
        "description": "World Bank Environmental and Social Framework compliance instrument ensuring ecological protection, disaster risk mitigation, and indigenous rights."
    }
]

edges = [
    # Manual to Stages & Documents
    {"source": "Doc:SM1_Social_Mobilization", "target": "Stage:CRIP_Overview", "relation": "defines", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Doc:SM1_Social_Mobilization", "target": "Stage:Stage1_Assessment_Planning", "relation": "specifies_procedures", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Doc:SM1_Social_Mobilization", "target": "Stage:Stage2_SubProject_Development", "relation": "specifies_procedures", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Doc:SM1_Social_Mobilization", "target": "Stage:Stage3_Implementation", "relation": "specifies_procedures", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Doc:SM7_Monitoring_Evaluation", "target": "Stage:Stage4_Monitoring_Review", "relation": "specifies_procedures", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "Doc:SM7_Monitoring_Evaluation", "target": "ME:Results_Framework", "relation": "establishes", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "Doc:SM7_Monitoring_Evaluation", "target": "ME:Community_Monitoring_Toolkit", "relation": "provides", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "Doc:SM7_Monitoring_Evaluation", "target": "ME:DQA_Protocols", "relation": "mandates", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},

    # Stage Sequence
    {"source": "Stage:Stage1_Assessment_Planning", "target": "Stage:Stage2_SubProject_Development", "relation": "precedes", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Stage:Stage2_SubProject_Development", "target": "Stage:Stage3_Implementation", "relation": "precedes", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Stage:Stage3_Implementation", "target": "Stage:Stage4_Monitoring_Review", "relation": "precedes", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},

    # Stage 1 Assembly and Processes
    {"source": "Stage:Stage1_Assessment_Planning", "target": "Assembly:BA1", "relation": "includes", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Assembly:BA1", "target": "Team:BResT", "relation": "selects_volunteers_for", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Assembly:BA1", "target": "Team:SFMSC", "relation": "organizes", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Assembly:BA1", "target": "Standard:K2_Quorum", "relation": "governed_by", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},

    # BResT Composition, Rules & Roles
    {"source": "Team:BResT", "target": "Rule:BResT_No_Chairperson", "relation": "governed_by", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:BResT", "target": "Rule:BResT_Marginalized_Quota", "relation": "must_comply_with", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:BResT", "target": "Process:PRVA", "relation": "executes", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:BResT", "target": "Process:Walkthrough_Mapping", "relation": "conducts", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:BResT", "target": "Process:FGD_Series", "relation": "mobilizes", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:BResT", "target": "Process:BPRVA_Workshop", "relation": "participates_in", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:BResT", "target": "Team:CMSC", "relation": "provides_candidates_for", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},

    # MResT Roles
    {"source": "Team:MResT", "target": "Process:MRP_Workshop", "relation": "leads", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:MResT", "target": "Process:BDC_Endorsement", "relation": "coordinates_with", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:MResT", "target": "Team:ACT", "relation": "partners_with", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:MResT", "target": "Team:MCT", "relation": "oversees", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},

    # Stage 2 Sub-Project Development
    {"source": "Stage:Stage2_SubProject_Development", "target": "Assembly:BA2", "relation": "includes", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Assembly:BA2", "target": "Team:CRSPMC", "relation": "elects_officers_of", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Assembly:BA2", "target": "Team:CMSC", "relation": "elects_members_of", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "Team:CRSPMC", "target": "Team:PIT", "relation": "supervises", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:CRSPMC", "target": "Team:Procurement_Team", "relation": "supervises", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:CRSPMC", "target": "Team:AIT", "relation": "coordinates_with", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:CRSPMC", "target": "Team:OMT", "relation": "prepares", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:CRSPMC", "target": "Process:SPDW", "relation": "attends", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Stage:Stage2_SubProject_Development", "target": "Assembly:BA3", "relation": "culminates_in", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Assembly:BA3", "target": "Process:TDR_Appraisal", "relation": "submits_proposal_for", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},

    # Stage 3 Implementation & Safeguards
    {"source": "Stage:Stage3_Implementation", "target": "Standard:ESMP", "relation": "enforces", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "Team:PIT", "target": "Stage:Stage3_Implementation", "relation": "manages_civil_works_in", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},
    {"source": "Team:Procurement_Team", "target": "Stage:Stage3_Implementation", "relation": "procures_materials_in", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},

    # Stage 4 Monitoring & Accountability
    {"source": "Team:CMSC", "target": "ME:Community_Monitoring_Toolkit", "relation": "utilizes", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "Team:CMSC", "target": "Stage:Stage4_Monitoring_Review", "relation": "conducts_monitoring_in", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "Team:CMSC", "target": "Assembly:BA4_BAR", "relation": "presents_findings_at", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "Assembly:BA4_BAR", "target": "Team:OMT", "relation": "hands_over_completed_asset_to", "confidence": "EXTRACTED", "source_file": "manuals/SM1_ Social Mobilization.pdf"},

    # Data Quality & KCIS Integration
    {"source": "Team:ACT", "target": "System:KCIS", "relation": "encodes_data_into", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "ME:DQA_Protocols", "target": "System:KCIS", "relation": "verifies_records_in", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "ME:DQA_Protocols", "target": "Assembly:BA1", "relation": "verifies_attendance_sheets_of", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "ME:DQA_Protocols", "target": "Team:BResT", "relation": "cross_checks_profiles_of", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"},
    {"source": "ME:DQA_Protocols", "target": "Team:MResT", "relation": "cross_checks_executive_order_of", "confidence": "EXTRACTED", "source_file": "manuals/SM7_ Monitoring and Evaluation.pdf"}
]

extraction = {
    "nodes": nodes,
    "edges": edges,
    "hyperedges": [],
    "input_tokens": 37400,
    "output_tokens": 12800
}

# Write extraction JSON
(OUT_DIR / ".graphify_extract.json").write_text(json.dumps(extraction, indent=2, ensure_ascii=False), encoding="utf-8")

# Build NetworkX Graph
G = build.build_from_json(extraction, root=str(MANUALS_DIR), directed=True)
print(f"Built graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

# Run Louvain / Leiden Clustering
communities = cluster.cluster(G)
cohesion = cluster.score_all(G, communities)
print(f"Clustered into {len(communities)} communities:")

# Meaningful community labels based on members
community_labels = {}
for cid, members in communities.items():
    member_labels = [G.nodes[n].get("label", n) for n in members]
    m_str = " ".join(member_labels)
    if "BResT" in m_str or "PRVA" in m_str:
        community_labels[cid] = "BResT Composition & PRVA Planning"
    elif "CRSPMC" in m_str or "PIT" in m_str or "Sub-Project" in m_str:
        community_labels[cid] = "Sub-Project Development & Implementation"
    elif "Monitoring" in m_str or "DQA" in m_str or "Results" in m_str or "KCIS" in m_str:
        community_labels[cid] = "Monitoring, Evaluation & Data Quality"
    elif "MResT" in m_str or "Municipal" in m_str:
        community_labels[cid] = "Municipal Resilience & Multi-Sector Coordination"
    else:
        community_labels[cid] = f"Community Cluster {cid}"
    print(f"  Community {cid} ('{community_labels[cid]}', {len(members)} nodes): {', '.join(member_labels[:4])}...")

# Analyze Graph
analysis_gods = analyze.god_nodes(G, top_n=5)
analysis_surprises = analyze.surprising_connections(G, top_n=5)
questions = analyze.suggest_questions(G, communities, community_labels)

# Build Detection Mock for Report
detection = {
    "total_files": 2,
    "total_words": 37403,
    "files": {
        "paper": ["manuals/SM1_ Social Mobilization.pdf", "manuals/SM7_ Monitoring and Evaluation.pdf"]
    }
}
tokens = {"input": extraction["input_tokens"], "output": extraction["output_tokens"]}

# Generate GRAPH_REPORT.md
rep = report.generate(
    G, communities, cohesion, community_labels,
    analysis_gods, analysis_surprises, detection, tokens,
    str(MANUALS_DIR), suggested_questions=questions
)
(OUT_DIR / "GRAPH_REPORT.md").write_text(rep, encoding="utf-8")
print("Generated manuals/graphify-out/GRAPH_REPORT.md")

# Export to JSON
export.to_json(G, communities, str(OUT_DIR / "graph.json"), community_labels=community_labels)
print("Generated manuals/graphify-out/graph.json")

# Export to HTML
export.to_html(G, communities, str(OUT_DIR / "graph.html"), community_labels=community_labels)
print("Generated manuals/graphify-out/graph.html")

# Export to Obsidian Vault
num_notes = export.to_obsidian(G, communities, str(VAULT_DIR), community_labels=community_labels, cohesion=cohesion)
print(f"Exported {num_notes} Obsidian markdown notes to manuals/obsidian/")

# Export to Obsidian Canvas
export.to_canvas(G, communities, str(VAULT_DIR / "PCRP-Manuals.canvas"), community_labels=community_labels)
print("Generated manuals/obsidian/PCRP-Manuals.canvas")

