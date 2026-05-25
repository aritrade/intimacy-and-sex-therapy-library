#!/usr/bin/env python3
"""
SadTalker runner for the GitHub Actions avatar-render workflow.

Three subcommands:

  download-checkpoints  Fetch the SadTalker model weights from
                        HuggingFace Hub into a local directory.
                        Cached between runs via actions/cache.

  render                Download the persona portrait + voiceover
                        from their HTTPS URLs, invoke SadTalker's
                        inference.py, and write the result MP4 to
                        out/avatar.mp4.

  upload-to-blob        Upload an MP4 to Vercel Blob at the
                        deterministic path renders/<draft_id>/avatar.mp4
                        and write the resulting HTTPS URL to
                        out/blob_url.txt for the workflow summary.

Why one Python script (not three small ones):
  - Keeps the GH Actions workflow YAML thin and easy to read.
  - Single import-time validation of the env / paths.
  - The three commands share the same logging + error formatting.

This script is only ever run on the GH Actions runner. It is *not*
imported from anywhere in the Next.js app — the Vercel side talks to
this pipeline by triggering the workflow and polling the resulting
Blob URL. See lib/social/avatar.ts (github-actions provider) for the
caller.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Checkpoint URL list, mirrored from upstream OpenTalker/SadTalker's
# scripts/download_models.sh. Using direct GitHub Release URLs (not the
# HuggingFace mirror) keeps us closer to what upstream tests against and
# avoids any HF repo-rename / quota surprises.
CHECKPOINT_FILES = [
    # SadTalker v0.0.2 main weights.
    ("checkpoints/mapping_00109-model.pth.tar",
     "https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/mapping_00109-model.pth.tar"),
    ("checkpoints/mapping_00229-model.pth.tar",
     "https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/mapping_00229-model.pth.tar"),
    ("checkpoints/SadTalker_V0.0.2_256.safetensors",
     "https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/SadTalker_V0.0.2_256.safetensors"),
    ("checkpoints/SadTalker_V0.0.2_512.safetensors",
     "https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/SadTalker_V0.0.2_512.safetensors"),
    # GFPGAN face enhancer + face detection / parsing weights.
    ("gfpgan/weights/alignment_WFLW_4HG.pth",
     "https://github.com/xinntao/facexlib/releases/download/v0.1.0/alignment_WFLW_4HG.pth"),
    ("gfpgan/weights/detection_Resnet50_Final.pth",
     "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth"),
    ("gfpgan/weights/GFPGANv1.4.pth",
     "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth"),
    ("gfpgan/weights/parsing_parsenet.pth",
     "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth"),
]

VERCEL_BLOB_API = "https://blob.vercel-storage.com"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def log(msg: str) -> None:
    print(f"[sadtalker_runner] {msg}", flush=True)


def die(msg: str, code: int = 1) -> None:
    print(f"::error ::{msg}", flush=True)
    sys.exit(code)


def download(url: str, dest: Path, chunk: int = 1 << 16) -> Path:
    """Stream a URL to disk with a tiny progress indicator."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"downloading {url} -> {dest}")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        size_hint = int(r.headers.get("content-length", "0") or 0)
        written = 0
        last_pct = -1
        with open(dest, "wb") as f:
            for c in r.iter_content(chunk_size=chunk):
                if not c:
                    continue
                f.write(c)
                written += len(c)
                if size_hint > 0:
                    pct = int(written * 100 / size_hint)
                    if pct >= last_pct + 10:
                        log(f"  {pct:3d}%  ({written:,} / {size_hint:,} bytes)")
                        last_pct = pct
    log(f"  done ({written:,} bytes)")
    return dest


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Subcommand: download-checkpoints
# ---------------------------------------------------------------------------


def cmd_download_checkpoints(args: argparse.Namespace) -> int:
    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)

    log(f"downloading {len(CHECKPOINT_FILES)} checkpoint files to {dest}")
    failed: list[str] = []
    for rel, url in CHECKPOINT_FILES:
        target = dest / rel
        if target.exists() and target.stat().st_size > 0:
            log(f"  skip {rel} (already present, {target.stat().st_size:,} bytes)")
            continue
        try:
            download(url, target)
        except Exception as e:  # noqa: BLE001
            # Continue on per-file failure so a single mirror outage
            # doesn't wipe the whole download. We surface at the end.
            log(f"  WARN failed to fetch {rel} from {url}: {e}")
            failed.append(rel)
    if failed:
        die(f"failed to download {len(failed)} checkpoint(s): {', '.join(failed)}")
    log("checkpoints ready")
    return 0


# ---------------------------------------------------------------------------
# Subcommand: render
# ---------------------------------------------------------------------------


