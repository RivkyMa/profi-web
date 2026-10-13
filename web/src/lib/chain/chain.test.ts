import { describe, expect, it } from "vitest";
import { Closure, EpochState, Phase, type Address } from "@profi/shared";
import vectors from "../../../../packages/shared/test-vectors.json";
import { readChainSetup } from "./config";
import { buildModel, isoFromUnix, marketStatus, toDeposit } from "./mapping";
import type { ChainMarketData, RawEpoch, RawMarket, RawSnapshot } from "./model";
import { nextEventTime } from "./schedule";
import { payoutFor } from "./settlement";
import type { ChainConfig } from "./config";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const E6 = 1_000_000n;

// ------------------------------------------------------------------ config

describe("readChainSetup", () => {
  const complete = {
    NEXT_PUBLIC_DATA_MODE: "chain",
    NEXT_PUBLIC_CHAIN_ID: "31337",
    NEXT_PUBLIC_RPC_URL: "http://127.0.0.1:8545",
    NEXT_PUBLIC_FACTORY_ADDRESS: A(1),
    NEXT_PUBLIC_STABLE_ADDRESS: A(2),
    NEXT_PUBLIC_UNDERLYINGS: `TSLA:${A(3)}:${A(4)}`,
  };

  it("is mock mode unless chain mode is asked for", () => {
    expect(readChainSetup({})).toEqual({ mode: "mock", reason: "default" });
    expect(readChainSetup({ ...complete, NEXT_PUBLIC_DATA_MODE: "mock" }).mode).toBe("mock");
  });

  it("falls back to mock, with reasons, when the configuration is incomplete", () => {
    const setup = readChainSetup({ NEXT_PUBLIC_DATA_MODE: "chain" });
    expect(setup.mode).toBe("mock");
    if (setup.mode === "mock" && setup.reason === "incomplete") {
      expect(setup.problems.join(" ")).toMatch(/CHAIN_ID/);
      expect(setup.problems.join(" ")).toMatch(/RPC_URL/);
      expect(setup.problems.join(" ")).toMatch(/FACTORY_ADDRESS/);
      expect(setup.problems.join(" ")).toMatch(/UNDERLYINGS/);
    } else {
      throw new Error("expected an incomplete setup");
    }
  });

  it("rejects malformed addresses and underlyings instead of guessing", () => {
    const bad = readChainSetup({ ...complete, NEXT_PUBLIC_FACTORY_ADDRESS: "0x123" });
    expect(bad.mode).toBe("mock");
    const badUnderlying = readChainSetup({ ...complete, NEXT_PUBLIC_UNDERLYINGS: "TSLA:nope" });
    expect(badUnderlying.mode).toBe("mock");
  });

  it("reads a complete configuration", () => {
    const setup = readChainSetup({ ...complete, NEXT_PUBLIC_START_BLOCK: "12" });
    expect(setup.mode).toBe("chain");
    if (setup.mode !== "chain") return;
    expect(setup.config).toMatchObject({
      chainId: 31337,
      isLocal: true,
      rpcUrl: "http://127.0.0.1:8545",
      factory: A(1),
      stable: A(2),
      vault: null,
      startBlock: 12n,
      templateId: 0n,
      nativeSymbol: "ETH",
    });
    expect(setup.config.underlyings).toEqual([{ symbol: "TSLA", token: A(3), oracle: A(4) }]);
  });

  it("does not treat another chain as local", () => {
    const setup = readChainSetup({ ...complete, NEXT_PUBLIC_CHAIN_ID: "46630" });
    expect(setup.mode === "chain" && setup.config.isLocal).toBe(false);
  });
});

// -------------------------------------------------------------- settlement

interface VectorParams {
  lots: string;
  tokensPerLot: string;
  strike: string;
  barrierBps: number;
  autocallBps: number | null;
  observations: number;
  couponPerLot: string;
  feeBps: number;
}

