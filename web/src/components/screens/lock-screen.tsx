"use client";

import { ArrowLeft, ChevronRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { PredictionId } from "@moment-grid/scoring";
import { ConfidentialSubmitButton } from "../confidential-submit-button";
import { PrivacyJourney } from "./chrome";
import { GridBoard } from "./grid-board";
import { EntryMode } from "./shared";

/// The point of no return: stake and seal, or run it through with nothing at
/// stake.
///
/// Both paths used to be primary buttons calling the same handler, which made a
/// free run and a real USDC round indistinguishable from here on. Practice is
/// now a secondary action that tells the rest of the app what kind of round
/// this is, so the reward screen can refuse to show a payout for one.
export function LockScreen({
  grid,
  error,
  roundId,
  onBack,
  onLock,
}: {
  grid: PredictionId[];
  error: string;
  roundId: string | undefined;
  onBack: () => void;
  onLock: (mode: EntryMode) => void | Promise<void>;
}) {
  return (
    <div className="screen-stack">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Edit grid
      </button>
      <div>
        <span className="step-label">02 · Lock</span>
        <h1>Seal your calls.</h1>
      </div>
      <p className="lede">
        Predictions cannot change after kickoff. Crowd support appears only when every board is sealed.
      </p>
      <PrivacyJourney stage="sealed" />
      <div className="privacy-proof" aria-label="Confidential computation proof">
        <div>
          <ShieldCheck size={18} />
          <span>
            <b>Inco Lightning</b>
            <small>1 encrypted handle stores all 9 picks</small>
          </span>
        </div>
        <div>
          <span>
            <b>Compute</b>
            <small>Lines scored while the grid stays secret</small>
          </span>
          <em>FHE</em>
        </div>
        <div>
          <span>
            <b>Reveal</b>
            <small>Only hit mask + line count become public</small>
          </span>
          <em>AFTER FT</em>
        </div>
        <p>Base Sepolia · pot settled in USDC</p>
      </div>
      <GridBoard grid={grid} locked />
      <div className="lock-card">
        <div className="lock-icon">
          <LockKeyhole size={20} />
        </div>
        <div>
          <strong>Private until reveal</strong>
          <p>No one can copy popular grids before the match begins.</p>
        </div>
      </div>
      <ConfidentialSubmitButton grid={grid} roundId={roundId} onConfirmed={() => onLock("onchain")} />
      {error && <p className="error-message">{error}</p>}
      <button className="guest-replay-button" onClick={() => void onLock("practice")}>
        Practice run · nothing staked <ChevronRight size={15} />
      </button>
    </div>
  );
}
