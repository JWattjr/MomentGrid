import { describe, expect, it } from "vitest";
import { packGrid } from "./inco-grid";

describe("packGrid", () => {
  it("packs the nine row-major moment ids into the format consumed by IncoGridStore", () => {
    expect(
      packGrid([
        "HOME_TWO_SHOTS_30",
        "CARD_30_60",
        "TWO_SUBS_AFTER_60",
        "HOME_SCORES_FIRST",
        "VAR_30_60",
        "BOTH_SCORE_FULL_TIME",
        "PENALTY_BEFORE_30",
        "PENALTY_30_60",
        "GOAL_AFTER_80",
      ]),
    ).toBe(0x191613100d0a070401n);
  });
});
