/**
 * What a position is owed by a market that has closed or been cancelled.
 * This mirrors `MarketEscrow._earnClaim` / `_protectClaim` exactly (floor
 * division, unmatched lots refunded pro rata), so the dashboard can show
 * both owed and already-received amounts from the market's pools.
 *
 * `scripts/e2e.ts` in the keeper checks this against the contract's own
 * `claimable()` view.
 */

import { Phase } from "@profi/shared";
import type { ChainMarketData } from "./model";

export type ChainSide = "earn" | "protect";

export interface Holding {
  cash: bigint;
  tokens: bigint;
}

export function payoutFor(side: ChainSide, lots: bigint, d: ChainMarketData): Holding | null {
  if (lots <= 0n) return { cash: 0n, tokens: 0n };

  if (d.phase === Phase.Cancelled) {
    // Nothing matched: everything deposited comes back.
    return side === "earn"
      ? { cash: lots * d.lotPrincipal, tokens: 0n }
      : { cash: lots * d.lotReserve, tokens: lots * d.lotTokens };
  }
  if (d.phase !== Phase.Closed) return null;

  if (side === "earn") {
    const total = d.totalEarnLots;
    if (total === 0n) return { cash: 0n, tokens: 0n };
    const unmatched = total - d.matchedLots;
    return {
      cash: (d.pools.earnCash * lots) / total + (lots * d.lotPrincipal * unmatched) / total,
      tokens: (d.pools.earnTokens * lots) / total,
    };
  }

  const total = d.totalProtectLots;
  if (total === 0n) return { cash: 0n, tokens: 0n };
  const unmatched = total - d.matchedLots;
  return {
    cash: (d.pools.protectCash * lots) / total + (lots * d.lotReserve * unmatched) / total,
    tokens: (d.pools.protectTokens * lots) / total + (lots * d.lotTokens * unmatched) / total,
  };
}