/** Pools exactly as MarketEscrow._close fixes them, for a fully matched market. */
function poolsFor(
  p: VectorParams,
  closure: string,
  couponsPaid: number,
): ChainMarketData["pools"] & { lots: bigint; lotPrincipal: bigint; lotReserve: bigint; lotTokens: bigint } {
  const lots = BigInt(p.lots);
  const lotTokens = BigInt(p.tokensPerLot);
  const lotPrincipal = (lotTokens * BigInt(p.strike)) / E6;
  const coupon = BigInt(p.couponPerLot);
  const lotReserve = BigInt(p.observations) * coupon;

  const grossEach = lots * coupon;
  const feeEach = (grossEach * BigInt(p.feeBps)) / 10_000n;
  const grossPaid = BigInt(couponsPaid) * grossEach;
  const couponsNet = BigInt(couponsPaid) * (grossEach - feeEach);
  const downside = closure === "downside";

  return {
    lots,
    lotPrincipal,
    lotReserve,
    lotTokens,
    earnCash: (downside ? 0n : lots * lotPrincipal) + couponsNet,
    earnTokens: downside ? lots * lotTokens : 0n,
    protectCash: (downside ? lots * lotPrincipal : 0n) + lots * lotReserve - grossPaid,
    protectTokens: downside ? 0n : lots * lotTokens,
  };
}

function marketData(over: Partial<ChainMarketData> = {}): ChainMarketData {
  return {
    address: A(100),
    underlying: A(3),
    oracle: A(4),
    creator: A(9),
    phase: Phase.Closed,
    closure: Closure.Normal,
    now: 1_000,
    subscribeDeadline: 100,
    observationWindow: 3_600,
    observationTimes: [200, 300, 400, 500],
    nextObservation: 4,
    closedAtIndex: 3,
    couponsPaid: 1,
    totalEarnLots: 1n,
    totalProtectLots: 1n,
    matchedLots: 1n,
    pools: { earnCash: 0n, earnTokens: 0n, protectCash: 0n, protectTokens: 0n },
    lotPrincipal: 100n,
    lotReserve: 20n,
    lotTokens: 10n,
    feeAccrued: 0n,
    feeCollected: 0n,
    observations: [],
    oracleSample: null,
    ...over,
  };
}

describe("payoutFor mirrors the model", () => {
  const list = (vectors as { vectors: Array<{ name: string; params: VectorParams; expected: Record<string, string | number> }> })
    .vectors;

  it.each(list.map((v) => [v.name, v] as const))("matches vector: %s", (_name, v) => {
    const e = v.expected;
    const pools = poolsFor(v.params, String(e.closure), Number(e.couponsPaid));
    const data = marketData({
      phase: Phase.Closed,
      totalEarnLots: pools.lots,
      totalProtectLots: pools.lots,
      matchedLots: pools.lots,
      lotPrincipal: pools.lotPrincipal,
      lotReserve: pools.lotReserve,
      lotTokens: pools.lotTokens,
      pools: {
        earnCash: pools.earnCash,
        earnTokens: pools.earnTokens,
        protectCash: pools.protectCash,
        protectTokens: pools.protectTokens,
      },
    });

    // One account holding every lot is paid exactly the model's totals.
    expect(payoutFor("earn", pools.lots, data)).toEqual({
      cash: BigInt(e.earnCash),
      tokens: BigInt(e.earnTokens),
    });
    expect(payoutFor("protect", pools.lots, data)).toEqual({
      cash: BigInt(e.protectCash),
      tokens: BigInt(e.protectTokens),
    });
  });

  it("shares pools pro rata and refunds unmatched lots, never paying out more than is held", () => {
    // 3 Earn lots (2 + 1 from two accounts) against 2 Protect lots: 2 matched.
    // One coupon of 5 per lot was paid, no fee. Normal close.
    const data = marketData({
      totalEarnLots: 3n,
      totalProtectLots: 2n,
      matchedLots: 2n,
      pools: {
        earnCash: 2n * 100n + 10n, // matched principal + net coupons
        earnTokens: 0n,
        protectCash: 2n * 20n - 10n, // reserve left after the coupon
        protectTokens: 2n * 10n,
      },
    });

    const a = payoutFor("earn", 2n, data)!;
    const b = payoutFor("earn", 1n, data)!;
    expect(a).toEqual({ cash: 206n, tokens: 0n }); // 210*2/3 + 2*100*1/3, floored
    expect(b).toEqual({ cash: 103n, tokens: 0n }); // 210*1/3 + 1*100*1/3, floored
    expect(payoutFor("protect", 2n, data)).toEqual({ cash: 30n, tokens: 20n });

    // 210 for the matched side + 100 for the one unmatched lot; one unit of dust stays.
    expect(a.cash + b.cash).toBeLessThanOrEqual(310n);
    expect(310n - (a.cash + b.cash)).toBeLessThanOrEqual(2n);
  });

  it("refunds everything when nothing was matched", () => {
    const data = marketData({ phase: Phase.Cancelled, closure: Closure.None, matchedLots: 0n });
    expect(payoutFor("earn", 3n, data)).toEqual({ cash: 300n, tokens: 0n });
    expect(payoutFor("protect", 2n, data)).toEqual({ cash: 40n, tokens: 20n });
  });

  it("owes nothing yet while the market is open", () => {
    expect(payoutFor("earn", 1n, marketData({ phase: Phase.Active }))).toBeNull();
    expect(payoutFor("protect", 1n, marketData({ phase: Phase.Subscription }))).toBeNull();
  });

  it("a position of zero lots is owed zero", () => {
    expect(payoutFor("earn", 0n, marketData())).toEqual({ cash: 0n, tokens: 0n });
  });
});

