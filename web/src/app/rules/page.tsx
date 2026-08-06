import type { Metadata } from "next";
import { EyeOff, Grid3X3, Puzzle, ShieldCheck, Ticket, Trophy } from "lucide-react";
import { PrototypeShell } from "@/components/prototype-shell";

export const metadata: Metadata = {
  title: "How to play — Moment Grid",
  description: "The exact Moment Grid rules in five quick steps.",
};

const STEPS = [
  { n: "01", title: "Build nine calls", copy: "Fill every cell. Columns cover 0–30′, 30–60′, and 60–90+′. Each row uses its own rarity pool.", icon: Grid3X3 },
  { n: "02", title: "Lock privately", copy: "Seal the grid before kickoff. Other players cannot copy your calls while the match unfolds.", icon: EyeOff },
  { n: "03", title: "Complete lines", copy: "A marked row, column, or diagonal is a line. There are eight possible lines and every line scores equally.", icon: Trophy },
  { n: "04", title: "Collect fragments", copy: "Each completed line earns one persistent fragment. Four fragments unlock a Megapot ticket purchase.", icon: Puzzle },
] as const;

export default function RulesPage() {
  return (
    <PrototypeShell eyebrow="Rules · 90 second read" title="Call. Lock. Reveal." intro="Prediction bingo for a full football match. Simple enough to understand before kickoff, tense enough to watch for 90 minutes.">
      <section className="rules-grid-demo" aria-label="Three by three grid with winning lines">
        {Array.from({ length: 9 }, (_, cell) => <i className={cell === 0 || cell === 4 || cell === 8 ? "is-line" : ""} key={cell}>{cell === 0 || cell === 4 || cell === 8 ? "✓" : "·"}</i>)}
        <span>8 possible lines</span>
      </section>

      <section className="rules-list">
        {STEPS.map(({ n, title, copy, icon: Icon }) => (
          <article key={n}>
            <span>{n}</span>
            <div className="rule-icon"><Icon size={17} /></div>
            <div><strong>{title}</strong><p>{copy}</p></div>
          </article>
        ))}
      </section>

      <section className="winning-rule"><Trophy size={18} /><div><span>Pot rule</span><strong>Most completed lines wins.</strong><p>Ties split the pot evenly. No multipliers and no per-line weighting.</p></div></section>

      <section className="chain-native-rule">
        <header><ShieldCheck size={18} /><div><span>Why onchain</span><strong>Privacy changes the game.</strong></div></header>
        <p>Inco keeps every grid confidential so nobody can copy a strong player before reveal. Encrypted scoring publishes only the result.</p>
        <div><span><Puzzle size={14} /> Every line earns a fragment</span><i>→</i><span><Ticket size={14} /> Four buy a Megapot ticket</span></div>
      </section>
    </PrototypeShell>
  );
}
