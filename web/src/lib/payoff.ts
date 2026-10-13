/**
 * PROFI payoff model: pure, deterministic, integer-only.
 *
 * This module is the source of truth for the simulator and every payoff
 * visual. Amounts and prices are bigint fixed-point values (see units.ts);
 * ratios (barrier, autocall, fee) are integer basis points. Nothing here
 * touches floating point.
 *
 * Rules implemented (see CLAUDE.md for the full statement):
 *  - One lot = q underlying tokens and n = q * P0 stablecoins.
 *  - Each observation i, in order and once:
 *      Pi >= B  -> gross coupon paid by Protect to Earn, minus protocol fee.
 *      Pi <  B  -> no coupon, no memory, no permanent barrier trigger.
 *  - Intermediate observation with autocall on and Pi >= A: coupon, then
 *    early close (Earn gets N back, Protect gets Q + remaining reserve).
 *  - Maturity: PT >= B -> Earn gets N, Protect gets Q + remaining reserve.
 *              PT <  B -> Earn gets Q tokens, Protect gets N (at strike P0)
 *                         + remaining reserve. Accrued coupons stay with Earn.
 *  - Equality qualifies: Pi == B pays a coupon, Pi == A autocalls.
 *  - Missing oracle data past the deadline -> exceptional unwind: Earn gets
 *    principal back, Protect gets Q + remaining reserve, accrued coupons stay,
 *    later coupons and protection are cancelled.
 */

import { SCALE } from "./units";

const BPS = 10_000n;

export interface PayoffParams {
  /** Number of lots L (plain integer count, not fixed-point). */
  lots: bigint;
  /** q: underlying tokens per lot, fixed-point. */
  tokensPerLot: bigint;
  /** P0: initial price / strike in stablecoin per token, fixed-point. */
  strike: bigint;
  /** b in basis points of P0, 0 < b < 10_000 (6500 = 65%). */
  barrierBps: number;
  /** a in basis points of P0, a >= 10_000, or null when autocall is off. */
  autocallBps: number | null;
  /** m: number of scheduled observations, the last one is maturity. */
  observations: number;
  /** c: gross coupon per observation per lot, in stablecoin fixed-point. */
  couponPerLot: bigint;
  /** Protocol fee on the gross coupon in basis points (500 = 5%). */
  feeBps: number;
}

export interface SimulateOptions {
  /**
   * 0-based index of an observation whose oracle data never arrived before its
   * deadline. If the product is still open when that observation is reached,
   * it triggers the exceptional unwind. No price may be supplied for this
   * index (that would be contradictory input and throws).
   */
  missedObservationIndex?: number;
}

export type Closure = "early" | "normal" | "downside" | "unwind";

export interface DerivedTerms {
  /** N = L * q * P0 (stablecoin). Earn's principal. */
  principal: bigint;
  /** Q = L * q (tokens). Protect's underlying. */
  tokens: bigint;
  /** B = b * P0, rounded down, for display. Comparisons use exact basis points. */
  barrier: bigint;
  /** A = a * P0, rounded down, for display. Null when autocall is off. */
  autocall: bigint | null;
  /** Gross coupon per observation for the whole position, L * c. */
  grossCouponPerObservation: bigint;
  /** Protocol fee on one gross coupon, rounded down. */
  feePerObservation: bigint;
  /** Net coupon Earn receives per paying observation. */
  netCouponPerObservation: bigint;
  /** R = m * L * c: premium reserve funded by Protect. Equals the maximum protection cost. */
  reserve: bigint;
}

export interface ObservationRecord {
  /** 0-based observation index. */
  index: number;
  price: bigint;
  /** True when Pi >= B and a coupon was paid. */
  couponPaid: boolean;
  grossCoupon: bigint;
  fee: bigint;
  netCoupon: bigint;
  /** True when this observation triggered an early close. */
  autocalled: boolean;
}

