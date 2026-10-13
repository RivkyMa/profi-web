import { describe, expect, it } from "vitest";
import { EpochState, Phase, type Address } from "@profi/shared";
import {
  hasValidData,
  planEpoch,
  planMarket,
  type EpochSnapshot,
  type MarketSnapshot,
} from "../src/plan";

const M = "0x00000000000000000000000000000000000000aa" as Address;
const V = "0x00000000000000000000000000000000000000bb" as Address;

const DAY = 86_400n;
const T0 = 1_000_000n;

function market(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    address: M,
    now: T0,
    phase: Phase.Active,
    subscribeDeadline: T0 - 10n * DAY,
    nextObservation: 0,
    observationCount: 4,
    nextDue: T0 + 2n * DAY,
    observationWindow: DAY,
    oracle: null,
    feeAccrued: 0n,
    feeCollected: 0n,
    ...overrides,
  };
}

describe("hasValidData", () => {
  const due = 1_000n;
  const window = 100n;

  it("accepts data inside [due, due + window], boundaries included", () => {
    expect(hasValidData({ price: 5n, updatedAt: 1_000n }, due, window)).toBe(true);
    expect(hasValidData({ price: 5n, updatedAt: 1_100n }, due, window)).toBe(true);
  });

  it("rejects early, late, zero-price and missing data", () => {
    expect(hasValidData({ price: 5n, updatedAt: 999n }, due, window)).toBe(false);
    expect(hasValidData({ price: 5n, updatedAt: 1_101n }, due, window)).toBe(false);
    expect(hasValidData({ price: 0n, updatedAt: 1_050n }, due, window)).toBe(false);
    expect(hasValidData(null, due, window)).toBe(false);
  });
});

describe("planMarket", () => {
  it("waits during subscription, activates at the deadline", () => {
    const m = market({ phase: Phase.Subscription, subscribeDeadline: T0 + 5n });
    expect(planMarket({ ...m, now: T0 + 4n })).toBeNull();
    expect(planMarket({ ...m, now: T0 + 5n })).toEqual({ kind: "activate", market: M });
  });

  it("does nothing before an observation is due", () => {
    expect(planMarket(market({ now: T0 + 2n * DAY - 1n }))).toBeNull();
  });

  it("observes when valid data is present inside the window", () => {
    const due = T0 + 2n * DAY;
    const m = market({
      now: due + 60n,
      nextDue: due,
      oracle: { price: 94n, updatedAt: due + 30n },
    });
    expect(planMarket(m)).toEqual({ kind: "observe", market: M });
  });

  it("waits while the window is open and the oracle has nothing valid yet", () => {
    const due = T0 + 2n * DAY;
    const stale = { price: 94n, updatedAt: due - 5n };
    expect(planMarket(market({ now: due + 10n, nextDue: due, oracle: stale }))).toBeNull();
    expect(planMarket(market({ now: due + 10n, nextDue: due, oracle: null }))).toBeNull();
  });

  it("unwinds only after the window closed with no valid data", () => {
    const due = T0 + 2n * DAY;
    const closedAt = due + DAY;
    const noData = { nextDue: due, oracle: null };
    expect(planMarket(market({ ...noData, now: closedAt }))).toBeNull(); // last second of the window
    expect(planMarket(market({ ...noData, now: closedAt + 1n }))).toEqual({
      kind: "unwind",
      market: M,
    });
  });

  it("prefers a late observation to an unwind when valid data exists", () => {
    const due = T0 + 2n * DAY;
    const m = market({
      now: due + DAY + 500n,
      nextDue: due,
      // The oracle holds data inside the window even though the window has passed.
      oracle: { price: 80n, updatedAt: due + DAY - 1n },
    });
    expect(planMarket(m)).toEqual({ kind: "observe", market: M });
  });

  it("never plans an unwind for data that is only valid for a later window", () => {
    const due = T0 + 2n * DAY;
    const m = market({
      now: due + DAY + 1n,
      nextDue: due,
      oracle: { price: 80n, updatedAt: due + DAY + 1n }, // after this window
    });
    expect(planMarket(m)).toEqual({ kind: "unwind", market: M });
  });

  it("does nothing when all observations are recorded", () => {
    expect(planMarket(market({ nextObservation: 4, nextDue: null }))).toBeNull();
  });

  it("collects fees on a closed market, once", () => {
    const closed = market({ phase: Phase.Closed, nextDue: null, feeAccrued: 10n });
    expect(planMarket(closed)).toEqual({ kind: "collectFees", market: M });
    expect(planMarket({ ...closed, feeCollected: 10n })).toBeNull();
  });

  it("ignores cancelled markets", () => {
    expect(planMarket(market({ phase: Phase.Cancelled, nextDue: null }))).toBeNull();
  });
});

describe("planEpoch", () => {
  const base: EpochSnapshot = {
    id: 3n,
    vault: V,
    now: T0,
    state: EpochState.Open,
    depositCloses: T0 - 10n,
    lockBy: T0 + DAY,
    deposited: 1_000n,
    subscribedMarketPhases: [],
  };

  it("waits for the deposit window, then locks", () => {
    expect(planEpoch({ ...base, depositCloses: T0 + 1n })).toBeNull();
    expect(planEpoch(base)).toEqual({ kind: "lock", vault: V, epoch: 3n });
  });

  it("aborts an epoch that missed its lock window", () => {
    expect(planEpoch({ ...base, now: base.lockBy })).toEqual({
      kind: "abort",
      vault: V,
      epoch: 3n,
    });
  });

  it("leaves an empty epoch alone", () => {
    expect(planEpoch({ ...base, deposited: 0n })).toBeNull();
    expect(planEpoch({ ...base, deposited: 0n, now: base.lockBy + 1n })).toBeNull();
  });

  it("settles a locked epoch only when every subscribed market resolved", () => {
    const locked = { ...base, state: EpochState.Locked };
    expect(planEpoch({ ...locked, subscribedMarketPhases: [Phase.Closed, Phase.Active] })).toBeNull();
    expect(
      planEpoch({ ...locked, subscribedMarketPhases: [Phase.Closed, Phase.Cancelled] }),
    ).toEqual({ kind: "settle", vault: V, epoch: 3n });
  });

  it("does nothing for settled or aborted epochs", () => {
    expect(planEpoch({ ...base, state: EpochState.Settled })).toBeNull();
    expect(planEpoch({ ...base, state: EpochState.Aborted })).toBeNull();
  });
});
