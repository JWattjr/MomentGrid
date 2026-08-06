import type { Metadata } from "next";
import { Puzzle, Ticket, Zap } from "lucide-react";
import { PrototypeShell } from "@/components/prototype-shell";

export const metadata: Metadata = {
  title: "Fragments — Moment Grid",
  description: "Preview Moment Grid fragment progress and Megapot tickets.",
};

export default function FragmentsPage() {
  return (
    <PrototypeShell eyebrow="Core loop · Megapot" title="Every line builds a ticket." intro="The jackpot is not a side quest. Every grid advances the same play → line → fragment → ticket loop.">
      <section className="megapot-loop" aria-label="Megapot gameplay loop">
        <div><b>Play</b><small>secret grid</small></div><i>→</i>
        <div><b>Line</b><small>complete any 3</small></div><i>→</i>
        <div><b>+1</b><small>fragment</small></div><i>→</i>
        <div className="is-ticket"><b>Ticket</b><small>at 4 / 4</small></div><i>↺</i>
      </section>
      <section className="fragment-hero">
        <div className="fragment-orbit"><Puzzle size={31} /><span>+1</span></div>
        <div><span>Fragment balance</span><strong>3 <small>/ 4</small></strong><p>One more completed line unlocks your next ticket.</p></div>
      </section>

      <section className="ticket-progress-card">
        <header><span>Next Megapot ticket</span><b>75%</b></header>
        <div className="ticket-slots" aria-label="Three of four fragments collected">
          {[0, 1, 2, 3].map((slot) => <i className={slot < 3 ? "filled" : ""} key={slot}>{slot < 3 ? <Puzzle size={15} /> : <span>04</span>}</i>)}
        </div>
        <div className="progress-copy"><Zap size={14} /><span>Fragments carry over between rounds.</span></div>
        <button className="primary-button" disabled><Ticket size={17} /> 1 fragment remaining</button>
      </section>

      <section className="reward-ledger">
        <header><span>Recent earnings</span><small>Replay demo</small></header>
        <div><span><i>R1</i><b>Round 01</b><small>2 lines completed</small></span><strong>+2</strong></div>
        <div><span><i>R0</i><b>Practice round</b><small>1 line completed</small></span><strong>+1</strong></div>
      </section>

      <p className="prototype-caption">Playable demo balances persist locally. The contract mirrors the same rule and purchases through Megapot after four fragments.</p>
    </PrototypeShell>
  );
}
