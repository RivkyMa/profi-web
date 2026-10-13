/**
 * Turns raw chain reads into the view models the dashboard already renders
 * (markets, positions, vault epochs). Pure functions: no network, no viem.
 */

import { Closure, EpochState, Phase, type Address } from "@profi/shared";
import type { MarketStatus, MockMarket } from "../mock/markets";
import type { EpochPhase, VaultEpoch } from "../mock/vaults";
import type { Position } from "../portfolio";
import type { ScenarioId } from "../scenarios";
import type { VaultDeposit, Wallet } from "../store";
import type { ChainConfig } from "./config";
import type { ChainMarketData, RawEpoch, RawMarket, RawSnapshot } from "./model";

/** Unix seconds -> "2026-10-13T05:31Z", the format `formatDate` slices. */
export function isoFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 16) + "Z";
}

export function marketStatus(phase: number, closure: number, now: number, deadline: number): MarketStatus {
  switch (phase) {
    case Phase.Subscription:
      return now < deadline ? "subscribing" : "awaiting";
    case Phase.Active:
      return "active";
    case Phase.Closed:
      return closure === Closure.Unwind ? "unwound" : "settled";
    default:
      return "cancelled";
  }
}

const SCENARIO_BY_CLOSURE: Record<number, ScenarioId | undefined> = {
  [Closure.Early]: "autocall",
  [Closure.Normal]: "above",
  [Closure.Downside]: "below",
  [Closure.Unwind]: "unwind",
};

export interface MappingContext {
  config: ChainConfig;
  account: Address | null;
  now: number;
}

const lower = (a: string) => a.toLowerCase();

function symbolOf(config: ChainConfig, token: Address): string {
  const found = config.underlyings.find((u) => lower(u.token) === lower(token));
  return found?.symbol ?? `${token.slice(0, 6)}...${token.slice(-4)}`;
}

export function toMarket(raw: RawMarket, index: number, ctx: MappingContext): MockMarket {
  const { terms: t, state: s } = raw;
  const symbol = symbolOf(ctx.config, t.underlying);
  const you = ctx.account !== null && lower(ctx.account) === lower(t.creator);

  const chain: ChainMarketData = {
    address: t.address,
    underlying: t.underlying,
    oracle: t.oracle,
    creator: t.creator,
    phase: s.phase,
    closure: s.closure,
    now: ctx.now,
    subscribeDeadline: t.subscribeDeadline,
    observationWindow: t.observationWindow,
    observationTimes: t.observationTimes,
    nextObservation: s.nextObservation,
    closedAtIndex: s.closedAtIndex,
    couponsPaid: s.couponsPaid,
    totalEarnLots: s.totalEarnLots,
    totalProtectLots: s.totalProtectLots,
    matchedLots: s.matchedLots,
    pools: {
      earnCash: s.earnCash,
      earnTokens: s.earnTokens,
      protectCash: s.protectCash,
      protectTokens: s.protectTokens,
    },
    lotPrincipal: t.lotPrincipal,
    lotReserve: t.lotReserve,
    lotTokens: t.lotTokens,
    feeAccrued: s.feeAccrued,
    feeCollected: s.feeCollected,
    observations: raw.observations,
    oracleSample: raw.oracle,
  };

  return {
    id: t.address,
    name: `${symbol} ${t.observationCount}-obs #${index + 1}`,
    underlying: symbol,
    creator: you ? "you" : "protocol",
    params: {
      lots: 1n,
      tokensPerLot: t.lotTokens,
      strike: t.strike,
      barrierBps: t.barrierBps,
      autocallBps: t.autocallBps === 0 ? null : t.autocallBps,
      observations: t.observationCount,
      couponPerLot: t.couponPerLot,
      feeBps: t.feeBps,
    },
    capLots: Number(t.capLots),
    filledEarn: Number(s.totalEarnLots),
    filledProtect: Number(s.totalProtectLots),
    schedule: {
      subscribeBy: isoFromUnix(t.subscribeDeadline),
      lockedFrom: isoFromUnix(t.subscribeDeadline),
      observations: t.observationTimes.map(isoFromUnix),
      deadlineHours: Math.round(t.observationWindow / 3600),
    },
    status: marketStatus(s.phase, s.closure, ctx.now, t.subscribeDeadline),
    resolution: SCENARIO_BY_CLOSURE[s.closure],
    chain,
  };
}

