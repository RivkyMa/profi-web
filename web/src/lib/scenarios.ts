/**
 * Illustrative price paths for any market parameters. They are NOT forecasts:
 * they exist so a market's four terminal outcomes can always be shown side by
 * side, and so a mock market can be "fast-forwarded" to an outcome.
 */

import { simulate, type PayoffParams, type PayoffResult } from "./payoff";

export type ScenarioId = "autocall" | "above" | "below" | "unwind";

export interface ScenarioPath {
  id: ScenarioId;
  title: string;
  summary: string;
  prices: bigint[];
  missedObservationIndex?: number;
}

export type InterimKind = "steady" | "dip" | "slide";

const BPS = 10_000n;
const at = (strike: bigint, bps: number) => (strike * BigInt(bps)) / BPS;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Price (bps of strike) of a calm observation: above the barrier, below autocall. */
function steadyBps(params: PayoffParams, index: number): number {
  return clamp(9_400 - index * 800, params.barrierBps + 300, 9_900);
}

/** Prices for observations 1..n-1 (everything before maturity). */
export function interimPrices(
  params: PayoffParams,
  kind: InterimKind,
): bigint[] {
  const n = Math.max(0, params.observations - 1);
  const out: bigint[] = [];
  const belowBps = Math.max(params.barrierBps - 500, 500);
  for (let i = 0; i < n; i++) {
    let bps = steadyBps(params, i);
    if (kind === "dip" && i === Math.min(1, n - 1)) bps = belowBps;
    if (kind === "slide" && i === n - 1) bps = belowBps;
    out.push(at(params.strike, bps));
  }
  return out;
}

/** The four terminal outcomes for the given parameters. */
export function scenarioPaths(params: PayoffParams): ScenarioPath[] {
  const n = params.observations;
  const steady = (count: number) =>
    Array.from({ length: Math.max(0, count) }, (_, i) =>
      at(params.strike, steadyBps(params, i)),
    );
  const paths: ScenarioPath[] = [];

  if (params.autocallBps !== null && n >= 2) {
    paths.push({
      id: "autocall",
      title: "Autocall",
      summary: "Observation 2 reaches the autocall level and the market closes early.",
      prices: [
        ...steady(1),
        at(params.strike, params.autocallBps + 300),
      ],
    });
  }

  paths.push({
    id: "above",
    title: "Matures at or above barrier",
    summary: "Every coupon qualifies and the final price holds above the barrier.",
    prices: [
      ...steady(n - 1),
      at(params.strike, clamp(params.barrierBps + 1_500, 5_000, 9_900)),
    ],
  });

  paths.push({
    id: "below",
    title: "Matures below barrier",
    summary: "The final price ends below the barrier. Earn receives the token.",
    prices: [
      ...steady(n - 2),
      ...(n >= 2 ? [at(params.strike, Math.max(params.barrierBps - 500, 500))] : []),
      at(params.strike, Math.max(params.barrierBps - 1_100, 300)),
    ],
  });

  const missed = Math.min(2, n - 1);
  paths.push({
    id: "unwind",
    title: "Unwind",
    summary: `Oracle data is missing past its deadline at observation ${missed + 1}.`,
    prices: steady(missed),
    missedObservationIndex: missed,
  });

  return paths;
}

export function runScenario(
  params: PayoffParams,
  scenario: ScenarioPath,
): PayoffResult {
  return simulate(
    params,
    scenario.prices,
    scenario.missedObservationIndex === undefined
      ? {}
      : { missedObservationIndex: scenario.missedObservationIndex },
  );
}

/** The scenario with this id, or the first one when it does not apply. */
export function findScenario(
  params: PayoffParams,
  id: ScenarioId,
): ScenarioPath {
  const paths = scenarioPaths(params);
  return paths.find((p) => p.id === id) ?? paths[0];
}
