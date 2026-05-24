"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, normaliseLocale } from "@/lib/i18n/cookie";
import { LOCALE_LABELS, type Locale } from "@/lib/i18n";

const ORDER: Locale[] = ["en", "hi", "hinglish"];

/**
 * Compact language switcher for the navbar. Rendered as a single
 * dropdown trigger to keep the top bar uncluttered; the menu lists
 * each locale with its short code and full label.
 *
 * State is persisted in:
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromCookie = readCookie(LOCALE_COOKIE);
    const fromStorage = safeGetItem("istl-locale-mirror");
    setLocale(normaliseLocale(fromCookie ?? fromStorage));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    writeCookie(LOCALE_COOKIE, next, LOCALE_COOKIE_MAX_AGE);
    safeSetItem("istl-locale-mirror", next);
    window.location.assign(window.location.pathname + window.location.search);
  }

  return (
    <div ref={rootRef} className="relative" suppressHydrationWarning>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Language: ${mounted ? LOCALE_LABELS[locale] : "English"}`}
        className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-xs font-medium text-ink-700 hover:text-ink-900 hover:bg-elevated transition-colors"
      >
        <span aria-hidden className="text-[13px] leading-none">
          {mounted ? SHORT_LABELS[locale] : "EN"}
        </span>
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choose language"
          className="absolute right-0 mt-2 min-w-[180px] rounded-xl border border-border bg-surface shadow-lg overflow-hidden animate-fade-up"
        >
          <ul className="py-1 text-sm">
            {ORDER.map((id) => {
              const active = mounted && locale === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => pick(id)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                      active
                        ? "bg-accent-soft text-accent-ink"
                        : "text-ink-700 hover:bg-elevated hover:text-ink-900"
                    }`}
                  >
                    <span>{LOCALE_LABELS[id]}</span>
                    <span
                      aria-hidden
                      className={`text-xs font-medium ${
                        active ? "text-accent-ink" : "text-ink-400"
                      }`}
                    >
                      {SHORT_LABELS[id]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
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
