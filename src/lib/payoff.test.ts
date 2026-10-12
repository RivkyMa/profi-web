import { describe, expect, it } from "vitest";
import {
  PayoffInputError,
  deriveTerms,
  simulate,
  validateParams,
  type PayoffParams,
  type PayoffResult,
} from "./payoff";
import { parseUnits as u } from "./units";

/**
 * Reference market from the spec: P0=100, N=10000, Q=100 tokens, B=65, A=100
 * with autocall on, 4 observations, gross coupon 50 per observation, R=200,
 * fee 5% (net 47.5, fee 2.5).
 */
const BASE: PayoffParams = {
  lots: 1n,
  tokensPerLot: u("100"),
  strike: u("100"),
  barrierBps: 6500,
  autocallBps: 10_000,
  observations: 4,
  couponPerLot: u("50"),
  feeBps: 500,
};

const path = (...values: Array<string | number>) => values.map((v) => u(v));

/** Compare cash/tokens as decimal strings so failures are readable. */
function summarize(r: PayoffResult) {
  const f = (v: bigint) => (Number(v) / 1_000_000).toString();
  return {
    closure: r.closure,
    earn: { cash: f(r.earn.cash), tokens: f(r.earn.tokens) },
    protect: { cash: f(r.protect.cash), tokens: f(r.protect.tokens) },
  };
}

describe("deriveTerms", () => {
  it("derives N, Q, B, A, R and coupon split for the reference market", () => {
    const t = deriveTerms(BASE);
    expect(t.principal).toBe(u("10000"));
    expect(t.tokens).toBe(u("100"));
    expect(t.barrier).toBe(u("65"));
    expect(t.autocall).toBe(u("100"));
    expect(t.grossCouponPerObservation).toBe(u("50"));
    expect(t.feePerObservation).toBe(u("2.5"));
    expect(t.netCouponPerObservation).toBe(u("47.5"));
    expect(t.reserve).toBe(u("200"));
  });

  it("scales with the number of lots", () => {
    const t = deriveTerms({
      ...BASE,
      lots: 3n,
      tokensPerLot: u("10"),
      couponPerLot: u("5"),
    });
    expect(t.principal).toBe(u("3000"));
    expect(t.tokens).toBe(u("30"));
    expect(t.grossCouponPerObservation).toBe(u("15"));
    expect(t.reserve).toBe(u("60"));
  });

  it("reports no autocall level when autocall is off", () => {
    expect(deriveTerms({ ...BASE, autocallBps: null }).autocall).toBeNull();
  });
});

describe("mandatory test vectors", () => {
  it("1: [94, 103] autocalls at the 2nd observation", () => {
    const r = simulate(BASE, path(94, 103));
    expect(r.closure).toBe("early");
    expect(r.closedAtIndex).toBe(1);
    expect(r.earn.cash).toBe(u("10095"));
    expect(r.earn.tokens).toBe(0n);
    expect(r.protect.tokens).toBe(u("100"));
    expect(r.protect.cash).toBe(u("100"));
    expect(r.protocolFee).toBe(u("5"));
  });

  it("2: [94, 78, 70, 80] pays all four coupons and matures normally", () => {
    const r = simulate(BASE, path(94, 78, 70, 80));
    expect(r.closure).toBe("normal");
    expect(r.earn.cash).toBe(u("10190"));
    expect(r.earn.tokens).toBe(0n);
    expect(r.protect.tokens).toBe(u("100"));
    expect(r.protect.cash).toBe(0n);
  });

  it("3: [94, 78, 60, 54] converts Earn into tokens at maturity", () => {
    const r = simulate(BASE, path(94, 78, 60, 54));
    expect(r.closure).toBe("downside");
    expect(r.earn.tokens).toBe(u("100"));
    expect(r.earn.cash).toBe(u("95"));
    expect(r.protect.tokens).toBe(0n);
    expect(r.protect.cash).toBe(u("10100"));
    expect(r.protect.settlementCash).toBe(u("10000"));
    expect(r.protect.reserveRemaining).toBe(u("100"));
  });

  it("4: [94, 60, 78, 80] has no coupon memory", () => {
    const r = simulate(BASE, path(94, 60, 78, 80));
    expect(r.closure).toBe("normal");
    expect(r.earn.cash).toBe(u("10142.5"));
    expect(r.protect.tokens).toBe(u("100"));
    expect(r.protect.cash).toBe(u("50"));
    expect(r.observations.map((o) => o.couponPaid)).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });
});

