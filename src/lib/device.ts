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

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") || canvas.getContext("webgl"),
    );
  } catch {
    return false;
  }
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