// ----------------------------------------------------------------- mapping

const config: ChainConfig = {
  chainId: 31337,
  name: "Anvil",
  rpcUrl: "http://127.0.0.1:8545",
  nativeSymbol: "ETH",
  explorerUrl: null,
  factory: A(1),
  registry: null,
  vault: A(7),
  stable: A(2),
  underlyings: [{ symbol: "TSLA", token: A(3), oracle: A(4) }],
  templateId: 0n,
  startBlock: 0n,
  walletConnectProjectId: null,
  isLocal: true,
};

function rawMarket(over: { phase?: number; closure?: number; deadline?: number; creator?: Address } = {}): RawMarket {
  return {
    terms: {
      address: A(100),
      underlying: A(3),
      oracle: A(4),
      lotTokens: 10n * E6,
      strike: 250n * E6,
      couponPerLot: 20n * E6,
      capLots: 200n,
      lotPrincipal: 2_500n * E6,
      lotReserve: 80n * E6,
      subscribeDeadline: over.deadline ?? 1_000,
      observationWindow: 86_400,
      observationCount: 4,
      barrierBps: 6_500,
      autocallBps: 10_000,
      feeBps: 500,
      observationTimes: [2_000, 3_000, 4_000, 5_000],
      creator: over.creator ?? A(9),
    },
    state: {
      phase: over.phase ?? Phase.Subscription,
      closure: over.closure ?? Closure.None,
      totalEarnLots: 5n,
      totalProtectLots: 3n,
      matchedLots: 0n,
      nextObservation: 0,
      closedAtIndex: 0,
      couponsPaid: 0,
      earnCash: 0n,
      earnTokens: 0n,
      protectCash: 0n,
      protectTokens: 0n,
      feeAccrued: 0n,
      feeCollected: 0n,
    },
    mine: { earnLots: 2n, protectLots: 0n, earnSettled: false, protectSettled: false },
    observations: [],
    oracle: null,
  };
}

function snapshot(markets: RawMarket[], epochs: RawEpoch[] = [], now = 500): RawSnapshot {
  return {
    now,
    blockNumber: 10n,
    markets,
    epochs,
    balances: { stable: 12n * E6, tokens: { [A(3).toLowerCase()]: 5n * E6 } },
    prices: { [A(3).toLowerCase()]: { price: 250n * E6, updatedAt: 400 } },
  };
}

