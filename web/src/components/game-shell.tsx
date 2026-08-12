"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { PredictionId, scoreGrid } from "@moment-grid/scoring";
import { useEntryToken } from "@/lib/use-entry-token";
import { useCurrentRound } from "@/lib/use-current-round";
import { useMatchSource } from "@/lib/use-match-source";
import { useRoundOutcome } from "@/lib/use-round-outcome";
import { MomentHeader, MomentNav } from "./moment-chrome";
import { BuildScreen } from "./screens/build-screen";
import { Progress } from "./screens/chrome";
import { FirstPlayTutorial } from "./screens/first-play-tutorial";
import { LockScreen } from "./screens/lock-screen";
import { PredictionPicker } from "./screens/prediction-picker";
import { RevealScreen } from "./screens/reveal-screen";
import { RewardScreen } from "./screens/reward-screen";
import { EntryMode, Grid, QUICK_GRID, Screen } from "./screens/shared";
import { WatchScreen } from "./screens/watch-screen";
import { useFeedback } from "./use-feedback";

/// Orchestrates the five screens. The screens themselves live in
/// `./screens`, so this file stays about state and transitions.
export function GameShell() {
  const [screen, setScreen] = useState<Screen>("build");
  const [grid, setGrid] = useState<Grid>(() => Array(9).fill(null));
  const [pickerCell, setPickerCell] = useState<number | null>(null);
  const [mode, setMode] = useState<EntryMode>("practice");
  const { snapshot, error: replayError, start: startMatch, reset: resetMatch } = useMatchSource();
  const [revealed, setRevealed] = useState(false);
  const [fragments, setFragments] = useState(0);
  const [showTutorial, setShowTutorial] = useState(false);
  const rewardCommitted = useRef(false);
  const { feedbackEnabled, playFeedback, toggleFeedback } = useFeedback();

  const { address } = useAccount();
  const { roundId, refresh: refreshRound } = useCurrentRound();
  const { outcome, error: outcomeError, refetch: refetchOutcome } = useRoundOutcome(
    mode === "onchain" ? roundId : undefined,
    mode === "onchain" ? address : undefined,
  );
  const { balance, refetch: refetchBalance } = useEntryToken();

  const completeGrid = grid.every((prediction): prediction is PredictionId => prediction !== null);

  /// The player's own hit mask, computed locally. Correct for the reveal
  /// animation — which of their cells fired — but it cannot know what anyone
  /// else scored, so the money question is answered from chain instead.
  const result = useMemo(
    () => (completeGrid ? scoreGrid(grid as PredictionId[], snapshot.events) : { markedMask: 0, completedLines: 0 }),
    [completeGrid, grid, snapshot.events],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("moment-grid-fragments");
      if (saved) setFragments(Number(saved));
      setShowTutorial(!window.localStorage.getItem("moment-grid-tutorial-seen"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const closeTutorial = () => {
    window.localStorage.setItem("moment-grid-tutorial-seen", "1");
    setShowTutorial(false);
    playFeedback("confirm");
  };

  const handleEventFeedback = useCallback(() => playFeedback("event"), [playFeedback]);

  const selectPrediction = (prediction: PredictionId) => {
    if (pickerCell === null) return;
    playFeedback("tap");
    setGrid((current) => current.map((value, index) => (index === pickerCell ? prediction : value)));
    setPickerCell(null);
  };

  const startRound = async (entryMode: EntryMode) => {
    playFeedback("lock");
    setMode(entryMode);
    await startMatch();
    setScreen("watch");
  };

  /// Fragments are a local tally of the player's own lines and are awarded the
  /// same way in both modes; the pot is what practice runs do not touch.
  const commitReward = useCallback(() => {
    if (rewardCommitted.current) return;
    playFeedback("reward");
    rewardCommitted.current = true;
    setFragments((current) => {
      const next = current + result.completedLines;
      window.localStorage.setItem("moment-grid-fragments", String(next));
      return next;
    });
    setScreen("reward");
  }, [playFeedback, result.completedLines]);

  const refreshAfterWithdraw = useCallback(async () => {
    await Promise.all([refetchBalance(), refetchOutcome()]);
  }, [refetchBalance, refetchOutcome]);

  const playAgain = async () => {
    playFeedback("tap");
    await resetMatch();
    await refreshRound();
    rewardCommitted.current = false;
    setGrid(Array(9).fill(null));
    setRevealed(false);
    setMode("practice");
    setScreen("build");
  };

  return (
    <main className="app-stage theme-club">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="phone-shell">
        <MomentHeader
          feedbackEnabled={feedbackEnabled}
          onOpenTutorial={() => {
            playFeedback("tap");
            setShowTutorial(true);
          }}
          onToggleFeedback={toggleFeedback}
        />
        <MomentNav />
        <Progress screen={screen} />

        <div className="screen-body" key={screen}>
          {screen === "build" && (
            <BuildScreen
              grid={grid}
              complete={completeGrid}
              onPick={(cell) => {
                playFeedback("tap");
                setPickerCell(cell);
              }}
              onQuickFill={() => {
                playFeedback("confirm");
                setGrid([...QUICK_GRID]);
              }}
              onContinue={() => {
                playFeedback("confirm");
                setScreen("lock");
              }}
            />
          )}
          {screen === "lock" && (
          <LockScreen
              grid={grid as PredictionId[]}
              error={replayError}
              roundId={roundId}
              onBack={() => {
                playFeedback("tap");
                setScreen("build");
              }}
              onLock={startRound}
            />
          )}
          {screen === "watch" && (
            <WatchScreen
              snapshot={snapshot}
              error={replayError}
              mode={mode}
              onEvent={handleEventFeedback}
              onContinue={() => {
                playFeedback("confirm");
                setScreen("reveal");
              }}
            />
          )}
          {screen === "reveal" && (
            <RevealScreen
              grid={grid as PredictionId[]}
              markedMask={result.markedMask}
              completedLines={result.completedLines}
              revealed={revealed}
              mode={mode}
              onReveal={() => {
                playFeedback("reveal");
                setRevealed(true);
              }}
              onContinue={commitReward}
            />
          )}
          {screen === "reward" && (
            <RewardScreen
              completedLines={result.completedLines}
              fragments={fragments}
              mode={mode}
              outcome={outcome}
              outcomeError={outcomeError}
              balance={balance}
              onRefresh={refreshAfterWithdraw}
              onAgain={playAgain}
            />
          )}
        </div>

        <div className="home-indicator" />
      </section>

      {pickerCell !== null && (
        <PredictionPicker
          cell={pickerCell}
          selected={grid[pickerCell]}
          onSelect={selectPrediction}
          onClose={() => setPickerCell(null)}
        />
      )}
      {showTutorial && <FirstPlayTutorial onAdvance={() => playFeedback("tap")} onClose={closeTutorial} />}
    </main>
  );
}
