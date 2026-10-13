"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

export interface CurvePoint {
  price: number;
  earn: number;
  protect: number;
}

interface PayoffChartProps {
  points: readonly CurvePoint[];
  value: number;
  onChange: (price: number) => void;
  barrier: number;
  strike: number;
  step: number;
  label: string;
  /** x-axis tick values. Defaults to the min, strike and max. */
  ticks?: readonly number[];
}

const SERIES = [
  { key: "earn", name: "Earn", color: "var(--series-earn)" },
  { key: "protect", name: "Protect", color: "var(--series-protect)" },
] as const;

const niceStep = (range: number) => {
  const target = range / 5;
  const options = [500, 1000, 2000, 2500, 5000, 10000];
  return options.find((o) => o >= target) ?? options[options.length - 1];
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const signed = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("en-US")}`;

/**
 * Earn and Protect result (profit / loss in stablecoin) against the final
 * price. One y-axis, 2px lines, hairline grid, labels in text tokens. Each
 * series is split at the barrier so the cliff is drawn as a gap, not a slope.
 *
 * The SVG is drawn in real CSS pixels (its width is measured), so axis text
 * stays 11px on a phone instead of shrinking with a scaled viewBox. Pointer /
 * touch drag on the plot sets the price; the range input next to it is the
 * keyboard path.
 */
export function PayoffChart({
  points,
  value,
  onChange,
  barrier,
  strike,
  step,
  label,
  ticks,
}: PayoffChartProps) {
  const figureRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const el = figureRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const W = width;
  const H = Math.round(Math.min(340, Math.max(240, width * 0.5)));
  const left = width < 480 ? 52 : 68;
  const top = 30;
  const right = 14;
  const bottom = 34;
  const PW = W - left - right;
  const PH = H - top - bottom;

  const xs = points.map((p) => p.price);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const all = points.flatMap((p) => [p.earn, p.protect, 0]);
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const tick = niceStep(rawMax - rawMin);
  const yMin = Math.floor(rawMin / tick) * tick;
  const yMax = Math.ceil(rawMax / tick) * tick;
  const x = (p: number) => left + ((p - xMin) / (xMax - xMin)) * PW;
  const y = (v: number) => top + (1 - (v - yMin) / (yMax - yMin)) * PH;
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += tick) yTicks.push(v);

  const pathFor = (key: "earn" | "protect", from: number, to: number) =>
    points
      .filter((p) => p.price >= from && p.price < to)
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${x(p.price).toFixed(1)} ${y(p[key]).toFixed(1)}`,
      )
      .join("");

  const priceFromEvent = (event: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return value;
    const rect = svg.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const raw = xMin + ((px - left) / PW) * (xMax - xMin);
    const snapped = Math.round(raw / step) * step;
    return Math.min(xMax, Math.max(xMin, snapped));
  };

  const current =
    points.find((p) => Math.abs(p.price - value) < step / 2) ?? points[0];

  return (
    <figure ref={figureRef} className="m-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
        <ul className="flex flex-wrap items-center gap-5">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-ink-2">
              <span
                aria-hidden
                className="h-0.5 w-5 rounded-full"
                style={{ background: s.color }}
              />
              {s.name}
            </li>
          ))}
        </ul>
        <p className="font-mono text-xs text-ink-2" aria-live="polite">
          At {value.toFixed(2)}:{" "}
          <span className="text-ink-1">
            Earn {signed(Math.round(current.earn))}
          </span>
          <span className="mx-2 text-ink-3">/</span>
          <span className="text-ink-1">
            Protect {signed(Math.round(current.protect))}
          </span>
        </p>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        className="block h-auto w-full max-w-full touch-pan-y select-none"
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          onChange(priceFromEvent(event));
        }}
        onPointerMove={(event) => {
          if (dragging.current) onChange(priceFromEvent(event));
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        {/* Horizontal grid + y labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={left}
              x2={W - right}
              y1={y(v)}
              y2={y(v)}
              stroke={
                v === 0 ? "rgb(255 255 255 / 0.24)" : "rgb(255 255 255 / 0.07)"
              }
              strokeWidth={1}
            />
            <text
              x={left - 8}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
              className="fill-ink-3 font-mono text-[11px]"
            >
              {signed(v)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {(ticks ?? [xMin, strike, xMax]).map((p) => (
          <text
            key={p}
            x={x(p)}
            y={H - 12}
            textAnchor="middle"
            className="fill-ink-3 font-mono text-[11px]"
          >
            {Number.isInteger(p) ? p : p.toFixed(1)}
          </text>
        ))}

        {/* Reference lines: barrier and strike */}
        {[
          {
            at: barrier,
            text: `Barrier ${fmt(barrier)}`,
            anchor: "end" as const,
          },
          {
            at: strike,
            text: `Strike ${fmt(strike)}`,
            anchor: "middle" as const,
          },
        ].map((ref) => (
          <g key={ref.text}>
            <line
              x1={x(ref.at)}
              x2={x(ref.at)}
              y1={top - 6}
              y2={H - bottom}
              stroke="rgb(255 255 255 / 0.24)"
              strokeWidth={1}
            />
            <text
              x={x(ref.at) + (ref.anchor === "end" ? -4 : 0)}
              y={top - 12}
              textAnchor={ref.anchor}
              className="fill-ink-2 font-mono text-[11px]"
            >
              {ref.text}
            </text>
          </g>
        ))}

        {/* Series: split at the barrier so the discontinuity stays a gap */}
        {SERIES.map((s) => (
          <g key={s.key}>
            {[pathFor(s.key, xMin, barrier), pathFor(s.key, barrier, xMax + step)].map(
              (d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ),
            )}
          </g>
        ))}

        {/* Selected price: crosshair + end dots with a surface ring */}
        <line
          x1={x(value)}
          x2={x(value)}
          y1={top}
          y2={H - bottom}
          stroke="rgb(255 255 255 / 0.5)"
          strokeWidth={1}
        />
        {SERIES.map((s) => (
          <circle
            key={s.key}
            cx={x(value)}
            cy={y(current[s.key])}
            r={5}
            fill={s.color}
            stroke="var(--color-ground-2)"
            strokeWidth={2}
          />
        ))}
      </svg>
    </figure>
  );
}