describe("equality at the barrier and at the autocall level", () => {
  it("Pi == B qualifies for a coupon and is a normal close at maturity", () => {
    const r = simulate(BASE, path(65, 65, 65, 65));
    expect(r.closure).toBe("normal");
    expect(r.coupons.paidCount).toBe(4);
    expect(r.earn.cash).toBe(u("10190"));
  });

  it("one unit below B pays no coupon and is a downside close at maturity", () => {
    const r = simulate(BASE, [u("94"), u("94"), u("94"), u("65") - 1n]);
    expect(r.closure).toBe("downside");
    expect(r.coupons.paidCount).toBe(3);
    expect(r.earn.tokens).toBe(u("100"));
  });

  it("Pi == A autocalls an intermediate observation", () => {
    const r = simulate(BASE, path(100));
    expect(r.closure).toBe("early");
    expect(r.closedAtIndex).toBe(0);
    expect(r.earn.cash).toBe(u("10047.5"));
    expect(r.protect.cash).toBe(u("150"));
    expect(r.protect.tokens).toBe(u("100"));
  });

  it("one unit below A does not autocall", () => {
    const r = simulate(BASE, [u("100") - 1n, u("94"), u("94"), u("94")]);
    expect(r.closure).toBe("normal");
    expect(r.closedAtIndex).toBe(3);
  });

  it("autocall off: a high intermediate price does not close early", () => {
    const r = simulate({ ...BASE, autocallBps: null }, path(94, 120, 70, 80));
    expect(r.closure).toBe("normal");
    expect(r.coupons.paidCount).toBe(4);
  });

  it("autocall never applies at maturity: a high final price is a normal close", () => {
    const r = simulate(BASE, path(94, 78, 70, 150));
    expect(r.closure).toBe("normal");
    expect(r.closedAtIndex).toBe(3);
  });

  it("shows the discontinuity at the barrier: Earn bears the whole drop just below B", () => {
    const above = simulate(BASE, [u("94"), u("94"), u("94"), u("65")]);
    const below = simulate(BASE, [u("94"), u("94"), u("94"), u("65") - 1n]);
    // Just above: Earn holds stablecoin principal plus 4 coupons.
    expect(above.earn.cash).toBe(u("10190"));
    expect(above.earn.tokens).toBe(0n);
    // Just below: Earn holds 100 tokens (worth ~6500 at the final price) plus 3 coupons.
    expect(below.earn.cash).toBe(u("142.5"));
    expect(below.earn.tokens).toBe(u("100"));
  });
});

describe("exceptional unwind (missed observation)", () => {
  it("unwinds at the missed observation and keeps accrued coupons", () => {
    const r = simulate(BASE, path(94, 78), { missedObservationIndex: 2 });
    expect(r.closure).toBe("unwind");
    expect(r.closedAtIndex).toBe(2);
    expect(r.earn.cash).toBe(u("10095"));
    expect(r.earn.tokens).toBe(0n);
    expect(r.protect.tokens).toBe(u("100"));
    expect(r.protect.cash).toBe(u("100"));
  });

  it("unwinds at the first observation with the full reserve returned", () => {
    const r = simulate(BASE, [], { missedObservationIndex: 0 });
    expect(r.closure).toBe("unwind");
    expect(r.earn.cash).toBe(u("10000"));
    expect(r.protect.tokens).toBe(u("100"));
    expect(r.protect.cash).toBe(u("200"));
    expect(r.protocolFee).toBe(0n);
  });

  it("unwinds when the maturity observation itself is missed", () => {
    const r = simulate(BASE, path(94, 60, 78), { missedObservationIndex: 3 });
    expect(r.closure).toBe("unwind");
    expect(r.closedAtIndex).toBe(3);
    expect(r.earn.cash).toBe(u("10095"));
    expect(r.protect.cash).toBe(u("100"));
  });

  it("is not triggered when the product already closed before the missed index", () => {
    const r = simulate(BASE, path(94, 103), { missedObservationIndex: 3 });
    expect(r.closure).toBe("early");
  });

  it("does not refund premium that was already paid", () => {
    const unwound = simulate(BASE, path(94, 94), { missedObservationIndex: 2 });
    expect(unwound.earn.couponsNet).toBe(u("95"));
  });
});

describe("fees and rounding", () => {
  it("rounds the protocol fee down and gives the remainder to Earn", () => {
    // gross 0.000033 -> fee 5% = 1.65 units -> 1 unit; net 32 units.
    const params: PayoffParams = { ...BASE, couponPerLot: u("0.000033") };
    const r = simulate(params, path(94, 94, 94, 94));
    expect(r.coupons.fee).toBe(4n);
    expect(r.coupons.net).toBe(4n * 32n);
    expect(r.coupons.gross).toBe(4n * 33n);
  });

  it("charges no fee when feeBps is 0", () => {
    const r = simulate({ ...BASE, feeBps: 0 }, path(94, 94, 94, 94));
    expect(r.protocolFee).toBe(0n);
    expect(r.earn.couponsNet).toBe(u("200"));
  });

  it("never charges a fee on principal, unwind or conversion", () => {
    const r = simulate(BASE, path(60, 60, 60, 60));
    expect(r.closure).toBe("downside");
    expect(r.protocolFee).toBe(0n);
  });
});

