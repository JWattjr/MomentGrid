import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Entry, EntryDocument } from "../rounds/schemas/entry.schema";
import { Player, PlayerDocument } from "./schemas/player.schema";

export type LeaderboardRow = {
  rank: number;
  address: string;
  completedLines: number;
  fragments: number;
};

export type PlayerSummary = {
  address: string;
  fragments: number;
  ticketsPurchased: number;
};

@Injectable()
export class PlayersService {
  constructor(
    @InjectModel(Player.name) private readonly playerModel: Model<PlayerDocument>,
    @InjectModel(Entry.name) private readonly entryModel: Model<EntryDocument>,
  ) {}

  async summary(address: string): Promise<PlayerSummary> {
    const normalized = address.toLowerCase();
    const player = await this.playerModel.findOne({ address: normalized }).exec();
    return {
      address: normalized,
      fragments: player?.fragments ?? 0,
      ticketsPurchased: player?.ticketsPurchased ?? 0,
    };
  }

  /// Standings for a settled round. Only scored entries appear, so a round
  /// still awaiting settlement returns an empty board rather than a
  /// half-populated one.
  async leaderboard(roundId: string): Promise<LeaderboardRow[]> {
    const entries = await this.entryModel
      .find({ roundId, completedLines: { $ne: null } })
      .sort({ completedLines: -1 })
      .lean()
      .exec();

    const addresses = entries.map((entry) => entry.player);
    const players = await this.playerModel.find({ address: { $in: addresses } }).lean().exec();
    const fragmentsByAddress = new Map(players.map((player) => [player.address, player.fragments]));

    return entries.map((entry, index) => ({
      rank: index + 1,
      address: entry.player,
      completedLines: entry.completedLines ?? 0,
      fragments: fragmentsByAddress.get(entry.player) ?? 0,
    }));
  }

  /// Overwrites a player's totals with the values read from the contract.
  ///
  /// Deliberately `$set`, not `$inc`: the indexer may replay the same log after
  /// a checkpoint reset, and an incrementing projection would silently inflate
  /// balances. The contract is the source of truth.
  async setTotals(address: string, totals: { fragments: number; ticketsPurchased: number }): Promise<void> {
    await this.playerModel
      .updateOne({ address: address.toLowerCase() }, { $set: totals }, { upsert: true })
      .exec();
  }
}