def cmd_render(args: argparse.Namespace) -> int:
    sadtalker_src = Path(args.sadtalker_src).resolve()
    ckpts = Path(args.checkpoints).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if not sadtalker_src.exists():
        die(f"--sadtalker-src not found: {sadtalker_src}")
    if not ckpts.exists():
        die(f"--checkpoints not found: {ckpts}")
    inference_py = sadtalker_src / "inference.py"
    if not inference_py.exists():
        die(f"sadtalker_src/inference.py missing — did the clone fail? ({inference_py})")

    # Stage portrait + audio next to the inference script.
    work = out_dir / "work"
    work.mkdir(parents=True, exist_ok=True)
    portrait_path = work / "portrait.png"
    audio_path = work / "voiceover.mp3"
    download(args.portrait_url, portrait_path)
    download(args.audio_url, audio_path)

    # SadTalker expects checkpoints to live INSIDE its source tree under
    # ./checkpoints and ./gfpgan/weights. We symlink rather than copy to
    # keep the cache directory authoritative.
    for sub in ("checkpoints", "gfpgan/weights"):
        target = sadtalker_src / sub
        src = ckpts / sub
        if target.exists() or target.is_symlink():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.symlink_to(src)
        log(f"symlinked {target} -> {src}")

    # Result directory inside SadTalker's tree (its inference.py writes
    # under --result_dir then nests a timestamped folder).
    result_dir = out_dir / "sadtalker_out"
    result_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "inference.py",
        "--driven_audio", str(audio_path),
        "--source_image", str(portrait_path),
        "--result_dir", str(result_dir),
        "--still",
        "--preprocess", "full",
        "--enhancer", "gfpgan",
        # --size 256 keeps inference fast (~6 min for 30s on CPU); 512
        # roughly triples render time for a modest quality bump.
        "--size", "256",
        # CPU only — the GH Actions runner has no GPU.
        "--cpu",
    ]
    log("running SadTalker:")
    log("  " + " ".join(cmd))
    started = time.time()
    proc = subprocess.run(cmd, cwd=str(sadtalker_src))
    elapsed = time.time() - started
    log(f"SadTalker exited rc={proc.returncode} after {elapsed:.1f}s")
    if proc.returncode != 0:
        die(f"SadTalker inference failed (rc={proc.returncode})", proc.returncode)

    # SadTalker writes results/<timestamp>/<source>##<audio>_enhanced.mp4
    # or similar. Find the newest MP4 and copy to out/avatar.mp4.
    mp4s = sorted(result_dir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime)
    if not mp4s:
        die(f"SadTalker produced no MP4 in {result_dir}")
    chosen = mp4s[-1]
    final = out_dir / "avatar.mp4"
    final.write_bytes(chosen.read_bytes())
    log(f"avatar mp4: {final}  ({final.stat().st_size:,} bytes, sha256={sha256_of(final)[:12]})")
    return 0


# ---------------------------------------------------------------------------
# Subcommand: upload-to-blob
# ---------------------------------------------------------------------------


def vercel_blob_put(token: str, pathname: str, body: bytes, content_type: str) -> str:
    """
    Upload bytes to Vercel Blob via the public REST API.
    Mirrors what @vercel/blob's put() does, minus the SDK weight.

    Returns the resulting public HTTPS URL.
    """
    # The Vercel Blob upload API is:
    #   PUT https://blob.vercel-storage.com/<pathname>?...
    # Auth: Bearer <token>. The token's store determines the host portion
    # of the returned URL (assxbtpiupmulmar.public.blob.vercel-storage.com).
    url = f"{VERCEL_BLOB_API}/{urllib.parse.quote(pathname, safe='/')}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": content_type,
        "x-content-type": content_type,
        # Make the blob public so YouTube/IG/Remotion can fetch it.
        "x-access": "public",
        # Overwrite if it already exists (re-renders of the same draft).
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "1",
    }
    log(f"PUT {url}  ({len(body):,} bytes, type={content_type})")
    r = requests.put(url, data=body, headers=headers, timeout=180)
    if not r.ok:
        die(f"Vercel Blob upload failed: HTTP {r.status_code} {r.text[:400]}")
    j = r.json()
    public_url = j.get("url") or j.get("downloadUrl")
    if not public_url:
        die(f"Vercel Blob response missing url: {j}")
    return public_url


def cmd_upload_to_blob(args: argparse.Namespace) -> int:
    src = Path(args.src)
    if not src.exists():
        die(f"--src not found: {src}")

    token = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
    if not token:
        die("BLOB_READ_WRITE_TOKEN env not set")

    pathname = f"renders/{args.draft_id}/avatar.mp4"
    body = src.read_bytes()
    public_url = vercel_blob_put(token, pathname, body, "video/mp4")
    log(f"uploaded -> {public_url}")

    # Persist the URL so the GH Actions summary step can read it.
    out_url = src.parent / "blob_url.txt"
    out_url.write_text(public_url)
    return 0


# ---------------------------------------------------------------------------
# CLI entry
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="sadtalker_runner")
    sub = p.add_subparsers(dest="cmd", required=True)

    pd = sub.add_parser("download-checkpoints")
    pd.add_argument("--dest", required=True)
    pd.set_defaults(func=cmd_download_checkpoints)

    pr = sub.add_parser("render")
    pr.add_argument("--portrait-url", required=True)
    pr.add_argument("--audio-url", required=True)
    pr.add_argument("--draft-id", required=True)
    pr.add_argument("--sadtalker-src", required=True)
    pr.add_argument("--checkpoints", required=True)
    pr.add_argument("--out-dir", required=True)
    pr.set_defaults(func=cmd_render)

    pu = sub.add_parser("upload-to-blob")
    pu.add_argument("--src", required=True)
    pu.add_argument("--draft-id", required=True)
    pu.set_defaults(func=cmd_upload_to_blob)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
