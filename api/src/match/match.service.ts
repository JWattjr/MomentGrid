import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import {
  LiveFeedSource,
  MatchEvent,
  MatchSnapshot,
  ReplayClock,
  replayMatchEvents,
} from "@moment-grid/scoring";
import { Model } from "mongoose";
import { AppConfig, CONFIG } from "../config/configuration";
import { Match, MatchDocument } from "./schemas/match.schema";

export const DEFAULT_MATCH_ID = "demo";

const MIN_DURATION_SECONDS = 15;
const MAX_DURATION_SECONDS = 600;

/// Owns the authoritative match record.
///
/// Note what is *not* here: an in-memory clock. `ReplayClock` is reconstructed
/// per request from the persisted `startedAt`, which is why two API instances
/// can never disagree about the current minute — the old Next.js route kept the
/// clock on `globalThis` and desynced the moment it scaled past one lambda.
@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);
  private readonly liveFeed?: LiveFeedSource;

  constructor(
    @InjectModel(Match.name) private readonly matchModel: Model<MatchDocument>,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {
    if (config.liveFeedUrl) {
      this.liveFeed = new LiveFeedSource({ endpoint: config.liveFeedUrl, apiKey: config.liveFeedApiKey });
    }
  }

  private clampDuration(seconds: number): number {
    if (!Number.isFinite(seconds)) return this.config.replaySeconds;
    return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.floor(seconds)));
  }

  private async record(matchId: string): Promise<MatchDocument> {
    const existing = await this.matchModel.findOne({ matchId }).exec();
    if (existing) return existing;

    return this.matchModel.create({
      matchId,
      source: this.liveFeed ? "live" : "replay",
      startedAt: null,
      durationMs: this.config.replaySeconds * 1000,
      events: replayMatchEvents(),
      phase: "idle",
    });
  }

  async status(matchId = DEFAULT_MATCH_ID): Promise<MatchSnapshot> {
    const match = await this.record(matchId);

    if (match.source === "live" && this.liveFeed) {
      if (match.phase === "idle") return this.snapshotFor(match);
      const snapshot = await this.liveFeed.status();
      await this.persistPhase(match, snapshot);
      return snapshot;
    }

    const snapshot = this.snapshotFor(match);
    await this.persistPhase(match, snapshot);
    return snapshot;
  }

  async start(matchId = DEFAULT_MATCH_ID, durationSeconds?: number): Promise<MatchSnapshot> {
    const match = await this.record(matchId);
    const durationMs = this.clampDuration(durationSeconds ?? this.config.replaySeconds) * 1000;

    match.startedAt = Date.now();
    match.durationMs = durationMs;
    match.phase = "running";
    await match.save();

    if (match.source === "live" && this.liveFeed) await this.liveFeed.start();
    this.logger.log(`Match ${matchId} started (${durationMs / 1000}s replay)`);
    return this.status(matchId);
  }

  async reset(matchId = DEFAULT_MATCH_ID): Promise<MatchSnapshot> {
    const match = await this.record(matchId);
    match.startedAt = null;
    match.phase = "idle";
    await match.save();

    if (match.source === "live" && this.liveFeed) await this.liveFeed.reset();
    this.logger.log(`Match ${matchId} reset`);
    return this.snapshotFor(match);
  }

  /// The events a settlement must score against: the full fixture once the
  /// match has finished, never a partial view.
  async finalEvents(matchId = DEFAULT_MATCH_ID): Promise<{ complete: boolean; events: MatchEvent[] }> {
    const snapshot = await this.status(matchId);
    return { complete: snapshot.phase === "complete", events: snapshot.events };
  }

  private snapshotFor(match: MatchDocument): MatchSnapshot {
    const events = match.events.map((event) => ({
      minute: event.minute,
      eventType: event.eventType,
      ...(event.team ? { team: event.team } : {}),
    })) as MatchEvent[];

    return new ReplayClock(events, match.durationMs).resumeFrom(match.startedAt).status();
  }

  private async persistPhase(match: MatchDocument, snapshot: MatchSnapshot): Promise<void> {
    if (match.phase === snapshot.phase) return;
    match.phase = snapshot.phase;
    await match.save();
  }
}
