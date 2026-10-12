import {
  useId,
  type ComponentPropsWithRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/** Centers content to the site max width with the responsive side gutter. */
export function Container({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        "mx-auto w-full max-w-[var(--max)] px-[var(--gutter)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface SectionProps
  extends Omit<ComponentPropsWithRef<"section">, "title"> {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  /** Remove the vertical section padding (for pinned / full-height scenes). */
  flush?: boolean;
  children?: ReactNode;
}

/**
 * Page section: container, vertical rhythm and an optional header
 * (eyebrow / title / description). When a title is given the section is
 * labelled by it, so it shows up as a named landmark.
 */
export function Section({
  eyebrow,
  title,
  description,
  align = "left",
  flush = false,
  className,
  children,
  ...rest
}: SectionProps) {
  const titleId = useId();
  const hasHeader = Boolean(eyebrow || title || description);

  return (
    <section
      {...rest}
      aria-labelledby={title ? titleId : rest["aria-labelledby"]}
      className={cn(!flush && "py-[var(--section)]", className)}
    >
      <Container>
        {hasHeader && (
          <header
            className={cn(
              "mb-12 flex max-w-3xl flex-col gap-4",
              align === "center" && "mx-auto items-center text-center",
            )}
          >
            {eyebrow && (
              <p className="font-mono text-xs font-medium tracking-[0.14em] text-pulse uppercase">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2
                id={titleId}
                className="font-display text-h2 leading-[1.02] tracking-[-0.02em] text-ink-1"
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="text-lead text-ink-2">{description}</p>
            )}
          </header>
        )}
        {children}
      </Container>
    </section>
  );
}
