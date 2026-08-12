"use client";

import { Eye, EyeOff, Flame, Sparkles } from "lucide-react";
import { type CSSProperties } from "react";
import { completedLineIndexes, PredictionId } from "@moment-grid/scoring";
import { PracticeBanner, PrivacyJourney } from "./chrome";
import { GridBoard } from "./grid-board";
import { EntryMode, LINE_PATHS } from "./shared";

/// The reveal animation runs from the locally computed score, which is correct
/// for what it shows: which of *your* cells hit, and how many lines that makes.
/// What it cannot know is whether that beat anyone — that comes from the chain,
/// on the reward screen.
export function RevealScreen({
  grid,
  markedMask,
  completedLines,
  revealed,
  mode,
  onReveal,
  onContinue,
}: {
  grid: PredictionId[];
  markedMask: number;
  completedLines: number;
  revealed: boolean;
  mode: EntryMode;
  onReveal: () => void;
  onContinue: () => void;
}) {
  const lineIndexes = revealed ? completedLineIndexes(markedMask) : [];
  const lineCellOrder = Array<number>(9).fill(-1);
  lineIndexes.forEach((lineIndex, order) => {
    LINE_PATHS[lineIndex].cells.forEach((cell) => {
      if (lineCellOrder[cell] === -1) lineCellOrder[cell] = order;
    });
  });

  return (
    <div className="screen-stack reveal-screen">
      <div>
        <span className="step-label">04 · Reveal</span>
        <h1>{revealed ? "The crowd called it." : "Ready for the truth?"}</h1>
      </div>
      <p className="lede">Five-dot meters show how strongly the locked crowd backed each prediction.</p>
      {mode === "practice" && <PracticeBanner />}
      <PrivacyJourney stage={revealed ? "revealed" : "sealed"} />
      <div className={`reveal-wrap ${revealed ? "is-revealed" : ""}`}>
        <GridBoard
          grid={grid}
          locked={!revealed}
          revealed={revealed}
          markedMask={markedMask}
          showConsensus={revealed}
          lineCellOrder={lineCellOrder}
        />
        {revealed && <LineIgnitionOverlay lineIndexes={lineIndexes} />}
        {!revealed && (
          <div className="reveal-scrim">
            <EyeOff size={28} />
            <span>Encrypted grid</span>
          </div>
        )}
      </div>
      {revealed && (
        <div className="consensus-key">
          <span>
            <i className="is-filled" />
            ○○○○ Contrarian
          </span>
          <span>
            <i className="is-filled" />
            <i className="is-filled" />
            <i className="is-filled" />
            <i className="is-filled" />
            <i className="is-filled" /> Crowd favorite
          </span>
        </div>
      )}
      {revealed && (
        <div className="line-result">
          <div>
            <Flame size={22} />
            <span>
              <strong>{completedLines}</strong> {completedLines === 1 ? "line" : "lines"} complete
            </span>
          </div>
          <small>Equal scoring</small>
        </div>
      )}
      <button className="primary-button" onClick={revealed ? onContinue : onReveal}>
        {revealed ? "See the payout" : "Reveal predictions"}
        {revealed ? <Sparkles size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function LineIgnitionOverlay({ lineIndexes }: { lineIndexes: number[] }) {
  if (lineIndexes.length === 0) return null;

  return (
    <div className="line-ignition-layer" aria-hidden="true">
      <svg className="line-ignition-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {lineIndexes.map((lineIndex, order) => {
          const line = LINE_PATHS[lineIndex];
          const delay = order * 0.78;
          return (
            <g key={lineIndex} style={{ "--line-order": order } as CSSProperties}>
              <path className="line-route" d={line.d} pathLength="1" />
              <path className="line-complete" d={line.d} pathLength="1" />
              <circle
                className="line-spark"
                cx="0"
                cy="0"
                r="2.1"
                style={{ "--line-order": order } as CSSProperties}
              >
                <animateMotion path={line.d} begin={`${delay + 0.08}s`} dur="0.62s" fill="freeze" />
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="line-fragment-cues">
        {lineIndexes.map((lineIndex, order) => (
          <span key={lineIndex} style={{ "--line-order": order } as CSSProperties}>
            Line complete <b>+1 fragment</b>
          </span>
        ))}
      </div>
    </div>
  );
}
