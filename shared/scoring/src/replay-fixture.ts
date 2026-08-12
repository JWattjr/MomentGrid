import { MatchEvent } from "./match";

/// The recorded ARS vs CHE cup replay that drives guest mode and the demo
/// round. Lives in the shared package so the web app and the API score the
/// exact same fixture.
///
/// The rare-tier predictions are the reason this fixture carries an early
/// penalty and a first-half substitute goal. Without them nothing in
/// `PREDICTION_POOLS[2][0]` or `[2][1]` ever fires, cells 6 and 7 can never be
/// marked, and the grid ceiling drops from the designed eight lines to four —
/// which makes the rare row strictly worse than the common one with no upside,
/// and makes the top score unbeatable rather than merely hard.
export const REPLAY_MATCH: readonly MatchEvent[] = [
  { minute: 4.2, eventType: "HOME_SHOT" },
  { minute: 8.8, eventType: "CORNER" },
  { minute: 12.5, eventType: "HOME_SHOT" },
  { minute: 17.4, eventType: "HOME_GOAL" },
  { minute: 22.0, eventType: "PENALTY_AWARDED" },
  { minute: 24.1, eventType: "YELLOW_CARD" },
  { minute: 28.6, eventType: "CORNER" },
  { minute: 32.3, eventType: "AWAY_SHOT" },
  { minute: 37.2, eventType: "VAR_REVIEW" },
  { minute: 41.7, eventType: "YELLOW_CARD" },
  { minute: 47.5, eventType: "AWAY_GOAL" },
  { minute: 51.0, eventType: "SUBSTITUTE_GOAL", team: "away" },
  { minute: 54.1, eventType: "SUBSTITUTION" },
  { minute: 58.4, eventType: "CORNER" },
  { minute: 63.2, eventType: "SUBSTITUTION" },
  { minute: 68.5, eventType: "SUBSTITUTION" },
  { minute: 71.3, eventType: "PENALTY_AWARDED" },
  { minute: 76.1, eventType: "YELLOW_CARD" },
  { minute: 82.4, eventType: "HOME_GOAL" },
  { minute: 85.6, eventType: "SUBSTITUTE_GOAL", team: "home" },
  { minute: 88.2, eventType: "RED_CARD" },
] as const;

export const replayMatchEvents = (): MatchEvent[] => REPLAY_MATCH.map((event) => ({ ...event }));
