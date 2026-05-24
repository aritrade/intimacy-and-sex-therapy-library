/**
 * Locale cookie shared between client (LanguageToggle) and server
 * (currentLocale on home page, RSC, and the Companion API). Kept in
 * its own module so client components can import it without dragging
 * in `next/headers` (which is server-only).
 *
 * Why a cookie and not just localStorage? Server components render
 * before any client JS executes, so the navbar must read its initial
 * state from a cookie. We mirror to localStorage too so future visits
 * with cookies cleared still feel sticky.
 */

import type { Locale } from "./index";

export const LOCALE_COOKIE = "istl-locale";

// ~1 year. Locale preference is sticky and harmless to remember.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "hi" || value === "hinglish";
}

export function normaliseLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : "en";
}
