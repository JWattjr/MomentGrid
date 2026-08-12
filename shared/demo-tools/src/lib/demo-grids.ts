import {
  MatchEvent,
  PREDICTION_POOLS,
  PredictionId,
  replayMatchEvents,
  scoreGrid,
} from "@moment-grid/scoring";

/// Chooses grids by the number of lines they will score against the recorded
/// fixture.
///
/// Everything here is derived from `scoreGrid` at run time rather than written
/// down. The fixture decides which predictions fire, so a hardcoded grid would
/// silently stop meaning what its name says the moment the fixture changed —
/// and a bot seeded with a stale grid would quietly wreck a staged outcome.

export type ScoredGrid = {
  grid: PredictionId[];
  lines: number;
  markedMask: number;
};

const CELLS = 9;

const poolFor = (cell: number): readonly PredictionId[] =>
  PREDICTION_POOLS[Math.floor(cell / 3)][cell % 3];

/// Every legal grid, one prediction from each of the nine pools. 3^9 = 19,683,
/// small enough to walk exhaustively and get exact answers.
function* everyGrid(): Generator<PredictionId[]> {
  const pools = Array.from({ length: CELLS }, (_, cell) => poolFor(cell));
  const grid: PredictionId[] = pools.map((pool) => pool[0]);

  const walk = function* (cell: number): Generator<PredictionId[]> {
    if (cell === CELLS) {
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

/// How many grids score each possible line count, for the given match.
export function lineDistribution(events: MatchEvent[] = replayMatchEvents()): Map<number, number> {
  const distribution = new Map<number, number>();
  for (const grid of everyGrid()) {
    const { completedLines } = scoreGrid(grid, events);
    distribution.set(completedLines, (distribution.get(completedLines) ?? 0) + 1);
  }
  return new Map([...distribution].sort(([a], [b]) => a - b));
}

/// The highest line count any legal grid can reach against this match.
export function maxAchievableLines(events: MatchEvent[] = replayMatchEvents()): number {
  return Math.max(...lineDistribution(events).keys());
}

/// A grid scoring exactly `lines`, or a thrown error naming what is reachable.
///
/// `variant` picks between grids that tie on line count, so several bots can be
/// given the same target without submitting identical grids.
export function gridScoringExactly(
  lines: number,
  variant = 0,
  events: MatchEvent[] = replayMatchEvents(),
): ScoredGrid {
  const candidates: ScoredGrid[] = [];

  for (const grid of everyGrid()) {
    const { completedLines, markedMask } = scoreGrid(grid, events);
    if (completedLines !== lines) continue;
    candidates.push({ grid, lines: completedLines, markedMask });
    // Enough to satisfy any reasonable variant without walking the rest.
    if (candidates.length > variant + 32) break;
  }

  if (candidates.length === 0) {
    const reachable = [...lineDistribution(events).keys()].join(", ");
    throw new Error(
      `No legal grid scores exactly ${lines} line(s) against this match. Reachable counts: ${reachable}.`,
    );
  }

  const chosen = candidates[variant % candidates.length];
  assertScores(chosen, lines, events);
  return chosen;
}

/// Re-scores a chosen grid and throws unless it matches the promise made about
/// it. Cheap, and it is the difference between a staged demo outcome and a
/// surprise on stage.
export function assertScores(
  candidate: ScoredGrid,
  expectedLines: number,
  events: MatchEvent[] = replayMatchEvents(),
): void {
  const actual = scoreGrid(candidate.grid, events);
  if (actual.completedLines !== expectedLines) {
    throw new Error(
      `Grid was expected to score ${expectedLines} line(s) but scores ${actual.completedLines}. ` +
        `The replay fixture and the demo grids have diverged.`,
    );
  }
}

/// Bot targets for a staged outcome.
///
/// `win` means the human should beat every bot; `lose` means at least one bot
/// must beat them. Targets are clamped into what the fixture can actually
/// produce, and the caller is told if the request is impossible.
export function botTargetsFor(
  outcome: "win" | "lose",
  botCount: number,
  humanLines: number,
  events: MatchEvent[] = replayMatchEvents(),
): number[] {
  // Only ever choose from counts a legal grid can actually reach. Not every
  // number up to the ceiling is attainable — seven lines is impossible on a
  // 3x3, because completing seven forces the eighth — so arithmetic like
  // "humanLines + 1" can name a target no grid satisfies.
  const reachable = [...lineDistribution(events).keys()].sort((a, b) => a - b);
  const max = reachable[reachable.length - 1];

  // A bot on the human's own score would tie them, and a tie at equal stakes
  // returns every player their exact stake: no movement on screen either way.
  const below = reachable.filter((lines) => lines < humanLines).reverse();
  const above = reachable.filter((lines) => lines > humanLines);

  if (outcome === "win") {
    if (below.length === 0) {
      throw new Error(
        `Cannot stage a win: the human grid scores ${humanLines} line(s), and no legal grid scores fewer, ` +
          `so every bot would tie them. Have the player pick a stronger grid.`,
      );
    }
    return fill(below, botCount);
  }

  if (above.length === 0) {
    throw new Error(
      `Cannot stage a loss: the human grid scores ${humanLines} line(s) and ${max} is the most any grid can reach, ` +
        `so no bot can beat it. Have the player pick a weaker grid, or pass a lower --human-lines.`,
    );
  }

  // The strongest bot takes the lowest winning score — enough to beat the
  // human, without making the loss look like a rout. The rest trail below.
  return fill([above[0], ...below], botCount);
}

/// Repeats the last entry when there are more bots than distinct scores to
/// hand out. Duplicated scores are fine; `gridScoringExactly` still gives each
/// bot a different grid via its variant index.
function fill(preferred: number[], count: number): number[] {
  if (preferred.length === 0) throw new Error("No target scores available.");
  return Array.from({ length: count }, (_, index) => preferred[Math.min(index, preferred.length - 1)]);
}
