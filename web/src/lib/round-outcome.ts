import { ENTRY_TOKEN_SYMBOL, formatUsdc } from "./usdc";

/// Turns a round outcome into the words on the reward screen.
///
/// Pure, and separate from the component, because this is the sentence the
/// whole demo exists to produce. A component can be eyeballed; this can be
/// tested against every branch, including the two that are easy to forget — a
/// split pot and a voided round both return the stake, and neither is a win.

export type PlayerResult = "pending" | "won" | "lost" | "tied" | "refunded" | "not-entered";

export type RoundOutcome = {
  roundId: string;
  state: "open" | "locked" | "settled";
  entryToken: string | null;
  entryFeeAmount: string;
  potAmount: string;
  entrantCount: number;
  winnerCount: number;
  highScore: number;
  player: {
    address: string;
    entered: boolean;
    completedLines: number | null;
    eligible: boolean | null;
    payoutAmount: string | null;
    claimableAmount: string;
    result: PlayerResult;
  };
  settlement: {
    status: string;
    stage: string;
    playersResolved: number;
    playersTotal: number;
    transactions: string[];
    error: string | null;
  } | null;
};

export type OutcomeTone = "won" | "lost" | "neutral" | "pending";

export type OutcomeView = {
  headline: string;
  subline: string;
  tone: OutcomeTone;
  /// The signed change in the player's balance across the round, formatted.
  /// Null when the round has not settled, since the answer is not known yet.
  netAmount: string | null;
  potAmount: string;
  showWithdraw: boolean;
};

const lines = (count: number | null): string => {
  if (count === null) return "no lines";
  return `${count} ${count === 1 ? "line" : "lines"}`;
};

export function outcomeToViewModel(outcome: RoundOutcome): OutcomeView {
  const { player } = outcome;
  const stake = outcome.entryFeeAmount || "0";
  const potAmount = formatUsdc(outcome.potAmount);
  const claimable = BigInt(player.claimableAmount || "0");

  if (player.result === "not-entered") {
    return {
      headline: "You did not enter this round",
      subline: `${outcome.entrantCount} ${outcome.entrantCount === 1 ? "player" : "players"} staked ${potAmount} ${ENTRY_TOKEN_SYMBOL}.`,
      tone: "neutral",
      netAmount: null,
      potAmount,
      showWithdraw: false,
    };
  }

  if (player.result === "pending") {
    return {
      headline: "Scoring your grid",
      subline: "Your picks are being scored while they stay encrypted.",
      tone: "pending",
      netAmount: null,
      potAmount,
      showWithdraw: false,
    };
  }

  const payout = BigInt(player.payoutAmount ?? "0");
  const net = payout - BigInt(stake);
  const netAmount = `${net >= 0n ? "+" : "−"}${formatUsdc(net < 0n ? -net : net)}`;

  if (player.result === "won") {
    return {
      headline: `You won ${formatUsdc(player.payoutAmount)} ${ENTRY_TOKEN_SYMBOL}`,
      subline: `Pot ${potAmount} · your ${lines(player.completedLines)} beat ${outcome.entrantCount - 1} ${outcome.entrantCount - 1 === 1 ? "entrant" : "entrants"}.`,
      tone: "won",
      netAmount,
      potAmount,
      showWithdraw: claimable > 0n,
    };
  }

  if (player.result === "tied") {
    return {
      headline: `Split pot · ${formatUsdc(player.payoutAmount)} ${ENTRY_TOKEN_SYMBOL} back`,
      subline: `${outcome.winnerCount} players tied on ${lines(outcome.highScore)}, so the pot divided evenly.`,
      tone: "neutral",
      netAmount,
      potAmount,
      showWithdraw: claimable > 0n,
    };
  }

  if (player.result === "refunded") {
    return {
      headline: `Round void · ${formatUsdc(player.payoutAmount)} ${ENTRY_TOKEN_SYMBOL} refunded`,
      subline: "No grid in this round qualified, so every stake was returned.",
      tone: "neutral",
      netAmount,
      potAmount,
      showWithdraw: claimable > 0n,
    };
  }

  // Lost. An ineligible grid is a different reason for the same result, and
  // worth saying, because otherwise a player who scored well is left confused
  // about why they were paid nothing.
  const ineligible = player.eligible === false;
  return {
    headline: `You lost your ${formatUsdc(stake)} ${ENTRY_TOKEN_SYMBOL} stake`,
    subline: ineligible
      ? "Your grid was rejected at scoring, so it could not win."
      : `Winning score was ${lines(outcome.highScore)} · you had ${lines(player.completedLines)}.`,
    tone: "lost",
    netAmount,
    potAmount,
    showWithdraw: claimable > 0n,
  };
}

/// The three stages a confidential settlement passes through, in order, with
/// the copy the progress display shows for each.
export const SETTLEMENT_STAGES = [
  { key: "scoring", label: "Scoring grids under encryption" },
  { key: "revealing", label: "Fetching attested reveal from Inco" },
  { key: "settling", label: "Settling the pot on chain" },
] as const;

export type StageState = "done" | "active" | "waiting" | "failed";

export function stageStates(stage: string | undefined, status: string | undefined): StageState[] {
  if (status === "failed") {
    return SETTLEMENT_STAGES.map((entry) => (entry.key === stage ? "failed" : "waiting"));
  }
  if (status === "complete" || stage === "complete") {
    return SETTLEMENT_STAGES.map(() => "done");
  }

  const activeIndex = SETTLEMENT_STAGES.findIndex((entry) => entry.key === stage);
  return SETTLEMENT_STAGES.map((_, index) => {
    if (activeIndex === -1) return "waiting";
    if (index < activeIndex) return "done";
    if (index === activeIndex) return "active";
    return "waiting";
  });
}
