import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TIER_POOLS } from "./moment-ids";
import { scoreMomentIdsAgainstWindows } from "./scoring-bridge";

type Vector = {
  name: string;
  grid: number[];
  windows: string[];
  mask: number;
  lines: number;
  valid: boolean;
};

type VectorFile = {
  tierPools: string[];
  count: number;
  cases: Vector[];
};

/// The committed vectors are read here and by `contracts/test/ScoringParity.t.sol`.
/// Asserting them from both sides is what makes the file a contract between the
/// two implementations rather than a snapshot of one of them.
const vectors = JSON.parse(
  readFileSync(resolve(__dirname, "../../fixtures/scoring-vectors.json"), "utf8"),
) as VectorFile;

describe("committed parity vectors", () => {
  it("is in sync with the derived tier pools", () => {
    expect(vectors.tierPools.map(BigInt)).toEqual([...TIER_POOLS]);
  });

  it("declares an accurate case count", () => {
    expect(vectors.cases).toHaveLength(vectors.count);
    expect(vectors.count).toBeGreaterThan(0);
  });

  it.each(vectors.cases)("$name", (vector) => {
    const windows = vector.windows.map(BigInt) as [bigint, bigint, bigint];
    const result = scoreMomentIdsAgainstWindows(vector.grid, windows, TIER_POOLS);

    expect(result.markedMask).toBe(vector.mask);
    expect(result.completedLines).toBe(vector.lines);
    expect(result.validGrid).toBe(vector.valid);
  });

  it("regenerating produces no drift", () => {
    for (const vector of vectors.cases) {
      const windows = vector.windows.map(BigInt) as [bigint, bigint, bigint];
      const recomputed = scoreMomentIdsAgainstWindows(vector.grid, windows, TIER_POOLS);
      expect({ mask: recomputed.markedMask, lines: recomputed.completedLines }).toEqual({
        mask: vector.mask,
        lines: vector.lines,
      });
    }
  });
});
