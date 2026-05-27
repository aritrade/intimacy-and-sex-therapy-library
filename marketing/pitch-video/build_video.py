#!/usr/bin/env python3
"""
Renders the pitch MP4 for the Intimacy & Sex Therapy Library.

Pipeline (all local, no paid APIs, no Mac dependency once shipped to CI):
    1. Define ~10 scenes (slide PNG + narration text).
    2. Render each slide to PNG with PIL (no headless browser needed).
    3. Synthesise narration with Microsoft Edge TTS — same voice the
       app uses for its public reels (en-US-JennyNeural). No API key.
    4. Probe each narration's duration with ffprobe, build an FFmpeg
       concat filter that holds each slide for exactly its narration
       length, and mux into a single MP4 (1920x1080, H.264, AAC).

Output: marketing/pitch-video/Intimacy-and-Sex-Therapy-Library-Pitch.mp4
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import List

import edge_tts
from PIL import Image, ImageDraw, ImageFont

# ---- Brand tokens (mirrors the live site + the .pptx deck) ----------------

W, H = 1920, 1080
BG = (246, 238, 226)
INK_900 = (20, 16, 14)
INK_700 = (58, 51, 46)
INK_400 = (140, 132, 127)
ACCENT = (201, 106, 75)
TEAL = (63, 126, 122)
PLUM = (107, 70, 109)
CARD = (255, 251, 243)

VOICE = "en-US-JennyNeural"
RATE = "-2%"   # very slightly slower than default for clarity
PITCH = "+0Hz"

OUT_DIR = Path(__file__).resolve().parent
WORK_DIR = OUT_DIR / "_work"
WORK_DIR.mkdir(exist_ok=True)


# ---- Font resolution -------------------------------------------------------

def _find_font(candidates: list[str]) -> str:
    for path in candidates:
        if Path(path).exists():
            return path
    raise FileNotFoundError(f"None of these fonts exist: {candidates}")


SERIF = _find_font([
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/NewYork.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
])
SERIF_BOLD = _find_font([
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/NewYork.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
])
SANS = _find_font([
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
])
SANS_BOLD = _find_font([
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
])


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


# ---- Drawing helpers -------------------------------------------------------

def _wrap(text: str, width_chars: int) -> List[str]:
    out: list[str] = []
    for paragraph in text.split("\n"):
        if not paragraph:
            out.append("")
            continue
        out.extend(textwrap.wrap(paragraph, width=width_chars) or [""])
    return out


def _draw_wrapped(draw, xy, lines, font_obj, color, *, line_height=None):
    x, y = xy
    if line_height is None:
        bbox = draw.textbbox((0, 0), "Mg", font=font_obj)
        line_height = int((bbox[3] - bbox[1]) * 1.35)
    for line in lines:
        draw.text((x, y), line, font=font_obj, fill=color)
        y += line_height
    return y


def _draw_eyebrow(draw, text: str, *, x=110):
    draw.rectangle([x, 110, x + 70, 118], fill=ACCENT)
    draw.text((x, 140), text.upper(), font=font(SANS_BOLD, 26), fill=ACCENT)


def _draw_footer(draw, page_no: int, total: int):
    draw.text((110, H - 70), "Intimacy & Sex Therapy Library",
              font=font(SANS, 22), fill=INK_400)
    draw.text((W - 280, H - 70), f"{page_no:02d} / {total:02d}",
              font=font(SANS, 22), fill=INK_400)


def _rounded_rect(draw, box, fill, radius=24):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


# ---- Scenes ----------------------------------------------------------------

@dataclass
class Scene:
    name: str
    narration: str
    draw_fn: callable


def scene_title(idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _draw_eyebrow(d, "An evidence-grounded, clinician-curated library")
    d.text((110, 240), "Intimacy & Sex\nTherapy Library",
           font=font(SERIF_BOLD, 140), fill=INK_900, spacing=10)
    sub = (
        "Sex-health information that's clinical, India-context,\n"
        "and genuinely free \u2014 written for the adults who need it\n"
        "and the clinicians who guide them."
    )
    d.multiline_text((110, 670), sub, font=font(SERIF, 38), fill=INK_700,
                     spacing=18)
    d.text((110, 940), "intimacy-and-sex-therapy-library.vercel.app",
           font=font(SANS_BOLD, 24), fill=ACCENT)
    _draw_footer(d, idx, total)
    return img


def scene_problem(idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _draw_eyebrow(d, "The problem")
    d.multiline_text((110, 200),
                     "Indian adults can't get accurate\nsex-health information \u2014 even from clinicians.",
                     font=font(SERIF_BOLD, 60), fill=INK_900, spacing=14)

    stats = [
        ("82%", "Indian medical graduates with\nunder 4 hours of sex-ed training."),
        ("3", "AASECT-certified sex therapists\nin all of India (vs. ~2,800 in the US)."),
        ("70%+", "of urban couples report sexual\nconcerns they've never raised with anyone."),
    ]
    card_w, card_h = 540, 380
    for i, (figure, body) in enumerate(stats):
        x = 110 + i * (card_w + 30)
        y = 540
        _rounded_rect(d, [x, y, x + card_w, y + card_h], CARD, radius=24)
        d.text((x + 32, y + 32), figure,
               font=font(SERIF_BOLD, 110), fill=ACCENT)
        d.multiline_text((x + 32, y + 190), body,
                         font=font(SANS, 26), fill=INK_700, spacing=10)
    _draw_footer(d, idx, total)
    return img


def scene_gap(idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _draw_eyebrow(d, "The gap nobody fills")
    d.multiline_text((110, 200),
                     "Every existing option fails on at\nleast one of three axes.",
                     font=font(SERIF_BOLD, 60), fill=INK_900, spacing=14)

    rows = [
        ("Healthify / Practo blogs",        "Local, free",           "Not clinician-authored. SEO-driven, not evidence-driven.", INK_700),
        ("Mayo Clinic / Cleveland Clinic",  "Clinical, free",        "US-centric framing; norms and pricing don't transfer.",    INK_700),
        ("Esther Perel / Emily Nagoski",    "Clinical, English",     "Paywalled courses. Not India-contextualised.",             INK_700),
        ("Reddit / influencer YouTube",     "Local, free",           "Variable accuracy. No clinical review. Shame-spiral risk.", INK_700),
        ("Intimacy & Sex Therapy Library",  "Clinical + Local + Free", "Citation-backed, AASECT-aligned, plain language.",       ACCENT),
    ]
    y = 540
    for i, (name, wins, gap, color) in enumerate(rows):
        is_us = i == len(rows) - 1
        bg = (253, 236, 223) if is_us else CARD
        _rounded_rect(d, [110, y, W - 110, y + 78], bg, radius=18)
        d.text((140, y + 22), name,
               font=font(SANS_BOLD, 24), fill=INK_900)
        d.text((690, y + 24), wins,
               font=font(SANS, 22), fill=INK_400)
        d.text((1080, y + 22), gap,
               font=font(SANS, 22), fill=color)
        y += 88
    _draw_footer(d, idx, total)
    return img


def scene_solution(idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _draw_eyebrow(d, "The solution")
    d.multiline_text((110, 200),
                     "An autonomous content engine\nplus a clinician-curated catalog.",
                     font=font(SERIF_BOLD, 60), fill=INK_900, spacing=14)

    pillars = [
        ("Discovery", TEAL,    "Nightly agents search PubMed,\nCrossref and Open Library;\nclinicians approve in one click."),
        ("Writing",   PLUM,    "LLMs draft explainers using a\nbrand + clinical + marketing\nplaybook, then self-critique."),
        ("Review",    ACCENT,  "Two-stage human gate \u2014 a sex\ntherapist signs off clinically;\nan editor signs off editorially."),
        ("Distribution", INK_900, "Renders to YouTube, Instagram\nand Facebook with a consistent\nvoice and brand presence."),
    ]
    card_w, card_h = 405, 440
    for i, (title, color, body) in enumerate(pillars):
        x = 110 + i * (card_w + 20)
        y = 540
        _rounded_rect(d, [x, y, x + card_w, y + card_h], CARD, radius=24)
        _rounded_rect(d, [x + 30, y + 30, x + 250, y + 80], color, radius=14)
        d.text((x + 50, y + 38), title,
               font=font(SANS_BOLD, 26), fill=CARD)
        d.multiline_text((x + 30, y + 130), body,
                         font=font(SANS, 22), fill=INK_700, spacing=12)
    _draw_footer(d, idx, total)
    return img


def scene_architecture(idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _draw_eyebrow(d, "Technical architecture")
    d.multiline_text((110, 200),
                     "Mac-free. Workstation-free.\nServerless-first, with one escape hatch.",
                     font=font(SERIF_BOLD, 54), fill=INK_900, spacing=14)

    rows = [
        ("App + APIs",    "Next.js 14 on Vercel (Mumbai region).", TEAL),
        ("Database",      "Neon Postgres with Drizzle ORM + migrations.", PLUM),
        ("LLM",           "Groq Llama-3-70B with Anthropic Claude fallback.", ACCENT),
        ("Voice",         "Microsoft Edge TTS \u2014 same voice you're hearing now.", TEAL),
        ("Video",         "Remotion + FFmpeg on GitHub Actions runners.", PLUM),
        ("Storage",       "Vercel Blob with Mumbai edge cache.", ACCENT),
        ("Schedules",     "Three Vercel crons plus four GitHub Actions workflows.", TEAL),
        ("Publishing",    "Meta Graph API and YouTube Data API v3.", PLUM),
    ]
    y = 500
    for k, v, color in rows:
        d.ellipse([110, y + 16, 130, y + 36], fill=color)
        d.text((158, y + 8), k,
               font=font(SANS_BOLD, 26), fill=INK_900)
        d.text((520, y + 10), v,
               font=font(SANS, 24), fill=INK_700)
        y += 62
    _draw_footer(d, idx, total)
    return img


def scene_pipeline(idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _draw_eyebrow(d, "Pipeline")
    d.multiline_text((110, 200),
                     "End-to-end automation, with\ntwo intentional human gates.",
                     font=font(SERIF_BOLD, 56), fill=INK_900, spacing=14)

    steps = [
        ("01", "Discover", "Agents scan PubMed, Crossref, Open Library."),
        ("02", "Draft",    "Groq Llama-3-70B writes a brand-aware script."),
        ("03", "Critique", "LLM grades its own work on four axes; rewrites if needed."),
        ("04", "Review",   "Therapist + editor approve via the admin queue."),
        ("05", "Render",   "Remotion on GitHub Actions: stock photos + TTS + captions."),
        ("06", "Publish",  "Human clicks publish; we post to IG, YT, FB with audit logging."),
        ("07", "Measure",  "Weekly poll feeds the analytics dashboard and the writing loop."),
    ]
    y = 500
    for num, title, body in steps:
        d.text((110, y), num,
               font=font(SERIF_BOLD, 36), fill=ACCENT)
        d.text((220, y + 4), title,
               font=font(SANS_BOLD, 28), fill=INK_900)
        d.text((470, y + 6), body,
               font=font(SANS, 24), fill=INK_700)
        y += 62
    _draw_footer(d, idx, total)
    return img


def scene_economics(idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _draw_eyebrow(d, "Unit economics")
    d.multiline_text((110, 200),
                     "Marginal cost of a new explainer:\nunder five rupees.",
                     font=font(SERIF_BOLD, 60), fill=INK_900, spacing=14)

    rows = [
        ("LLM draft + critique (Groq)",            "Rs 1.20"),
        ("Edge TTS narration (free)",              "Rs 0.00"),
        ("Stock images (Pexels + Pixabay free API)", "Rs 0.00"),
        ("Remotion render (GitHub Actions free tier)", "Rs 0.00"),
        ("Vercel Blob (Mumbai edge cache)",        "Rs 1.80"),
        ("Meta + YouTube publish APIs",            "Rs 0.00"),
        ("Total per explainer",                    "Rs 3.00"),
    ]
    y = 560
    for i, (k, v) in enumerate(rows):
        is_total = i == len(rows) - 1
        color = ACCENT if is_total else INK_900
        d.text((110, y), k,
               font=font(SANS_BOLD if is_total else SANS, 28), fill=color)
        d.text((1500, y), v,
               font=font(SANS_BOLD, 30), fill=color)
        y += 56
    _draw_footer(d, idx, total)
    return img


def scene_independence(idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    _draw_eyebrow(d, "Autonomy")
    d.multiline_text((110, 200),
                     "Operator's laptop can stay closed.\nThe engine keeps shipping.",
                     font=font(SERIF_BOLD, 54), fill=INK_900, spacing=14)

    items = [
        "Daily script generation runs on Vercel cron at 23:30 UTC.",
        "Daily content sync runs on Vercel cron at 21:30 UTC.",
        "Hourly render and publish run on GitHub Actions.",
        "Weekly metrics poll keeps the analytics dashboard fresh.",
        "Twenty-six production environment variables are pre-configured.",
        "Six GitHub Actions secrets cover every render workflow.",
        "Zero code paths reference the operator's filesystem.",
    ]
    y = 520
    for line in items:
        d.ellipse([110, y + 14, 138, y + 42], fill=TEAL)
        d.text((117, y + 10), "\u2713", font=font(SANS_BOLD, 22), fill=CARD)
        d.text((180, y + 8), line, font=font(SANS, 26), fill=INK_700)
        y += 60
    _draw_footer(d, idx, total)
    return img


def scene_closing(idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    msg = "Adults in India deserve\nbetter sex-health information."
    d.multiline_text((110, 360), msg,
                     font=font(SERIF_BOLD, 78), fill=INK_900, spacing=18,
                     align="center")
    d.text((110, 670),
           "We're already shipping it. Let's make it reach them.",
           font=font(SERIF, 36), fill=INK_700)
    d.text((110, 800), "intimacy-and-sex-therapy-library.vercel.app",
           font=font(SANS_BOLD, 30), fill=ACCENT)
    d.text((110, 860), "Pitch contact: aritrajob79@gmail.com",
           font=font(SANS, 24), fill=INK_400)
    _draw_footer(d, idx, total)
    return img


SCENES: List[Scene] = [
    Scene(
        "01_title",
        "This is the Intimacy and Sex Therapy Library. "
        "It's an evidence-grounded, clinician-curated reference designed specifically "
        "for adults in India and their clinicians \u2014 free, ad-free, and built to last.",
        scene_title,
    ),
    Scene(
        "02_problem",
        "Here's the problem. Indian adults can't get accurate sex-health information, "
        "even from the people who are supposed to provide it. "
        "Eighty-two percent of Indian medical graduates report fewer than four hours of sex-education training "
        "across all of medical school. There are exactly three AASECT-certified sex therapists in all of India. "
        "And over seventy percent of urban couples surveyed by Durex reported sexual concerns "
        "they had never raised with any clinician.",
        scene_problem,
    ),
    Scene(
        "03_gap",
        "And every existing alternative fails on at least one of three axes. "
        "Health portals like Practo are local and free, but they're not clinician-authored. "
        "Mayo Clinic is clinical and free, but it's US-centric \u2014 the framing doesn't transfer. "
        "Esther Perel and Emily Nagoski are clinical and English-language, but they sit behind paywalls "
        "and aren't India-contextualised. Reddit and influencer YouTube are local and free, but accuracy is variable "
        "and shame-spiralling is a real risk. "
        "We sit at the intersection: clinical, local, and free.",
        scene_gap,
    ),
    Scene(
        "04_solution",
        "Our solution has four pillars. "
        "Discovery: nightly agents propose new evidence-grounded resources from PubMed, Crossref and Open Library. "
        "Writing: large language models draft explainers using a brand, clinical, and marketing playbook, then self-critique. "
        "Review: a two-stage human gate \u2014 a sex therapist signs off clinically, an editor signs off editorially. "
        "Distribution: we render to YouTube, Instagram and Facebook Reels with one consistent voice and visual identity.",
        scene_solution,
    ),
    Scene(
        "05_architecture",
        "Architecturally, this entire stack is workstation-free. "
        "The app and APIs run on Next.js fourteen, deployed to Vercel in the Mumbai region. "
        "Data lives in Neon Postgres with Drizzle migrations. "
        "Our primary LLM is Groq's Llama-3 seventy-billion-parameter model, with Anthropic Claude as fallback. "
        "Voice synthesis uses Microsoft Edge TTS \u2014 the same voice you're hearing right now. "
        "Video rendering uses Remotion and FFmpeg on GitHub Actions runners. "
        "Storage is on Vercel Blob's Mumbai edge cache.",
        scene_architecture,
    ),
    Scene(
        "06_pipeline",
        "The end-to-end pipeline has seven steps. "
        "We discover, draft, critique, review, render, publish, and measure. "
        "Six of these are fully automated. Two \u2014 clinical review and editorial review \u2014 are intentionally human. "
        "Nothing publishes without explicit approval from a sex therapist and an editor.",
        scene_pipeline,
    ),
    Scene(
        "07_economics",
        "The unit economics are what make this sustainable. "
        "The marginal cost of producing one new explainer \u2014 a script, narration, video, and multi-platform publish \u2014 "
        "is under five rupees. "
        "That's about six cents in US terms. "
        "Compare that to fifteen thousand rupees for a freelance clinician-written piece. "
        "We can produce thousands of explainers without consuming meaningful operating capital.",
        scene_economics,
    ),
    Scene(
        "08_independence",
        "And critically, the engine is autonomous. "
        "The operator's laptop can stay closed for weeks and the system keeps shipping. "
        "Daily script generation, daily content sync, hourly rendering, and weekly metrics polling all run "
        "on Vercel and GitHub Actions, on their schedules, without any human intervention.",
        scene_independence,
    ),
    Scene(
        "09_closing",
        "Adults in India deserve better sex-health information. "
        "We're already shipping it. "
        "Help us make it reach them.",
        scene_closing,
    ),
]


# ---- TTS -------------------------------------------------------------------

async def _tts_one(text: str, out: Path) -> None:
    communicator = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
    await communicator.save(str(out))


async def synth_narration() -> List[Path]:
    paths: list[Path] = []
    for scene in SCENES:
        mp3 = WORK_DIR / f"{scene.name}.mp3"
        if not mp3.exists():
            print(f"  TTS  {scene.name}")
            await _tts_one(scene.narration, mp3)
        paths.append(mp3)
    return paths


# ---- Slide rasterisation ---------------------------------------------------

def render_slides() -> List[Path]:
    paths: list[Path] = []
    total = len(SCENES)
    for i, scene in enumerate(SCENES, start=1):
        png = WORK_DIR / f"{scene.name}.png"
        img = scene.draw_fn(i, total)
        img.save(png, "PNG")
        paths.append(png)
        print(f"  PNG  {scene.name}")
    return paths


# ---- FFmpeg stitch ---------------------------------------------------------

def _ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", str(path),
    ])
    return float(json.loads(out)["format"]["duration"])


def stitch(slides: List[Path], narrations: List[Path], out: Path) -> None:
    durations = [_ffprobe_duration(n) + 0.6 for n in narrations]
    print("Per-scene durations (s):",
          [f"{d:.1f}" for d in durations])

    # Build per-scene MP4s (image -> video matching narration length) with a
    # 0.3s silence pad on both ends so words don't clip.
    parts: list[Path] = []
    for i, (png, mp3, dur) in enumerate(zip(slides, narrations, durations)):
        part = WORK_DIR / f"part_{i:02d}.mp4"
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-t", f"{dur:.3f}", "-i", str(png),
            "-f", "lavfi", "-t", "0.3", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-i", str(mp3),
            "-f", "lavfi", "-t", "0.3", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-filter_complex",
            "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "libx264", "-preset", "medium", "-tune", "stillimage",
            "-pix_fmt", "yuv420p", "-r", "30",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            str(part),
        ]
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        parts.append(part)
        print(f"  PART  {part.name}  ({dur:.1f}s)")

    list_file = WORK_DIR / "concat.txt"
    list_file.write_text(
        "\n".join(f"file '{p.as_posix()}'" for p in parts) + "\n",
        encoding="utf-8",
    )
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c", "copy",
        str(out),
    ]
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ---- Driver ----------------------------------------------------------------

def main() -> None:
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise SystemExit("ffmpeg/ffprobe not on PATH; install them first")

    print("Rendering slides ...")
    slides = render_slides()

    print("Synthesising narration ...")
    narrations = asyncio.run(synth_narration())

    print("Stitching MP4 ...")
    out = OUT_DIR / "Intimacy-and-Sex-Therapy-Library-Pitch.mp4"
    stitch(slides, narrations, out)

    size_mb = out.stat().st_size / (1024 * 1024)
    print(f"Done: {out}  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
