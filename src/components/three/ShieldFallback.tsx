import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Static shield used (a) as the server-rendered first paint, (b) while the
 * model loads, and (c) permanently on devices that get no WebGL scene.
 * Same silhouette as the procedural placeholder, same palette as the model.
 */
export function ShieldFallback({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const face = `${uid}-face`;
  const rim = `${uid}-rim`;
  const core = `${uid}-core`;

  return (
    <svg
      viewBox="-1 -1.15 2 2.3"
      aria-hidden
      focusable="false"
      className={cn("h-auto w-full", className)}
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
        <linearGradient id={core} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#72eee4" />
          <stop offset="1" stopColor="#c42bbd" />
        </linearGradient>
      </defs>
      <path
        d="M0 -1 C0.35 -0.86 0.7 -0.8 0.8 -0.8 L0.8 -0.1 C0.8 0.45 0.4 0.8 0 1 C-0.4 0.8 -0.8 0.45 -0.8 -0.1 L-0.8 -0.8 C-0.7 -0.8 -0.35 -0.86 0 -1Z"
        fill={`url(#${face})`}
        stroke={`url(#${rim})`}
        strokeWidth="0.03"
      />
      <path
        d="M0 -0.74 C0.26 -0.65 0.52 -0.6 0.6 -0.6 L0.6 -0.1 C0.6 0.32 0.3 0.6 0 0.76 C-0.3 0.6 -0.6 0.32 -0.6 -0.1 L-0.6 -0.6 C-0.52 -0.6 -0.26 -0.65 0 -0.74Z"
        fill="#0a0a0b"
        fillOpacity="0.55"
      />
      <path d="M0 -0.5 L0.2 0 L0 0.5 L-0.2 0Z" fill={`url(#${core})`} />
    </svg>
  );
}
