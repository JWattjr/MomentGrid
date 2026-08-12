import { ConflictException, Injectable, Logger, UnprocessableEntityException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { eventsToWindowBitmaps, MatchEvent } from "@moment-grid/scoring";
import { Model } from "mongoose";
import { Address, isAddress } from "viem";
import { ChainService, EventWindows } from "../chain/chain.service";
import { MatchService } from "../match/match.service";
import { SettlementJob, SettlementJobDocument } from "./schemas/settlement-job.schema";

const DUPLICATE_KEY = 11000;

/// Mongoose surfaces the driver's duplicate-key error without re-exporting its
/// class, so identify it structurally rather than adding a direct `mongodb`
/// dependency just for an `instanceof`.
const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === DUPLICATE_KEY;

export type SettlementResult = {
  roundId: string;
  status: "complete";
  eventsByWindow: string[];
  players: string[];
  transactions: string[];
};

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @InjectModel(SettlementJob.name) private readonly jobModel: Model<SettlementJobDocument>,
    private readonly chain: ChainService,
    private readonly matches: MatchService,
  ) {}

  /// Derives the three window bitmaps from the authoritative match record.
  ///
  /// Deliberately not a request parameter. The previous implementation accepted
  /// `eventsByWindow` from the caller, which let anyone holding the keeper
  /// secret settle a round against a fabricated result.
  async deriveWindows(matchId?: string): Promise<{ events: MatchEvent[]; windows: EventWindows }> {
    const { complete, events } = await this.matches.finalEvents(matchId);
    if (!complete) {
      throw new UnprocessableEntityException("The match has not finished; refusing to settle a live round.");
    }
    return { events, windows: eventsToWindowBitmaps(events) };
  }

  /// Claims the settlement lock for a round.
  ///
  /// The unique index on `roundId` does the work: a second concurrent caller
  /// gets a duplicate-key error and is rejected, regardless of how many API
  /// instances are running. A previously failed job may be retried.
  private async claim(roundId: string, windows: EventWindows): Promise<SettlementJobDocument> {
    const existing = await this.jobModel.findOne({ roundId }).exec();

    if (existing?.status === "complete") {
      throw new ConflictException(`Round ${roundId} has already been settled.`);
    }
    if (existing?.status === "running") {
      throw new ConflictException(`A settlement for round ${roundId} is already running.`);
    }
    if (existing?.status === "failed") {
      existing.status = "running";
      existing.stage = "scoring";
      existing.error = null;
      existing.transactions = [];
      existing.playersResolved = 0;
      existing.eventsByWindow = windows.map(String);
      return existing.save();
    }

    try {
      return await this.jobModel.create({
        roundId,
        status: "running",
        eventsByWindow: windows.map(String),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(`A settlement for round ${roundId} is already running.`);
      }
      throw error;
    }
  }

  async settle(roundIdInput: string, matchId?: string): Promise<SettlementResult> {
    const roundId = this.parseRoundId(roundIdInput);
    const { windows } = await this.deriveWindows(matchId);
    const job = await this.claim(roundIdInput, windows);

    try {
      const players = await this.chain.entrantsOf(roundId);
      if (players.length === 0) {
        throw new UnprocessableEntityException(`Round ${roundIdInput} has no entrants.`);
      }
      this.assertAddresses(players);

      // Stage is written between steps so the reward screen can show what is
      // happening during the Inco round-trip instead of an opaque spinner.
      job.stage = "scoring";
      job.playersTotal = players.length;
      job.playersResolved = 0;
      job.startedAt = new Date();
      await job.save();

      const transactions: string[] = [];
      for (const player of players) {
        transactions.push(...(await this.chain.resolvePlayerScore(roundId, player, windows)));
        job.stage = "revealing";
        job.playersResolved += 1;
        job.transactions = transactions;
        await job.save();
      }

      job.stage = "settling";
      await job.save();

      transactions.push(await this.chain.settleRound(roundId, windows));

      job.status = "complete";
      job.stage = "complete";
      job.players = players;
      job.transactions = transactions;
      job.finishedAt = new Date();
      await job.save();

      this.logger.log(`Settled round ${roundIdInput} for ${players.length} players`);
      return {
        roundId: roundIdInput,
        status: "complete",
        eventsByWindow: windows.map(String),
        players,
        transactions,
      };
    } catch (error) {
      job.status = "failed";
      job.stage = "failed";
      job.error = error instanceof Error ? error.message : "Settlement failed.";
      job.finishedAt = new Date();
      await job.save();
      throw error;
    }
  }

  async jobFor(roundId: string): Promise<SettlementJobDocument | null> {
    return this.jobModel.findOne({ roundId }).exec();
  }

  private parseRoundId(roundId: string): bigint {
    let parsed: bigint;
    try {
      parsed = BigInt(roundId);
    } catch {
      throw new UnprocessableEntityException(`Round id "${roundId}" is not an integer.`);
    }
    if (parsed <= 0n) throw new UnprocessableEntityException("Round ids start at 1.");
    return parsed;
  }

  private assertAddresses(players: string[]): asserts players is Address[] {
    const invalid = players.filter((player) => !isAddress(player));
    if (invalid.length > 0) {
      throw new UnprocessableEntityException(`Round contains malformed entrant addresses: ${invalid.join(", ")}`);
    }
  }
}
