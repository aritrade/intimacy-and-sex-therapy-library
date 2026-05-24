import { cookies } from "next/headers";
import { ALL_PURPOSES, type Purpose } from "./dpdp";

const AGE_GATE_COOKIE = "stl_age_18";
const CONSENT_COOKIE = "stl_consent";
const CONSENT_VERSION = 1;

export type ConsentRecord = {
  v: number; // schema version
  ts: number; // unix ms
  purposes: Record<string, { granted: boolean; version: number }>;
};

export function readAgeGate(): boolean {
  return cookies().get(AGE_GATE_COOKIE)?.value === "1";
}

export function setAgeGateCookie() {
  cookies().set(AGE_GATE_COOKIE, "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

export function clearAgeGateCookie() {
  cookies().delete(AGE_GATE_COOKIE);
}

export function readConsent(): ConsentRecord | null {
  const raw = cookies().get(CONSENT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed.v !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(grants: Record<string, boolean>) {
  const purposes: ConsentRecord["purposes"] = {};
  for (const p of ALL_PURPOSES as readonly Purpose[]) {
    purposes[p.id] = {
      granted: !p.optional || grants[p.id] === true,
      version: p.version,
    };
  }
  const record: ConsentRecord = {
    v: CONSENT_VERSION,
    ts: Date.now(),
    purposes,
  };
  cookies().set(CONSENT_COOKIE, JSON.stringify(record), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return record;
}

export function hasConsent(record: ConsentRecord | null, purposeId: string): boolean {
  if (!record) return false;
  const entry = record.purposes[purposeId];
  return Boolean(entry?.granted);
}
