/**
 * Presentation-side valuation of a PayoffResult. payoff.ts says WHAT each side
 * receives; this marks token amounts to a price so a loss can be shown as a
 * number. Still pure bigint math.
 */

import { deriveTerms, type PayoffParams, type PayoffResult } from "./payoff";
import { SCALE } from "./units";

export interface Valuation {
  /** Earn's cash plus tokens marked at `price`. */
  earnValue: bigint;
  /** earnValue minus the principal Earn put in. Negative means a loss. */
  earnPnl: bigint;
  /** Protect's cash plus tokens marked at `price`. */
  protectValue: bigint;
  /**
   * What Protect ended with versus simply holding the token and keeping the
   * premium reserve: payoff from protection minus premium paid.
   */
  protectNet: bigint;
  /** Gross premium Protect paid out of the reserve. */
  premiumPaid: bigint;
}

const markTokens = (tokens: bigint, price: bigint) => (tokens * price) / SCALE;

export function valuate(
  params: PayoffParams,
  result: PayoffResult,
  price: bigint,
): Valuation {
  const terms = deriveTerms(params);

  const earnValue = result.earn.cash + markTokens(result.earn.tokens, price);
  const protectValue =
    result.protect.cash + markTokens(result.protect.tokens, price);
  const holdAndKeepReserve = markTokens(terms.tokens, price) + terms.reserve;

  return {
    earnValue,
    earnPnl: earnValue - terms.principal,
    protectValue,
    protectNet: protectValue - holdAndKeepReserve,
    premiumPaid: result.coupons.gross,
  };
}

/**
 * Final prices shown in the "view as a table" rows: a few round percentages of
 * strike plus the barrier and one cent below it. The barrier often equals one
 * of the percentages (65% of 100), so rows are de-duplicated by value and
 * sorted: callers use the price as a React key.
 */
export function tablePrices(strike: bigint, barrier: bigint): bigint[] {
  const pcts = [40, 55, 60, 65, 70, 80, 100, 120];
  const prices = pcts.map((p) => (strike * BigInt(p)) / 100n);
  prices.push(barrier, barrier - 10_000n);
  return Array.from(new Set(prices))
    .filter((p) => p > 0n)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
