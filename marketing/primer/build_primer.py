#!/usr/bin/env python3
"""
Renders the consumer-facing PRIMER film for the Intimacy & Sex Therapy
Library — the ~5-minute "Watch a 5-minute primer" video embedded on the
homepage hero.

Unlike the investor pitch (marketing/pitch-video/build_video.py), this is a
warm, calm brand film aimed at a nervous first-time visitor. It leads with the
safety + privacy promise ("no shame, no tracking, encrypted, even we can't read
your Vault") and then gently tours every feature, closing on care.

Pipeline (no paid APIs, CI-reproducible — falls back to DejaVu fonts on Linux):
    1. Define ~12 scenes (a Pillow-drawn frame + narration text).
    2. Synthesise narration with Microsoft Edge TTS (en-US-JennyNeural), the
       same warm voice the app uses for its reels, at a soothing slow rate.
    3. Per scene: hold the frame for the narration length with a slow Ken Burns
       push-in (ffmpeg zoompan) + gentle fades, so it feels filmic, not slideish.
    4. Concatenate into one MP4 (1920x1080, H.264, AAC).

Output: public/marketing/primer.mp4   (served at /marketing/primer.mp4)
"""

from __future__ import annotations

import asyncio
import json
import math
import shutil
import subprocess
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Tuple

import edge_tts
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---- Brand tokens (mirror the live site) -----------------------------------

W, H = 1920, 1080
BG = (246, 238, 226)        # warm cream
BG2 = (240, 230, 214)       # slightly deeper cream for the gradient floor
INK_900 = (20, 16, 14)
INK_700 = (58, 51, 46)
INK_400 = (140, 132, 127)
ACCENT = (201, 106, 75)     # coral
TEAL = (63, 126, 122)
PLUM = (107, 70, 109)
CARD = (255, 251, 243)
WHITE = (255, 255, 255)

VOICE = "en-US-JennyNeural"
RATE = "-8%"        # soothing, unhurried — slower than the pitch video's -2%
PITCH = "-1Hz"

ROOT = Path(__file__).resolve().parents[2]
OUT_FILE = ROOT / "public" / "marketing" / "primer.mp4"
WORK_DIR = Path(__file__).resolve().parent / "_work"
WORK_DIR.mkdir(exist_ok=True)
OUT_FILE.parent.mkdir(parents=True, exist_ok=True)

FPS = 30


# ---- Font resolution -------------------------------------------------------

def _find_font(candidates: List[str]) -> str:
    for path in candidates:
        if Path(path).exists():
            return path
    raise FileNotFoundError(f"None of these fonts exist: {candidates}")


SERIF = _find_font([
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
])
SERIF_BOLD = _find_font([
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
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

def _mix(a: Tuple[int, int, int], b: Tuple[int, int, int], t: float) -> Tuple[int, int, int]:
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def base_canvas() -> Image.Image:
    """Warm vertical-gradient cream background with soft coloured glows."""
    img = Image.new("RGB", (W, H), BG)
    top = Image.new("RGB", (1, H))
    for y in range(H):
        top.putpixel((0, y), _mix(BG, BG2, y / H))
    img = top.resize((W, H))

    # Soft radial glows on a blurred overlay (plum top-right, teal bottom-left).
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W - 760, -360, W + 200, 460], fill=(36, 22, 38))
    gd.ellipse([-360, H - 540, 520, H + 360], fill=(16, 34, 32))
    gd.ellipse([W // 2 - 180, -460, W // 2 + 520, 320], fill=(34, 16, 10))
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    img = Image.blend(img, Image.composite(glow, img, Image.new("L", (W, H), 26)), 1.0)
    return img


def _rounded(d, box, fill, radius=28, outline=None, width=1):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def _shadow_card(img, box, radius=28, fill=CARD):
    """Card with a soft drop shadow, composited onto img."""
    x0, y0, x1, y1 = box
    pad = 60
    layer = Image.new("RGBA", (img.width, img.height), (0, 0, 0, 0))
    sd = ImageDraw.Draw(layer)
    sd.rounded_rectangle([x0, y0 + 10, x1, y1 + 16], radius=radius, fill=(30, 22, 16, 60))
    layer = layer.filter(ImageFilter.GaussianBlur(22))
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))
    d = ImageDraw.Draw(img)
    _rounded(d, box, fill, radius=radius, outline=(232, 222, 208), width=2)
    return d


