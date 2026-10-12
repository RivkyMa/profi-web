"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Badge, Container } from "@/components/ui";
import { sceneState } from "@/lib/scene-state";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const STEPS = [
  {
    title: "Studio",
    actor: "Market creator",
    text: "A market is created from a template. Every parameter is bounded and every outcome is previewed before anything goes live.",
  },
  {
    title: "Subscribe",
    actor: "Earn + Protect",
    text: "Stablecoin holders and asset owners subscribe. Their funds sit in the market's own escrow; nothing is lent out or reused.",
  },
  {
    title: "Observation",
    actor: "Oracle schedule",
    text: "On fixed dates the price is observed once each. At or above the barrier, a coupon is paid from the premium reserve. Below it, no coupon and no catch-up.",
  },
  {
    title: "Settlement",
    actor: "Escrow",
    text: "At maturity, or early on an autocall, the market settles. Earn gets stablecoin back, or the token if the price ended below the barrier.",
  },
  {
    title: "Claim",
    actor: "Earn + Protect",
    text: "Each side claims what the market owes it. If oracle data is missing past its deadline, the market unwinds instead of settling.",
  },
] as const;

/**
 * Pinned lifecycle. Scrolling advances through five stages; the shield makes
 * one full turn (a fifth per stage) and a light pulses at every stage. With
 * no motion, all five steps are listed in full.
 */
export function HowItWorks() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const section = root.current;
        if (!section) return;
        const q = gsap.utils.selector(section);
        const steps = q("[data-step]");
        const rail = q("[data-rail-fill]");

        section.dataset.motion = "on";

        const setActive = (index: number) => {
          steps.forEach((el, i) => {
            if (i === index) {
              el.setAttribute("data-active", "");
              el.setAttribute("aria-current", "step");
            } else {
              el.removeAttribute("data-active");
              el.removeAttribute("aria-current");
            }
          });
        };
        setActive(0);

        const count = STEPS.length;
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: `+=${count * 70}%`,
            pin: true,
            // ScrollTrigger skips spacing when the parent is display:flex (it is: <main>).
            pinSpacing: true,
            scrub: 0.5,
            anticipatePin: 1,
            onUpdate: (self) =>
              setActive(Math.min(count - 1, Math.floor(self.progress * count))),
          },
        });

        tl.fromTo(rail, { scaleY: 0 }, { scaleY: 1, duration: count }, 0);
        for (let i = 0; i < count; i++) {
          tl.to(
            sceneState.nudge,
            { rotY: ((i + 1) * Math.PI * 2) / count, duration: 1 },
            i,
          )
            .to(sceneState, { energy: 0.9, duration: 0.2 }, i)
            .to(sceneState, { energy: 0, duration: 0.5 }, i + 0.2);
        }

        return () => {
          delete section.dataset.motion;
          steps.forEach((el) => {
            el.removeAttribute("data-active");
            el.removeAttribute("aria-current");
          });
          // A full turn is visually identical to none; reset cleanly.
          sceneState.nudge.rotY = 0;
          sceneState.energy = 0;
        };
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      id="how"
      ref={root}
      aria-labelledby="how-title"
      className="relative flex min-h-dvh flex-col justify-center py-24 lg:py-0"
    >
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,560px)_1fr]">
          <div>
            <header className="mb-8 flex flex-col gap-4">
              <p className="font-mono text-xs font-medium tracking-[0.14em] text-pulse uppercase">
                How a market works
              </p>
              <h2
                id="how-title"
                className="font-display text-h2 leading-[1.02] tracking-[-0.02em]"
              >
                From template to claim.
              </h2>
            </header>

            <div className="relative">
              <div
                aria-hidden
                className="absolute top-2 bottom-2 left-[11px] w-px bg-hair-2"
              >
                <div
                  data-rail-fill
                  className="h-full w-full origin-top bg-pulse"
                />
              </div>

              <ol className="flex flex-col gap-1">
                {STEPS.map((step, i) => (
                  <li
                    key={step.title}
                    data-step
                    className="step relative pl-10"
                  >
                    <span
                      aria-hidden
                      className="step-dot absolute top-[7px] left-0 flex size-6 items-center justify-center rounded-full border border-hair-4 bg-ground-0 font-mono text-[10px] text-ink-2"
                    >
                      {i + 1}
                    </span>
                    <div className="flex flex-wrap items-center gap-3 py-1">
                      <h3 className="font-display text-h3 leading-tight">
                        {step.title}
                      </h3>
                      <Badge>{step.actor}</Badge>
                    </div>
                    <div className="step-desc">
                      {/* Padding lives on the inner p so the collapsed row is truly 0 tall. */}
                      <div className="min-h-0 overflow-hidden">
                        <p className="pb-3 text-ink-2">{step.text}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          {/* Right column is intentionally empty: the shield lives there. */}
          <div aria-hidden className="hidden lg:block" />
        </div>
      </Container>
    </section>
  );
}
