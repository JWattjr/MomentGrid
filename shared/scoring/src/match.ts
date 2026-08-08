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

export function windowIndexForMinute(minute: number): number {
  if (minute < ROUND_START_MINUTE || minute >= ROUND_END_MINUTE) return -1;
  return Math.floor((minute - ROUND_START_MINUTE) / WINDOW_MINUTES);
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
