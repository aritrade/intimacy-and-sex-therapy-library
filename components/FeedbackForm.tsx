"use client";

/**
 * Public homepage feedback form.
 *
 * Drop-in component that posts to /api/feedback. Captures:
 *   - email (required so we can write back)
 *   - category (improvement / praise / bug / other)
 *   - message (4-2000 chars)
 *   - locale (read from <html lang>) so we can chart per-locale signal
 *   - source path (auto-captured) for funnel context
 *
 * Includes an invisible honeypot field. Gracefully degrades when the
 * server returns 503 (DATABASE_URL not set).
 *
 * Mirrors the visual treatment of `EmailSignup` so the two cards sit
 * naturally side-by-side on the homepage.
 */

import { useState } from "react";
import { quickEmailCheck } from "@/lib/validation/email-client";

type Category = "improvement" | "praise" | "bug" | "other";

const CATEGORY_OPTIONS: Array<{ value: Category; label: string }> = [
  { value: "improvement", label: "Something to improve" },
  { value: "praise", label: "Something you love" },
  { value: "bug", label: "A bug or broken link" },
  { value: "other", label: "Other" },
];

export function FeedbackForm({
  title = "Help shape this library",
  blurb = "What's working well? What should we improve? Drop your email and a short note — a human reads every message.",
}: {
  title?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<Category>("improvement");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const local = quickEmailCheck(email);
    if (!local.ok) {
      setError(local.hint);
      return;
    }
    setBusy(true);
    try {
      const locale =
        typeof document !== "undefined"
          ? document.documentElement.lang || undefined
          : undefined;
      const sourcePath =
        typeof window !== "undefined" ? window.location.pathname : undefined;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          message,
          category,
          locale,
          sourcePath,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (res.status === 503) {
        setError("Feedback isn't configured right now. Try again later.");
      } else if (res.status === 429) {
        setError(data.detail ?? "You just sent us a note. Give it a few minutes before sending another.");
      } else if (res.status === 422) {
        setError(data.detail ?? "Please enter a valid email address.");
      } else if (!res.ok || !data.ok) {
        setError(data.detail ?? data.error ?? "Couldn't send. Try again.");
      } else {
        setDone("Thanks — we'll read it within a few days.");
        setEmail("");
        setMessage("");
        setCategory("improvement");
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-3">
      <header>
        <h3 className="font-serif text-lg text-ink-900">{title}</h3>
        <p className="text-sm text-ink-600 mt-1">{blurb}</p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="sr-only">Email address</span>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="sr-only">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="sr-only">Message</span>
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
          rows={4}
          placeholder="What's on your mind? (4–2000 characters)"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <span className="text-[11px] text-ink-400">{message.length}/2000</span>
      </label>

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

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-ink-400">
          We store your email + message so we can reply. We never share it. See our{" "}
          <a href="/about/privacy" className="underline">
            privacy policy
          </a>
          .
        </p>
        <button
          type="submit"
          disabled={busy || !email || message.length < 4}
          className="btn-primary text-sm shrink-0"
        >
          {busy ? "Sending…" : "Send feedback"}
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
    </form>
  );
}
