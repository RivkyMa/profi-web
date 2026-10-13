/**
 * Mock markets and the Studio template. ALL DATA HERE IS FAKE: tickers are
 * labels for mock tokens ("mTSLA"), prices and schedules are invented, and
 * nothing is connected to any chain.
 */

import type { ChainMarketData } from "../chain/model";
import { addDays, DEMO_TODAY } from "../dates";
import { deriveTerms, validateParams, type PayoffParams } from "../payoff";
import type { ScenarioId } from "../scenarios";
import { parseUnits as u } from "../units";

/** Display currency for the browser demo; this is not a deployed USDG token. */
export const QUOTE = "USDG";

export interface Underlying {
  symbol: string;
  name: string;
  /** Illustrative USDG reference price, never a live market quote. */
  refPrice: string;
}

export const UNDERLYINGS: readonly Underlying[] = [
  { symbol: "TSLA", name: "Tokenized TSLA (mock)", refPrice: "250" },
  { symbol: "NVDA", name: "Tokenized NVDA (mock)", refPrice: "120" },
  { symbol: "AAPL", name: "Tokenized AAPL (mock)", refPrice: "210" },
  { symbol: "AMZN", name: "Tokenized AMZN (mock)", refPrice: "185" },
  { symbol: "GOOGL", name: "Alphabet / Google (mock)", refPrice: "175" },
  { symbol: "META", name: "Meta Platforms (mock)", refPrice: "500" },
  { symbol: "HOOD", name: "Robinhood (mock)", refPrice: "25" },
  { symbol: "MSFT", name: "Microsoft (mock)", refPrice: "420" },
];

/**
 * subscribing: open for deposits. awaiting: subscription is over but nobody has
 * activated the market yet (chain mode). cancelled: nothing matched (chain mode).
 */
export type MarketStatus =
  | "subscribing"
  | "awaiting"
  | "active"
  | "settled"
  | "unwound"
  | "cancelled";

export interface MarketSchedule {
  subscribeBy: string;
  lockedFrom: string;
  /** One date per scheduled observation; the last one is maturity. */
  observations: string[];
  /** Hours after an observation time before missing data triggers unwind. */
  deadlineHours: number;
}

export interface MockMarket {
  id: string;
  /** Short label, e.g. "TSLA 4W A". */
  name: string;
  underlying: string;
  creator: "protocol" | "you";
  /** Per-lot terms: `lots` is 1. Multiply by a position's lots when simulating. */
  params: PayoffParams;
  capLots: number;
  filledEarn: number;
  filledProtect: number;
  schedule: MarketSchedule;
  status: MarketStatus;
  /** Present once the market has settled or unwound. */
  resolution?: ScenarioId;
  /** Present only for markets read from a chain (see lib/chain). */
  chain?: ChainMarketData;
}

export const UNWIND_POLICY =
  "If the oracle price for an observation is missing past its deadline, the market unwinds: Earn gets its principal back, Protect gets the token and the remaining premium reserve. Coupons already paid stay with Earn, later coupons and protection are cancelled, and premium already paid is not refunded.";

function weekly(from: string, count: number, everyDays = 7): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, (i + 1) * everyDays));
}

function market(
  id: string,
  name: string,
  underlying: string,
  p: {
    tokens: string;
    strike: string;
    barrierBps: number;
    autocallBps: number | null;
    observations: number;
    coupon: string;
    cap: number;
    filledEarn: number;
    filledProtect: number;
    lockedFrom: string;
    everyDays?: number;
    status: MarketStatus;
    resolution?: ScenarioId;
    creator?: "protocol" | "you";
  },
): MockMarket {
  return {
    id,
    name,
    underlying,
    creator: p.creator ?? "protocol",
    params: {
      lots: 1n,
      tokensPerLot: u(p.tokens),
      strike: u(p.strike),
      barrierBps: p.barrierBps,
      autocallBps: p.autocallBps,
      observations: p.observations,
      couponPerLot: u(p.coupon),
      feeBps: 500,
    },
    capLots: p.cap,
    filledEarn: p.filledEarn,
    filledProtect: p.filledProtect,
    schedule: {
      subscribeBy: addDays(p.lockedFrom, -1),
      lockedFrom: p.lockedFrom,
      observations: weekly(p.lockedFrom, p.observations, p.everyDays),
      deadlineHours: 48,
    },
    status: p.status,
    resolution: p.resolution,
  };
}

