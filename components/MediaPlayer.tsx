import { resolveEmbed } from "@/lib/media/embed";

/**
 * Embeds a YouTube/TED/Vimeo video on the resource page when the URL is
 * recognised. Falls back to a thumbnail-style "Open at source" card.
 *
 * No client-side JS — pure server-rendered iframe. Privacy-friendly:
 * we use youtube-nocookie.com so YouTube does not set tracking cookies
 * until the user actually presses play.
 */
export function MediaPlayer({
  externalUrl,
  title,
}: {
  externalUrl: string | null | undefined;
  title: string;
}) {
  const embed = resolveEmbed(externalUrl);
  if (!embed) {
    return null;
  }
  return (
    <div className="card overflow-hidden p-0">
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        <iframe
          src={embed.embedUrl}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <div className="px-4 py-2 text-xs text-ink-400 border-t border-border bg-elevated/40">
        {embed.provider === "youtube" && "YouTube — privacy-respecting nocookie embed"}
        {embed.provider === "ted" && "TED — official embed"}
        {embed.provider === "vimeo" && "Vimeo — official embed"}
      </div>
    </div>
  );
}

export function VideoThumbnail({
  externalUrl,
  title,
  className = "",
}: {
  externalUrl: string | null | undefined;
  title: string;
  className?: string;
}) {
  const embed = resolveEmbed(externalUrl);
  if (!embed) return null;

  const fallback = (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-plum/10 via-coral/5 to-accent/10">
      <span className="font-serif text-2xl text-ink-900/70">▶</span>
    </div>
  );

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-elevated ${className}`}
      style={{ aspectRatio: "16 / 9" }}
      aria-label={title}
    >
      {embed.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={embed.thumbnailUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        fallback
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink-900/60 via-ink-900/10 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-ink-900 shadow-lg backdrop-blur transition-transform group-hover:scale-110">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5 ml-0.5"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>
    </div>
  );
}
