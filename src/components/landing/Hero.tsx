"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Badge, Button } from "@/components/ui";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const FACTS = [
  "Fully funded by the market escrow",
  "No lending, leverage or rehypothecation",
  "Every outcome previewed before you deposit",
] as const;

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const whitepaperUrl = process.env.NEXT_PUBLIC_WHITEPAPER_URL;

  // As the hero scrolls away the copy drifts up and fades, while the shield
  // (see ShieldChoreography) glides to the next stop.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(content.current, {
          y: -90,
          autoAlpha: 0.1,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom 25%",
            scrub: true,
          },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      id="hero"
      ref={root}
      className="relative flex min-h-dvh items-end px-[var(--gutter)] pt-28 pb-16 lg:items-center"
    >
      <div className="mx-auto w-full max-w-[var(--max)]">
        <div ref={content} className="flex max-w-xl flex-col items-start gap-6">
          <Badge
            tone="pulse"
            dot
            className="animate-rise"
            style={{ "--delay": "0ms" } as React.CSSProperties}
          >
            Testnet / Mock data
          </Badge>
          <h1
            className="animate-rise-soft font-display text-display leading-[1] tracking-[-0.02em]"
            style={{ "--delay": "80ms" } as React.CSSProperties}
          >
            Protection for owners. Premium for holders.
          </h1>
          <p
            className="animate-rise-soft text-lead text-ink-2"
            style={{ "--delay": "180ms" } as React.CSSProperties}
          >
            PROFI is a structured-finance platform on Robinhood Chain. Asset
            owners buy conditional protection; stablecoin holders earn
            conditional premium. Every obligation is funded in full by the
            market&apos;s own escrow.
          </p>
          <div
            className="animate-rise flex flex-wrap gap-3 pt-2"
            style={{ "--delay": "280ms" } as React.CSSProperties}
          >
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
          <ul
            className="animate-rise mt-4 flex flex-col gap-2 font-mono text-xs tracking-[0.04em] text-ink-3"
            style={{ "--delay": "380ms" } as React.CSSProperties}
          >
            {FACTS.map((fact) => (
              <li key={fact} className="flex items-center gap-2.5">
                <span aria-hidden className="h-px w-5 bg-hair-4" />
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
