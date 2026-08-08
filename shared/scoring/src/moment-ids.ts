import { PREDICTIONS, PredictionId, Tier } from "./predictions";

/// On-chain identity for every prediction. These values are written into
/// encrypted grids and into round tier pools, so they are deliberately spelled
/// out rather than derived from array order: reordering `PREDICTION_IDS` must
/// never silently renumber a moment that a deployed round already refers to.
///
/// Layout invariant, asserted in the tests: tier 0 owns 1–9, tier 1 owns 10–18,
/// tier 2 owns 19–27.
export const MOMENT_IDS: Record<PredictionId, number> = {
  HOME_TWO_SHOTS_30: 1,
  GOAL_FIRST_30: 2,
  TWO_CORNERS_30: 3,
  CARD_30_60: 4,
  GOAL_30_60: 5,
  TWO_SUBS_BY_60: 6,
  TWO_SUBS_AFTER_60: 7,
  CARD_AFTER_75: 8,
  TWO_CORNERS_AFTER_60: 9,
  HOME_SCORES_FIRST: 10,
  GOAL_BEFORE_20: 11,
  YELLOW_BEFORE_30: 12,
  VAR_30_60: 13,
  BOTH_SCORE_BY_60: 14,
  TWO_GOALS_BY_60: 15,
  BOTH_SCORE_FULL_TIME: 16,
  FOUR_CARDS_FULL_TIME: 17,
  GOAL_AFTER_75: 18,
  PENALTY_BEFORE_30: 19,
  AWAY_LEADS_30: 20,
  GOAL_OVERTURNED_30: 21,
  PENALTY_30_60: 22,
  SUBSTITUTE_GOAL_BY_60: 23,
  THREE_GOALS_BY_60: 24,
  GOAL_AFTER_80: 25,
  SUBSTITUTE_GOAL_AFTER_60: 26,
  EXTRA_TIME: 27,
};

export const GRID_CELLS = 9;

/// The `uint256[3] tierPools` argument `MomentGrid.createRound` expects: one
/// bitmap per row listing every moment id that row will accept. Derived from
/// `PREDICTIONS` so it can never drift from the prediction set.
export const TIER_POOLS: readonly [bigint, bigint, bigint] = (() => {
  const pools: [bigint, bigint, bigint] = [0n, 0n, 0n];
  for (const definition of Object.values(PREDICTIONS)) {
    pools[definition.tier] |= 1n << BigInt(MOMENT_IDS[definition.id]);
  }
  return pools;
})();

export function tierPoolFor(tier: Tier): bigint {
  return TIER_POOLS[tier];
}

export function gridToMomentIds(grid: PredictionId[]): number[] {
  assertFullGrid(grid);
  return grid.map((prediction) => MOMENT_IDS[prediction]);
}

/// Packs nine row-major moment ids into the single `euint256` that
/// `IncoGridStore` stores, one byte per cell, little-endian.
export function packGrid(grid: PredictionId[]): bigint {
  assertFullGrid(grid);
  return grid.reduce((packed, moment, cell) => packed | (BigInt(MOMENT_IDS[moment]) << BigInt(cell * 8)), 0n);
}

export function assertFullGrid(grid: PredictionId[]): void {
  if (grid.length !== GRID_CELLS) {
    throw new Error(`A Moment Grid must contain exactly nine predictions, received ${grid.length}.`);
  }
}
