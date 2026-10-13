/**
 * Cross-language fixtures. The TypeScript payoff model is the source of truth:
 * this file defines the scenarios, runs them through `simulate`, and checks the
 * result against packages/shared/test-vectors.json. The Foundry tests read the
 * SAME json and must reproduce every number from the Solidity escrow.
 *
 * To regenerate after an intentional model change:
 *   UPDATE_VECTORS=1 npm test
 * and commit the new json. Without that flag a mismatch is a test failure, so
 * the fixture can never drift from the model silently.
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { simulate, type PayoffParams } from "./payoff";
import { parseUnits as u } from "./units";

const FILE = fileURLToPath(
  new URL("../../../packages/shared/test-vectors.json", import.meta.url),
);

interface Scenario {
  name: string;
  params: PayoffParams;
  /** Prices in whole units (decimal strings), one per observation made. */
  prices: string[];
  missedObservationIndex?: number;
}

/** The spec's reference market: P0 100, N 10,000, Q 100, B 65, A 100, R 200. */
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

const SCENARIOS: Scenario[] = [
  // The four mandatory vectors from the specification.
  { name: "spec-1 autocall at observation 2", params: BASE, prices: ["94", "103"] },
  { name: "spec-2 all coupons, normal maturity", params: BASE, prices: ["94", "78", "70", "80"] },
  { name: "spec-3 below barrier at maturity", params: BASE, prices: ["94", "78", "60", "54"] },
  { name: "spec-4 no coupon memory", params: BASE, prices: ["94", "60", "78", "80"] },
  // Equality and the unit either side of each threshold.
  { name: "equality at the barrier pays and is normal", params: BASE, prices: ["65", "65", "65", "65"] },
  { name: "one unit below the barrier at maturity", params: BASE, prices: ["94", "94", "94", "64.999999"] },
  { name: "equality at the autocall level", params: BASE, prices: ["100"] },
  { name: "one unit below the autocall level", params: BASE, prices: ["99.999999", "94", "94", "94"] },
  // Autocall off, and a high final price (autocall never applies at maturity).
  { name: "autocall off ignores a high intermediate price", params: { ...BASE, autocallBps: null }, prices: ["94", "120", "70", "80"] },
  { name: "high final price is a normal close", params: BASE, prices: ["94", "78", "70", "150"] },
  // Exceptional unwind at the first, a middle and the maturity observation.
  { name: "unwind at a middle observation", params: BASE, prices: ["94", "78"], missedObservationIndex: 2 },
  { name: "unwind at the first observation", params: BASE, prices: [], missedObservationIndex: 0 },
  { name: "unwind at maturity", params: BASE, prices: ["94", "60", "78"], missedObservationIndex: 3 },
  // Fees.
  { name: "fee rounds down, remainder to Earn", params: { ...BASE, couponPerLot: u("0.000033") }, prices: ["94", "94", "94", "94"] },
  { name: "zero fee", params: { ...BASE, feeBps: 0 }, prices: ["94", "94", "94", "94"] },
  // A different market shape with several lots and six observations.
  {
    name: "three lots, six observations, normal",
    params: {
      lots: 3n,
      tokensPerLot: u("10"),
      strike: u("250"),
      barrierBps: 7000,
      autocallBps: 10_500,
      observations: 6,
      couponPerLot: u("27"),
      feeBps: 500,
    },
    prices: ["240", "230", "180", "175", "200", "190"],
  },
  {
    name: "three lots, six observations, downside",
    params: {
      lots: 3n,
      tokensPerLot: u("10"),
      strike: u("250"),
      barrierBps: 7000,
      autocallBps: 10_500,
      observations: 6,
      couponPerLot: u("27"),
      feeBps: 500,
    },
    prices: ["240", "230", "180", "175", "200", "160"],
  },
  {
    name: "three lots, six observations, autocall at observation 3",
    params: {
      lots: 3n,
      tokensPerLot: u("10"),
      strike: u("250"),
      barrierBps: 7000,
      autocallBps: 10_500,
      observations: 6,
      couponPerLot: u("27"),
      feeBps: 500,
    },
    prices: ["240", "230", "262.5"],
  },
];

function build() {
  const vectors = SCENARIOS.map((s) => {
    const prices = s.prices.map((p) => u(p));
    const r = simulate(
      s.params,
      prices,
      s.missedObservationIndex === undefined
        ? {}
        : { missedObservationIndex: s.missedObservationIndex },
    );
    return {
      name: s.name,
      params: {
        lots: s.params.lots.toString(),
        tokensPerLot: s.params.tokensPerLot.toString(),
        strike: s.params.strike.toString(),
        barrierBps: s.params.barrierBps,
        // 0 means autocall is off (the contracts use the same encoding).
        autocallBps: s.params.autocallBps ?? 0,
        observations: s.params.observations,
        couponPerLot: s.params.couponPerLot.toString(),
        feeBps: s.params.feeBps,
      },
      prices: prices.map((p) => p.toString()),
      // -1 means no observation was missed.
      missedObservationIndex: s.missedObservationIndex ?? -1,
      expected: {
        closure: r.closure,
        closedAtIndex: r.closedAtIndex,
        couponsPaid: r.coupons.paidCount,
        earnCash: r.earn.cash.toString(),
        earnTokens: r.earn.tokens.toString(),
        protectCash: r.protect.cash.toString(),
        protectTokens: r.protect.tokens.toString(),
        protocolFee: r.protocolFee.toString(),
      },
    };
  });
  return {
    description:
      "Generated by web/src/lib/shared-vectors.test.ts from the TypeScript payoff model. " +
      "Amounts are base units with 6 decimals (stable and token). Do not edit by hand.",
    decimals: 6,
    count: vectors.length,
    vectors,
  };
}

describe("shared test vectors", () => {
  const generated = build();

  if (process.env.UPDATE_VECTORS) {
    fs.writeFileSync(FILE, JSON.stringify(generated, null, 2) + "\n");
  }

  it("packages/shared/test-vectors.json matches the TypeScript model exactly", () => {
    const onDisk = JSON.parse(fs.readFileSync(FILE, "utf8"));
    expect(onDisk).toEqual(generated);
  });

  it("keeps the four mandatory specification vectors at their stated numbers", () => {
    const byName = (prefix: string) =>
      generated.vectors.find((v) => v.name.startsWith(prefix))!.expected;

    expect(byName("spec-1")).toMatchObject({
      closure: "early",
      earnCash: u("10095").toString(),
      protectTokens: u("100").toString(),
      protectCash: u("100").toString(),
    });
    expect(byName("spec-2")).toMatchObject({
      closure: "normal",
      earnCash: u("10190").toString(),
      protectTokens: u("100").toString(),
      protectCash: "0",
    });
    expect(byName("spec-3")).toMatchObject({
      closure: "downside",
      earnCash: u("95").toString(),
      earnTokens: u("100").toString(),
      protectCash: u("10100").toString(),
    });
    expect(byName("spec-4")).toMatchObject({
      closure: "normal",
      earnCash: u("10142.5").toString(),
      protectTokens: u("100").toString(),
      protectCash: u("50").toString(),
    });
  });

  it("covers every closure kind", () => {
    const kinds = new Set(generated.vectors.map((v) => v.expected.closure));
    expect([...kinds].sort()).toEqual(["downside", "early", "normal", "unwind"]);
  });
});
