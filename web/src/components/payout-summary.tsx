"use client";

import { Trophy, TrendingDown, Minus } from "lucide-react";
import { outcomeToViewModel, RoundOutcome } from "@/lib/round-outcome";
import { ENTRY_TOKEN_SYMBOL, formatUsdc } from "@/lib/usdc";

/// The sentence the whole demo exists to produce.
///
/// Everything here comes from the chain via the outcome endpoint — never from
/// the local `scoreGrid` result. The local score cannot know what anyone else
/// scored, and the old card said "Top score" to anyone with a single line
/// regardless of whether they had actually won anything.
export function PayoutSummary({ outcome }: { outcome: RoundOutcome }) {
  const view = outcomeToViewModel(outcome);
  const Icon = view.tone === "won" ? Trophy : view.tone === "lost" ? TrendingDown : Minus;

  return (
    <div className={`payout-card payout-${view.tone}`} role="status">
      <div className="payout-head">
        <span className="payout-icon">
          <Icon size={18} />
        </span>
        <div>
          <strong>{view.headline}</strong>
          <small>{view.subline}</small>
        </div>
      </div>

      <dl className="payout-figures">
        <div>
          <dt>Pot</dt>
          <dd>
            {view.potAmount} {ENTRY_TOKEN_SYMBOL}
          </dd>
        </div>
        <div>
          <dt>Your stake</dt>
          <dd>
            {formatUsdc(outcome.entryFeeAmount)} {ENTRY_TOKEN_SYMBOL}
          </dd>
        </div>
        <div>
          <dt>Entrants</dt>
          <dd>{outcome.entrantCount}</dd>
        </div>
        {view.netAmount && (
          <div className="payout-net">
            <dt>Net</dt>
            <dd>{view.netAmount}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
