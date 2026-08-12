"use client";

import { useCallback, useEffect, useState } from "react";
import { isApiConfigured, roundsApi } from "./api-client";

/// Fetches the current round ID from the API. Falls back to
/// `NEXT_PUBLIC_ROUND_ID` when the API is not configured (guest mode).
///
/// The keeper creates a bot-populated round after settlement, so callers can
/// refresh before starting another grid without reloading the whole page.
export function useCurrentRound(): { roundId: string | undefined; refresh: () => Promise<void> } {
  const envFallback = process.env.NEXT_PUBLIC_ROUND_ID;
  const [roundId, setRoundId] = useState<string | undefined>(envFallback);

  const refresh = useCallback(async () => {
    if (!isApiConfigured()) return;

    try {
      const { roundId: id } = await roundsApi.current();
      if (id && id !== "0") setRoundId(id);
    } catch {
      // Keep the env fallback if the API is unreachable.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { roundId, refresh };
}
