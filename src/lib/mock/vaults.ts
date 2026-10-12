/**
 * Mock vault epochs. A vault allocates stablecoin across approved Earn
 * markets; shares are per epoch and withdrawals open after the epoch's
 * markets settle. Downside tokens are shared pro rata in kind.
 *
 * ALL DATA HERE IS FAKE.
 */

import { addDays, DEMO_TODAY } from "../dates";
import { runScenario, findScenario, type ScenarioId } from "../scenarios";
import { SCALE, parseUnits as u } from "../units";
import { lotTerms, type MockMarket } from "./markets";

export type EpochPhase = "open" | "locked" | "redeemable";

export interface VaultAllocation {
  marketId: string;
  weightBps: number;
  /** How this allocation resolves once the epoch becomes redeemable (mock). */
  outcome: ScenarioId;
}

export interface VaultEpoch {
  id: number;
  phase: EpochPhase;
  depositCloses: string;
  locksUntil: string;
  /** Cap on total deposits, in mUSD units. */
  cap: bigint;
  /** Deposits already in the epoch from other users (mock). */
  deposited: bigint;
  allocations: VaultAllocation[];
  cashBufferBps: number;
}

export function seedEpochs(): VaultEpoch[] {
  const t = (days: number) => addDays(DEMO_TODAY, days);
  return [
    {
      id: 14,
      phase: "open",
      depositCloses: t(5),
      locksUntil: t(40),
      cap: u("500000"),
      deposited: u("182400"),
      cashBufferBps: 500,
      allocations: [
        { marketId: "tsla-4w-a", weightBps: 4_000, outcome: "above" },
        { marketId: "nvda-6w-b", weightBps: 3_500, outcome: "below" },
        { marketId: "aapl-4w-c", weightBps: 2_000, outcome: "autocall" },
      ],
    },
    {
      id: 13,
      phase: "locked",
      depositCloses: t(-12),
      locksUntil: t(18),
      cap: u("400000"),
      deposited: u("396200"),
      cashBufferBps: 800,
      allocations: [
        { marketId: "aapl-4w-c", weightBps: 5_000, outcome: "above" },
        { marketId: "nvda-6w-b", weightBps: 4_200, outcome: "above" },
      ],
    },
    {
      id: 12,
      phase: "redeemable",
      depositCloses: t(-55),
      locksUntil: t(-20),
      cap: u("400000"),
      deposited: u("388000"),
      cashBufferBps: 500,
      allocations: [
        { marketId: "amzn-4w-d", weightBps: 4_500, outcome: "above" },
        { marketId: "tsla-4w-e", weightBps: 3_000, outcome: "below" },
        { marketId: "nvda-4w-f", weightBps: 2_000, outcome: "unwind" },
      ],
    },
  ];
}

export interface VaultPartOutcome {
  marketId: string;
  underlying: string;
  allocated: bigint;
  cash: bigint;
  tokens: bigint;
  /** Last observed price used to value tokens when redeeming in cash. */
  lastPrice: bigint;
  outcome: ScenarioId;
}

export interface VaultOutcome {
  parts: VaultPartOutcome[];
  buffer: bigint;
  cash: bigint;
  /** In-kind tokens by underlying symbol. */
  tokens: Record<string, bigint>;
  /** Cash plus all tokens sold at their last observed price. */
  cashOnly: bigint;
}

/**
 * What `amount` mUSD in this epoch ends up as. Each allocation behaves like
 * Earn lots in that market: the per-lot result is scaled by allocated /
 * principal, so it is exact integer math with no rounding up.
 */
export function epochOutcome(
  epoch: VaultEpoch,
  amount: bigint,
  markets: readonly MockMarket[],
): VaultOutcome {
  const parts: VaultPartOutcome[] = [];
  let cash = (amount * BigInt(epoch.cashBufferBps)) / 10_000n;
  const buffer = cash;
  const tokens: Record<string, bigint> = {};
  let tokenValue = 0n;

  for (const alloc of epoch.allocations) {
    const m = markets.find((x) => x.id === alloc.marketId);
    if (!m) continue;
    const allocated = (amount * BigInt(alloc.weightBps)) / 10_000n;
    const path = findScenario(m.params, alloc.outcome);
    const result = runScenario(m.params, path);
    const { principal } = lotTerms(m);

    const partCash = (result.earn.cash * allocated) / principal;
    const partTokens = (result.earn.tokens * allocated) / principal;
    const lastPrice = path.prices[path.prices.length - 1] ?? m.params.strike;

    cash += partCash;
    if (partTokens > 0n) {
      tokens[m.underlying] = (tokens[m.underlying] ?? 0n) + partTokens;
      tokenValue += (partTokens * lastPrice) / SCALE;
    }
    parts.push({
      marketId: m.id,
      underlying: m.underlying,
      allocated,
      cash: partCash,
      tokens: partTokens,
      lastPrice,
      outcome: alloc.outcome,
    });
  }

  return { parts, buffer, cash, tokens, cashOnly: cash + tokenValue };
}
