# Marketing collateral

Public-facing artefacts for investors, product managers, clinical
advisors, and distribution partners. Everything in this folder is
**regenerable from source** — copy + numbers + visuals are version
controlled, not hand-built.

## Files

| File | What it is | How to regenerate |
| --- | --- | --- |
| [`INDEPENDENCE_AUDIT.md`](INDEPENDENCE_AUDIT.md) | Audit confirming the engine has no dependency on the operator's Mac or on Cursor. Lists every cron, secret, and workflow and what runs where. | Edit in place; no build step. |
| [`pitch-deck/Intimacy-and-Sex-Therapy-Library-Pitch.pptx`](pitch-deck/Intimacy-and-Sex-Therapy-Library-Pitch.pptx) | 14-slide investor / PM deck. Problem → why-now → solution → architecture → market → competition → traction → economics → roadmap → team → ask. | `python3 marketing/pitch-deck/build_deck.py` |
| [`pitch-video/Intimacy-and-Sex-Therapy-Library-Pitch.mp4`](pitch-video/Intimacy-and-Sex-Therapy-Library-Pitch.mp4) | ~4-minute narrated explainer (1920×1080 H.264). Same voice as the app's published reels — Microsoft Edge TTS, `en-US-JennyNeural`. | `python3 marketing/pitch-video/build_video.py` |

## Why these formats

- **`.pptx`, not Google Slides** — investors and PMs already have
  PowerPoint / Keynote. No login wall, no permissions request, no
  "please share with this address" friction. Open it, present it.
- **`.mp4`, not a YouTube link** — uploads cleanly into Notion, email,
  Slack, and a deal-room data room. Plays in any browser. No tracking
  pixels, no recommended-videos sidebar.

## Reproducibility contract

Everything is regenerable from the two Python scripts in this folder.
The scripts are also the **source of truth for messaging** — if a
number changes (e.g. AASECT-certified therapist counts) you change it
in `build_deck.py` and `build_video.py`, re-run, and both artefacts
update in lockstep.

### One-time setup

```sh
pip3 install --user python-pptx edge-tts Pillow
# ffmpeg must be on PATH — installed via Homebrew or your distro's package
# manager. The script will refuse to run otherwise.
```

### Rebuild both artefacts

```sh
python3 marketing/pitch-deck/build_deck.py
python3 marketing/pitch-video/build_video.py
```

The video build caches narration MP3s in `pitch-video/_work/` so that
re-running after a copy-only change to the deck doesn't re-synthesise
audio. Delete `_work/` to force a clean rebuild.

## Notes for editors

- The deck and the video share the **same brand palette** as the live
  site (cream + ink + coral + teal + plum). If the site rebrands,
  update the constants at the top of both Python scripts so the deck
  and video stay coherent.
- Numbers cited in both artefacts are pinned to public sources
  (Statista 2024, NFHS-5, Durex Global Sex Survey, AASECT directory,
  MoSPI 2023). Update the inline source notes when the underlying
  reports refresh.
- The video uses Edge TTS's `en-US-JennyNeural` voice at `-2%` rate.
  This matches the voice the app's autonomous engine uses for its
  published reels — so the pitch literally sounds like the product.
