import type { Metadata } from "next";
import { Crown, LockKeyhole, Trophy } from "lucide-react";
import { PrototypeShell } from "@/components/prototype-shell";

export const metadata: Metadata = {
  title: "Round leaderboard — Moment Grid",
  description: "A visual preview of the single-round Moment Grid standings.",
};

const PLAYERS = [
  { rank: 1, name: "0x7A…19F", lines: 4, fragments: 4, tone: "lime" },
  { rank: 2, name: "0x2C…8B1", lines: 3, fragments: 3, tone: "blue" },
  { rank: 3, name: "0x91…D40", lines: 2, fragments: 2, tone: "pink" },
  { rank: 4, name: "You", lines: 2, fragments: 2, tone: "paper" },
  { rank: 5, name: "0x5E…A22", lines: 1, fragments: 1, tone: "paper" },
];

export default function LeaderboardPage() {
  return (
    <PrototypeShell eyebrow="Round 01 · Visual preview" title="Best calls win." intro="Standings appear after reveal. Only completed lines matter; tied winners split the pot evenly.">
      <section className="round-summary">
        <div><span>Replay round</span><strong>ARS <i>vs</i> CHE</strong></div>
        <div className="round-state"><LockKeyhole size={12} /> Final</div>
      </section>

      <section className="podium" aria-label="Top three players">
        <div className="podium-place place-two"><span>02</span><strong>0x2C…8B1</strong><b>3 lines</b></div>
        <div className="podium-place place-one"><Crown size={17} /><span>01</span><strong>0x7A…19F</strong><b>4 lines</b></div>
        <div className="podium-place place-three"><span>03</span><strong>0x91…D40</strong><b>2 lines</b></div>
      </section>

      <section className="rank-card">
        <header><span>Rank</span><span>Player</span><span>Lines</span><span>Fragments</span></header>
        {PLAYERS.map((player) => (
          <div className={player.name === "You" ? "is-you" : ""} key={player.rank}>
            <b>#{String(player.rank).padStart(2, "0")}</b>
            <strong><i className={`avatar-dot tone-${player.tone}`} />{player.name}</strong>
            <span>{player.lines}</span>
            <span>+{player.fragments}</span>
          </div>
        ))}
      </section>

      <div className="prototype-note"><Trophy size={15} /><span><strong>UI preview only.</strong> Your partner can connect settlement data after the core contract flow is ready.</span></div>
    </PrototypeShell>
  );
}
