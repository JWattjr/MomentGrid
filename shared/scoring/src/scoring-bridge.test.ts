import { describe, expect, it } from "vitest";
import { MatchEvent } from "./match";
import { gridToMomentIds, packGrid, TIER_POOLS } from "./moment-ids";
import { PREDICTION_POOLS, PredictionId } from "./predictions";
import { replayMatchEvents } from "./replay-fixture";
import { eventsToWindowBitmaps, scoreGrid, scoreMomentIdsAgainstWindows } from "./scoring-bridge";

const QUICK_GRID: PredictionId[] = [
  "HOME_TWO_SHOTS_30",
  "CARD_30_60",
  "TWO_SUBS_AFTER_60",
  "HOME_SCORES_FIRST",
  "VAR_30_60",
  "BOTH_SCORE_FULL_TIME",
  "PENALTY_BEFORE_30",
  "PENALTY_30_60",
  "GOAL_AFTER_80",
];

/// Every grid the game can produce: one prediction from each of the nine pools.
function* everyValidGrid(): Generator<PredictionId[]> {
  const pools = Array.from({ length: 9 }, (_, cell) => PREDICTION_POOLS[Math.floor(cell / 3)][cell % 3]);
  const grid: PredictionId[] = Array(9).fill(pools[0][0]);

  const walk = function* (cell: number): Generator<PredictionId[]> {
    if (cell === 9) {
      yield [...grid];
      return;
    }
    for (const option of pools[cell]) {
      grid[cell] = option;
      yield* walk(cell + 1);
    }
  };

  yield* walk(0);
}

describe("packGrid", () => {
  it("packs the nine row-major moment ids into the format consumed by IncoGridStore", () => {
    expect(packGrid(QUICK_GRID)).toBe(0x191613100d0a070401n);
  });

  it("refuses an incomplete grid", () => {
    expect(() => packGrid(QUICK_GRID.slice(0, 8))).toThrow(/exactly nine predictions/);
  });
});

describe("eventsToWindowBitmaps", () => {
  it("only ever sets bits belonging to the tier that owns the prediction", () => {
    const windows = eventsToWindowBitmaps(replayMatchEvents());
    const allTiers = TIER_POOLS[0] | TIER_POOLS[1] | TIER_POOLS[2];
    for (const window of windows) {
      expect(window & ~allTiers).toBe(0n);
    }
  });

  it("produces an empty bitmap set for a match with no events", () => {
    expect(eventsToWindowBitmaps([])).toEqual([0n, 0n, 0n]);
  });

  it("resolves the shipped replay fixture", () => {
    expect(eventsToWindowBitmaps(replayMatchEvents())).toEqual([0x1c0en, 0xe030n, 0x6050180n]);
  });
});

describe("predicate scoring and bitmap scoring agree", () => {
  const matches: Array<{ name: string; events: MatchEvent[] }> = [
    { name: "shipped replay fixture", events: replayMatchEvents() },
    { name: "goalless match", events: [] },
    {
      name: "chaotic match",
      events: [
        { minute: 3, eventType: "AWAY_GOAL" },
        { minute: 8, eventType: "HOME_SHOT" },
        { minute: 9, eventType: "HOME_SHOT" },
        { minute: 11, eventType: "PENALTY_AWARDED" },
        { minute: 14, eventType: "GOAL_OVERTURNED" },
        { minute: 21, eventType: "CORNER" },
        { minute: 26, eventType: "CORNER" },
        { minute: 33, eventType: "VAR_REVIEW" },
        { minute: 38, eventType: "PENALTY_AWARDED" },
        { minute: 44, eventType: "HOME_GOAL" },
        { minute: 52, eventType: "SUBSTITUTE_GOAL", team: "away" },
        { minute: 55, eventType: "SUBSTITUTION" },
        { minute: 58, eventType: "SUBSTITUTION" },
        { minute: 64, eventType: "CORNER" },
        { minute: 69, eventType: "CORNER" },
        { minute: 77, eventType: "RED_CARD" },
        { minute: 84, eventType: "HOME_GOAL" },
        { minute: 88, eventType: "SUBSTITUTE_GOAL", team: "home" },
        { minute: 92, eventType: "EXTRA_TIME" },
      ],
    },
  ];

  it.each(matches)("agrees on all 19683 valid grids for the $name", ({ events }) => {
    const windows = eventsToWindowBitmaps(events);
    let checked = 0;

    for (const grid of everyValidGrid()) {
      const viaPredicates = scoreGrid(grid, events);
      const viaBitmaps = scoreMomentIdsAgainstWindows(gridToMomentIds(grid), windows, TIER_POOLS);

      expect(viaBitmaps.validGrid).toBe(true);
      expect(viaBitmaps.markedMask).toBe(viaPredicates.markedMask);
      expect(viaBitmaps.completedLines).toBe(viaPredicates.completedLines);
      checked += 1;
    }

    expect(checked).toBe(3 ** 9);
  });
});

describe("scoreGrid", () => {
  it("scores the quick grid against the replay fixture", () => {
    expect(scoreGrid(QUICK_GRID, replayMatchEvents())).toEqual({ markedMask: 0x13f, completedLines: 4 });
  });

  it("rejects a prediction placed in the wrong cell", () => {
    const misplaced = [...QUICK_GRID];
    misplaced[0] = "CARD_30_60";
    expect(() => scoreGrid(misplaced, replayMatchEvents())).toThrow(/not valid for cell 0/);
  });
});

describe("scoreMomentIdsAgainstWindows", () => {
  it("disqualifies a grid holding a moment from the wrong tier", () => {
    const momentIds = gridToMomentIds(QUICK_GRID);
    momentIds[0] = 19; // a rare-tier moment in a common-tier cell
    const result = scoreMomentIdsAgainstWindows(momentIds, eventsToWindowBitmaps(replayMatchEvents()), TIER_POOLS);

    expect(result).toEqual({ markedMask: 0, completedLines: 0, validGrid: false });
  });

  it("skips tier validation when no pools are supplied", () => {
    const momentIds = gridToMomentIds(QUICK_GRID);
    const result = scoreMomentIdsAgainstWindows(momentIds, eventsToWindowBitmaps(replayMatchEvents()));
    expect(result.validGrid).toBe(true);
    expect(result.markedMask).toBe(0x13f);
  });
});
