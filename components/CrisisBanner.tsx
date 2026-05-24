import { resourcesForRegion, type CrisisRegion } from "@/lib/safety/crisis-resources";

export function CrisisBanner({
  region = "IN",
  compact = false,
}: {
  region?: CrisisRegion;
  compact?: boolean;
}) {
  const items = resourcesForRegion(region).slice(0, compact ? 3 : 6);
  return (
    <aside
      role="region"
      aria-label="Crisis support resources"
      className="border border-warn/40 bg-warn/5 rounded-lg p-4 text-sm text-ink-800"
    >
      <p className="font-medium text-ink-900">
        If you are in crisis, you are not alone.
      </p>
      <p className="text-ink-600 mt-1">
        These services are free, confidential, and staffed by trained humans.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-3 gap-y-0.5 items-baseline">
            <span className="font-medium text-ink-900">{r.name}</span>
            {r.phone && (
              <a
                href={`tel:${r.phone.replace(/\s+/g, "")}`}
                className="underline text-accent-ink"
              >
                {r.phone}
              </a>
            )}
            {r.url && (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-accent-ink"
              >
                website
              </a>
            )}
            <span className="text-ink-400 text-xs">{r.hours}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
