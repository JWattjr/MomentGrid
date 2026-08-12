"use client";

import { Check, CircleDot } from "lucide-react";
import { PREDICTION_POOLS, PREDICTIONS, PredictionId } from "@moment-grid/scoring";
import { TIER_NAMES, WINDOW_LABELS } from "./shared";

export function PredictionPicker({
  cell,
  selected,
  onSelect,
  onClose,
}: {
  cell: number;
  selected: PredictionId | null;
  onSelect: (prediction: PredictionId) => void;
  onClose: () => void;
}) {
  const tier = Math.floor(cell / 3);
  const column = cell % 3;
  const pool = PREDICTION_POOLS[tier][column];

  return (
    <div
      className="picker-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="picker-sheet" role="dialog" aria-modal="true" aria-label="Choose a prediction">
        <div className="picker-handle" />
        <div className="picker-heading">
          <div>
            <span className="step-label">
              {TIER_NAMES[tier]} · {WINDOW_LABELS[column]}′
            </span>
            <h2>Choose your call</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <p className="picker-privacy">Crowd backing unlocks after all grids are sealed.</p>
        <div className="picker-options">
          {pool.map((predictionId) => {
            const definition = PREDICTIONS[predictionId];
            return (
              <button
                className={selected === predictionId ? "selected" : ""}
                key={predictionId}
                onClick={() => onSelect(predictionId)}
              >
                <span className={`prediction-swatch tier-${tier}`}>
                  <CircleDot size={16} />
                </span>
                <div>
                  <strong>{definition.label}</strong>
                  <small>{definition.deadline}</small>
                </div>
                {selected === predictionId && <Check size={17} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