export function seedMarkets(): MockMarket[] {
  const t = (days: number) => addDays(DEMO_TODAY, days);
  return [
    market("tsla-4w-a", "TSLA 4W A", "TSLA", {
      tokens: "10", strike: "250", barrierBps: 6500, autocallBps: 10_000,
      observations: 4, coupon: "20", cap: 200, filledEarn: 64, filledProtect: 41,
      lockedFrom: t(6), status: "subscribing",
    }),
    market("nvda-6w-b", "NVDA 6W B", "NVDA", {
      tokens: "25", strike: "120", barrierBps: 7000, autocallBps: 10_500,
      observations: 6, coupon: "27", cap: 150, filledEarn: 88, filledProtect: 60,
      lockedFrom: t(9), status: "subscribing",
    }),
    market("aapl-4w-c", "AAPL 4W C", "AAPL", {
      tokens: "10", strike: "210", barrierBps: 6000, autocallBps: null,
      observations: 4, coupon: "18", cap: 300, filledEarn: 300, filledProtect: 300,
      lockedFrom: t(-8), status: "active",
    }),
    market("amzn-4w-d", "AMZN 4W D", "AMZN", {
      tokens: "12", strike: "185", barrierBps: 6500, autocallBps: 10_000,
      observations: 4, coupon: "17", cap: 120, filledEarn: 120, filledProtect: 120,
      lockedFrom: t(-40), status: "settled", resolution: "above",
    }),
    market("tsla-4w-e", "TSLA 4W E", "TSLA", {
      tokens: "10", strike: "250", barrierBps: 6500, autocallBps: 10_000,
      observations: 4, coupon: "20", cap: 160, filledEarn: 160, filledProtect: 160,
      lockedFrom: t(-45), status: "settled", resolution: "below",
    }),
    market("nvda-4w-f", "NVDA 4W F", "NVDA", {
      tokens: "25", strike: "120", barrierBps: 7000, autocallBps: 10_000,
      observations: 4, coupon: "24", cap: 90, filledEarn: 90, filledProtect: 90,
      lockedFrom: t(-50), status: "unwound", resolution: "unwind",
    }),
    ...UNDERLYINGS.slice(4).map((asset, i) => market(
      `${asset.symbol.toLowerCase()}-4w-demo`, `${asset.symbol} 4W`, asset.symbol,
      {
        tokens: "10", strike: asset.refPrice, barrierBps: 6500, autocallBps: 10_000,
        observations: 4, coupon: String(Number(asset.refPrice) * 0.08),
        cap: 100, filledEarn: 20 + i * 5, filledProtect: 15 + i * 5,
        lockedFrom: t(7 + i), status: "subscribing",
      },
    )),
  ];
}

/** Principal (N) and token amount (Q) for one lot. */
export function lotTerms(m: MockMarket) {
  const t = deriveTerms(m.params);
  return {
    principal: t.principal,
    tokens: t.tokens,
    reserve: t.reserve,
    grossCoupon: t.grossCouponPerObservation,
    netCoupon: t.netCouponPerObservation,
    barrier: t.barrier,
    autocall: t.autocall,
  };
}

export function remainingLots(m: MockMarket): number {
  return Math.max(0, m.capLots - Math.max(m.filledEarn, m.filledProtect));
}

export const STATUS_LABEL: Record<MarketStatus, string> = {
  subscribing: "Open for deposits",
  awaiting: "Awaiting activation",
  active: "Active",
  settled: "Settled",
  unwound: "Unwound",
  cancelled: "Cancelled (not matched)",
};

// ---------------------------------------------------------------- Studio

