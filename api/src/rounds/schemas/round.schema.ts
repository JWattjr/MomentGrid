import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type RoundDocument = HydratedDocument<Round>;

/// Mirrors `MomentGrid.Round`. Large integers are stored as decimal strings
/// because BSON has no 256-bit integer and silently lossy doubles would be
/// worse than an explicit string.
@Schema({ timestamps: true, collection: "rounds" })
export class Round {
  @Prop({ required: true, unique: true, index: true })
  roundId!: string;

  @Prop({ type: String, required: true, enum: ["open", "locked", "settled"], default: "open" })
  state!: "open" | "locked" | "settled";

  @Prop({ required: true, default: "0" })
  entryFeeWei!: string;

  @Prop({ required: true, default: "0" })
  potWei!: string;

  @Prop({ type: [String], default: [] })
  tierPools!: string[];

  @Prop({ type: [String], default: [] })
  eventsByWindow!: string[];

  @Prop({ default: 0 })
  entrantCount!: number;

  @Prop({ default: 0 })
  winnerCount!: number;

  @Prop({ default: 0 })
  highScore!: number;

  @Prop({ type: Date, default: null })
  settledAt!: Date | null;

  @Prop({ type: String, default: null })
  matchId!: string | null;
}

export const RoundSchema = SchemaFactory.createForClass(Round);
