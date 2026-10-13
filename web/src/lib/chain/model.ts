/**
 * Plain data types for what is read from a chain. No viem import here, so
 * the mock bundle can carry these types without carrying any chain code.
 */

import type { Address } from "@profi/shared";

/** Terms fixed at deployment. They never change, so they are cached by address. */
export interface RawTerms {
  address: Address;
  underlying: Address;
  oracle: Address;
  lotTokens: bigint;
  strike: bigint;
  couponPerLot: bigint;
  capLots: bigint;
  lotPrincipal: bigint;
  lotReserve: bigint;
  subscribeDeadline: number;
  observationWindow: number;
  observationCount: number;
  barrierBps: number;
  autocallBps: number;
  feeBps: number;
  /** Unix seconds, one per observation; the last is maturity. */
  observationTimes: number[];
  creator: Address;
}

export interface RawMarketState {
  phase: number;
  closure: number;
  totalEarnLots: bigint;
  totalProtectLots: bigint;
  matchedLots: bigint;
  nextObservation: number;
  closedAtIndex: number;
  couponsPaid: number;
  earnCash: bigint;
  earnTokens: bigint;
  protectCash: bigint;
  protectTokens: bigint;
  feeAccrued: bigint;
  feeCollected: bigint;
}

/** The connected account's stake in one market. */
export interface RawMine {
  earnLots: bigint;
  protectLots: bigint;
  earnSettled: boolean;
  protectSettled: boolean;
}

export interface RawObservation {
  index: number;
  price: bigint;
  updatedAt: number;
  couponPaid: boolean;
  autocalled: boolean;
}

export interface RawMarket {
  terms: RawTerms;
  state: RawMarketState;
  mine: RawMine | null;
  observations: RawObservation[];
  /** Latest sample of the market's oracle, if it has one. */
  oracle: { price: bigint; updatedAt: number } | null;
}

export interface RawEpoch {
  id: number;
  state: number;
  depositCloses: number;
  lockBy: number;
  cashBufferBps: number;
  cap: bigint;
  deposited: bigint;
  spent: bigint;
  settledStable: bigint;
  allocations: Array<{ market: Address; weightBps: number; lots: bigint }>;
  tokenAmounts: Array<{ token: Address; amount: bigint }>;
  myShares: bigint;
  /** The account has redeemed (a Redeemed event exists for it). */
  redeemed: boolean;
}

export interface RawSnapshot {
  /** Latest block timestamp, unix seconds. */
  now: number;
  blockNumber: bigint;
  markets: RawMarket[];
  epochs: RawEpoch[];
  /** Null when no wallet is connected. */
  balances: { stable: bigint; tokens: Record<string, bigint> } | null;
  /** Latest oracle price per underlying token address (lower-cased). */
  prices: Record<string, { price: bigint; updatedAt: number } | null>;
}

/** What the UI keeps on a market that came from a chain. */
export interface ChainMarketData {
  address: Address;
  underlying: Address;
  oracle: Address;
  creator: Address;
  phase: number;
  closure: number;
  now: number;
  subscribeDeadline: number;
  observationWindow: number;
  observationTimes: number[];
  nextObservation: number;
  closedAtIndex: number;
  couponsPaid: number;
  totalEarnLots: bigint;
  totalProtectLots: bigint;
  matchedLots: bigint;
  pools: {
    earnCash: bigint;
    earnTokens: bigint;
    protectCash: bigint;
    protectTokens: bigint;
  };
  lotPrincipal: bigint;
  lotReserve: bigint;
  lotTokens: bigint;
  feeAccrued: bigint;
  feeCollected: bigint;
  observations: RawObservation[];
  oracleSample: { price: bigint; updatedAt: number } | null;
}
