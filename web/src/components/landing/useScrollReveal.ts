"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

interface RevealOptions {
  /** Elements to reveal, selected inside the scope. */
  selector: string;
  /** Starting vertical offset in px. */
  y?: number;
  /** Optional horizontal growth for allocation bars. */
  scaleX?: number;
  stagger?: number;
  /** ScrollTrigger start / end for the scrub. */
  start?: string;
  end?: string;
}

/**
 * Scroll-linked reveal: the targets travel and fade in as the scope scrolls
 * into view (scrubbed, so it is tied to scroll position rather than timed).
 * Content is fully visible without JS and under prefers-reduced-motion.
 */
export function useScrollReveal<T extends HTMLElement>({
  selector,
  y = 56,
  scaleX = 1,
  stagger = 0.12,
  start = "top 88%",
  end = "top 40%",
}: RevealOptions) {
  const scope = useRef<T>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const targets = gsap.utils.toArray<HTMLElement>(selector, scope.current);
        if (targets.length === 0) return;
        gsap.from(targets, {
          y,
          scaleX,
          autoAlpha: 0,
          ease: "none",
          stagger,
          scrollTrigger: {
            trigger: scope.current,
            start,
            end,
            scrub: 0.6,
          },
        });
      });
      return () => mm.revert();
    },
    { scope },
  );

  return scope;
}
