#!/usr/bin/env python3
"""
Parallel 6-Worker Render Pipeline for PCRP Encoding and Data Quality Assessment Tool (3-Minute Master Film).
Aesthetic: OpenCode Console × Full-Canvas 3D System Architecture Motion Graphics.
- Mixes 12 Filipina lady voiceover clips (en-PH-RosaNeural) + procedural SFX (mouse clicks,
  keyboard typing clacks, aerodynamic whooshes, radar alert pings, crystalline chimes) +
  ducked ambient synth score into a 180s 44.1kHz stereo WAV.
- Drives 6 parallel Chrome Headless instances via raw WebSocket CDP at 1920x1080 (30 fps).
- Produces 12 high-resolution keyframes, master 3-minute MP4 video, and 30s social cut.
"""
import argparse
import base64
import concurrent.futures
import json
import math
import os
import random
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
FILM_HTML = ROOT / "marketing" / "motion" / "pcrp-film.html"
VO_DIR = ROOT / "marketing" / "motion" / "vo_clips"
AUDIO_WAV = ROOT / "marketing" / "motion" / "soundtrack-180s.wav"
OUT_MP4 = ROOT / "marketing" / "PCRP-Encoding-DQA-Tool-Film-3min.mp4"
OUT_SOCIAL_MP4 = ROOT / "marketing" / "PCRP-Encoding-DQA-Tool-Social-30s.mp4"
KEYFRAMES_DIR = ROOT / "marketing" / "keyframes"

DURATION = 180.0


class CDP:
    def __init__(self, ws_url: str):
        u = ws_url.replace("ws://", "")
        host_port, path = u.split("/", 1)
        host, port = host_port.split(":")
        self.s = socket.create_connection((host, int(port)), timeout=60)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {host_port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.s.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(4096)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.id = 0

    def _read_exact(self, n: int) -> bytes:
        while len(self.buf) < n:
            chunk = self.s.recv(65536)
            if not chunk:
                raise EOFError()
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, method: str, params=None) -> dict:
        self.id += 1
        payload = json.dumps({"id": self.id, "method": method, "params": params or {}}).encode()
        mask = os.urandom(4)
        header = bytearray([0x81])
        L = len(payload)
        if L < 126:
            header.append(0x80 | L)
        elif L < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", L))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", L))
        header.extend(mask)
        masked = bytes(b ^ mask[i & 3] for i, b in enumerate(payload))
        self.s.sendall(header + masked)
        while True:
            b1, b2 = self._read_exact(2)
            ln = b2 & 0x7F
            if ln == 126:
                ln = struct.unpack("!H", self._read_exact(2))[0]
            elif ln == 127:
                ln = struct.unpack("!Q", self._read_exact(8))[0]
            if b2 & 0x80:
                m = self._read_exact(4)
                data = bytes(b ^ m[i & 3] for i, b in enumerate(self._read_exact(ln)))
            else:
                data = self._read_exact(ln)
            if (b1 & 0x0F) == 0x8:
                raise EOFError()
            msg = json.loads(data.decode())
            if msg.get("id") == self.id:
                return msg.get("result", {})


