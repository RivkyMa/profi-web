import { describe, expect, it } from "vitest";
import { SCALE, formatUnits, parseUnits } from "./units";

describe("parseUnits", () => {
  it("parses whole and fractional values exactly", () => {
    expect(parseUnits("100")).toBe(100n * SCALE);
    expect(parseUnits("47.5")).toBe(47_500_000n);
    expect(parseUnits("0.000001")).toBe(1n);
    expect(parseUnits(2.5)).toBe(2_500_000n);
    expect(parseUnits("-1.25")).toBe(-1_250_000n);
  });

  it("rejects more than 6 decimals instead of rounding", () => {
    expect(() => parseUnits("0.0000001")).toThrow(RangeError);
  });

  it("rejects malformed input", () => {
    expect(() => parseUnits("abc")).toThrow(RangeError);
    expect(() => parseUnits("")).toThrow(RangeError);
    expect(() => parseUnits(1e-7)).toThrow(RangeError);
    expect(() => parseUnits(Number.NaN)).toThrow(RangeError);
  });
});

describe("formatUnits", () => {
  it("trims trailing zeros", () => {
    expect(formatUnits(47_500_000n)).toBe("47.5");
    expect(formatUnits(10_095n * SCALE)).toBe("10095");
    expect(formatUnits(1n)).toBe("0.000001");
    expect(formatUnits(0n)).toBe("0");
    expect(formatUnits(-1_250_000n)).toBe("-1.25");
  });

  it("round-trips with parseUnits", () => {
    for (const text of ["0", "1", "47.5", "10142.5", "0.000033", "999999.999999"]) {
      expect(formatUnits(parseUnits(text))).toBe(text);
    }
  });
});
