#!/usr/bin/env python3
"""
PCRP Encoding and Data Quality Assessment Tool
Native EffectCraft MCP Motion Graphics Generator & Renderer.

Drives EffectCraft via stdio JSON-RPC MCP server (`effectcraft-cli mcp`).
Generates:
1. Complete After Effects-class project (`PCRP_Encoding_DQA_Film.ecproj`)
2. 12 Act Compositions + Master 180s Timeline Comp + 30s Social Cut Comp
3. Synchronized audio track (`soundtrack-180s.wav`)
4. 12 High-Resolution Keyframes (`marketing/keyframes/`)
5. Master 3-Minute Video (`marketing/PCRP-Encoding-DQA-Tool-Film-3min.mp4`)
6. 30-Second Social Cut (`marketing/PCRP-Encoding-DQA-Tool-Social-30s.mp4`)
"""

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
MARKETING_DIR = ROOT / "marketing"
MOTION_DIR = MARKETING_DIR / "motion"
KEYFRAMES_DIR = MARKETING_DIR / "keyframes"
AUDIO_WAV = MOTION_DIR / "soundtrack-180s.wav"
PROJECT_FILE = MOTION_DIR / "PCRP_Encoding_DQA_Film.ecproj"
MASTER_MP4 = MARKETING_DIR / "PCRP-Encoding-DQA-Tool-Film-3min.mp4"
SOCIAL_MP4 = MARKETING_DIR / "PCRP-Encoding-DQA-Tool-Social-30s.mp4"
CLI_PATH = "/Users/kjah/.local/bin/effectcraft-cli"

KEYFRAME_TIMINGS = [
    ("scene_01_prologue_8s.png", 8.0),
    ("scene_02_lock_24s.png", 24.5),
    ("scene_03_import_41s.png", 41.8),
    ("scene_04_overview_53s.png", 53.0),
    ("scene_05_dim1_accuracy_72s.png", 72.0),
    ("scene_06_dim2_reliability_86s.png", 86.0),
    ("scene_07_dim3_completeness_100s.png", 100.0),
    ("scene_08_dim4_precision_121s.png", 121.5),
    ("scene_09_dim5_timeliness_136s.png", 136.0),
    ("scene_10_dim6_integrity_153s.png", 153.5),
    ("scene_11_scorecard_166s.png", 166.5),
    ("scene_12_finale_176s.png", 176.0),
]


