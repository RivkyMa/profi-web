import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardTag = "div" | "article" | "section" | "li";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardTag;
  /** plain: flat surface. raised: lifted with depth. outline: hairline only. */
  variant?: "plain" | "raised" | "outline";
  padding?: "none" | "sm" | "md" | "lg";
  /** Adds a hover treatment. Use when the whole card is a link or button. */
  interactive?: boolean;
  children: ReactNode;
}

const VARIANTS = {
  plain: "bg-ground-2 border border-hair-1",
  raised: "bg-ground-2 border border-hair-2 shadow-depth",
  outline: "border border-hair-3 bg-transparent",
} as const;

const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
} as const;

export function Card({
  as: Tag = "div",
  variant = "raised",
  padding = "md",
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      {...rest}
      className={cn(
        "rounded-xl",
        VARIANTS[variant],
        PADDING[padding],
        interactive &&
          "transition-[transform,border-color,background-color] duration-300 ease-premium hover:border-hair-4 hover:bg-ground-3 motion-safe:hover:-translate-y-0.5",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
