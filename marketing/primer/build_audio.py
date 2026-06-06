#!/usr/bin/env python3
"""
Builds the primer narration track + per-scene timings for the Remotion film.

Reads marketing/primer/script.json, synthesises each scene's narration with
Microsoft Edge TTS (the warm en-US-JennyNeural voice the app uses for its
reels, at a soothing slow rate), pads each clip with a gentle lead-in / tail
silence, and concatenates everything into ONE voiceover track. Also writes
timings.json so the Remotion composition (video-factory/Primer.tsx) holds each
scene for exactly its narration length — visuals stay in sync without Remotion
ever touching the audio file (we mux it on after the silent render).

Outputs:
    public/marketing/primer-vo.mp3        (concatenated narration)
    marketing/primer/timings.json         ({ total, scenes:[{id, seconds}] })
"""

from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
WORK = HERE / "_work"
WORK.mkdir(exist_ok=True)

SCRIPT = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
VOICE = SCRIPT.get("voice", "en-US-JennyNeural")
RATE = SCRIPT.get("rate", "-8%")
PITCH = SCRIPT.get("pitch", "-1Hz")

LEAD = 0.5   # calm breath before each scene's narration
TAIL = 0.8   # let the last word land before the next scene

VO_OUT = ROOT / "public" / "marketing" / "primer-vo.mp3"
TIMINGS_OUT = HERE / "timings.json"


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", str(path),
    ])
    return float(json.loads(out)["format"]["duration"])


async def synth(text: str, out: Path) -> None:
    await edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH).save(str(out))


def pad_clip(narr: Path, out: Path) -> None:
    """Prepend LEAD and append TAIL silence, re-encode to a uniform mp3."""
    subprocess.check_call([
        "ffmpeg", "-y",
        "-f", "lavfi", "-t", f"{LEAD}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-i", str(narr),
        "-f", "lavfi", "-t", f"{TAIL}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
        "-map", "[a]", "-c:a", "libmp3lame", "-b:a", "192k", str(out),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


async def main() -> None:
    scenes = SCRIPT["scenes"]
    padded: list[Path] = []
    timings = []
    for sc in scenes:
        sid = sc["id"]
        narr = WORK / f"{sid}.mp3"
        if not narr.exists():
            print(f"  TTS  {sid}")
            await synth(sc["narration"], narr)
        dur = ffprobe_duration(narr)
        pclip = WORK / f"{sid}_padded.mp3"
        pad_clip(narr, pclip)
        padded.append(pclip)
        seconds = round(LEAD + dur + TAIL, 3)
        timings.append({"id": sid, "seconds": seconds})
        print(f"  PAD  {sid}  {seconds:.2f}s")

    # Concatenate every padded clip into one voiceover track.
    listf = WORK / "vo_concat.txt"
    listf.write_text("\n".join(f"file '{p.as_posix()}'" for p in padded) + "\n", encoding="utf-8")
    VO_OUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.check_call([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listf),
        "-c:a", "libmp3lame", "-b:a", "192k", str(VO_OUT),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    total = round(sum(t["seconds"] for t in timings), 3)
    TIMINGS_OUT.write_text(json.dumps({"total": total, "scenes": timings}, indent=2), encoding="utf-8")
    vo_dur = ffprobe_duration(VO_OUT)
    print(f"Done: {VO_OUT}  (vo {vo_dur:.1f}s, timings total {total:.1f}s = {total/60:.1f} min)")


if __name__ == "__main__":
    asyncio.run(main())
