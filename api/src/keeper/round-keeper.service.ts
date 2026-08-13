import { ConflictException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ChainService } from "../chain/chain.service";
import { AppConfig, CONFIG } from "../config/configuration";
import { MatchService } from "../match/match.service";
import { SettlementService } from "../settlement/settlement.service";
import { KeeperTask, KeeperTaskDocument } from "./schemas/keeper-task.schema";

/// Drives a demo round from kickoff to payout without human intervention.
///
/// The keeper automatically ensures an active round exists on chain. On boot or
/// after settlement, if no open/locked round is active, it calls `createRound`
/// on-chain to open a fresh round.
///
/// It polls rather than hooking `MatchService.start`, for three reasons: the
/// dependency runs the other way (the keeper needs the match service, not the
/// reverse), polling also catches a match started by a script rather than the
/// browser, and it survives an API restart mid-match — a fired-and-missed hook
/// would leave the round stuck forever.
///
/// Every decision is made from observed state, never from remembered state, so
/// a restart re-derives what to do from the chain and the match record.

export const ROUND_STATE = { open: 0, locked: 1, settled: 2 } as const;

export type KeeperStatus = {
  enabled: boolean;
  roundId: number | null;
  lastTick: string | null;
  lastAction: string | null;
  lastError: string | null;
  settlementAttempts: number;
};

