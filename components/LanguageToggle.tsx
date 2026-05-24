"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, normaliseLocale } from "@/lib/i18n/cookie";
import { LOCALE_LABELS, type Locale } from "@/lib/i18n";

const ORDER: Locale[] = ["en", "hi", "hinglish"];

/**
 * Three-button language toggle for the navbar. State is persisted in:
 *   - a long-lived cookie (`istl-locale`), so server components like
 *     the home page Welcome screen can render in the chosen language
 *     on the very next request, AND
 *   - localStorage, as a defensive backup if the cookie is cleared.
 *
 * We force a hard reload on change so server-rendered pages re-fetch
 * with the new cookie. A SPA-style swap would only update client text
 * and leave page titles, OG metadata, and RSC strings stale.
 */
export function LanguageToggle() {
  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    // 1. Cookie is the source of truth for SSR; mirror it into state.
    const fromCookie = readCookie(LOCALE_COOKIE);
    const fromStorage = safeGetItem("istl-locale-mirror");
    setLocale(normaliseLocale(fromCookie ?? fromStorage));
    setMounted(true);
  }, []);

  function pick(next: Locale) {
    if (next === locale) return;
    writeCookie(LOCALE_COOKIE, next, LOCALE_COOKIE_MAX_AGE);
    safeSetItem("istl-locale-mirror", next);
    // Hard reload to re-render server components with the new cookie.
    // We use location.assign so it shows up cleanly in browser history.
    window.location.assign(window.location.pathname + window.location.search);
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className="hidden sm:inline-flex items-center rounded-full border border-border bg-surface p-0.5 text-xs"
      suppressHydrationWarning
    >
      {ORDER.map((id) => {
        const active = mounted && locale === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => pick(id)}
            aria-pressed={active}
            title={LOCALE_LABELS[id]}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              active
                ? "bg-accent-soft text-accent-ink"
                : "text-ink-500 hover:text-ink-900 hover:bg-elevated"
            }`}
          >
            {SHORT_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}

const SHORT_LABELS: Record<Locale, string> = {
  en: "EN",
  hi: "हि",
  hinglish: "Hin",
};

// -----------------------------------------------------------------------------
// Cookie + storage helpers — minimal and dependency-free. We avoid `js-cookie`
// because the toggle is on every page; bundling a 2KB lib for two reads is
// not worth it.
// -----------------------------------------------------------------------------

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