describe("marketStatus", () => {
  it("separates open, awaiting activation, active, settled, unwound and cancelled", () => {
    expect(marketStatus(Phase.Subscription, Closure.None, 999, 1_000)).toBe("subscribing");
    expect(marketStatus(Phase.Subscription, Closure.None, 1_000, 1_000)).toBe("awaiting");
    expect(marketStatus(Phase.Active, Closure.None, 2_000, 1_000)).toBe("active");
    expect(marketStatus(Phase.Closed, Closure.Early, 9_000, 1_000)).toBe("settled");
    expect(marketStatus(Phase.Closed, Closure.Downside, 9_000, 1_000)).toBe("settled");
    expect(marketStatus(Phase.Closed, Closure.Unwind, 9_000, 1_000)).toBe("unwound");
    expect(marketStatus(Phase.Cancelled, Closure.None, 9_000, 1_000)).toBe("cancelled");
  });
});

describe("buildModel", () => {
  it("maps a market into the dashboard's shape", () => {
    const model = buildModel(snapshot([rawMarket()]), config, A(9));
    const m = model.markets[0]!;
    expect(m).toMatchObject({
      id: A(100),
      name: "TSLA 4-obs #1",
      underlying: "TSLA",
      creator: "you",
      capLots: 200,
      filledEarn: 5,
      filledProtect: 3,
      status: "subscribing",
    });
    expect(m.params).toMatchObject({
      tokensPerLot: 10n * E6,
      strike: 250n * E6,
      barrierBps: 6_500,
      autocallBps: 10_000,
      observations: 4,
      feeBps: 500,
    });
    expect(m.schedule.deadlineHours).toBe(24);
    expect(m.schedule.observations).toHaveLength(4);
    expect(m.chain?.lotPrincipal).toBe(2_500n * E6);
  });

  it("treats autocall 0 as off and marks other creators as the protocol", () => {
    const raw = rawMarket({ creator: A(5) });
    raw.terms.autocallBps = 0;
    const m = buildModel(snapshot([raw]), config, A(9)).markets[0]!;
    expect(m.params.autocallBps).toBeNull();
    expect(m.creator).toBe("protocol");
  });

  it("derives positions and claimed flags from the account's stake", () => {
    const raw = rawMarket({ phase: Phase.Closed, closure: Closure.Normal });
    raw.mine = { earnLots: 2n, protectLots: 1n, earnSettled: true, protectSettled: false };
    const model = buildModel(snapshot([raw]), config, A(9));
    expect(model.earn).toEqual([{ id: `earn-${A(100)}`, marketId: A(100), lots: 2, claimed: true }]);
    expect(model.protect).toEqual([{ id: `protect-${A(100)}`, marketId: A(100), lots: 1, claimed: false }]);
  });

  it("lists newest markets first and reads balances and prices by symbol", () => {
    const first = rawMarket();
    const second = rawMarket();
    second.terms.address = A(101);
    const model = buildModel(snapshot([first, second]), config, A(9));
    expect(model.markets.map((m) => m.id)).toEqual([A(101), A(100)]);
    expect(model.markets[0]!.name).toBe("TSLA 4-obs #2");
    expect(model.balances).toEqual({ musd: 12n * E6, tokens: { TSLA: 5n * E6 } });
    expect(model.prices).toEqual({ TSLA: { price: 250n * E6, updatedAt: 400 } });
  });

  it("has no balances or positions without a wallet", () => {
    const raw = rawMarket();
    raw.mine = null;
    const snap = snapshot([raw]);
    snap.balances = null;
    const model = buildModel(snap, config, null);
    expect(model.balances).toBeNull();
    expect(model.earn).toEqual([]);
  });
});