describe("conservation invariants", () => {
  // Deterministic PRNG so failures are reproducible.
  function mulberry32(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("allocates every stablecoin and token unit exactly once", () => {
    const rand = mulberry32(20260101);
    for (let run = 0; run < 2000; run++) {
      const observations = 1 + Math.floor(rand() * 8);
      const params: PayoffParams = {
        lots: BigInt(1 + Math.floor(rand() * 20)),
        tokensPerLot: u(String(1 + Math.floor(rand() * 50))),
        strike: u(String(1 + Math.floor(rand() * 500))),
        barrierBps: 1000 + Math.floor(rand() * 8500),
        autocallBps: rand() < 0.5 ? null : 10_000 + Math.floor(rand() * 3000),
        observations,
        couponPerLot: BigInt(Math.floor(rand() * 5_000_000)),
        feeBps: Math.floor(rand() * 1500),
      };
      const prices = Array.from({ length: observations }, () =>
        BigInt(1 + Math.floor(rand() * 2 * Number(params.strike))),
      );
      const missed =
        rand() < 0.2 ? Math.floor(rand() * observations) : undefined;
      const supplied = missed === undefined ? prices : prices.slice(0, missed);

      const t = deriveTerms(params);
      const r = simulate(params, supplied, { missedObservationIndex: missed });

      // Cash: Earn + Protect + protocol = principal + reserve.
      expect(r.earn.cash + r.protect.cash + r.protocolFee).toBe(
        t.principal + t.reserve,
      );
      // Tokens: all Q goes to exactly one side.
      expect(r.earn.tokens + r.protect.tokens).toBe(t.tokens);
      // Coupons: gross = net + fee, and never exceeds the reserve.
      expect(r.coupons.gross).toBe(r.coupons.net + r.coupons.fee);
      expect(r.coupons.gross <= t.reserve).toBe(true);
      expect(r.protect.reserveRemaining >= 0n).toBe(true);
      // Earn never ends below the net coupons it was paid.
      expect(r.earn.cash >= r.earn.couponsNet).toBe(true);
      // Downside is the only closure where Earn holds tokens.
      expect(r.earn.tokens > 0n).toBe(r.closure === "downside");
    }
  });
});

describe("input validation", () => {
  it("rejects a barrier outside (0%, 100%)", () => {
    expect(validateParams({ ...BASE, barrierBps: 0 })).not.toHaveLength(0);
    expect(validateParams({ ...BASE, barrierBps: 10_000 })).not.toHaveLength(0);
    expect(() => simulate({ ...BASE, barrierBps: 0 }, path(94))).toThrow(
      PayoffInputError,
    );
  });

  it("rejects an autocall level below 100%", () => {
    expect(validateParams({ ...BASE, autocallBps: 9_999 })).not.toHaveLength(0);
  });

  it("rejects a lot whose notional is not a whole number of units", () => {
    const issues = validateParams({
      ...BASE,
      tokensPerLot: u("0.000001"),
      strike: u("1.5"),
    });
    expect(issues).not.toHaveLength(0);
  });

  it("accepts the reference market", () => {
    expect(validateParams(BASE)).toEqual([]);
  });

  it("rejects non-positive prices (the oracle would too)", () => {
    expect(() => simulate(BASE, [u("94"), 0n])).toThrow(PayoffInputError);
    expect(() => simulate(BASE, [u("94"), -1n])).toThrow(PayoffInputError);
  });

  it("rejects an incomplete path while the position is still open", () => {
    expect(() => simulate(BASE, path(94, 78))).toThrow(/still open/);
    expect(() => simulate(BASE, [])).toThrow(PayoffInputError);
  });

  it("rejects more prices than observations", () => {
    expect(() => simulate(BASE, path(94, 94, 94, 94, 94))).toThrow(
      PayoffInputError,
    );
  });

  it("ignores prices after an early close", () => {
    const r = simulate(BASE, path(94, 103, 10, 10));
    expect(r.closure).toBe("early");
    expect(r.observations).toHaveLength(2);
  });

  it("rejects a price supplied for an observation marked as missed", () => {
    expect(() =>
      simulate(BASE, path(94, 78, 70), { missedObservationIndex: 2 }),
    ).toThrow(PayoffInputError);
  });

  it("rejects an out-of-range missed index", () => {
    expect(() =>
      simulate(BASE, path(94), { missedObservationIndex: 4 }),
    ).toThrow(PayoffInputError);
    expect(() =>
      simulate(BASE, path(94), { missedObservationIndex: -1 }),
    ).toThrow(PayoffInputError);
  });
});

describe("result shape", () => {
  it("summarizes the four vectors side by side", () => {
    expect(
      [
        path(94, 103),
        path(94, 78, 70, 80),
        path(94, 78, 60, 54),
        path(94, 60, 78, 80),
      ].map((p) => summarize(simulate(BASE, p))),
    ).toEqual([
      {
        closure: "early",
        earn: { cash: "10095", tokens: "0" },
        protect: { cash: "100", tokens: "100" },
      },
      {
        closure: "normal",
        earn: { cash: "10190", tokens: "0" },
        protect: { cash: "0", tokens: "100" },
      },
      {
        closure: "downside",
        earn: { cash: "95", tokens: "100" },
        protect: { cash: "10100", tokens: "0" },
      },
      {
        closure: "normal",
        earn: { cash: "10142.5", tokens: "0" },
        protect: { cash: "50", tokens: "100" },
      },
    ]);
  });
});
