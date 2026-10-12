/**
 * Display formatting for fixed-point payoff values. Pure bigint math (no
 * floats) and locale-pinned so server and client always render identical text.
 */

import { SCALE } from "./units";

const HALF_CENT = SCALE / 200n; // 0.005 in units
const CENT = SCALE / 100n; // 0.01 in units

/** 10142.5 units -> "10,142.50". Rounds half away from zero to cents. */
export function formatAmount(value: bigint, options: { cents?: boolean } = {}): string {
  const { cents: showCents = true } = options;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const totalCents = (abs + HALF_CENT) / CENT;
  const whole = totalCents / 100n;
  const cents = totalCents % 100n;

  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = showCents
    ? `${wholeText}.${cents.toString().padStart(2, "0")}`
    : wholeText;
  return negative && totalCents !== 0n ? `-${body}` : body;
}

/** Like formatAmount but always shows a sign (+ or -); zero has none. */
export function formatSigned(value: bigint): string {
  const text = formatAmount(value);
  if (value > 0n && text !== "0.00") return `+${text}`;
  return text;
}

/** Fraction numerator/denominator as a percent with one decimal ("-45.1%"). */
export function formatPercent(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return "n/a";
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  // Percent with one decimal = value * 1000 / denominator, rounded half up.
  const tenths = (abs * 1000n * 2n + denominator) / (denominator * 2n);
  const whole = tenths / 10n;
  const tenth = tenths % 10n;
  const sign = negative && tenths !== 0n ? "-" : numerator > 0n ? "+" : "";
  return `${sign}${whole}.${tenth}%`;
}

/** Token amount: up to 4 decimals, trailing zeros trimmed ("100", "12.5"). */
export function formatTokens(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const frac = ((abs % SCALE) / 100n).toString().padStart(4, "0").replace(/0+$/, "");
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = frac ? `${wholeText}.${frac}` : wholeText;
  return negative ? `-${text}` : text;
}
