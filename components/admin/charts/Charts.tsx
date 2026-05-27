"use client";

/**
 * Brand-themed chart wrappers around Recharts.
 *
 * Why a wrapper layer rather than using Recharts directly in every page:
 *   - Locks our colour palette (accent / teal / coral / plum) so charts
 *     always feel like the same brand.
 *   - Hides the ResponsiveContainer + Tooltip + Cartesian/Polar boilerplate
 *     that gets copy-pasted at every callsite.
 *   - Keeps the SSR boundary clean: all chart components are "use client"
 *     here, server pages just import and pass data.
 *
 * Each chart accepts a `data` array of `{x, y}` (or `{name, value}` for
 * donut) plus optional sub-series for stacked charts.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Brand colour palette. Cycled through for multi-series charts.
// These map to the Tailwind tokens defined in tailwind.config.ts.
const COLORS = [
  "rgb(var(--c-accent))",
  "rgb(var(--c-teal))",
  "rgb(var(--c-coral))",
  "rgb(var(--c-plum))",
  "rgb(var(--c-accent-soft))",
];

const TOOLTIP_STYLE = {
  background: "rgb(var(--c-bg))",
  border: "1px solid rgb(var(--c-border))",
  borderRadius: "10px",
  fontSize: "12px",
  color: "rgb(var(--c-ink-900))",
};

const GRID_COLOR = "rgb(var(--c-ink-200) / 0.4)";
const AXIS_COLOR = "rgb(var(--c-ink-400))";

type Point = { x: string; [series: string]: string | number };

export function LineChartCard({
  data,
  series,
  height = 220,
  yLabel,
}: {
  data: Point[];
  series: Array<{ key: string; label: string }>;
  height?: number;
  yLabel?: string;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="x"
            stroke={AXIS_COLOR}
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke={AXIS_COLOR}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={48}
            label={
              yLabel
                ? { value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: AXIS_COLOR }
                : undefined
            }
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: GRID_COLOR }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaChartCard({
  data,
  series,
  height = 220,
}: {
  data: Point[];
  series: Array<{ key: string; label: string }>;
  height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.6} />
                <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="x" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={48} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: GRID_COLOR }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />}
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarChartCard({
  data,
  series,
  height = 220,
  orientation = "vertical",
}: {
  data: Point[];
  series: Array<{ key: string; label: string }>;
  height?: number;
  orientation?: "vertical" | "horizontal";
}) {
  const horizontal = orientation === "horizontal";
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 60 : -10 }}
        >
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="x" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={100} />
            </>
          ) : (
            <>
              <XAxis dataKey="x" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={48} />
            </>
          )}
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgb(var(--c-ink-200) / 0.3)" }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={COLORS[i % COLORS.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChartCard({
  data,
  height = 220,
  centerLabel,
}: {
  data: Array<{ name: string; value: number }>;
  height?: number;
  centerLabel?: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="rgb(var(--c-bg))"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          // Lift the centred label above the legend at the bottom.
          paddingBottom: "32px",
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 600, color: "rgb(var(--c-ink-900))" }}>
          {total.toLocaleString()}
        </span>
        {centerLabel && (
          <span style={{ fontSize: 11, color: "rgb(var(--c-ink-400))" }}>{centerLabel}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Inline mini-sparkline for in-row trends. No axes, no tooltip — just
 * the shape. Use width:"100%" on the parent.
 */
export function Sparkline({
  values,
  height = 28,
  color = COLORS[0],
}: {
  values: number[];
  height?: number;
  color?: string;
}) {
  if (values.length === 0) {
    return <div style={{ height, color: "rgb(var(--c-ink-400))", fontSize: 11 }}>—</div>;
  }
  const data = values.map((v, i) => ({ x: i, y: v }));
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Line type="monotone" dataKey="y" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
