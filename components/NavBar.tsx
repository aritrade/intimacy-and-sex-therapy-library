"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";

const NAV: Array<{ href: string; label: string }> = [
  { href: "/catalog", label: "Catalog" },
  { href: "/paths", label: "Paths" },
  { href: "/library", label: "Library" },
  { href: "/glossary", label: "Glossary" },
  { href: "/myths", label: "Myths" },
  { href: "/assessments", label: "Assessments" },
  { href: "/clinicians", label: "Find help" },
  { href: "/chat", label: "Ask" },
  { href: "/companion", label: "Sahay" },
];

export function NavBar({ authSlot }: { authSlot?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
      <nav
        aria-label="Main navigation"
        className="container-page flex h-14 items-center gap-2"
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-serif text-base font-semibold tracking-tight text-ink-900 hover:text-accent-ink whitespace-nowrap"
        >
          <Logo />
          <span className="hidden 2xl:inline">Intimacy &amp; Sex Therapy Library</span>
          <span className="hidden lg:inline 2xl:hidden">Intimacy &amp; Sex Library</span>
          <span className="hidden md:inline lg:hidden">ISTL</span>
          <span className="md:hidden">ISTL</span>
        </Link>

        <span aria-hidden className="hidden md:block h-5 w-px bg-border ml-1 shrink-0" />

        <ul className="hidden md:flex min-w-0 flex-1 items-center gap-x-0 text-sm overflow-x-auto scrollbar-none">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  className={`relative inline-block rounded-lg px-2 py-2 whitespace-nowrap text-ink-600 hover:text-ink-900 hover:bg-elevated transition-colors ${
                    active ? "text-ink-900 bg-elevated" : ""
                  }`}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-text"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          <LanguageToggle />
          <ThemeToggle />
          {authSlot}
          <button
            type="button"
            onClick={() => setOpen((s) => !s)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label="Toggle navigation menu"
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-ink-600 hover:text-ink-900 hover:bg-elevated transition-colors"
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          className="md:hidden border-t border-border bg-bg animate-fade-up"
        >
          <ul className="container-page py-3 grid grid-cols-2 gap-2">
            {NAV.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname?.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block rounded-xl border border-border px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-accent-soft text-accent-ink border-accent/40"
                        : "bg-surface text-ink-700 hover:bg-elevated"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </header>
  );
}

function Logo() {
  return (
    <span
      aria-hidden
      className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-text text-white text-sm font-semibold shadow-card"
    >
      ◐
    </span>
  );
}
