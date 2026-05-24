import { en } from "./en";
import { hi } from "./hi";
import { hinglish } from "./hinglish";

export type Locale = "en" | "hi" | "hinglish";

export const LOCALES: Record<Locale, typeof en> = { en, hi, hinglish };

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिंदी",
  hinglish: "Hinglish",
};

export function t(locale: Locale): typeof en {
  return LOCALES[locale] ?? en;
}
