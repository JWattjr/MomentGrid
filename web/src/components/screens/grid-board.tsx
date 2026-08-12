"use client";

import { Check, EyeOff } from "lucide-react";
import { type CSSProperties } from "react";
import { PREDICTIONS } from "@moment-grid/scoring";
import { Grid, TIER_CODES, TIER_NAMES, WINDOW_LABELS } from "./shared";

/// The 3x3 board, shared by the build, lock and reveal screens.
///
/// One component rather than three because the states are the same board with
/// different affordances: pickable while building, sealed once locked, marked
/// once revealed.
export function GridBoard({
  grid,
  onPick,
  markedMask = 0,
  revealed = false,
  locked = false,
  showConsensus = false,
  lineCellOrder,
}: {
  grid: Grid;
  onPick?: (cell: number) => void;
  markedMask?: number;
  revealed?: boolean;
  locked?: boolean;
  showConsensus?: boolean;
  lineCellOrder?: number[];
}) {
  return (
    <div className={`grid-board prediction-board ${locked ? "is-locked" : ""}`}>
      <div className="grid-corner" />
      {WINDOW_LABELS.map((window) => (
        <div className="column-label" key={window}>
          {window}′
        </div>
      ))}
      {TIER_NAMES.map((tier, row) => (
        <div className="contents" key={tier}>
          <div className={`tier-label tier-${row}`}>
            <span>{TIER_CODES[row]}</span>
            <small>{tier}</small>
          </div>
          {[0, 1, 2].map((column) => {
            const cell = row * 3 + column;
            const predictionId = grid[cell];
            const definition = predictionId ? PREDICTIONS[predictionId] : null;
            const hit = (markedMask & (1 << cell)) !== 0;
            const ignitionOrder = lineCellOrder?.[cell] ?? -1;
            return (
              <button
                type="button"
                key={cell}
                className={`grid-cell prediction-cell tier-${row} ${definition ? "has-pick" : ""} ${revealed && hit ? "is-hit" : ""} ${revealed && !hit ? "is-miss" : ""} ${ignitionOrder >= 0 ? "is-line-cell" : ""}`}
                style={
                  {
                    "--cell-index": cell,
                    ...(ignitionOrder >= 0 ? { "--line-order": ignitionOrder } : {}),
                  } as CSSProperties
                }
                onClick={() => onPick?.(cell)}
                disabled={!onPick}
                aria-label={`${tier}, ${WINDOW_LABELS[column]}: ${definition?.label ?? "empty"}`}
              >
                {locked && !revealed ? (
                  <>
                    <EyeOff size={17} />
                    <small>Sealed</small>
                  </>
                ) : definition ? (
                  <>
                    <span className="prediction-copy">
                      <strong>{definition.label}</strong>
                      <small>{definition.deadline}</small>
                    </span>
                    {showConsensus && <ConsensusMeter support={definition.support} tier={row} />}
                    {revealed && <span className="result-dot">{hit ? <Check size={10} /> : "×"}</span>}
                  </>
                ) : (
                  <>
                    <span className="plus">+</span>
                    <small>Choose</small>
                  </>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ConsensusMeter({ support, tier }: { support: number; tier: number }) {
  const filledDots = Math.max(1, Math.min(5, Math.ceil(support / 20)));
  return (
    <span className={`consensus-meter meter-tier-${tier}`} aria-label={`${support}% crowd support`}>
      <span className="consensus-dots" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <i className={index < filledDots ? "is-filled" : ""} key={index} />
        ))}
      </span>
      <b>{support}%</b>
    </span>
  );
}
