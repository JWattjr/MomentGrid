import {
  MatchEvent,
  MatchEventType,
  MatchSnapshot,
  MatchSource,
  ROUND_END_MINUTE,
  ROUND_START_MINUTE,
} from "./match";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ProviderEvent = {
  minute: number;
  eventType?: string;
  type?: string;
  team?: string;
};

type ProviderSnapshot = {
  minute: number;
  status?: "scheduled" | "live" | "complete";
  events: ProviderEvent[];
};

const EVENT_ALIASES: Record<string, MatchEventType> = {
  HOME_SHOT: "HOME_SHOT",
  HOME_SHOT_ON_TARGET: "HOME_SHOT",
  AWAY_SHOT: "AWAY_SHOT",
  AWAY_SHOT_ON_TARGET: "AWAY_SHOT",
  HOME_GOAL: "HOME_GOAL",
  AWAY_GOAL: "AWAY_GOAL",
  CORNER: "CORNER",
  CORNER_KICK: "CORNER",
  YELLOW: "YELLOW_CARD",
  YELLOW_CARD: "YELLOW_CARD",
  VAR: "VAR_REVIEW",
  VAR_REVIEW: "VAR_REVIEW",
  GOAL_OVERTURNED: "GOAL_OVERTURNED",
  PENALTY: "PENALTY_AWARDED",
  PENALTY_AWARDED: "PENALTY_AWARDED",
  SUB: "SUBSTITUTION",
  SUBSTITUTION: "SUBSTITUTION",
  SUBSTITUTE_GOAL: "SUBSTITUTE_GOAL",
  RED: "RED_CARD",
  RED_CARD: "RED_CARD",
  EXTRA_TIME: "EXTRA_TIME",
};

export type LiveFeedOptions = {
  endpoint: string;
  apiKey?: string;
  fetcher?: FetchLike;
};

/// Provider-neutral adapter for one configured match. The API response only
/// needs `{ minute, status, events: [{ minute, type | eventType }] }`.
export class LiveFeedSource implements MatchSource {
  private active = false;
  private readonly fetcher: FetchLike;

  constructor(private readonly options: LiveFeedOptions) {
    if (!options.endpoint) throw new Error("A live feed endpoint is required.");
    this.fetcher = options.fetcher ?? fetch;
  }

  async start() {
    this.active = true;
    return this.status();
  }

  async reset() {
    this.active = false;
    return idleSnapshot();
  }

  async status(): Promise<MatchSnapshot> {
    if (!this.active) return idleSnapshot();

    let provider: ProviderSnapshot;
    try {
      const response = await this.fetcher(this.options.endpoint, {
        headers: this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : undefined,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Live feed returned ${response.status}.`);
      provider = (await response.json()) as ProviderSnapshot;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Live feed request to ${this.options.endpoint} failed: ${reason}`);
    }

    const virtualMinute = Math.min(ROUND_END_MINUTE, Math.max(ROUND_START_MINUTE, provider.minute));
    const progress = (virtualMinute - ROUND_START_MINUTE) / (ROUND_END_MINUTE - ROUND_START_MINUTE);
    const events = (provider.events ?? [])
      .map(normalizeProviderEvent)
      .filter((event): event is MatchEvent => event !== null)
      .filter((event) => event.minute >= ROUND_START_MINUTE && event.minute < ROUND_END_MINUTE);
    const complete = provider.status === "complete" || provider.minute >= ROUND_END_MINUTE;

    return {
      phase: complete ? "complete" : "running",
      startedAt: null,
      durationSeconds: 90 * 60,
      elapsedSeconds: progress * 90 * 60,
      remainingSeconds: (1 - progress) * 90 * 60,
      progress,
      virtualMinute,
      events,
    };
  }
}

function normalizeProviderEvent(event: ProviderEvent): MatchEvent | null {
  const rawType = event.eventType ?? event.type;
  if (!rawType || !Number.isFinite(event.minute)) return null;
  const normalized = EVENT_ALIASES[rawType.trim().toUpperCase().replaceAll(" ", "_")];
  if (!normalized) return null;
  const normalizedTeam = event.team?.trim().toLowerCase();
  const team = normalizedTeam === "home" || normalizedTeam === "away" ? normalizedTeam : undefined;
  return team ? { minute: event.minute, eventType: normalized, team } : { minute: event.minute, eventType: normalized };
}

function idleSnapshot(): MatchSnapshot {
  return {
    phase: "idle",
    startedAt: null,
    durationSeconds: 90 * 60,
    elapsedSeconds: 0,
    remainingSeconds: 90 * 60,
    progress: 0,
    virtualMinute: ROUND_START_MINUTE,
    events: [],
  };
}
