"use client";

import { useState } from "react";
import { quickEmailCheck } from "@/lib/validation/email-client";

/**
 * Cookieless email-list signup powered by Buttondown.
 *
 * Render anywhere. The component:
 *   - POSTs to /api/email/subscribe (which proxies Buttondown).
 *   - Accepts an optional `locale` prop to tag the subscriber.
 *   - Includes a hidden honeypot field; bots that fill it get a 200
 *     but are never forwarded to Buttondown.
 *   - Reports a graceful "email signup not configured" message if
 *     the server returns 503.
 *
 * Privacy / consent:
 *   - We render a small "what you'll get" line + an inline link to
 *     /about/privacy so consent is informed.
 *   - We do NOT store the email server-side; only Buttondown does.
 */
export function EmailSignup({
  locale,
  variant = "card",
  title = "Stay in the loop",
  blurb = "One short email a week — new explainers, plain-language summaries, and crisis-resource updates. Unsubscribe anytime.",
}: {
  locale?: string;
  variant?: "card" | "inline";
  title?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    // Quick client-side check — catches abc@abc.com / test@test.com
    // without a round-trip. The server runs a fuller check (disposable
    // domain blocklist + DNS MX lookup) and is the final authority.
    const local = quickEmailCheck(email);
    if (!local.ok) {
      setError(local.hint);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/email/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale, website }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        alreadyExisted?: boolean;
        error?: string;
        detail?: string;
      };
      if (res.status === 503) {
        setError("Email signup isn't configured right now. Try again later.");
      } else if (res.status === 422) {
        setError(data.detail ?? "Please enter a valid email address.");
      } else if (!res.ok) {
        setError(data.detail ?? data.error ?? "Couldn't subscribe. Try again.");
      } else {
        setDone(
          data.alreadyExisted
            ? "You're already on the list — see you Monday!"
            : "Subscribed. Check your inbox to confirm.",
        );
        setEmail("");
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const wrapperClass =
    variant === "card" ? "card p-5 space-y-3" : "rounded-2xl bg-surface/60 p-3";

  return (
    <form onSubmit={onSubmit} className={wrapperClass}>
      {variant === "card" && (
        <header>
          <h3 className="font-serif text-lg text-ink-900">{title}</h3>
          <p className="text-sm text-ink-600 mt-1">{blurb}</p>
        </header>
      )}

      <div className="flex gap-2 flex-wrap">
        <label className="sr-only" htmlFor="email-signup-input">
          Email address
        </label>
        <input
          id="email-signup-input"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 min-w-[200px] rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        {/* Honeypot — keep empty. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          name="website"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", height: 0, width: 0 }}
        />
        <button
          type="submit"
          disabled={busy || !email}
          className="btn-primary text-sm"
        >
          {busy ? "Subscribing…" : "Subscribe"}
        </button>
      </div>

      {done && (
        <p role="status" className="text-xs text-accent">
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-warn">
          {error}
        </p>
      )}

      <p className="text-[11px] text-ink-400">
        We never sell or share your address. See our{" "}
        <a href="/about/privacy" className="underline">
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}
