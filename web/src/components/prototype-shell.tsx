import type { ReactNode } from "react";
import { MomentHeader, MomentNav } from "./moment-chrome";

export function PrototypeShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <main className="app-stage theme-club prototype-stage">
      <section className="phone-shell prototype-phone">
        <MomentHeader />
        <MomentNav />
        <div className="prototype-body">
          <header className="prototype-heading">
            <span className="step-label">{eyebrow}</span>
            <h1>{title}</h1>
            <p className="lede">{intro}</p>
          </header>
          {children}
        </div>
        <div className="home-indicator" />
      </section>
    </main>
  );
}
