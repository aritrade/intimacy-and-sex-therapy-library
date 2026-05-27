"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["viewer", "clinician", "editor", "admin"] as const;
type Role = (typeof ROLES)[number];

const ROLE_HELP: Record<Role, string> = {
  viewer: "Read-only — sees analytics, feedback, subscribers. Cannot mutate.",
  clinician: "Clinical approval of draft scripts.",
  editor: "Editorial approval and the publish button.",
  admin: "Full access including this page.",
};

export function InviteUserCard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<Role>>(new Set(["viewer"]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  function toggle(role: Role) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setOkMsg(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErr("Email is required.");
      return;
    }
    if (selected.size === 0) {
      setErr("Pick at least one role to grant.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          roles: Array.from(selected),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(
          j?.detail ??
            j?.error ??
            `Invite failed (${res.status}). Check the email and try again.`,
        );
        return;
      }
      const created = j?.user?.created;
      setOkMsg(
        created
          ? `Invited ${cleanEmail}. They'll be matched on first sign-in and start with the roles you granted.`
          : `Updated ${cleanEmail}. Any newly-checked roles are now granted.`,
      );
      setEmail("");
      setSelected(new Set(["viewer"]));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="invite-heading"
      className="card p-5 mb-6 border border-accent/30 bg-accent/5"
    >
      <h2 id="invite-heading" className="font-serif text-xl text-ink-900">
        Invite a teammate
      </h2>
      <p className="mt-1 text-sm text-ink-600">
        Pre-grant roles by email. The next time they sign in via the magic
        link or Google, their roles will already be applied — no second
        round-trip needed.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="invite-email"
            className="block text-sm font-medium text-ink-800"
          >
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            disabled={busy}
          />
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-ink-800">
            Roles to grant
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ROLES.map((role) => {
              const checked = selected.has(role);
              return (
                <label
                  key={role}
                  className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer text-sm ${
                    checked
                      ? "border-accent bg-surface"
                      : "border-border bg-surface hover:border-accent/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(role)}
                    disabled={busy}
                    className="mt-0.5 accent-current"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-ink-900 capitalize">
                      {role}
                    </span>
                    <span className="block mt-0.5 text-xs text-ink-600">
                      {ROLE_HELP[role]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {err && (
          <p role="alert" className="text-sm text-coral">
            {err}
          </p>
        )}
        {okMsg && (
          <p
            role="status"
            className="text-sm text-ink-700 border border-teal/40 bg-teal/10 rounded-xl px-3 py-2"
          >
            {okMsg}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="btn-primary text-sm"
            disabled={busy || !email.trim() || selected.size === 0}
          >
            {busy ? "Inviting…" : "Send invite"}
          </button>
          <span className="text-xs text-ink-400">
            No email is sent — they sign in normally and inherit the roles.
          </span>
        </div>
      </form>
    </section>
  );
}