def eyebrow(d, text, x=130, y=120, color=ACCENT):
    d.rounded_rectangle([x, y, x + 54, y + 8], radius=4, fill=color)
    d.text((x + 70, y - 11), text.upper(), font=font(SANS_BOLD, 26), fill=color)


def title(d, text, x=130, y=190, size=82, color=INK_900):
    d.multiline_text((x, y), text, font=font(SERIF_BOLD, size), fill=color, spacing=14)


def subtitle(d, text, x=130, y=None, size=34, color=INK_700, width=54):
    # Collapse any manual line breaks first, then wrap once at `width` so we
    # never double-wrap into ragged short lines.
    flat = " ".join(text.split())
    lines = textwrap.wrap(flat, width=width) or [""]
    d.multiline_text((x, y), "\n".join(lines), font=font(SERIF, size), fill=color, spacing=14)


def pill(d, x, y, text, color=TEAL, fill=None):
    f = font(SANS_BOLD, 24)
    tw = d.textbbox((0, 0), text, font=f)[2]
    w = tw + 56
    _rounded(d, [x, y, x + w, y + 50], fill or (255, 255, 255), radius=25, outline=color, width=2)
    d.ellipse([x + 22, y + 21, x + 30, y + 29], fill=color)
    d.text((x + 40, y + 12), text, font=f, fill=INK_700)
    return x + w + 18


def footer(d):
    d.text((130, H - 82), "Intimacy & Sex Therapy Library", font=font(SANS, 22), fill=INK_400)
    # Right-anchored well inside the title-safe margin so the Ken Burns zoom
    # never crops the URL.
    d.text((1792, H - 82), "intimacy-and-sex-therapy-library.vercel.app",
           font=font(SANS_BOLD, 22), fill=ACCENT, anchor="ra")


def lock_glyph(d, cx, cy, color, scale=1.0):
    s = scale
    body = [cx - 26 * s, cy - 6 * s, cx + 26 * s, cy + 34 * s]
    _rounded(d, body, color, radius=int(8 * s))
    d.arc([cx - 18 * s, cy - 34 * s, cx + 18 * s, cy + 8 * s], 180, 360, fill=color, width=int(7 * s))
    d.ellipse([cx - 5 * s, cy + 6 * s, cx + 5 * s, cy + 16 * s], fill=CARD)


def feature_cards(img, items, y=560, card_h=380, top_accent=True):
    """Row of up to 3 cards: (accent, heading, body, glyph_fn?)."""
    d = ImageDraw.Draw(img)
    n = len(items)
    gap = 34
    margin = 130
    card_w = (W - 2 * margin - (n - 1) * gap) // n
    for i, item in enumerate(items):
        accent, heading, body = item[0], item[1], item[2]
        glyph = item[3] if len(item) > 3 else None
        x = margin + i * (card_w + gap)
        dd = _shadow_card(img, [x, y, x + card_w, y + card_h])
        if top_accent:
            dd.rounded_rectangle([x, y, x + card_w, y + 12], radius=6, fill=accent)
        gx, gy = x + 44, y + 70
        if glyph:
            glyph(dd, gx + 18, gy + 6, accent)
        else:
            dd.ellipse([gx, gy, gx + 44, gy + 44], fill=accent)
        dd.text((x + 44, y + 138), heading, font=font(SERIF_BOLD, 36), fill=INK_900)
        lines = textwrap.wrap(body, width=26)
        dd.multiline_text((x + 44, y + 200), "\n".join(lines),
                          font=font(SANS, 25), fill=INK_700, spacing=12)


