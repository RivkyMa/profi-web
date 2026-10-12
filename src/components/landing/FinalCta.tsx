import { Button } from "@/components/ui";

/** Closing call to action. The shield sits centered behind it (stop "cta"). */
export function FinalCta() {
  const whitepaperUrl = process.env.NEXT_PUBLIC_WHITEPAPER_URL;

  return (
    <section
      id="cta"
      aria-labelledby="cta-title"
      className="relative flex min-h-dvh items-end px-[var(--gutter)] pt-24 pb-20"
    >
      <div className="mx-auto flex w-full max-w-[var(--max)] flex-col items-center gap-6 text-center">
        <h2
          id="cta-title"
          className="max-w-3xl font-display text-h2 leading-[1.02] tracking-[-0.02em] text-balance"
        >
          Walk through a market from template to claim.
        </h2>
        <p className="max-w-xl text-lead text-ink-2">
          The mock app lets you create a market, subscribe on both sides, put it
          in a vault and watch it settle. No wallet and no funds involved.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button href="/app/earn" size="lg">
            Launch App (Mock)
          </Button>
          <Button
            href={whitepaperUrl || "#"}
            disabled={!whitepaperUrl}
            variant="secondary"
            size="lg"
          >
            Read Whitepaper
          </Button>
        </div>
      </div>
    </section>
  );
}
