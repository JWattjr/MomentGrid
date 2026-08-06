export const ROUND_START_MINUTE = 0;
export const ROUND_END_MINUTE = 90;
export const WINDOW_MINUTES = 30;

export const MATCH_EVENT_TYPES = [
  "HOME_SHOT",
  "AWAY_SHOT",
  "HOME_GOAL",
  "AWAY_GOAL",
  "CORNER",
  "YELLOW_CARD",
  "RED_CARD",
  "VAR_REVIEW",
  "GOAL_OVERTURNED",
  "PENALTY_AWARDED",
  "SUBSTITUTION",
  "SUBSTITUTE_GOAL",
  "EXTRA_TIME",
] as const;

export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];
export type MatchTeam = "home" | "away";

export type MatchEvent = {
  minute: number;
  eventType: MatchEventType;
  team?: MatchTeam;
};

export type MatchPhase = "idle" | "running" | "complete";

export type MatchSnapshot = {
  phase: MatchPhase;
  startedAt: number | null;
  durationSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  progress: number;
  virtualMinute: number;
  events: MatchEvent[];
};

export interface MatchSource {
  start(): MatchSnapshot | Promise<MatchSnapshot>;
  status(): MatchSnapshot | Promise<MatchSnapshot>;
  reset(): MatchSnapshot | Promise<MatchSnapshot>;
}

export const EVENT_LABELS: Record<MatchEventType, string> = {
  HOME_SHOT: "Arsenal shot",
  AWAY_SHOT: "Chelsea shot",
  HOME_GOAL: "Arsenal goal",
  AWAY_GOAL: "Chelsea goal",
  CORNER: "Corner",
  YELLOW_CARD: "Yellow card",
  RED_CARD: "Red card",
  VAR_REVIEW: "VAR review",
  GOAL_OVERTURNED: "Goal overturned",
  PENALTY_AWARDED: "Penalty awarded",
  SUBSTITUTION: "Substitution",
  SUBSTITUTE_GOAL: "Substitute scores",
  EXTRA_TIME: "Extra time",
};

export const PREDICTION_IDS = [
  "HOME_TWO_SHOTS_30",
  "GOAL_FIRST_30",
  "TWO_CORNERS_30",
  "CARD_30_60",
  "GOAL_30_60",
  "TWO_SUBS_BY_60",
  "TWO_SUBS_AFTER_60",
  "CARD_AFTER_75",
  "TWO_CORNERS_AFTER_60",
  "HOME_SCORES_FIRST",
  "GOAL_BEFORE_20",
  "YELLOW_BEFORE_30",
  "VAR_30_60",
  "BOTH_SCORE_BY_60",
  "TWO_GOALS_BY_60",
  "BOTH_SCORE_FULL_TIME",
  "FOUR_CARDS_FULL_TIME",
  "GOAL_AFTER_75",
  "PENALTY_BEFORE_30",
  "AWAY_LEADS_30",
  "GOAL_OVERTURNED_30",
  "PENALTY_30_60",
  "SUBSTITUTE_GOAL_BY_60",
  "THREE_GOALS_BY_60",
  "GOAL_AFTER_80",
  "SUBSTITUTE_GOAL_AFTER_60",
  "EXTRA_TIME",
] as const;

export type PredictionId = (typeof PREDICTION_IDS)[number];

type Tier = 0 | 1 | 2;
type Column = 0 | 1 | 2;

export type PredictionDefinition = {
  id: PredictionId;
  label: string;
  deadline: string;
  tier: Tier;
  column: Column;
  support: number;
  matches(events: MatchEvent[]): boolean;
};

const inRange = (event: MatchEvent, start: number, end: number) => event.minute >= start && event.minute < end;
const isGoal = (event: MatchEvent) => ["HOME_GOAL", "AWAY_GOAL", "SUBSTITUTE_GOAL"].includes(event.eventType);
const isCard = (event: MatchEvent) => event.eventType === "YELLOW_CARD" || event.eventType === "RED_CARD";
const count = (events: MatchEvent[], predicate: (event: MatchEvent) => boolean) => events.filter(predicate).length;

const prediction = (
  id: PredictionId,
  label: string,
  deadline: string,
  tier: Tier,
  column: Column,
  support: number,
  matches: (events: MatchEvent[]) => boolean,
): PredictionDefinition => ({ id, label, deadline, tier, column, support, matches });

