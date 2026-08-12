"use client";

import { ChevronRight, ShieldCheck, Zap } from "lucide-react";
import { MatchCard, RewardLoop } from "./chrome";
import { GridBoard } from "./grid-board";
import { Grid } from "./shared";

export function BuildScreen({
  grid,
  complete,
  onPick,
  onQuickFill,
  onContinue,
}: {
  grid: Grid;
  complete: boolean;
  onPick: (cell: number) => void;
  onQuickFill: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="screen-stack">
      <div className="title-row">
        <div>
          <span className="step-label">01 · Build</span>
          <h1>Call the match.</h1>
        </div>
        <button className="text-button" onClick={onQuickFill}>
          <Zap size={13} /> Quick fill
        </button>
      </div>
      <p className="lede">
        Build nine football predictions. Rows control rarity; columns decide when each call resolves.
      </p>
      <MatchCard />
      <RewardLoop compact />
      <GridBoard grid={grid} onPick={onPick} />
      <div className="privacy-note">
        <ShieldCheck size={16} />
        <span>Consensus stays hidden until every grid is locked.</span>
      </div>
      <button className="primary-button" disabled={!complete} onClick={onContinue}>
        {complete ? "Review my grid" : `${grid.filter(Boolean).length} / 9 predictions picked`}
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
