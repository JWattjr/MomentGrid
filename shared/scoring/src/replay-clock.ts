import { MatchEvent, MatchSnapshot, MatchSource, ROUND_END_MINUTE, ROUND_START_MINUTE } from "./match";

const DEFAULT_DURATION_MS = 120_000;

/// Compresses a full 90-minute fixture into a short replay.
///
/// Deliberately pure: every snapshot is a function of `startedAt`, `durationMs`
/// and the injected clock, with no I/O and no ambient state. That is what lets
/// the same class run in the browser for guest mode and inside the API for a
/// hosted round.
export class ReplayClock implements MatchSource {
  private startedAt: number | null = null;

  constructor(
    private readonly fixture: MatchEvent[],
    private readonly durationMs = DEFAULT_DURATION_MS,
    private readonly now: () => number = Date.now,
  ) {
    if (durationMs <= 0) throw new Error("Replay duration must be positive.");
    this.fixture = [...fixture].sort((a, b) => a.minute - b.minute);
  }

  start(): MatchSnapshot {
    this.startedAt = this.now();
    return this.status();
  }

  reset(): MatchSnapshot {
    this.startedAt = null;
    return this.status();
  }

  /// Rebuilds a clock that was started elsewhere, so a persisted `startedAt`
  /// can be resumed without replaying the start call.
  resumeFrom(startedAt: number | null): this {
    this.startedAt = startedAt;
    return this;
  }

  status(): MatchSnapshot {
    if (this.startedAt === null) {
      return this.snapshot("idle", 0);
    }

    const elapsedMs = Math.max(0, this.now() - this.startedAt);
    const progress = Math.min(1, elapsedMs / this.durationMs);
    return this.snapshot(progress >= 1 ? "complete" : "running", progress);
  }

  private snapshot(phase: MatchSnapshot["phase"], progress: number): MatchSnapshot {
    const span = ROUND_END_MINUTE - ROUND_START_MINUTE;
    const virtualMinute = ROUND_START_MINUTE + span * progress;
    const durationSeconds = this.durationMs / 1000;
    const elapsedSeconds = durationSeconds * progress;

    return {
      phase,
      startedAt: this.startedAt,
      durationSeconds,
      elapsedSeconds,
      remainingSeconds: Math.max(0, durationSeconds - elapsedSeconds),
      progress,
      virtualMinute,
      events:
        phase === "idle"
          ? []
          : this.fixture.filter(
              (event) =>
                event.minute >= ROUND_START_MINUTE && event.minute < ROUND_END_MINUTE && event.minute <= virtualMinute,
            ),
    };
  }
}
