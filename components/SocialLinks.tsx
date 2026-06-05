import { brandSocialLinks, type BrandSocialPlatform } from "@/lib/brand/tokens";

/**
 * Renders the brand's configured social profiles as accessible icon links.
 * Returns null when no social URLs are configured (NEXT_PUBLIC_*_URL unset),
 * so it's safe to drop into any layout.
 */

function Icon({ platform }: { platform: BrandSocialPlatform }) {
  const common = {
    width: 30,
    height: 30,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false,
  } as const;
  switch (platform) {
    case "youtube":
      // Authentic YouTube red badge with white play triangle.
      return (
        <svg {...common}>
          <path
            fill="#FF0000"
            d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z"
          />
          <path fill="#fff" d="M9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" />
        </svg>
      );
    case "facebook":
      // Authentic Facebook: solid blue circle with white "f".
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="12" fill="#1877F2" />
          <path
            fill="#fff"
            d="M16.5 12.4l.59-3.86h-3.7V6.03c0-1.06.52-2.08 2.18-2.08h1.68V.66S15.72.4 14.3.4C11.32.4 9.37 2.2 9.37 5.47v3.07H5.98v3.86h3.39V22a13.5 13.5 0 0 0 4.17 0v-9.6h3.11Z"
          />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common}>
          <path
            fill="#0A66C2"
            d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2ZM8 19H5V9h3v10ZM6.5 7.7a1.8 1.8 0 1 1 0-3.5 1.8 1.8 0 0 1 0 3.5ZM19 19h-3v-5.3c0-1.3-.5-2.1-1.6-2.1-.9 0-1.4.6-1.6 1.2-.1.2-.1.5-.1.8V19h-3V9h3v1.3a3 3 0 0 1 2.7-1.5c2 0 3.2 1.3 3.2 4V19Z"
          />
        </svg>
      );
    case "instagram":
      // Authentic Instagram gradient rounded-square with white camera glyph.
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="ig-gradient" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset="0.25" stopColor="#FA7E1E" />
              <stop offset="0.5" stopColor="#D62976" />
              <stop offset="0.75" stopColor="#962FBF" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="24" height="24" rx="6" fill="url(#ig-gradient)" />
          <rect
            x="5"
            y="5"
            width="14"
            height="14"
            rx="4.5"
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="3.6" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="16.6" cy="7.4" r="1.1" fill="#fff" />
        </svg>
      );
    default:
      return null;
  }
}

export function SocialLinks({ className = "" }: { className?: string }) {
  const links = brandSocialLinks();
  if (links.length === 0) return null;
  return (
    <ul className={`flex items-center gap-3 ${className}`}>
      {links.map((l) => (
        <li key={l.platform}>
          <a
            href={l.url}
            target="_blank"
            rel="me noopener noreferrer"
            aria-label={`${l.label} (opens in a new tab)`}
            title={l.label}
            className="inline-flex rounded-[7px] transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <Icon platform={l.platform} />
          </a>
        </li>
      ))}
    </ul>
  );
}
