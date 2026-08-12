import { Injectable, Logger } from "@nestjs/common";
import { Address } from "viem";
import { ChainService } from "../chain/chain.service";
import { SettlementService } from "../settlement/settlement.service";
import { RoundsService } from "./rounds.service";
import { EntryDocument } from "./schemas/entry.schema";
import { RoundDocument } from "./schemas/round.schema";

/// Answers "did I win, and how much" for one player in one round.
///
/// The result is derived here rather than in the browser so there is exactly
/// one place that decides what counts as a win. Settlement has three payout
/// shapes — a share of the pot, a returned stake when no grid qualified, and
/// nothing at all — and a client reimplementing that would eventually disagree
/// with the contract.

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

@Injectable()
export class RoundOutcomeService {
  private readonly logger = new Logger(RoundOutcomeService.name);

  constructor(
    private readonly rounds: RoundsService,
    private readonly chain: ChainService,
    private readonly settlement: SettlementService,
  ) {}

  async forPlayer(roundId: string, address: string): Promise<RoundOutcome> {
    const player = address.toLowerCase();
    const round = await this.rounds.find(roundId);
    const entries = await this.rounds.entries(roundId);
    const entry = entries.find((row) => row.player === player) ?? null;

    const claimableAmount = await this.readClaimable(address);
    const payoutAmount = await this.resolvePayout(round, entry, roundId, address);

    return {
      roundId,
      state: round.state,
      entryToken: round.entryToken,
      entryFeeAmount: round.entryFeeAmount,
      potAmount: round.potAmount,
      entrantCount: round.entrantCount,
      winnerCount: round.winnerCount,
      highScore: round.highScore,
      player: {
        address,
        entered: entry !== null,
        completedLines: entry?.completedLines ?? null,
        eligible: entry?.eligible ?? null,
        payoutAmount,
        claimableAmount,
        result: this.deriveResult(round, entry, payoutAmount),
      },
      settlement: await this.settlementProgress(roundId),
    };
  }

  /// Always read live: this is the number the withdraw button acts on, and it
  /// must be zero the instant a withdrawal confirms.
  private async readClaimable(address: string): Promise<string> {
    if (!this.chain.isConfigured) return "0";
    try {
      return String(await this.chain.claimableOf(address as Address));
    } catch (error) {
      this.logger.warn(`Could not read claimable for ${address}: ${describe(error)}`);
      return "0";
    }
  }

  /// The indexer polls every eight seconds, but the reward screen appears the
  /// moment settlement finishes. When the round is settled and the projection
  /// has not caught up, go straight to the contract rather than showing a
  /// blank payout card for the length of a polling interval.
  private async resolvePayout(
    round: RoundDocument,
    entry: EntryDocument | null,
    roundId: string,
    address: string,
  ): Promise<string | null> {
    if (entry?.payoutAmount != null) return entry.payoutAmount;
    if (round.state !== "settled" || !this.chain.isConfigured) return null;

    try {
      const outcome = await this.chain.roundOutcomeOf(BigInt(roundId), address as Address);
      return String(outcome.amount);
    } catch (error) {
      this.logger.warn(`Could not read on-chain outcome for ${address} in round ${roundId}: ${describe(error)}`);
      return null;
    }
  }

  private deriveResult(
    round: RoundDocument,
    entry: EntryDocument | null,
    payoutAmount: string | null,
  ): PlayerResult {
    if (!entry) return "not-entered";
    if (round.state !== "settled" || payoutAmount === null) return "pending";
    if (entry.refunded === true) return "refunded";

    const payout = BigInt(payoutAmount);
    if (payout === 0n) return "lost";

    // Winning back exactly the stake alongside other winners is a split pot,
    // which reads very differently to the player than an outright win.
    const stake = BigInt(round.entryFeeAmount || "0");
    if (payout === stake && round.winnerCount > 1) return "tied";
    return "won";
  }

  private async settlementProgress(roundId: string): Promise<RoundOutcome["settlement"]> {
    const job = await this.settlement.jobFor(roundId);
    if (!job) return null;
    return {
      status: job.status,
      stage: job.stage,
      playersResolved: job.playersResolved,
      playersTotal: job.playersTotal,
      transactions: job.transactions,
      error: job.error,
    };
  }
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));
