#!/usr/bin/env python3
"""spec.json → finished 9:16 promo MP4.

Runs inside the Higgsfield sandbox, which provides ffmpeg, higgsedit, faster-whisper, Pillow and
node + Playwright. It does NOT generate anything: every asset (screens, b-roll, voice-over) is an
already-generated URL in the spec, so a render costs zero credits and can be repeated freely.

    python3 render.py spec.json --out out.mp4          # full render
    python3 render.py spec.json --plan                 # align only: print the cut timeline

See README.md for the spec format.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

from align import Aligner, Word

ENGINE_DIR = Path(__file__).resolve().parent
W, H, FPS = 1080, 1920, 30
BEAT_TYPES = {"broll", "screen", "slide", "end"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_BRAND = {
    "background": "#0d0f14",
    "gradient": ["#10204a", "#14171f", "#3d2166"],
    "font": "Heebo",
    "captionColor": "#ffffff",
    "subColor": "#e6e0ff",
    "dir": "rtl",
}
MIN_BEAT = 0.5          # seconds; shorter cuts read as glitches
BLANK_LUMA = 0.02       # mean luminance below this = a blank checkpoint frame
MIN_LANG_PROB = 0.8


class SpecError(ValueError):
    pass


def run(cmd: list[str], cwd: Path | None = None) -> None:
    subprocess.run(cmd, check=True, cwd=cwd)


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def ext_of(ref: str) -> str:
    return Path(ref.split("?", 1)[0]).suffix.lower()


# ---------------------------------------------------------------- spec


def load_spec(path: Path) -> dict:
    spec = json.loads(path.read_text(encoding="utf-8"))
    errors: list[str] = []
    for key in ("name", "voice", "assets", "beats"):
        if key not in spec:
            errors.append(f"missing top-level '{key}'")
    if errors:
        raise SpecError("; ".join(errors))

    voice = spec["voice"]
    if not voice.get("script"):
        errors.append("voice.script is required")
    if not voice.get("file"):
        errors.append("voice.file is empty: generate the voice-over first (see spec 'generate')")
    if not 0.5 <= float(spec.get("speed", 1.0)) <= 2.0:
        errors.append("speed must be between 0.5 and 2.0")

    assets, beats = spec["assets"], spec["beats"]
    if len(beats) < 2:
        errors.append("need at least 2 beats")
    for i, b in enumerate(beats):
        where = f"beat #{i} ({b.get('type')})"
        if b.get("type") not in BEAT_TYPES:
            errors.append(f"{where}: type must be one of {sorted(BEAT_TYPES)}")
            continue
        ref = assets.get(b.get("asset", ""))
        if ref is None:
            errors.append(f"{where}: asset '{b.get('asset')}' is not in assets")
            continue
        if not ref:
            errors.append(f"{where}: asset '{b['asset']}' has no URL yet: generate it first (see spec 'generate')")
            continue
        ext = ext_of(ref)
        if ext not in VIDEO_EXT | IMAGE_EXT:
            errors.append(f"{where}: unsupported asset extension '{ext}'")
        if b["type"] in ("screen", "slide") and ext not in IMAGE_EXT:
            errors.append(f"{where}: screen/slide assets must be images")
        if b["type"] == "screen" and not b.get("caption"):
            errors.append(f"{where}: screen beats need a caption")
        if b["type"] == "end" and i != len(beats) - 1:
            errors.append(f"{where}: the end beat must be last")
        if 0 < i and b["type"] != "end" and "cue" not in b and "at" not in b:
            errors.append(f"{where}: needs 'cue' (a script word) or 'at' (seconds)")
    if beats and beats[-1].get("type") != "end":
        errors.append("the last beat must be of type 'end'")
    if errors:
        raise SpecError("invalid spec:\n  - " + "\n  - ".join(errors))

    spec["brand"] = {**DEFAULT_BRAND, **spec.get("brand", {})}
    return spec


# ---------------------------------------------------------------- inputs


def fetch(ref: str, dest: Path) -> Path:
    if dest.exists():
        return dest
    if ref.startswith(("http://", "https://")):
        with urllib.request.urlopen(ref, timeout=120) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
    else:
        shutil.copyfile(ref, dest)
    return dest


def fetch_assets(spec: dict, work: Path) -> dict[str, Path]:
    adir = work / "assets"
    adir.mkdir(parents=True, exist_ok=True)
    files: dict[str, Path] = {}
    for key, ref in spec["assets"].items():
        path = fetch(ref, adir / f"{key}{ext_of(ref)}")
        if path.suffix == ".webp":  # higgsedit prefers PNG stills
            png = path.with_suffix(".png")
            if not png.exists():
                run(["convert", str(path), str(png)])
            path = png
        files[key] = path.resolve()
    return files


def transcribe(vo: Path) -> tuple[list[Word], str, float]:
    from faster_whisper import WhisperModel  # sandbox-only dependency

    model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, info = model.transcribe(str(vo), word_timestamps=True)
    words = [Word(w.word.strip(), w.start) for s in segments for w in (s.words or [])]
    return words, info.language, info.language_probability


# ---------------------------------------------------------------- timeline


def build_timeline(spec: dict, words: list[Word], vo_dur: float) -> tuple[list[dict], float]:
    voice = spec["voice"]
    lead = float(voice.get("leadIn", 0.3))
    aligner = Aligner(voice["script"], words)
    beats = spec["beats"]

    starts: list[float] = []
    for i, b in enumerate(beats):
        if "at" in b:
            t = float(b["at"])
        elif i == 0:
            t = 0.0
        elif "cue" in b:
            t = aligner.cue_time(b["cue"]) + lead
        else:  # end beat without a cue: right after the voice-over finishes
            t = vo_dur + lead + 0.1
        starts.append(round(t, 3))

    timeline = []
    for i, b in enumerate(beats):
        end = starts[i] + float(b.get("hold", 3.4)) if i == len(beats) - 1 else starts[i + 1]
        dur = round(end - starts[i], 3)
        if dur < MIN_BEAT:
            raise SpecError(f"beat #{i} ({b['type']}, cue {b.get('cue')!r}) lasts {dur}s < {MIN_BEAT}s; "
                            "check the cue order or merge beats")
        timeline.append({**b, "start": starts[i], "dur": dur})
    return timeline, aligner.match_ratio


# ---------------------------------------------------------------- render


EDIT_TEMPLATE = r"""
// Generated by video/engine/render.py from a spec. Do not edit; change the spec and re-render.
const D = __DATA__;
const { W, H } = D;
const SCRIM = { kind: "linear", angle: 90, stops: [
  { offset: 0, color: "#000000", opacity: 0 }, { offset: 1, color: "#000000", opacity: 0.7 } ] };