def generate_soundtrack_180s(wav_path: Path):
    sr = 44100
    n_samples = int(DURATION * sr)
    left = [0.0] * n_samples
    right = [0.0] * n_samples
    rng = random.Random(42)

    def add_tone(t0, dur, freq, amp, attack=0.012, decay=0.22, pan=0.5, harmonics=(1.0, 0.35, 0.12)):
        i0 = max(0, int(t0 * sr))
        i1 = min(n_samples, int((t0 + dur) * sr))
        gl = math.cos(pan * math.pi * 0.5)
        gr = math.sin(pan * math.pi * 0.5)
        two_pi_f = 2.0 * math.pi * freq / sr
        for i in range(i0, i1):
            dt = (i - i0) / sr
            env = min(1.0, dt / max(0.001, attack)) * math.exp(-dt / max(0.005, decay))
            s = 0.0
            ph = (i - i0) * two_pi_f
            for h_idx, h_amp in enumerate(harmonics, 1):
                s += h_amp * math.sin(ph * h_idx)
            v = amp * env * s
            left[i] += v * gl
            right[i] += v * gr

    def add_pad(t0, t1, freqs, amp, fade_in=1.2, fade_out=1.5):
        i0 = max(0, int(t0 * sr))
        i1 = min(n_samples, int(t1 * sr))
        dur = t1 - t0
        for k, f in enumerate(freqs):
            pan = 0.25 + 0.5 * (k / max(1, len(freqs) - 1))
            gl = math.cos(pan * math.pi * 0.5)
            gr = math.sin(pan * math.pi * 0.5)
            w1 = 2.0 * math.pi * f / sr
            w2 = 2.0 * math.pi * (f * 1.002) / sr
            for i in range(i0, i1):
                dt = (i - i0) / sr
                rem = dur - dt
                env = min(1.0, dt / fade_in) * min(1.0, max(0.0, rem / fade_out))
                s = 0.65 * math.sin(i * w1) + 0.35 * math.sin(i * w2)
                v = (amp / len(freqs)) * env * s
                left[i] += v * gl
                right[i] += v * gr

    def add_click(t0, pan=0.52):
        for offset, amp_scale, f_hi, f_lo in [(0.0, 1.0, 2750.0, 1150.0), (0.046, 0.48, 2100.0, 920.0)]:
            i0 = max(0, int((t0 + offset) * sr))
            i1 = min(n_samples, int((t0 + offset + 0.028) * sr))
            gl = math.cos(pan * math.pi * 0.5)
            gr = math.sin(pan * math.pi * 0.5)
            for i in range(i0, i1):
                dt = (i - i0) / sr
                env = math.exp(-dt / 0.0042)
                body = 0.6 * math.sin(2.0 * math.pi * f_hi * dt) + 0.4 * math.sin(2.0 * math.pi * f_lo * dt)
                snap = 0.35 * math.sin(2.0 * math.pi * 5100.0 * dt) * math.exp(-dt / 0.0015)
                v = 0.24 * amp_scale * env * (body + snap)
                left[i] += v * gl
                right[i] += v * gr

    def add_key_clack(t0, pitch_var=1.0, pan=0.48):
        i0 = max(0, int(t0 * sr))
        i1 = min(n_samples, int((t0 + 0.022) * sr))
        gl = math.cos(pan * math.pi * 0.5)
        gr = math.sin(pan * math.pi * 0.5)
        f1 = 1480.0 * pitch_var
        f2 = 3300.0 * pitch_var
        for i in range(i0, i1):
            dt = (i - i0) / sr
            env = math.exp(-dt / 0.0035)
            v = 0.14 * env * (0.65 * math.sin(2.0 * math.pi * f1 * dt) + 0.35 * math.sin(2.0 * math.pi * f2 * dt))
            left[i] += v * gl
            right[i] += v * gr

    def add_whoosh(t0, dur=0.36, f_start=160.0, f_end=640.0, amp=0.10):
        i0 = max(0, int(t0 * sr))
        i1 = min(n_samples, int((t0 + dur) * sr))
        ph = 0.0
        for i in range(i0, i1):
            dt = (i - i0) / sr
            u = dt / dur
            env = math.sin(u * math.pi) ** 1.4
            f = f_start + (f_end - f_start) * (u ** 1.2)
            ph += 2.0 * math.pi * f / sr
            pan = 0.3 + 0.4 * u
            gl = math.cos(pan * math.pi * 0.5)
            gr = math.sin(pan * math.pi * 0.5)
            shimmer = 0.7 * math.sin(ph) + 0.3 * math.sin(ph * 1.5 + 0.4)
            v = amp * env * shimmer
            left[i] += v * gl
            right[i] += v * gr

    def add_alert_ping(t0, freq=880.0, pan=0.62):
        add_tone(t0, 0.22, freq, 0.11, attack=0.003, decay=0.065, pan=pan, harmonics=(1.0, 0.25))
        add_tone(t0 + 0.075, 0.28, freq * 1.25, 0.12, attack=0.003, decay=0.085, pan=pan, harmonics=(1.0, 0.2))

    def add_chime(t0, notes=(523.25, 659.25, 783.99, 1046.50), amp=0.095):
        for idx, f in enumerate(notes):
            add_tone(t0 + idx * 0.055, 0.55, f, amp, attack=0.004, decay=0.18, pan=0.35 + 0.1 * idx, harmonics=(1.0, 0.4, 0.15))

    scene_pads = [
        (0.0, 14.0, [155.56, 196.00, 233.08, 293.66, 349.23], 0.065),          # Eb Maj9
        (14.0, 28.0, [116.54, 146.83, 174.61, 220.00, 261.63], 0.060),         # Bb Maj7
        (28.0, 44.0, [87.31, 130.81, 174.61, 220.00, 261.63, 329.63], 0.060),  # F Maj9
        (44.0, 58.0, [103.83, 155.56, 207.65, 261.63, 311.13], 0.058),         # Ab Maj7
        (58.0, 74.0, [130.81, 155.56, 196.00, 233.08, 293.66], 0.058),         # Cm9
        (74.0, 90.0, [98.00, 146.83, 196.00, 233.08, 293.66], 0.058),          # Gm7
        (90.0, 106.0, [155.56, 196.00, 233.08, 293.66], 0.058),                 # Eb Maj7
        (106.0, 126.0, [116.54, 146.83, 174.61, 220.00, 261.63, 349.23], 0.058),# Bb Maj9
        (126.0, 142.0, [87.31, 130.81, 174.61, 220.00, 261.63], 0.058),         # F Maj7
        (142.0, 158.0, [103.83, 155.56, 207.65, 261.63, 311.13, 349.23], 0.058),# Ab Maj9
        (158.0, 171.0, [155.56, 196.00, 233.08, 293.66, 349.23, 466.16], 0.068),# Eb Maj9 Resolving
        (171.0, 180.0, [77.78, 155.56, 196.00, 233.08, 293.66, 349.23, 466.16], 0.080), # Hero Finale Eb Maj
    ]
    for t0, t1, freqs, amp in scene_pads:
        add_pad(t0, t1, freqs, amp)

    # Corporate Rhythmic Acoustic Pulse (Executive forward momentum)
    for pulse_idx in range(0, int(DURATION * 0.5)):
        tp = pulse_idx * 2.0
        add_tone(tp, 0.14, 65.41, 0.040, attack=0.004, decay=0.09, pan=0.5, harmonics=(1.0, 0.25))
        if pulse_idx % 2 == 1:
            add_tone(tp + 1.0, 0.05, 1250.0, 0.012, attack=0.002, decay=0.015, pan=0.55, harmonics=(1.0,))

    # Affirmative Corporate Two-Tone Chimes on Transitions
    corporate_chimes = [14.0, 28.0, 44.0, 58.0, 74.0, 90.0, 106.0, 126.0, 142.0, 158.0, 171.0]
    for ct in corporate_chimes:
        add_tone(ct, 0.45, 587.33, 0.060, attack=0.003, decay=0.14, pan=0.45, harmonics=(1.0, 0.35, 0.1))
        add_tone(ct + 0.10, 0.65, 880.00, 0.070, attack=0.003, decay=0.22, pan=0.55, harmonics=(1.0, 0.35, 0.1))

    click_times = [
        16.8, 17.0, 21.0, 23.2,
        29.5, 31.0, 32.5, 41.2,
        49.4, 51.8,
        58.4, 71.5,
        74.4,
        90.4,
        106.4, 110.0, 112.0, 114.2, 116.4, 118.6, 120.8,
        126.4,
        142.4, 152.0,
        161.2, 162.4, 165.2,
    ]
    for idx, ct in enumerate(click_times):
        add_click(ct, pan=0.45 + 0.1 * (idx % 3))

    for k in range(10):
        add_key_clack(35.5 + k * 0.16, pitch_var=0.94 + 0.12 * rng.random(), pan=0.46)
    for k in range(22):
        add_key_clack(107.2 + k * 0.095, pitch_var=0.92 + 0.16 * rng.random(), pan=0.44)

    whoosh_times = [0.15, 14.0, 28.0, 29.5, 31.0, 32.5, 44.0, 58.0, 74.0, 90.0, 106.0, 126.0, 142.0, 158.0, 171.0]
    for wt in whoosh_times:
        add_whoosh(wt, dur=0.35, f_start=150.0, f_end=620.0, amp=0.085)

    alert_times = [2.2, 3.4, 4.6, 62.0, 77.5, 84.5, 93.0, 116.4, 118.6, 120.8, 131.0, 146.0]
    for idx, at in enumerate(alert_times):
        add_alert_ping(at, freq=820.0 + (idx % 3) * 60.0, pan=0.38 + 0.24 * (idx % 2))

    chime_times = [23.2, 41.2, 71.5, 112.0, 114.2, 152.0, 161.2, 162.4, 165.2, 171.5]
    for ct in chime_times:
        add_chime(ct)

    for t_tick in range(127, 141):
        add_tone(float(t_tick), 0.06, 1350.0, 0.035, attack=0.001, decay=0.018, pan=0.5, harmonics=(1.0,))

    vo_schedule = [
        ("vo_01.wav", 0.5),
        ("vo_02.wav", 14.3),
        ("vo_03.wav", 28.3),
        ("vo_04.wav", 44.3),
        ("vo_05.wav", 58.3),
        ("vo_06.wav", 74.3),
        ("vo_07.wav", 90.3),
        ("vo_08.wav", 106.3),
        ("vo_09.wav", 126.3),
        ("vo_10.wav", 142.3),
        ("vo_11.wav", 158.3),
        ("vo_12.wav", 171.2),
    ]
    vo_gain = 0.90
    for fname, t_start in vo_schedule:
        clip_path = VO_DIR / fname
        if not clip_path.exists():
            raise FileNotFoundError(f"Missing voiceover clip: {clip_path}")
        with wave.open(str(clip_path), "rb") as vf:
            n_frames = vf.getnframes()
            raw_bytes = vf.readframes(n_frames)
            samples = struct.unpack(f"<{n_frames}h", raw_bytes)
            i0 = int(t_start * sr)
            for k, s_int in enumerate(samples):
                idx = i0 + k
                if 0 <= idx < n_samples:
                    v = (s_int / 32768.0) * vo_gain
                    left[idx] = left[idx] * 0.72 + v
                    right[idx] = right[idx] * 0.72 + v

    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        buf = bytearray(n_samples * 4)
        for i in range(n_samples):
            l = math.tanh(left[i] * 1.05) * 0.94
            r = math.tanh(right[i] * 1.05) * 0.94
            struct.pack_into("<hh", buf, i * 4, int(l * 32767), int(r * 32767))
        wf.writeframes(buf)


