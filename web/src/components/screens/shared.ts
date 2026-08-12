import { PredictionId } from "@moment-grid/scoring";

/// Constants and types shared across the five game screens.
///
/// These lived in `game-shell.tsx` while it was one file. They are here so the
/// screens can be separate modules without importing each other.

export type Screen = "build" | "lock" | "watch" | "reveal" | "reward";

/// Whether the round in progress is staked on chain or a free run-through.
/// The two paths look identical from the watch screen onwards, so this is what
/// stops a practice result being mistaken for a real payout.
export type EntryMode = "onchain" | "practice";

export type Grid = Array<PredictionId | null>;

export type FeedbackCue = "tap" | "confirm" | "lock" | "event" | "reveal" | "reward";

export const SCREEN_ORDER: Screen[] = ["build", "lock", "watch", "reveal", "reward"];
export const TIER_NAMES = ["Common", "Medium", "Rare"];
export const TIER_CODES = ["C", "M", "R"];
export const WINDOW_LABELS = ["0–30", "30–60", "60–90+"];

/// The eight scoring lines as SVG paths over a unit grid, in the same order as
/// `LINE_MASKS` in `@moment-grid/scoring`.
export const LINE_PATHS = [
  { cells: [0, 1, 2], d: "M 16.667 16.667 L 83.333 16.667" },
  { cells: [3, 4, 5], d: "M 16.667 50 L 83.333 50" },
  { cells: [6, 7, 8], d: "M 16.667 83.333 L 83.333 83.333" },
  { cells: [0, 3, 6], d: "M 16.667 16.667 L 16.667 83.333" },
  { cells: [1, 4, 7], d: "M 50 16.667 L 50 83.333" },
  { cells: [2, 5, 8], d: "M 83.333 16.667 L 83.333 83.333" },
  { cells: [0, 4, 8], d: "M 16.667 16.667 L 83.333 83.333" },
  { cells: [2, 4, 6], d: "M 83.333 16.667 L 16.667 83.333" },
] as const;

/// The one-tap preset. Deliberately not the highest-scoring grid: against the
/// recorded fixture it completes six of eight lines, leaving room for another
/// entrant to beat it. A preset that tied the ceiling could only ever be drawn
/// with, and an equal-stake draw returns every player their exact stake.
export const QUICK_GRID: PredictionId[] = [
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
