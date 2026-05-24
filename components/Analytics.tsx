/**
 * Cookieless analytics. Renders a Plausible script ONLY when
 * NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set. Plausible is GDPR-friendly by default,
 * doesn't drop cookies, and never collects PII or content of conversations.
 *
 * If you swap to Umami or another cookieless host, change this component.
 */
import Script from "next/script";

export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const host = process.env.NEXT_PUBLIC_PLAUSIBLE_HOST ?? "https://plausible.io";
  if (!domain) return null;
  return (
    <Script
      defer
      strategy="afterInteractive"
      data-domain={domain}
      src={`${host}/js/script.js`}
    />
  );
}

/**
 * Server-safe event reporter. Use from client components.
 *   trackEvent("chat_started", { scope: "library" })
 */
export function trackEvent(name: string, props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  // Plausible attaches `plausible` to window when its script loads.
  const w = window as unknown as {
    plausible?: (n: string, opts?: { props?: Record<string, unknown> }) => void;
  };
  try {
    w.plausible?.(name, props ? { props } : undefined);
  } catch {
    /* analytics must never break UX */
  }
}
