/**
 * Rasterise brand SVGs to platform-spec PNGs.
 *
 * Outputs go to public/brand/exports/ and are committed so social
 * platforms can be updated without re-running this script. Re-run
 * locally whenever the source SVGs change.
 *
 *   npx tsx scripts/render-brand-assets.ts
 *
 * Sizes are pinned to the spec each platform actually rejects you
 * for missing — undersized assets get auto-upscaled with ugly blur,
 * oversized ones get rejected outright. We round up to the next
 * power-of-two-ish size when the platform allows a range.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

type Spec = {
  source: string;
  out: string;
  width: number;
  height?: number;
  description: string;
};

const ROOT = join(process.cwd(), "public", "brand");
const OUT_DIR = join(ROOT, "exports");

const SPECS: Spec[] = [
  // Square logo exports (rasterised from logo.svg, which is 512x512).
  // Every avatar surface across IG / YT / FB / LinkedIn / X.
  {
    source: "logo.svg",
    out: "logo-1024.png",
    width: 1024,
    description: "Master 1024×1024 — upload to YouTube channel icon (min 800, max 1024) and Facebook Page profile (recommended 1024).",
  },
  {
    source: "logo.svg",
    out: "logo-512.png",
    width: 512,
    description: "512×512 — Instagram profile, LinkedIn profile, X/Twitter profile. Renders sharp on Retina.",
  },
  {
    source: "logo.svg",
    out: "logo-320.png",
    width: 320,
    description: "320×320 — Instagram story highlight cover, smaller embeds.",
  },
  {
    source: "logo.svg",
    out: "logo-192.png",
    width: 192,
    description: "192×192 — PWA / Android home-screen icon.",
  },
  {
    source: "logo.svg",
    out: "logo-favicon.png",
    width: 32,
    description: "32×32 — favicon, tab icon.",
  },

  // Hero banners. resvg locks aspect ratio to the source viewBox so we
  // ship two source SVGs — one per shape:
  //   banner-16x9.svg → YouTube channel banner (2048×1152)
  //   banner.svg      → Facebook Page cover (1640×856, ~1.92:1)
  {
    source: "banner-16x9.svg",
    out: "banner-yt-channel-2048x1152.png",
    width: 2048,
    description: "YouTube channel banner. Safe area for mobile is the central 1235×338; the wordmark sits inside it.",
  },
  {
    source: "banner.svg",
    out: "banner-fb-cover-1640x856.png",
    width: 1640,
    description: "Facebook Page cover photo (Retina). Native crop is 851×315 desktop / 640×360 mobile.",
  },
];

async function rasterise(spec: Spec): Promise<{ bytes: number; w: number; h: number }> {
  const svgBuf = await readFile(join(ROOT, spec.source));
  const resvg = new Resvg(svgBuf, {
    fitTo: spec.height
      ? { mode: "width", value: spec.width }
      : { mode: "width", value: spec.width },
    font: {
      // Edge case: @resvg can't fetch Google Fonts. We try the OS font
      // first, then fall back to whatever sans serif is available — the
      // banner's serif "Lora" wordmark will fall back to Times or DejaVu
      // Serif at render time. Visually almost identical at banner sizes.
      loadSystemFonts: true,
      defaultFontFamily: "Georgia",
    },
  });
  const pngData = resvg.render().asPng();
  await writeFile(join(OUT_DIR, spec.out), pngData);
  const { width, height } = resvg.render();
  return { bytes: pngData.byteLength, w: width, h: height };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`[brand] writing to ${OUT_DIR}`);
  for (const spec of SPECS) {
    try {
      const r = await rasterise(spec);
      console.log(
        `[brand] ${spec.out.padEnd(36)} ${String(r.w).padStart(4)}×${String(r.h).padStart(4)}  ${(r.bytes / 1024).toFixed(0).padStart(5)} KB  ${spec.description}`,
      );
    } catch (e) {
      console.error(`[brand] FAILED ${spec.out}:`, (e as Error).message);
      process.exit(1);
    }
  }
  console.log(`[brand] done — ${SPECS.length} assets emitted.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
