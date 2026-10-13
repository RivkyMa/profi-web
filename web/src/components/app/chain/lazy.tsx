"use client";

import dynamic from "next/dynamic";

/**
 * Chain UI is loaded only when the build asks for chain mode. The condition
 * reads the env var directly so the bundler can see it is false in the mock and
 * GitHub Pages builds and drop the imports (and with them wagmi and RainbowKit).
 */
const ENABLED = process.env.NEXT_PUBLIC_DATA_MODE === "chain";

export const ChainProviders = ENABLED
  ? dynamic(() => import("./ChainProviders"), { ssr: false })
  : null;

export const ChainWalletControls = ENABLED
  ? dynamic(() => import("./ChainWalletControls"), { ssr: false })
  : null;
