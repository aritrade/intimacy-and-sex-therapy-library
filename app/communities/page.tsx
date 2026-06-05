import { searchCommunities, aggregationConfigured, type CommunityScope } from "@/lib/help/search";
import { topicById, type AffirmingFilter } from "@/lib/help/taxonomy";
import { FindHelpTabs } from "@/components/help/FindHelpTabs";
import { HelpSearchForm } from "@/components/help/HelpSearchForm";
import { HelpResultCard } from "@/components/help/HelpResultCard";

export const metadata = {
  title: "Communities · Intimacy & Sex Therapy Library",
  description:
    "Find affirming, inclusive communities — local groups and online spaces — for intimacy, sexual health, LGBTQ+, asexual, trans, poly, kink-aware, and disability-inclusive support.",
};

export const dynamic = "force-dynamic";

const VALID_AFFIRMING: AffirmingFilter[] = ["lgbtq", "trans", "ace"];
const VALID_SCOPE: CommunityScope[] = ["local", "online", "both"];

function parseAffirming(raw: string | undefined): AffirmingFilter[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AffirmingFilter => (VALID_AFFIRMING as string[]).includes(s));
}

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const str = (k: string) =>
    typeof searchParams[k] === "string" ? (searchParams[k] as string) : undefined;

  const country = str("country") || "IN";
  const state = str("state");
  const locality = str("locality");
  const topic = str("topic");
  const scopeRaw = str("scope");
  const scope: CommunityScope = (VALID_SCOPE as string[]).includes(scopeRaw ?? "")
    ? (scopeRaw as CommunityScope)
    : "both";
  const affirming = parseAffirming(str("affirming"));
  const submitted = str("go") === "1";

  const agg = aggregationConfigured();
  const aggregated =
    submitted && topic && agg.any
      ? await searchCommunities({ country, state, locality, topicId: topic, scope, affirming })
      : null;

  return (
    <div className="container-page py-10 max-w-5xl">
      <header className="mb-6 max-w-3xl">
        <p className="pill-accent w-fit">Find help</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">Communities</h1>
        <p className="mt-2 text-ink-600">
          Belonging is part of healing. Search affirming, inclusive communities — local groups and
          online spaces — across the full spectrum of orientation, gender, relationship structure,
          and ability. Everyone deserves love and intimacy.
        </p>
        <p className="mt-2 text-sm text-ink-400">
          If you&apos;re in immediate crisis, the floating button at the bottom right has local
          hotlines.
        </p>
      </header>

      <FindHelpTabs />

      <HelpSearchForm
        mode="community"
        initial={{ country, state, locality, topic, scope, affirming }}
        localEnabled={agg.places}
      />

      <section className="mt-10">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-xl text-ink-900">Communities</h2>
          <span className="pill-plum">Public listings</span>
        </div>
        <p className="mt-1 text-sm text-ink-500">
          Local groups via Google Maps and online communities from across the web, ranked for
          activity, reputation, and inclusivity. Not endorsed by us — explore at your own comfort.
        </p>

        {!agg.any ? (
          <div className="mt-4 card p-6 text-sm text-ink-600">
            Community search isn&apos;t configured yet. Please check back soon.
          </div>
        ) : !submitted || !topic ? (
          <div className="mt-4 card p-6 text-sm text-ink-600">
            Pick a topic, where to look, and a location above, then search.
          </div>
        ) : aggregated && aggregated.results.length > 0 ? (
          <>
            <ul className="mt-4 grid gap-4 md:grid-cols-2">
              {aggregated.results.map((r) => (
                <li key={r.ref}>
                  <HelpResultCard result={r} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-400">
              Showing communities for {topicById(topic)?.label ?? topic}
              {aggregated.cached ? " · cached" : ""}. Spotted something wrong? Use “Report” on any
              card.
            </p>
          </>
        ) : (
          <div className="mt-4 card p-6 text-sm text-ink-600">
            No communities matched yet. Try “Local + online”, a broader topic, or a nearby city.
          </div>
        )}
      </section>
    </div>
  );
}
