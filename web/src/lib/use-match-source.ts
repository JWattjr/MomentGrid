"use client";

import { MatchSnapshot, ReplayClock, replayMatchEvents } from "@moment-grid/scoring";
import { useCallback, useEffect, useRef, useState } from "react";
import { isApiConfigured, matchApi } from "./api-client";

export const REPLAY_SECONDS = Number(process.env.NEXT_PUBLIC_REPLAY_SECONDS ?? 120);

const IDLE_SNAPSHOT: MatchSnapshot = {
  phase: "idle",
  startedAt: null,
  durationSeconds: REPLAY_SECONDS,
  elapsedSeconds: 0,
  remainingSeconds: REPLAY_SECONDS,
  progress: 0,
  virtualMinute: 0,
  events: [],
};

/// Frames are cheap but re-renders are not, and the clock only needs to look
/// smooth. Ten updates a second is well under the CSS transition durations the
/// watch screen already uses.
const TICK_INTERVAL_MS = 100;
const API_POLL_MS = 800;

export type MatchController = {
  snapshot: MatchSnapshot;
  error: string;
  start: () => Promise<void>;
  reset: () => Promise<void>;
};

/// Drives the match clock from whichever source is configured.
///
/// Guest mode runs `ReplayClock` directly in the browser: it is pure and
/// deterministic given `startedAt`, so it needs no server and cannot desync the
/// way a serverless singleton does. When `NEXT_PUBLIC_API_URL` is set the same
/// snapshot shape is polled from the API instead.
export function useMatchSource(): MatchController {
  const [snapshot, setSnapshot] = useState<MatchSnapshot>(IDLE_SNAPSHOT);
  const [error, setError] = useState("");
  const clock = useRef<ReplayClock | null>(null);
  const running = useRef(false);
  const usingApi = isApiConfigured();

  const localClock = useCallback(() => {
    clock.current ??= new ReplayClock(replayMatchEvents(), REPLAY_SECONDS * 1000);
    return clock.current;
  }, []);

  const start = useCallback(async () => {
    setError("");
    try {
      const next = usingApi ? await matchApi.start(REPLAY_SECONDS) : localClock().start();
      running.current = true;
      setSnapshot(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The match could not be started.");
    }
  }, [localClock, usingApi]);

  const reset = useCallback(async () => {
    setError("");
    try {
      const next = usingApi ? await matchApi.reset() : localClock().reset();
      running.current = false;
      setSnapshot(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The match could not be reset.");
    }
  }, [localClock, usingApi]);

  useEffect(() => {
    if (!running.current || snapshot.phase === "complete") return;

    if (!usingApi) {
      let frame = 0;
      let last = 0;
      const tick = (timestamp: number) => {
        if (timestamp - last >= TICK_INTERVAL_MS) {
          last = timestamp;
          setSnapshot(localClock().status());
        }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(frame);
    }

    const poll = window.setInterval(async () => {
      try {
        setSnapshot(await matchApi.status());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The match feed is unavailable.");
      }
    }, API_POLL_MS);
    return () => window.clearInterval(poll);
  }, [localClock, snapshot.phase, usingApi]);

  return { snapshot, error, start, reset };
}
