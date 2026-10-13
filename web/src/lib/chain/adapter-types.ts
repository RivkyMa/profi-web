/**
 * The seam between the dashboard store and a chain. The store never imports
 * wagmi or viem: it only knows this interface, and the chain bridge installs
 * an implementation when the app runs against a network.
 */

import type { MarketDraft } from "../mock/markets";
import type { Side } from "../portfolio";
import type { ActionResult } from "../store";

/** Permissionless steps anyone may take on a market. */
export type MarketOp = "activate" | "observe" | "unwind" | "collectFees";
/** Permissionless steps anyone may take on a vault epoch. */
export type EpochOp = "lock" | "settle" | "abort";

export interface ChainAdapter {
  /** Opens the wallet connection UI. */
  connect(): void;
  disconnect(): void;

  subscribe(side: Side, marketId: string, lots: number): Promise<ActionResult>;
  /** Withdraws the caller's whole position on one side while the market is still subscribing. */
  cancelPosition(side: Side, marketId: string): Promise<ActionResult>;
  createMarket(draft: MarketDraft): Promise<ActionResult>;
  claim(side: Side, positionId: string): Promise<ActionResult>;

  vaultDeposit(epochId: number, amount: bigint): Promise<ActionResult>;
  vaultCancel(depositId: string): Promise<ActionResult>;
  vaultRedeem(depositId: string, mode: "kind" | "cash"): Promise<ActionResult>;

  marketAction(marketId: string, op: MarketOp): Promise<ActionResult>;
  epochAction(epochId: number, op: EpochOp): Promise<ActionResult>;

  /** Mints mock tokens to the connected account (the mock tokens allow open minting). */
  faucet(kind: "stable" | "tokens"): Promise<ActionResult>;
  /** Publishes a mock oracle price for an underlying, timestamped with the latest block. */
  setPrice(symbol: string, price: bigint): Promise<ActionResult>;
  /** Local chain only: moves the clock forward and mines a block. */
  advanceTime(seconds: number): Promise<ActionResult>;
}
