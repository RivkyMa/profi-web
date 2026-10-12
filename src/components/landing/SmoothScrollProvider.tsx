"use client";

import { useEffect, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { refreshScrollTriggers, setActiveLenis } from "@/lib/scroll";
import { useReducedMotion } from "@/lib/use-reduced-motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * The single smooth-scroll provider. Lenis owns the scroll position and is
 * driven by GSAP's ticker so ScrollTrigger and Lenis share one clock.
 *
 * Everything is created in an effect and fully torn down in its cleanup, so
 * the provider behaves when Next hides/shows the route (Activity) and in
 * React strict mode. With prefers-reduced-motion, Lenis is not created and
 * the page uses native scrolling.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  useEffect(() => {
    // Avoid refresh storms when mobile browser chrome resizes the viewport.
    ScrollTrigger.config({ ignoreMobileResize: true });

    let lenis: Lenis | null = null;
    let tick: ((time: number) => void) | null = null;
    const onScroll = () => ScrollTrigger.update();

    if (!reduced) {
      lenis = new Lenis({ autoRaf: false, lerp: 0.1, smoothWheel: true });
      setActiveLenis(lenis);
      lenis.on("scroll", onScroll);

      tick = (time: number) => lenis?.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    // Fonts and late layout shifts move trigger positions.
    document.fonts?.ready.then(refreshScrollTriggers);
    window.addEventListener("load", refreshScrollTriggers);

    return () => {
      window.removeEventListener("load", refreshScrollTriggers);
      if (tick) gsap.ticker.remove(tick);
      if (lenis) {
        lenis.off("scroll", onScroll);
        lenis.destroy();
        setActiveLenis(null);
        gsap.ticker.lagSmoothing(500, 33); // GSAP default
      }
    };
  }, [reduced]);

  return <>{children}</>;
}
