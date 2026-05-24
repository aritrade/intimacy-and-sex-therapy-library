import type { Metadata, Viewport } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import { DisclaimerFooter } from "@/components/DisclaimerFooter";
import { NavBar } from "@/components/NavBar";
import { CrisisFab } from "@/components/CrisisFab";
import { Analytics } from "@/components/Analytics";
import { PWARegister } from "@/components/PWARegister";
import { AuthMenu } from "@/components/AuthMenu";

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});
const serif = Lora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Intimacy & Sex Therapy Library — Evidence-based, clinician-reviewed",
  description:
    "A curated library of sex-therapy education from AASECT, WPATH, WHO, NIH, peer-reviewed journals and accredited universities. Includes Sahay, an India-aware AI companion with end-to-end encryption.",
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Intimacy & Sex Therapy Library",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#101115" },
  ],
};

/**
 * Inline script to set the theme class before paint, preventing flash. Reads
 * `localStorage["stl-theme"]` first, falls back to OS preference.
 */
const themeInit = `
(function () {
  try {
    var stored = localStorage.getItem('stl-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', dark);
  } catch (_) {}
})();
`.trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-dvh flex flex-col bg-bg text-ink">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <NavBar authSlot={<AuthMenu />} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <DisclaimerFooter />
        <CrisisFab />
        <Analytics />
        <PWARegister />
      </body>
    </html>
  );
}
