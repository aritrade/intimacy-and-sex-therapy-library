"use client";

import { useEffect, useState } from "react";

const RESOURCES: Array<{ name: string; tel: string; note: string; region: string }> = [
  { name: "Tele-MANAS", tel: "14416", note: "India · 24×7 · multilingual", region: "IN" },
  { name: "iCall (TISS Mumbai)", tel: "+919152987821", note: "India · Mon–Sat 8am–10pm", region: "IN" },
  { name: "Vandrevala Foundation", tel: "18602662345", note: "India · 24×7", region: "IN" },
  { name: "988 Lifeline", tel: "988", note: "United States · 24×7", region: "US" },
  { name: "Samaritans", tel: "116123", note: "UK & Ireland · 24×7", region: "UK" },
  { name: "Lifeline", tel: "131114", note: "Australia · 24×7", region: "AU" },
];

/**
 * Bottom-right floating crisis button. Always visible. Designed to be the
 * single fastest path from "I am in crisis" to a phone number, regardless of
 * which page the user lands on.
 */
export function CrisisFab() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-warn/40 bg-warn px-4 py-3 text-sm font-medium text-white shadow-glow hover:brightness-110 active:scale-[0.98] transition-all"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden>♡</span>
        Need help now?
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Crisis resources"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="card w-full sm:max-w-md m-2 sm:m-0 p-5 animate-fade-up">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h2 className="font-serif text-lg text-ink-900">You are not alone</h2>
                <p className="text-sm text-ink-600">
                  If you&apos;re in immediate danger, call your local emergency number now.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-ink-400 hover:text-ink-900 hover:bg-elevated"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-2 mt-3">
              {RESOURCES.map((r) => (
                <li key={r.name}>
                  <a
                    href={`tel:${r.tel}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5 hover:border-accent/40 hover:bg-accent-soft transition-colors"
                  >
                    <span>
                      <span className="block text-sm font-medium text-ink-900">{r.name}</span>
                      <span className="block text-xs text-ink-400">{r.note}</span>
                    </span>
                    <span className="font-mono text-sm text-accent-ink">{r.tel}</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-ink-400">
              This list is informational. We do not log calls or your dialing activity.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
