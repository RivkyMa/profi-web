"use client";

import type { ReactNode } from "react";
import { chainSetup } from "@/lib/chain/config";
import { useAppStore } from "@/lib/store";
import { ChainProviders } from "./lazy";

/**
 * In chain mode the dashboard runs inside the wallet providers. In mock mode
 * (the default, and always on GitHub Pages) it renders as is, and none of the
 * chain code is loaded.
 */
export function ChainGate({ children }: { children: ReactNode }) {
  const source = useAppStore((s) => s.source);

  if (source !== "chain" || chainSetup.mode !== "chain" || !ChainProviders) {
    return <>{children}</>;
  }
  return <ChainProviders config={chainSetup.config}>{children}</ChainProviders>;
}
