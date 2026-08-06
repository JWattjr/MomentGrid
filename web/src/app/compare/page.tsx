import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Moment Grid — Design comparison",
  description: "Compare the original Moment Grid direction with a builder-club layout in an original stadium-night palette.",
};

export default function ComparePage() {
  return (
    <main className="compare-stage">
      <header className="compare-header">
        <div><span>Moment Grid</span><strong>Design comparison</strong></div>
        <p>Same game and interactions. Two visual languages.</p>
      </header>
      <section className="compare-grid">
        <article className="compare-panel">
          <div className="compare-label"><span>01</span><div><strong>Tournament poster</strong><small>Archived direction</small></div><a href="/poster" target="_blank">Open ↗</a></div>
          <iframe title="Archived Moment Grid design" src="/poster" />
        </article>
        <article className="compare-panel club-panel">
          <div className="compare-label"><span>02</span><div><strong>Builder club</strong><small>Selected direction</small></div><a href="/" target="_blank">Open ↗</a></div>
          <iframe title="Selected Moment Grid design" src="/" />
        </article>
      </section>
    </main>
  );
}
