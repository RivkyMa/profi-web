import { describe, expect, it } from "vitest";
import { simulate, type PayoffParams } from "./payoff";
import { valuate } from "./payoff-view";
import { parseUnits as u } from "./units";

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

const path = (...v: number[]) => v.map((x) => u(x));

describe("valuate", () => {
  it("shows Earn's loss when the final price ends below the barrier", () => {
    const prices = path(94, 78, 60, 54);
    const v = valuate(BASE, simulate(BASE, prices), u("54"));
    // 100 tokens at 54 = 5,400, plus 95 of net coupons.
    expect(v.earnValue).toBe(u("5495"));
    expect(v.earnPnl).toBe(u("-4505"));
    // Protection pays N - Q*PT = 4,600, minus 100 of premium paid.
    expect(v.protectNet).toBe(u("4500"));
    expect(v.premiumPaid).toBe(u("100"));
  });

  it("shows a small gain for Earn and only the premium as Protect's cost above the barrier", () => {
    const prices = path(94, 78, 70, 80);
    const v = valuate(BASE, simulate(BASE, prices), u("80"));
    expect(v.earnPnl).toBe(u("190"));
    expect(v.protectNet).toBe(u("-200"));
    expect(v.premiumPaid).toBe(u("200"));
  });

  it("makes the cliff at the barrier visible in Earn's value", () => {
    const at = (final: bigint) =>
      valuate(BASE, simulate(BASE, [u("94"), u("94"), u("94"), final]), final);
    const above = at(u("65"));
    const below = at(u("65") - 1n);
    expect(above.earnValue - below.earnValue).toBeGreaterThan(u("3500"));
  });

  it("values an unwind at principal plus accrued coupons", () => {
    const r = simulate(BASE, path(94, 78), { missedObservationIndex: 2 });
    const v = valuate(BASE, r, u("78"));
    expect(v.earnValue).toBe(u("10095"));
    expect(v.earnPnl).toBe(u("95"));
  });
});
