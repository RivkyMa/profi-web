"use client";

import { Badge, Button, Container } from "@/components/ui";
import { HeroSculpture } from "@/components/three/HeroSculpture";

const FACTS = [
  ["01", "Fully funded", "Principal, tokens and premium held in escrow."],
  ["02", "Defined outcomes", "Know the cash and token outcomes before depositing."],
  ["03", "No leverage", "No lending or reuse of market collateral."],
] as const;

export function Hero() {
  const whitepaperUrl = process.env.NEXT_PUBLIC_WHITEPAPER_URL;
  return (
    <section id="hero" aria-labelledby="hero-title" className="pt-24 pb-6 lg:pt-28 lg:pb-8">
      <Container>
        <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
          <div className="flex flex-col items-start gap-5">
            <Badge tone="pulse" dot>Demo / Mock data</Badge>
            <h1 id="hero-title" className="animate-rise-soft max-w-[650px] font-display text-[clamp(38px,4.4vw,64px)] leading-[1.06] tracking-[-0.045em]">
              Protection for owners.<br /><span className="text-ink-2">Premium for holders.</span>
            </h1>
            <p className="max-w-lg text-[clamp(16px,1.4vw,18px)] leading-relaxed text-ink-2">
              A structured-finance platform on Robinhood Chain. Asset owners buy conditional protection. Stablecoin holders earn conditional premium. Both sides fund the same market.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button href="/app/earn">Launch App (Mock)</Button>
              <Button href={whitepaperUrl || "#how"} variant="secondary">
                {whitepaperUrl ? "Read Whitepaper" : "How it works"}
              </Button>
            </div>
            <p className="text-xs text-ink-3">Explore with simulated data. No real funds required.</p>
          </div>
          <figure className="min-w-0">
            <HeroSculpture />
            <figcaption className="mx-auto flex max-w-xs items-center justify-center gap-4 border-t border-hair-3 pt-4 font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">
              <span className="text-pulse">Earn</span><span aria-hidden>—</span><span>One escrow</span><span aria-hidden>—</span><span className="text-violet-light">Protect</span>
            </figcaption>
          </figure>
        </div>
        <dl className="mt-8 grid gap-5 border-y border-hair-2 py-5 sm:grid-cols-3 sm:gap-8">
          {FACTS.map(([index, title, text]) => (
            <div key={index} className="flex gap-3">
              <span aria-hidden className="pt-0.5 font-mono text-[10px] text-ink-3">{index}</span>
              <div><dt className="text-sm font-medium">{title}</dt><dd className="mt-1 text-xs leading-relaxed text-ink-2">{text}</dd></div>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
