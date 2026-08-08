"use client";

import { Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { isApiConfigured, leaderboardApi, type LeaderboardRow } from "@/lib/api-client";

const ROUND_ID = process.env.NEXT_PUBLIC_ROUND_ID ?? "1";

const shorten = (address: string) => `${address.slice(0, 4)}…${address.slice(-3)}`;

type State =
  | { kind: "guest" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; rows: LeaderboardRow[] };

/// Real standings, when there is a backend to read them from.
///
/// Falls back to the static preview below it in guest mode rather than showing
/// an error, so the page still communicates the idea with nothing configured.
export function LiveLeaderboard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(() => (isApiConfigured() ? { kind: "loading" } : { kind: "guest" }));

  useEffect(() => {
    if (!isApiConfigured()) return;
    let cancelled = false;

    leaderboardApi
      .forRound(ROUND_ID)
      .then((rows) => {
        if (cancelled) return;
        setState(rows.length === 0 ? { kind: "empty" } : { kind: "ready", rows });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ kind: "error", message: error instanceof Error ? error.message : "Standings are unavailable." });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "guest") return <>{children}</>;

  if (state.kind === "loading") {
    return <div className="prototype-note"><span>Loading round {ROUND_ID} standings…</span></div>;
  }

  if (state.kind === "empty") {
    return (
      <div className="prototype-note">
        <Trophy size={15} />
        <span>
          <strong>Round {ROUND_ID} is not settled yet.</strong> Standings appear once the keeper reveals every
          encrypted score.
        </span>
      </div>
    );
  }

  if (state.kind === "error") {
    return <p className="error-message">{state.message}</p>;
  }

  return (
    <section className="rank-card">
      <header><span>Rank</span><span>Player</span><span>Lines</span><span>Fragments</span></header>
      {state.rows.map((row) => (
        <div key={row.address}>
          <b>#{String(row.rank).padStart(2, "0")}</b>
          <strong><i className="avatar-dot tone-lime" />{shorten(row.address)}</strong>
          <span>{row.completedLines}</span>
          <span>+{row.fragments}</span>
        </div>
      ))}
    </section>
  );
}