export function toPositions(markets: RawMarket[]): { earn: Position[]; protect: Position[] } {
  const earn: Position[] = [];
  const protect: Position[] = [];
  for (const m of markets) {
    if (!m.mine) continue;
    const id = m.terms.address;
    if (m.mine.earnLots > 0n) {
      earn.push({
        id: `earn-${id}`,
        marketId: id,
        lots: Number(m.mine.earnLots),
        claimed: m.mine.earnSettled,
      });
    }
    if (m.mine.protectLots > 0n) {
      protect.push({
        id: `protect-${id}`,
        marketId: id,
        lots: Number(m.mine.protectLots),
        claimed: m.mine.protectSettled,
      });
    }
  }
  return { earn, protect };
}

const EPOCH_PHASE: Record<number, EpochPhase> = {
  [EpochState.Open]: "open",
  [EpochState.Locked]: "locked",
  [EpochState.Settled]: "redeemable",
  [EpochState.Aborted]: "aborted",
};

export function toEpoch(raw: RawEpoch, markets: RawMarket[], config: ChainConfig): VaultEpoch {
  const byAddress = new Map(markets.map((m) => [lower(m.terms.address), m]));

  // The epoch is "locked until" the last maturity among the markets it holds.
  let lastMaturity = raw.lockBy;
  for (const a of raw.allocations) {
    const times = byAddress.get(lower(a.market))?.terms.observationTimes ?? [];
    const maturity = times[times.length - 1];
    if (maturity !== undefined && maturity > lastMaturity) lastMaturity = maturity;
  }

  const tokens: Record<string, bigint> = {};
  for (const t of raw.tokenAmounts) {
    const symbol = symbolOf(config, t.token);
    tokens[symbol] = (tokens[symbol] ?? 0n) + t.amount;
  }

  return {
    id: raw.id,
    phase: EPOCH_PHASE[raw.state] ?? "open",
    depositCloses: isoFromUnix(raw.depositCloses),
    locksUntil: isoFromUnix(lastMaturity),
    cap: raw.cap,
    // The dashboard adds the connected account's own deposits on top of this.
    deposited: raw.deposited - raw.myShares,
    cashBufferBps: raw.cashBufferBps,
    allocations: raw.allocations.map((a) => ({
      marketId: byAddress.get(lower(a.market))?.terms.address ?? a.market,
      weightBps: a.weightBps,
      lots: a.lots,
    })),
    chain: {
      settledStable: raw.settledStable,
      totalShares: raw.deposited,
      tokens,
      depositClosesAt: raw.depositCloses,
      lockByAt: raw.lockBy,
    },
  };
}

export function toDeposit(raw: RawEpoch): VaultDeposit | null {
  if (raw.myShares > 0n) {
    return { id: `dep-${raw.id}`, epochId: raw.id, amount: raw.myShares, status: "confirmed" };
  }
  if (raw.redeemed) {
    return { id: `dep-${raw.id}`, epochId: raw.id, amount: 0n, status: "redeemed", redeemedAs: "kind" };
  }
  return null;
}

export interface ChainModel {
  now: number;
  markets: MockMarket[];
  earn: Position[];
  protect: Position[];
  epochs: VaultEpoch[];
  deposits: VaultDeposit[];
  /** Null when no wallet is connected. */
  balances: Pick<Wallet, "musd" | "tokens"> | null;
  /** Latest oracle price by underlying symbol. */
  prices: Record<string, { price: bigint; updatedAt: number }>;
}

export function buildModel(raw: RawSnapshot, config: ChainConfig, account: Address | null): ChainModel {
  const ctx: MappingContext = { config, account, now: raw.now };

  // Newest first, like a feed: a market you just created is on top.
  const markets = raw.markets.map((m, i) => toMarket(m, i, ctx)).reverse();
  const { earn, protect } = toPositions(raw.markets);

  const deposits: VaultDeposit[] = [];
  for (const e of raw.epochs) {
    const d = toDeposit(e);
    if (d) deposits.push(d);
  }

  let balances: ChainModel["balances"] = null;
  if (raw.balances) {
    const tokens: Record<string, bigint> = {};
    for (const u of config.underlyings) {
      tokens[u.symbol] = raw.balances.tokens[lower(u.token)] ?? 0n;
    }
    balances = { musd: raw.balances.stable, tokens };
  }

  const prices: ChainModel["prices"] = {};
  for (const u of config.underlyings) {
    const p = raw.prices[lower(u.token)];
    if (p) prices[u.symbol] = p;
  }

  return {
    now: raw.now,
    markets,
    earn,
    protect,
    epochs: raw.epochs.map((e) => toEpoch(e, raw.markets, config)).reverse(),
    deposits,
    balances,
    prices,
  };
}
