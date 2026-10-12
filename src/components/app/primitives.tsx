import type { ReactNode } from "react";
import { TriangleAlert, Info } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  media,
}: {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  /** Optional visual (a small 3D accent) shown on the right on wide screens. */
  media?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-6">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 font-mono text-xs font-medium tracking-[0.14em] text-pulse uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-h2 leading-[1.02] tracking-[-0.02em]">
          {title}
        </h1>
        <p className="mt-3 text-lead text-ink-2">{description}</p>
      </div>
      {media && <div className="hidden shrink-0 md:block">{media}</div>}
    </header>
  );
}

/** Callout for warnings that must be read before acting. */
export function Notice({
  tone = "warn",
  title,
  children,
}: {
  tone?: "warn" | "info";
  title?: string;
  children: ReactNode;
}) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      role={tone === "warn" ? "note" : undefined}
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm",
        tone === "warn"
          ? "border-loss/40 bg-loss/10"
          : "border-pulse-deep/50 bg-pulse-dim",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warn" ? "text-loss" : "text-pulse",
        )}
      />
      <div className="text-ink-1">
        {title && <p className="mb-1 font-medium">{title}</p>}
        <div className="text-ink-2">{children}</div>
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
        {label}
      </dt>
      <dd className="font-mono text-lg text-ink-1 tabular-nums">{value}</dd>
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
