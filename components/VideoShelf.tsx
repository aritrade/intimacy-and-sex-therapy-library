import Link from "next/link";
import type { CatalogItem } from "@/lib/db/queries";
import { VideoThumbnail } from "@/components/MediaPlayer";

/**
 * Server component. Renders a horizontally-scrollable shelf of featured
 * videos. Clicking a card opens the full Reader Mode at `/resource/<slug>`
 * where the YouTube/TED player is embedded.
 *
 * If `items` is empty (no DB or no videos yet), the shelf renders nothing.
 */
export function VideoShelf({ items }: { items: CatalogItem[] }) {
  if (items.length === 0) return null;

  return (
    <section id="videos" className="bg-elevated/30 border-y border-border scroll-mt-16">
      <div className="container-page py-12">
        <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="pill-coral w-fit">Watch &amp; learn</p>
            <h2 className="mt-3 font-serif text-3xl text-ink-900">
              Short videos from voices we trust
            </h2>
            <p className="mt-1 text-ink-600 max-w-prose">
              TED talks and clinical institutions only — no influencer takes. Each player
              is privacy-respecting (YouTube nocookie / TED official embeds).
            </p>
          </div>
          <Link
            href="/catalog?kind=video"
            className="text-sm text-accent-ink hover:underline"
          >
            See all videos →
          </Link>
        </header>

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={`/resource/${it.slug}`}
                className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
              >
                <VideoThumbnail
                  externalUrl={it.externalUrl}
                  title={it.title}
                  className="shadow-sm group-hover:shadow-lg transition-shadow"
                />
                <div className="mt-3">
                  <p className="text-xs text-ink-400 flex items-center gap-2">
                    <span>{it.source.name}</span>
                    {it.tagNames.includes("beginner") && (
                      <span className="pill-accent text-[10px]">beginner</span>
                    )}
                    {it.tagNames.includes("intermediate") && (
                      <span className="pill text-[10px]">intermediate</span>
                    )}
                  </p>
                  <h3 className="mt-1 font-serif text-base text-ink-900 group-hover:text-accent-ink line-clamp-2">
                    {it.title}
                  </h3>
                  {it.summary && (
                    <p className="mt-1 text-sm text-ink-600 line-clamp-2">{it.summary}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