const BG = { kind: "linear", angle: 160,
  stops: D.gradient.map((color, i, all) => ({ offset: i / (all.length - 1), color })) };
const CAP_X = Math.round((W - 1000) / 2);
const CAP_IN = [
  { property: "offsetY", from: 36, to: 0, duration: 0.45, easing: "house" },
  { property: "opacity", from: 0, to: 1, duration: 0.3 } ];
const KEN = (d) => [{ property: "scale", from: 1.0, to: 1.05, duration: d, easing: "linear" }];
const CAROUSEL = (d) => [
  { property: "offsetX", from: -160, to: 0, duration: 0.35, easing: "house" },
  { property: "opacity", from: 0, to: 1, duration: 0.2 },
  { property: "scale", from: 1.04, to: 1.0, duration: d, easing: "ease-out" } ];
const DEVICE = (d) => [
  { property: "scale", from: 0.92, to: 1.0, duration: d, easing: "ease-out" },
  { property: "opacity", from: 0, to: 1, duration: 0.25 } ];
const END = (d) => [
  { property: "scale", from: 1.0, to: 1.06, duration: d, easing: "linear" },
  { property: "opacity", from: 0, to: 1, duration: 0.35 } ];

export default async ({ project }) => {
  const p = await project({ dir: "proj", size: `${W}x${H}`, fps: D.fps, background: D.background });
  const a = {};
  for (const [key, file] of Object.entries(D.files)) a[key] = await p.add(file);

  const full = (b, animate) => b.video
    ? <media file={a[b.asset]} x={0} y={0} width={W} height={H} fit="cover" trimStart={b.trim} muted animate={animate} />
    : <media file={a[b.asset]} x={0} y={0} width={W} height={H} fit="cover" animate={animate} />;
  const withLowerThird = (b, base) => (
    <frame width={W} height={H} layout="none">
      {base}
      <rect x={0} y={1100} width={W} height={820} fill={SCRIM} />
      <media file={a[b.cap]} x={CAP_X} y={1400} width={1000} height={300} animate={CAP_IN} />
    </frame>);
  const bare = (base) => <frame width={W} height={H} layout="none">{base}</frame>;
  const device = (b) => (
    <frame width={W} height={H} layout="none">
      <rect x={0} y={0} width={W} height={H} fill={BG} />
      <media file={a[b.asset]} x={150} y={450} width={780} height={1387} fit="cover" radius={54}
        shadow={{ x: 0, y: 30, blur: 90, color: "rgba(0,0,0,0.7)" }} animate={DEVICE(b.dur)} />
      <media file={a[b.cap]} x={CAP_X} y={120} width={1000} height={300} animate={CAP_IN} />
    </frame>);

  for (const b of D.beats) {
    let node;
    if (b.type === "screen") node = device(b);
    else if (b.type === "end") node = bare(full(b, END(b.dur)));
    else {
      const base = full(b, b.type === "broll" ? KEN(b.dur) : CAROUSEL(b.dur));
      node = b.cap ? withLowerThird(b, base) : bare(base);
    }
    p.compose(node, { at: b.start, dur: b.dur });
  }
  for (const t of D.checkpoints) await p.frame(t, `renders/check_${t.toFixed(2)}.png`);
};
"""


def render_captions(spec: dict, timeline: list[dict], work: Path) -> dict[int, Path]:
    items = [{"name": f"cap{i}", "text": b["caption"], "sub": b.get("sub", "")}
             for i, b in enumerate(timeline) if b.get("caption")]
    if not items:
        return {}
    brand = spec["brand"]
    cfg = work / "captions.json"
    cfg.write_text(json.dumps({"font": brand["font"], "color": brand["captionColor"],
                               "subColor": brand["subColor"], "dir": brand["dir"], "items": items},
                              ensure_ascii=False), encoding="utf-8")
    cdir = work / "captions"
    run(["node", str(ENGINE_DIR / "captions.cjs"), str(cfg), str(cdir)])
    return {int(it["name"][3:]): (cdir / f"{it['name']}.png").resolve() for it in items}


def write_edit(spec: dict, timeline: list[dict], files: dict[str, Path], caps: dict[int, Path],
               work: Path) -> Path:
    used = {b["asset"] for b in timeline}
    data_files = {k: str(v) for k, v in files.items() if k in used}
    beats = []
    for i, b in enumerate(timeline):
        beat = {"type": b["type"], "asset": b["asset"], "start": b["start"], "dur": b["dur"],
                "video": files[b["asset"]].suffix in VIDEO_EXT, "trim": float(b.get("trim", 0.3))}
        if i in caps:
            beat["cap"] = f"cap{i}"
            data_files[f"cap{i}"] = str(caps[i])
        beats.append(beat)
    brand = spec["brand"]
    data = {"W": W, "H": H, "fps": FPS, "background": brand["background"], "gradient": brand["gradient"],
            "files": data_files, "beats": beats,
            "checkpoints": [round(b["start"] + b["dur"] / 2, 2) for b in timeline]}
    edit = work / "edit.jsx"
    edit.write_text(EDIT_TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False)), encoding="utf-8")
    return edit


def blank_checkpoints(work: Path) -> list[str]:
    from PIL import Image, ImageStat  # sandbox-only dependency

    blank = []
    for png in sorted((work / "proj" / "renders").glob("check_*.png")):
        mean = ImageStat.Stat(Image.open(png).convert("L")).mean[0] / 255
        if mean < BLANK_LUMA:
            blank.append(png.name)
    return blank


def mux(silent: Path, vo: Path, lead: float, speed: float, out: Path) -> None:
    # Pad/trim the voice to exactly the picture's length. An open-ended apad + -shortest never
    # terminates once the video also runs through the filter graph (the speed-up path).
    length = duration(silent)
    ms = int(round(lead * 1000))
    audio = (f"[1:a]adelay={ms}|{ms},loudnorm=I=-14:TP=-1.5:LRA=9,"
             f"apad=whole_dur={length:.3f},atrim=0:{length:.3f}[a]")
    common = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(out)]
    if speed == 1.0:
        run(["ffmpeg", "-v", "error", "-y", "-i", str(silent), "-i", str(vo), "-filter_complex", audio,
             "-map", "0:v", "-map", "[a]", "-c:v", "copy", *common])
        return
    graph = f"{audio};[0:v]setpts=PTS/{speed},fps={FPS}[v];[a]atempo={speed}[af]"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(silent), "-i", str(vo), "-filter_complex", graph,
         "-map", "[v]", "-map", "[af]", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-pix_fmt", "yuv420p", *common])


# ---------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", type=Path)
    ap.add_argument("--out", type=Path, help="output MP4 (required unless --plan)")
    ap.add_argument("--work", type=Path, help="working dir (default: ./work-<spec name>)")
    ap.add_argument("--plan", action="store_true", help="only align and print the timeline")
    ap.add_argument("--speed", type=float, help="override the spec speed (e.g. 1.0 for a parity check)")
    ap.add_argument("--skip-lang-check", action="store_true")
    args = ap.parse_args()
    if not args.plan and not args.out:
        ap.error("--out is required unless --plan")

    spec = load_spec(args.spec)
    work = (args.work or Path(f"work-{spec['name']}")).resolve()
    work.mkdir(parents=True, exist_ok=True)
    voice = spec["voice"]
    lead = float(voice.get("leadIn", 0.3))
    speed = args.speed if args.speed is not None else float(spec.get("speed", 1.0))

    vo = fetch(voice["file"], work / f"vo{ext_of(voice['file']) or '.mp3'}")
    words, lang, prob = transcribe(vo)
    expected = voice.get("lang", "he")
    if not args.skip_lang_check and (lang != expected or prob < MIN_LANG_PROB):
        raise SpecError(f"voice-over detected as '{lang}' ({prob:.2f}), expected '{expected}' "
                        f">= {MIN_LANG_PROB}: wrong take or bad TTS engine")
    timeline, ratio = build_timeline(spec, words, duration(vo))
    total = timeline[-1]["start"] + timeline[-1]["dur"]

    print(f"voice: {lang} {prob:.2f} | script↔transcript match {ratio:.0%} | "
          f"{total:.2f}s → {total / speed:.2f}s at ×{speed}")
    for i, b in enumerate(timeline):
        print(f"  #{i:<2} {b['start']:6.2f}–{b['start'] + b['dur']:6.2f}  {b['type']:<6} {b['asset']:<8} "
              f"{b.get('cue', '') or ''}  {b.get('caption', '').replace(chr(10), ' / ')}")
    if args.plan:
        return 0

    files = fetch_assets(spec, work)
    caps = render_captions(spec, timeline, work)
    edit = write_edit(spec, timeline, files, caps, work)
    shutil.rmtree(work / "proj", ignore_errors=True)
    run(["higgsedit", "build", edit.name], cwd=work)
    blank = blank_checkpoints(work)
    run(["higgsedit", "render", "proj", "--out", "renders/silent.mp4"], cwd=work)
    mux(work / "proj" / "renders" / "silent.mp4", vo, lead, speed, args.out.resolve())

    report = {"spec": spec["name"], "out": str(args.out), "duration": duration(args.out.resolve()),
              "voice": {"lang": lang, "prob": round(prob, 3), "match": round(ratio, 3)},
              "blank_checkpoints": blank,
              "timeline": [{k: b[k] for k in ("type", "asset", "start", "dur")} for b in timeline]}
    (work / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("out", "duration", "voice", "blank_checkpoints")}, ensure_ascii=False))
    return 1 if blank else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (SpecError, subprocess.CalledProcessError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(2)
