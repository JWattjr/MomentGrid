import { describe, expect, it } from "vitest";
import { MatchEvent } from "./match";
import { MOMENT_IDS, TIER_POOLS } from "./moment-ids";
import { PREDICTION_IDS, PREDICTION_POOLS, PREDICTIONS, PredictionId } from "./predictions";

const at = (minute: number, eventType: MatchEvent["eventType"], team?: MatchEvent["team"]): MatchEvent =>
  team ? { minute, eventType, team } : { minute, eventType };

/// One event list that must satisfy each prediction and one that must not.
/// Every prediction in the game appears here; the table is asserted to be
/// exhaustive so a newly added prediction cannot ship untested.
const CASES: Record<PredictionId, { matching: MatchEvent[]; failing: MatchEvent[] }> = {
  HOME_TWO_SHOTS_30: { matching: [at(4, "HOME_SHOT"), at(19, "HOME_SHOT")], failing: [at(4, "HOME_SHOT")] },
  GOAL_FIRST_30: { matching: [at(10, "HOME_GOAL")], failing: [at(35, "HOME_GOAL")] },
  TWO_CORNERS_30: { matching: [at(5, "CORNER"), at(20, "CORNER")], failing: [at(5, "CORNER")] },
  CARD_30_60: { matching: [at(45, "YELLOW_CARD")], failing: [at(20, "YELLOW_CARD")] },
  GOAL_30_60: { matching: [at(45, "HOME_GOAL")], failing: [at(20, "HOME_GOAL")] },
  TWO_SUBS_BY_60: { matching: [at(50, "SUBSTITUTION"), at(55, "SUBSTITUTION")], failing: [at(50, "SUBSTITUTION")] },
  TWO_SUBS_AFTER_60: { matching: [at(65, "SUBSTITUTION"), at(70, "SUBSTITUTION")], failing: [at(65, "SUBSTITUTION")] },
  CARD_AFTER_75: { matching: [at(80, "YELLOW_CARD")], failing: [at(70, "YELLOW_CARD")] },
  TWO_CORNERS_AFTER_60: { matching: [at(65, "CORNER"), at(70, "CORNER")], failing: [at(65, "CORNER")] },
  HOME_SCORES_FIRST: {
    matching: [at(10, "HOME_GOAL"), at(20, "AWAY_GOAL")],
    failing: [at(10, "AWAY_GOAL"), at(20, "HOME_GOAL")],
  },
  GOAL_BEFORE_20: { matching: [at(10, "HOME_GOAL")], failing: [at(25, "HOME_GOAL")] },
  YELLOW_BEFORE_30: { matching: [at(10, "YELLOW_CARD")], failing: [at(35, "YELLOW_CARD")] },
  VAR_30_60: { matching: [at(45, "VAR_REVIEW")], failing: [at(20, "VAR_REVIEW")] },
  BOTH_SCORE_BY_60: { matching: [at(10, "HOME_GOAL"), at(20, "AWAY_GOAL")], failing: [at(10, "HOME_GOAL")] },
  TWO_GOALS_BY_60: { matching: [at(10, "HOME_GOAL"), at(20, "AWAY_GOAL")], failing: [at(10, "HOME_GOAL")] },
  BOTH_SCORE_FULL_TIME: { matching: [at(10, "HOME_GOAL"), at(80, "AWAY_GOAL")], failing: [at(10, "HOME_GOAL")] },
  FOUR_CARDS_FULL_TIME: {
    matching: [at(10, "YELLOW_CARD"), at(20, "YELLOW_CARD"), at(30, "YELLOW_CARD"), at(40, "YELLOW_CARD"), at(50, "RED_CARD")],
    failing: [at(10, "YELLOW_CARD"), at(20, "YELLOW_CARD"), at(30, "YELLOW_CARD"), at(40, "YELLOW_CARD")],
  },
  GOAL_AFTER_75: { matching: [at(80, "HOME_GOAL")], failing: [at(70, "HOME_GOAL")] },
  PENALTY_BEFORE_30: { matching: [at(10, "PENALTY_AWARDED")], failing: [at(40, "PENALTY_AWARDED")] },
  AWAY_LEADS_30: { matching: [at(10, "AWAY_GOAL")], failing: [at(10, "HOME_GOAL")] },
  GOAL_OVERTURNED_30: { matching: [at(10, "GOAL_OVERTURNED")], failing: [at(40, "GOAL_OVERTURNED")] },
  PENALTY_30_60: { matching: [at(45, "PENALTY_AWARDED")], failing: [at(10, "PENALTY_AWARDED")] },
  SUBSTITUTE_GOAL_BY_60: { matching: [at(50, "SUBSTITUTE_GOAL")], failing: [at(70, "SUBSTITUTE_GOAL")] },
  THREE_GOALS_BY_60: {
    matching: [at(10, "HOME_GOAL"), at(20, "AWAY_GOAL"), at(30, "HOME_GOAL")],
    failing: [at(10, "HOME_GOAL"), at(20, "AWAY_GOAL")],
  },
  GOAL_AFTER_80: { matching: [at(85, "HOME_GOAL")], failing: [at(75, "HOME_GOAL")] },
  SUBSTITUTE_GOAL_AFTER_60: { matching: [at(70, "SUBSTITUTE_GOAL")], failing: [at(50, "SUBSTITUTE_GOAL")] },
  EXTRA_TIME: { matching: [at(92, "EXTRA_TIME")], failing: [] },
};

describe("prediction predicates", () => {
  it("covers every prediction in the game", () => {
    expect(Object.keys(CASES).sort()).toEqual([...PREDICTION_IDS].sort());
  });

  it.each(PREDICTION_IDS)("%s resolves both ways", (id) => {
    const { matching, failing } = CASES[id];
    expect(PREDICTIONS[id].matches(matching)).toBe(true);
    expect(PREDICTIONS[id].matches(failing)).toBe(false);
  });

  it("never matches an empty match", () => {
    for (const id of PREDICTION_IDS) {
      expect(PREDICTIONS[id].matches([])).toBe(false);
    }
  });
});

describe("grid layout", () => {
  it("places every prediction at the cell its pool claims", () => {
    PREDICTION_POOLS.forEach((columns, tier) => {
      columns.forEach((pool, column) => {
        expect(pool).toHaveLength(3);
        for (const id of pool) {
          expect(PREDICTIONS[id].tier).toBe(tier);
          expect(PREDICTIONS[id].column).toBe(column);
        }
      });
    });
  });

  it("assigns nine distinct moment ids per tier, in contiguous blocks", () => {
    const byTier: number[][] = [[], [], []];
    for (const id of PREDICTION_IDS) byTier[PREDICTIONS[id].tier].push(MOMENT_IDS[id]);

    expect(byTier[0].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(byTier[1].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(byTier[2].sort((a, b) => a - b)).toEqual([19, 20, 21, 22, 23, 24, 25, 26, 27]);
  });

  it("derives tier pools that accept exactly their own tier's moments", () => {
    expect(TIER_POOLS).toEqual([0x3fen, 0x7fc00n, 0xff80000n]);

    for (const id of PREDICTION_IDS) {
      const definition = PREDICTIONS[id];
      const bit = 1n << BigInt(MOMENT_IDS[id]);
      expect(TIER_POOLS[definition.tier] & bit).not.toBe(0n);
      for (const otherTier of [0, 1, 2] as const) {
        if (otherTier === definition.tier) continue;
        expect(TIER_POOLS[otherTier] & bit).toBe(0n);
      }
    }
  });
});
