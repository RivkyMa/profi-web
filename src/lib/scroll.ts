"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

let activeLenis: Lenis | null = null;

/** Called by the single SmoothScrollProvider. */
export function setActiveLenis(lenis: Lenis | null): void {
  activeLenis = lenis;
}

/** Scroll to a selector, element or pixel offset, using Lenis when active. */
export function scrollToTarget(
  target: string | HTMLElement | number,
  options: { offset?: number; immediate?: boolean } = {},
): void {
  if (activeLenis) {
    activeLenis.scrollTo(target, options);
    return;
  }
  const el =
    typeof target === "string" ? document.querySelector(target) : target;
  if (typeof target === "number") {
    window.scrollTo({ top: target + (options.offset ?? 0) });
  } else if (el instanceof HTMLElement) {
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY + (options.offset ?? 0),
    });
  }
}

let refreshCall: gsap.core.Tween | null = null;

/**
 * Debounced ScrollTrigger.refresh(). Call it after anything that changes page
 * height or trigger positions (fonts, models, images finishing to load).
 */
export function refreshScrollTriggers(): void {
  refreshCall?.kill();
  refreshCall = gsap.delayedCall(0.15, () => ScrollTrigger.refresh());
}
