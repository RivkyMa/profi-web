/**
 * What can be done next on a market or a vault epoch, as pure functions of a
 * state snapshot. The keeper acts on it and the dashboard offers the same step
 * as a button. Nothing here touches the network.
 *
 * Every action is permissionless and re-validated by the contract, so a wrong
 * or stale plan costs a reverted simulation, never funds. The planner is
 * deliberately conservative: it acts only when the contract's own guard would
 * pass at the snapshot time.
 */

import { EpochState, Phase } from "./abis";
import type { Address } from "./index";

export interface OracleSample {
  price: bigint;
  updatedAt: bigint;
}

export interface MarketSnapshot {
  address: Address;
  /** Latest block timestamp the snapshot was taken at. */
  now: bigint;
  phase: number;
  subscribeDeadline: bigint;
  nextObservation: number;
  observationCount: number;
  /** Due time of the next observation, when the market is active and has one. */
  nextDue: bigint | null;
  observationWindow: bigint;
  /** Latest oracle sample, or null when the oracle has no price yet. */
  oracle: OracleSample | null;
  feeAccrued: bigint;
  feeCollected: bigint;
}

export type MarketAction =
  | { kind: "activate"; market: Address }
  | { kind: "observe"; market: Address }
  | { kind: "unwind"; market: Address }
  | { kind: "collectFees"; market: Address };

/** True when the oracle sample is valid data for the window [due, due + window]. */
export function hasValidData(
  oracle: OracleSample | null,
  due: bigint,
  window: bigint,
): boolean {
  if (!oracle || oracle.price === 0n) return false;
  return oracle.updatedAt >= due && oracle.updatedAt <= due + window;
}

export function planMarket(s: MarketSnapshot): MarketAction | null {
  switch (s.phase) {
    case Phase.Subscription:
      return s.now >= s.subscribeDeadline ? { kind: "activate", market: s.address } : null;

    case Phase.Active: {
      if (s.nextDue === null || s.nextObservation >= s.observationCount) return null;
      if (s.now < s.nextDue) return null;
      if (hasValidData(s.oracle, s.nextDue, s.observationWindow)) {
        return { kind: "observe", market: s.address };
      }
      // No valid data. The contract allows an unwind only once the window has
      // closed; while it is still open the oracle may yet publish.
      if (s.now > s.nextDue + s.observationWindow) {
        return { kind: "unwind", market: s.address };
      }
      return null;
    }

    case Phase.Closed:
      return s.feeAccrued > s.feeCollected ? { kind: "collectFees", market: s.address } : null;

    default:
      return null;
  }
}

export interface EpochSnapshot {
  id: bigint;
  vault: Address;
  now: bigint;
  state: number;
  depositCloses: bigint;
  lockBy: bigint;
  deposited: bigint;
  /** Phase of every market the epoch actually subscribed to (lots > 0). */
  subscribedMarketPhases: number[];
}

export type EpochAction =
  | { kind: "lock"; vault: Address; epoch: bigint }
  | { kind: "settle"; vault: Address; epoch: bigint }
  | { kind: "abort"; vault: Address; epoch: bigint };

export function planEpoch(e: EpochSnapshot): EpochAction | null {
  switch (e.state) {
    case EpochState.Open: {
      // An epoch nobody deposited into has nothing to lock or abort.
      if (e.deposited === 0n) return null;
      if (e.now < e.depositCloses) return null;
      if (e.now < e.lockBy) return { kind: "lock", vault: e.vault, epoch: e.id };
      return { kind: "abort", vault: e.vault, epoch: e.id };
    }
    case EpochState.Locked: {
      const resolved = e.subscribedMarketPhases.every(
        (p) => p === Phase.Closed || p === Phase.Cancelled,
      );
      return resolved ? { kind: "settle", vault: e.vault, epoch: e.id } : null;
    }
    default:
      return null;
  }
}