describe("vault epochs", () => {
  const epoch = (over: Partial<RawEpoch> = {}): RawEpoch => ({
    id: 0,
    state: EpochState.Open,
    depositCloses: 600,
    lockBy: 900,
    cashBufferBps: 2_500,
    cap: 500_000n * E6,
    deposited: 1_500n * E6,
    spent: 0n,
    settledStable: 0n,
    allocations: [{ market: A(100), weightBps: 7_500, lots: 0n }],
    tokenAmounts: [],
    myShares: 500n * E6,
    redeemed: false,
    ...over,
  });

  it("excludes the account's own deposit from the others' total", () => {
    const model = buildModel(snapshot([rawMarket()], [epoch()]), config, A(9));
    expect(model.epochs[0]).toMatchObject({
      id: 0,
      phase: "open",
      deposited: 1_000n * E6,
      cashBufferBps: 2_500,
    });
    expect(model.deposits).toEqual([
      { id: "dep-0", epochId: 0, amount: 500n * E6, status: "confirmed" },
    ]);
  });

  it("maps settled epochs with their token holdings by symbol", () => {
    const settled = epoch({
      state: EpochState.Settled,
      settledStable: 1_200n * E6,
      tokenAmounts: [{ token: A(3), amount: 4n * E6 }],
    });
    const model = buildModel(snapshot([rawMarket()], [settled]), config, A(9));
    const e = model.epochs[0]!;
    expect(e.phase).toBe("redeemable");
    expect(e.chain).toMatchObject({
      settledStable: 1_200n * E6,
      totalShares: 1_500n * E6,
      tokens: { TSLA: 4n * E6 },
    });
  });

  it("shows a redeemed deposit once the shares are gone", () => {
    expect(toDeposit(epoch({ myShares: 0n, redeemed: true }))).toMatchObject({ status: "redeemed" });
    expect(toDeposit(epoch({ myShares: 0n, redeemed: false }))).toBeNull();
  });
});

// ---------------------------------------------------------------- schedule

describe("nextEventTime", () => {
  const model = (markets: RawMarket[], epochs: RawEpoch[] = [], now = 500) =>
    buildModel(snapshot(markets, epochs, now), config, A(9));

  it("returns the subscription deadline while a market is open", () => {
    const m = model([rawMarket({ deadline: 1_000 })]);
    expect(nextEventTime(m.markets, m.epochs, 500)).toBe(1_000);
  });

  it("returns the next observation for an active market, then the unwind moment", () => {
    const m = model([rawMarket({ phase: Phase.Active, deadline: 100 })], [], 1_500);
    expect(nextEventTime(m.markets, m.epochs, 1_500)).toBe(2_000);
    expect(nextEventTime(m.markets, m.epochs, 2_100)).toBe(2_000 + 86_400 + 1);
  });

  it("ignores closed markets and picks the earliest across markets", () => {
    const closed = rawMarket({ phase: Phase.Closed, closure: Closure.Normal });
    const open = rawMarket({ deadline: 800 });
    open.terms.address = A(101);
    const m = model([closed, open]);
    expect(nextEventTime(m.markets, m.epochs, 500)).toBe(800);
    expect(nextEventTime([m.markets[1]!], [], 500)).toBeNull();
  });

  it("includes an open epoch's deposit close and lock deadline", () => {
    const e: RawEpoch = {
      id: 0,
      state: EpochState.Open,
      depositCloses: 600,
      lockBy: 900,
      cashBufferBps: 0,
      cap: 1n,
      deposited: 1n,
      spent: 0n,
      settledStable: 0n,
      allocations: [],
      tokenAmounts: [],
      myShares: 0n,
      redeemed: false,
    };
    const m = model([], [e]);
    expect(nextEventTime(m.markets, m.epochs, 500)).toBe(600);
    expect(nextEventTime(m.markets, m.epochs, 700)).toBe(900);
  });

  it("keeps second precision for epoch deadlines (the display strings drop seconds)", () => {
    const e: RawEpoch = {
      id: 0,
      state: EpochState.Open,
      depositCloses: 601,
      lockBy: 959,
      cashBufferBps: 0,
      cap: 1n,
      deposited: 1n,
      spent: 0n,
      settledStable: 0n,
      allocations: [],
      tokenAmounts: [],
      myShares: 0n,
      redeemed: false,
    };
    const m = model([], [e]);
    expect(m.epochs[0]!.chain).toMatchObject({ depositClosesAt: 601, lockByAt: 959 });
    expect(nextEventTime(m.markets, m.epochs, 500)).toBe(601);
    expect(nextEventTime(m.markets, m.epochs, 601)).toBe(959);
  });

  it("is null when nothing is pending", () => {
    expect(nextEventTime([], [], 500)).toBeNull();
  });
});

describe("isoFromUnix", () => {
  it("formats minutes in UTC", () => {
    expect(isoFromUnix(0)).toBe("1970-01-01T00:00Z");
    expect(isoFromUnix(1_791_869_256)).toBe("2026-10-13T05:27Z");
  });
});
