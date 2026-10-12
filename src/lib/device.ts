"use client";

import { useSyncExternalStore } from "react";

/**
 * How much 3D this device should get.
 *  - pending: not decided yet (SSR / first paint). Render the static shield.
 *  - high:    full quality, dpr up to 2.
 *  - low:     phones / small touch devices: same scene, lower resolution.
 *  - static:  no WebGL, data-saver, or very weak hardware: static visual only.
 */
export type RenderTier = "pending" | "high" | "low" | "static";

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/**
 * API presence only. Creating a probe context just to test support is slow
 * (and wastes one of the browser's limited contexts); if the real Canvas
 * cannot get a context, SceneBoundary falls back to the static shield.
 */
function hasWebGL(): boolean {
  return (
    typeof WebGL2RenderingContext !== "undefined" ||
    typeof WebGLRenderingContext !== "undefined"
  );
}

function detect(): RenderTier {
  const nav = navigator as Navigator & NavigatorHints;
  if (!hasWebGL()) return "static";
  if (nav.connection?.saveData) return "static";
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return "static";
  if (navigator.hardwareConcurrency <= 2) return "static";

  const smallTouch = window.matchMedia(
    "(max-width: 768px) and (pointer: coarse)",
  ).matches;
  return smallTouch ? "low" : "high";
}

// Detection is stable for a page lifetime; compute once and cache.
let cached: RenderTier | null = null;
function getSnapshot(): RenderTier {
  cached ??= detect();
  return cached;
}

const subscribe = () => () => {};

export function useRenderTier(): RenderTier {
  return useSyncExternalStore(subscribe, getSnapshot, () => "pending");
}
