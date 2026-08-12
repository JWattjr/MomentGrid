"use client";

import { RotateCcw, Share2, Sparkles, Ticket, Trophy } from "lucide-react";
import { useState } from "react";
import { MegapotClaimButton } from "../megapot-claim-button";
import { PayoutSummary } from "../payout-summary";
import { SettlementProgress } from "../settlement-progress";
import { UsdcBalanceBadge } from "../usdc-balance-badge";
import { WithdrawWinningsButton } from "../withdraw-winnings-button";
import { RoundOutcome } from "@/lib/round-outcome";
import { RewardLoop } from "./chrome";
import { EntryMode } from "./shared";

/// Where the round is finally worth something.
///
/// In an onchain round nothing here comes from the local score. The old card
/// read "Top score" for anyone with a single line, which was true of the
/// player's own grid and told them nothing about whether they had won. Now the
/// contract decides, and this displays it.
export function RewardScreen({
  completedLines,
  fragments,
  mode,
  outcome,
  outcomeError,
  balance,
  onRefresh,
  onAgain,
}: {
  completedLines: number;
  fragments: number;
  mode: EntryMode;
  outcome: RoundOutcome | null;
  outcomeError: string;
  balance: bigint | null;
  onRefresh: () => Promise<void>;
  onAgain: () => void;
}) {
  const ticketReady = fragments >= 4;
  const [shareStatus, setShareStatus] = useState("Share result");
  const settled = outcome?.state === "settled" && outcome.player.result !== "pending";

  const shareResult = async () => {
    const text = `I completed ${completedLines} ${completedLines === 1 ? "line" : "lines"} in Moment Grid and now have ${fragments}/4 Megapot fragments.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Moment Grid result", text, url: window.location.origin });
        setShareStatus("Shared!");
      } else {
        await navigator.clipboard.writeText(`${text} ${window.location.origin}`);
        setShareStatus("Copied!");
      }
    } catch {
      setShareStatus("Share result");
    }
  };

  return (
    <div className="screen-stack reward-screen">
      <div className="reward-burst">
        <span />
        <div>
          <Trophy size={36} />
        </div>
      </div>
      <div className="reward-copy">
        <span className="step-label">05 · Reward</span>
        <h1>{completedLines > 0 ? "Lines secured." : "Next call wins."}</h1>
        <p>
          {completedLines > 0
            ? `You completed ${completedLines} ${completedLines === 1 ? "line" : "lines"} across the match.`
            : "No complete line this time, but your fragment balance stays safe."}
        </p>
      </div>

      {mode === "onchain" ? (
        <div className="onchain-result">
          {settled && outcome ? (
            <>
              <PayoutSummary outcome={outcome} />
              <WithdrawWinningsButton
                claimableAmount={outcome.player.claimableAmount}
                onWithdrawn={onRefresh}
              />
              <UsdcBalanceBadge balance={balance} label="Wallet after settlement" />
            </>
          ) : (
            <SettlementProgress
              stage={outcome?.settlement?.stage}
              status={outcome?.settlement?.status}
              playersResolved={outcome?.settlement?.playersResolved}
              playersTotal={outcome?.settlement?.playersTotal}
              transactions={outcome?.settlement?.transactions}
              error={outcome?.settlement?.error ?? outcomeError}
            />
          )}
        </div>
      ) : (
        <div className="payout-card payout-neutral">
          <span>Practice run</span>
          <div>
            <strong>Nothing staked</strong>
            <small>Stake USDC on the lock screen to play for the pot.</small>
          </div>
        </div>
      )}

      <RewardLoop />
      <div className="fragment-card">
        <div className="fragment-top">
          <div>
            <span>Fragment vault</span>
            <strong>
              {fragments}
              <small> / 4</small>
            </strong>
          </div>
          <Ticket size={25} />
        </div>
        <div className="fragment-track">
          {[0, 1, 2, 3].map((slot) => (
            <i className={slot < Math.min(4, fragments) ? "filled" : ""} key={slot}>
              {slot < fragments ? <Sparkles size={13} /> : null}
            </i>
          ))}
        </div>
        <p>
          {ticketReady
            ? "Megapot ticket ready to purchase."
            : `${4 - fragments} more ${4 - fragments === 1 ? "fragment" : "fragments"} unlocks a Megapot ticket.`}
        </p>
        <MegapotClaimButton ready={ticketReady} />
      </div>

      <button className="share-result-button" type="button" onClick={shareResult}>
        <Share2 size={16} />
        {shareStatus}
      </button>
      <button className="primary-button" onClick={onAgain}>
        Build another grid <RotateCcw size={17} />
      </button>
    </div>
  );
}
