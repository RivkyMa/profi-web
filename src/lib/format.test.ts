import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatPercent,
  formatSigned,
  formatTokens,
} from "./format";
import { parseUnits as u } from "./units";

describe("formatAmount", () => {
  it("formats with grouping and cents", () => {
    expect(formatAmount(u("10142.5"))).toBe("10,142.50");
    expect(formatAmount(u("0"))).toBe("0.00");
    expect(formatAmount(u("47.5"))).toBe("47.50");
  });

  it("rounds half away from zero to cents", () => {
    expect(formatAmount(u("0.005"))).toBe("0.01");
    expect(formatAmount(u("0.004999"))).toBe("0.00");
    expect(formatAmount(u("-0.005"))).toBe("-0.01");
  });

  it("does not show a negative zero", () => {
    expect(formatAmount(u("-0.001"))).toBe("0.00");
  });

  it("can hide cents", () => {
    expect(formatAmount(u("10000"), { cents: false })).toBe("10,000");
  });
});

describe("formatSigned", () => {
  it("always shows the sign except for zero", () => {
    expect(formatSigned(u("190"))).toBe("+190.00");
    expect(formatSigned(u("-6358"))).toBe("-6,358.00");
    expect(formatSigned(0n)).toBe("0.00");
  });
});

describe("formatPercent", () => {
  it("formats one decimal with a sign", () => {
    expect(formatPercent(u("-4505"), u("10000"))).toBe("-45.1%");
    expect(formatPercent(u("190"), u("10000"))).toBe("+1.9%");
    expect(formatPercent(0n, u("10000"))).toBe("0.0%");
  });
});

describe("formatTokens", () => {
  it("trims trailing zeros", () => {
    expect(formatTokens(u("100"))).toBe("100");
    expect(formatTokens(u("12.5"))).toBe("12.5");
    expect(formatTokens(u("1234.5678"))).toBe("1,234.5678");
  });
});
