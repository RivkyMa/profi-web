import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "pulse" | "violet" | "gain" | "loss" | "steel";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Leading status dot. */
  dot?: boolean;
  children: ReactNode;
}

const TONES: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: {
    box: "border-hair-3 bg-ground-3 text-ink-2",
    dot: "bg-ink-3",
  },
  pulse: {
    box: "border-pulse-deep/70 bg-pulse-dim text-pulse-light",
    dot: "bg-pulse",
  },
  violet: {
    box: "border-violet/40 bg-violet-dim text-violet-light",
    dot: "bg-violet-light",
  },
  gain: {
    box: "border-gain/30 bg-gain/10 text-gain",
    dot: "bg-gain",
  },
  loss: {
    box: "border-loss/30 bg-loss/10 text-loss",
    dot: "bg-loss",
  },
  steel: {
    box: "border-steel/30 bg-steel/10 text-steel",
    dot: "bg-steel",
  },
};

/** Small mono label. Always carries text: color is never the only signal. */
export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "font-mono text-[11px] leading-none font-medium tracking-[0.08em] whitespace-nowrap uppercase",
        t.box,
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />}
      {children}
    </span>
  );
}
