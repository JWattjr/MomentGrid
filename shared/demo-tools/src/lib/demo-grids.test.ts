import { replayMatchEvents, scoreGrid } from "@moment-grid/scoring";
import { describe, expect, it } from "vitest";
import { botTargetsFor, gridScoringExactly, lineDistribution, maxAchievableLines } from "./demo-grids";

const events = replayMatchEvents();

describe("gridScoringExactly", () => {
  it("returns a grid that really scores the requested line count", () => {
    for (const target of lineDistribution(events).keys()) {
      const chosen = gridScoringExactly(target, 0, events);
      expect(scoreGrid(chosen.grid, events).completedLines, `target ${target}`).toBe(target);
    }
  });

  it("gives different bots different grids for the same target", () => {
    const grids = [0, 1, 2].map((variant) => gridScoringExactly(3, variant, events).grid.join(","));
    expect(new Set(grids).size).toBe(3);
  });

  it("refuses an unreachable line count instead of silently approximating", () => {
    // Seven lines is impossible on a 3x3: completing seven forces the eighth.
    expect(() => gridScoringExactly(7, 0, events)).toThrow(/No legal grid scores exactly 7/);
  });
});

describe("botTargetsFor", () => {
  const bestOf = (targets: number[]) =>
    Math.max(...targets.map((target, index) => scoreGrid(gridScoringExactly(target, index, events).grid, events).completedLines));

  it("keeps every bot below the human when staging a win", () => {
    const humanLines = 6;
    expect(bestOf(botTargetsFor("win", 3, humanLines, events))).toBeLessThan(humanLines);
  });

  it("puts at least one bot above the human when staging a loss", () => {
    const humanLines = 3;
    expect(bestOf(botTargetsFor("lose", 3, humanLines, events))).toBeGreaterThan(humanLines);
  });

  /// A tie at equal stakes returns every player their exact stake, so the
  /// screen shows no movement at all. Both staged outcomes must avoid it.
  it("never produces a tie at the top", () => {
    for (const humanLines of [1, 2, 3, 4, 5, 6]) {
      for (const outcome of ["win", "lose"] as const) {
        const targets = botTargetsFor(outcome, 3, humanLines, events);
        expect(bestOf(targets), `${outcome} vs ${humanLines}`).not.toBe(humanLines);
      }
    }
  });

  it("refuses to stage a loss the human cannot suffer", () => {
    const max = maxAchievableLines(events);
    expect(() => botTargetsFor("lose", 3, max, events)).toThrow(/Cannot stage a loss/);
  });

  it("refuses to stage a win a zero-scoring human cannot achieve", () => {
    expect(() => botTargetsFor("win", 3, 0, events)).toThrow(/Cannot stage a win/);
  });

  /// Regression: an earlier version derived targets arithmetically and could
  /// name seven lines, which no legal grid reaches, crashing the seeder.
  it("only ever names line counts a real grid can reach", () => {
    const reachable = new Set(lineDistribution(events).keys());
    for (const humanLines of [0, 1, 2, 3, 4, 5, 6, 8]) {
      for (const outcome of ["win", "lose"] as const) {
        let targets: number[] = [];
        try {
          targets = botTargetsFor(outcome, 5, humanLines, events);
        } catch {
          continue; // refusing is a valid answer; naming an impossible score is not
        }
        for (const target of targets) {
          expect(reachable.has(target), `${outcome} vs ${humanLines} produced ${target}`).toBe(true);
        }
      }
    }
  });
});
