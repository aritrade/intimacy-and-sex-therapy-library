"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("stl-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setIsDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-ink-600 hover:text-ink-900 hover:bg-elevated transition-colors"
      suppressHydrationWarning
    >
      <span aria-hidden className="text-base">
        {mounted ? (isDark ? "☾" : "☀") : "·"}
      </span>
    </button>
  );
}
