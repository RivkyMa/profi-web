import { describe, expect, it } from "vitest";
import { simulate, type PayoffParams } from "./payoff";
import {
  findScenario,
  interimPrices,
  runScenario,
  scenarioPaths,
} from "./scenarios";
import { parseUnits as u } from "./units";

const BASE: PayoffParams = {
  lots: 1n,
  tokensPerLot: u("10"),
  strike: u("250"),
  barrierBps: 6500,
  autocallBps: 10_000,
  observations: 4,
  couponPerLot: u("20"),
  feeBps: 500,
};

describe("scenarioPaths", () => {
  it("produces the four outcomes, each with the closure it names", () => {
    const paths = scenarioPaths(BASE);
    expect(paths.map((p) => p.id)).toEqual(["autocall", "above", "below", "unwind"]);
    const closure = Object.fromEntries(
      paths.map((p) => [p.id, runScenario(BASE, p).closure]),
    );
    expect(closure).toEqual({
      autocall: "early",
      above: "normal",
      below: "downside",
      unwind: "unwind",
    });
  });

  it("omits the autocall path when autocall is off", () => {
    const paths = scenarioPaths({ ...BASE, autocallBps: null });
    expect(paths.map((p) => p.id)).not.toContain("autocall");
  });

  it("stays valid for every observation count and barrier the templates allow", () => {
    for (const observations of [2, 4, 6, 12]) {
      for (const barrierBps of [4000, 6500, 9000]) {
        for (const autocallBps of [null, 10_000, 12_000]) {
          const params = { ...BASE, observations, barrierBps, autocallBps };
          for (const path of scenarioPaths(params)) {
            expect(() => runScenario(params, path)).not.toThrow();
          }
        }
      }
    }
  });

  it("downside gives Earn the token and Protect the principal", () => {
    const r = runScenario(BASE, findScenario(BASE, "below"));
    expect(r.earn.tokens).toBe(u("10"));
    expect(r.protect.settlementCash).toBe(u("2500"));
  });
});

describe("interimPrices", () => {
  it("returns one price per observation before maturity", () => {
    expect(interimPrices(BASE, "steady")).toHaveLength(3);
    expect(interimPrices({ ...BASE, observations: 12 }, "dip")).toHaveLength(11);
  });

  it("steady keeps every observation above the barrier, dip and slide do not", () => {
    const barrier = (BASE.strike * BigInt(BASE.barrierBps)) / 10_000n;
    expect(interimPrices(BASE, "steady").every((p) => p >= barrier)).toBe(true);
    expect(interimPrices(BASE, "dip").some((p) => p < barrier)).toBe(true);
    expect(interimPrices(BASE, "slide").at(-1)! < barrier).toBe(true);
  });

  it("composes with a final price into a complete path", () => {
    const prices = [...interimPrices(BASE, "steady"), u("200")];
    expect(simulate(BASE, prices).closure).toBe("normal");
  });
});
