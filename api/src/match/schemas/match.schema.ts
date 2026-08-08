import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { MATCH_EVENT_TYPES, type MatchEvent, type MatchEventType, type MatchTeam } from "@moment-grid/scoring";
import { HydratedDocument } from "mongoose";

export type MatchDocument = HydratedDocument<Match>;

/// `eventType` and `team` are string unions, which Mongoose cannot infer a
/// column type from — both need an explicit `type` plus an `enum` so an
/// unknown event never reaches scoring.
@Schema({ _id: false })
export class StoredMatchEvent implements MatchEvent {
  @Prop({ type: Number, required: true })
  minute!: number;

  @Prop({ type: String, required: true, enum: MATCH_EVENT_TYPES })
  eventType!: MatchEventType;

  @Prop({ type: String, required: false, enum: ["home", "away"] })
  team?: MatchTeam;
}

export const StoredMatchEventSchema = SchemaFactory.createForClass(StoredMatchEvent);

/// The authoritative record of one match.
///
/// `startedAt` is the whole point: the replay clock is a pure function of it,
/// so persisting it here is what lets any API instance answer consistently
/// instead of each holding its own in-memory clock.
@Schema({ timestamps: true, collection: "matches" })
export class Match {
  @Prop({ required: true, unique: true, index: true })
  matchId!: string;

  @Prop({ type: String, required: true, enum: ["replay", "live"], default: "replay" })
  source!: "replay" | "live";

  @Prop({ type: Number, default: null })
  startedAt!: number | null;

  @Prop({ required: true, default: 120_000 })
  durationMs!: number;

  @Prop({ type: [StoredMatchEventSchema], default: [] })
  events!: StoredMatchEvent[];

  @Prop({ type: String, required: true, enum: ["idle", "running", "complete"], default: "idle" })
  phase!: "idle" | "running" | "complete";
}

export const MatchSchema = SchemaFactory.createForClass(Match);
