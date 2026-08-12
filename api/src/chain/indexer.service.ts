import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Log } from "viem";
import { AppConfig, CONFIG } from "../config/configuration";
import { PlayersService } from "../players/players.service";
import { RoundsService } from "../rounds/rounds.service";
import { ChainService } from "./chain.service";
import { projectLog, Projection } from "./log-projection";
import { IndexerCheckpoint, IndexerCheckpointDocument } from "./schemas/indexer-checkpoint.schema";

const CHECKPOINT_KEY = "moment-grid-events";

/// Public RPCs cap `eth_getLogs` ranges. Stay well under the common 10k limit.
const MAX_BLOCK_SPAN = 2_000n;

/// Base blocks are ~2s, so this is a handful of blocks behind at worst.
const POLL_INTERVAL_MS = 8_000;

/// Projects contract events into the read models the UI reads.
///
/// Polls `eth_getLogs` over explicit block ranges and persists how far it has
/// read, so a restart resumes exactly where it stopped. The contract stays the
/// source of truth; everything here is derived and can be rebuilt by resetting
/// the checkpoint.
@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;
  private warnedAboutCheckpoint = false;

  constructor(
    private readonly chain: ChainService,
    private readonly rounds: RoundsService,
    private readonly players: PlayersService,
    @InjectModel(IndexerCheckpoint.name)
    private readonly checkpointModel: Model<IndexerCheckpointDocument>,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (!this.chain.isConfigured) {
      this.logger.warn("Chain not configured - leaderboard and fragment projections stay empty.");
      return;
    }

    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    void this.tick();
    this.logger.log("Indexing MomentGrid events");
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /// One polling pass. Overlapping runs are skipped rather than queued: a slow
  /// batch must not stack up behind the interval.
  private async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;

    try {
      const head = await this.chain.latestBlock();
      let cursor = await this.readCheckpoint(head);

      while (cursor < head && !this.stopped) {
        const to = cursor + MAX_BLOCK_SPAN > head ? head : cursor + MAX_BLOCK_SPAN;
        const logs = await this.chain.getGameEvents(cursor + 1n, to);

        if (logs.length > 0) {
          await this.handle(logs);
          this.logger.log(`Indexed ${logs.length} event(s) in blocks ${cursor + 1n}-${to}`);
        }

        await this.writeCheckpoint(to);
        cursor = to;
      }
    } catch (error) {
      this.logger.error(`Indexing pass failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.running = false;
    }
  }

  /// First run starts at INDEXER_START_BLOCK when set, otherwise at the current
  /// head — scanning an entire chain from genesis would be pointless and slow.
  private async readCheckpoint(head: bigint): Promise<bigint> {
    const existing = await this.checkpointModel.findOne({ key: CHECKPOINT_KEY }).exec();

    if (existing) {
      const lastBlock = BigInt(existing.lastBlock);
      const configured = this.config.indexerStartBlock;

      // A stored checkpoint always wins, which makes `INDEXER_START_BLOCK` look
      // like it does nothing after the first run. That silence has already cost
      // one round: the indexer first ran between a round being created and a
      // grid being submitted, so `RoundCreated` was never projected and the
      // round is permanently missing from the read models. Say so out loud.
      // Once per process, not once per pass: this polls every few seconds and
      // a repeating warning would bury everything else in the log.
      if (configured !== undefined && lastBlock > BigInt(configured) && !this.warnedAboutCheckpoint) {
        this.warnedAboutCheckpoint = true;
        this.logger.warn(
          `INDEXER_START_BLOCK=${configured} is being ignored: a checkpoint already exists at block ${lastBlock}. ` +
            `To re-index from ${configured}, delete the "${CHECKPOINT_KEY}" document from the indexer_checkpoints collection and restart.`,
        );
      }
      return lastBlock;
    }

    const start = this.config.indexerStartBlock !== undefined ? BigInt(this.config.indexerStartBlock) : head;
    const from = start > 0n ? start - 1n : 0n;
    await this.writeCheckpoint(from);

    if (this.config.indexerStartBlock === undefined) {
      this.logger.warn(
        `Indexer starting at the chain head (block ${from + 1n}). Events already on chain will not be indexed - ` +
          `set INDEXER_START_BLOCK to the deployment block to backfill.`,
      );
    } else {
      this.logger.log(`Indexer starting at block ${from + 1n}`);
    }
    return from;
  }

  private async writeCheckpoint(block: bigint): Promise<void> {
    await this.checkpointModel
      .updateOne({ key: CHECKPOINT_KEY }, { $set: { lastBlock: Number(block) } }, { upsert: true })
      .exec();
  }

  private async handle(logs: Log[]): Promise<void> {
    for (const log of logs) {
      const decoded = log as unknown as {
        eventName?: string;
        args?: Record<string, unknown>;
        transactionHash?: string;
      };

      for (const projection of projectLog(decoded)) {
        await this.apply(projection);
      }
    }
  }

  /// Writes one decoded change. Decoding lives in `projectLog`, which is pure
  /// and unit-tested; this only knows how to persist.
  private async apply(projection: Projection): Promise<void> {
    switch (projection.kind) {
      case "round":
        await this.rounds.upsertRound(projection.roundId, projection.patch);
        return;

      case "submission":
        await this.rounds.recordSubmission(projection.roundId, projection.player, projection.txHash);
        return;

      case "score":
        await this.rounds.recordScore(projection.roundId, projection.player, projection.score);
        return;

      case "payout":
        await this.rounds.recordPayout(projection.roundId, projection.player, {
          payoutAmount: projection.amount,
          refunded: projection.refund,
        });
        return;

      case "playerSync":
        await this.syncPlayer(projection.player);
        return;
    }
  }

  /// Refreshes one player's totals from the contract. A failure here must not
  /// abandon the rest of the batch — the next pass will pick it up.
  private async syncPlayer(player: string): Promise<void> {
    try {
      const totals = await this.chain.playerTotals(player as `0x${string}`);
      await this.players.setTotals(player, totals);
    } catch (error) {
      this.logger.warn(`Could not refresh totals for ${player}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
