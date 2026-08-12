import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { TIER_POOLS } from "@moment-grid/scoring";
import { Model } from "mongoose";
import { Entry, EntryDocument } from "./schemas/entry.schema";
import { Round, RoundDocument } from "./schemas/round.schema";

const STATE_NAMES = ["open", "locked", "settled"] as const;

@Injectable()
export class RoundsService {
  constructor(
    @InjectModel(Round.name) private readonly roundModel: Model<RoundDocument>,
    @InjectModel(Entry.name) private readonly entryModel: Model<EntryDocument>,
  ) {}

  /// The `uint256[3]` a deployer must pass to `MomentGrid.createRound`,
  /// derived from the prediction set rather than typed by hand.
  tierPools(): string[] {
    return TIER_POOLS.map(String);
  }

  async find(roundId: string): Promise<RoundDocument> {
    const round = await this.roundModel.findOne({ roundId }).exec();
    if (!round) throw new NotFoundException(`Round ${roundId} is not indexed yet.`);
    return round;
  }

  async list(): Promise<RoundDocument[]> {
    return this.roundModel.find().sort({ roundId: -1 }).limit(25).exec();
  }

  async entries(roundId: string): Promise<EntryDocument[]> {
    return this.entryModel.find({ roundId }).exec();
  }

  async upsertRound(roundId: string, patch: Partial<Round>): Promise<void> {
    await this.roundModel.updateOne({ roundId }, { $set: patch }, { upsert: true }).exec();
  }

  async recordSubmission(roundId: string, player: string, txHash: string, gridHandle?: string): Promise<void> {
    await this.entryModel
      .updateOne(
        { roundId, player: player.toLowerCase() },
        { $set: { submitTxHash: txHash, ...(gridHandle ? { gridHandle } : {}) } },
        { upsert: true },
      )
      .exec();
  }

  async recordScore(
    roundId: string,
    player: string,
    score: { markedMask: number; completedLines: number; eligible: boolean },
  ): Promise<void> {
    await this.entryModel
      .updateOne({ roundId, player: player.toLowerCase() }, { $set: score }, { upsert: true })
      .exec();
  }

  /// Records what a settlement paid one player. Set rather than incremented, so
  /// re-indexing the same log cannot inflate a payout.
  async recordPayout(
    roundId: string,
    player: string,
    payout: { payoutAmount: string; refunded: boolean },
  ): Promise<void> {
    await this.entryModel
      .updateOne({ roundId, player: player.toLowerCase() }, { $set: payout }, { upsert: true })
      .exec();
  }

  stateName(state: number): (typeof STATE_NAMES)[number] {
    return STATE_NAMES[state] ?? "open";
  }
}
