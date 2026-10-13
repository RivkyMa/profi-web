import type { Metadata } from "next";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-[var(--gutter)] text-center"
    >
      <p className="font-mono text-xs tracking-[0.14em] text-pulse uppercase">
        Error 404
      </p>
      <h1 className="font-display text-display leading-[1] tracking-[-0.02em]">
        Nothing here.
      </h1>
      <p className="max-w-md text-lead text-ink-2">
        This page does not exist. The landing page and the mock app are one
        click away.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button href="/" size="lg">
          Back to PROFI
        </Button>
        <Button href="/app/earn" size="lg" variant="secondary">
          Open the mock app
        </Button>
      </div>
    </main>
  );
}
