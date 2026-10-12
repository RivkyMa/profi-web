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
