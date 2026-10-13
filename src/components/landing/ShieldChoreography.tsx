"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { resetSceneState, sceneState } from "@/lib/scene-state";

gsap.registerPlugin(useGSAP, ScrollTrigger);

interface VaultLook {
  x: number;
  y: number;
  scale: number;
  rotY: number;
}

interface Look {
  x: number;
  y: number;
  scale: number;
  rotY: number;
  rotX: number;
  /** Opacity of the whole canvas (the shield dims behind dense content). */
  dim: number;
  /** The vault object; scale 0 hides it. */
  vault: VaultLook;
}

interface Stop {
  /** id of the page section this look belongs to. */
  id: string;
  wide: Look;
  narrow: Look;
}

const NO_VAULT: VaultLook = { x: 0, y: 0, scale: 0, rotY: 0 };

type ShieldLook = Omit<Look, "vault">;
const look = (shield: ShieldLook, vault: VaultLook = NO_VAULT): Look => ({
  ...shield,
  vault,
});

/**
 * Where the main object (the monument, in the "shield" slot) and, in its own
 * section, the second object (the exchange building, in the "vault" slot) sit
 * for each section, in document order. Between two stops the look is interpolated by
 * scroll position, so the scene is always a pure function of the page: no
 * timeline fights, correct after refresh and when scrolling backwards.
 *
 * The vault keeps the same x / y / rotation on both sides of its section and
 * only its scale changes, so it grows in place instead of sliding across.
 *
 * The monument has one readable face (its back shows the symbol mirrored and
 * its edge is thin), so rotY stays within about +-0.6 rad: it sways towards
 * the content instead of spinning.
 */
const STOPS: readonly Stop[] = [
  {
    id: "hero",
    wide: look({ x: 1.9, y: 0, scale: 1, rotY: -0.3, rotX: 0, dim: 1 }),
    // On phones it sits above the headline and is dimmed a little, because
    // its plinth still reaches behind the first line of copy.
    narrow: look({ x: 0, y: 1.3, scale: 0.62, rotY: -0.2, rotX: 0, dim: 0.7 }),
  },
  {
    id: "idea",
    // Sits level with the two cards, below the intro copy.
    wide: look({ x: 0, y: -0.4, scale: 0.8, rotY: 0, rotX: 0, dim: 0.95 }),
    narrow: look({ x: 0, y: 0.2, scale: 0.8, rotY: 0, rotX: 0, dim: 0.28 }),
  },
  {
    id: "how",
    wide: look({ x: 2.25, y: 0, scale: 0.9, rotY: 0.35, rotX: 0, dim: 0.9 }),
    narrow: look({ x: 0, y: 1.2, scale: 0.6, rotY: 0.35, rotX: 0, dim: 0.22 }),
  },
  {
    id: "products",
    wide: look(
      { x: 0, y: 0, scale: 0.8, rotY: -0.5, rotX: 0.1, dim: 0.16 },
      { x: 1.9, y: 0, scale: 0, rotY: -0.9 },
    ),
    narrow: look(
      { x: 0, y: 0, scale: 0.7, rotY: -0.5, rotX: 0.1, dim: 0.12 },
      { x: 0, y: 0.4, scale: 0, rotY: -0.9 },
    ),
  },
  {
    id: "vaults",
    // The shield disappears (scale ~0) while the vault takes over. On phones
    // the vault is a faint backdrop behind the copy, so the canvas is dimmer.
    wide: look(
      { x: 0, y: 0, scale: 0.001, rotY: 0, rotX: 0, dim: 0.95 },
      { x: 1.9, y: 0, scale: 0.85, rotY: 0.25 },
    ),
    narrow: look(
      { x: 0, y: 0, scale: 0.001, rotY: 0, rotX: 0, dim: 0.3 },
      { x: 0, y: 0.4, scale: 0.85, rotY: 0.25 },
    ),
  },
  {
    id: "payoff",
    wide: look(
      { x: 3.1, y: 1.3, scale: 0.5, rotY: -0.5, rotX: 0, dim: 0.22 },
      { x: 1.9, y: 0, scale: 0, rotY: 1.1 },
    ),
    narrow: look(
      { x: 0, y: 1.5, scale: 0.4, rotY: -0.5, rotX: 0, dim: 0.1 },
      { x: 0, y: 0.4, scale: 0, rotY: 1.1 },
    ),
  },
  {
    id: "risks",
    wide: look({ x: -3.1, y: -0.8, scale: 0.55, rotY: 0.6, rotX: 0, dim: 0.2 }),
    narrow: look({ x: 0, y: -1.6, scale: 0.4, rotY: 0.6, rotX: 0, dim: 0.1 }),
  },
  {
    id: "gates",
    wide: look({ x: 3.0, y: 0.2, scale: 0.6, rotY: -0.6, rotX: 0, dim: 0.28 }),
    narrow: look({ x: 0, y: 0.4, scale: 0.45, rotY: -0.6, rotX: 0, dim: 0.1 }),
  },
  {
    id: "cta",
    // Kept clear of the fixed header above and the headline below.
    wide: look({ x: 0, y: 0.88, scale: 0.66, rotY: 0, rotX: 0, dim: 1 }),
    narrow: look({ x: 0, y: 1.15, scale: 0.62, rotY: 0, rotX: 0, dim: 1 }),
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
    vault: {
      x: mix(a.vault.x, b.vault.x, t),
      y: mix(a.vault.y, b.vault.y, t),
      scale: mix(a.vault.scale, b.vault.scale, t),
      rotY: mix(a.vault.rotY, b.vault.rotY, t),
    },
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

          const { vault } = sceneState;
          vault.x = look.vault.x;
          vault.y = look.vault.y;
          vault.scale = look.vault.scale;
          vault.rotY = look.vault.rotY;

          // Start fetching the vault model a couple of screens before its section.
          const vaultsEl = document.getElementById("vaults");
          if (vaultsEl && vaultsEl.getBoundingClientRect().top < vh * 2.2) {
            sceneState.vaultWanted = true;
          }
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
