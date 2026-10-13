import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Static stand-in for the main 3D object (the coin monument), used (a) as the
 * server-rendered first paint, (b) while the model loads, and (c) permanently
 * on devices that get no WebGL scene. Same silhouette and palette as the
 * model: a coin on a plinth, graphite with a cyan-to-magenta rim.
 */
export function ShieldFallback({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const face = `${uid}-face`;
  const rim = `${uid}-rim`;

  return (
    <svg
      viewBox="-1 -1.15 2 2.3"
      aria-hidden
      focusable="false"
      // Width comes from the caller; w-full is only the default. Putting both
      // on one element lets whichever utility sorts later win, not the caller.
      className={cn("h-auto", className ?? "w-full")}
    >
      <defs>
        <linearGradient id={face} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3a43" />
          <stop offset="1" stopColor="#0f0f12" />
        </linearGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#35d8cf" />
          <stop offset="1" stopColor="#c42bbd" />
        </linearGradient>
      </defs>

      {/* Plinth: a thin slab on a wider block. */}
      <path
        d="M-0.54 0.56 L0.54 0.56 L0.72 1.02 L-0.72 1.02Z"
        fill={`url(#${face})`}
        stroke={`url(#${rim})`}
        strokeWidth="0.02"
        strokeLinejoin="round"
      />
      <path
        d="M-0.46 0.44 L0.46 0.44 L0.52 0.54 L-0.52 0.54Z"
        fill={`url(#${face})`}
        stroke={`url(#${rim})`}
        strokeWidth="0.02"
        strokeLinejoin="round"
      />

      {/* Coin. */}
      <circle
        cx="0"
        cy="-0.32"
        r="0.72"
        fill={`url(#${face})`}
        stroke="#4a4a54"
        strokeWidth="0.03"
      />
      <circle
        cx="0"
        cy="-0.32"
        r="0.62"
        fill="#0a0a0b"
        fillOpacity="0.55"
        stroke={`url(#${rim})`}
        strokeWidth="0.022"
      />

      {/* Coin symbol: a B with two ticks above and below. */}
      <g fill="#1b1b20" stroke="#8a8a94" strokeWidth="0.012" strokeLinejoin="round">
        <path d="M-0.12 -0.76 h0.08 v0.14 h-0.08Z M0.02 -0.76 h0.08 v0.14 h-0.08Z" />
        <path d="M-0.12 -0.02 h0.08 v0.14 h-0.08Z M0.02 -0.02 h0.08 v0.14 h-0.08Z" />
        <path
          fillRule="evenodd"
          d="M-0.32 -0.62 L0.06 -0.62 C0.3 -0.62 0.3 -0.34 0.12 -0.32 C0.36 -0.3 0.36 -0.02 0.08 -0.02 L-0.32 -0.02 L-0.32 -0.1 L-0.24 -0.1 L-0.24 -0.54 L-0.32 -0.54Z M-0.1 -0.5 L0.03 -0.5 C0.14 -0.5 0.14 -0.38 0.03 -0.38 L-0.1 -0.38Z M-0.1 -0.26 L0.05 -0.26 C0.18 -0.26 0.18 -0.14 0.05 -0.14 L-0.1 -0.14Z"
        />
      </g>
    </svg>
  );
}
