"use client";

import { useState } from "react";

export type TopVideo = {
  draftId: string;
  youtubeId: string;
  title: string;
  views: number;
};

/**
 * Lightweight YouTube previews. Renders a thumbnail "facade" with a play
 * overlay and only mounts the (heavy, tracking) YouTube iframe once the user
 * clicks — keeps the landing page fast and cookie-light until interaction.
 */
export function TopVideos({ videos }: { videos: TopVideo[] }) {
  if (!videos || videos.length === 0) return null;
  return (
    <section className="container-page py-14" aria-labelledby="top-videos-heading">
      <header className="mb-6">
        <h2 id="top-videos-heading" className="font-serif text-3xl text-ink-900">
          Most-watched on our channel
        </h2>
        <p className="mt-2 text-ink-600 max-w-prose">
          Short, clinician-reviewed explainers. Tap to play.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <VideoFacade key={v.draftId} video={v} />
        ))}
      </div>
    </section>
  );
}

function VideoFacade({ video }: { video: TopVideo }) {
  const [playing, setPlaying] = useState(false);
  const thumb = `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`;

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-video bg-bg">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play: ${video.title}`}
            className="group absolute inset-0 h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <span
              aria-hidden
              className="absolute inset-0 grid place-items-center bg-black/20 transition-colors group-hover:bg-black/30"
            >
              <span className="grid h-14 w-14 place-items-center rounded-full bg-warm/90 text-white shadow-lg transition-transform group-hover:scale-110">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="p-4">
        <p className="text-sm text-ink-800 line-clamp-2" title={video.title}>
          {video.title}
        </p>
        <div className="mt-2 flex items-center justify-end text-xs text-ink-400">
          <a
            href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink-900"
          >
            Watch on YouTube ↗
          </a>
        </div>
      </div>
    </div>
  );
}
