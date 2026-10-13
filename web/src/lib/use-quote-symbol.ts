"use client";

import { QUOTE } from "./mock/markets";
import { useAppStore } from "./store";

/** The local contract stack still deploys mUSD. Do not relabel it as real USDG. */
export function useQuoteSymbol() {
  return useAppStore((s) => s.source === "chain" ? "mUSD" : QUOTE);
}
