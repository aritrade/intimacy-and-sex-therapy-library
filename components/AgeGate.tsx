"use client";

import { useState } from "react";

const COOKIE = "stl_age_18";

function setCookie(value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${COOKIE}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

export function AgeGate({
  onConfirm,
  copy,
}: {
  onConfirm: () => void;
  copy: {
    title: string;
    body: string;
    confirm: string;
    decline: string;
    youthRedirect: string;
  };
}) {
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ag-title"
        className="card p-6"
      >
        <h2 id="ag-title" className="font-serif text-xl text-ink-900">
          {copy.title}
        </h2>
        <p className="mt-3 text-ink-600">{copy.youthRedirect}</p>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ag-title"
      className="card p-6 shadow-glow"
    >
      <h2 id="ag-title" className="font-serif text-xl text-ink-900">
        {copy.title}
      </h2>
      <p className="mt-3 text-ink-600">{copy.body}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            setCookie("1");
            onConfirm();
          }}
          className="btn-primary"
        >
          {copy.confirm}
        </button>
        <button
          type="button"
          onClick={() => setDeclined(true)}
          className="btn-secondary"
        >
          {copy.decline}
        </button>
      </div>
    </div>
  );
}
