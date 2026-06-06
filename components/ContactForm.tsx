"use client";

/**
 * Public "Contact Us" form. Posts to /api/contact, which emails the site
 * operator (Reply-To set to the sender). The destination inbox is never sent
 * to the browser — this form has no idea who receives it.
 *
 * Open to everyone: individuals, patients, clinicians, psychologists, doctors,
 * and private sexology / IVF / healthcare centres (the role selector tags the
 * message so the operator can triage).
 *
 * Includes an invisible honeypot. Degrades gracefully on 503/429/422.
 */

import { useState } from "react";
import { quickEmailCheck } from "@/lib/validation/email-client";

type Role =
  | "individual"
  | "patient"
  | "clinician"
  | "psychologist"
  | "doctor"
  | "sexology_center"
  | "ivf_center"
  | "other";

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "individual", label: "Individual / general visitor" },
  { value: "patient", label: "Patient" },
  { value: "clinician", label: "Clinician / sex therapist" },
  { value: "psychologist", label: "Psychologist" },
  { value: "doctor", label: "Doctor" },
  { value: "sexology_center", label: "Sexology / sexual-health centre" },
  { value: "ivf_center", label: "IVF / fertility centre" },
  { value: "other", label: "Other" },
];

const FIELD =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("individual");
  const [organization, setOrganization] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Centres benefit from an org field; show it for org-type roles by default
  // but always allow it.
  const orgSuggested = role === "sexology_center" || role === "ivf_center" || role === "clinician" || role === "doctor" || role === "psychologist";

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
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          role,
          organization: organization || undefined,
          subject,
          message,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (res.status === 503) {
        setError("The contact form isn't available right now. Please try again later.");
      } else if (res.status === 429) {
        setError(data.detail ?? "You just sent a message. Please wait a few minutes before sending another.");
      } else if (res.status === 422) {
        setError(data.detail ?? "Please enter a valid email address.");
      } else if (!res.ok || !data.ok) {
        setError(data.detail ?? data.error ?? "Couldn't send your message. Please try again.");
      } else {
        setDone("Thanks for reaching out — your message has been sent. We'll get back to you by email.");
        setName("");
        setEmail("");
        setRole("individual");
        setOrganization("");
        setSubject("");
        setMessage("");
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink-700">Your name</span>
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className={`${FIELD} mt-1`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`${FIELD} mt-1`}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink-700">I am a…</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={`${FIELD} mt-1`}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-700">
            Organisation / clinic{" "}
            <span className="text-ink-400">{orgSuggested ? "(recommended)" : "(optional)"}</span>
          </span>
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Practice, centre, or hospital name"
            className={`${FIELD} mt-1`}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-ink-700">Subject</span>
        <input
          type="text"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, 160))}
          placeholder="How can we help?"
          className={`${FIELD} mt-1`}
        />
      </label>

      <label className="block text-sm">
        <span className="text-ink-700">Message</span>
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
          rows={6}
          placeholder="Share your question, referral, partnership enquiry, or feedback (10–4000 characters)."
          className={`${FIELD} mt-1`}
        />
        <span className="text-[11px] text-ink-400">{message.length}/4000</span>
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
          We use your details only to reply to this enquiry. See our{" "}
          <a href="/about/privacy" className="underline">
            privacy policy
          </a>
          .
        </p>
        <button
          type="submit"
          disabled={busy || !name || !email || !subject || message.length < 10}
          className="btn-primary text-sm shrink-0"
        >
          {busy ? "Sending…" : "Send message"}
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
