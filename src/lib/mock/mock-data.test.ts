import { describe, expect, it } from "vitest";
import { simulate } from "../payoff";
import { findScenario, runScenario } from "../scenarios";
import { parseUnits as u } from "../units";
import {
  DEFAULT_DRAFT,
  draftToParams,
  lotTerms,
  seedMarkets,
  validateDraft,
} from "./markets";
import { epochOutcome, seedEpochs } from "./vaults";

describe("seed markets", () => {
  it("are all valid payoff parameters with unique ids", () => {
    const markets = seedMarkets();
    expect(new Set(markets.map((m) => m.id)).size).toBe(markets.length);
    for (const m of markets) {
      const path = findScenario(m.params, m.resolution ?? "above");
      expect(() => runScenario(m.params, path)).not.toThrow();
      expect(m.schedule.observations).toHaveLength(m.params.observations);
    }
  });

  it("settled and unwound markets carry a matching resolution", () => {
    for (const m of seedMarkets()) {
      if (m.status === "unwound") expect(m.resolution).toBe("unwind");
      if (m.status === "subscribing") expect(m.resolution).toBeUndefined();
    }
  });
});

describe("Studio draft", () => {
  it("the default draft is valid and keeps coupon / principal exact", () => {
    expect(validateDraft(DEFAULT_DRAFT)).toEqual([]);
    const p = draftToParams(DEFAULT_DRAFT);
    // 10 tokens x 250 = 2500; 80 bps = 20 per observation.
    expect(p.couponPerLot).toBe(u("20"));
    expect(simulate(p, [u("240"), u("240"), u("240"), u("240")]).closure).toBe("normal");
  });

  it("rejects values outside the template bounds", () => {
    expect(validateDraft({ ...DEFAULT_DRAFT, barrierBps: 9_500 })).not.toHaveLength(0);
    expect(validateDraft({ ...DEFAULT_DRAFT, barrierBps: 3_000 })).not.toHaveLength(0);
    expect(validateDraft({ ...DEFAULT_DRAFT, couponBps: 1_000 })).not.toHaveLength(0);
    expect(validateDraft({ ...DEFAULT_DRAFT, observations: 5 })).not.toHaveLength(0);
    expect(validateDraft({ ...DEFAULT_DRAFT, capLots: 5 })).not.toHaveLength(0);
    expect(validateDraft({ ...DEFAULT_DRAFT, autocallBps: 9_000 })).not.toHaveLength(0);
  });

  it("ignores the autocall level when autocall is off", () => {
    const draft = { ...DEFAULT_DRAFT, autocallEnabled: false, autocallBps: 5 };
    expect(validateDraft(draft)).toEqual([]);
    expect(draftToParams(draft).autocallBps).toBeNull();
  });
});

describe("epochOutcome", () => {
  const markets = seedMarkets();
  const redeemable = seedEpochs().find((e) => e.phase === "redeemable")!;

  it("allocates every mUSD to cash or to tokens at the strike-converted value", () => {
    const amount = u("10000");
    const o = epochOutcome(redeemable, amount, markets);
    // Cash never exceeds principal plus coupons.
    expect(o.cash > 0n).toBe(true);
    expect(o.cashOnly >= o.cash).toBe(true);
    // The "below" allocation is the only one that returns tokens.
    expect(Object.keys(o.tokens)).toEqual(["TSLA"]);
  });

  it("scales with the deposit, differing only by integer rounding", () => {
    const one = epochOutcome(redeemable, u("1000"), markets);
    const ten = epochOutcome(redeemable, u("10000"), markets);
    // Each division floors, so a larger deposit can only gain whole units
    // (never lose any), and by no more than one unit per allocation and side.
    const slack = BigInt(ten.parts.length * 2 + 2);
    expect(ten.cash >= one.cash * 10n).toBe(true);
    expect(ten.cash - one.cash * 10n <= slack * 10n).toBe(true);
    expect(ten.tokens.TSLA >= one.tokens.TSLA * 10n).toBe(true);
    expect(ten.tokens.TSLA - one.tokens.TSLA * 10n <= slack * 10n).toBe(true);
  });

  it("lot terms expose principal and reserve per lot", () => {
    const m = markets[0];
    const t = lotTerms(m);
    expect(t.principal).toBe(u("2500"));
    expect(t.reserve).toBe(u("80"));
  });
});
