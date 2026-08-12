"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isApiConfigured, roundsApi } from "./api-client";
import { RoundOutcome } from "./round-outcome";

/// Polls one player's round outcome until it settles, then stops.
///
/// Settlement takes two transactions per player plus an Inco round-trip, so the
/// reward screen opens before the answer exists. This keeps asking until there
/// is one, and stops the moment there is — a poll that ran forever would keep
/// hitting the RPC for the rest of the session.

const POLL_MS = 2_000;

export type RoundOutcomeState = {
  outcome: RoundOutcome | null;
  error: string;
  loading: boolean;
  refetch: () => Promise<void>;
};

export function useRoundOutcome(roundId: string | undefined, address: string | undefined): RoundOutcomeState {
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const cancelled = useRef(false);

  const enabled = isApiConfigured() && Boolean(roundId) && Boolean(address);

  const fetchOnce = useCallback(async () => {
    if (!roundId || !address) return;
    setLoading(true);
    try {
      const next = await roundsApi.outcome(roundId, address);
      if (cancelled.current) return;
      setOutcome(next);
      setError("");
    } catch (caught) {
      if (cancelled.current) return;
      setError(caught instanceof Error ? caught.message : "The round result is unavailable.");
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, [address, roundId]);

  useEffect(() => {
    cancelled.current = false;
    if (!enabled) return;

    void fetchOnce();

    // Settled is terminal: nothing further can change, so stop asking.
    if (outcome?.state === "settled" && outcome.player.result !== "pending") return;

    const timer = window.setInterval(() => void fetchOnce(), POLL_MS);
    return () => {
      cancelled.current = true;
      window.clearInterval(timer);
    };
  }, [enabled, fetchOnce, outcome?.state, outcome?.player.result]);

  return { outcome, error, loading, refetch: fetchOnce };
}
