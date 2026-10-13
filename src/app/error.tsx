"use client";

import { Button } from "@/components/ui";

/** Last-resort boundary: a failed render must never leave a blank page. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-[var(--gutter)] text-center"
    >
      <p className="font-mono text-xs tracking-[0.14em] text-loss uppercase">
        Something went wrong
      </p>
      <h1 className="font-display text-h2 leading-[1.1] tracking-[-0.02em]">
        This page failed to render.
      </h1>
      <p className="max-w-md text-ink-2">
        It is a bug on our side, not something you did. Try again, or go back
        to the start.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button href="/" variant="secondary">
          Back to PROFI
        </Button>
      </div>
    </main>
  );
}