/** Template limits. Studio only creates markets inside these bounds. */
export const TEMPLATE = {
  barrierBps: { min: 4_000, max: 9_000 },
  autocallBps: { min: 10_000, max: 12_000 },
  couponBps: { min: 20, max: 300 },
  observations: [4, 6, 12] as const,
  capLots: { min: 10, max: 1_000 },
  tokensPerLot: { min: 1, max: 1_000 },
  feeBps: 500,
} as const;

export interface MarketDraft {
  underlying: string;
  tokensPerLot: number;
  /** Gross coupon per observation as bps of the lot principal. */
  couponBps: number;
  barrierBps: number;
  autocallEnabled: boolean;
  autocallBps: number;
  observations: number;
  capLots: number;
  everyDays: number;
}

export const DEFAULT_DRAFT: MarketDraft = {
  underlying: "TSLA",
  tokensPerLot: 10,
  couponBps: 80,
  barrierBps: 6_500,
  autocallEnabled: true,
  autocallBps: 10_000,
  observations: 4,
  capLots: 100,
  everyDays: 7,
};

/**
 * Per-lot parameters for a draft. `strikes` overrides the mock reference price
 * per symbol: in chain mode the strike is the oracle's latest price.
 */
export function draftToParams(
  d: MarketDraft,
  strikes: Readonly<Record<string, bigint>> = {},
): PayoffParams {
  const ref = UNDERLYINGS.find((x) => x.symbol === d.underlying) ?? UNDERLYINGS[0];
  const strike = strikes[d.underlying] ?? u(ref.refPrice);
  const tokensPerLot = u(String(Math.max(0, Math.floor(d.tokensPerLot))));
  const principal = (tokensPerLot * strike) / 1_000_000n;
  return {
    lots: 1n,
    tokensPerLot,
    strike,
    barrierBps: d.barrierBps,
    autocallBps: d.autocallEnabled ? d.autocallBps : null,
    observations: d.observations,
    couponPerLot: (principal * BigInt(Math.round(d.couponBps))) / 10_000n,
    feeBps: TEMPLATE.feeBps,
  };
}

/** Human-readable problems with a Studio draft; empty when it can be created. */
export function validateDraft(d: MarketDraft): string[] {
  const issues: string[] = [];
  const T = TEMPLATE;
  const int = Number.isInteger;

  if (!UNDERLYINGS.some((x) => x.symbol === d.underlying)) {
    issues.push("Choose an underlying from the list.");
  }
  if (!int(d.tokensPerLot) || d.tokensPerLot < T.tokensPerLot.min || d.tokensPerLot > T.tokensPerLot.max) {
    issues.push(`Tokens per lot must be a whole number from ${T.tokensPerLot.min} to ${T.tokensPerLot.max}.`);
  }
  if (!int(d.couponBps) || d.couponBps < T.couponBps.min || d.couponBps > T.couponBps.max) {
    issues.push(`Coupon must be between ${T.couponBps.min / 100}% and ${T.couponBps.max / 100}% of principal per observation.`);
  }
  if (!int(d.barrierBps) || d.barrierBps < T.barrierBps.min || d.barrierBps > T.barrierBps.max) {
    issues.push(`Barrier must be between ${T.barrierBps.min / 100}% and ${T.barrierBps.max / 100}% of strike.`);
  }
  if (d.autocallEnabled && (!int(d.autocallBps) || d.autocallBps < T.autocallBps.min || d.autocallBps > T.autocallBps.max)) {
    issues.push(`Autocall level must be between ${T.autocallBps.min / 100}% and ${T.autocallBps.max / 100}% of strike.`);
  }
  if (!(T.observations as readonly number[]).includes(d.observations)) {
    issues.push("Choose a tenor from the list.");
  }
  if (!int(d.capLots) || d.capLots < T.capLots.min || d.capLots > T.capLots.max) {
    issues.push(`Cap must be between ${T.capLots.min} and ${T.capLots.max} lots.`);
  }
  if (issues.length === 0) issues.push(...validateParams(draftToParams(d)));
  return issues;
}
