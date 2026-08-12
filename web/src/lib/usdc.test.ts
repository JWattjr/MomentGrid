import { describe, expect, it } from "vitest";
import { formatUsdc, parseUsdc } from "./usdc";

/// Six-decimal arithmetic is the demo-killer: a slip here turns "you won 4.00"
/// into "you won 0.000004" on the one screen the whole thing is built around.

describe("formatUsdc", () => {
  it("formats whole and fractional amounts", () => {
    expect(formatUsdc(1_000_000n)).toBe("1.00");
    expect(formatUsdc(4_000_000n)).toBe("4.00");
    expect(formatUsdc(1_500_000n)).toBe("1.50");
    expect(formatUsdc(20_000_000n)).toBe("20.00");
    expect(formatUsdc(151_750_000n)).toBe("151.75");
  });

  it("accepts the decimal strings the API returns", () => {
    expect(formatUsdc("4000000")).toBe("4.00");
    expect(formatUsdc("0")).toBe("0.00");
  });

  it("treats a missing amount as zero rather than rendering NaN", () => {
    expect(formatUsdc(null)).toBe("0.00");
    expect(formatUsdc(undefined)).toBe("0.00");
    expect(formatUsdc("")).toBe("0.00");
    expect(formatUsdc("not a number")).toBe("0.00");
  });

  /// Truncating rather than rounding: a balance must never read higher than
  /// what the wallet will actually pay out.
  it("truncates rather than rounding up", () => {
    expect(formatUsdc(1_999_999n)).toBe("1.99");
    expect(formatUsdc(999_999n)).toBe("0.99");
  });

  it("keeps sub-cent amounts visible at higher precision", () => {
    expect(formatUsdc(1n, 6)).toBe("0.000001");
    expect(formatUsdc(3_333_334n, 6)).toBe("3.333334");
  });

  it("handles the remainder units settlement distributes", () => {
    expect(formatUsdc(3_333_334n)).toBe("3.33");
    expect(formatUsdc(3_333_333n)).toBe("3.33");
  });
});

describe("parseUsdc", () => {
  it("parses whole and fractional input", () => {
    expect(parseUsdc("1")).toBe(1_000_000n);
    expect(parseUsdc("1.0")).toBe(1_000_000n);
    expect(parseUsdc("1.5")).toBe(1_500_000n);
    expect(parseUsdc("0.000001")).toBe(1n);
  });

  it("round-trips through formatUsdc", () => {
    for (const input of ["1", "4.25", "0.01", "151.75"]) {
      expect(formatUsdc(parseUsdc(input))).toBe(Number(input).toFixed(2));
    }
  });

  it("rejects input it cannot represent exactly", () => {
    expect(() => parseUsdc("1.0000001")).toThrow(/more than 6 decimal places/);
    expect(() => parseUsdc("abc")).toThrow(/positive decimal number/);
    expect(() => parseUsdc("-1")).toThrow(/positive decimal number/);
  });
});
