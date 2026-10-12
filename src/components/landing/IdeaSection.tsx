"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Badge, Card, Container } from "@/components/ui";
import { sceneState } from "@/lib/scene-state";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Core idea. On desktop the section pins and the story advances with scroll:
 * the shield turns to Protect, then to Earn, then settles between them.
 * Elsewhere (mobile, reduced motion) both sides are simply shown.
 */
export function IdeaSection() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
        () => {
          const q = gsap.utils.selector(root);
          const protect = q("[data-side='protect']");
          const earn = q("[data-side='earn']");
          const escrow = q("[data-escrow]");

          // Waiting cards are dimmed with a brightness filter, not opacity, so
          // their text keeps its real contrast value while off-screen.
          gsap.set(protect, { filter: "brightness(0.3)", x: -70 });
          gsap.set(earn, { filter: "brightness(0.3)", x: 70 });
          gsap.set(escrow, { autoAlpha: 0, y: 24 });

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: root.current,
              start: "top top",
              end: "+=170%",
              pin: true,
              // ScrollTrigger skips spacing when the parent is display:flex (it is: <main>).
              pinSpacing: true,
              scrub: 0.5,
              anticipatePin: 1,
            },
          });

          tl.to(protect, { filter: "brightness(1)", x: 0, duration: 1 })
            .to(sceneState.nudge, { rotY: -0.7, duration: 1 }, "<")
            .to(sceneState, { energy: 0.7, duration: 0.5 }, "<")
            .to(sceneState, { energy: 0, duration: 0.5 }, ">")
            .to(earn, { filter: "brightness(1)", x: 0, duration: 1 })
            .to(sceneState.nudge, { rotY: 0.7, duration: 1 }, "<")
            .to(sceneState, { energy: 0.7, duration: 0.5 }, "<")
            .to(sceneState, { energy: 0, duration: 0.5 }, ">")
            .to(sceneState.nudge, { rotY: 0, duration: 1 })
            .to(escrow, { autoAlpha: 1, y: 0, duration: 1 }, "<");

          return () => {
            gsap.set([protect, earn, escrow], { clearProps: "all" });
            Object.assign(sceneState.nudge, { rotY: 0, scale: 0 });
            sceneState.energy = 0;
          };
        },
      );
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      id="idea"
      ref={root}
      aria-labelledby="idea-title"
      className="relative flex min-h-dvh flex-col justify-center py-24 lg:py-0"
    >
      <Container>
        <header className="mb-10 flex max-w-2xl flex-col gap-4">
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-pulse uppercase">
            The core idea
          </p>
          <h2
            id="idea-title"
            className="font-display text-h2 leading-[1.02] tracking-[-0.02em]"
          >
            Two sides. One escrow.
          </h2>
          <p className="max-w-md text-lead text-ink-2 lg:max-w-lg">
            Every market pairs someone who wants protection with someone who
            wants premium. What each side is owed is held in the market itself
            from day one.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(200px,1fr)_1fr]">
          <Card data-side="protect" padding="lg" className="flex flex-col gap-4">
            <Badge tone="violet" className="self-start">
              Protect
            </Badge>
            <h3 className="font-display text-h3">You hold the asset.</h3>
            <p className="text-ink-2">
              Deposit the underlying token plus a premium reserve. If the final
              price ends below the barrier, you are settled in stablecoin at the
              starting strike.
            </p>
            <p className="border-t border-hair-2 pt-4 text-sm text-ink-2">
              You pay premium whenever a coupon qualifies. A drop that stays
              above the barrier is not protected, and protection stops on early
              termination or unwind.
            </p>
          </Card>

          <div aria-hidden className="hidden lg:block" />

          <Card data-side="earn" padding="lg" className="flex flex-col gap-4">
            <Badge tone="pulse" className="self-start">
              Earn
            </Badge>
            <h3 className="font-display text-h3">You hold stablecoin.</h3>
            <p className="text-ink-2">
              Supply stablecoin to a market and receive conditional premium on
              each observation at or above the barrier.
            </p>
            <p className="border-t border-hair-2 pt-4 text-sm text-ink-2">
              If the final price ends below the barrier you receive the
              underlying token instead of your stablecoin. That can be a large
              loss.
            </p>
          </Card>
        </div>

        <p
          data-escrow
          className="mt-10 max-w-2xl font-mono text-xs leading-relaxed tracking-[0.04em] text-ink-2 lg:mx-auto lg:text-center"
        >
          Funded in full by the escrow. No lending, no leverage, no
          rehypothecation. Funded does not mean risk is removed.
        </p>
      </Container>
    </section>
  );
}
