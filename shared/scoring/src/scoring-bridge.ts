import { completedLinesForMask } from "./lines";
import { MatchEvent } from "./match";
import { assertFullGrid, MOMENT_IDS } from "./moment-ids";
import { PREDICTIONS, PredictionId } from "./predictions";

export type GridScore = {
  markedMask: number;
  completedLines: number;
};

/// Converts what actually happened in a match into the three per-window moment
/// bitmaps that `MomentGrid.settleRound` and `IncoGridStore.prepareScore`
/// consume.
///
/// This is the join between the off-chain match feed and on-chain scoring. Each
/// prediction already declares the column it resolves in, so the predicate set
/// *is* the mapping — there is no second source of truth to keep in step.
///
/// The result is verified against the Solidity implementations by the parity
/// vectors in `shared/fixtures/scoring-vectors.json`.
export function eventsToWindowBitmaps(events: MatchEvent[]): [bigint, bigint, bigint] {
  const windows: [bigint, bigint, bigint] = [0n, 0n, 0n];

  for (const definition of Object.values(PREDICTIONS)) {
    if (!definition.matches(events)) continue;
    windows[definition.column] |= 1n << BigInt(MOMENT_IDS[definition.id]);
  }

  return windows;
}

/// Scores a grid directly from match events. Equivalent to what the contracts
/// compute from `eventsToWindowBitmaps(events)`, and held to that equivalence
/// by the parity tests.
export function scoreGrid(grid: PredictionId[], events: MatchEvent[]): GridScore {
  assertFullGrid(grid);

  let markedMask = 0;
  for (let cell = 0; cell < grid.length; cell += 1) {
    const definition = PREDICTIONS[grid[cell]];
    const row = Math.floor(cell / 3);
    const column = cell % 3;
    if (!definition || definition.tier !== row || definition.column !== column) {
      throw new Error(`Prediction ${grid[cell]} is not valid for cell ${cell}.`);
    }
    if (definition.matches(events)) markedMask |= 1 << cell;
  }

  return { markedMask, completedLines: completedLinesForMask(markedMask) };
}

/// Scores a grid the way the contracts do: from moment ids and window bitmaps
/// rather than from predicates. Used by the parity tests to prove both routes
/// agree, and by the keeper when replaying a settlement.
export function scoreMomentIdsAgainstWindows(
  momentIds: number[],
  eventsByWindow: readonly [bigint, bigint, bigint],
  tierPools?: readonly [bigint, bigint, bigint],
): GridScore & { validGrid: boolean } {
  if (momentIds.length !== 9) {
    throw new Error(`A Moment Grid must contain exactly nine moment ids, received ${momentIds.length}.`);
  }

  let markedMask = 0;
  let validGrid = true;

  for (let cell = 0; cell < 9; cell += 1) {
    const momentBit = 1n << BigInt(momentIds[cell]);
    const tier = Math.floor(cell / 3);
    const column = cell % 3;

    if (tierPools && (momentBit & tierPools[tier]) === 0n) validGrid = false;
    if ((momentBit & eventsByWindow[column]) !== 0n) markedMask |= 1 << cell;
  }

  if (!validGrid) return { markedMask: 0, completedLines: 0, validGrid };
  return { markedMask, completedLines: completedLinesForMask(markedMask), validGrid };
}
