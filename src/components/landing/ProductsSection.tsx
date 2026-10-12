"use client";

import { useRef, type CSSProperties } from "react";
import { ArrowUpRight, Coins, Layers, Shield, SlidersHorizontal } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Link from "next/link";
import { Section } from "@/components/ui";
import { ModelMedia } from "@/components/three/ModelMedia";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const PRODUCTS = [
  {
    name: "Earn",
    href: "/app/earn",
    icon: Coins,
    summary:
      "Supply stablecoin to a specific market and receive conditional premium.",
    provide: "Stablecoin",
    receive: "Conditional premium on each qualifying observation",
    risk: "If the final price ends below the barrier you receive the token, not your stablecoin.",
  },
  {
    name: "Protect",
    href: "/app/protect",
    icon: Shield,
    summary:
      "Deposit the underlying token and a premium reserve for conditional settlement at the starting strike.",
    provide: "Underlying token + premium reserve",
    receive: "Stablecoin at the strike if the final price ends below the barrier",
    risk: "You pay premium when coupons qualify. Loss above the final barrier is not protected.",
  },
  {
    name: "Vaults",
    href: "/app/vaults",
    icon: Layers,
    summary:
      "Allocate stablecoin across approved Earn markets. Shares are per epoch; withdraw after markets settle.",
    provide: "Stablecoin, within an epoch deposit window",
    receive: "Epoch shares, redeemable in cash or in kind after settlement",
    risk: "You carry the downside of every market the vault holds.",
    model: "vault",
  },
  {
    name: "Studio",
    href: "/app/studio",
    icon: SlidersHorizontal,
    summary:
      "Create a market from a template, within bounded parameters, with every outcome previewed.",
    provide: "Template parameters within the allowed limits",
    receive: "A market that Earn and Protect can subscribe to",
    risk: "Parameters you pick can leave a market unattractive or unfilled.",
  },
] as const;

function IconArt({ Icon }: { Icon: typeof Coins }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-pulse">
      <Icon className="size-14 stroke-[1.25]" aria-hidden />
    </div>
  );
}

/**
 * Four product cards. Entrance is scrubbed (cards rise at different rates)
 * and each card tilts toward the pointer on fine-pointer devices.
 */
export function ProductsSection() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = gsap.utils.toArray<HTMLElement>("[data-product]", root.current);

        cards.forEach((card, i) => {
          gsap.from(card, {
            y: 90 + (i % 2) * 70,
            autoAlpha: 0,
            rotateX: 8,
            transformPerspective: 900,
            ease: "none",
            scrollTrigger: {
              trigger: card,
              start: "top 100%",
              end: "top 62%",
              scrub: 0.6,
            },
          });
        });
      });

      // Pointer tilt only where hover exists, and never under reduced motion.
      mm.add(
        "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
        () => {
          const cleanups: Array<() => void> = [];
          const cards = gsap.utils.toArray<HTMLElement>("[data-tilt]", root.current);

          for (const card of cards) {
            const rotX = gsap.quickTo(card, "rotationX", { duration: 0.5, ease: "power3.out" });
            const rotY = gsap.quickTo(card, "rotationY", { duration: 0.5, ease: "power3.out" });
            gsap.set(card, { transformPerspective: 900 });

            const onMove = (event: PointerEvent) => {
              const r = card.getBoundingClientRect();
              const px = (event.clientX - r.left) / r.width;
              const py = (event.clientY - r.top) / r.height;
              rotY((px - 0.5) * 10);
              rotX(-(py - 0.5) * 8);
              card.style.setProperty("--mx", `${px * 100}%`);
              card.style.setProperty("--my", `${py * 100}%`);
            };
            const onLeave = () => {
              rotX(0);
              rotY(0);
            };
            card.addEventListener("pointermove", onMove);
            card.addEventListener("pointerleave", onLeave);
            cleanups.push(() => {
              card.removeEventListener("pointermove", onMove);
              card.removeEventListener("pointerleave", onLeave);
            });
          }
          return () => cleanups.forEach((fn) => fn());
        },
      );
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <Section
      id="products"
      ref={root}
      eyebrow="Products"
      title="Four products, one market model."
      description="Each product is a different way into the same fully funded market. Every card links to its mock page in the app."
    >
      <ul className="grid gap-5 md:grid-cols-2">
        {PRODUCTS.map((p) => {
          const Icon = p.icon;
          return (
            <li key={p.name} data-product>
              <Link
                href={p.href}
                data-tilt
                style={{ "--mx": "50%", "--my": "0%" } as CSSProperties}
                className="group relative flex h-full flex-col gap-5 overflow-hidden rounded-xl border border-hair-2 bg-ground-2/90 p-7 shadow-depth transition-colors duration-300 ease-premium hover:border-pulse-deep"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(360px circle at var(--mx) var(--my), rgb(53 216 207 / 0.12), transparent 70%)",
                  }}
                />
                <div className="relative">
                  <div className="relative h-40 overflow-hidden rounded-lg border border-hair-1 bg-ground-1">
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          "radial-gradient(60% 80% at 50% 100%, rgb(53 216 207 / 0.10), transparent 70%)",
                      }}
                    />
                    {"model" in p ? (
                      <ModelMedia
                        assetId={p.model}
                        className="h-full w-full"
                        fallback={<IconArt Icon={Icon} />}
                      />
                    ) : (
                      <IconArt Icon={Icon} />
                    )}
                  </div>
                  <ArrowUpRight
                    aria-hidden
                    className="absolute top-3 right-3 size-5 text-ink-3 transition-[color,transform] duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-pulse"
                  />
                </div>
                <div className="relative">
                  <h3 className="font-display text-h3">{p.name}</h3>
                  <p className="mt-2 text-ink-2">{p.summary}</p>
                </div>
                <dl className="relative mt-auto grid gap-3 border-t border-hair-2 pt-5 text-sm">
                  <div>
                    <dt className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
                      You provide
                    </dt>
                    <dd className="mt-1">{p.provide}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
                      You receive
                    </dt>
                    <dd className="mt-1">{p.receive}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
                      Main risk
                    </dt>
                    <dd className="mt-1 text-ink-2">{p.risk}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
