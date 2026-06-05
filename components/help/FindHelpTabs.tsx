"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/clinicians", label: "Find a clinician" },
  { href: "/communities", label: "Communities" },
];

export function FindHelpTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Find help sections" className="mb-6 flex gap-2 border-b border-border">
      {TABS.map((t) => {
        const active = pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-b-2 border-accent text-ink-900"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