export const PREDICTIONS: Record<PredictionId, PredictionDefinition> = {
  HOME_TWO_SHOTS_30: prediction("HOME_TWO_SHOTS_30", "Home team has 2+ shots", "By 30′", 0, 0, 78, (events) => count(events, (e) => e.eventType === "HOME_SHOT" && e.minute < 30) >= 2),
  GOAL_FIRST_30: prediction("GOAL_FIRST_30", "A goal in the opening phase", "0–30′", 0, 0, 71, (events) => events.some((e) => isGoal(e) && e.minute < 30)),
  TWO_CORNERS_30: prediction("TWO_CORNERS_30", "Two or more corners", "By 30′", 0, 0, 64, (events) => count(events, (e) => e.eventType === "CORNER" && e.minute < 30) >= 2),
  CARD_30_60: prediction("CARD_30_60", "At least one card shown", "30–60′", 0, 1, 69, (events) => events.some((e) => isCard(e) && inRange(e, 30, 60))),
  GOAL_30_60: prediction("GOAL_30_60", "A goal after halftime pressure", "30–60′", 0, 1, 62, (events) => events.some((e) => isGoal(e) && inRange(e, 30, 60))),
  TWO_SUBS_BY_60: prediction("TWO_SUBS_BY_60", "Two substitutions made", "By 60′", 0, 1, 57, (events) => count(events, (e) => e.eventType === "SUBSTITUTION" && e.minute < 60) >= 2),
  TWO_SUBS_AFTER_60: prediction("TWO_SUBS_AFTER_60", "Two substitutions in closing phase", "60–90+′", 0, 2, 76, (events) => count(events, (e) => e.eventType === "SUBSTITUTION" && e.minute >= 60) >= 2),
  CARD_AFTER_75: prediction("CARD_AFTER_75", "A late card is shown", "After 75′", 0, 2, 73, (events) => events.some((e) => isCard(e) && e.minute >= 75)),
  TWO_CORNERS_AFTER_60: prediction("TWO_CORNERS_AFTER_60", "Two late corners", "60–90+′", 0, 2, 61, (events) => count(events, (e) => e.eventType === "CORNER" && e.minute >= 60) >= 2),
  HOME_SCORES_FIRST: prediction("HOME_SCORES_FIRST", "Home team scores first", "Opening goal", 1, 0, 54, (events) => events.filter(isGoal).sort((a, b) => a.minute - b.minute)[0]?.eventType === "HOME_GOAL"),
  GOAL_BEFORE_20: prediction("GOAL_BEFORE_20", "Goal before 20 minutes", "Before 20′", 1, 0, 48, (events) => events.some((e) => isGoal(e) && e.minute < 20)),
  YELLOW_BEFORE_30: prediction("YELLOW_BEFORE_30", "Early yellow card", "Before 30′", 1, 0, 42, (events) => events.some((e) => e.eventType === "YELLOW_CARD" && e.minute < 30)),
  VAR_30_60: prediction("VAR_30_60", "VAR review interrupts play", "30–60′", 1, 1, 39, (events) => events.some((e) => e.eventType === "VAR_REVIEW" && inRange(e, 30, 60))),
  BOTH_SCORE_BY_60: prediction("BOTH_SCORE_BY_60", "Both teams score", "By 60′", 1, 1, 46, (events) => events.some((e) => e.eventType === "HOME_GOAL" && e.minute < 60) && events.some((e) => e.eventType === "AWAY_GOAL" && e.minute < 60)),
  TWO_GOALS_BY_60: prediction("TWO_GOALS_BY_60", "Two or more goals", "By 60′", 1, 1, 51, (events) => count(events, (e) => isGoal(e) && e.minute < 60) >= 2),
  BOTH_SCORE_FULL_TIME: prediction("BOTH_SCORE_FULL_TIME", "Both teams score", "By full time", 1, 2, 58, (events) => events.some((e) => e.eventType === "HOME_GOAL") && events.some((e) => e.eventType === "AWAY_GOAL")),
  FOUR_CARDS_FULL_TIME: prediction("FOUR_CARDS_FULL_TIME", "More than four cards", "By full time", 1, 2, 36, (events) => count(events, isCard) > 4),
  GOAL_AFTER_75: prediction("GOAL_AFTER_75", "A goal in the final 15", "After 75′", 1, 2, 44, (events) => events.some((e) => isGoal(e) && e.minute >= 75)),
  PENALTY_BEFORE_30: prediction("PENALTY_BEFORE_30", "Penalty awarded early", "Before 30′", 2, 0, 17, (events) => events.some((e) => e.eventType === "PENALTY_AWARDED" && e.minute < 30)),
  AWAY_LEADS_30: prediction("AWAY_LEADS_30", "Away team leads early", "At 30′", 2, 0, 21, (events) => count(events, (e) => e.eventType === "AWAY_GOAL" && e.minute < 30) > count(events, (e) => e.eventType === "HOME_GOAL" && e.minute < 30)),
  GOAL_OVERTURNED_30: prediction("GOAL_OVERTURNED_30", "VAR overturns a goal", "Before 30′", 2, 0, 12, (events) => events.some((e) => e.eventType === "GOAL_OVERTURNED" && e.minute < 30)),
  PENALTY_30_60: prediction("PENALTY_30_60", "Penalty awarded", "30–60′", 2, 1, 19, (events) => events.some((e) => e.eventType === "PENALTY_AWARDED" && inRange(e, 30, 60))),
  SUBSTITUTE_GOAL_BY_60: prediction("SUBSTITUTE_GOAL_BY_60", "A substitute scores", "By 60′", 2, 1, 14, (events) => events.some((e) => e.eventType === "SUBSTITUTE_GOAL" && e.minute < 60)),
  THREE_GOALS_BY_60: prediction("THREE_GOALS_BY_60", "Three or more goals", "By 60′", 2, 1, 24, (events) => count(events, (e) => isGoal(e) && e.minute < 60) >= 3),
  GOAL_AFTER_80: prediction("GOAL_AFTER_80", "Goal after 80 minutes", "After 80′", 2, 2, 28, (events) => events.some((e) => isGoal(e) && e.minute >= 80)),
  SUBSTITUTE_GOAL_AFTER_60: prediction("SUBSTITUTE_GOAL_AFTER_60", "A substitute scores", "After 60′", 2, 2, 18, (events) => events.some((e) => e.eventType === "SUBSTITUTE_GOAL" && e.minute >= 60)),
  EXTRA_TIME: prediction("EXTRA_TIME", "Match goes to extra time", "After 90′", 2, 2, 11, (events) => events.some((e) => e.eventType === "EXTRA_TIME")),
};

