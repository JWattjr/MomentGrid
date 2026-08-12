import type { MatchSnapshot } from "@moment-grid/scoring";
import type { RoundOutcome } from "./round-outcome";

/// The API is optional. When `NEXT_PUBLIC_API_URL` is unset the app runs in
/// guest mode entirely in the browser, which is what keeps the replay playable
/// with no database, no wallet and no backend process.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

export const isApiConfigured = (): boolean => API_BASE_URL.length > 0;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Could not reach the Moment Grid API at ${url}: ${reason}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Moment Grid API returned ${response.status} for ${path}${detail ? `: ${detail}` : "."}`);
  }

  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const matchApi = {
  status: () => request<MatchSnapshot>("/match"),
  start: (durationSeconds: number) => request<MatchSnapshot>("/match/start", json({ durationSeconds })),
  reset: () => request<MatchSnapshot>("/match/reset", json({})),
};

export type LeaderboardRow = {
  rank: number;
  address: string;
  completedLines: number;
  fragments: number;
};

export const leaderboardApi = {
  forRound: (roundId: string) => request<LeaderboardRow[]>(`/leaderboard/${roundId}`),
};

export type PlayerSummary = {
  address: string;
  fragments: number;
  ticketsPurchased: number;
};

export const playersApi = {
  summary: (address: string) => request<PlayerSummary>(`/players/${address}`),
};

export const roundsApi = {
  /// The latest round, auto-discovered from chain by the API. Called at runtime
  /// so the web no longer needs a build-time env var for the round id.
  current: () => request<{ roundId: string }>("/rounds/current"),

  /// One player's result for one round: won or lost, what they are owed, and
  /// how far settlement has got. Derived server-side so the browser never has
  /// to reimplement what counts as a win.
  outcome: (roundId: string, address: string) =>
    request<RoundOutcome>(`/rounds/${roundId}/outcome/${address}`),
};

export type SettlementProgress = {
  roundId: string;
  status: "running" | "complete" | "failed";
  stage: "scoring" | "revealing" | "settling" | "complete" | "failed";
  playersResolved: number;
  playersTotal: number;
  transactions: string[];
  error: string | null;
};

export const settlementApi = {
  progress: (roundId: string) => request<SettlementProgress>(`/settlement/${roundId}`),
};
