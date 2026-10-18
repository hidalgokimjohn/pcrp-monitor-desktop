#!/usr/bin/env python3
"""
Generate accessible, non-technical voiceover narration for KALAHI-CIDSS PCRP communities.
Voice: en-PH-RosaNeural (Filipina English voice).
"""
import asyncio
import subprocess
import wave
from pathlib import Path
import edge_tts

VO_DIR = Path(__file__).resolve().parent / "vo_clips"
VO_DIR.mkdir(parents=True, exist_ok=True)

VOICE = "en-PH-RosaNeural"
RATE = "+14%"

# (name, start_t, max_dur, text)
SEGMENTS = [
    ("vo_01", 0.5, 12.8, "Across seven hundred forty-seven barangays in KALAHI-CIDSS PCRP, community workers collect thousands of signatures on paper attendance sheets every week. But in KCIS, one wrong date, impossible birthdate, or duplicate household head can quietly distort an entire municipal report."),
    ("vo_02", 14.3, 12.9, "Here is how the PCRP Encoding and Data Quality Assessment Tool helps communities. It runs safely on your computer without needing the internet. Simply choose your municipality—like San Isidro, Leyte—and the tool immediately loads the official list of all nineteen barangays."),
    ("vo_03", 28.3, 14.8, "Next, bring in your three KCIS Excel files: the Participant Attendance list, the Household Masterlist for K-Two quorum, and the Community Volunteer list. In just a few seconds, the tool checks all thirty-four thousand records without uploading any personal information to the internet."),
    ("vo_04", 44.3, 12.9, "The tool connects community members across all your records. For example, it confirms whether Juan Dela Cruz attended the Barangay Assembly, is counted as a household head for community quorum, and is an active volunteer in the BResT committee."),
    ("vo_05", 58.3, 14.9, "Now, the tool checks the six official SM7 Data Quality dimensions. First is Accuracy. In Barangay San Roque, it catches an assembly encoded forty days in the future, catches impossible birth years like eighteen ninety-two, and verifies that the SFMSC committee has a chairperson and active members."),
    ("vo_06", 74.3, 14.9, "Second is Reliability. In Barangay Mabini, the tool finds that one assembly was split into two dates—April fifth and April twelfth. Because of this, attendance showed one hundred eighty-four households present out of only one hundred ten total—an impossible one hundred sixty-seven percent quorum—before helping you combine them."),
    ("vo_07", 90.3, 14.9, "Third is Completeness. It makes sure community steps happen in proper order—flagging when a Second Barangay Assembly is encoded before the First Assembly is recorded. It also reminds you if an assembly has no volunteers listed, or if attendees are missing their sex for Gender and Development reporting."),
    ("vo_08", 106.3, 18.8, "Fourth is Precision, following SM7 Table Eight guidelines. The tool selects a ten percent sample so you can compare the original signed paper attendance sheets side-by-side with KCIS. It clearly highlights exact matches, spelling differences, birthdate mistakes, or names encoded in KCIS that were not on the signed paper form."),
    ("vo_09", 126.3, 14.9, "Fifth is Timeliness. Under KALAHI-CIDSS guidelines, assemblies should be encoded within seven calendar days of being conducted in the barangay. In Barangay Santa Cruz, an assembly held on October first was encoded on October sixteenth—fifteen days later, or eight days overdue."),
    ("vo_10", 142.3, 14.9, "Sixth is Integrity—preventing double counting. The tool detects when the same household head is registered in two different barangays at the same time, and merges duplicate rows so no resident is counted twice."),
    ("vo_11", 158.3, 11.9, "Finally, the Scorecard shows your municipality's overall data health, along with an Actionable Fix List to track which items have been resolved. With one click, generate a clean four-sheet Excel report ready for your municipal and regional meetings."),
    ("vo_12", 171.2, 8.2, "The PCRP Encoding and Data Quality Assessment Tool. Clear records, honest reports, and better decisions for every community.")
]

async def synth_one(name: str, start_t: float, max_dur: float, text: str):
    mp3_path = VO_DIR / f"{name}.mp3"
    raw_wav = VO_DIR / f"{name}_raw.wav"
    wav_path = VO_DIR / f"{name}.wav"
    comm = edge_tts.Communicate(text, VOICE, rate=RATE)
    await comm.save(str(mp3_path))
    subprocess.run([
        "/opt/homebrew/bin/ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(mp3_path), "-ar", "44100", "-ac", "1", str(raw_wav)
    ], check=True)
    with wave.open(str(raw_wav), "rb") as wf:
        dur = wf.getnframes() / wf.getframerate()
    if dur > max_dur:
        tempo = min(1.35, max(1.0, (dur / max_dur) * 1.02))
        subprocess.run([
            "/opt/homebrew/bin/ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(raw_wav), "-filter:a", f"atempo={tempo:.4f}", "-ar", "44100", "-ac", "1", str(wav_path)
        ], check=True)
    else:
        raw_wav.replace(wav_path)
    if raw_wav.exists():
        raw_wav.unlink()
    with wave.open(str(wav_path), "rb") as wf:
        final_dur = wf.getnframes() / wf.getframerate()
    print(f"{name}: start={start_t:6.2f}s | dur={final_dur:5.2f}s (max {max_dur:5.2f}s) | end={start_t+final_dur:6.2f}s")

async def main():
    for name, start_t, max_dur, text in SEGMENTS:
        await synth_one(name, start_t, max_dur, text)

if __name__ == "__main__":
    asyncio.run(main())
