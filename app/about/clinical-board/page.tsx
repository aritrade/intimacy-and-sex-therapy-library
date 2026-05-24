export const metadata = { title: "Clinical Advisory Board · Intimacy & Sex Therapy Library" };

export default function ClinicalBoardPage() {
  return (
    <article className="mx-auto max-w-prose px-4 sm:px-6 py-10 prose prose-ink">
      <h1 className="font-serif text-3xl text-ink-900">Clinical Advisory Board</h1>
      <p className="text-ink-600">
        Every published article on this site is reviewed by a credentialed clinician
        from the board below. Each card carries the reviewer&apos;s name,
        credentials, and last-review date. Content older than 24 months returns to
        the review queue automatically.
      </p>
      <div
        role="status"
        className="not-prose mt-6 rounded-lg border border-dashed border-ink-200 bg-ink-50 p-5 text-sm text-ink-600"
      >
        Board membership is being assembled. Reviewers from RCI / AASECT / WPATH /
        ESSM only. Until the board is in place, the site stays in beta and resources
        carry an explicit &quot;pre-review&quot; banner.
      </div>
    </article>
  );
}
