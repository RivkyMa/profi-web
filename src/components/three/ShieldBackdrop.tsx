"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useRenderTier } from "@/lib/device";
import { refreshScrollTriggers } from "@/lib/scroll";
import { sceneState } from "@/lib/scene-state";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ShieldFallback } from "./ShieldFallback";

// The scene (three, r3f, drei, the GLB) is only fetched on the client, after
// first paint, and never during SSR.
const Scene = dynamic(() => import("./Scene"), { ssr: false });

/**
 * The ONE fixed canvas behind the landing content.
 *
 * The container has an explicit height (100dvh) so the canvas always has a
 * size. It is decorative (aria-hidden) and ignores pointer events; pointer
 * parallax is read from window instead.
 */
export function ShieldBackdrop() {
  const tier = useRenderTier();
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  // Pause rendering when the backdrop is not on screen (e.g. the route is
  // hidden by Activity) or the tab is in the background.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry.isIntersecting),
    );
    observer.observe(el);

    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Pointer parallax input for the scene (written to shared state, not React).
  useEffect(() => {
    if (tier === "static" || tier === "pending" || reduced) return;
    const onMove = (event: PointerEvent) => {
      sceneState.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      sceneState.pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      sceneState.pointer.x = 0;
      sceneState.pointer.y = 0;
    };
  }, [tier, reduced]);

  const handleReady = useCallback(() => {
    setReady(true);
    refreshScrollTriggers();
  }, []);

  const showScene = tier === "high" || tier === "low";

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-dvh w-full"
      style={{ height: "100dvh" }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <ShieldFallback
          className={cn(
            "w-[min(52vw,300px)] transition-opacity duration-700 ease-premium",
            ready ? "opacity-0" : "opacity-90",
          )}
        />
      </div>
      {showScene && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-premium",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          <Scene
            tier={tier}
            paused={!inView || !tabVisible}
            animate={!reduced}
            onReady={handleReady}
          />
        </div>
      )}
    </div>
  );
}