def launch_chrome_cdp(port: int):
    user_dir = tempfile.mkdtemp(prefix=f"pcrp_w_{port}_")
    html_url = FILM_HTML.resolve().as_uri()
    chrome = subprocess.Popen(
        [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--mute-audio",
            f"--remote-debugging-port={port}",
            f"--user-data-dir={user_dir}",
            "--window-size=1920,1080",
            "--force-device-scale-factor=1",
            html_url,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    ws_url = None
    for _ in range(80):
        try:
            targets = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json").read().decode())
            pages = [t for t in targets if t.get("type") == "page"]
            if pages:
                ws_url = pages[0]["webSocketDebuggerUrl"]
                break
        except Exception:
            pass
        time.sleep(0.1)
    if not ws_url:
        chrome.terminate()
        raise RuntimeError(f"Could not connect to Chrome CDP on port {port}")

    cdp = CDP(ws_url)
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 1920, "height": 1080, "deviceScaleFactor": 1, "mobile": False})
    for _ in range(80):
        r = cdp.send("Runtime.evaluate", {"expression": "Boolean(window.__ready)", "returnByValue": True})
        if r.get("result", {}).get("value"):
            break
        time.sleep(0.05)
    return chrome, user_dir, cdp


def render_chunk(args_tuple):
    worker_id, f_start, f_end, fps, chunk_mp4_str = args_tuple
    port = 9260 + worker_id
    chrome, user_dir, cdp = launch_chrome_cdp(port)
    try:
        ff_cmd = [
            "/opt/homebrew/bin/ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "image2pipe", "-vcodec", "mjpeg", "-framerate", str(fps), "-i", "-",
            "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
            chunk_mp4_str,
        ]
        ff = subprocess.Popen(ff_cmd, stdin=subprocess.PIPE)
        t0 = time.time()
        count = f_end - f_start
        for idx, f_idx in enumerate(range(f_start, f_end)):
            t_sec = f_idx / fps
            cdp.send("Runtime.evaluate", {"expression": f"window.seek({t_sec:.5f})"})
            shot = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 94})
            ff.stdin.write(base64.b64decode(shot["data"]))
            if (idx + 1) % 150 == 0 or (idx + 1) == count:
                el = time.time() - t0
                print(f"  [Worker {worker_id}] {idx+1}/{count} frames ({t_sec:.1f}s) - {(idx+1)/max(0.01,el):.1f} fps", flush=True)
        ff.stdin.close()
        ff.wait()
        return chunk_mp4_str
    finally:
        chrome.terminate()
        shutil.rmtree(user_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="Parallel Render PCRP 3-Minute Motion Graphics Film")
    parser.add_argument("--keyframes-only", action="store_true", help="Only render keyframes and exit")
    parser.add_argument("--force-audio", action="store_true", help="Force regeneration of 180s voiceover+SFX soundtrack")
    parser.add_argument("--fps", type=int, default=30, help="Frames per second (default: 30)")
    parser.add_argument("--workers", type=int, default=6, help="Parallel Chrome workers (default: 6)")
    args = parser.parse_args()

    if not args.keyframes_only:
        if args.force_audio or not AUDIO_WAV.exists():
            print(f"1/4 Mixing {DURATION}s stereo soundtrack (Filipina VO + Clicks/SFX + Score) -> {AUDIO_WAV.name}...", flush=True)
            generate_soundtrack_180s(AUDIO_WAV)
        else:
            print(f"1/4 Using existing soundtrack -> {AUDIO_WAV.name} ({AUDIO_WAV.stat().st_size / 1024 / 1024:.1f} MB)", flush=True)

    print("2/4 Capturing 12 high-resolution keyframes across all system architecture acts...", flush=True)
    KEYFRAMES_DIR.mkdir(parents=True, exist_ok=True)
    chrome, user_dir, cdp = launch_chrome_cdp(9255)
    try:
        kf_scenes = [
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
        for fname, kt in kf_scenes:
            cdp.send("Runtime.evaluate", {"expression": f"window.seek({kt:.4f})"})
            shot = cdp.send("Page.captureScreenshot", {"format": "png"})
            (KEYFRAMES_DIR / fname).write_bytes(base64.b64decode(shot["data"]))
            print(f"  ✓ Saved {fname} (t={kt}s)", flush=True)
    finally:
        chrome.terminate()
        shutil.rmtree(user_dir, ignore_errors=True)

    if args.keyframes_only:
        print("Keyframes rendered successfully! Skipping video encode.")
        return

    fps = args.fps
    total_frames = int(DURATION * fps)
    n_workers = args.workers
    chunk_dir = Path(tempfile.mkdtemp(prefix="pcrp_chunks_"))
    frames_per_worker = total_frames // n_workers

    tasks = []
    for w in range(n_workers):
        f0 = w * frames_per_worker
        f1 = total_frames if w == n_workers - 1 else (w + 1) * frames_per_worker
        chunk_path = str(chunk_dir / f"chunk_{w:02d}.mp4")
        tasks.append((w, f0, f1, fps, chunk_path))

    print(f"3/4 Rendering {total_frames} frames ({DURATION}s @ {fps}fps, 1920x1080) across {n_workers} parallel Chrome workers...", flush=True)
    t_start = time.time()
    with concurrent.futures.ProcessPoolExecutor(max_workers=n_workers) as pool:
        chunk_files = list(pool.map(render_chunk, tasks))

    print(f"4/4 Muxing {n_workers} video chunks + stereo Filipina voiceover soundtrack -> {OUT_MP4.name}...", flush=True)
    concat_txt = chunk_dir / "concat.txt"
    concat_txt.write_text("\n".join(f"file '{p}'" for p in chunk_files) + "\n")
    subprocess.run(
        [
            "/opt/homebrew/bin/ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(concat_txt),
            "-i", str(AUDIO_WAV),
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
            str(OUT_MP4),
        ],
        check=True,
    )
    shutil.rmtree(chunk_dir, ignore_errors=True)
    total_el = time.time() - t_start
    print(f"✓ Master 3-minute film rendered in {total_el:.1f}s -> {OUT_MP4} ({OUT_MP4.stat().st_size / 1024 / 1024:.1f} MB)", flush=True)


if __name__ == "__main__":
    main()
