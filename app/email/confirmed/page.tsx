import Link from "next/link";

export const metadata = { title: "Subscription confirmed · Intimacy & Sex Therapy Library" };
export const dynamic = "force-dynamic";

export default function ConfirmedPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const invalid = searchParams.status === "invalid";

  return (
    <article className="mx-auto max-w-prose px-4 sm:px-6 py-16 text-center">
      {invalid ? (
        <>
          <h1 className="font-serif text-3xl text-ink-900">Link expired or invalid</h1>
          <p className="mt-3 text-ink-600">
            That confirmation link didn&apos;t match an active signup. It may have
            already been used, or it expired. You can request a fresh link by
            subscribing again.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-serif text-3xl text-ink-900">You&apos;re subscribed 🎉</h1>
          <p className="mt-3 text-ink-600">
            Thanks for confirming. You&apos;ll get a short weekly digest of new,
            clinician-reviewed resources. Every email has a one-click
            unsubscribe — no hard feelings if you change your mind.
          </p>
        </>
      )}
      <div className="mt-8">
        <Link href="/" className="btn-primary text-sm">
          Back to the library
        </Link>
      </div>
    </article>
  );
}
