"use client";

import {
  cloneElement,
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  content: ReactNode;
  side?: "top" | "bottom";
  /** The single focusable element the tooltip describes. */
  children: ReactElement<{ "aria-describedby"?: string }>;
  className?: string;
}

const SIDE = {
  top: "bottom-full mb-2",
  bottom: "top-full mt-2",
} as const;

/**
 * Hover and keyboard-focus tooltip. The child receives aria-describedby, so
 * the text is announced when it is focused. Escape dismisses it.
 *
 * Positioned relative to its wrapper (no portal): do not place it inside an
 * element with overflow:hidden that would clip it.
 */
export function Tooltip({
  content,
  side = "top",
  children,
  className,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Escape") setOpen(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={onKeyDown}
    >
      {cloneElement(children, { "aria-describedby": id })}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2",
          "rounded-md border border-hair-3 bg-ground-4 px-3 py-2 text-left text-xs leading-snug text-ink-1 shadow-depth",
          "transition-[opacity,transform] duration-150 ease-premium",
          SIDE[side],
          open ? "opacity-100" : "translate-y-0.5 opacity-0",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