export interface PayoffResult {
  closure: Closure;
  /** 0-based index of the observation at which the position closed. */
  closedAtIndex: number;
  observationsPlanned: number;
  /** Observations that actually happened, up to and including the close. */
  observations: ObservationRecord[];
  earn: {
    /** principalCash + couponsNet. */
    cash: bigint;
    /** Underlying tokens received (non-zero only on downside). */
    tokens: bigint;
    principalCash: bigint;
    couponsNet: bigint;
  };
  protect: {
    /** settlementCash + reserveRemaining. */
    cash: bigint;
    /** Underlying tokens returned (zero on downside). */
    tokens: bigint;
    /** N paid at strike on downside, otherwise zero. */
    settlementCash: bigint;
    /** R minus gross coupons paid. */
    reserveRemaining: bigint;
  };
  protocolFee: bigint;
  coupons: {
    paidCount: number;
    gross: bigint;
    fee: bigint;
    net: bigint;
  };
}

export class PayoffInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoffInputError";
  }
}

/** Returns human-readable problems with the parameters; empty when valid. */
export function validateParams(params: PayoffParams): string[] {
  const issues: string[] = [];
  const isInt = Number.isInteger;

  if (params.lots <= 0n) issues.push("Lots must be at least 1.");
  if (params.tokensPerLot <= 0n) {
    issues.push("Tokens per lot must be greater than 0.");
  }
  if (params.strike <= 0n) issues.push("Strike must be greater than 0.");
  if (
    !isInt(params.barrierBps) ||
    params.barrierBps <= 0 ||
    params.barrierBps >= 10_000
  ) {
    issues.push("Barrier must be above 0% and below 100% of strike.");
  }
  if (
    params.autocallBps !== null &&
    (!isInt(params.autocallBps) || params.autocallBps < 10_000)
  ) {
    issues.push("Autocall level must be at least 100% of strike.");
  }
  if (!isInt(params.observations) || params.observations < 1) {
    issues.push("There must be at least 1 observation.");
  }
  if (params.couponPerLot < 0n) issues.push("Coupon cannot be negative.");
  if (
    !isInt(params.feeBps) ||
    params.feeBps < 0 ||
    params.feeBps > 10_000
  ) {
    issues.push("Fee must be between 0% and 100%.");
  }
  if (
    params.tokensPerLot > 0n &&
    params.strike > 0n &&
    (params.tokensPerLot * params.strike) % SCALE !== 0n
  ) {
    issues.push(
      "Tokens per lot times strike must be a whole number of stablecoin units (6 decimals).",
    );
  }
  return issues;
}

/** Derive N, Q, B, A, R and per-observation coupon amounts. Throws on invalid params. */
export function deriveTerms(params: PayoffParams): DerivedTerms {
  const issues = validateParams(params);
  if (issues.length > 0) throw new PayoffInputError(issues.join(" "));

  const perLot = (params.tokensPerLot * params.strike) / SCALE;
  const grossCouponPerObservation = params.lots * params.couponPerLot;
  const feePerObservation =
    (grossCouponPerObservation * BigInt(params.feeBps)) / BPS;

  return {
    principal: params.lots * perLot,
    tokens: params.lots * params.tokensPerLot,
    barrier: (params.strike * BigInt(params.barrierBps)) / BPS,
    autocall:
      params.autocallBps === null
        ? null
        : (params.strike * BigInt(params.autocallBps)) / BPS,
    grossCouponPerObservation,
    feePerObservation,
    netCouponPerObservation: grossCouponPerObservation - feePerObservation,
    reserve: BigInt(params.observations) * grossCouponPerObservation,
  };
}

/**
 * Simulate a position against the observed prices (one per observation, in
 * order). Prices after an early close are ignored: those observations never
 * happen. Throws PayoffInputError for invalid parameters, non-positive prices,
 * or when an observation that must happen has no price yet.
 */