@Injectable()
export class RoundKeeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoundKeeperService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;
  private settlementAttempts = 0;
  private lastTick: Date | null = null;
  private lastAction: string | null = null;
  private lastError: string | null = null;

  /// The round the keeper is currently watching. Discovered from chain at
  /// startup or automatically created when none exists.
  private roundId: number | undefined;
  private botReadyRound: number | undefined;

  constructor(
    private readonly chain: ChainService,
    private readonly matches: MatchService,
    private readonly settlement: SettlementService,
    @InjectModel(KeeperTask.name) private readonly taskModel: Model<KeeperTaskDocument>,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    const { automationEnabled, pollMs } = this.config.keeper;

    if (!automationEnabled) {
      this.logger.log("Keeper automation is disabled (KEEPER_AUTOMATION_ENABLED=false).");
      return;
    }
    if (!this.chain.isConfigured) {
      this.logger.warn("Chain not configured - the keeper cannot lock or settle.");
      return;
    }

    try {
      await this.ensureActiveRound();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to discover or create initial round: ${message}. Will retry on tick.`);
    }

    this.timer = setInterval(() => void this.tick(), pollMs);
    void this.tick();
    this.logger.log(`Keeper polling every ${pollMs}ms`);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  status(): KeeperStatus {
    return {
      enabled: this.config.keeper.automationEnabled && this.timer !== undefined,
      roundId: this.roundId ?? null,
      lastTick: this.lastTick?.toISOString() ?? null,
      lastAction: this.lastAction,
      lastError: this.lastError,
      settlementAttempts: this.settlementAttempts,
    };
  }

  /// Ensures an open or locked round exists. If none exists (or the latest is
  /// settled), it auto-creates a new round on chain.
  private async ensureActiveRound(): Promise<void> {
    const latestRound = await this.chain.latestRoundId();

    if (latestRound === 0n) {
      this.logger.log("No rounds exist on chain yet - auto-creating round 1.");
      await this.autoCreateRound(0);
      return;
    }

    const roundId = Number(latestRound);
    const round = await this.chain.roundSnapshot(latestRound);

    if (round.state === ROUND_STATE.settled) {
      this.logger.log(`Round ${roundId} is settled - auto-creating a new round.`);
      await this.autoCreateRound(roundId);
    } else {
      this.roundId = roundId;
      if (round.state === ROUND_STATE.open) await this.ensureBot(roundId);
      this.logger.log(`Discovered active round ${this.roundId} (state ${round.state}).`);
    }
  }

  /// Automatically creates a round on-chain using the keeper private key.
  /// Uses a MongoDB lock so only one API process creates a round if clustered.
  private async autoCreateRound(prevRoundId?: number): Promise<void> {
    const key = `create-round:${prevRoundId ?? 0}`;
    if (!(await this.claim(key))) return;

    try {
      this.logger.log("Auto-creating new round on-chain...");
      const { roundId, txHash } = await this.chain.createRound();
      this.roundId = Number(roundId);
      await this.ensureBot(this.roundId);
      await this.taskModel
        .updateOne({ key }, { $set: { status: "complete", txHash, finishedAt: new Date() } })
        .exec();

      this.settlementAttempts = 0;
      this.lastAction = `created round ${this.roundId}`;
      this.lastError = null;
      this.logger.log(`Automatically created round ${this.roundId} (${txHash})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      await this.taskModel
        .updateOne({ key }, { $set: { status: "failed", error: message, finishedAt: new Date() } })
        .exec();
      this.logger.error(`Automatic round creation failed: ${message}`);
    }
  }

  /// One decision pass. Overlapping runs are skipped rather than queued, so a
  /// settlement that outlasts the poll interval cannot stack up behind itself.
  async tick(): Promise<void> {
    if (this.running || this.stopped) return;

    this.running = true;
    this.lastTick = new Date();

    try {
      // If we don't have an active round yet, discover or auto-create one.
      if (this.roundId === undefined) {
        await this.ensureActiveRound();
      }

      if (this.roundId === undefined) return;

      const roundId = this.roundId;
      const [snapshot, round] = await Promise.all([
        this.matches.status(),
        this.chain.roundSnapshot(BigInt(roundId)),
      ]);

      // The tracked round may have been settled manually or by another API
      // instance after this keeper exhausted its own retries. Rediscover from
      // chain instead of remaining pinned to that terminal round forever; the
      // discovery path also makes sure the demo bot enters the active round.
      if (round.state === ROUND_STATE.settled) {
        this.roundId = undefined;
        this.settlementAttempts = 0;
        await this.ensureActiveRound();
        return;
      }

      if (round.state === ROUND_STATE.open && !(await this.ensureBot(roundId))) return;

      if (snapshot.phase === "running" && round.state === ROUND_STATE.open && round.entrantCount > 0) {
        await this.lock(roundId);
        return;
      }

      if (snapshot.phase === "complete" && round.state === ROUND_STATE.locked) {
        await this.settle(roundId);
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`Keeper pass failed: ${this.lastError}`);
    } finally {
      this.running = false;
    }
  }

  /// Bot entry is a prerequisite for the live demo. A missing bot mnemonic is
  /// only possible when chain automation is not configured (as in unit tests or
  /// guest mode); configured on-chain automation fails closed until the bot is
  /// actually present.
  private async ensureBot(roundId: number): Promise<boolean> {
    if (!this.config.chain?.demoBotMnemonic) return true;
    if (this.botReadyRound === roundId) return true;

    try {
      await this.chain.seedDemoBot(BigInt(roundId));
      this.botReadyRound = roundId;
      this.lastAction = `seeded bot into round ${roundId}`;
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`Seeding bot into round ${roundId} failed: ${this.lastError}`);
      return false;
    }
  }

  /// Locking closes entry, so it must not happen before anyone has entered —
  /// an empty round would revert `NoEntrants` and, worse, a round locked early
  /// shuts the player out of their own demo.
  private async lock(roundId: number): Promise<void> {
    const key = `lock:${roundId}`;
    if (!(await this.claim(key))) return;

    try {
      const txHash = await this.chain.lockRound(BigInt(roundId));
      await this.taskModel
        .updateOne({ key }, { $set: { status: "complete", txHash, finishedAt: new Date() } })
        .exec();
      this.lastAction = `locked round ${roundId}`;
      this.lastError = null;
      this.logger.log(`Locked round ${roundId} (${txHash})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      // A revert here usually means another instance won the race and the round
      // is already locked, which the next pass will observe. Leave the task
      // failed so it can be retried rather than blocking forever.
      await this.taskModel
        .updateOne({ key }, { $set: { status: "failed", error: message, finishedAt: new Date() } })
        .exec();
      this.logger.error(`Locking round ${roundId} failed: ${message}`);
    }
  }

  private async settle(roundId: number): Promise<void> {
    if (this.settlementAttempts >= this.config.keeper.maxRetries) return;

    const existing = await this.settlement.jobFor(String(roundId));
    if (existing?.status === "complete" || existing?.status === "running") return;

    this.settlementAttempts += 1;
    this.lastAction = `settling round ${roundId} (attempt ${this.settlementAttempts})`;
    this.logger.log(this.lastAction);

    try {
      await this.settlement.settle(String(roundId));
      this.lastAction = `settled round ${roundId}`;
      this.lastError = null;
      this.logger.log(`Settled round ${roundId}`);

      // Check once for a new round after successful settlement, or auto-create one.
      await this.advanceAfterSettlement(roundId);
    } catch (error) {
      if (error instanceof ConflictException) {
        // Another instance or a manual trigger got there first. Not a failure,
        // and emphatically not something to retry.
        this.settlementAttempts -= 1;
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.logger.error(`Settling round ${roundId} failed: ${message}`);

      if (this.settlementAttempts >= this.config.keeper.maxRetries) {
        this.logger.error(
          `Giving up on round ${roundId} after ${this.settlementAttempts} attempt(s). ` +
            `Inspect GET /settlement/${roundId} and retry manually.`,
        );
      }
    }
  }

  /// After settling, check chain once for a newer round. If `roundCount` has
  /// advanced past the round we just settled, move on. Otherwise auto-create a
  /// fresh open round.
  private async advanceAfterSettlement(settledRound: number): Promise<void> {
    try {
      const latestRound = Number(await this.chain.latestRoundId());
      if (latestRound > settledRound) {
        const round = await this.chain.roundSnapshot(BigInt(latestRound));
        if (round.state !== ROUND_STATE.settled) {
          this.roundId = latestRound;
          this.settlementAttempts = 0;
          this.logger.log(`Advanced to existing round ${latestRound} after settling round ${settledRound}.`);
          return;
        }
      }
      // Auto-create a fresh open round since no active open round exists.
      await this.autoCreateRound(settledRound);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not check for or create a new round after settling: ${message}`);
      // Clear so future ticks retry discovery/creation.
      this.roundId = undefined;
    }
  }

  /// Claims a one-shot task. The unique index on `key` does the work: a second
  /// caller gets a duplicate-key error and backs off, however many instances
  /// are running.
  private async claim(key: string): Promise<boolean> {
    const existing = await this.taskModel.findOne({ key }).exec();
    if (existing?.status === "complete" || existing?.status === "running") return false;

    if (existing?.status === "failed") {
      if (existing.attempts >= this.config.keeper.maxRetries) return false;
      existing.status = "running";
      existing.error = null;
      existing.attempts += 1;
      await existing.save();
      return true;
    }

    try {
      await this.taskModel.create({ key, status: "running", attempts: 1 });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) return false;
      throw error;
    }
  }
}

const DUPLICATE_KEY = 11000;

/// Mongoose surfaces the driver's duplicate-key error without re-exporting its
/// class, so identify it structurally rather than adding a direct `mongodb`
/// dependency just for an `instanceof`. Mirrors `SettlementService`.
const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === DUPLICATE_KEY;
