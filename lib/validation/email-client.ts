/**
 * Client-side cousin of `lib/validation/email.ts`. Same heuristic
 * rejections, NO DNS — so it can run in the browser instantly without
 * a network round-trip. Used to give immediate, friendly inline
 * feedback before the form posts to the server.
 *
 * Anything that passes this check still goes through the FULL deep
 * check on the server (which adds disposable-domain + MX lookup), so
 * trust the server's response as authoritative.
 */

export type ClientEmailResult = { ok: true } | { ok: false; hint: string };

const SYNTAX_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

// Keep this in sync with the server-side BLOCKED_DOMAINS — duplication is
// intentional so the file is fully self-contained for the client bundle.
const BLOCKED_DOMAINS = new Set<string>([
  "mailinator.com",
  "yopmail.com",
  "10minutemail.com",
  "tempmail.com",
  "tempmail.net",
  "temp-mail.org",
  "guerrillamail.com",
  "sharklasers.com",
  "trashmail.com",
  "throwawaymail.com",
  "fakeinbox.com",
  "maildrop.cc",
  "dispostable.com",
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.org",
  "abc.com",
  "abcd.com",
  "asdf.com",
  "qwerty.com",
  "foo.com",
  "bar.com",
  "1234.com",
  "domain.com",
  "email.com",
  "noemail.com",
  "noreply.com",
  "no-reply.com",
  "fake.com",
  "fakemail.com",
  "invalid.com",
  "dummy.com",
  "spam.com",
]);

const FAKE_LOCAL_PATTERNS: RegExp[] = [
  /^.$/,
  /^(.)\1+$/,
  /^(test|tests|testing|asdf|asdfasdf|qwerty|abc|abcd|abcde|foo|bar|baz|fake|dummy|spam|junk|noemail|noreply|no-reply|nobody|null|none|admin|user|email|mail|sample|placeholder|example)$/,
  /^\d{1,6}$/,
  /^[a-z]{1,3}\d{1,3}$/,
];

export function quickEmailCheck(raw: string): ClientEmailResult {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return { ok: false, hint: "Please enter an email address." };
  if (v.length > 320) {
    return { ok: false, hint: "That email is too long." };
  }
  if (!SYNTAX_RE.test(v)) {
    return {
      ok: false,
      hint: "That doesn't look like a valid email address. Please try again.",
    };
  }
  const atIdx = v.lastIndexOf("@");
  const local = v.slice(0, atIdx);
  const domain = v.slice(atIdx + 1);
  if (
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    domain.includes("..")
  ) {
    return { ok: false, hint: "That email has misplaced dots." };
  }
  if (BLOCKED_DOMAINS.has(domain)) {
    return {
      ok: false,
      hint: "Please use a real email — that domain is on our placeholder list.",
    };
  }
  if (FAKE_LOCAL_PATTERNS.some((re) => re.test(local))) {
    return {
      ok: false,
      hint: "That looks like a placeholder. Please enter a real email address.",
    };
  }
  const domainPrefix = domain.split(".")[0] ?? "";
  if (domainPrefix && local === domainPrefix) {
    return {
      ok: false,
      hint: "That looks like a placeholder. Please enter a real email address.",
    };
  }
  return { ok: true };
}
