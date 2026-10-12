/**
 * The reference market used by the landing page's payoff explorer. These are
 * the spec's test-vector parameters, so every number shown on the landing page
 * is reproducible from payoff.test.ts.
 *
 * MOCK data: not a real market.
 */

import type { PayoffParams } from "../payoff";
import { parseUnits as u } from "../units";

export const referenceMarket: PayoffParams = {
  lots: 1n,
  tokensPerLot: u("100"),
  strike: u("100"),
  barrierBps: 6500,
  autocallBps: 10_000,
  observations: 4,
  couponPerLot: u("50"),
  feeBps: 500,
};

export interface InterimPath {
  id: "steady" | "dip" | "slide";
  label: string;
  description: string;
  /** Prices at observations 1 to 3. The final price comes from the slider. */
  prices: readonly bigint[];
}

export const interimPaths: readonly InterimPath[] = [
  {
    id: "steady",
    label: "Steady",
    description: "Observations 1-3 stay above the barrier",
    prices: [u("94"), u("78"), u("70")],
  },
  {
    id: "dip",
    label: "Dip, then recover",
    description: "Observation 2 dips below the barrier",
    prices: [u("94"), u("60"), u("78")],
  },
  {
    id: "slide",
    label: "Keeps falling",
    description: "Observation 3 is already below the barrier",
    prices: [u("94"), u("78"), u("60")],
  },
];

export interface TerminalScenario {
  id: "autocall" | "above" | "below" | "unwind";
  title: string;
  summary: string;
  prices: readonly bigint[];
  /** 0-based index of an observation with no oracle data past its deadline. */
  missedObservationIndex?: number;
}

/** The four ways a market can end (spec test vectors 1, 2, 3 and an unwind). */
export const terminalScenarios: readonly TerminalScenario[] = [
  {
    id: "autocall",
    title: "Autocall",
    summary: "Observation 2 is at or above the autocall level. The market closes early.",
    prices: [u("94"), u("103")],
  },
  {
    id: "above",
    title: "Matures at or above barrier",
    summary: "Every coupon qualifies and the final price holds above the barrier.",
    prices: [u("94"), u("78"), u("70"), u("80")],
  },
  {
    id: "below",
    title: "Matures below barrier",
    summary: "The final price ends below the barrier. Earn receives the token.",
    prices: [u("94"), u("78"), u("60"), u("54")],
  },
  {
    id: "unwind",
    title: "Unwind",
    summary: "Oracle data is missing past its deadline at observation 3.",
    prices: [u("94"), u("78")],
    missedObservationIndex: 2,
  },
];
