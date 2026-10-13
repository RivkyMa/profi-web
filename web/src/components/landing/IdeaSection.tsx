"use client";

import { useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Badge, Card, Section } from "@/components/ui";
import { deriveTerms } from "@/lib/payoff";
import { referenceMarket } from "@/lib/mock/reference-market";
import { QUOTE } from "@/lib/mock/markets";
import { formatAmount, formatTokens } from "@/lib/format";

gsap.registerPlugin(useGSAP, ScrollTrigger);
const terms = deriveTerms(referenceMarket);

/** Funding flow without a pinned scroll interval or hidden explanatory copy. */
export function IdeaSection() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add({ desktop: "(min-width: 768px)", motion: "(prefers-reduced-motion: no-preference)" }, (context) => {
      if (!context.conditions?.motion) return;
      const horizontal = context.conditions.desktop;
      const timeline = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 70%", once: true } });
      timeline.from("[data-transfer]", {
        opacity: 0.15,
        x: horizontal ? (i: number) => i === 0 ? -18 : 18 : 0,
        y: horizontal ? 0 : (i: number) => i === 0 ? -14 : 14,
        duration: 0.9, stagger: 0.15, ease: "power2.out",
      }).from("[data-escrow-lock]", { opacity: 0.3, scale: 0.85, duration: 0.45 }, "-=0.2");
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <Section id="idea" ref={root} eyebrow="The core idea"
      title="Two sides. One escrow."
      description="Earn supplies stablecoin. Protect supplies the asset and a premium reserve. Both sides fund the same market before it starts."
      className="relative bg-ground-0">
      <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Card padding="lg" className="flex flex-col gap-4">
          <Badge tone="pulse" className="self-start">Earn</Badge>
          <h3 className="font-display text-h3">You hold stablecoin.</h3>
          <p className="font-mono text-lg text-pulse">{formatAmount(terms.principal)} {QUOTE}</p>
          <p className="text-sm text-ink-2">Receive conditional premium. A final price below the barrier returns underlying tokens, which can mean a large loss.</p>
        </Card>
        <div data-transfer className="flex items-center justify-center text-pulse" aria-hidden>
          <ArrowRight className="hidden size-5 md:block" /><ArrowDown className="size-5 md:hidden" />
        </div>
        <Card padding="lg" className="flex flex-col items-center justify-center gap-4 border-pulse-deep/50 bg-ground-2 text-center">
          <LockKeyhole data-escrow-lock className="size-7 text-pulse" aria-hidden />
          <h3 className="font-display text-h3">Market escrow</h3>
          <p className="text-sm text-ink-2">Principal + underlying tokens + premium reserve</p>
          <p className="border-t border-hair-2 pt-4 text-xs text-ink-2">No lending, leverage or reuse of collateral.</p>
        </Card>
        <div data-transfer className="flex items-center justify-center text-violet-light" aria-hidden>
          <ArrowLeft className="hidden size-5 md:block" /><ArrowDown className="size-5 rotate-180 md:hidden" />
        </div>
        <Card padding="lg" className="flex flex-col gap-4">
          <Badge tone="violet" className="self-start">Protect</Badge>
          <h3 className="font-display text-h3">You hold the asset.</h3>
          <p className="font-mono text-lg text-violet-light">{formatTokens(terms.tokens)} tokens <span className="block text-sm">+ {formatAmount(terms.reserve)} {QUOTE} reserve</span></p>
          <p className="text-sm text-ink-2">Pay for qualifying coupons. A final price below the barrier settles your tokens at the strike. Losses above the barrier are not protected.</p>
        </Card>
      </div>
      <p className="mt-5 text-xs text-ink-3">Illustrative funding for one matched lot. All figures are mock data. Fully funded does not mean risk-free.</p>
    </Section>
  );
}
