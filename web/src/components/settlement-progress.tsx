"use client";

import { Check, CircleAlert, ExternalLink, LoaderCircle } from "lucide-react";
import { shortHash, txUrl } from "@/lib/explorer";
import { SETTLEMENT_STAGES, stageStates } from "@/lib/round-outcome";

/// Shows what confidential settlement is doing while it does it.
///
/// The reward screen opens the instant the match ends, but the answer takes two
/// transactions per player plus an Inco round-trip. That wait is the most
/// interesting thing the project does — grids scored without being decrypted —
/// so it is shown rather than hidden behind a spinner.
export function SettlementProgress({
  stage,
  status,
  playersResolved,
  playersTotal,
  transactions,
  error,
}: {
  stage?: string;
  status?: string;
  playersResolved?: number;
  playersTotal?: number;
  transactions?: string[];
  error?: string | null;
}) {
  const states = stageStates(stage, status);
  const recent = (transactions ?? []).slice(-3);

  return (
    <div className="privacy-proof" aria-live="polite" aria-busy={status === "running"}>
      <div className="settlement-stages">
        {SETTLEMENT_STAGES.map((entry, index) => {
          const state = states[index];
          const showCount = entry.key === "revealing" && (playersTotal ?? 0) > 0;
          return (
            <div className={`settlement-stage is-${state}`} key={entry.key}>
              <span className="settlement-icon">
                {state === "done" ? (
                  <Check size={14} />
                ) : state === "failed" ? (
                  <CircleAlert size={14} />
                ) : state === "active" ? (
                  <LoaderCircle size={14} className="is-spinning" />
                ) : (
                  <i />
                )}
              </span>
              <span>
                <b>{entry.label}</b>
                {showCount && state !== "waiting" && (
                  <small>
                    {playersResolved} of {playersTotal} grids
                  </small>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {recent.length > 0 && (
        <div className="settlement-transactions">
          {recent.map((hash) => (
            <a key={hash} href={txUrl(hash)} target="_blank" rel="noreferrer noopener">
              {shortHash(hash)} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}

      {error && <p className="error-message">{error}</p>}
    </div>
  );
}
