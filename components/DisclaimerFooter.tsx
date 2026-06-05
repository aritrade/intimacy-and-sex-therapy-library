import Link from "next/link";
import { DISCLAIMERS } from "@/lib/safety/disclaimers";
import { SocialLinks } from "@/components/SocialLinks";

export function DisclaimerFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-elevated/50">
      <div className="container-page py-10 grid gap-8 md:grid-cols-4 text-sm text-ink-600">
        <section className="md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-text text-white text-sm font-semibold"
            >
              ◐
            </span>
            <span className="font-serif text-lg text-ink-900">Intimacy &amp; Sex Therapy Library</span>
          </div>
          <p className="max-w-prose">{DISCLAIMERS.educational}</p>
          <p className="max-w-prose mt-3 text-ink-400 text-xs">{DISCLAIMERS.copyright}</p>
          <SocialLinks className="mt-4" />
        </section>
        <section aria-labelledby="footer-explore">
          <h2 id="footer-explore" className="font-medium text-ink-900 mb-2">
            Explore
          </h2>
          <ul className="space-y-1.5">
            <li><Link href="/catalog" className="hover:text-ink-900">Catalog</Link></li>
            <li><Link href="/paths" className="hover:text-ink-900">Learning paths</Link></li>
            <li><Link href="/library" className="hover:text-ink-900">Library</Link></li>
            <li><Link href="/assessments" className="hover:text-ink-900">Assessments</Link></li>
            <li><Link href="/glossary" className="hover:text-ink-900">Glossary</Link></li>
            <li><Link href="/myths" className="hover:text-ink-900">Myths</Link></li>
          </ul>
        </section>
        <section aria-labelledby="footer-trust">
          <h2 id="footer-trust" className="font-medium text-ink-900 mb-2">
            Trust
          </h2>
          <ul className="space-y-1.5">
            <li><Link href="/about/privacy" className="hover:text-ink-900">Privacy notice</Link></li>
            <li><Link href="/about/model" className="hover:text-ink-900">Model card</Link></li>
            <li><Link href="/about/clinical-board" className="hover:text-ink-900">Clinical Advisory Board</Link></li>
            <li><Link href="/clinicians" className="hover:text-ink-900">Find a clinician</Link></li>
            <li><Link href="/me/privacy" className="hover:text-ink-900">Manage my consents</Link></li>
          </ul>
        </section>
      </div>
      <div className="border-t border-border px-4 sm:px-6 py-4 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} Intimacy &amp; Sex Therapy Library · 18+ ·{" "}
        <Link href="/about/contact" className="hover:text-ink-900">
          Grievance Officer
        </Link>
      </div>
    </footer>
  );
}
