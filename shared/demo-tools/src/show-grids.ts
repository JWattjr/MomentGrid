#!/usr/bin/env tsx
/// Prints what the recorded fixture makes possible, with no chain access.
///
///   pnpm --filter @moment-grid/tools grids
///
/// Run this after any change to the predictions or the replay fixture. It is
/// the fastest way to see whether the grid ceiling, the Quick fill score and
/// the spread of outcomes are still what the demo assumes.

import { PREDICTION_POOLS, PREDICTIONS, PredictionId, replayMatchEvents, scoreGrid } from "@moment-grid/scoring";
import { fail } from "./lib/args.js";
import { lineDistribution, maxAchievableLines } from "./lib/demo-grids.js";

/// Mirrors the preset wired to the Quick fill button in the web app.
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

const TOTAL_GRIDS = 3 ** 9;

function main(): void {
  const events = replayMatchEvents();

  process.stdout.write("Per-cell reachability (row = tier, column = window)\n");
  let deadCells = 0;
  for (let cell = 0; cell < 9; cell += 1) {
    const pool = PREDICTION_POOLS[Math.floor(cell / 3)][cell % 3];
    const hits = pool.filter((id) => PREDICTIONS[id].matches(events));
    if (hits.length === 0) deadCells += 1;
    const detail = hits.length > 0 ? hits.join(", ") : "NOTHING CAN HIT THIS CELL";
    process.stdout.write(`  cell ${cell}  ${hits.length}/3  ${detail}\n`);
  }

  const max = maxAchievableLines(events);
  const quick = scoreGrid(QUICK_GRID, events);
  const distribution = lineDistribution(events);

  process.stdout.write(`\nCeiling      ${max} line(s)\n`);
  process.stdout.write(`Quick fill   ${quick.completedLines} line(s) (mask 0x${quick.markedMask.toString(16)})\n`);
  process.stdout.write("\nSpread across all 19,683 legal grids\n");
  for (const [lines, count] of distribution) {
    const share = ((count / TOTAL_GRIDS) * 100).toFixed(1);
    process.stdout.write(`  ${lines} line(s)  ${String(count).padStart(5)}  ${share.padStart(5)}%\n`);
  }

  const tiedAtMax = distribution.get(max) ?? 0;
  process.stdout.write(`\n${((tiedAtMax / TOTAL_GRIDS) * 100).toFixed(1)}% of grids tie at the ceiling.\n`);

  // The two conditions that would quietly ruin a money demo.
  if (deadCells > 0) {
    process.stdout.write(
      `\nWARNING: ${deadCells} cell(s) can never be marked, so the grid ceiling is below eight ` +
        `and those cells are decorative.\n`,
    );
  }
  if (quick.completedLines >= max) {
    process.stdout.write(
      `\nWARNING: Quick fill scores the maximum, so no opponent can beat it — only tie. ` +
        `A tie at equal stakes returns every player their exact stake, showing no movement.\n`,
    );
  }
  if (deadCells === 0 && quick.completedLines < max) {
    process.stdout.write("\nFixture looks healthy: every cell is reachable and Quick fill is beatable.\n");
  }
}

try {
  main();
} catch (error) {
  fail(error);
}
