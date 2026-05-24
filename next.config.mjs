/** @type {import('next').NextConfig} */

// Build-time CSP. The companion routes get a tighter, no-third-party CSP
// (so a compromised dependency cannot exfiltrate transcripts). Everything
// else gets a slightly looser policy that allows the configured Plausible /
// Umami host for cookieless analytics, plus self-hosted Google Fonts via
// next/font (no fonts.googleapis.com needed).

const plausibleHost = process.env.NEXT_PUBLIC_PLAUSIBLE_HOST || "https://plausible.io";
const umamiHost = process.env.NEXT_PUBLIC_UMAMI_HOST || "";

const ANALYTICS_HOSTS = [plausibleHost, umamiHost].filter(Boolean).join(" ");

// Embeddable players we trust enough to iframe. No arbitrary HTML — only the
// official privacy-friendly endpoints. Mirrored in the resource detail page
// so a developer adding a new provider has to update both places.
const EMBED_FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
  "https://embed.ted.com",
  "https://player.vimeo.com",
].join(" ");

const GLOBAL_CSP = [
  "default-src 'self'",
  // next/script with strategy=afterInteractive injects inline bootstrap; we
  // accept 'unsafe-inline' for scripts here. Companion routes harden this.
  `script-src 'self' 'unsafe-inline' ${ANALYTICS_HOSTS}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  `connect-src 'self' ${ANALYTICS_HOSTS}`.trim(),
  "font-src 'self' data:",
  `frame-src 'self' ${EMBED_FRAME_HOSTS}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const COMPANION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  // Only same-origin connects from the companion — no analytics, no third
  // parties, no LLM provider calls direct from browser.
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    // Don't ship server-side env into the client bundle by default.
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: GLOBAL_CSP },
        ],
      },
      {
        // Tighter CSP for the AI surface.
        source: "/companion/:path*",
        headers: [{ key: "Content-Security-Policy", value: COMPANION_CSP }],
      },
      {
        // Probes shouldn't be cached by intermediaries.
        source: "/api/:path(health|ready)",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