export function simulate(
  params: PayoffParams,
  prices: readonly bigint[],
  opts: SimulateOptions = {},
): PayoffResult {
  const terms = deriveTerms(params);
  const { observationsPlanned, missed } = checkInputs(params, prices, opts);

  const barrierBps = BigInt(params.barrierBps);
  const autocallBps =
    params.autocallBps === null ? null : BigInt(params.autocallBps);

  const observations: ObservationRecord[] = [];
  let paidCount = 0;

  const close = (closure: Closure, closedAtIndex: number): PayoffResult => {
    const gross = BigInt(paidCount) * terms.grossCouponPerObservation;
    const fee = BigInt(paidCount) * terms.feePerObservation;
    const net = gross - fee;
    const downside = closure === "downside";
    const principalCash = downside ? 0n : terms.principal;
    const settlementCash = downside ? terms.principal : 0n;
    const reserveRemaining = terms.reserve - gross;

    return {
      closure,
      closedAtIndex,
      observationsPlanned,
      observations,
      earn: {
        cash: principalCash + net,
        tokens: downside ? terms.tokens : 0n,
        principalCash,
        couponsNet: net,
      },
      protect: {
        cash: settlementCash + reserveRemaining,
        tokens: downside ? 0n : terms.tokens,
        settlementCash,
        reserveRemaining,
      },
      protocolFee: fee,
      coupons: { paidCount, gross, fee, net },
    };
  };

  for (let i = 0; i < observationsPlanned; i++) {
    if (i === missed) return close("unwind", i);

    const price = prices[i];
    if (price === undefined) {
      throw new PayoffInputError(
        `Observation ${i + 1} of ${observationsPlanned} has no price yet; the position is still open.`,
      );
    }

    // Exact comparisons: price/strike >= bps/10_000, no rounding anywhere.
    const scaledPrice = price * BPS;
    const couponPaid = scaledPrice >= params.strike * barrierBps;
    const isMaturity = i === observationsPlanned - 1;
    const autocalled =
      !isMaturity &&
      autocallBps !== null &&
      scaledPrice >= params.strike * autocallBps;

    if (couponPaid) paidCount += 1;
    observations.push({
      index: i,
      price,
      couponPaid,
      grossCoupon: couponPaid ? terms.grossCouponPerObservation : 0n,
      fee: couponPaid ? terms.feePerObservation : 0n,
      netCoupon: couponPaid ? terms.netCouponPerObservation : 0n,
      autocalled,
    });

    if (autocalled) return close("early", i);
    if (isMaturity) return close(couponPaid ? "normal" : "downside", i);
  }

  // Unreachable: the final iteration always returns. Kept so TypeScript and
  // future edits cannot silently fall through.
  throw new PayoffInputError("Simulation ended without a closure.");
}

function checkInputs(
  params: PayoffParams,
  prices: readonly bigint[],
  opts: SimulateOptions,
): { observationsPlanned: number; missed: number | undefined } {
  const observationsPlanned = params.observations;
  const missed = opts.missedObservationIndex;

  if (prices.length > observationsPlanned) {
    throw new PayoffInputError(
      `Got ${prices.length} prices for ${observationsPlanned} observations.`,
    );
  }
  prices.forEach((price, i) => {
    if (price <= 0n) {
      throw new PayoffInputError(
        `Price for observation ${i + 1} must be greater than 0.`,
      );
    }
  });
  if (missed !== undefined) {
    if (
      !Number.isInteger(missed) ||
      missed < 0 ||
      missed >= observationsPlanned
    ) {
      throw new PayoffInputError(
        `missedObservationIndex must be an integer from 0 to ${observationsPlanned - 1}.`,
      );
    }
    if (prices[missed] !== undefined) {
      throw new PayoffInputError(
        `A price was supplied for observation ${missed + 1}, which is marked as missed.`,
      );
    }
  }
  return { observationsPlanned, missed };
}
