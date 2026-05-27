/**
 * Deep email validation used by the public-facing /api/email/subscribe and
 * /api/feedback endpoints.
 *
 * Why this exists: `z.string().email()` accepts `abc@abc.com`, `a@a.co`,
 * `test@test.com`, and other patterns that are syntactically legal but
 * obviously not real addresses. Storing them pollutes the subscriber
 * list, breaks Buttondown's bounce rate, and means we can't actually
 * reply to feedback. This validator runs four layers of checks:
 *
 *   1. Syntax — basic structure beyond zod (no consecutive dots, no
 *      leading/trailing dot in the local part, a TLD of ≥ 2 chars).
 *   2. Disposable / throwaway domain blocklist — mailinator, tempmail,
 *      yopmail, etc.
 *   3. Obvious-fake heuristics — `example.com`-class test domains,
 *      `local === domainPrefix` (abc@abc.com), single-char or all-same
 *      local parts.
 *   4. DNS MX lookup — confirms the domain actually accepts mail.
 *      Cached in-memory for 1 hour to keep p99 low.
 *
 * Returns either `{ ok: true, normalized }` (trimmed + lowercased) or
 * `{ ok: false, reason, hint }` where `hint` is a user-friendly
 * single-sentence message safe to put straight into a form error.
 *
 * Failure modes are deliberately FAIL-CLOSED for syntax / heuristic
 * checks (clearly bad → reject) and FAIL-OPEN for DNS lookup network
 * errors (transient → allow) so a flaky resolver doesn't lock out real
 * users. Empty MX response from a successful lookup IS a reject.
 */

import { promises as dnsPromises } from "node:dns";

export type EmailValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: string; hint: string };

/**
 * Domains we will never persist. Either disposable inbox services or
 * obvious placeholders. Lowercase, exact match on the domain portion.
 * Add to this list when we see a new pattern in feedback admin.
 */
const BLOCKED_DOMAINS: ReadonlySet<string> = new Set([
  // Disposable / throwaway inbox services.
  "mailinator.com",
  "mailinator.net",
  "yopmail.com",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "tempmail.net",
  "temp-mail.org",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "trashmail.com",
  "throwawaymail.com",
  "fakeinbox.com",
  "maildrop.cc",
  "getairmail.com",
  "dispostable.com",
  "moakt.com",
  "tutanota.de",
  // Obvious test / placeholder domains.
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.org",
  "tests.com",
  "testing.com",
  "abc.com",
  "abcd.com",
  "asdf.com",
  "asdfasdf.com",
  "qwerty.com",
  "qwertyuiop.com",
  "foo.com",
  "bar.com",
  "baz.com",
  "1234.com",
  "12345.com",
  "123456.com",
  "domain.com",
  "email.com",
  "mail.com",
  "noemail.com",
  "noreply.com",
  "no-reply.com",
  "fake.com",
  "fakemail.com",
  "fakeemail.com",
  "invalid.com",
  "dummy.com",
  "spam.com",
  "junk.com",
]);

/**
 * Local-part patterns that almost always indicate a fake submission.
 * Each entry is a regex tested against the lowercased local part.
 */
const FAKE_LOCAL_PATTERNS: ReadonlyArray<RegExp> = [
  /^.$/, // single character: a@gmail.com
  /^(.)\1+$/, // all same character: aaa@gmail.com
  /^(test|tests|testing|asdf|asdfasdf|qwerty|qwertyuiop|abc|abcd|abcde|foo|bar|baz|fake|dummy|spam|junk|noemail|noreply|no-reply|nobody|null|none|admin|user|email|mail|sample|placeholder|example)$/,
  /^\d{1,6}$/, // pure digits up to 6: 1234@gmail.com
  /^[a-z]{1,3}\d{1,3}$/, // very short alpha+digit: ab12@gmail.com
];