class EffectCraftMCPClient:
    def __init__(self, cli_path=CLI_PATH):
        self.proc = subprocess.Popen(
            [cli_path, "mcp", "--autosave"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        self.req_id = 0
        self._init_server()

    def _call(self, method, params=None):
        self.req_id += 1
        req = {
            "jsonrpc": "2.0",
            "id": self.req_id,
            "method": method,
            "params": params or {}
        }
        self.proc.stdin.write(json.dumps(req) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            err = self.proc.stderr.read()
            raise RuntimeError(f"EffectCraft MCP exited unexpectedly: {err}")
        res = json.loads(line)
        if "error" in res:
            raise RuntimeError(f"MCP error in {method}: {res['error']}")
        return res.get("result", {})

    def _init_server(self):
        res = self._call("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "pcrp-motion-builder", "version": "2.0"}
        })
        print(f"[MCP] Initialized: {res.get('serverInfo', {}).get('title')} v{res.get('serverInfo', {}).get('version')}")

    def call_tool(self, tool_name, args):
        res = self._call("tools/call", {
            "name": tool_name,
            "arguments": args
        })
        return res

    def run_script(self, jsx_code, name="motion_builder"):
        res = self.call_tool("run_script", {"code": jsx_code, "name": name})
        content = res.get("content", [])
        if content:
            txt = content[0].get("text", "{}")
            parsed = json.loads(txt)
            if parsed.get("error"):
                raise RuntimeError(f"JSX script error in {name}: {parsed['error']}")
            return parsed.get("result")
        return None

    def render_frame(self, comp_name, comp_time, out_path, max_side=0):
        res = self.call_tool("render_frame", {
            "comp": comp_name,
            "time": comp_time,
            "path": str(out_path),
            "inline": False,
            "max_side": max_side
        })
        return res

    def save_project(self, project_path):
        res = self.call_tool("save_project", {"path": str(project_path)})
        return res

    def close(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=3)
        except Exception:
            pass


def generate_motion_project_jsx(audio_path_str: str) -> str:
    """Generate ExtendScript JSX that builds all 12 acts, master comp, social comp, and audio."""
    # Escaped path
    clean_audio_path = audio_path_str.replace("\\", "/")

    return f"""
(function() {{
    app.beginUndoGroup("Build PCRP Motion Graphics");

    // Clear existing project
    while (app.project.items.length > 0) {{
        app.project.items[1].remove();
    }}

    // Global Swiss Colors
    var C_BG = [0.025, 0.045, 0.095];         // Deep Obsidian Sapphire Canvas
    var C_CARD = [0.065, 0.115, 0.225];       // Frosted Card Solid
    var C_CARD_BORDER = [0.18, 0.32, 0.58];   // Hairline Precision Border
    var C_CARD_HDR = [0.10, 0.17, 0.34];      // Card Header Solid
    var C_BLUE_BADGE = [0.15, 0.38, 0.92];    // Primary Swiss Royal Blue
    var C_GREEN_FIX = [0.05, 0.32, 0.16];     // Emerald Verified / Corrected
    var C_GREEN_TXT = [0.30, 0.95, 0.55];     // Emerald Text
    var C_AMBER_WARN = [0.36, 0.20, 0.04];    // Amber Warning / Anomaly
    var C_AMBER_TXT = [1.00, 0.78, 0.22];     // Amber Text
    var C_RED_ALERT = [0.38, 0.08, 0.08];     // Crimson Alert
    var C_RED_TXT = [1.00, 0.42, 0.42];       // Crimson Text
    var C_WHITE = [1.0, 1.0, 1.0];
    var C_OFFWHITE = [0.88, 0.92, 0.98];
    var C_MUTED = [0.60, 0.72, 0.86];

    // Helper: Add text layer with formatting
    function addText(c, str, size, font, color, pos, just, timeIn, timeOut) {{
        var l = c.layers.addText(str);
        var p = l.property("Source Text");
        var d = p.value;
        d.fontSize = size;
        d.font = font;
        d.fillColor = color;
        if (just) d.justification = just;
        p.setValue(d);
        l.property("Transform").property("Position").setValue(pos);
        if (timeIn !== undefined) l.inPoint = timeIn;
        if (timeOut !== undefined) l.outPoint = timeOut;
        return l;
    }}

    // Helper: Add solid card with crisp 1px precision border
    function addCard(c, x, y, w, h, borderCol, fillCol, op, timeIn, timeOut) {{
        var borderLayer = c.layers.addSolid(borderCol, "CardBorder", w, h, 1.0);
        borderLayer.property("Transform").property("Position").setValue([x, y]);
        var fillLayer = c.layers.addSolid(fillCol, "CardFill", w - 2, h - 2, 1.0);
        fillLayer.property("Transform").property("Position").setValue([x, y]);
        if (op !== undefined) fillLayer.property("Transform").property("Opacity").setValue(op);
        if (timeIn !== undefined) {{
            borderLayer.inPoint = timeIn; fillLayer.inPoint = timeIn;
        }}
        if (timeOut !== undefined) {{
            borderLayer.outPoint = timeOut; fillLayer.outPoint = timeOut;
        }}
        return {{ border: borderLayer, fill: fillLayer }};
    }}

    // Helper: Add standard institutional background and coordinate grid lines
    function setupActCanvas(comp, actTag, mainTitle, subtitleText, cinemaSubText) {{
        // Background solid
        comp.layers.addSolid(C_BG, "CanvasBackground", 1920, 1080, 1.0);

        // Coordinate grid lines (subtle Swiss technical lines)
        for (var i = 1; i <= 3; i++) {{
            var gridLine = comp.layers.addSolid([0.16, 0.28, 0.50], "GridH_" + i, 1920, 1, 1.0);
            gridLine.property("Transform").property("Position").setValue([960, i * 270]);
            gridLine.property("Transform").property("Opacity").setValue(12);
        }}
        var gridV1 = comp.layers.addSolid([0.16, 0.28, 0.50], "GridV_1", 1, 1080, 1.0);
        gridV1.property("Transform").property("Position").setValue([480, 540]);
        gridV1.property("Transform").property("Opacity").setValue(10);
        var gridV2 = comp.layers.addSolid([0.16, 0.28, 0.50], "GridV_2", 1, 1080, 1.0);
        gridV2.property("Transform").property("Position").setValue([1440, 540]);
        gridV2.property("Transform").property("Opacity").setValue(10);

        // Top Institutional Brand Header
        addText(comp, "DSWD · KALAHI-CIDSS PCRP | DATA QUALITY AUDIT SYSTEM · 🔒 100% OFFLINE", 15, "Helvetica-Bold", [0.42, 0.65, 0.90], [960, 48], ParagraphJustification.CENTER_JUSTIFY);

        // Act Tag Badge
        var tagWidth = actTag.length * 9.5 + 40;
        var tagBadge = comp.layers.addSolid(C_BLUE_BADGE, "ActTagBadge", tagWidth, 30, 1.0);
        tagBadge.property("Transform").property("Position").setValue([960, 90]);
        addText(comp, actTag, 14, "Helvetica-Bold", C_WHITE, [960, 96], ParagraphJustification.CENTER_JUSTIFY);

        // Main Title
        addText(comp, mainTitle, 38, "Helvetica-Bold", C_WHITE, [960, 150], ParagraphJustification.CENTER_JUSTIFY);

        // Subtitle
        addText(comp, subtitleText, 17, "Helvetica", C_MUTED, [960, 188], ParagraphJustification.CENTER_JUSTIFY);

        // Lower Floating Cinema Subtitles
        var subBg = comp.layers.addSolid([0.015, 0.030, 0.065], "CinemaSubBg", 1460, 52, 1.0);
        subBg.property("Transform").property("Position").setValue([960, 995]);
        subBg.property("Transform").property("Opacity").setValue(85);
        addText(comp, cinemaSubText, 21, "Helvetica", C_WHITE, [960, 1002], ParagraphJustification.CENTER_JUSTIFY);
    }}

    // ==========================================
    // ACT 01: Community Field Realities (14s)
    // ==========================================
    var act01 = app.project.items.addComp("Act01_Prologue", 1920, 1080, 1.0, 14, 30);
    setupActCanvas(act01,
        "PAMANTAYAN NG KALAHI-CIDSS PCRP // FIELD DATA AUDIT",
        "747 Barangay, 34,390 Nilagdaang Attendance Sheets",
        "Mula sa mga physical paper sheets patungo sa KCIS database nang may buong katapatan",
        "Sa 747 barangay, bawat asembleya ay nagsisimula sa nilagdaang attendance sheets sa komunidad."
    );
    // Left Card: Physical Attendance Sheets
    addCard(act01, 560, 530, 720, 520, C_CARD_BORDER, C_CARD, 95);
    var h1 = act01.layers.addSolid(C_CARD_HDR, "H1", 718, 52, 1.0);
    h1.property("Transform").property("Position").setValue([560, 296]);
    addText(act01, "MGA TALAAN MULA SA KOMUNIDAD (PHYSICAL SHEETS)", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act01, "747 BARANGAYS", 44, "Helvetica-Bold", C_WHITE, [560, 380], ParagraphJustification.CENTER_JUSTIFY);
    addText(act01, "34,390 Nilagdaang Pirma at Thumbmarks ng mga Residente", 16, "Helvetica-Bold", C_OFFWHITE, [560, 420], ParagraphJustification.CENTER_JUSTIFY);
    addText(act01, "• Orihinal na attendance sheets mula sa 1st, 2nd, at 3rd Barangay Assemblies", 14, "Helvetica", C_MUTED, [560, 480], ParagraphJustification.CENTER_JUSTIFY);
    addText(act01, "• Katibayan ng tunay na partisipasyon ng bawat pamayanan", 14, "Helvetica", C_MUTED, [560, 515], ParagraphJustification.CENTER_JUSTIFY);
    addText(act01, "• Basehan ng 80% K2 Quorum threshold at pamunuan ng komite", 14, "Helvetica", C_MUTED, [560, 550], ParagraphJustification.CENTER_JUSTIFY);
    var b1 = act01.layers.addSolid(C_BLUE_BADGE, "B1", 380, 40, 1.0);
    b1.property("Transform").property("Position").setValue([560, 640]);
    addText(act01, "STATUS: OPISYAL NA DOKUMENTO SA FIELD", 14, "Helvetica-Bold", C_WHITE, [560, 646], ParagraphJustification.CENTER_JUSTIFY);

    // Right Card: KCIS Digital System
    addCard(act01, 1360, 530, 720, 520, C_CARD_BORDER, C_CARD, 95);
    var h2 = act01.layers.addSolid(C_CARD_HDR, "H2", 718, 52, 1.0);
    h2.property("Transform").property("Position").setValue([1360, 296]);
    addText(act01, "KCIS DIGITAL SYSTEM (PAG-ENCODE AT AUDIT)", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [1360, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act01, "PAGSALA SA MGA ANOMALYA", 32, "Helvetica-Bold", C_AMBER_TXT, [1360, 380], ParagraphJustification.CENTER_JUSTIFY);
    // Anomaly 1
    var an1 = act01.layers.addSolid(C_AMBER_WARN, "An1", 640, 54, 1.0);
    an1.property("Transform").property("Position").setValue([1360, 440]);
    addText(act01, "⚠ ADVANCE DATES: Asembleyang na-encode sa hinaharap (+40 araw)", 14, "Helvetica-Bold", C_AMBER_TXT, [1360, 445], ParagraphJustification.CENTER_JUSTIFY);
    // Anomaly 2
    var an2 = act01.layers.addSolid(C_AMBER_WARN, "An2", 640, 54, 1.0);
    an2.property("Transform").property("Position").setValue([1360, 510]);
    addText(act01, "⚠ DEMOGRAPHIC TYPOS: Residente na 134 taong gulang (1892 vs 1982)", 14, "Helvetica-Bold", C_AMBER_TXT, [1360, 515], ParagraphJustification.CENTER_JUSTIFY);
    // Anomaly 3
    var an3 = act01.layers.addSolid(C_AMBER_WARN, "An3", 640, 54, 1.0);
    an3.property("Transform").property("Position").setValue([1360, 580]);
    addText(act01, "⚠ DOUBLE COUNTING: Dobleng puno ng pamilya sa 2 magkaibang barangay", 14, "Helvetica-Bold", C_AMBER_TXT, [1360, 585], ParagraphJustification.CENTER_JUSTIFY);
    var b2 = act01.layers.addSolid(C_GREEN_FIX, "B2", 440, 40, 1.0);
    b2.property("Transform").property("Position").setValue([1360, 660]);
    addText(act01, "✓ LAHAT NAHUHULI AT ITINUTUWID NG SISTEMA", 14, "Helvetica-Bold", C_GREEN_TXT, [1360, 666], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 02: Safe & Offline (14s)
    // ==========================================
    var act02 = app.project.items.addComp("Act02_SafeOffline", 1920, 1080, 1.0, 14, 30);
    setupActCanvas(act02,
        "SEGURIDAD AT PRIVACY // ZERO CLOUD REQUIREMENT",
        "100% Offline · Ligtas ang Datos ng Komunidad",
        "Gumagana sa anumang laptop sa pamamagitan ng browser nang walang internet o server",
        "Ligtas at hindi kailangan ng internet. Walang datos na lumalabas sa iyong kompyuter."
    );
    // Left Card: 100% Offline Single File Core
    addCard(act02, 560, 530, 720, 520, C_CARD_BORDER, C_CARD, 95);
    var h21 = act02.layers.addSolid(C_CARD_HDR, "H21", 718, 52, 1.0);
    h21.property("Transform").property("Position").setValue([560, 296]);
    addText(act02, "LOKAL AT AIR-GAPPED NA ARCHITECTURE", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act02, "🔒 100% OFFLINE", 44, "Helvetica-Bold", [0.3, 0.85, 1.0], [560, 380], ParagraphJustification.CENTER_JUSTIFY);
    addText(act02, "Walang Internet o Cloud Server na Kailangan", 18, "Helvetica-Bold", C_OFFWHITE, [560, 425], ParagraphJustification.CENTER_JUSTIFY);
    addText(act02, "• Ganap na sumusunod sa Data Privacy Act of 2012 (Republic Act 10173)", 14, "Helvetica", C_MUTED, [560, 485], ParagraphJustification.CENTER_JUSTIFY);
    addText(act02, "• Mananatili ang buong talaan ng komunidad sa loob ng iyong computer", 14, "Helvetica", C_MUTED, [560, 520], ParagraphJustification.CENTER_JUSTIFY);
    addText(act02, "• Isang standalone file lamang na maaring patakbuhin offline sa field", 14, "Helvetica", C_MUTED, [560, 555], ParagraphJustification.CENTER_JUSTIFY);
    var b21 = act02.layers.addSolid(C_GREEN_FIX, "B21", 420, 40, 1.0);
    b21.property("Transform").property("Position").setValue([560, 640]);
    addText(act02, "✓ ZERO EXTERNAL NETWORK REQUESTS", 14, "Helvetica-Bold", C_GREEN_TXT, [560, 646], ParagraphJustification.CENTER_JUSTIFY);

    // Right Card: Municipality Selector & Loading
    addCard(act02, 1360, 530, 720, 520, C_CARD_BORDER, C_CARD, 95);
    var h22 = act02.layers.addSolid(C_CARD_HDR, "H22", 718, 52, 1.0);
    h22.property("Transform").property("Position").setValue([1360, 296]);
    addText(act02, "PAGPILI NG MUNISIPYO AT BARANGAYS", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [1360, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act02, "SAN ISIDRO, LEYTE", 36, "Helvetica-Bold", C_WHITE, [1360, 375], ParagraphJustification.CENTER_JUSTIFY);
    addText(act02, "19 Opisyal na Barangay ng Munisipyo", 18, "Helvetica", [0.4, 0.75, 1.0], [1360, 415], ParagraphJustification.CENTER_JUSTIFY);
    // Mun list box
    var munBox = act02.layers.addSolid([0.04, 0.08, 0.16], "MunBox", 640, 120, 1.0);
    munBox.property("Transform").property("Position").setValue([1360, 500]);
    addText(act02, "Bawod · Busay · Cogon · Daja Daku · Daja Diot · Hacienda Maria · Kawayan", 13, "Helvetica", C_MUTED, [1360, 475], ParagraphJustification.CENTER_JUSTIFY);
    addText(act02, "Poblacion · San Beltran · San Pedro · San Roque · Santa Cruz · Santo Niño", 13, "Helvetica", C_MUTED, [1360, 505], ParagraphJustification.CENTER_JUSTIFY);
    addText(act02, "Tinago · Taglawigan · Crossing · Villa Consuelo · Libas · Maligaya", 13, "Helvetica", C_MUTED, [1360, 535], ParagraphJustification.CENTER_JUSTIFY);
    var b22 = act02.layers.addSolid(C_BLUE_BADGE, "B22", 440, 40, 1.0);
    b22.property("Transform").property("Position").setValue([1360, 640]);
    addText(act02, "LOKAL NA TALAAN: AGAD NA-LOAD SA 0.08s", 14, "Helvetica-Bold", C_WHITE, [1360, 646], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 03: KCIS Excel Files (16s)
    // ==========================================
    var act03 = app.project.items.addComp("Act03_KCISFiles", 1920, 1080, 1.0, 16, 30);
    setupActCanvas(act03,
        "KCIS DATA INGESTION // MULTI-STREAM HARMONIZATION",
        "Tatlong Excel Files Patungo sa Isang Malinis na Talaan",
        "Pagsasama-sama ng attendance, household masterlist, at volunteer list sa loob lamang ng 280ms",
        "Ipasok ang tatlong Excel files: Attendance, Household Masterlist, at Volunteer List."
    );
    // 3 Cards horizontally
    var streams = [
        {{ x: 440, title: "1. ATTENDANCE MASTERLIST", file: "KCIS_Attendance_2026.xlsx", count: "5,892 DUMALO", desc: "Pangalan, petsa ng asembleya, at lagda ng dumalong residente" }},
        {{ x: 960, title: "2. HOUSEHOLD MASTERLIST", file: "KCIS_Households_2026.xlsx", count: "1,420 SAMBAHAYAN", desc: "Opisyal na masterlist ng pamilya at denominator para sa quorum" }},
        {{ x: 1480, title: "3. VOLUNTEER ROSTER", file: "KCIS_Volunteers_2026.xlsx", count: "48 VOLUNTEERS", desc: "Talaan ng BResT at SFMSC komite, pamunuan, at GAD sex" }}
    ];
    for (var s = 0; s < streams.length; s++) {{
        var st = streams[s];
        addCard(act03, st.x, 500, 480, 460, C_CARD_BORDER, C_CARD, 95);
        var sh = act03.layers.addSolid(C_CARD_HDR, "SH_" + s, 478, 48, 1.0);
        sh.property("Transform").property("Position").setValue([st.x, 294]);
        addText(act03, st.title, 14, "Helvetica-Bold", [0.4, 0.75, 1.0], [st.x, 300], ParagraphJustification.CENTER_JUSTIFY);
        addText(act03, st.count, 28, "Helvetica-Bold", C_WHITE, [st.x, 370], ParagraphJustification.CENTER_JUSTIFY);
        var fbox = act03.layers.addSolid([0.04, 0.08, 0.16], "FBox_" + s, 420, 44, 1.0);
        fbox.property("Transform").property("Position").setValue([st.x, 425]);
        addText(act03, "📁 " + st.file, 13, "Helvetica-Bold", [0.4, 0.85, 0.6], [st.x, 430], ParagraphJustification.CENTER_JUSTIFY);
        addText(act03, st.desc, 14, "Helvetica", C_MUTED, [st.x, 510], ParagraphJustification.CENTER_JUSTIFY);
        var sBadge = act03.layers.addSolid(C_GREEN_FIX, "SB_" + s, 340, 36, 1.0);
        sBadge.property("Transform").property("Position").setValue([st.x, 650]);
        addText(act03, "✓ 100% NA-INGEST AT NA-HASH", 13, "Helvetica-Bold", C_GREEN_TXT, [st.x, 655], ParagraphJustification.CENTER_JUSTIFY);
    }}
    // Speed Banner below
    var speedBox = act03.layers.addSolid(C_BLUE_BADGE, "SpeedBox", 800, 44, 1.0);
    speedBox.property("Transform").property("Position").setValue([960, 770]);
    addText(act03, "⚡ 34,390 TALAAN NASURI SA LOOB NG 280ms NANG WALANG INTERNET", 15, "Helvetica-Bold", C_WHITE, [960, 776], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 04: Community Profile (Juan Dela Cruz) (14s)
    // ==========================================
    var act04 = app.project.items.addComp("Act04_CitizenProfile", 1920, 1080, 1.0, 14, 30);
    setupActCanvas(act04,
        "ENTITY RESOLUTION // ONE CITIZEN, ONE RECORD",
        "Iisang Tao sa Lahat ng Talaan: Juan Dela Cruz",
        "Pag-uugnay sa partisipasyon, pamumuno sa tahanan, at boluntaryong paglilingkod sa komunidad",
        "Iisa ang talaan ni Juan Dela Cruz: pumirma sa asembleya, puno ng pamilya, at volunteer."
    );
    // Hero Center Profile Card
    addCard(act04, 560, 530, 720, 520, C_CARD_BORDER, C_CARD, 95);
    var h41 = act04.layers.addSolid(C_CARD_HDR, "H41", 718, 52, 1.0);
    h41.property("Transform").property("Position").setValue([560, 296]);
    addText(act04, "PANGUNAHING TALAAN NG MAMAMAYAN", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act04, "JUAN DELA CRUZ", 42, "Helvetica-Bold", C_WHITE, [560, 375], ParagraphJustification.CENTER_JUSTIFY);
    addText(act04, "Brgy. San Roque · Kasarian: Lalaki · Edad: 44", 17, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 420], ParagraphJustification.CENTER_JUSTIFY);

    // 3 Linked Status Boxes inside left card
    var roles = [
        {{ title: "1. DUMALO SA ASEMBLYA", sub: "Pumirma sa Attendance Sheet noong 1st BA (Sep 24, 2026)", col: C_GREEN_FIX, tcol: C_GREEN_TXT }},
        {{ title: "2. PUNO NG PAMILYA", sub: "Opisyal na nakatala sa Household Masterlist (Quorum Denominator)", col: C_GREEN_FIX, tcol: C_GREEN_TXT }},
        {{ title: "3. VOLUNTEER NG BREST", sub: "Aktibong miyembro sa Barangay Restoration Committee", col: C_GREEN_FIX, tcol: C_GREEN_TXT }}
    ];
    for (var r = 0; r < roles.length; r++) {{
        var ry = 480 + r * 65;
        var rbox = act04.layers.addSolid(roles[r].col, "RBox_" + r, 640, 52, 1.0);
        rbox.property("Transform").property("Position").setValue([560, ry]);
        addText(act04, "✓ " + roles[r].title + " — " + roles[r].sub, 13, "Helvetica-Bold", roles[r].tcol, [560, ry + 4], ParagraphJustification.CENTER_JUSTIFY);
    }}

    // Right Card: Cross-Stream Verification
    addCard(act04, 1360, 530, 720, 520, C_CARD_BORDER, C_CARD, 95);
    var h42 = act04.layers.addSolid(C_CARD_HDR, "H42", 718, 52, 1.0);
    h42.property("Transform").property("Position").setValue([1360, 296]);
    addText(act04, "PAGTUTUGMA SA TATLONG KCIS EXCEL FILES", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [1360, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act04, "100% TUGMANG PAGKAKAKILANLAN", 30, "Helvetica-Bold", C_GREEN_TXT, [1360, 380], ParagraphJustification.CENTER_JUSTIFY);
    var v1 = act04.layers.addSolid([0.04, 0.08, 0.16], "V1", 640, 60, 1.0);
    v1.property("Transform").property("Position").setValue([1360, 450]);
    addText(act04, "Attendance File: 'JUAN DELA CRUZ' · San Roque", 15, "Helvetica", C_OFFWHITE, [1360, 445], ParagraphJustification.CENTER_JUSTIFY);
    addText(act04, "Tugma: May katumbas na lagda sa pahina 2 ng papel", 12, "Helvetica", C_MUTED, [1360, 465], ParagraphJustification.CENTER_JUSTIFY);

    var v2 = act04.layers.addSolid([0.04, 0.08, 0.16], "V2", 640, 60, 1.0);
    v2.property("Transform").property("Position").setValue([1360, 530]);
    addText(act04, "Household File: 'DELA CRUZ, JUAN L.' · Head", 15, "Helvetica", C_OFFWHITE, [1360, 525], ParagraphJustification.CENTER_JUSTIFY);
    addText(act04, "Tugma: Iisa ang tirahan at miyembro ng pamilya", 12, "Helvetica", C_MUTED, [1360, 545], ParagraphJustification.CENTER_JUSTIFY);

    var v3 = act04.layers.addSolid([0.04, 0.08, 0.16], "V3", 640, 60, 1.0);
    v3.property("Transform").property("Position").setValue([1360, 610]);
    addText(act04, "Volunteer File: 'JUAN DELA CRUZ' · BResT", 15, "Helvetica", C_OFFWHITE, [1360, 605], ParagraphJustification.CENTER_JUSTIFY);
    addText(act04, "Tugma: Naitalang miyembro ng sub-project committee", 12, "Helvetica", C_MUTED, [1360, 625], ParagraphJustification.CENTER_JUSTIFY);

    var b42 = act04.layers.addSolid(C_BLUE_BADGE, "B42", 480, 40, 1.0);
    b42.property("Transform").property("Position").setValue([1360, 690]);
    addText(act04, "RESULTA: WALANG DUPLICATE · TAPAT NA REKORD", 14, "Helvetica-Bold", C_WHITE, [1360, 696], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 05: D1 Accuracy (Katumpakan) (16s)
    // ==========================================
    var act05 = app.project.items.addComp("Act05_AccuracyD1", 1920, 1080, 1.0, 16, 30);
    setupActCanvas(act05,
        "PAMANTAYAN 1 · KATUMPAKAN // D1 ACCURACY",
        "Pagtukoy sa Petsa sa Hinaharap at Maling Kaarawan",
        "Pagsasala sa mga imposibleng petsa at demographic typos bago tanggapin sa municipal KCIS database",
        "Hinaharang ang mga petsang na-encode sa hinaharap at itinutuwid ang mga maling taon ng kapanganakan."
    );
    // Card 1: Future Date
    addCard(act05, 560, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h51 = act05.layers.addSolid(C_CARD_HDR, "H51", 718, 52, 1.0);
    h51.property("Transform").property("Position").setValue([560, 296]);
    addText(act05, "KASO A · ADVANCE ASSEMBLY DATE (+40 ARAW)", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act05, "Barangay: San Roque · 1st Barangay Assembly", 17, "Helvetica-Bold", C_OFFWHITE, [560, 365], ParagraphJustification.CENTER_JUSTIFY);

    var w51 = act05.layers.addSolid(C_AMBER_WARN, "W51", 640, 75, 1.0);
    w51.property("Transform").property("Position").setValue([560, 440]);
    addText(act05, "NA-ENCODE NA PETSA: 2026-11-24 (+40 Araw sa Hinaharap)", 17, "Helvetica-Bold", C_AMBER_TXT, [560, 432], ParagraphJustification.CENTER_JUSTIFY);
    addText(act05, "Hinarang ng Sistema: Hindi pa nagaganap ang araw na ito", 13, "Helvetica", [0.9, 0.75, 0.5], [560, 458], ParagraphJustification.CENTER_JUSTIFY);

    var f51 = act05.layers.addSolid(C_GREEN_FIX, "F51", 640, 75, 1.0);
    f51.property("Transform").property("Position").setValue([560, 545]);
    addText(act05, "ITINUWID NA PETSA: 2026-09-24 (Tamang Araw ng Asembleya)", 17, "Helvetica-Bold", C_GREEN_TXT, [560, 537], ParagraphJustification.CENTER_JUSTIFY);
    addText(act05, "Batayan: Nilagdaang Minutes at Attendance Sheet sa Barangay", 13, "Helvetica", [0.6, 0.95, 0.7], [560, 563], ParagraphJustification.CENTER_JUSTIFY);

    var b51 = act05.layers.addSolid(C_BLUE_BADGE, "B51", 420, 36, 1.0);
    b51.property("Transform").property("Position").setValue([560, 640]);
    addText(act05, "SFMSC COMMITTEE: 1 CHAIR + 3 MEMBERS (PASSED)", 13, "Helvetica-Bold", C_WHITE, [560, 646], ParagraphJustification.CENTER_JUSTIFY);

    // Card 2: Birth Year Typo
    addCard(act05, 1360, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h52 = act05.layers.addSolid(C_CARD_HDR, "H52", 718, 52, 1.0);
    h52.property("Transform").property("Position").setValue([1360, 296]);
    addText(act05, "KASO B · DEMOGRAPHIC BIRTH YEAR TYPO (134 TAON)", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [1360, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act05, "Residente: Elena M. Gonzales · Dumalo sa Asembleya", 17, "Helvetica-Bold", C_OFFWHITE, [1360, 365], ParagraphJustification.CENTER_JUSTIFY);

    var w52 = act05.layers.addSolid(C_AMBER_WARN, "W52", 640, 75, 1.0);
    w52.property("Transform").property("Position").setValue([1360, 440]);
    addText(act05, "NA-ENCODE NA KAARAWAN: 1892-04-12 (134 Taong Gulang)", 17, "Helvetica-Bold", C_AMBER_TXT, [1360, 432], ParagraphJustification.CENTER_JUSTIFY);
    addText(act05, "Hinarang ng Sistema: Imposibleng edad ayon sa pambansang datos", 13, "Helvetica", [0.9, 0.75, 0.5], [1360, 458], ParagraphJustification.CENTER_JUSTIFY);

    var f52 = act05.layers.addSolid(C_GREEN_FIX, "F52", 640, 75, 1.0);
    f52.property("Transform").property("Position").setValue([1360, 545]);
    addText(act05, "ITINUWID NA KAARAWAN: 1982-04-12 (44 Taong Gulang)", 17, "Helvetica-Bold", C_GREEN_TXT, [1360, 537], ParagraphJustification.CENTER_JUSTIFY);
    addText(act05, "Batayan: Household Masterlist at Balidong ID ng Residente", 13, "Helvetica", [0.6, 0.95, 0.7], [1360, 563], ParagraphJustification.CENTER_JUSTIFY);

    var b52 = act05.layers.addSolid(C_GREEN_FIX, "B52", 420, 36, 1.0);
    b52.property("Transform").property("Position").setValue([1360, 640]);
    addText(act05, "KATUMPAKAN SCORE: 98.4% (EXCELLENT RATING)", 13, "Helvetica-Bold", C_GREEN_TXT, [1360, 646], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 06: D2 Reliability (Katiyakan) (16s)
    // ==========================================
    var act06 = app.project.items.addComp("Act06_ReliabilityD2", 1920, 1080, 1.0, 16, 30);
    setupActCanvas(act06,
        "PAMANTAYAN 2 · KATIYAKAN // D2 RELIABILITY",
        "Pagsasama ng Nahating Petsa at Tapat na Quorum",
        "Pag-iwas sa imposibleng 167.3% quorum sa pamamagitan ng pagsasama sa iisang Barangay Resolution",
        "Pinagsasama ang nahating petsa upang maibalik sa tapat na 88.2% quorum."
    );
    // Left: Split Date Anomaly
    addCard(act06, 560, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h61 = act06.layers.addSolid(C_CARD_HDR, "H61", 718, 52, 1.0);
    h61.property("Transform").property("Position").setValue([560, 296]);
    addText(act06, "ANOMALYA · NAHATING PETSA NG ASEMBLYA", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act06, "167.3% QUORUM OVERFLOW", 34, "Helvetica-Bold", C_RED_TXT, [560, 375], ParagraphJustification.CENTER_JUSTIFY);

    var sBox1 = act06.layers.addSolid([0.04, 0.08, 0.16], "SBox1", 640, 50, 1.0);
    sBox1.property("Transform").property("Position").setValue([560, 435]);
    addText(act06, "Unang Sesyon: Abril 5, 2026 ➔ 98 Naitalang Dumalo", 15, "Helvetica", C_OFFWHITE, [560, 440], ParagraphJustification.CENTER_JUSTIFY);

    var sBox2 = act06.layers.addSolid([0.04, 0.08, 0.16], "SBox2", 640, 50, 1.0);
    sBox2.property("Transform").property("Position").setValue([560, 495]);
    addText(act06, "Ikalawang Sesyon: Abril 12, 2026 ➔ 86 Naitalang Dumalo", 15, "Helvetica", C_OFFWHITE, [560, 500], ParagraphJustification.CENTER_JUSTIFY);

    var warn6 = act06.layers.addSolid(C_RED_ALERT, "Warn6", 640, 60, 1.0);
    warn6.property("Transform").property("Position").setValue([560, 565]);
    addText(act06, "Maling Kabuuan: 184 Dumalo vs 110 Kabuuang Sambahayan", 15, "Helvetica-Bold", C_RED_TXT, [560, 560], ParagraphJustification.CENTER_JUSTIFY);
    addText(act06, "Imposible sa batas ng KALAHI-CIDSS na lumagpas sa 100% quorum", 12, "Helvetica", [1.0, 0.8, 0.8], [560, 580], ParagraphJustification.CENTER_JUSTIFY);

    var b61 = act06.layers.addSolid(C_AMBER_WARN, "B61", 420, 36, 1.0);
    b61.property("Transform").property("Position").setValue([560, 640]);
    addText(act06, "STATUS: PINAGHIHINALAANG DOBLE O SPLIT", 13, "Helvetica-Bold", C_AMBER_TXT, [560, 646], ParagraphJustification.CENTER_JUSTIFY);

    // Right: Resolution & Combined Quorum
    addCard(act06, 1360, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h62 = act06.layers.addSolid(C_CARD_HDR, "H62", 718, 52, 1.0);
    h62.property("Transform").property("Position").setValue([1360, 296]);
    addText(act06, "SOLUSYON · BARANGAY RESOLUTION #14", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [1360, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act06, "88.2% BALIDONG QUORUM", 34, "Helvetica-Bold", C_GREEN_TXT, [1360, 375], ParagraphJustification.CENTER_JUSTIFY);

    var resBox1 = act06.layers.addSolid(C_GREEN_FIX, "ResBox1", 640, 75, 1.0);
    resBox1.property("Transform").property("Position").setValue([1360, 450]);
    addText(act06, "Pinagsama sa Opisyal na Petsa: Abril 5, 2026", 17, "Helvetica-Bold", C_GREEN_TXT, [1360, 442], ParagraphJustification.CENTER_JUSTIFY);
    addText(act06, "Ayon sa pinagtibay na Barangay Resolution No. 14, Serye ng 2026", 13, "Helvetica", [0.6, 0.95, 0.7], [1360, 468], ParagraphJustification.CENTER_JUSTIFY);

    var resBox2 = act06.layers.addSolid([0.04, 0.08, 0.16], "ResBox2", 640, 75, 1.0);
    resBox2.property("Transform").property("Position").setValue([1360, 545]);
    addText(act06, "97 Natatanging Sambahayan ang Nakitang Dumalo", 17, "Helvetica-Bold", C_WHITE, [1360, 537], ParagraphJustification.CENTER_JUSTIFY);
    addText(act06, "Inalis ang mga paulit-ulit na attendance entries sa ikalawang araw", 13, "Helvetica", C_MUTED, [1360, 563], ParagraphJustification.CENTER_JUSTIFY);

    var b62 = act06.layers.addSolid(C_BLUE_BADGE, "B62", 480, 36, 1.0);
    b62.property("Transform").property("Position").setValue([1360, 640]);
    addText(act06, "K2 QUORUM THRESHOLD (80%): MATAGUMPAY NA NAIPASA", 13, "Helvetica-Bold", C_WHITE, [1360, 646], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 07: D3 Completeness (Kakumpletuhan) (16s)
    // ==========================================
    var act07 = app.project.items.addComp("Act07_CompletenessD3", 1920, 1080, 1.0, 16, 30);
    setupActCanvas(act07,
        "PAMANTAYAN 3 · KAKUMPLETUHAN // D3 COMPLETENESS",
        "Pagkakasunod ng Asembleya at Pantay na Kasarian (GAD)",
        "Pagsisiguro na kumpleto ang 14 yugto at walang blangkong datos sa Gender and Development",
        "Sinisiguro ang tamang pagkakasunod ng asembleya at kumpletong talaan ng kababaihan."
    );
    // Left: Sequential Logic
    addCard(act07, 560, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h71 = act07.layers.addSolid(C_CARD_HDR, "H71", 718, 52, 1.0);
    h71.property("Transform").property("Position").setValue([560, 296]);
    addText(act07, "TAMANG PAGKAKASUNOD NG MGA YUGTO (14 MILESTONES)", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 302], ParagraphJustification.CENTER_JUSTIFY);

    var stages = [
        {{ name: "1st BA · Oryentasyon at Pagbuo ng Komunidad", date: "Sep 24, 2026", status: "KUMPLETO ✓", col: C_GREEN_FIX, tcol: C_GREEN_TXT }},
        {{ name: "2nd BA · Pagpili at Pag-apruba sa Sub-Project", date: "Oct 12, 2026", status: "KUMPLETO ✓", col: C_GREEN_FIX, tcol: C_GREEN_TXT }},
        {{ name: "3rd BA · Ulat ng Pondo at Pagsusuri ng Gawa", date: "Nov 04, 2026", status: "KUMPLETO ✓", col: C_GREEN_FIX, tcol: C_GREEN_TXT }}
    ];
    for (var stg = 0; stg < stages.length; stg++) {{
        var stgy = 370 + stg * 75;
        var sbar = act07.layers.addSolid([0.04, 0.08, 0.16], "SBar_" + stg, 640, 60, 1.0);
        sbar.property("Transform").property("Position").setValue([560, stgy]);
        addText(act07, stages[stg].name, 15, "Helvetica-Bold", C_WHITE, [560, stgy - 8], ParagraphJustification.CENTER_JUSTIFY);
        addText(act07, "Petsa: " + stages[stg].date + " · Status: " + stages[stg].status, 13, "Helvetica", stages[stg].tcol, [560, stgy + 14], ParagraphJustification.CENTER_JUSTIFY);
    }}
    var b71 = act07.layers.addSolid(C_BLUE_BADGE, "B71", 520, 36, 1.0);
    b71.property("Transform").property("Position").setValue([560, 640]);
    addText(act07, "PATAKARAN: HINDI PUWEDENG MAUNA ANG 2ND BA SA 1ST BA", 13, "Helvetica-Bold", C_WHITE, [560, 646], ParagraphJustification.CENTER_JUSTIFY);

    // Right: Gender & Development (GAD)
    addCard(act07, 1360, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h72 = act07.layers.addSolid(C_CARD_HDR, "H72", 718, 52, 1.0);
    h72.property("Transform").property("Position").setValue([1360, 296]);
    addText(act07, "GENDER AND DEVELOPMENT (GAD) PARTICIPATION", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [1360, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act07, "52% KABABAIHAN · 48% KALALAKIHAN", 30, "Helvetica-Bold", [0.3, 0.85, 1.0], [1360, 375], ParagraphJustification.CENTER_JUSTIFY);

    // Progress Bar Outer & Inner
    var barOuter = act07.layers.addSolid([0.04, 0.08, 0.16], "BarOuter", 640, 44, 1.0);
    barOuter.property("Transform").property("Position").setValue([1360, 440]);
    // Women portion (52% of 640 = 332px)
    var barWomen = act07.layers.addSolid([0.85, 0.25, 0.55], "BarWomen", 332, 40, 1.0);
    barWomen.property("Transform").property("Position").setValue([1360 - 320 + 166, 440]);
    // Men portion (48% of 640 = 308px)
    var barMen = act07.layers.addSolid([0.15, 0.45, 0.95], "BarMen", 308, 40, 1.0);
    barMen.property("Transform").property("Position").setValue([1360 + 320 - 154, 440]);

    var gStatBox = act07.layers.addSolid(C_GREEN_FIX, "GStatBox", 640, 65, 1.0);
    gStatBox.property("Transform").property("Position").setValue([1360, 525]);
    addText(act07, "✓ 0 BLANGKONG KASARIAN SA ATTENDANCE", 17, "Helvetica-Bold", C_GREEN_TXT, [1360, 517], ParagraphJustification.CENTER_JUSTIFY);
    addText(act07, "Lahat ng 128 na dumalo ay may natukoy na kasarian para sa GAD compliance", 13, "Helvetica", [0.6, 0.95, 0.7], [1360, 543], ParagraphJustification.CENTER_JUSTIFY);

    var b72 = act07.layers.addSolid(C_BLUE_BADGE, "B72", 420, 36, 1.0);
    b72.property("Transform").property("Position").setValue([1360, 640]);
    addText(act07, "KAKUMPLETUHAN SCORE: 99.1% (PASSED)", 13, "Helvetica-Bold", C_WHITE, [1360, 646], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 08: D4 Precision (Kasiguruhan / SM7 Table 8) (20s)
    // ==========================================
    var act08 = app.project.items.addComp("Act08_PrecisionD4", 1920, 1080, 1.0, 20, 30);
    setupActCanvas(act08,
        "PAMANTAYAN 4 · KASIGURUHAN // SM7 TABLE 8 AUDIT",
        "Paghahambing sa Nilagdaang Papel at KCIS (10% Sample)",
        "SM7 Table 8 Optical Audit: Pagsusuri sa bawat linya ng pinirmahang attendance sheet laban sa database",
        "Ayon sa SM7 Table 8: inihahambing ang nilagdaang papel laban sa KCIS sa 10% sample."
    );
    // Table Outer Card
    addCard(act08, 960, 530, 1540, 520, C_CARD_BORDER, C_CARD, 95);
    var h8 = act08.layers.addSolid(C_CARD_HDR, "H8", 1538, 52, 1.0);
    h8.property("Transform").property("Position").setValue([960, 296]);
    addText(act08, "SM7 TABLE 8 · PINAGSABAY NA PAGSUSURI SA ORIHINAL NA PAPEL LABAN SA KCIS DIGITAL RECORD", 15, "Helvetica-Bold", [0.4, 0.75, 1.0], [960, 302], ParagraphJustification.CENTER_JUSTIFY);

    // Header columns
    var th = act08.layers.addSolid([0.08, 0.14, 0.28], "TH", 1480, 36, 1.0);
    th.property("Transform").property("Position").setValue([960, 348]);
    addText(act08, "ORIHINAL NA NILAGDAANG PAPEL (FIELD SHEET)", 13, "Helvetica-Bold", C_MUTED, [440, 353], ParagraphJustification.CENTER_JUSTIFY);
    addText(act08, "NA-ENCODE NA RECORD SA KCIS", 13, "Helvetica-Bold", C_MUTED, [960, 353], ParagraphJustification.CENTER_JUSTIFY);
    addText(act08, "STATUS / RESULTA", 13, "Helvetica-Bold", C_MUTED, [1440, 353], ParagraphJustification.CENTER_JUSTIFY);

    // 4 Sample Rows
    var pRows = [
        {{ paper: "Maria L. Santos · 03/12/1984 (F)", kcis: "MARIA L. SANTOS · 1984-03-12 (F)", chip: "EXACT MATCH ✓", chipCol: C_GREEN_FIX, chipTxt: C_GREEN_TXT, note: "Tugmang pangalan, kaarawan, at may pirma sa papel" }},
        {{ paper: "Rowena D. Villanueva · 05/30/1991 (F)", kcis: "ROWENA D. VILLANUENA · 1991-05-30", chip: "SPELLING TYPO ✎", chipCol: C_AMBER_WARN, chipTxt: C_AMBER_TXT, note: "Maling baybay sa KCIS (N sa halip na V)" }},
        {{ paper: "Danilo P. Reyes · 07/21/1990 (M)", kcis: "DANILO P. REYES · 1990-21-07 (M)", chip: "SWAPPED DAY/MONTH ⟳", chipCol: C_AMBER_WARN, chipTxt: C_AMBER_TXT, note: "Napagpalit ang araw at buwan sa pag-type" }},
        {{ paper: "[Walang Pirma sa Sheet] · —", kcis: "ARNEL T. RAMOS · 1975-08-14 (M)", chip: "NOT ON PAPER ✕", chipCol: C_RED_ALERT, chipTxt: C_RED_TXT, note: "Na-encode ngunit walang pirma sa orihinal na papel" }}
    ];
    for (var pr = 0; pr < pRows.length; pr++) {{
        var pry = 410 + pr * 75;
        var rbg = act08.layers.addSolid((pr % 2 === 0) ? [0.07, 0.12, 0.24] : [0.05, 0.09, 0.18], "PRow_" + pr, 1480, 68, 1.0);
        rbg.property("Transform").property("Position").setValue([960, pry]);

        addText(act08, pRows[pr].paper, 15, "Helvetica-Bold", C_WHITE, [440, pry - 10], ParagraphJustification.CENTER_JUSTIFY);
        addText(act08, pRows[pr].kcis, 15, "Helvetica-Bold", [0.4, 0.8, 1.0], [960, pry - 10], ParagraphJustification.CENTER_JUSTIFY);

        var chip = act08.layers.addSolid(pRows[pr].chipCol, "Chip_" + pr, 220, 32, 1.0);
        chip.property("Transform").property("Position").setValue([1440, pry - 8]);
        addText(act08, pRows[pr].chip, 12, "Helvetica-Bold", pRows[pr].chipTxt, [1440, pry - 4], ParagraphJustification.CENTER_JUSTIFY);

        addText(act08, pRows[pr].note, 12, "Helvetica", C_MUTED, [960, pry + 16], ParagraphJustification.CENTER_JUSTIFY);
    }}
    // Table Footer Summary
    var tfBox = act08.layers.addSolid(C_BLUE_BADGE, "TFBox", 860, 40, 1.0);
    tfBox.property("Transform").property("Position").setValue([960, 720]);
    addText(act08, "SM7 AUDIT RESULT: 10% STRATIFIED SAMPLE VERIFIED (94.5% PRECISION ACCURACY)", 13, "Helvetica-Bold", C_WHITE, [960, 726], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 09: D5 Timeliness (Kapanahunan) (16s)
    // ==========================================
    var act09 = app.project.items.addComp("Act09_TimelinessD5", 1920, 1080, 1.0, 16, 30);
    setupActCanvas(act09,
        "PAMANTAYAN 5 · KAPANAHUNAN // 7-DAY ENCODING RULE",
        "7-Araw na Palugit sa Pag-encode ng Asembleya",
        "Pagsubaybay sa bilis ng pagpasok ng datos mula sa araw ng pulong sa komunidad",
        "Sinusubaybayan ang pitong araw na palugit sa pag-encode matapos ang asembleya."
    );
    // Left: Santa Cruz Case
    addCard(act09, 560, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h91 = act09.layers.addSolid(C_CARD_HDR, "H91", 718, 52, 1.0);
    h91.property("Transform").property("Position").setValue([560, 296]);
    addText(act09, "KASO · BRGY. SANTA CRUZ 1ST ASSEMBLY", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act09, "8 ARAW NA OVERDUE", 38, "Helvetica-Bold", C_AMBER_TXT, [560, 375], ParagraphJustification.CENTER_JUSTIFY);

    var tDates = [
        {{ label: "ARAW 0 · Asembleya Isinagawa sa Barangay", val: "Oktubre 01, 2026", col: C_WHITE }},
        {{ label: "ARAW 7 · Huling Araw ng 7-Day Encoding Rule", val: "Oktubre 08, 2026", col: [0.4, 0.8, 1.0] }},
        {{ label: "ARAW 15 · Aktwal na Na-encode sa KCIS System", val: "Oktubre 16, 2026 (+15 Araw)", col: C_AMBER_TXT }}
    ];
    for (var td = 0; td < tDates.length; td++) {{
        var tdy = 440 + td * 65;
        var tdBox = act09.layers.addSolid([0.04, 0.08, 0.16], "TDBox_" + td, 640, 52, 1.0);
        tdBox.property("Transform").property("Position").setValue([560, tdy]);
        addText(act09, tDates[td].label, 14, "Helvetica-Bold", tDates[td].col, [560, tdy - 8], ParagraphJustification.CENTER_JUSTIFY);
        addText(act09, tDates[td].val, 13, "Helvetica", C_MUTED, [560, tdy + 12], ParagraphJustification.CENTER_JUSTIFY);
    }}
    var b91 = act09.layers.addSolid(C_AMBER_WARN, "B91", 440, 36, 1.0);
    b91.property("Transform").property("Position").setValue([560, 640]);
    addText(act09, "TAG: 8-ARAW NA ANTALA (NANGANGAILANGAN NG FOLLOW-UP)", 12, "Helvetica-Bold", C_AMBER_TXT, [560, 646], ParagraphJustification.CENTER_JUSTIFY);

    // Right: Municipal Breakdown
    addCard(act09, 1360, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h92 = act09.layers.addSolid(C_CARD_HDR, "H92", 718, 52, 1.0);
    h92.property("Transform").property("Position").setValue([1360, 296]);
    addText(act09, "MUNICIPAL OVERVIEW · SAN ISIDRO (19 BARANGAYS)", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [1360, 302], ParagraphJustification.CENTER_JUSTIFY);

    addText(act09, "73.7% ON-TIME RATE", 38, "Helvetica-Bold", C_WHITE, [1360, 375], ParagraphJustification.CENTER_JUSTIFY);

    var otBox = act09.layers.addSolid(C_GREEN_FIX, "OTBox", 640, 75, 1.0);
    otBox.property("Transform").property("Position").setValue([1360, 450]);
    addText(act09, "14 BARANGAY: PASOK SA 7-ARAW NA PALUGIT", 17, "Helvetica-Bold", C_GREEN_TXT, [1360, 442], ParagraphJustification.CENTER_JUSTIFY);
    addText(act09, "Na-encode sa loob ng 1 hanggang 5 araw matapos ang pagpupulong", 13, "Helvetica", [0.6, 0.95, 0.7], [1360, 468], ParagraphJustification.CENTER_JUSTIFY);

    var odBox = act09.layers.addSolid(C_AMBER_WARN, "ODBox", 640, 75, 1.0);
    odBox.property("Transform").property("Position").setValue([1360, 545]);
    addText(act09, "5 BARANGAY: NALAMPAS SA 7-ARAW NA PALUGIT", 17, "Helvetica-Bold", C_AMBER_TXT, [1360, 537], ParagraphJustification.CENTER_JUSTIFY);
    addText(act09, "Awtomatikong inilista sa Talaan ng mga Aayusin para sa M&E team", 13, "Helvetica", [0.9, 0.75, 0.5], [1360, 563], ParagraphJustification.CENTER_JUSTIFY);

    var b92 = act09.layers.addSolid(C_BLUE_BADGE, "B92", 420, 36, 1.0);
    b92.property("Transform").property("Position").setValue([1360, 640]);
    addText(act09, "KAPANAHUNAN SCORE: 95.0% (VERY GOOD RATING)", 13, "Helvetica-Bold", C_WHITE, [1360, 646], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 10: D6 Integrity (Integridad) (16s)
    // ==========================================
    var act10 = app.project.items.addComp("Act10_IntegrityD6", 1920, 1080, 1.0, 16, 30);
    setupActCanvas(act10,
        "PAMANTAYAN 6 · INTEGRIDAD // ANTI-DOUBLE COUNTING",
        "Pag-iwas sa Dobleng Pagbilang sa Ibang Barangay",
        "Pagsasala sa mga residenteng naitala sa magkaibang barangay upang maging tapat ang opisyal na ulat",
        "Hinaharang ang dobleng pagbilang ng residente sa magkaibang barangay."
    );
    // Left: Collision Case
    addCard(act10, 560, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h101 = act10.layers.addSolid(C_CARD_HDR, "H101", 718, 52, 1.0);
    h101.property("Transform").property("Position").setValue([560, 296]);
    addText(act10, "KASO A · DUAL-BARANGAY HOUSEHOLD HEAD", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act10, "RAMON GUTIERREZ", 38, "Helvetica-Bold", C_AMBER_TXT, [560, 375], ParagraphJustification.CENTER_JUSTIFY);

    var dbox1 = act10.layers.addSolid([0.04, 0.08, 0.16], "DBox1", 640, 55, 1.0);
    dbox1.property("Transform").property("Position").setValue([560, 440]);
    addText(act10, "Naitala sa Brgy. Maligaya bilang Puno ng Pamilya", 15, "Helvetica", C_OFFWHITE, [560, 445], ParagraphJustification.CENTER_JUSTIFY);

    var dbox2 = act10.layers.addSolid([0.04, 0.08, 0.16], "DBox2", 640, 55, 1.0);
    dbox2.property("Transform").property("Position").setValue([560, 510]);
    addText(act10, "Naitala rin sa Brgy. San Pedro bilang Puno ng Pamilya", 15, "Helvetica", C_AMBER_TXT, [560, 515], ParagraphJustification.CENTER_JUSTIFY);

    var dwarn = act10.layers.addSolid(C_AMBER_WARN, "DWarn", 640, 60, 1.0);
    dwarn.property("Transform").property("Position").setValue([560, 580]);
    addText(act10, "Panganib: Doble ang bilang sa pambansang pondo at quorum", 14, "Helvetica-Bold", C_AMBER_TXT, [560, 585], ParagraphJustification.CENTER_JUSTIFY);

    var b101 = act10.layers.addSolid(C_RED_ALERT, "B101", 420, 36, 1.0);
    b101.property("Transform").property("Position").setValue([560, 640]);
    addText(act10, "STATUS: INTEGRITY COLLISION DETECTED", 13, "Helvetica-Bold", C_RED_TXT, [560, 646], ParagraphJustification.CENTER_JUSTIFY);

    // Right: Resolution & Entity Fusion
    addCard(act10, 1360, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h102 = act10.layers.addSolid(C_CARD_HDR, "H102", 718, 52, 1.0);
    h102.property("Transform").property("Position").setValue([1360, 296]);
    addText(act10, "RESOLUSYON AT TAPAT NA PAGSASAMA", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [1360, 302], ParagraphJustification.CENTER_JUSTIFY);
    addText(act10, "PINATIBAY SA BRGY. MALIGAYA", 32, "Helvetica-Bold", C_GREEN_TXT, [1360, 375], ParagraphJustification.CENTER_JUSTIFY);

    var rbox10 = act10.layers.addSolid(C_GREEN_FIX, "RBox10", 640, 75, 1.0);
    rbox10.property("Transform").property("Position").setValue([1360, 450]);
    addText(act10, "Pinanatili sa Maligaya (Opisyal na Tirahan ayon sa Census)", 16, "Helvetica-Bold", C_GREEN_TXT, [1360, 442], ParagraphJustification.CENTER_JUSTIFY);
    addText(act10, "Inalis ang duplicate entry sa Brgy. San Pedro quorum denominator", 13, "Helvetica", [0.6, 0.95, 0.7], [1360, 468], ParagraphJustification.CENTER_JUSTIFY);

    var rbox11 = act10.layers.addSolid([0.04, 0.08, 0.16], "RBox11", 640, 75, 1.0);
    rbox11.property("Transform").property("Position").setValue([1360, 545]);
    addText(act10, "Kaso B: Roberto Alvarez (2 attendance entries pinagsama)", 16, "Helvetica-Bold", C_WHITE, [1360, 537], ParagraphJustification.CENTER_JUSTIFY);
    addText(act10, "Iisang tao na pumirma nang dalawang beses sa parehong meeting", 13, "Helvetica", C_MUTED, [1360, 563], ParagraphJustification.CENTER_JUSTIFY);

    var b102 = act10.layers.addSolid(C_BLUE_BADGE, "B102", 440, 36, 1.0);
    b102.property("Transform").property("Position").setValue([1360, 640]);
    addText(act10, "INTEGRIDAD SCORE: 98.8% (ZERO DUPLICATE HEADS)", 13, "Helvetica-Bold", C_WHITE, [1360, 646], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 11: Scorecard & Export (13s)
    // ==========================================
    var act11 = app.project.items.addComp("Act11_ScorecardExport", 1920, 1080, 1.0, 13, 30);
    setupActCanvas(act11,
        "EXECUTIVE AUDIT SUMMARY // EXCEL WORKBOOK EXPORT",
        "Scorecard ng Datos at Malinis na 4-Sheet Excel Report",
        "Awtomatikong buod para sa Municipal Mayor, ACT, at Regional Monitoring Officers",
        "Scorecard ng datos at malinis na 4-sheet Excel report na handa para sa Mayor."
    );
    // Left: Composite Scorecard
    addCard(act11, 560, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h111 = act11.layers.addSolid(C_CARD_HDR, "H111", 718, 52, 1.0);
    h111.property("Transform").property("Position").setValue([560, 296]);
    addText(act11, "KABUUANG KALIDAD NG DATOS (COMPOSITE SCORE)", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [560, 302], ParagraphJustification.CENTER_JUSTIFY);

    addText(act11, "96.8%", 56, "Helvetica-Bold", C_GREEN_TXT, [560, 385], ParagraphJustification.CENTER_JUSTIFY);
    addText(act11, "EXCELLENT DATA QUALITY RATING", 17, "Helvetica-Bold", C_OFFWHITE, [560, 430], ParagraphJustification.CENTER_JUSTIFY);

    var dimScores = [
        "Katumpakan: 98.4% · Katiyakan: 96.2% · Kakumpletuhan: 99.1%",
        "Kasiguruhan: 94.5% · Kapanahunan: 95.0% · Integridad: 98.8%"
    ];
    var scBox = act11.layers.addSolid([0.04, 0.08, 0.16], "SCBox", 640, 80, 1.0);
    scBox.property("Transform").property("Position").setValue([560, 500]);
    addText(act11, dimScores[0], 14, "Helvetica-Bold", C_MUTED, [560, 485], ParagraphJustification.CENTER_JUSTIFY);
    addText(act11, dimScores[1], 14, "Helvetica-Bold", C_MUTED, [560, 515], ParagraphJustification.CENTER_JUSTIFY);

    var b111 = act11.layers.addSolid(C_GREEN_FIX, "B111", 440, 40, 1.0);
    b111.property("Transform").property("Position").setValue([560, 640]);
    addText(act11, "✓ LAHAT NG 6 PAMANTAYAN AY PASOK SA STANDARD", 13, "Helvetica-Bold", C_GREEN_TXT, [560, 646], ParagraphJustification.CENTER_JUSTIFY);

    // Right: 4-Sheet Excel Workbook Export
    addCard(act11, 1360, 520, 720, 500, C_CARD_BORDER, C_CARD, 95);
    var h112 = act11.layers.addSolid(C_CARD_HDR, "H112", 718, 52, 1.0);
    h112.property("Transform").property("Position").setValue([1360, 296]);
    addText(act11, "HANDA PARA SA MUNICIPAL MAYOR AT REGION", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [1360, 302], ParagraphJustification.CENTER_JUSTIFY);

    addText(act11, "OPISYAL NA EXCEL WORKBOOK", 32, "Helvetica-Bold", C_WHITE, [1360, 375], ParagraphJustification.CENTER_JUSTIFY);

    var sheets = [
        "Sheet 1: BUOD (Executive Dashboard & Overall Quality)",
        "Sheet 2: BAYAN (Municipal Timeline & Turnaround)",
        "Sheet 3: BARANGAY (19 Barangays Quorum & GAD)",
        "Sheet 4: TALAAN NG AAYUSIN (Itemized Resolution List)"
    ];
    for (var shIdx = 0; shIdx < sheets.length; shIdx++) {{
        var shy = 430 + shIdx * 50;
        var shBox = act11.layers.addSolid([0.04, 0.08, 0.16], "ShBox_" + shIdx, 640, 42, 1.0);
        shBox.property("Transform").property("Position").setValue([1360, shy]);
        addText(act11, "📊 " + sheets[shIdx], 14, "Helvetica-Bold", [0.4, 0.85, 0.6], [1360, shy + 4], ParagraphJustification.CENTER_JUSTIFY);
    }}
    var b112 = act11.layers.addSolid(C_BLUE_BADGE, "B112", 480, 40, 1.0);
    b112.property("Transform").property("Position").setValue([1360, 660]);
    addText(act11, "ISANG PINDOT LANG: .XLSX + .PCRP EXPORT HANDA NA", 13, "Helvetica-Bold", C_WHITE, [1360, 666], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // ACT 12: Finale & Institutional Trust (9s)
    // ==========================================
    var act12 = app.project.items.addComp("Act12_Finale", 1920, 1080, 1.0, 9, 30);
    setupActCanvas(act12,
        "DSWD · KALAHI-CIDSS PCRP",
        "Tapat na Datos Para sa Bawat Komunidad",
        "Anim na Pamantayan ng Kalidad ng Datos · Mula sa Nilagdaang Papel Patungo sa Malinis na Ulat",
        "Malinis na talaan, tapat na ulat, at mas maayos na pagpapasya para sa bawat komunidad."
    );
    // Center Hero Monumental Card
    addCard(act12, 960, 520, 1440, 500, C_CARD_BORDER, C_CARD, 95);
    var h12 = act12.layers.addSolid(C_CARD_HDR, "H12", 1438, 56, 1.0);
    h12.property("Transform").property("Position").setValue([960, 298]);
    addText(act12, "DEPARTMENT OF SOCIAL WELFARE AND DEVELOPMENT · KALAHI-CIDSS PCRP", 16, "Helvetica-Bold", [0.4, 0.75, 1.0], [960, 304], ParagraphJustification.CENTER_JUSTIFY);

    addText(act12, "PCRP ENCODING AND DATA QUALITY ASSESSMENT TOOL", 44, "Helvetica-Bold", C_WHITE, [960, 385], ParagraphJustification.CENTER_JUSTIFY);
    addText(act12, "Ang Opisyal na Katuwang sa Pagsusuri ng Datos ng Pamayanan", 20, "Helvetica-Bold", [0.3, 0.85, 1.0], [960, 435], ParagraphJustification.CENTER_JUSTIFY);

    // 4 Key Pillars Pills
    var pillars = [
        {{ text: "🔒 100% Offline (Walang Internet)", col: C_BLUE_BADGE }},
        {{ text: "⚖️ Data Privacy Act of 2012 (RA 10173)", col: C_BLUE_BADGE }},
        {{ text: "📊 SM7 Table 8 Optical Audit", col: C_BLUE_BADGE }},
        {{ text: "📁 Malinis na 4-Sheet Excel Export", col: C_GREEN_FIX }}
    ];
    for (var pi = 0; pi < pillars.length; pi++) {{
        var px = 420 + (pi % 2) * 540 + 270;
        var py = 520 + Math.floor(pi / 2) * 60;
        var pBox = act12.layers.addSolid(pillars[pi].col, "PillarBox_" + pi, 480, 46, 1.0);
        pBox.property("Transform").property("Position").setValue([px, py]);
        addText(act12, pillars[pi].text, 15, "Helvetica-Bold", C_WHITE, [px, py + 5], ParagraphJustification.CENTER_JUSTIFY);
    }}
    addText(act12, "Malinis na Talaan · Tapat na Ulat · Mas Maayos na Pagpapasya", 18, "Helvetica-Bold", C_OFFWHITE, [960, 680], ParagraphJustification.CENTER_JUSTIFY);

    // ==========================================
    // MASTER COMPOSITION (180s)
    // ==========================================
    var masterComp = app.project.items.addComp("Master_180s", 1920, 1080, 1.0, 180, 30);

    // Add Audio Track
    var audioFile = new File("{clean_audio_path}");
    if (audioFile.exists) {{
        var audioItem = app.project.importFile(new ImportOptions(audioFile));
        var aLayer = masterComp.layers.add(audioItem);
        aLayer.startTime = 0;
        aLayer.inPoint = 0;
        aLayer.outPoint = 180;
    }}

    // Assemble all 12 acts sequentially
    var actList = [
        {{ comp: act01, start: 0.0, dur: 14.0 }},
        {{ comp: act02, start: 14.0, dur: 14.0 }},
        {{ comp: act03, start: 28.0, dur: 16.0 }},
        {{ comp: act04, start: 44.0, dur: 14.0 }},
        {{ comp: act05, start: 58.0, dur: 16.0 }},
        {{ comp: act06, start: 74.0, dur: 16.0 }},
        {{ comp: act07, start: 90.0, dur: 16.0 }},
        {{ comp: act08, start: 106.0, dur: 20.0 }},
        {{ comp: act09, start: 126.0, dur: 16.0 }},
        {{ comp: act10, start: 142.0, dur: 16.0 }},
        {{ comp: act11, start: 158.0, dur: 13.0 }},
        {{ comp: act12, start: 171.0, dur: 9.0 }}
    ];

    for (var a = 0; a < actList.length; a++) {{
        var actEntry = actList[a];
        var precompLayer = masterComp.layers.add(actEntry.comp);
        precompLayer.startTime = actEntry.start;
        precompLayer.inPoint = actEntry.start;
        precompLayer.outPoint = actEntry.start + actEntry.dur;

        // Smooth Opacity Fade at transitions (0.4s)
        var op = precompLayer.property("Transform").property("Opacity");
        op.setValueAtTime(actEntry.start, 0);
        op.setValueAtTime(actEntry.start + 0.4, 100);
        op.setValueAtTime(actEntry.start + actEntry.dur - 0.4, 100);
        op.setValueAtTime(actEntry.start + actEntry.dur, 0);
    }}

    // ==========================================
    // SOCIAL CUT COMPOSITION (30s)
    // 6 Highlight Acts @ 5s each
    // ==========================================
    var socialComp = app.project.items.addComp("Social_30s", 1920, 1080, 1.0, 30, 30);
    if (audioFile.exists) {{
        var aLayerSocial = socialComp.layers.add(audioItem);
        aLayerSocial.startTime = 0;
        aLayerSocial.inPoint = 0;
        aLayerSocial.outPoint = 30;
    }}

    var socialSegments = [
        {{ comp: act01, start: 0.0, dur: 5.0, srcOffset: 2.0 }},
        {{ comp: act02, start: 5.0, dur: 5.0, srcOffset: 2.0 }},
        {{ comp: act05, start: 10.0, dur: 5.0, srcOffset: 3.0 }},
        {{ comp: act06, start: 15.0, dur: 5.0, srcOffset: 3.0 }},
        {{ comp: act08, start: 20.0, dur: 5.0, srcOffset: 3.0 }},
        {{ comp: act12, start: 25.0, dur: 5.0, srcOffset: 1.0 }}
    ];

    for (var si = 0; si < socialSegments.length; si++) {{
        var seg = socialSegments[si];
        var sl = socialComp.layers.add(seg.comp);
        sl.startTime = seg.start - seg.srcOffset;
        sl.inPoint = seg.start;
        sl.outPoint = seg.start + seg.dur;

        var sop = sl.property("Transform").property("Opacity");
        sop.setValueAtTime(seg.start, 0);
        sop.setValueAtTime(seg.start + 0.3, 100);
        sop.setValueAtTime(seg.start + seg.dur - 0.3, 100);
        sop.setValueAtTime(seg.start + seg.dur, 0);
    }}

    app.endUndoGroup();
    return "EffectCraft Project Built Successfully (12 Acts + Master_180s + Social_30s)";
}})();
"""


def main():
    print("=" * 70)
    print("PCRP ENCODING & DATA QUALITY ASSESSMENT TOOL — EFFECTCRAFT MCP PIPELINE")
    print("=" * 70)

    # 1. Initialize MCP Client
    print("\n[Step 1/5] Connecting to EffectCraft MCP server...")
    client = EffectCraftMCPClient()

    # 2. Build Project via JSX ExtendScript
    print("\n[Step 2/5] Building 12 Act Compositions & Master Timelines via MCP run_script...")
    jsx_code = generate_motion_project_jsx(str(AUDIO_WAV))
    result = client.run_script(jsx_code, "build_full_pcrp_motion")
    print(f"[MCP] Result: {result}")

    # 3. Save Project File
    print(f"\n[Step 3/5] Saving EffectCraft project to {PROJECT_FILE}...")
    save_res = client.save_project(PROJECT_FILE)
    print(f"[MCP] Saved: {save_res}")

    # 4. Render All 12 High-Resolution Keyframes
    print(f"\n[Step 4/5] Rendering 12 Master Keyframes from Master_180s...")
    KEYFRAMES_DIR.mkdir(parents=True, exist_ok=True)
    for filename, t in KEYFRAME_TIMINGS:
        out_path = KEYFRAMES_DIR / filename
        print(f"  -> Rendering keyframe {filename} at {t:.1f}s...")
        client.render_frame("Master_180s", t, str(out_path), max_side=0)
        if out_path.exists():
            print(f"     ✓ {filename} ({out_path.stat().st_size // 1024} KB)")

    # Close MCP stdio connection before rendering full videos
    client.close()
    print("[MCP] Closed client connection cleanly.")

    # 5. Render Master 3-Minute Video and Social Cut using EffectCraft CLI native renderer
    print("\n[Step 5/5] Rendering Master Video & Social Cut via EffectCraft CLI Engine...")
    print(f"  -> Rendering Master Film (180.0s, 5400 frames @ 30fps) to {MASTER_MP4}...")
    t0 = time.time()
    cmd_master = [
        CLI_PATH,
        "--project", str(PROJECT_FILE),
        "render",
        "--comp", "Master_180s",
        "--out", str(MASTER_MP4),
        "--format", "h264",
        "--audio", "on",
        "--bitrate", "12000"
    ]
    p_master = subprocess.run(cmd_master, capture_output=True, text=True)
    if p_master.returncode != 0:
        print(f"[ERROR] Master render failed: {p_master.stderr}")
    else:
        elapsed = time.time() - t0
        print(f"  ✓ Master Film Rendered in {elapsed:.1f}s: {MASTER_MP4.stat().st_size // 1024 // 1024} MB")

    print(f"\n  -> Rendering Social Cut (30.0s, 900 frames @ 30fps) to {SOCIAL_MP4}...")
    t1 = time.time()
    cmd_social = [
        CLI_PATH,
        "--project", str(PROJECT_FILE),
        "render",
        "--comp", "Social_30s",
        "--out", str(SOCIAL_MP4),
        "--format", "h264",
        "--audio", "on",
        "--bitrate", "12000"
    ]
    p_social = subprocess.run(cmd_social, capture_output=True, text=True)
    if p_social.returncode != 0:
        print(f"[ERROR] Social render failed: {p_social.stderr}")
    else:
        elapsed = time.time() - t1
        print(f"  ✓ Social Cut Rendered in {elapsed:.1f}s: {SOCIAL_MP4.stat().st_size // 1024 // 1024} MB")

    print("\n" + "=" * 70)
    print("EFFECTCRAFT MOTION GRAPHICS SUITE COMPLETE!")
    print("=" * 70)


if __name__ == "__main__":
    main()
