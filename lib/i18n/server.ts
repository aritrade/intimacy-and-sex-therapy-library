import { cookies } from "next/headers";
import { t, type Locale } from "./index";
import { LOCALE_COOKIE, normaliseLocale } from "./cookie";

/**
 * Read the active locale from cookies inside an RSC or route handler.
 * Defaults to "en" when the cookie is missing or invalid.
 */
export function currentLocale(): Locale {
  return normaliseLocale(cookies().get(LOCALE_COOKIE)?.value);
}

/**
 * Convenience: returns the strings bundle for the current request's
 * locale. Use this inside server components so they re-render with
 * the right copy when the user flips the language toggle.
 */
export function currentStrings(): ReturnType<typeof t> {
  return t(currentLocale());
}