# ---- Scene frames ----------------------------------------------------------

def scene_open_centered(img):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([W // 2 - 27, 280, W // 2 + 27, 288], radius=4, fill=ACCENT)
    d.text((W // 2, 312), "A SAFE PLACE TO ASK", font=font(SANS_BOLD, 28),
           fill=ACCENT, anchor="ma")
    d.multiline_text((W // 2, 380), "Some questions are\nhard to ask out loud.",
                     font=font(SERIF_BOLD, 112), fill=INK_900, spacing=20,
                     anchor="ma", align="center")
    d.multiline_text((W // 2, 760),
                     "Here, you can ask them — honestly,\nand without shame.",
                     font=font(SERIF, 42), fill=INK_700, spacing=16,
                     anchor="ma", align="center")
    return img


def scene_comfort(img):
    d = ImageDraw.Draw(img)
    d.multiline_text((W // 2, 320), "Whatever brought you here,\nyou're not the only one.",
                     font=font(SERIF_BOLD, 96), fill=INK_900, spacing=18,
                     anchor="ma", align="center")
    d.multiline_text((W // 2, 660),
                     "Most adults carry a question about intimacy they've never\n"
                     "felt safe enough to ask. That's exactly who this is for.",
                     font=font(SERIF, 38), fill=INK_700, spacing=16,
                     anchor="ma", align="center")
    return img


def scene_paths(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "Guided paths")
    title(d, "Not sure where to start?\nFollow a path.", size=74)
    feature_cards(img, [
        (TEAL, "Couples reset", "Rebuild closeness, one honest conversation at a time."),
        (PLUM, "Anxiety & ED", "Evidence-based steps, minus the panic and the pressure."),
        (ACCENT, "Affirming care", "LGBTQ+ and asexual-inclusive journeys, at your own pace."),
    ], y=520, card_h=400)
    footer(d)
    return img


def scene_what(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "What this is")
    title(d, "A calm, clinician-curated\nspace for honest answers.", size=74)
    subtitle(d, "Evidence-based help on intimacy, desire and relationships — "
                "for adults in India, and the people who care for them.",
             y=480, size=34, width=50)
    x = 130
    for label, col in [("Clinician-reviewed", TEAL), ("India-aware", PLUM),
                       ("Always free", ACCENT), ("Ad-free", TEAL)]:
        x = pill(d, x, 700, label, color=col)
    footer(d)
    return img


def scene_privacy(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "First, a promise")
    title(d, "What you explore here\nstays yours.", size=74)
    feature_cards(img, [
        (TEAL, "No tracking", "No tracking cookies, no selling your data, no following you around the web.",
         lambda dd, x, y, c: dd.ellipse([x - 22, y - 22, x + 22, y + 22], outline=c, width=6) or dd.line([x - 14, y + 14, x + 14, y - 14], fill=c, width=6)),
        (PLUM, "Encrypted by default", "Your conversations with our companion are encrypted at rest.",
         lambda dd, x, y, c: lock_glyph(dd, x, y, c)),
        (ACCENT, "Zero-knowledge Vault", "Turn on Vault mode and even we cannot read what you write.",
         lambda dd, x, y, c: lock_glyph(dd, x, y, c, 1.1)),
    ], y=520, card_h=400)
    footer(d)
    return img


def scene_library(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "Read & explore")
    title(d, "A living library, in\nplain language.", size=74)
    subtitle(d, "Articles, books and research on desire, relationships, the "
                "asexual spectrum and LGBTQ+ care. Search any topic and an AI "
                "guide gathers trustworthy reading for you.",
             y=470, size=32, width=58)
    # search bar mock
    box = [130, 720, 1180, 796]
    dd = _shadow_card(img, box, radius=38, fill=WHITE)
    dd.ellipse([162, 742, 194, 774], outline=INK_400, width=4)
    dd.line([190, 770, 206, 786], fill=INK_400, width=4)
    dd.text((232, 738), "How do I talk to my partner about low desire?",
            font=font(SANS, 28), fill=INK_400)
    _rounded(dd, [1010, 732, 1156, 784], ACCENT, radius=26)
    dd.text((1042, 742), "Search", font=font(SANS_BOLD, 26), fill=WHITE)
    footer(d)
    return img


def _chat_bubble(d, x, y, w, text, *, me=False):
    f = font(SANS, 26)
    lines = textwrap.wrap(text, width=42)
    h = 36 + len(lines) * 36
    fill = ACCENT if me else WHITE
    tcol = WHITE if me else INK_700
    _rounded(d, [x, y, x + w, y + h], fill, radius=26,
             outline=None if me else (232, 222, 208), width=2)
    d.multiline_text((x + 28, y + 20), "\n".join(lines), font=f, fill=tcol, spacing=10)
    return y + h + 22


def scene_companion(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "Sahay · your companion")
    title(d, "When you'd rather\ntalk it through.", size=70)
    subtitle(d, "Warm, India-aware and never judgmental — and always a "
                "companion, never a replacement for a clinician.",
             y=440, size=32, width=52)
    yb = 660
    yb = _chat_bubble(d, 130, yb, 820, "I don't know how to bring this up with my partner.")
    _chat_bubble(d, 360, yb, 940,
                 "That takes courage to even name. Let's find words that feel "
                 "true to you — and I'll point you to a clinician who can help.",
                 me=True)
    footer(d)
    return img


def scene_chat(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "Cite-everything assistant")
    title(d, "Straight answers,\nwith receipts.", size=74)
    subtitle(d, "Our assistant answers only from the curated, clinician-reviewed\n"
                "library — a citation on every claim. If it doesn't know,\n"
                "it says so, instead of guessing.",
             y=470, size=32)
    box = [130, 700, 1480, 866]
    dd = _shadow_card(img, box, radius=28, fill=WHITE)
    dd.multiline_text((168, 736),
                      "Performance anxiety is common and highly treatable. Evidence\n"
                      "supports sensate-focus exercises and CBT-based approaches.",
                      font=font(SANS, 27), fill=INK_700, spacing=12)
    for i, lab in enumerate(["1", "2", "3"]):
        x = 168 + i * 70
        _rounded(dd, [x, 822, x + 52, 858], TEAL, radius=18)
        dd.text((x + 19, 828), lab, font=font(SANS_BOLD, 24), fill=WHITE)
    dd.text((400, 826), "Sources cited from the reviewed library",
            font=font(SANS, 22), fill=INK_400)
    footer(d)
    return img


def scene_assess(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "Private self-assessments")
    title(d, "Quietly wondering\nwhere you stand?", size=74)
    subtitle(d, "Validated tools clinicians use — scored on your device, kept "
                "to yourself, and never shared. A gentle reflection helps you "
                "make sense of them.",
             y=470, size=32, width=58)
    box = [130, 720, 980, 900]
    dd = _shadow_card(img, box, radius=28, fill=WHITE)
    dd.text((168, 748), "Your reflection over time", font=font(SANS_BOLD, 26), fill=INK_900)
    pts = [864, 850, 832, 820, 806, 796, 788]   # gentle upward trend, inside card
    prev = None
    for i, p in enumerate(pts):
        x = 210 + i * 100
        if prev:
            dd.line([prev[0], prev[1], x, p], fill=TEAL, width=6)
        dd.ellipse([x - 9, p - 9, x + 9, p + 9], fill=TEAL)
        prev = (x, p)
    lock_glyph(dd, 916, 786, ACCENT, 0.75)
    dd.text((876, 822), "Private", font=font(SANS_BOLD, 20), fill=ACCENT)
    footer(d)
    return img


def _pin(d, x, y, color):
    d.ellipse([x - 22, y - 30, x + 22, y + 14], fill=color)
    d.polygon([(x - 14, y + 6), (x + 14, y + 6), (x, y + 34)], fill=color)
    d.ellipse([x - 8, y - 16, x + 8, y], fill=CARD)


def scene_findhelp(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "Find help")
    title(d, "When you're ready\nfor a human.", size=74)
    feature_cards(img, [
        (TEAL, "Clinicians near you", "Sex therapists and counsellors, surfaced with care and context.", _pin),
        (PLUM, "Affirming spaces", "LGBTQ+ and asexual-friendly communities — you belong here.", _pin),
        (ACCENT, "Real options", "Curated, flagged when needed, refreshed so they stay trustworthy.", _pin),
    ], y=520, card_h=400)
    footer(d)
    return img


def scene_myths(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "Unlearn the myths")
    title(d, "Replace shame with\ncalm, sourced truth.", size=72)
    subtitle(d, "A quick, playful \u201cmyth or fact\u201d turns misinformation into\n"
                "understanding — one gentle card at a time.",
             y=460, size=33)
    box = [130, 640, 1180, 884]
    dd = _shadow_card(img, box, radius=28, fill=WHITE)
    dd.text((168, 676), "\u201cYou should always be in the mood for your partner.\u201d",
            font=font(SERIF, 34), fill=INK_900)
    _rounded(dd, [168, 760, 360, 836], (253, 236, 223), radius=22)
    dd.text((196, 780), "Myth", font=font(SANS_BOLD, 28), fill=ACCENT)
    _rounded(dd, [392, 760, 560, 836], (224, 240, 236), radius=22)
    dd.text((420, 780), "Fact", font=font(SANS_BOLD, 28), fill=TEAL)
    dd.text((600, 782), "Desire naturally ebbs and flows. That's healthy.",
            font=font(SANS, 26), fill=INK_700)
    footer(d)
    return img


def scene_trust(img):
    d = ImageDraw.Draw(img)
    eyebrow(d, "Why you can trust it")
    title(d, "Reviewed by clinicians.\nHonest about its limits.", size=68)
    items = [
        "Every resource is screened by an advisory board of qualified clinicians before it goes live.",
        "A public model card spells out exactly what our AI can — and cannot — do.",
        "Sources are cited. Crisis routing is India-first. Nothing here is a substitute for professional care.",
    ]
    y = 520
    for line in items:
        d.ellipse([130, y + 4, 170, y + 44], fill=TEAL)
        d.text((140, y + 6), "\u2713", font=font(SANS_BOLD, 28), fill=WHITE)
        lines = textwrap.wrap(line, width=64)
        d.multiline_text((200, y), "\n".join(lines), font=font(SANS, 30),
                         fill=INK_700, spacing=12)
        y += 56 + (len(lines) - 1) * 42
    footer(d)
    return img


def scene_care(img):
    d = ImageDraw.Draw(img)
    d.multiline_text((W // 2, 320), "This isn't about clicks.\nIt's about you.",
                     font=font(SERIF_BOLD, 100), fill=INK_900, spacing=18,
                     anchor="ma", align="center")
    d.multiline_text((W // 2, 660),
                     "If a moment ever feels heavier than information can hold,\n"
                     "we gently route you to crisis support that can help — right now.",
                     font=font(SERIF, 38), fill=INK_700, spacing=16,
                     anchor="ma", align="center")
    return img


def scene_close(img):
    d = ImageDraw.Draw(img)
    d.multiline_text((W // 2, 330), "No shame. No tracking.\nNo cost.",
                     font=font(SERIF_BOLD, 116), fill=INK_900, spacing=18,
                     anchor="ma", align="center")
    d.text((W // 2, 660), "Honest, caring help — here whenever you're ready.",
           font=font(SERIF, 40), fill=INK_700, anchor="ma")
    d.text((W // 2, 800), "Intimacy & Sex Therapy Library",
           font=font(SANS_BOLD, 30), fill=ACCENT, anchor="ma")
    d.text((W // 2, 856), "intimacy-and-sex-therapy-library.vercel.app",
           font=font(SANS, 26), fill=INK_400, anchor="ma")
    return img


# ---- Scene table -----------------------------------------------------------

@dataclass
class Scene:
    name: str
    narration: str
    draw_fn: Callable[[Image.Image], Image.Image]


SCENES: List[Scene] = [
    Scene("01_open",
          "Some questions are hard to ask out loud. About desire. About intimacy. "
          "About the parts of being human we're quietly taught to keep to ourselves. "
          "This is a place to ask them \u2014 honestly, and without shame.",
          scene_open_centered),
    Scene("02_what",
          "This is the Intimacy and Sex Therapy Library. A calm, clinician-curated space "
          "for evidence-based answers about intimacy, desire and relationships \u2014 "
          "written for adults in India, and the people who care for them. Always free. Never judgmental.",
          scene_what),
    Scene("03_comfort",
          "And whatever brought you here, you're not the only one. Most adults carry a question "
          "about intimacy they've never felt safe enough to ask out loud. That's exactly who this is for.",
          scene_comfort),
    Scene("04_privacy",
          "Before anything else, a promise. We don't sell your data, and we don't follow you "
          "with tracking cookies. Your conversations are encrypted. And with our zero-knowledge "
          "Vault mode, even we cannot read them. What you explore here stays yours.",
          scene_privacy),
    Scene("04_library",
          "Start with the library \u2014 articles, books and research on desire, relationships, "
          "the asexual spectrum and LGBTQ-plus care. Search any topic, and an AI guide gathers "
          "trustworthy reading for you, all in plain language.",
          scene_library),
    Scene("06_paths",
          "Not sure where to start? Follow a guided path \u2014 a couples reset, navigating a "
          "sexless marriage, anxiety and erectile concerns, or LGBTQ-plus affirming care. "
          "Step by step, and always at your own pace.",
          scene_paths),
    Scene("05_companion",
          "When you'd rather talk it through, there's Sahay \u2014 a warm, India-aware companion. "
          "She listens without judgment, helps you find the words, and always points you toward "
          "real, qualified care. A companion, never a replacement for a clinician.",
          scene_companion),
    Scene("06_chat",
          "Want a straight answer with receipts? Our cite-everything assistant replies only from "
          "the curated, clinician-reviewed library, with a citation on every claim. And if it "
          "doesn't know, it tells you \u2014 instead of guessing.",
          scene_chat),
    Scene("07_assess",
          "Quietly wondering where you stand? Take a private self-assessment \u2014 the same "
          "validated tools clinicians use. Your results are scored on your device, kept to yourself, "
          "and never shared. A gentle reflection helps you make sense of them.",
          scene_assess),
    Scene("08_findhelp",
          "And when you're ready for a human, the Find Help hub points you to clinicians and "
          "communities \u2014 including affirming, LGBTQ-plus and asexual-friendly spaces. "
          "Real options, chosen with care.",
          scene_findhelp),
    Scene("09_myths",
          "We also make unlearning feel good. A quick, playful myth-or-fact gently replaces shame "
          "and misinformation with calm, sourced truth \u2014 one card at a time.",
          scene_myths),
    Scene("10_trust",
          "Everything here is reviewed by an advisory board of qualified clinicians before it goes live. "
          "And we're honest about our limits \u2014 a public model card spells out exactly what our "
          "AI can, and cannot, do.",
          scene_trust),
    Scene("11_care",
          "Because this was never about clicks. It's about your wellbeing. If a moment ever feels "
          "heavier than information can hold, we route you \u2014 gently, and India-first \u2014 "
          "to crisis support that can help right now.",
          scene_care),
    Scene("12_close",
          "No shame. No tracking. No cost. Just honest, caring help, here whenever you're ready. "
          "This is the Intimacy and Sex Therapy Library.",
          scene_close),
]


# ---- TTS -------------------------------------------------------------------

async def _tts_one(text: str, out: Path) -> None:
    communicator = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
    await communicator.save(str(out))


async def synth_narration() -> List[Path]:
    paths: List[Path] = []
    for scene in SCENES:
        mp3 = WORK_DIR / f"{scene.name}.mp3"
        if not mp3.exists():
            print(f"  TTS  {scene.name}")
            await _tts_one(scene.narration, mp3)
        paths.append(mp3)
    return paths


# ---- Frames ----------------------------------------------------------------

def render_frames() -> List[Path]:
    paths: List[Path] = []
    for scene in SCENES:
        png = WORK_DIR / f"{scene.name}.png"
        img = base_canvas()
        img = scene.draw_fn(img)
        img.save(png, "PNG")
        paths.append(png)
        print(f"  PNG  {scene.name}")
    return paths


# ---- FFmpeg stitch with Ken Burns + fades ----------------------------------

def _ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", str(path),
    ])
    return float(json.loads(out)["format"]["duration"])


def stitch(frames: List[Path], narrations: List[Path], out: Path) -> None:
    parts: List[Path] = []
    for i, (png, mp3) in enumerate(zip(frames, narrations)):
        dur = _ffprobe_duration(mp3) + 1.1   # breathing room each side
        frames_n = max(2, int(round(dur * FPS)))
        # Alternate a slow push-in / pull-back for variety; upscale first to
        # keep the zoompan motion smooth (reduces pixel jitter).
        push_in = (i % 2 == 0)
        if push_in:
            zexpr = "min(zoom+0.00020,1.05)"
        else:
            zexpr = "if(eq(on,0),1.05,max(zoom-0.00020,1.0))"
        fade_out_st = max(0.1, dur - 0.6)
        vf = (
            f"scale=3000:-1,"
            f"zoompan=z='{zexpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={frames_n}:s={W}x{H}:fps={FPS},"
            f"fade=t=in:st=0:d=0.6,fade=t=out:st={fade_out_st:.3f}:d=0.6,"
            f"format=yuv420p"
        )
        part = WORK_DIR / f"part_{i:02d}.mp4"
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-t", f"{dur:.3f}", "-i", str(png),
            "-f", "lavfi", "-t", "0.55", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-i", str(mp3),
            "-f", "lavfi", "-t", "0.55", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-filter_complex",
            f"[0:v]{vf}[v];[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]",
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-shortest",
            str(part),
        ]
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        parts.append(part)
        print(f"  PART  {part.name}  ({dur:.1f}s)")

    list_file = WORK_DIR / "concat.txt"
    list_file.write_text("\n".join(f"file '{p.as_posix()}'" for p in parts) + "\n",
                         encoding="utf-8")
    subprocess.check_call([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c", "copy", "-movflags", "+faststart", str(out),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> None:
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise SystemExit("ffmpeg/ffprobe not on PATH; install them first")
    print("Rendering frames ...")
    frames = render_frames()
    # Poster = the opening frame ("Some questions are hard to ask out loud").
    poster = OUT_FILE.parent / "primer-poster.jpg"
    Image.open(frames[0]).convert("RGB").save(poster, quality=88)
    print(f"  POSTER  {poster}")
    print("Synthesising narration ...")
    narrations = asyncio.run(synth_narration())
    print("Stitching primer ...")
    stitch(frames, narrations, OUT_FILE)
    total = _ffprobe_duration(OUT_FILE)
    size_mb = OUT_FILE.stat().st_size / (1024 * 1024)
    print(f"Done: {OUT_FILE}  ({size_mb:.1f} MB, {total/60:.1f} min)")


if __name__ == "__main__":
    main()
