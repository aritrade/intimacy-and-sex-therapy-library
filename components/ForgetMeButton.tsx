"use client";

import { useState } from "react";

export function ForgetMeButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm("Permanently delete all data tied to this account?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/forget", { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Deletion failed");
        return;
      }
      window.location.href = "/";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="mt-3 btn-secondary border-coral/40 text-coral hover:bg-coral/10"
      >
        {busy ? "Deleting…" : "Permanently delete my data"}
      </button>
      {error && (
        <div role="alert" className="mt-2 text-sm text-coral">
          {error}
        </div>
      )}
    </div>
  );
}
