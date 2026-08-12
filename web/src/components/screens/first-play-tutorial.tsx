"use client";

import { ChevronRight, Grid3X3, LockKeyhole, Trophy } from "lucide-react";
import { useState } from "react";

export function FirstPlayTutorial({ onAdvance, onClose }: { onAdvance: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      icon: Grid3X3,
      tag: "01 · Build",
      title: "Fill all nine calls.",
      copy: "Columns are match windows. Rows are rarity tiers. Every cell needs one prediction.",
    },
    {
      icon: LockKeyhole,
      tag: "02 · Lock",
      title: "Stake and seal.",
      copy: "Your USDC entry joins the pot and your grid is encrypted before kickoff, so nobody can copy it.",
    },
    {
      icon: Trophy,
      tag: "03 · Win",
      title: "Complete the most lines.",
      copy: "Rows, columns and diagonals count equally. Top scorers split the pot; each line also earns a fragment.",
    },
  ] as const;
  const current = steps[step];
  const Icon = current.icon;
  const last = step === steps.length - 1;

  const next = () => {
    if (last) return onClose();
    onAdvance();
    setStep((value) => value + 1);
  };

  return (
    <div className="tutorial-backdrop" role="presentation">
      <section className="tutorial-card" role="dialog" aria-modal="true" aria-label="How to play Moment Grid">
        <div className="tutorial-top">
          <span>First match briefing</span>
          <button type="button" onClick={onClose}>
            Skip
          </button>
        </div>
        <div className="tutorial-visual">
          <span className="tutorial-orbit" />
          <div>
            <Icon size={38} />
          </div>
        </div>
        <span className="step-label">{current.tag}</span>
        <h2>{current.title}</h2>
        <p>{current.copy}</p>
        <div className="tutorial-dots" aria-label={`Tutorial step ${step + 1} of ${steps.length}`}>
          {steps.map((_, index) => (
            <i className={index <= step ? "is-active" : ""} key={index} />
          ))}
        </div>
        <button className="primary-button" type="button" onClick={next}>
          {last ? "Start calling" : "Next"}
          <ChevronRight size={18} />
        </button>
      </section>
    </div>
  );
}
