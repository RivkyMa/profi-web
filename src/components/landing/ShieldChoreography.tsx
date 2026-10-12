"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { resetSceneState, sceneState } from "@/lib/scene-state";

gsap.registerPlugin(useGSAP, ScrollTrigger);

interface Look {
  x: number;
  y: number;
  scale: number;
  rotY: number;
  rotX: number;
  /** Opacity of the whole canvas (the shield dims behind dense content). */
  dim: number;
}

interface Stop {
  /** id of the page section this look belongs to. */
  id: string;
  wide: Look;
  narrow: Look;
}

/**
 * Where the shield sits for each section, in document order. Between two
 * stops the look is interpolated by scroll position, so the shield is always
 * a pure function of the page: no timeline fights, correct after refresh and
 * when scrolling backwards.
 */
const STOPS: readonly Stop[] = [
  {
    id: "hero",
    wide: { x: 1.9, y: 0, scale: 1, rotY: 0, rotX: 0, dim: 1 },
    narrow: { x: 0, y: 0.9, scale: 0.85, rotY: 0, rotX: 0, dim: 1 },
  },
  {
    id: "idea",
    wide: { x: 0, y: 0.1, scale: 1.05, rotY: 0, rotX: 0, dim: 0.95 },
    narrow: { x: 0, y: 0.2, scale: 0.8, rotY: 0, rotX: 0, dim: 0.28 },
  },
  {
    id: "how",
    wide: { x: 2.4, y: 0, scale: 0.95, rotY: 0.35, rotX: 0, dim: 0.9 },
    narrow: { x: 0, y: 1.2, scale: 0.6, rotY: 0.35, rotX: 0, dim: 0.22 },
  },
  {
    id: "products",
    wide: { x: 0, y: 0, scale: 0.8, rotY: -0.5, rotX: 0.1, dim: 0.16 },
    narrow: { x: 0, y: 0, scale: 0.7, rotY: -0.5, rotX: 0.1, dim: 0.12 },
  },
  {
    id: "payoff",
    wide: { x: 3.3, y: 1.3, scale: 0.5, rotY: 0.6, rotX: 0, dim: 0.22 },
    narrow: { x: 0, y: 1.5, scale: 0.4, rotY: 0.6, rotX: 0, dim: 0.1 },
  },
  {
    id: "risks",
    wide: { x: -3.3, y: -0.8, scale: 0.55, rotY: Math.PI * 0.9, rotX: 0, dim: 0.2 },
    narrow: { x: 0, y: -1.6, scale: 0.4, rotY: Math.PI * 0.9, rotX: 0, dim: 0.1 },
  },
  {
    id: "gates",
    wide: { x: 3.2, y: 0.2, scale: 0.6, rotY: Math.PI * 1.5, rotX: 0, dim: 0.28 },
    narrow: { x: 0, y: 0.4, scale: 0.45, rotY: Math.PI * 1.5, rotX: 0, dim: 0.1 },
  },
  {
    id: "cta",
    wide: { x: 0, y: 1.2, scale: 0.78, rotY: Math.PI * 2, rotX: 0, dim: 1 },
    narrow: { x: 0, y: 1.3, scale: 0.7, rotY: Math.PI * 2, rotX: 0, dim: 1 },
  },
];

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpLook(a: Look, b: Look, t: number): Look {
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    scale: mix(a.scale, b.scale, t),
    rotY: mix(a.rotY, b.rotY, t),
    rotX: mix(a.rotX, b.rotX, t),
    dim: mix(a.dim, b.dim, t),
  };
}

/**
 * Drives the shared scene state from scroll. Replaces the Phase 2 spin demo.
 * Renders nothing. Reduced motion: the shield stays still and only the
 * canvas opacity follows the page (instant, no animation).
 */
export function ShieldChoreography() {
  useGSAP(() => {
    const dimEl = document.querySelector<HTMLElement>("[data-shield-dim]");
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

        const stops = STOPS.map((stop) => ({
          el: document.getElementById(stop.id),
          look: wide ? stop.wide : stop.narrow,
        })).filter((s): s is { el: HTMLElement; look: Look } => s.el !== null);
        if (stops.length === 0) return;

        const apply = () => {
          const vh = window.innerHeight;
          // Distance (px) of each section's center from the viewport center.
          // A pinned section keeps its center aligned, so its stop holds.
          const d = stops.map((s) => {
            const r = s.el.getBoundingClientRect();
            return r.top + r.height / 2 - vh / 2;
          });

          let k = -1;
          for (let i = 0; i < d.length; i++) if (d[i] <= 0) k = i;

          let look: Look;
          if (k === -1) look = stops[0].look;
          else if (k === stops.length - 1) look = stops[k].look;
          else {
            const span = d[k + 1] - d[k];
            const t = span > 0 ? smooth(Math.min(1, Math.max(0, -d[k] / span))) : 0;
            look = lerpLook(stops[k].look, stops[k + 1].look, t);
          }

          if (dimEl) dimEl.style.opacity = look.dim.toFixed(3);
          if (!motion) return;

          const { pose } = sceneState;
          pose.x = look.x;
          pose.y = look.y;
          pose.scale = look.scale;
          pose.rotY = look.rotY;
          pose.rotX = look.rotX;
        };

        const trigger = ScrollTrigger.create({
          trigger: document.documentElement,
          start: 0,
          end: "max",
          onUpdate: apply,
          onRefresh: apply,
        });
        apply();

        return () => trigger.kill();
      },
    );

    return () => {
      mm.revert();
      resetSceneState();
      if (dimEl) dimEl.style.opacity = "";
    };
  }, []);

  return null;
}
