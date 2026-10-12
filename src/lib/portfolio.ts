/**
 * Pure derivations for the portfolio: what each position has locked, what it
 * can claim, and how it settled. No state here; the store holds the inputs.
 */

import { simulate, type Closure, type PayoffResult } from "./payoff";
import { findScenario, runScenario } from "./scenarios";
import { lotTerms, type MockMarket } from "./mock/markets";

export type Side = "earn" | "protect";

export interface Position {
  id: string;
  marketId: string;
  lots: number;
  claimed: boolean;
}

export interface Holding {
  cash: bigint;
  tokens: bigint;
}

export interface PositionView {
  position: Position;
  side: Side;
  market: MockMarket;
  state: "locked" | "claimable" | "claimed";
  /** Collateral the position has put into the market while it is open. */
  locked: Holding | null;
  /** What the market owes the position once it has resolved. */
  payout: Holding | null;
  result: PayoffResult | null;
  /** How the market ended, once it has. */
  closure: Closure | null;
}

/** Terminal result for `lots` lots of a resolved market, or null if open. */
export function marketResult(
  market: MockMarket,
  lots: number,
): PayoffResult | null {
  if (!market.resolution) return null;
  const params = { ...market.params, lots: BigInt(lots) };
  return runScenario(params, findScenario(params, market.resolution));
}

export function viewPosition(
  side: Side,
  position: Position,
  market: MockMarket,
): PositionView {
  const terms = lotTerms(market);
  const lots = BigInt(position.lots);
  const result = marketResult(market, position.lots);

  if (!result) {
    const locked: Holding =
      side === "earn"
        ? { cash: terms.principal * lots, tokens: 0n }
        : // Protect locks the token (tokens) and the premium reserve (cash).
          { cash: terms.reserve * lots, tokens: terms.tokens * lots };
    return {
      position,
      side,
      market,
      state: "locked",
      locked,
      payout: null,
      result: null,
      closure: null,
    };
  }

  const side_ = side === "earn" ? result.earn : result.protect;
  return {
    position,
    side,
    market,
    state: position.claimed ? "claimed" : "claimable",
    locked: null,
    payout: { cash: side_.cash, tokens: side_.tokens },
    result,
    closure: result.closure,
  };
}

export interface Totals {
  cash: bigint;
  /** Token amounts by underlying symbol. */
  tokens: Record<string, bigint>;
}

const empty = (): Totals => ({ cash: 0n, tokens: {} });

function add(totals: Totals, symbol: string, h: Holding | null) {
  if (!h) return;
  totals.cash += h.cash;
  if (h.tokens > 0n) totals.tokens[symbol] = (totals.tokens[symbol] ?? 0n) + h.tokens;
}

/** Claimable (resolved, unclaimed) versus locked (market still open). */
export function summarize(views: readonly PositionView[]): {
  claimable: Totals;
  locked: Totals;
} {
  const claimable = empty();
  const locked = empty();
  for (const v of views) {
    if (v.state === "claimable") add(claimable, v.market.underlying, v.payout);
    if (v.state === "locked") add(locked, v.market.underlying, v.locked);
  }
  return { claimable, locked };
}

/** Re-export so callers do not import the engine just to re-simulate. */
export { simulate };
