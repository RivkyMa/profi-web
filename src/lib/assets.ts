/**
 * 3D asset manifest. Every model the site uses is registered here.
 *
 * To add an asset: drop an optimized GLB into public/models/ (see
 * scripts/optimize-model.mjs) and add an entry below. If the file is missing
 * or fails to load, the scene renders the procedural placeholder named by
 * `placeholder`, so the build and the page never break because of an asset.
 */

import { preload } from "react-dom";

export type PlaceholderKind = "shield" | "generic";

export interface ModelAsset {
  /** Public URL of the optimized GLB. */
  url: string;
  /** The model is centered and scaled so its height equals this (world units). */
  height: number;
  /** Start fetching as soon as the scene module loads. */
  preload: boolean;
  /** Procedural stand-in used while loading fails or the file is missing. */
  placeholder: PlaceholderKind;
}

export const assets = {
  shield: {
    url: "/models/shield.glb",
    height: 2.5,
    preload: true,
    placeholder: "shield",
  },
  vault: {
    url: "/models/vault.glb",
    height: 2.5,
    // Shown in a small canvas lower on the page; fetch it only when needed.
    preload: false,
    placeholder: "generic",
  },
  // TODO(assets): register new models here (coin, ...). Until their GLB
  // exists they render as the "generic" placeholder.
} as const satisfies Record<string, ModelAsset>;

export type AssetId = keyof typeof assets;

/**
 * Emit <link rel="preload"> hints for every asset flagged `preload`. Call it
 * from a Server Component (e.g. the landing layout): the hint is in the first
 * HTML, so the model downloads in parallel with the JS bundles, and a missing
 * file is just a harmless 404 instead of a rejected promise.
 *
 * as="fetch" with crossOrigin="anonymous" matches how the GLTF loader
 * requests the file, so the browser reuses the preloaded response.
 */
export function preloadModels(): void {
  for (const asset of Object.values(assets)) {
    if (asset.preload) {
      // Low priority: a 1.5 MB model must not compete with the CSS/JS that
      // paints the text, or slow connections wait on it before first paint.
      preload(asset.url, {
        as: "fetch",
        crossOrigin: "anonymous",
        fetchPriority: "low",
      });
    }
  }
}
