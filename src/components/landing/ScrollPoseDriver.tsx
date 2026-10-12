"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { resetSceneState, sceneState } from "@/lib/scene-state";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Binds page scroll to the shared scene state: a scrubbed GSAP tween writes
 * into sceneState.pose and the canvas reads it every frame.
 *
 * Phase 2 wiring check: one full turn of the shield over the whole page.
 * Phase 3 replaces this with per-section timelines.
 */
export function ScrollPoseDriver() {
  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add(
      {
        wide: "(min-width: 1024px)",
        motion: "(prefers-reduced-motion: no-preference)",
      },
      (context) => {
        const { wide, motion } = context.conditions as {
          wide: boolean;
          motion: boolean;
        };

        // Resting pose: right of the headline on desktop, above it on mobile.
        Object.assign(
          sceneState.pose,
          wide ? { x: 1.9, y: 0, scale: 1 } : { x: 0, y: 0.9, scale: 0.85 },
        );
        if (!motion) return;

        const trigger = {
          trigger: document.documentElement,
          start: "top top",
          end: "bottom bottom",
        };

        gsap.to(sceneState.pose, {
          rotY: Math.PI * 2,
          ease: "none",
          scrollTrigger: { ...trigger, scrub: 0.6 },
        });

        ScrollTrigger.create({
          ...trigger,
          onUpdate: (self) => {
            sceneState.progress = self.progress;
          },
        });
      },
    );

    return () => {
      mm.revert();
      resetSceneState();
    };
  }, []);

  return null;
}
