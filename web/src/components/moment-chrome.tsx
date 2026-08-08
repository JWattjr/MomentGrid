"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDot, HelpCircle, Volume2, VolumeX } from "lucide-react";
import { WalletButton } from "./wallet-button";

const NAV_ITEMS = [
  { href: "/", label: "Play" },
  { href: "/leaderboard", label: "Ranks" },
  { href: "/fragments", label: "Fragments" },
  { href: "/rules", label: "Rules" },
] as const;

export function MomentHeader({ feedbackEnabled, onOpenTutorial, onToggleFeedback }: { feedbackEnabled?: boolean; onOpenTutorial?: () => void; onToggleFeedback?: () => void }) {
  return (
    <header className="app-header">
      <Link className="wordmark" href="/" aria-label="Moment Grid home">
        <span className="wordmark-mark"><CircleDot size={16} /></span>
        MOMENT<span>GRID</span>
      </Link>
      <div className="header-actions">
        {onOpenTutorial && <button className="feedback-toggle" type="button" onClick={onOpenTutorial} aria-label="Open how-to-play tutorial" title="How to play"><HelpCircle size={14} /></button>}
        {onToggleFeedback && (
          <button className="feedback-toggle" type="button" onClick={onToggleFeedback} aria-label={`${feedbackEnabled ? "Disable" : "Enable"} game sound and vibration`} title="Sound and vibration">
            {feedbackEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        )}
        <WalletButton />
      </div>
    </header>
  );
}

export function MomentNav() {
  const pathname = usePathname();

  return (
    <nav className="moment-nav" aria-label="Moment Grid pages">
      {NAV_ITEMS.map((item, index) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link className={active ? "is-active" : ""} href={item.href} key={item.href}>
            <span>0{index + 1}</span>{item.label}
          </Link>
        );
      })}
    </nav>
  );
}