/** Local-part rejected if it equals the alphanumeric prefix of the domain. */
function localEqualsDomainPrefix(local: string, domain: string): boolean {
  const domainPrefix = domain.split(".")[0]?.toLowerCase() ?? "";
  return domainPrefix.length > 0 && local === domainPrefix;
}

/**
 * In-memory MX cache. (domain → { hasMx, expiresAt }). Lives for the
 * lifetime of the serverless function instance, which on Vercel is
 * usually minutes-to-hours.
 */
const MX_CACHE_TTL_MS = 60 * 60 * 1000;
const mxCache = new Map<string, { hasMx: boolean; expiresAt: number }>();

async function domainHasMx(domain: string): Promise<{
  hasMx: boolean;
  fromCache: boolean;
  /** True when the resolver itself errored. We fail-open on this. */
  resolverFailed: boolean;
}> {
  const cached = mxCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) {
    return { hasMx: cached.hasMx, fromCache: true, resolverFailed: false };
  }
  try {
    const records = await Promise.race([
      dnsPromises.resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("dns_timeout")), 3000),
      ),
    ]);
    const hasMx = Array.isArray(records) && records.length > 0;
    mxCache.set(domain, { hasMx, expiresAt: Date.now() + MX_CACHE_TTL_MS });
    return { hasMx, fromCache: false, resolverFailed: false };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    // ENODATA / ENOTFOUND = domain definitively has no MX records.
    // Anything else (ETIMEOUT, ESERVFAIL, network errors) = resolver
    // problem on our side; do not punish the user.
    if (code === "ENODATA" || code === "ENOTFOUND") {
      mxCache.set(domain, { hasMx: false, expiresAt: Date.now() + MX_CACHE_TTL_MS });
      return { hasMx: false, fromCache: false, resolverFailed: false };
    }
    return { hasMx: false, fromCache: false, resolverFailed: true };
  }
}

const SYNTAX_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

/**
 * Run every check. Returns a single composed result so callers don't
 * have to know about the individual layers.
 */
export async function validateEmailDeep(
  raw: string,
): Promise<EmailValidationResult> {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (!normalized) {
    return {
      ok: false,
      reason: "empty",
      hint: "Please enter an email address.",
    };
  }
  if (normalized.length > 320) {
    return {
      ok: false,
      reason: "too_long",
      hint: "That email is too long. Please double-check it.",
    };
  }
  if (!SYNTAX_RE.test(normalized)) {
    return {
      ok: false,
      reason: "bad_syntax",
      hint: "That doesn't look like a valid email address. Please try again.",
    };
  }
  // Reject leading / trailing / consecutive dots in the local part.
  const atIdx = normalized.lastIndexOf("@");
  const local = normalized.slice(0, atIdx);
  const domain = normalized.slice(atIdx + 1);
  if (
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.includes("..")
  ) {
    return {
      ok: false,
      reason: "bad_syntax_dots",
      hint: "That email has misplaced dots. Please double-check it.",
    };
  }
  if (BLOCKED_DOMAINS.has(domain)) {
    return {
      ok: false,
      reason: "blocked_domain",
      hint: "Please use a real email — that domain is on our placeholder/disposable list.",
    };
  }
  for (const re of FAKE_LOCAL_PATTERNS) {
    if (re.test(local)) {
      return {
        ok: false,
        reason: "fake_local",
        hint: "That looks like a placeholder. Please enter a real email address.",
      };
    }
  }
  if (localEqualsDomainPrefix(local, domain)) {
    return {
      ok: false,
      reason: "local_equals_domain",
      hint: "That looks like a placeholder. Please enter a real email address.",
    };
  }
  // Last hop: DNS MX. Fail-open on resolver errors; fail-closed when the
  // resolver definitively returned "no MX records for this domain".
  const mx = await domainHasMx(domain);
  if (!mx.resolverFailed && !mx.hasMx) {
    return {
      ok: false,
      reason: "no_mx_records",
      hint: "That domain doesn't accept email. Please double-check the address.",
    };
  }

  return { ok: true, normalized };
}
