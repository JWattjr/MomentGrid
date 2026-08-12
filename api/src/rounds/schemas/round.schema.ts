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

  /// Base units of the entry token, not wei. USDC has six decimals, so
  /// "1000000" is one dollar. Named `Amount` rather than `Wei` because a
  /// six-decimal value in a field called wei invites an off-by-1e12 bug.
  @Prop({ required: true, default: "0" })
  entryFeeAmount!: string;

  @Prop({ required: true, default: "0" })
  potAmount!: string;

  /// The ERC20 the pot is denominated in, recorded per round so a historical
  /// round still reads correctly after a redeploy changes the token.
  @Prop({ type: String, default: null })
  entryToken!: string | null;

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
