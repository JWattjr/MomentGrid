import { describe, expect, it } from "vitest";
import { completedLineIndexes, completedLinesForMask, matchScore, MatchEvent, PredictionId, scoreGrid, windowIndexForMinute } from "./match-source";
import { ReplayClock } from "./replay-clock";

const fixture: MatchEvent[] = [
  { minute: 10, eventType: "HOME_SHOT" },
  { minute: 15, eventType: "HOME_SHOT" },
  { minute: 18, eventType: "HOME_GOAL" },
  { minute: 35, eventType: "VAR_REVIEW" },
  { minute: 45, eventType: "YELLOW_CARD" },
  { minute: 50, eventType: "AWAY_GOAL" },
  { minute: 65, eventType: "SUBSTITUTION" },
  { minute: 70, eventType: "SUBSTITUTION" },
  { minute: 82, eventType: "HOME_GOAL" },
  { minute: 90, eventType: "RED_CARD" },
];

describe("ReplayClock", () => {
  it("compresses the full 90-minute match into two minutes", () => {
    let now = 1_000;
    const clock = new ReplayClock(fixture, 120_000, () => now);
    clock.start();

    now += 60_000;
    const halfway = clock.status();
    expect(halfway.virtualMinute).toBe(45);
    expect(halfway.progress).toBe(0.5);
    expect(halfway.events.map((event) => event.minute)).toEqual([10, 15, 18, 35, 45]);

    now += 60_000;
    const complete = clock.status();
    expect(complete.phase).toBe("complete");
    expect(complete.virtualMinute).toBe(90);
    expect(complete.events.map((event) => event.minute)).toEqual([10, 15, 18, 35, 45, 50, 65, 70, 82]);
  });

  it("resets to an idle replay with no revealed events", () => {
    let now = 1_000;
    const clock = new ReplayClock(fixture, 120_000, () => now);
    clock.start();
    now += 90_000;
    expect(clock.status().events.length).toBeGreaterThan(0);
    expect(clock.reset()).toMatchObject({ phase: "idle", events: [], virtualMinute: 0 });
  });
});

describe("full-match phases and prediction scoring", () => {
  it("uses three half-open 30-minute columns", () => {
    expect(windowIndexForMinute(0)).toBe(0);
    expect(windowIndexForMinute(29.999)).toBe(0);
    expect(windowIndexForMinute(30)).toBe(1);
    expect(windowIndexForMinute(60)).toBe(2);
    expect(windowIndexForMinute(90)).toBe(-1);
  });

  it("scores scenario predicates in their assigned phase", () => {
    const grid: PredictionId[] = [
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
    expect(scoreGrid(grid, fixture)).toEqual({ markedMask: 0x13f, completedLines: 4 });
  });

  it("counts every one of the eight lines and no partial line", () => {
    for (const [index, mask] of [0x007, 0x038, 0x1c0, 0x049, 0x092, 0x124, 0x111, 0x054].entries()) {
      expect(completedLinesForMask(mask)).toBe(1);
      expect(completedLineIndexes(mask)).toEqual([index]);
    }
    expect(completedLinesForMask(0x1ff)).toBe(8);
    expect(completedLineIndexes(0x1ff)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(completedLinesForMask(0x003)).toBe(0);
  });

  it("builds the visible score only from events revealed by the clock", () => {
    expect(matchScore([])).toEqual({ home: 0, away: 0 });
    expect(matchScore(fixture.slice(0, 3))).toEqual({ home: 1, away: 0 });
    expect(matchScore(fixture.slice(0, 6))).toEqual({ home: 1, away: 1 });
    expect(matchScore([...fixture, { minute: 88, eventType: "SUBSTITUTE_GOAL", team: "home" }])).toEqual({ home: 3, away: 1 });
  });
});
