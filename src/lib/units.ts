/**
 * Fixed-point helpers. Every amount and price in the payoff model is a bigint
 * counted in millionths (6 decimals), so values like 47.5 are exact and no
 * floating point is ever involved.
 */

export const DECIMALS = 6;
export const SCALE = 10n ** BigInt(DECIMALS);

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Parse a decimal string (or a plain JS number) into fixed-point units.
 * Throws if the value has more than 6 decimals, rather than rounding silently.
 * Numbers in exponent notation (e.g. 1e-7) are rejected: pass a string instead.
 */
export function parseUnits(value: string | number): bigint {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!DECIMAL_PATTERN.test(text)) {
    throw new RangeError(`Cannot parse "${text}" as a decimal amount`);
  }
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  if (fraction.length > DECIMALS) {
    throw new RangeError(
      `"${text}" has more than ${DECIMALS} decimals and would lose precision`,
    );
  }
  const units =
    BigInt(whole) * SCALE + BigInt(fraction.padEnd(DECIMALS, "0") || "0");
  return negative ? -units : units;
}

/** Format fixed-point units as a decimal string without trailing zeros. */
export function formatUnits(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE)
    .toString()
    .padStart(DECIMALS, "0")
    .replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : `${whole}`;
  return negative ? `-${text}` : text;
}
