/**
 * Tiny dependency-free sparkline. Server-renderable (no client JS).
 * Plots `values` left-to-right, scaled to [0, max]. A single point renders as
 * a dot. Colours come from currentColor so the parent controls the hue.
 */
export function Sparkline({
  values,
  max,
  width = 120,
  height = 32,
  className = "",
}: {
  values: number[];
  max: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length === 0 || max <= 0) return null;

  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const n = values.length;

  const x = (i: number) => (n === 1 ? width / 2 : pad + (i / (n - 1)) * w);
  const y = (v: number) => pad + (1 - Math.min(Math.max(v, 0), max) / max) * h;

  if (n === 1) {
    return (
      <svg width={width} height={height} className={className} aria-hidden role="img">
        <circle cx={x(0)} cy={y(values[0])} r={3} fill="currentColor" />
      </svg>
    );
  }

  const d = values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const lastX = x(n - 1);
  const lastY = y(values[n - 1]);

  return (
    <svg width={width} height={height} className={className} aria-hidden role="img">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
      <circle cx={lastX} cy={lastY} r={2.5} fill="currentColor" />
    </svg>
  );
}