export const PREDICTION_POOLS: readonly (readonly (readonly PredictionId[])[])[] = [
  [
    ["HOME_TWO_SHOTS_30", "GOAL_FIRST_30", "TWO_CORNERS_30"],
    ["CARD_30_60", "GOAL_30_60", "TWO_SUBS_BY_60"],
    ["TWO_SUBS_AFTER_60", "CARD_AFTER_75", "TWO_CORNERS_AFTER_60"],
  ],
  [
    ["HOME_SCORES_FIRST", "GOAL_BEFORE_20", "YELLOW_BEFORE_30"],
    ["VAR_30_60", "BOTH_SCORE_BY_60", "TWO_GOALS_BY_60"],
    ["BOTH_SCORE_FULL_TIME", "FOUR_CARDS_FULL_TIME", "GOAL_AFTER_75"],
  ],
  [
    ["PENALTY_BEFORE_30", "AWAY_LEADS_30", "GOAL_OVERTURNED_30"],
    ["PENALTY_30_60", "SUBSTITUTE_GOAL_BY_60", "THREE_GOALS_BY_60"],
    ["GOAL_AFTER_80", "SUBSTITUTE_GOAL_AFTER_60", "EXTRA_TIME"],
  ],
] as const;

export function windowIndexForMinute(minute: number): number {
  if (minute < ROUND_START_MINUTE || minute >= ROUND_END_MINUTE) return -1;
  return Math.floor((minute - ROUND_START_MINUTE) / WINDOW_MINUTES);
}

export const LINE_MASKS = [0x007, 0x038, 0x1c0, 0x049, 0x092, 0x124, 0x111, 0x054] as const;

export function completedLineIndexes(mask: number): number[] {
  return LINE_MASKS.flatMap((lineMask, index) => ((mask & lineMask) === lineMask ? [index] : []));
}

export function completedLinesForMask(mask: number): number {
  return completedLineIndexes(mask).length;
}

export function matchScore(events: MatchEvent[]) {
  return events.reduce(
    (score, event) => {
      if (event.eventType === "HOME_GOAL" || (event.eventType === "SUBSTITUTE_GOAL" && event.team === "home")) {
        score.home += 1;
      }
      if (event.eventType === "AWAY_GOAL" || (event.eventType === "SUBSTITUTE_GOAL" && event.team === "away")) {
        score.away += 1;
      }
      return score;
    },
    { home: 0, away: 0 },
  );
}

export function scoreGrid(grid: PredictionId[], events: MatchEvent[]) {
  if (grid.length !== 9) throw new Error("A Moment Grid must contain exactly nine predictions.");

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
