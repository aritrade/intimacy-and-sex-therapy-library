import Link from "next/link";

export const metadata = { title: "Unsubscribed · Intimacy & Sex Therapy Library" };
export const dynamic = "force-dynamic";

export default function UnsubscribedPage() {
  return (
    <article className="mx-auto max-w-prose px-4 sm:px-6 py-16 text-center">
      <h1 className="font-serif text-3xl text-ink-900">You&apos;re unsubscribed</h1>
      <p className="mt-3 text-ink-600">
        You won&apos;t receive any more emails from us. No data of yours is needed
        to keep using the site. If this was a mistake, you can subscribe again any
        time from the homepage.
      </p>
      <div className="mt-8">
        <Link href="/" className="btn-primary text-sm">
          Back to the library
        </Link>
      </div>
    </article>
  );
}
