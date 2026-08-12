"use client";

import { Clock3, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { SCREEN_ORDER, Screen } from "./shared";

/// Small presentational pieces reused across several screens.

export function Progress({ screen }: { screen: Screen }) {
  const active = SCREEN_ORDER.indexOf(screen);
  return (
    <div className="progress-rail" aria-label={`Step ${active + 1} of 5: ${screen}`}>
      {SCREEN_ORDER.map((item, index) => (
        <div key={item} className={`progress-segment ${index <= active ? "is-active" : ""}`} />
      ))}
    </div>
  );
}

export function MatchCard() {
  return (
    <div className="match-card">
      <div>
        <span className="eyebrow">Recorded cup replay · Emirates</span>
        <strong>
          ARS <span>vs</span> CHE
        </strong>
      </div>
      <div className="match-meta">
        <span>Judge demo</span>
        <div className="match-window">
          <Clock3 size={13} /> 2 min / 90′
        </div>
      </div>
    </div>
  );
}

export function RewardLoop({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`reward-loop ${compact ? "is-compact" : ""}`} aria-label="Moment Grid reward loop">
      <span>
        <b>Play</b>
        <small>secret grid</small>
      </span>
      <i>→</i>
      <span>
        <b>Line</b>
        <small>row · column · diagonal</small>
      </span>
      <i>→</i>
      <span>
        <b>+1</b>
        <small>fragment</small>
      </span>
      <i>→</i>
      <span className="reward-loop-ticket">
        <b>4 = Ticket</b>
        <small>Megapot draw</small>
      </span>
    </div>
  );
}

export function PrivacyJourney({ stage }: { stage: "draft" | "sealed" | "revealed" }) {
  const active = { draft: 0, sealed: 1, revealed: 2 }[stage];
  const stages = [
    { label: "Private", icon: EyeOff },
    { label: "Sealed", icon: LockKeyhole },
    { label: "Revealed", icon: Eye },
  ];
  return (
    <div className="privacy-journey" aria-label={`Grid privacy status: ${stage}`}>
      {stages.map(({ label, icon: Icon }, index) => (
        <div className={`${index < active ? "is-done" : ""} ${index === active ? "is-current" : ""}`} key={label}>
          <span>
            <Icon size={12} />
          </span>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

/// Marks a run that has nothing staked on it. The watch, reveal and reward
/// screens are identical either way, so without this a free run-through and a
/// real USDC round are indistinguishable once the match starts.
export function PracticeBanner() {
  return (
    <div className="privacy-note" role="status">
      <EyeOff size={16} />
      <span>Practice run · nothing staked, no USDC at risk</span>
    </div>
  );
}
